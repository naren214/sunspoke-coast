import * as T from 'three';
import type { Road } from './types';
import type { createRoadIndex } from './road-grading';
import { insideGallery, isLand } from './geography';
import { insideStunt } from './stunt';

export type RoadStyle='city'|'country'|'freeway'|'airfield'|'interior'|'access';
export function roadStyle(road:Road):RoadStyle{
  if(road.name==='Grand Gallery Drive')return 'interior';
  if(road.name==='Runway 07'||road.name==='Airfield Taxiway'||road.name==='East Runway Exit')return 'airfield';
  if(road.name==='Crosstown Freeway')return 'freeway';
  if(road.width<10)return 'access';
  if(['Sierra Coast Highway','Verde Skyline Bridge','Gallery Sierra Approach','Verde North Approach','Verde South Approach','Verde Bridge Approach','Isla Verde Causeway'].includes(road.name??''))return 'country';
  return 'city';
}
type Junction={x:number;z:number;roads:Set<number>};
export function findRoadJunctions(roads:Road[]){
  type Segment={road:number;ax:number;az:number;ay:number;dx:number;dz:number;dy:number};
  const cells=new Map<string,Segment[]>(),junctions:Junction[]=[];
  roads.forEach((road,id)=>{for(let i=1;i<road.points.length;i++){
    const a=road.points[i-1],b=road.points[i],s={road:id,ax:a.x,az:a.z,ay:a.y,dx:b.x-a.x,dz:b.z-a.z,dy:b.y-a.y};
    const seen=new Set<Segment>();
    for(let cx=Math.floor(Math.min(a.x,b.x)/24);cx<=Math.floor(Math.max(a.x,b.x)/24);cx++)for(let cz=Math.floor(Math.min(a.z,b.z)/24);cz<=Math.floor(Math.max(a.z,b.z)/24);cz++){
      const key=cx+','+cz,list=cells.get(key)??[];
      for(const other of list){
        if(other.road===id||seen.has(other))continue;seen.add(other);
        const cross=s.dx*other.dz-s.dz*other.dx;
        // Fillets and road continuations share pavement without forming crosswalk junctions.
        if(Math.abs(cross)<=.42*Math.hypot(s.dx,s.dz)*Math.hypot(other.dx,other.dz))continue;
        const ox=other.ax-s.ax,oz=other.az-s.az,t=(ox*other.dz-oz*other.dx)/cross,u=(ox*s.dz-oz*s.dx)/cross;
        if(t<-.001||t>1.001||u<-.001||u>1.001||Math.abs(s.ay+t*s.dy-other.ay-u*other.dy)>1)continue;
        const x=s.ax+t*s.dx,z=s.az+t*s.dz;
        let node=junctions.find(j=>Math.hypot(j.x-x,j.z-z)<5);
        if(!node){node={x,z,roads:new Set<number>()};junctions.push(node);}
        node.roads.add(id);node.roads.add(other.road);
      }
      list.push(s);cells.set(key,list);
    }
  }});
  return junctions;
}

function asphaltMaterial(){
  let seed=732931;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const ctx=canvas.getContext('2d')!,pixels=ctx.createImageData(512,512);
  for(let y=0;y<512;y++)for(let x=0;x<512;x++){
    const i=(y*512+x)*4,f=random(),aggregate=(f-.5)*20+(f>.96?20:0),wear=Math.sin(x*.037+Math.sin(y*.021))*.9;
    pixels.data[i]=47+aggregate+wear;pixels.data[i+1]=54+aggregate+wear;pixels.data[i+2]=58+aggregate+wear;pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.setScalar(.16);texture.anisotropy=8;
  const bump=texture.clone();bump.colorSpace=T.NoColorSpace;bump.needsUpdate=true;
  return new T.MeshStandardMaterial({map:texture,bumpMap:bump,bumpScale:.009,roughness:.93,color:'#eff3f5'});
}

class SurfaceWriter{
  private positions:number[]=[];private uvs:number[]=[];private indices:number[]=[];
  constructor(private height:(x:number,z:number)=>number){}
  quad(points:number[][],lift:number){
    const n=this.positions.length/3;
    for(const [x,z] of points){this.positions.push(x,this.height(x,z)+lift,z);this.uvs.push(x,z);}
    this.indices.push(n,n+2,n+1,n+1,n+2,n+3);
  }
  polygon(points:number[][],lift:number){
    const shape=new T.Shape();points.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));
    const geometry=new T.ShapeGeometry(shape),p=geometry.getAttribute('position'),index=geometry.getIndex()!,n=this.positions.length/3;
    for(let i=0;i<p.count;i++){const x=p.getX(i),z=-p.getY(i);this.positions.push(x,this.height(x,z)+lift,z);this.uvs.push(x,z);}
    for(let i=0;i<index.count;i++)this.indices.push(n+index.getX(i));geometry.dispose();
  }
  edge(ax:number,az:number,bx:number,bz:number,low:number,high:number){
    const n=this.positions.length/3,ay=this.height(ax,az),by=this.height(bx,bz);
    this.positions.push(ax,ay+low,az,ax,ay+high,az,bx,by+low,bz,bx,by+high,bz);
    this.uvs.push(ax,az,ax,az,bx,bz,bx,bz);this.indices.push(n,n+2,n+1,n+1,n+2,n+3);
  }
  mesh(material:T.Material,name:string){
    if(!this.indices.length)return undefined;
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(this.positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(this.uvs,2));g.setIndex(this.indices);g.computeVertexNormals();
    const mesh=new T.Mesh(g,material);mesh.name=name;mesh.receiveShadow=true;return mesh;
  }
}

