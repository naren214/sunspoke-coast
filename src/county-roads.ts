export interface CountyRoute {name:string;points:number[][];width:number;curve?:boolean;closed?:boolean;}
function rounded(x0:number,x1:number,z0:number,z1:number,r:number){
  const p:number[][]=[];
  for(const [cx,cz,start] of [[x0+r,z0+r,Math.PI],[x1-r,z0+r,Math.PI*1.5],[x1-r,z1-r,0],[x0+r,z1-r,Math.PI/2]])
    for(let i=0;i<=10;i++){const a=start+i*Math.PI/20;p.push([cx+r*Math.cos(a),cz+r*Math.sin(a)]);}
  p.push(p[0]);return p;
}
export const COUNTY_ROADS:CountyRoute[]=[
  {name:'Crosstown Freeway',width:30,curve:true,closed:true,points:[[470,0],[500,-300],[680,-420],[1000,-420],[1250,-270],[1210,150],[1020,390],[830,650],[600,700],[500,530],[470,260]]},
  ...[-160,0,160].map(z=>({name:'Palm Interchange',width:20,points:[[343,z],[490,z]]})),
  {name:'Sierra Coast Highway',width:18,curve:true,points:[[-65,-255],[-65,-850],[-25,-1010],[210,-1060],[480,-1060],[620,-960],[650,-760],[700,-560],[680,-420]]},
  {name:'Silver Lake Circuit',width:17,curve:true,closed:true,points:[[900,-420],[1150,-450],[1190,-640],[1100,-800],[880,-820],[770,-700],[780,-520]]},
  {name:'Sierra Lake Link',width:16,curve:true,points:[[650,-760],[700,-720],[770,-700]]},
  {name:'Lake Freeway Link',width:18,points:[[1000,-420],[1150,-450]]},
  ...[-260,-100,80,260].map(z=>({name:'Downtown Avenue',width:20,points:[[490,z],[880,z]]})),
  ...[560,720,880].map(x=>({name:'Crown Street',width:18,points:[[x,-260],[x,260]]})),
  ...[-100,80,260,400].map(z=>({name:'Canal Bridge Avenue',width:18,points:[[880,z],[1230,z]]})),
  ...[1030,1170].map(x=>({name:'Canal Drive',width:16,points:[[x,-260],[x,430]]})),
  {name:'Canal North Link',width:18,points:[[1030,-260],[1250,-270]]},
  {name:'Canal Port Link',width:18,points:[[1170,400],[1280,400],[1280,530]]},
  {name:'Airfield Parkway',width:20,points:[[180,280],[180,390]]},
  {name:'Airfield Loop',width:18,points:rounded(30,470,390,650,35)},
  {name:'Runway 07',width:34,points:[[100,520],[420,520]]},
  {name:'Airfield Taxiway',width:16,points:[[30,520],[100,520]]},
  {name:'Airport Freeway Link',width:20,points:[[470,530],[500,530]]},
  {name:'Isla Luz Causeway',width:18,curve:true,points:[[180,650,0],[180,710,0.4],[200,770,4],[245,820,5],[245,875,4],[225,885,0]]},
  {name:'Isla Luz Loop',width:14,points:rounded(100,340,905,965,20)},
  {name:'Isla Luz Access',width:14,points:[[225,885],[225,905]]},
  {name:'Port Freeway Link',width:22,points:[[830,650],[900,650]]},
  {name:'Southport Perimeter',width:20,points:rounded(900,1280,480,910,35)},
  {name:'Harbour Bridge',width:22,points:[[900,650],[1280,650]]},
];
