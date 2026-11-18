import type { DriveState, World } from './types';
import { CITY } from './city';
import { DISTRICTS, MAINLAND, ISLAND, WATERS, RIVER, GALLERY, landHeight } from './geography';
import { PLACES, type MapPoint } from './places';
import { roadStyle } from './roads';
import { RoadNavigation, routeProgress, type RoadRoute } from './road-navigation';

const el = <T extends HTMLElement = HTMLElement>(id:string) => document.getElementById(id) as T;
const colors = { sea:'#17353f', land:'#496457', ink:'#10282e', paper:'#faeed6', route:'#70ecd1', race:'#ffbf75', car:'#fff0b7' };
const bridge = /Bridge|Causeway/;
const meters = (n:number) => n>=995?(n/1000).toFixed(1)+' km':Math.round(n/5)*5+' m';
type Pose = MapPoint & { heading:number; y:number };
type Place = typeof PLACES[number];
type View = { width:number; height:number; scale:number; x:number; z:number };
type Path = MapPoint[];
const xy = (v:View,p:MapPoint) => ({x:v.width/2+(p.x-v.x)*v.scale,z:v.height/2+(p.z-v.z)*v.scale});

function line(c:CanvasRenderingContext2D,v:View,points:Path,close=false) {
  c.beginPath();
  points.forEach((point,i)=>{const p=xy(v,point);if(i)c.lineTo(p.x,p.z);else c.moveTo(p.x,p.z);});
  if(close)c.closePath();
}
const fromPairs = (points:number[][]) => points.map(([x,z])=>({x,z}));
const coastlines = [fromPairs(MAINLAND),fromPairs(ISLAND)];
const river = fromPairs(RIVER.points);
const mapMiddle = { x:(CITY.minX+CITY.maxX)/2, z:(CITY.minZ+CITY.maxZ)/2 };

function canvasLayer(canvas:HTMLCanvasElement,width:number,height:number,dpr:number) {
  const w=Math.round(width*dpr),h=Math.round(height*dpr);
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  const c=canvas.getContext('2d')!;
  c.setTransform(dpr,0,0,dpr,0,0);
  return c;
}
function stroke(c:CanvasRenderingContext2D,v:View,path:Path,color:string,width:number,dash:number[]=[]){
  if(!path.length)return;
  line(c,v,path);c.lineWidth=width;c.strokeStyle=color;c.setLineDash(dash);c.stroke();c.setLineDash([]);
}

function contourLines() {
  const size=40,grid=new Map<string,number>();
  const height=(x:number,z:number)=>{
    const key=x+','+z;
    if(!grid.has(key))grid.set(key,landHeight(x,z));
    return grid.get(key)!;
  };
  const paths:Path[]=[];
  for(let x=-120;x<1360;x+=size)for(let z=-1200;z<80;z+=size){
    const corners=[{x,z},{x:x+size,z},{x:x+size,z:z+size},{x,z:z+size}];
    const heights=corners.map(p=>height(p.x,p.z));
    for(let level=12;level<=96;level+=12){
      const points:Path=[];
      corners.forEach((a,i)=>{
        const j=(i+1)%4,b=corners[j],h=heights[i],g=heights[j];
        if((h<level)===(g<level))return;
        const t=(level-h)/(g-h);
        points.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});
      });
      for(let i=1;i<points.length;i+=2)paths.push([points[i-1],points[i]]);
    }
  }
  return paths;
}

