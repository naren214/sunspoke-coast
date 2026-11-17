import * as T from 'three';
import type { Lighting, Quality, World, DriveState } from './types';

export const VISUAL_QUALITY={
  low:{pixel:.75,shadow:1024,bloom:false,lights:4,ao:false,reflection:false,textureSize:512},
  medium:{pixel:1,shadow:2048,bloom:true,lights:8,ao:false,reflection:false,textureSize:1024},
  high:{pixel:1,shadow:2048,bloom:true,lights:12,ao:true,reflection:true,textureSize:2048},
};
export type LightSite={position:T.Vector3;color:T.Color;intensity:number;range?:number};
export function createNearbyLighting(group:T.Group,sources:LightSite[]){
  const slots=Array.from({length:12},()=>{const light=new T.PointLight(0xffffff,0,26,2);light.castShadow=false;group.add(light);return {light,site:undefined as LightSite|undefined,target:undefined as LightSite|undefined,fade:0};});
  let quality:Quality='low',lastTime=0,nextSelect=0;
  function update(time:number,setting:Lighting,position:T.Vector3,indoor:boolean){
    const dt=T.MathUtils.clamp(time-lastTime,0,.1);lastTime=time;
    const limit=VISUAL_QUALITY[quality].lights,enabled=setting!=='golden'||indoor;
    if(time>=nextSelect){
      nextSelect=time+.35;
      const ranked=enabled?[...sources].sort((a,b)=>a.position.distanceToSquared(position)-b.position.distanceToSquared(position)):[];
      const assigned=new Set<LightSite>();
      slots.forEach((slot,i)=>{
        if(i>=limit||!enabled){slot.target=undefined;return;}
        const existing=slot.target;
        if(existing&&ranked.indexOf(existing)<limit+3&&!assigned.has(existing)){assigned.add(existing);return;}
        slot.target=ranked.find(s=>!assigned.has(s));if(slot.target)assigned.add(slot.target);
      });
    }
    slots.forEach((slot,i)=>{
      const target=i<limit&&enabled?slot.target:undefined;
      if(slot.site!==target){slot.fade=Math.max(0,slot.fade-dt*5);if(slot.fade===0){slot.site=target;if(target){slot.light.position.copy(target.position);slot.light.color.copy(target.color);slot.light.distance=target.range??26;}}}
      else slot.fade=Math.min(1,slot.fade+dt*4);
      slot.light.intensity=enabled?(slot.site?.intensity??0)*slot.fade*(setting==='night'?1:.72):0;slot.light.visible=i<limit;
    });
    group.userData.activeLocalLights=slots.filter(s=>s.light.visible).length;
  }
  slots.forEach((slot,i)=>slot.light.visible=i<4);
  return {update,setQuality:(next:Quality)=>{quality=next;nextSelect=0;slots.forEach((slot,i)=>slot.light.visible=i<VISUAL_QUALITY[next].lights);}};
}

export function createContactShadows(scene:T.Scene,world:World){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d')!;
  const gradient=ctx.createRadialGradient(64,64,8,64,64,64);gradient.addColorStop(0,'rgba(0,0,0,.55)');gradient.addColorStop(.6,'rgba(0,0,0,.23)');gradient.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
  const texture=new T.CanvasTexture(canvas),material=new T.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,opacity:.65,polygonOffset:true,polygonOffsetFactor:-1});
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(12),3));geometry.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,0,1,1,1],2));geometry.setIndex([0,2,1,1,2,3]);
  const shadow=new T.Mesh(geometry,material);shadow.name='Cayenne contact shadow';shadow.frustumCulled=false;shadow.renderOrder=1;scene.add(shadow);
  const staticMaterial=material.clone();staticMaterial.opacity=.28;
  const unit=new T.PlaneGeometry(1,1);unit.rotateX(-Math.PI/2);const buckets=new Map<string,T.Matrix4[]>(),dummy=new T.Object3D();
  for(const b of world.colliders){
    if(b.baseY!==undefined||b.height<4||(b.halfX<2||b.halfZ<2)&&!(b.halfX<1&&b.halfZ<1&&b.height>5))continue;
    dummy.position.set(b.x,world.groundHeight(b.x,b.z)+.025,b.z);dummy.rotation.set(0,b.rotation??0,0);dummy.scale.set(Math.max(2,b.halfX*2.35),1,Math.max(2,b.halfZ*2.35));dummy.updateMatrix();
    const key=Math.floor(b.x/128)+','+Math.floor(b.z/128),list=buckets.get(key)??[];list.push(dummy.matrix.clone());buckets.set(key,list);
  }
  for(const list of buckets.values()){const mesh=new T.InstancedMesh(unit,staticMaterial,list.length);mesh.name='Foundation contact shading';list.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.computeBoundingSphere();scene.add(mesh);}
  function update(state:DriveState){
    const {position:p,heading}=state,c=Math.cos(heading),s=Math.sin(heading),v=geometry.attributes.position as T.BufferAttribute;
    const elevation=Math.max(0,p.y-(world.visualHeight??world.surfaceHeight??world.groundHeight)(p.x,p.z)),spread=1+Math.min(elevation,8)*.09;
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a,b],i)=>{const x=p.x+c*a*1.45*spread+s*b*2.8*spread,z=p.z-s*a*1.45*spread+c*b*2.8*spread;v.setXYZ(i,x,(world.visualHeight??world.surfaceHeight??world.groundHeight)(x,z)+.05,z);});
    v.needsUpdate=true;geometry.computeVertexNormals();material.opacity=.72/(1+elevation*.6);
  }
  return {update};
}

export function createOutdoorEnvironment(renderer:T.WebGLRenderer,setting:Lighting){
  const scene=new T.Scene(),p={golden:['#86b6ce','#eee0bb','#72846b'],twilight:['#465b86','#c49caa','#4a6270'],night:['#111e37','#607894','#253a45']}[setting];
  const c=document.createElement('canvas');c.width=1024;c.height=512;const ctx=c.getContext('2d')!,gradient=ctx.createLinearGradient(0,0,0,512);
  gradient.addColorStop(0,p[0]);gradient.addColorStop(.5,p[1]);gradient.addColorStop(1,p[2]);ctx.fillStyle=gradient;ctx.fillRect(0,0,1024,512);
  for(let i=0;i<22;i++){ctx.fillStyle=i%2?'#33494b':'#52666b';const h=18+(i*37)%75;ctx.fillRect(i*47,278-h,29+(i*13)%28,h);}
  const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;texture.mapping=T.EquirectangularReflectionMapping;
  const pmrem=new T.PMREMGenerator(renderer),target=pmrem.fromEquirectangular(texture);texture.dispose();pmrem.dispose();return target;
}
