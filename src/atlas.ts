import type { DriveState, World } from './types';
import { CITY } from './city';
import { DISTRICTS, MAINLAND, ISLAND, WATERS, RIVER, GALLERY } from './geography';

export class CountyAtlas {
  private root=document.getElementById('atlas')!;
  private canvas=document.getElementById('atlas-map') as HTMLCanvasElement;
  private ctx=this.canvas.getContext('2d')!;
  private friend?:{x:number;z:number;heading:number};
  private raceRoute?:number[][];
  updatePlayers(state:DriveState,friend?:{x:number;z:number;heading:number}){this.pose={x:state.position.x,z:state.position.z,heading:state.heading};this.friend=friend;if(!this.root.hidden)this.draw();}
  setRaceRoute(points?:number[][]){this.raceRoute=points;}
  private zoom=1;
  private panX=0;
  private panY=0;
  private drag:{x:number;y:number}|undefined;
  private pose:{x:number;z:number;heading:number}={x:-65,z:210,heading:0};
  constructor(private world:World){
    const km=world.roads.reduce((sum,r)=>sum+r.points.reduce((s,p,i)=>s+(i?p.distanceTo(r.points[i-1]):0),0),0)/1000;
    document.getElementById('atlas-summary')!.textContent=`${DISTRICTS.length} districts · ${km.toFixed(1)} km of roads · every road is open`;
    this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom=Math.max(1,Math.min(5,this.zoom*Math.exp(-e.deltaY*.0015)));if(this.zoom===1)this.panX=this.panY=0;this.draw();},{passive:false});
    this.canvas.addEventListener('pointerdown',e=>{this.drag={x:e.clientX,y:e.clientY};this.canvas.setPointerCapture(e.pointerId);});
    this.canvas.addEventListener('pointermove',e=>{if(!this.drag)return;this.panX+=e.clientX-this.drag.x;this.panY+=e.clientY-this.drag.y;this.drag={x:e.clientX,y:e.clientY};this.draw();});
    this.canvas.addEventListener('pointerup',()=>this.drag=undefined);
    this.canvas.addEventListener('pointercancel',()=>this.drag=undefined);
    window.addEventListener('resize',()=>{if(!this.root.hidden)this.draw();});
    document.getElementById('export-map')!.onclick=()=>this.export();
  }
  open(state:DriveState){this.pose={x:state.position.x,z:state.position.z,heading:state.heading};this.root.hidden=false;this.zoom=1;this.panX=this.panY=0;this.draw();document.getElementById('close-map')!.focus();}
  close(){this.root.hidden=true;this.drag=undefined;}
  private export(){
    const target=document.createElement('canvas'),old=[this.zoom,this.panX,this.panY];this.zoom=1;this.panX=this.panY=0;this.draw(target,1600,2200);[this.zoom,this.panX,this.panY]=old;
    target.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Sunspoke-County-Map.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);});this.draw();
  }
  private draw(target=this.canvas,w=this.canvas.clientWidth,h=this.canvas.clientHeight){
    const dpr=target===this.canvas?Math.min(devicePixelRatio,1.5):1;
    target.width=Math.round(w*dpr);target.height=Math.round(h*dpr);
    const c=target.getContext('2d')!;c.setTransform(dpr,0,0,dpr,0,0);c.fillStyle='#173a48';c.fillRect(0,0,w,h);
    const scale=Math.min((w-100)/(CITY.maxX-CITY.minX),(h-65)/(CITY.maxZ-CITY.minZ))*this.zoom;
    const ox=w/2-(CITY.maxX+CITY.minX)/2*scale+this.panX,oz=h/2-(CITY.maxZ+CITY.minZ)/2*scale+this.panY;
    const point=(x:number,z:number)=>[ox+x*scale,oz+z*scale];
    c.strokeStyle='#ffffff09';c.lineWidth=1;
    for(let x=-200;x<=1400;x+=200){const p=point(x,0);c.beginPath();c.moveTo(p[0],0);c.lineTo(p[0],h);c.stroke();}
    for(let z=-1200;z<=1000;z+=200){const p=point(0,z);c.beginPath();c.moveTo(0,p[1]);c.lineTo(w,p[1]);c.stroke();}
    const polygon=(p:number[][])=>{c.beginPath();p.forEach(([x,z],i)=>{const a=point(x,z);i?c.lineTo(a[0],a[1]):c.moveTo(a[0],a[1]);});c.closePath();};
    for(const p of [MAINLAND,ISLAND]){polygon(p);c.fillStyle='#8b9c89';c.fill();c.strokeStyle='#d9d8bc';c.lineWidth=3;c.stroke();}
    c.save();c.beginPath();for(const p of [MAINLAND,ISLAND]){p.forEach(([x,z],i)=>{const a=point(x,z);i?c.lineTo(a[0],a[1]):c.moveTo(a[0],a[1]);});c.closePath();}c.clip();
    for(const district of DISTRICTS){const p=point(district.x,district.z);c.fillStyle=district.color+'75';c.beginPath();c.ellipse(p[0],p[1],160*scale,200*scale,0,0,Math.PI*2);c.fill();}
    c.restore();
    for(const water of WATERS){const p=point(water.x,water.z);c.fillStyle='#315a6a';c.beginPath();if(water.polygon)polygon(water.polygon);else if(water.shape==='ellipse')c.ellipse(p[0],p[1],water.rx*scale,water.rz*scale,0,0,Math.PI*2);else c.rect(p[0]-water.rx*scale,p[1]-water.rz*scale,water.rx*2*scale,water.rz*2*scale);c.fill();}
    c.beginPath();RIVER.points.forEach(([x,z],i)=>{const p=point(x,z);i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]);});c.strokeStyle='#315a6a';c.lineWidth=RIVER.width*scale;c.lineCap=c.lineJoin='round';c.stroke();
    for(const road of this.world.roads){
      c.beginPath();road.points.forEach((p,i)=>{const a=point(p.x,p.z);i?c.lineTo(a[0],a[1]):c.moveTo(a[0],a[1]);});
      c.lineCap=c.lineJoin='round';c.strokeStyle='#3a484b';c.lineWidth=Math.max(3,road.width*scale+2);c.stroke();
      c.strokeStyle=road.width>25?'#edd5a0':'#ecede4';c.lineWidth=Math.max(1.2,road.width*scale*.52);c.stroke();
    }
    c.textAlign='center';c.textBaseline='middle';
    for(const d of DISTRICTS){const p=point(d.x,d.z);c.font=`600 ${this.zoom>1.5||target!==this.canvas?13:10}px Barlow,Arial`;const tw=c.measureText(d.name).width;c.fillStyle='#20333bd9';c.fillRect(p[0]-tw/2-6,p[1]-10,tw+12,20);c.fillStyle='#f3efda';c.fillText(d.name,p[0],p[1]);}
    const hall=point(GALLERY.x,GALLERY.z);c.fillStyle='#f8dc9a';c.fillRect(hall[0]-GALLERY.width*scale/2,hall[1]-GALLERY.depth*scale/2,GALLERY.width*scale,GALLERY.depth*scale);c.fillStyle='#213842';c.font='600 10px Barlow,Arial';c.fillText('GRAND GALLERY',hall[0],hall[1]);
    const bridge=point(725,-737);c.fillStyle='#f4e5b7';c.font='10px Barlow,Arial';c.fillText('VERDE BRIDGE',bridge[0],bridge[1]-12);
    const stunt=point(-101,0);c.fillStyle='#f6b861';c.beginPath();c.arc(stunt[0],stunt[1],4,0,Math.PI*2);c.fill();
    c.font='10px Barlow,Arial';c.textAlign='right';c.fillText('RAMP TIME',stunt[0]-9,stunt[1]);
    const p=point(this.pose.x,this.pose.z);c.save();c.translate(p[0],p[1]);c.rotate(-this.pose.heading);c.beginPath();c.moveTo(0,-10);c.lineTo(6,7);c.lineTo(0,4);c.lineTo(-6,7);c.closePath();c.fillStyle='#ffcf71';c.shadowColor='#10222c';c.shadowBlur=7;c.fill();c.restore();
    if(this.raceRoute){c.beginPath();this.raceRoute.forEach(([x,y,z],i)=>{const p=point(x,z);i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]);});c.strokeStyle='#edb977';c.lineWidth=3;c.stroke();}
    if(this.friend){const p=point(this.friend.x,this.friend.z);c.fillStyle='#ed8d72';c.beginPath();c.arc(p[0],p[1],6,0,Math.PI*2);c.fill();c.font='12px Barlow,Arial';c.textAlign='left';c.fillText('Friend',p[0]+10,p[1]);}
    c.fillStyle='#f1e4bd';c.textAlign='left';c.font='600 12px Barlow,Arial';c.fillText('N ↑',22,25);
    c.strokeStyle='#e4d6b6';c.lineWidth=2;c.beginPath();c.moveTo(22,h-23);c.lineTo(22+200*scale,h-23);c.stroke();c.font='10px Barlow,Arial';c.fillText('200 m',22,h-36);
  }
}