export class CountyAtlas {
  private root=el('atlas');
  private canvas=el<HTMLCanvasElement>('atlas-map');
  private base=el<HTMLCanvasElement>('atlas-base');
  private mini=el<HTMLCanvasElement>('mini-map');
  private sheet=document.createElement('canvas');
  private sheetView=this.makeView(860,1230,1,mapMiddle);
  private contours=contourLines();
  private navigation?:RoadNavigation;
  private center={...mapMiddle};
  private zoom=1;
  private drag?:{x:number;z:number;startX:number;startZ:number;id:number};
  private pose:Pose={x:-65,z:210,y:0,heading:0};
  private friend?:MapPoint;
  private drawnPose?:Pose;
  private drawnFriend?:MapPoint;
  private race:Path=[];
  private selected?:Place;
  private destination?:Place;
  private route?:RoadRoute;
  private offSince?:number;
  private arrived=false;
  private nextTick=0;
  private nextSearch=0;
  private miniEnabled=true;
  private baseDirty=true;
  private markersDirty=true;
  private frame=0;

  constructor(private world:World){
    const km=world.roads.reduce((sum,r)=>sum+r.points.reduce((s,p,i)=>s+(i?p.distanceTo(r.points[i-1]):0),0),0)/1000;
    el('atlas-summary').textContent=DISTRICTS.length+' districts · '+km.toFixed(1)+' km of roads';
    el('home-road-length').textContent=km.toFixed(1);
    this.paintBase(canvasLayer(this.sheet,860,1230,1),this.sheetView,false);
    this.fillList();
    el<HTMLInputElement>('destination-search').oninput=()=>this.fillList();
    el('set-route').onclick=()=>this.setDestination(this.selected);
    el('clear-route').onclick=()=>this.setDestination(undefined);
    el('export-map').onclick=()=>this.export();
    el('atlas-fit').onclick=()=>this.fit();
    el('atlas-center').onclick=()=>this.centerOn(this.pose,Math.max(2.7,this.zoom));
    el('atlas-zoom-in').onclick=()=>this.zoomAt(1.28);
    el('atlas-zoom-out').onclick=()=>this.zoomAt(1/1.28);
    this.canvas.addEventListener('wheel',event=>{
      event.preventDefault();
      const bounds=this.canvas.getBoundingClientRect();
      this.zoomAt(Math.exp(-event.deltaY*.0016),event.clientX-bounds.left,event.clientY-bounds.top);
    },{passive:false});
    this.canvas.addEventListener('keydown',event=>{
      const step=70/this.view().scale;
      switch(event.key){
        case 'ArrowLeft': this.center.x-=step; break;
        case 'ArrowRight': this.center.x+=step; break;
        case 'ArrowUp': this.center.z-=step; break;
        case 'ArrowDown': this.center.z+=step; break;
        case '+': case '=': this.zoomAt(1.28); break;
        case '-': case '−': this.zoomAt(1/1.28); break;
        case 'Home': this.fit(); break;
        default:return;
      }
      event.preventDefault();this.limit();this.redraw(true);
    });
    this.canvas.addEventListener('pointerdown',event=>{
      if(this.drag||event.button!==0)return;
      this.drag={x:event.clientX,z:event.clientY,startX:event.clientX,startZ:event.clientY,id:event.pointerId};
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener('pointermove',event=>{
      const drag=this.drag;if(!drag||event.pointerId!==drag.id)return;
      if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startZ)<4)return;
      const scale=this.view().scale;
      this.center.x-=(event.clientX-drag.x)/scale;this.center.z-=(event.clientY-drag.z)/scale;
      drag.x=event.clientX;drag.z=event.clientY;this.limit();this.redraw(true);
    });
    this.canvas.addEventListener('pointerup',event=>{
      const drag=this.drag;if(!drag||event.pointerId!==drag.id)return;
      this.drag=undefined;
      if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startZ)>=5)return;
      const bounds=this.canvas.getBoundingClientRect(),v=this.view();
      const nearest=PLACES.map(place=>({place,p:xy(v,place)}))
        .map(({place,p})=>({place,d:Math.hypot(p.x-event.clientX+bounds.left,p.z-event.clientY+bounds.top)}))
        .sort((a,b)=>a.d-b.d)[0];
      if(nearest?.d<17)this.select(nearest.place,false);
    });
    for(const event of ['pointercancel','lostpointercapture'])this.canvas.addEventListener(event,()=>this.drag=undefined);
    document.fonts?.ready.then(()=>this.redraw(true));
    new ResizeObserver(()=>{if(!this.root.hidden){this.limit();this.redraw(true);}}).observe(this.canvas);
  }

  open(state:DriveState) {
    this.pose={...state.position,heading:state.heading};
    this.root.hidden=false;this.fit();
  }
  close(){
    this.cancelDrag();this.root.hidden=true;
  }
  cancelDrag(){
    if(this.drag&&this.canvas.hasPointerCapture(this.drag.id))this.canvas.releasePointerCapture(this.drag.id);
    this.drag=undefined;
  }
  setMinimap(enabled:boolean){
    this.miniEnabled=enabled;el('mini-map-frame').hidden=!enabled;this.nextTick=0;
  }
  setRaceRoute(points?:number[][]){
    this.race=points?.map(([x,,z])=>({x,z}))??[];
    this.redraw();this.nextTick=0;this.offSince=undefined;
    if(!this.race.length&&this.destination&&!this.arrived)this.searchRoute();
    this.updateDestinationStatus();
  }

  updatePlayers(state:DriveState,friend:{x:number;z:number;heading:number}|undefined,now:number,driving:boolean) {
    if(now<this.nextTick)return;
    this.nextTick=now+.1;
    this.pose={x:state.position.x,y:state.position.y,z:state.position.z,heading:state.heading};this.friend=friend;
    if(driving||!this.root.hidden)this.updateRoute(now,driving);
    if(!this.root.hidden){
      const p=this.drawnPose,f=this.drawnFriend;
      const moved=!p||Math.hypot(this.pose.x-p.x,this.pose.z-p.z)>.25||Math.abs(this.pose.heading-p.heading)>.015;
      const friendMoved=Boolean(friend)!==Boolean(f)||Boolean(friend&&f&&Math.hypot(friend.x-f.x,friend.z-f.z)>.4);
      if(moved||friendMoved)this.redraw();
    }
    if(driving&&this.miniEnabled)this.drawMini();
  }

  private fillList(){
    const query=el<HTMLInputElement>('destination-search').value.trim().toLowerCase();
    const results=PLACES.filter(place=>(place.name+' '+place.district).toLowerCase().includes(query));
    const list=el('destination-list');
    list.replaceChildren(...results.map(place=>{
      const button=document.createElement('button');
      button.dataset.place=place.id;button.dataset.kind=place.kind;button.className='destination-option';
      const name=document.createElement('strong'),district=document.createElement('span');
      name.textContent=place.name;district.textContent=place.district;
      button.append(name,district);button.setAttribute('aria-pressed',String(this.selected===place));
      button.onclick=()=>this.select(place,true);
      return button;
    }));
    if(!results.length)list.textContent='No matching places.';
  }

  private select(place:Place,recenter:boolean){
    this.selected=place;
    el('destination-details').hidden=false;
    el('destination-district').textContent=place.district;
    el('destination-name').textContent=place.name;
    el('destination-description').textContent=place.description;
    el('clear-route').hidden=!this.destination;
    this.updateDestinationStatus();
    el('destination-list').querySelectorAll<HTMLButtonElement>('button').forEach(button=>{
      button.setAttribute('aria-pressed',String(button.dataset.place===place.id));
    });
    if(recenter)this.centerOn(place,Math.max(1.9,this.zoom));else this.redraw();
  }
  private setDestination(place?:Place){
    this.destination=place;this.route=undefined;this.arrived=false;this.nextSearch=0;this.offSince=undefined;
    el('clear-route').hidden=!place;
    if(place)this.searchRoute();
    this.updateRoute(0,false);this.redraw();
    this.updateDestinationStatus();
  }
  private searchRoute(){
    if(!this.destination||this.race.length)return;
    this.navigation??=new RoadNavigation(this.world);
    this.route=this.navigation.route(this.pose,this.destination.approach??this.destination);
    this.updateDestinationStatus();this.redraw();
  }
  private updateDestinationStatus(){
    const status=el('destination-status');
    status.hidden=!this.destination||this.selected!==this.destination;
    const text=this.race.length?'Guidance resumes in free roam.':this.arrived?'Arrived':this.route?'Route set · '+meters(this.route.distance):'Resume driving and return to a nearby road.';
    if(!status.hidden&&status.textContent!==text)status.textContent=text;
  }
  private updateRoute(now:number,driving:boolean){
    const panel=el('route-hud');
    panel.hidden=!this.destination||this.race.length>0;
    if(panel.hidden||!this.destination)return;
    if(driving&&!this.arrived&&!this.route&&now>=this.nextSearch){
      this.nextSearch=now+1;this.searchRoute();
    }
    const goal=this.route?.goal;
    if(goal&&driving&&Math.hypot(goal.x-this.pose.x,goal.z-this.pose.z)<=15&&Math.abs(goal.y-this.pose.y)<4){
      this.arrived=true;this.route=undefined;this.redraw();
      this.updateDestinationStatus();
      el('game-announcement').textContent='Arrived at '+this.destination.name;
    }
    const progress=this.route&&routeProgress(this.route,this.pose);
    if(driving&&progress){
      if(progress.offset>25){
        this.offSince??=now;
        if(now-this.offSince>=2){this.searchRoute();this.offSince=undefined;this.nextSearch=now+1;}
      }else this.offSince=undefined;
    }
    const distance=this.arrived?'Arrived':progress?meters(progress.distance):'Return to a nearby road';
    if(el('route-name').textContent!==this.destination.name)el('route-name').textContent=this.destination.name;
    if(el('route-distance').textContent!==distance)el('route-distance').textContent=distance;
  }

  private makeView(width:number,height:number,zoom:number,center:MapPoint):View{
    const padding=Math.min(48,width*.14,height*.14);
    const scale=Math.max(.001,Math.min((width-padding*2)/(CITY.maxX-CITY.minX),(height-padding*2)/(CITY.maxZ-CITY.minZ)))*zoom;
    return {width,height,scale,...center};
  }
  private view(){return this.makeView(this.canvas.clientWidth,this.canvas.clientHeight,this.zoom,this.center);}
  private limit(){
    const {width,height,scale}=this.view();
    const bound=(n:number,min:number,max:number,half:number)=>half*2>=max-min?(min+max)/2:Math.min(max-half,Math.max(min+half,n));
    this.center.x=bound(this.center.x,CITY.minX-120,CITY.maxX+120,width/(2*scale));
    this.center.z=bound(this.center.z,CITY.minZ-120,CITY.maxZ+120,height/(2*scale));
  }
  private zoomAt(factor:number,x?:number,z?:number){
    const before=this.view(),dx=(x??before.width/2)-before.width/2,dz=(z??before.height/2)-before.height/2;
    this.zoom=Math.max(1,Math.min(7,this.zoom*factor));
    const after=this.view();
    this.center.x+=dx/before.scale-dx/after.scale;this.center.z+=dz/before.scale-dz/after.scale;
    this.limit();this.redraw(true);
  }
  private centerOn(point:MapPoint,zoom:number){this.center={x:point.x,z:point.z};this.zoom=zoom;this.limit();this.redraw(true);}
  private fit(){this.center={...mapMiddle};this.zoom=1;this.redraw(true);}
  private redraw(base=false){
    this.baseDirty||=base;this.markersDirty=true;
    if(this.root.hidden||this.frame)return;
    this.frame=requestAnimationFrame(()=>{
      this.frame=0;if(this.root.hidden)return;
      const v=this.view(),dpr=Math.min(devicePixelRatio,1.75);
      if(this.baseDirty){this.paintBase(canvasLayer(this.base,v.width,v.height,dpr),v,true);this.baseDirty=false;}
      if(this.markersDirty){
        const c=canvasLayer(this.canvas,v.width,v.height,dpr);
        c.clearRect(0,0,v.width,v.height);this.paintMarkers(c,v,true);this.markersDirty=false;
        this.drawnPose=this.pose;this.drawnFriend=this.friend;
      }
    });
  }

  private paintBase(c:CanvasRenderingContext2D,v:View,labels:boolean){
    const {width:w,height:h,scale}=v;
    c.fillStyle=colors.sea;c.fillRect(0,0,w,h);c.lineCap=c.lineJoin='round';
    c.strokeStyle='#bcc9ad18';c.lineWidth=1;c.beginPath();
    for(let x=-200;x<1600;x+=200){const p=xy(v,{x,z:0});c.moveTo(p.x,0);c.lineTo(p.x,h);}
    for(let z=-1400;z<1400;z+=200){const p=xy(v,{x:0,z});c.moveTo(0,p.z);c.lineTo(w,p.z);}
    c.stroke();
    for(const shore of coastlines){
      line(c,v,shore,true);c.strokeStyle='#7ab7ad22';c.lineWidth=13;c.stroke();
      c.strokeStyle='#96d3bb38';c.lineWidth=5;c.stroke();c.fillStyle=colors.land;c.fill();
      c.strokeStyle='#a2b69a';c.lineWidth=1;c.stroke();
      c.save();c.clip();
      for(const district of DISTRICTS){
        const p=xy(v,district),r=260*scale,gradient=c.createRadialGradient(p.x,p.z,0,p.x,p.z,r);
        gradient.addColorStop(0,district.color+'63');gradient.addColorStop(1,district.color+'00');
        c.fillStyle=gradient;c.fillRect(p.x-r,p.z-r,r*2,r*2);
      }
      c.beginPath();
      for(const [a,b] of this.contours){const p=xy(v,a),q=xy(v,b);c.moveTo(p.x,p.z);c.lineTo(q.x,q.z);}
      c.strokeStyle='#e7d59134';c.lineWidth=.75;c.stroke();
      c.restore();
    }
    c.fillStyle='#285563';
    for(const water of WATERS){
      if(water.polygon)line(c,v,fromPairs(water.polygon),true);
      else{
        const p=xy(v,water);c.beginPath();c.rect(p.x-water.rx*scale,p.z-water.rz*scale,2*water.rx*scale,2*water.rz*scale);
      }
      c.fill();
    }
    stroke(c,v,river,'#285563',RIVER.width*scale);
    const hall=xy(v,GALLERY);
    c.fillStyle='#e5c08b';c.fillRect(hall.x-GALLERY.width*scale/2,hall.z-GALLERY.depth*scale/2,GALLERY.width*scale,GALLERY.depth*scale);
    const roads=this.world.roads.map(road=>({road,style:roadStyle(road),span:bridge.test(road.name??'')}));
    for(const {road} of roads)stroke(c,v,road.points,'#233837',Math.max(2,road.width*scale*.63+1.5));
    for(const {road,style,span} of roads){
      const color=span?'#a1e1db':style==='freeway'?'#edc58c':style==='airfield'?'#bacae2':style==='access'?'#d8b485':'#eee6c9';
      const width=Math.max(style==='freeway'?1.9:1,road.width*scale*(style==='airfield'?.64:.42));
      stroke(c,v,road.points,color,width);
      if(road.name==='Runway 07')stroke(c,v,road.points,'#404b60',Math.max(.55,scale),[3,3]);
    }
    if(!labels)return;
    const boxes:{x:number;y:number;w:number}[]=[];
    c.textAlign='center';c.textBaseline='middle';c.font='bold '+(scale>.45?12:10)+'px Barlow, sans-serif';
    for(const d of DISTRICTS){
      const p=xy(v,d),textWidth=c.measureText(d.name).width+13,y=p.z-15,x=p.x-textWidth/2;
      if(x<8||x+textWidth>w-8||y<8||y>h-15||boxes.some(b=>Math.abs(b.y-y)<17&&b.x<x+textWidth+5&&x<b.x+b.w+5))continue;
      boxes.push({x,y,w:textWidth});c.fillStyle='#183236ef';c.fillRect(x,y-7,textWidth,15);
      c.fillStyle='#fff0cc';c.fillText(d.name,p.x,y);
    }
  }

  private paintMarkers(c:CanvasRenderingContext2D,v:View,atlas:boolean){
    c.lineCap=c.lineJoin='round';
    if(this.race.length)stroke(c,v,this.race,colors.race,3,[6,4]);
    else if(this.route){
      stroke(c,v,this.route.points,colors.ink,6);stroke(c,v,this.route.points,colors.route,3.5);
    }
    for(const place of PLACES){
      if(!atlas&&place!==this.destination)continue;
      const p=xy(v,place);
      c.fillStyle=place===this.selected||place===this.destination?colors.route:place.kind==='vista'?'#ffdc9e':'#f2e7c8';
      c.strokeStyle=colors.ink;c.lineWidth=2;
      c.beginPath();
      if(place.kind==='vista'){c.moveTo(p.x,p.z-6);c.lineTo(p.x+6,p.z+4);c.lineTo(p.x-6,p.z+4);c.closePath();}
      else c.arc(p.x,p.z,place===this.selected?6:4.5,0,Math.PI*2);
      c.fill();c.stroke();
    }
    if(this.friend){
      const p=xy(v,this.friend);c.beginPath();c.arc(p.x,p.z,5,0,Math.PI*2);
      c.fillStyle='#ef8e7d';c.strokeStyle=colors.ink;c.lineWidth=2;c.fill();c.stroke();
    }
    const p=xy(v,this.pose);
    c.save();c.translate(p.x,p.z);c.rotate(-this.pose.heading);
    c.fillStyle=colors.car;c.strokeStyle=colors.ink;c.lineWidth=2;
    c.beginPath();c.moveTo(0,-9);c.lineTo(6,7);c.lineTo(0,4);c.lineTo(-6,7);c.closePath();c.stroke();c.fill();c.restore();
    if(atlas){
      c.textAlign='left';c.font='bold 12px Barlow, sans-serif';c.fillStyle=colors.paper;
      c.fillText('▲  N',16,27);
      const distance=v.scale>1?50:v.scale>.5?100:200;
      c.fillText(meters(distance),16,v.height-25);
      stroke(c,v,[{x:v.x+(16-v.width/2)/v.scale,z:v.z+(v.height/2-15)/v.scale},{x:v.x+(16-v.width/2)/v.scale+distance,z:v.z+(v.height/2-15)/v.scale}],colors.paper,2);
    }
  }
  private drawMini(){
    const width=this.mini.clientWidth,height=this.mini.clientHeight;
    if(!width||!height)return;
    const v={width,height,scale:.32,x:this.pose.x,z:this.pose.z},target=xy(v,this.sheetView);
    const c=canvasLayer(this.mini,width,height,Math.min(devicePixelRatio,1.5));
    c.fillStyle=colors.sea;c.fillRect(0,0,width,height);
    const ratio=v.scale/this.sheetView.scale,w=this.sheet.width*ratio,h=this.sheet.height*ratio;
    c.drawImage(this.sheet,target.x-w/2,target.z-h/2,w,h);
    this.paintMarkers(c,v,false);
  }
  private export(){
    const target=document.createElement('canvas'),v=this.makeView(1500,2150,1,mapMiddle);
    const c=canvasLayer(target,v.width,v.height,1);
    this.paintBase(c,v,true);this.paintMarkers(c,v,true);
    target.toBlob(blob=>{
      if(!blob)return;
      const url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download='Sunspoke-County-Map.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
    },'image/png');
  }
}
