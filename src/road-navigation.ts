import type { MapPoint } from './places';
import type { Road, World } from './types';

type Point = MapPoint & { y: number };
type Edge = { node: number; length: number };
type Segment = { a: Point; b: Point; road: Road; cuts: { t: number; node: number }[] };
type Snap = { segment: Segment; point: Point; t: number; distance: number };
export type RoadRoute = { points: Point[]; distance: number; goal: Point };
const CELL = 32;
const GAP = .7;
const length = (a: Point, b: Point) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const cross = (x:number,z:number,dx:number,dz:number) => x*dz-z*dx;
const at = ({a,b}:Segment,t:number) => ({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});

function project(s: Segment, p: MapPoint) {
  const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z;
  const t=Math.min(1,Math.max(0,((p.x-s.a.x)*dx+(p.z-s.a.z)*dz)/(dx*dx+dz*dz)));
  const point=at(s,t);
  return {segment:s,point,t,distance:Math.hypot(p.x-point.x,p.z-point.z)};
}

export class RoadNavigation {
  private nodes: Point[] = [];
  private edges: Edge[][] = [];
  private cells = new Map<string,Segment[]>();

  constructor(private world: World) {
    const endpoints: { segment: Segment; t: number }[] = [];
    for(const road of world.roads){
      const first=this.node(road.points[0]);
      let previous=first;
      const closed=length(road.points[0],road.points.at(-1)!)<.05;
      for(let i=1;i<road.points.length;i++){
        const a=road.points[i-1],b=road.points[i];
        if(Math.hypot(a.x-b.x,a.z-b.z)<.001)continue;
        const next=closed&&i===road.points.length-1?first:this.node(b);
        const segment:Segment={a,b,road,cuts:[{t:0,node:previous},{t:1,node:next}]};
        for(const other of this.near(a,Math.hypot(b.x-a.x,b.z-a.z)+.1)){
          if(other.road===road)continue;
          const dx=b.x-a.x,dz=b.z-a.z,ux=other.b.x-other.a.x,uz=other.b.z-other.a.z;
          const determinant=cross(dx,dz,ux,uz);
          if(Math.abs(determinant)<.001)continue;
          const x=other.a.x-a.x,z=other.a.z-a.z;
          const t=cross(x,z,ux,uz)/determinant,u=cross(x,z,dx,dz)/determinant;
          if(t<0||t>1||u<0||u>1)continue;
          const p=at(segment,t),q=at(other,u);
          if(Math.abs(p.y-q.y)>GAP||!this.clearTransfer(p,q))continue;
          this.connect(this.cut(segment,t),this.cut(other,u));
        }
        for(let x=Math.floor(Math.min(a.x,b.x)/CELL);x<=Math.floor(Math.max(a.x,b.x)/CELL);x++){
          for(let z=Math.floor(Math.min(a.z,b.z)/CELL);z<=Math.floor(Math.max(a.z,b.z)/CELL);z++){
            const key=x+','+z,cell=this.cells.get(key)??[];
            cell.push(segment);this.cells.set(key,cell);
          }
        }
        if(!closed&&i===1)endpoints.push({segment,t:0});
        if(!closed&&i===road.points.length-1)endpoints.push({segment,t:1});
        previous=next;
      }
    }
    for(const {segment,t} of endpoints){
      const p=at(segment,t);
      const nearest=new Map<Road,Snap>();
      for(const other of this.near(p,24)){
        if(segment.road===other.road)continue;
        const snap=project(other,p);
        if(snap.distance>other.road.width/2-1.2||Math.abs(p.y-snap.point.y)>GAP)continue;
        if(snap.distance<(nearest.get(other.road)?.distance??Infinity))nearest.set(other.road,snap);
      }
      // The endpoint must sit inside the receiving road's pavement, with room for the car.
      for(const snap of nearest.values()){
        if(this.clearTransfer(p,snap.point))this.connect(this.cut(segment,t),this.cut(snap.segment,snap.t));
      }
    }
    for(const segment of new Set([...this.cells.values()].flat())){
      segment.cuts.sort((a,b)=>a.t-b.t);
      for(let i=1;i<segment.cuts.length;i++)this.connect(segment.cuts[i-1].node,segment.cuts[i].node);
    }
  }

  private near(p: MapPoint, radius: number) {
    const segments=new Set<Segment>();
    for(let x=Math.floor((p.x-radius)/CELL);x<=Math.floor((p.x+radius)/CELL);x++){
      for(let z=Math.floor((p.z-radius)/CELL);z<=Math.floor((p.z+radius)/CELL);z++){
        for(const segment of this.cells.get(x+','+z)??[])segments.add(segment);
      }
    }
    return segments;
  }

