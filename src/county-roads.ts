import { MathUtils } from 'three';
import { GALLERY, landHeight } from './geography';
import { SCENIC_STOPS } from './places';

export interface CountyRoute {name:string;points:number[][];width:number;curve?:boolean;closed?:boolean;elevation?:(x:number,z:number)=>number;}

const ease = MathUtils.smoothstep;
const ridgeHeight = 48.5;
const northJunctionHeight = 22.5;
const bridgeJunctionHeight = 30;
const islandJunctionHeight = 44.5;
const islandRoadHeight = 14;
const lakeLandingHeight = 17.5;
const galleryLakeJunctionHeight = 13;
const galleryFloor = GALLERY.floor+.08;

// Linear grade through the middle, with zero slope at both ends.
export function easedRise(value:number,start:number,end:number,lead:number){
  const length=end-start,distance=MathUtils.clamp(value-start,0,length);
  if(distance<lead)return distance**2/(2*lead*(length-lead));
  if(distance>length-lead)return 1-(length-distance)**2/(2*lead*(length-lead));
  return (distance-lead/2)/(length-lead);
}

function sierraHighwayElevation(x:number,z:number){
  if(z>=-450)return landHeight(x,z);
  if(x<0)return MathUtils.lerp(landHeight(x,z),6,ease(x,-30,0));
  if(x<550){
    // Level landings give turning vehicles the same grade across both roads.
    return 6 + (northJunctionHeight-6)*easedRise(x,0,177,32)
      + (islandJunctionHeight-northJunctionHeight)*easedRise(x,239,450,32)
      + (ridgeHeight-islandJunctionHeight)*easedRise(x,510,550,12);
  }
  return ridgeHeight-(ridgeHeight-bridgeJunctionHeight)*easedRise(z,-934,-782,30)
    -(bridgeJunctionHeight-10)*easedRise(z,-737,-581,30)+(landHeight(x,z)-10)*ease(z,-530,-450);
}

function silverLakeElevation(x:number,z:number){
  const riverLanding = easedRise(-z,605,681,18)*(1-easedRise(-z,723,795,19));
  const eastBank = 1.5*ease(x,1090,1180)*ease(-z,530,615);
  const galleryLanding = (galleryLakeJunctionHeight-10)*ease(x,855,915)*(1-ease(x,950,1010))*ease(-z,788,816);
  const lakeside = 10+(lakeLandingHeight-10)*riverLanding*(1-ease(x,794,850))+eastBank+galleryLanding;
  return MathUtils.lerp(landHeight(x,z),lakeside,ease(-z,440,540));
}

// Keep both portals and the road junctions level before starting the ramps.
function galleryLakeElevation(_x:number,z:number){
  return MathUtils.lerp(galleryLakeJunctionHeight,galleryFloor,easedRise(-z,835,909,10));
}

function gallerySierraElevation(x:number,z:number){
  const crossingHeight=35.5;
  return crossingHeight+(ridgeHeight-crossingHeight)*easedRise(z,-1080,-981,14)*(1-ease(x,635,675))
    -(crossingHeight-27)*ease(x,790,908);
}

const verdeSouthElevation=(x:number)=>28-18*easedRise(x,573,693,20);
const galleryExitElevation=(z:number)=>galleryFloor+(27-galleryFloor)*ease(-z,1059,1088);
const islandCausewayElevation=(_x:number,z:number)=>MathUtils.lerp(
  islandJunctionHeight,islandRoadHeight,easedRise(-z,1087,1336,20)
);
const northTurn=Array.from({length:13},(_,i)=>{
  const angle=Math.PI-i*Math.PI/24;
  return [238+28*Math.cos(angle),-998+28*Math.sin(angle)];
});
const galleryExit=Array.from({length:13},(_,i)=>{
  const angle=i*Math.PI/24;
  const z=-1088-22*Math.sin(angle);
  return [908+22*Math.cos(angle),z];
});