export function renderRoadNetwork(group:T.Group,roads:Road[],index:ReturnType<typeof createRoadIndex>){
  const city=asphaltMaterial(),country=city.clone(),freeway=city.clone(),airfield=city.clone();
  country.color.set('#cbd1cf');freeway.color.set('#c6d1d8');airfield.color.set('#e0e1d8');
  const concrete=new T.MeshStandardMaterial({color:'#bbbfb8',roughness:.92}),curb=concrete.clone();curb.color.set('#dddccd');curb.side=T.DoubleSide;
  const gravel=new T.MeshStandardMaterial({color:'#8d9a88',roughness:1}),gutter=new T.MeshStandardMaterial({color:'#39464b',roughness:.95});
  const white=new T.MeshStandardMaterial({color:'#f3f2df',roughness:.82,emissive:'#d6e3da',emissiveIntensity:.035});
  const yellow=new T.MeshStandardMaterial({color:'#eec36b',roughness:.85,emissive:'#ddb45e',emissiveIntensity:.035});
  const reflectorWhite=new T.MeshStandardMaterial({color:'#e8f0d1',emissive:'#d5efd4',emissiveIntensity:.48,roughness:.6});
  const height=(x:number,z:number)=>index.nearest(x,z).height;
  const markingsWhite=new SurfaceWriter(height),markingsYellow=new SurfaceWriter(height),cats=new SurfaceWriter(height);
  const stats={roads:roads.length,junctions:0,crosswalks:0,arrows:0,curbSegments:0,reflectors:0,shoulderSegments:0,airfieldMarkings:0,styles:{city:0,country:0,freeway:0,airfield:0,interior:0,access:0}};
  const normals=new WeakMap<T.Vector3,[number,number]>();
  for(const road of roads){const p=road.points,closed=p[0].distanceTo(p.at(-1)!)<.1;for(let i=0;i<p.length;i++){
    const before=p[i===0&&closed?p.length-2:Math.max(0,i-1)],after=p[i===p.length-1&&closed?1:Math.min(p.length-1,i+1)],dx=after.x-before.x,dz=after.z-before.z,len=Math.hypot(dx,dz)||1;
    normals.set(p[i],[dz/len,-dx/len]);
  }}
  function attach(writer:SurfaceWriter,material:T.Material,name:string){const mesh=writer.mesh(material,name);if(mesh)group.add(mesh);}
  function roadQuad(writer:SurfaceWriter,a:T.Vector3,b:T.Vector3,left:number,right:number,lift:number,t0=0,t1=1){
    if(left>right)[left,right]=[right,left];
    const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1,nx=dz/len,nz=-dx/len;
    const na=normals.get(a)??[nx,nz],nb=normals.get(b)??[nx,nz];
    const edgeNormal=(t:number)=>{const x=T.MathUtils.lerp(na[0],nb[0],t),z=T.MathUtils.lerp(na[1],nb[1],t),l=Math.hypot(x,z)||1;return [x/l,z/l];};
    const [n0x,n0z]=edgeNormal(t0),[n1x,n1z]=edgeNormal(t1);
    const x0=T.MathUtils.lerp(a.x,b.x,t0),z0=T.MathUtils.lerp(a.z,b.z,t0),x1=T.MathUtils.lerp(a.x,b.x,t1),z1=T.MathUtils.lerp(a.z,b.z,t1);
    writer.quad([[x0+n0x*left,z0+n0z*left],[x0+n0x*right,z0+n0z*right],[x1+n1x*left,z1+n1z*left],[x1+n1x*right,z1+n1z*right]],lift);
  }
  function stamp(writer:SurfaceWriter,x:number,z:number,dx:number,dz:number,across:number,along:number,lift=.091){
    const nx=dz,nz=-dx;
    writer.quad([[-1,-1],[1,-1],[-1,1],[1,1]].map(([s,t])=>[x+nx*s*across/2+dx*t*along/2,z+nz*s*across/2+dz*t*along/2]),lift);
  }
  roads.forEach((road,id)=>{
    const type=roadStyle(road),material=type==='freeway'?freeway:type==='country'?country:type==='airfield'?airfield:city;
    stats.styles[type]++;
    const asphalt=new SurfaceWriter(height),shoulders=new SurfaceWriter(height),curbs=new SurfaceWriter(height),drains=new SurfaceWriter(height);
    let distance=0,nextArrow=65,nextReflector=12;
    for(let i=1;i<road.points.length;i++){
      const a=road.points[i-1],b=road.points[i],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<.001)continue;
      const x=(a.x+b.x)/2,z=(a.z+b.z)/2,nx=dz/len,nz=-dx/len,fx=dx/len,fz=dz/len;
      const half=road.width/2;
      const na=normals.get(a)!,nb=normals.get(b)!;
      const nonlinear=[-half,-half/2,0,half/2,half].some(offset=>{
        const ax=a.x+na[0]*offset,az=a.z+na[1]*offset,bx=b.x+nb[0]*offset,bz=b.z+nb[1]*offset;
        return Math.abs(height((ax+bx)/2,(az+bz)/2)-(height(ax,az)+height(bx,bz))/2)>.024;
      });
      for(let j=0;j<8;j++){
        const left=-half+road.width*j/8,right=-half+road.width*(j+1)/8;
        if(nonlinear){
          roadQuad(asphalt,a,b,left,right,.06,0,.5);
          roadQuad(asphalt,a,b,left,right,.06,.5,1);
        }else roadQuad(asphalt,a,b,left,right,.06);
      }
      if(insideGallery(x,z)||insideStunt(x,z,2)){distance+=len;continue;}
      const style=type==='interior'?'country':type;
      for(const side of [-1,1]){
        const margin=style==='city'?2.35:1.55,xx=x+nx*side*(half+margin/2),zz=z+nz*side*(half+margin/2);
        if(index.occupiedByOther(xx,zz,id,2.3)||!isLand(xx,zz))continue;
        const edge=side*half,outer=side*(half+margin);
        roadQuad(shoulders,a,b,Math.min(edge,outer),Math.max(edge,outer),style==='city'?.135:.026);stats.shoulderSegments++;
        if(style==='city'){
          roadQuad(curbs,a,b,side*(half+.07),side*(half+.31),.185);stats.curbSegments++;
          const na=normals.get(a)!,nb=normals.get(b)!;
          for(const offset of [side*(half+.07),side*(half+.31)])curbs.edge(a.x+na[0]*offset,a.z+na[1]*offset,b.x+nb[0]*offset,b.z+nb[1]*offset,.035,.185);
          roadQuad(drains,a,b,side*(half-.31),side*(half-.07),.069);
        }
      }
      const join=index.occupiedByOther(x,z,id,3);
      function dash(offset:number,writer:SurfaceWriter,width=.13,period=12,on=4){
        let cursor=0;
        while(cursor<len-1e-6){const phase=(distance+cursor)%period,span=Math.min(len-cursor,phase<on?on-phase:period-phase);if(phase<on)roadQuad(writer,a,b,offset-width/2,offset+width/2,.09,cursor/len,(cursor+span)/len);cursor+=Math.max(.0001,span);}
      }
      if(style!=='airfield'&&!join){
        for(const side of [-1,1])roadQuad(markingsWhite,a,b,side*(half-.56)-.075,side*(half-.56)+.075,.087);
        const double=style==='country'||style==='freeway'||road.width>=18;
        if(double)for(const side of [-1,1])roadQuad(markingsYellow,a,b,side*.19-.065,side*.19+.065,.089);
        if(!double)dash(0,markingsYellow);
        if(style==='freeway'||road.width>=20)for(const side of [-1,1])dash(side*road.width/4,markingsWhite);
      }
      if(style==='airfield'&&!join){
        for(const side of [-1,1])roadQuad(markingsWhite,a,b,side*(half-.7)-.12,side*(half-.7)+.12,.087);
        if(road.name==='Runway 07')dash(0,markingsWhite,.28,20,8);else roadQuad(markingsYellow,a,b,-.09,.09,.09);
        if(road.name==='Runway 07'&&(distance>12&&distance<24||distance>296&&distance<308)){
          for(let side=-13;side<=13;side+=2.6)roadQuad(markingsWhite,a,b,side-.5,side+.5,.093);
        }
        stats.airfieldMarkings++;
      }
      if(distance+len>=nextArrow){
        nextArrow+=120;
        if(style!=='airfield'&&!join&&!index.occupiedByOther(x+fx*18,z+fz*18,id,4)&&!index.occupiedByOther(x-fx*18,z-fz*18,id,4)){
          for(const side of [-1,1]){
            const xx=x-fz*side*road.width*.25,zz=z+fx*side*road.width*.25,ux=-fz*side,uz=fx*side,vx=fx*side,vz=fz*side;
            const shape=[[-.2,-1.9],[.2,-1.9],[.2,.7],[.85,.7],[0,2.2],[-.85,.7],[-.2,.7]];
            markingsWhite.polygon(shape.map(([s,t])=>[xx+ux*s+vx*t,zz+uz*s+vz*t]),.093);stats.arrows++;
          }
        }
      }
      if(distance+len>=nextReflector){
        nextReflector+=style==='city'?28:18;
        if(!join)for(const side of [-1,1]){stamp(cats,x+nx*side*(half-.32),z+nz*side*(half-.32),fx,fz,.14,.25,.092);stats.reflectors++;}
      }
      distance+=len;
    }
    attach(asphalt,material,'Road asphalt');attach(shoulders,type==='city'?concrete:gravel,'Road underlay');attach(curbs,curb,'Raised road curbs');attach(drains,gutter,'Road drainage channels');
  });
  const junctions=findRoadJunctions(roads);stats.junctions=junctions.length;
  for(const junction of junctions){
    const ids=[...junction.roads];if(ids.some(id=>/Approach|Link|Access|Interchange|Gallery/.test(roads[id].name??'')))continue;if(ids.some(id=>roadStyle(roads[id])!=='city')||insideGallery(junction.x,junction.z,10)||insideStunt(junction.x,junction.z,10))continue;
    for(const id of ids){
      const road=roads[id];let best=1,bestDistance=Infinity;
      for(let i=1;i<road.points.length;i++){const p=road.points[i],d=Math.hypot(p.x-junction.x,p.z-junction.z);if(d<bestDistance){bestDistance=d;best=i;}}
      const a=road.points[best-1],b=road.points[Math.min(best+1,road.points.length-1)],len=Math.hypot(b.x-a.x,b.z-a.z)||1,dx=(b.x-a.x)/len,dz=(b.z-a.z)/len;
      const crossingWidth=Math.max(...ids.filter(i=>i!==id).map(i=>roads[i].width))/2;
      for(const direction of [-1,1]){
        const x=junction.x+dx*direction*(crossingWidth+3),z=junction.z+dz*direction*(crossingWidth+3);
        const nearest=index.nearest(x,z);if(nearest.distance>road.width/2||Math.min(Math.hypot(x-road.points[0].x,z-road.points[0].z),Math.hypot(x-road.points.at(-1)!.x,z-road.points.at(-1)!.z))<3)continue;
        for(let offset=-road.width/2+1.5;offset<road.width/2-1;offset+=1.1)stamp(markingsWhite,x-dz*offset,z+dx*offset,dx,dz,.52,3.3,.096);
        // Each inbound lane receives a stop line outside the pedestrian crossing.
        const stopX=x+dx*direction*3.1-dz*direction*road.width/4,stopZ=z+dz*direction*3.1+dx*direction*road.width/4;
        stamp(markingsWhite,stopX,stopZ,dx,dz,road.width*.42,.3,.097);stats.crosswalks++;
      }
    }
  }
  attach(markingsWhite,white,'Road lane paint and crossings');attach(markingsYellow,yellow,'Road centre paint');attach(cats,reflectorWhite,'Road reflective studs');
  group.userData.roadImprovements=stats;
  return stats;
}