  private clearTransfer(a: Point, b: Point) {
    const ground=this.world.surfaceHeight??this.world.groundHeight;
    for(const t of [0,.25,.5,.75,1]){
      const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t,z=a.z+(b.z-a.z)*t;
      if(Math.abs(ground(x,z)-y)>1)return false;
      for(const box of this.world.colliders){
        const dx=x-box.x,dz=z-box.z,radius=Math.hypot(box.halfX,box.halfZ)+1.6;
        if(Math.abs(dx)>radius||Math.abs(dz)>radius)continue;
        const angle=box.rotation??0;
        if(Math.abs(dx*Math.cos(angle)-dz*Math.sin(angle))<box.halfX+1.12&&
           Math.abs(dx*Math.sin(angle)+dz*Math.cos(angle))<box.halfZ+1.12){
          const base=box.baseY??ground(box.x,box.z);
          if(y+1.7>=base&&y<=base+box.height)return false;
        }
      }
    }
    return true;
  }

  private node(point: Point) {
    this.edges.push([]);
    return this.nodes.push(point)-1;
  }

  private cut(segment: Segment, t: number) {
    const cut=segment.cuts.find(c=>Math.abs(c.t-t)<.001);
    if(cut)return cut.node;
    const node=this.node(at(segment,t));
    segment.cuts.push({t,node});
    return node;
  }

  private connect(a:number,b:number) {
    if(a===b)return;
    const distance=Math.max(.01,length(this.nodes[a],this.nodes[b]));
    this.edges[a].push({node:b,length:distance});
    this.edges[b].push({node:a,length:distance});
  }

  private snap(point: MapPoint & { y?: number }, radius: number) {
    let best: Snap | undefined;
    for(const segment of this.near(point,radius)){
      const candidate=project(segment,point);
      if(candidate.distance>radius||point.y!==undefined&&Math.abs(candidate.point.y-point.y)>4)continue;
      if(!best||candidate.distance<best.distance)best=candidate;
    }
    return best;
  }

  route(start: Point, destination: MapPoint): RoadRoute | undefined {
    const from=this.snap(start,55),to=this.snap(destination,14);
    if(!from||!to)return;
    const neighbors=({segment,t,point}:Snap) => {
      const right=segment.cuts.findIndex(c=>c.t>=t);
      const cuts=segment.cuts.slice(Math.max(0,right-1),right+1);
      return cuts.map(({node})=>({node,length:length(point,this.nodes[node])}));
    };
    const best=new Float64Array(this.nodes.length).fill(Infinity);
    const previous=new Int32Array(this.nodes.length).fill(-1);
    const pending: {node:number;score:number}[]=[];
    const heuristic=(node:number)=>length(this.nodes[node],to.point);
    const push=(node:number)=>{
      const item={node,score:best[node]+heuristic(node)};
      let i=pending.length;
      pending.push(item);
      while(i>0&&pending[(i-1)>>1].score>item.score){pending[i]=pending[(i-1)>>1];i=(i-1)>>1;}
      pending[i]=item;
    };
    for(const edge of neighbors(from)){best[edge.node]=edge.length;push(edge.node);}
    const goals=new Map(neighbors(to).map(edge=>[edge.node,edge.length]));
    let winner=-1,distance=from.segment===to.segment?length(from.point,to.point):Infinity;
    while(pending.length){
      const head=pending[0],last=pending.pop()!;
      if(head.score>=distance)break;
      if(pending.length){
        let i=0;
        while(i*2+1<pending.length){
          let child=i*2+1;
          if(pending[child+1]?.score<pending[child].score)child++;
          if(pending[child].score>=last.score)break;
          pending[i]=pending[child];i=child;
        }
        pending[i]=last;
      }
      if(head.score>best[head.node]+heuristic(head.node))continue;
      const goal=goals.get(head.node);
      if(goal!==undefined&&best[head.node]+goal<distance){winner=head.node;distance=best[head.node]+goal;}
      for(const edge of this.edges[head.node]){
        const score=best[head.node]+edge.length;
        if(score>=best[edge.node])continue;
        best[edge.node]=score;previous[edge.node]=head.node;push(edge.node);
      }
    }
    if(!Number.isFinite(distance))return;
    const points=[to.point];
    for(let node=winner;node!==-1;node=previous[node])points.push(this.nodes[node]);
    points.push(from.point);
    return {points:points.reverse(),distance,goal:to.point};
  }
}

export function routeProgress(route:RoadRoute,position:Point) {
  let remaining=0,best=Infinity,at=0;
  for(let i=route.points.length-1;i>0;i--){
    const a=route.points[i-1],b=route.points[i],dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.min(1,Math.max(0,((position.x-a.x)*dx+(position.z-a.z)*dz)/(dx*dx+dz*dz||1)));
    const distance=Math.hypot(position.x-a.x-t*dx,position.z-a.z-t*dz,position.y-a.y-t*(b.y-a.y));
    const span=length(a,b);
    if(distance<best){best=distance;at=remaining+(1-t)*span;}
    remaining+=span;
  }
  return {distance:at,offset:best};
}