function rounded(x0:number,x1:number,z0:number,z1:number,r:number){
  const p:number[][]=[];
  for(const [cx,cz,start] of [[x0+r,z0+r,Math.PI],[x1-r,z0+r,Math.PI*1.5],[x1-r,z1-r,0],[x0+r,z1-r,Math.PI/2]])
    for(let i=0;i<=10;i++){const a=start+i*Math.PI/20;p.push([cx+r*Math.cos(a),cz+r*Math.sin(a)]);}
  p.push(p[0]);return p;
}
export const COUNTY_ROADS:CountyRoute[]=[
  {name:'Crosstown Freeway',width:30,curve:true,closed:true,points:[[470,0],[500,-300],[680,-420],[1000,-420],[1250,-270],[1210,150],[1020,390],[830,650],[600,700],[500,530],[470,260]]},
  ...[[-160,470],[0,470],[160,466]].map(([z,x])=>({name:'Palm Interchange',width:20,points:[[343,z],[x,z]]})),
  {name:'Sierra Coast Highway',width:18,curve:true,elevation:sierraHighwayElevation,points:[[-65,-255],[-65,-850],[-25,-1010],[210,-1060],[480,-1060],[620,-960],[650,-760],[700,-560],[680,-420]]},
  {name:'Silver Lake Circuit',width:17,curve:true,closed:true,elevation:silverLakeElevation,points:[[900,-480],[1140,-500],[1190,-640],[1100,-800],[880,-820],[770,-700],[780,-520]]},
  {name:'Verde Skyline Bridge',width:22,curve:true,elevation:x=>MathUtils.lerp(bridgeJunctionHeight,lakeLandingHeight,easedRise(x,662,757,20)),points:[[650,-760],[690,-750],[730,-737],[755,-720],[770,-700]]},
  {name:'Lake Freeway Link',width:18,curve:true,elevation:(x,z)=>MathUtils.lerp(landHeight(x,z),silverLakeElevation(x,z),ease(-z,429,456)),points:[[1000,-420],[1000,-478]]},
  ...[[-260,486],[-100,470],[80,467],[260,470]].map(([z,x])=>({name:'Downtown Avenue',width:20,points:[[x,z],[880,z]]})),
  ...[560,720,880].map(x=>({name:'Crown Street',width:18,points:[[x,-260],[x,x===880?400:260]]})),
  ...[-100,80,260,400].map(z=>({name:'Canal Bridge Avenue',width:18,points:[[880,z],[z===400?1230:1262,z]]})),
  ...[1030,1170].map(x=>({name:'Canal Drive',width:16,points:[[x,-260],[x,400]]})),
  {name:'Canal East Drive',width:16,curve:true,points:[[1262,-100],[1262,130],[1262,260],[1255,320],[1230,400]]},
  {name:'Canal North Link',width:18,points:[[1030,-260],[1250,-270]]},
  {name:'Canal Port Link',width:18,curve:true,points:[[1230,400],[1255,404],[1275,425],[1280,454],[1280,515]]},
  {name:'Airfield Parkway',width:20,points:[[180,280],[180,390]]},
  {name:'Airfield Loop',width:18,points:rounded(30,470,390,650,35)},
  {name:'Runway 07',width:34,points:[[100,520],[420,520]]},
  {name:'Airfield Taxiway',width:16,points:[[30,520],[100,520]]},
  {name:'East Runway Exit',width:12,points:[[420,520],[470,520]]},
  {name:'Airport Freeway Link',width:20,points:[[470,530],[500,530]]},
  {name:'Isla Luz Causeway',width:18,curve:true,elevation:(_x,z)=>4.8*easedRise(z,660,795,28)*(1-easedRise(z,800,882,16)),points:[[180,650],[180,710],[200,770],[233,820],[240,851],[233,872],[225,885]]},
  {name:'Isla Luz Loop',width:14,points:rounded(100,340,905,965,20)},
  {name:'Isla Luz Access',width:14,points:[[225,885],[225,905]]},
  {name:'Port Freeway Link',width:22,points:[[830,650],[900,650]]},
  {name:'Southport Perimeter',width:20,points:rounded(900,1280,480,910,35)},
  {name:'Harbour Bridge',width:22,points:[[900,650],[1280,650]]},
  {name:'Verde Village Loop',width:16,points:rounded(210,570,-970,-650,28)},
  {name:'Verde North Approach',width:18,curve:true,elevation:(_x,z)=>MathUtils.lerp(northJunctionHeight,28,easedRise(z,-1045,-998,10)),points:[[210,-1060],[210,-942]]},
  {name:'Verde Bridge Approach',width:18,curve:true,elevation:x=>MathUtils.lerp(28,bridgeJunctionHeight,ease(x,582,634)),points:[[570,-760],[650,-760]]},
  {name:'Verde High Street',width:16,points:[[210,-820],[570,-820]]},
  {name:'Verde Market Street',width:16,points:[[370,-970],[370,-650]]},
  {name:'Verde South Approach',width:18,curve:true,elevation:verdeSouthElevation,points:[[570,-678],[570,-662],[572,-645],[584,-626],[620,-600],[700,-560]]},
  {name:'Gallery Lake Approach',width:20,curve:true,elevation:galleryLakeElevation,points:[[930,-829],[930,-910]]},
  {name:'Grand Gallery Drive',width:18,elevation:(_x,z)=>galleryExitElevation(z),points:[[930,-910],[930,-1088],...galleryExit.slice(1)]},
  {name:'Gallery Sierra Approach',width:18,curve:true,elevation:gallerySierraElevation,points:[[908,-1110],[820,-1110],[735,-1108],[660,-1107],[620,-1092],[618,-1035],[620,-960]]},
  {name:'Silver East Promenade',width:18,curve:true,elevation:(x,z)=>silverLakeElevation(x,z)+5.5*ease(x,1120,1230)*ease(-z,661,737),points:[[1100,-800],[1210,-830],[1270,-750],[1250,-660],[1190,-640]]},
  {name:'Verde North Turn',width:8,elevation:()=>28,points:northTurn},
  {name:'Verde South Turn',width:8,curve:true,elevation:verdeSouthElevation,points:[[542,-650],[555,-650],[572,-639],[584,-626]]},
  ...SCENIC_STOPS.map(stop=>({name:stop.name,width:6.8,points:[[stop.from.x,stop.from.z],[stop.x,stop.z]]})),
  {name:'Isla Verde Causeway',width:16,elevation:islandCausewayElevation,points:[[480,-1060],[480,-1350]]},
  {name:'Isla Verde Waterfront Loop',width:14,elevation:()=>islandRoadHeight,points:rounded(365,610,-1510,-1350,29)},
];
