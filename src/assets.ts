import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import type {Lighting,Quality} from './types';
import type {GameDownloads} from './downloads';

export interface ModelAsset{id:string;url:string;source:string;author:string;license:string;category:string;dimensions?:number[];lods?:Partial<Record<Quality,string>>;}
export interface MaterialAsset{id:string;baseColor:string;normal?:string;roughness?:string;source:string;author:string;license:string;repeat?:number;}
export interface AssetManifest{models:ModelAsset[];materials:MaterialAsset[];environments:{id:string;url:string}[];}
export type Placement={id:string;x:number;y:number;z:number;height:number;rotation?:number;size?:number[];animate?:boolean;};
type SurfaceTexture={
  texture:T.Texture;
  original:CanvasImageSource&{width:number;height:number};
  scaled:Map<number,HTMLCanvasElement>;
};

export class AssetLibrary{
  constructor(private downloads?:GameDownloads){}
  manifest:AssetManifest={models:[],materials:[],environments:[]};
  private models=new Map<string,Promise<T.Group>>();
  private environments=new Map<Lighting,Promise<T.WebGLRenderTarget>>();
  private materials=new Map<string,Promise<{color:T.Texture;normal?:T.Texture;roughness?:T.Texture}>>();
  private gltf=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private quality:Quality='low';
  private textures:SurfaceTexture[]=[];
  errors:string[]=[];
  async init(){try{if(this.downloads)this.manifest=this.downloads.json<AssetManifest>('/assets/manifest.json');else{const response=await fetch('/assets/manifest.json');if(!response.ok)throw new Error('No asset manifest');this.manifest=await response.json();}}catch(e){this.errors.push(String(e));}}
  async model(id:string,quality:Quality='low'){
    const key=id+':'+quality;
    if(!this.models.has(key)){const asset=this.manifest.models.find(m=>m.id===id);if(!asset)throw new Error('Unknown model '+id);
      this.models.set(key,this.gltf.loadAsync(asset.lods?.[quality]??asset.url).then(gltf=>{gltf.scene.updateMatrixWorld(true);return gltf.scene;}));}
    return this.models.get(key)!;
  }
  async surface(id:string){
    if(!this.materials.has(id))this.materials.set(id,(async()=>{
      const entry=this.manifest.materials.find(m=>m.id===id);if(!entry)throw new Error('Unknown surface '+id);
      const loader=new T.TextureLoader(),load=async(url:string,color=false)=>{
        const texture=await loader.loadAsync(url);
        texture.colorSpace=color?T.SRGBColorSpace:T.NoColorSpace;
        texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.setScalar(.2);texture.anisotropy=4;
        const entry={texture,original:texture.image,scaled:new Map<number,HTMLCanvasElement>()};
        this.textures.push(entry);this.resizeTexture(entry);
        return texture;
      };
      return {color:await load(entry.baseColor,true),normal:entry.normal?await load(entry.normal):undefined,roughness:entry.roughness?await load(entry.roughness):undefined};
    })());return this.materials.get(id)!;
  }
  setQuality(quality:Quality){
    if(this.quality===quality)return;
    this.quality=quality;
    for(const entry of this.textures)this.resizeTexture(entry);
  }
  private resizeTexture({texture,original,scaled}:SurfaceTexture){
    const max={low:512,medium:1024,high:2048}[this.quality],longest=Math.max(original.width,original.height);
    let image=original;
    if(longest>max){
      let canvas=scaled.get(max);
      if(!canvas){
        canvas=document.createElement('canvas');canvas.width=Math.round(original.width*max/longest);canvas.height=Math.round(original.height*max/longest);
        canvas.getContext('2d')!.drawImage(original,0,0,canvas.width,canvas.height);scaled.set(max,canvas);
      }
      image=canvas;
    }
    if(texture.image!==image){texture.image=image;texture.needsUpdate=true;}
  }
  environment(renderer:T.WebGLRenderer,setting:Lighting){
    if(!this.environments.has(setting))this.environments.set(setting,(async()=>{
      const source=this.manifest.environments.find(e=>e.id===setting);if(!source)throw new Error('Missing environment');
      const texture=await new HDRLoader().loadAsync(source.url),generator=new T.PMREMGenerator(renderer),target=generator.fromEquirectangular(texture);texture.dispose();generator.dispose();return target;
    })());return this.environments.get(setting)!;
  }
  async applySurfaces(group:T.Group,progress:(fraction:number)=>void){
    const targets=new Map<string,Set<T.MeshStandardMaterial>>();
    group.traverse(o=>{if(!(o instanceof T.Mesh))return;for(const m of Array.isArray(o.material)?o.material:[o.material]){
      if(!(m instanceof T.MeshStandardMaterial)||m.transparent)continue;
      let id:string|undefined;
      if(o.name==='Road asphalt'||m.name==='Scenic stop asphalt')id='asphalt';else if(o.name==='Road underlay')id='pavement';else if(m.name==='surface:sand')id='sand';else if(m.name==='County meadow grass')id='grass';
      else if(['surface:walk','surface:curb','surface:stone'].includes(m.name))id='pavement';else if(['surface:cream','surface:ivory'].includes(m.name))id='facade';else if(m.name==='surface:terra')id='brick';else if(m.name==='surface:wood')id='wood';
      if(id){const set=targets.get(id)??new Set<T.MeshStandardMaterial>();set.add(m);targets.set(id,set);}
    }});
    let done=0;
    await Promise.all([...targets].map(async([id,materials])=>{try{const maps=await this.surface(id);for(const m of materials){m.map=maps.color;m.normalMap=maps.normal??null;m.normalScale.set(.38,.38);m.roughnessMap=maps.roughness??null;m.roughness=.88;
      if(id!=='grass')m.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
        vec4 surfaceLocal=vec4(transformed,1.);
        #ifdef USE_INSTANCING
        surfaceLocal=instanceMatrix*surfaceLocal;
        #endif
        vec3 surfaceWorld=(modelMatrix*surfaceLocal).xyz;
        vec3 surfaceNormal=abs(inverseTransformDirection(transformedNormal,viewMatrix));
        vec2 surfaceUV=surfaceNormal.y>max(surfaceNormal.x,surfaceNormal.z)?surfaceWorld.xz:surfaceNormal.x>surfaceNormal.z?surfaceWorld.zy:surfaceWorld.xy;
        #ifdef USE_MAP
        vMapUv=(mapTransform*vec3(surfaceUV,1.)).xy;
        #endif
        #ifdef USE_NORMALMAP
        vNormalMapUv=(normalMapTransform*vec3(surfaceUV,1.)).xy;
        #endif
        #ifdef USE_ROUGHNESSMAP
        vRoughnessMapUv=(roughnessMapTransform*vec3(surfaceUV,1.)).xy;
        #endif`);};if(id!=='grass')m.customProgramCacheKey=()=> 'sunspoke-world-space-pbr';m.needsUpdate=true;
    }}catch(e){this.errors.push(String(e));}progress(++done/targets.size);}));
  }
}

export function createImportedScenery(group:T.Group,library:AssetLibrary,placements:Placement[]){
  const root=new T.Group();root.name='Imported district scenery';group.add(root);
  const chunks:{mesh:T.InstancedMesh;center:T.Vector3;resource:string;radius:number;placements:Placement[];actor:boolean;key:string;part:string;levels:Partial<Record<Quality,T.BufferGeometry>>}[]=[];let quality:Quality='low',last=new T.Vector3(-65,0,210),clock=0;
  const actorClock={value:0},actorDummy=new T.Object3D();
  const proxies=group.children.filter(o=>o instanceof T.InstancedMesh&&o.userData.resource) as T.InstancedMesh[];
  const fadeMaterial=(material:T.Material|T.Material[])=>{const clone=(m:T.Material)=>{const next=m.clone();next.onBeforeCompile=m.onBeforeCompile;next.customProgramCacheKey=m.customProgramCacheKey;next.alphaHash=true;next.userData.baseOpacity=m.opacity;return next;};return Array.isArray(material)?material.map(clone):clone(material);};
  proxies.forEach(proxy=>proxy.material=fadeMaterial(proxy.material));
  const loaded=new Set<string>(),pending=new Set<string>(),prepared=new Set<string>(),upgrading=new Set<string>(),referenceDimensions=new Map<string,T.Vector3>();
  const groups=new Map<string,Placement[]>();for(const p of placements){const list=groups.get(p.id)??[];list.push(p);groups.set(p.id,list);}
  async function load(id:string){
    if(pending.has(id)||loaded.has(id))return;pending.add(id);
    try{
      const requested=quality,model=await library.model(id,requested),bounds=new T.Box3().setFromObject(model),dimensions=bounds.getSize(new T.Vector3()),base=new T.Vector3(-bounds.min.x-dimensions.x/2,-bounds.min.y,-bounds.min.z-dimensions.z/2);
      referenceDimensions.set(id,dimensions.clone());
      const byCell=new Map<string,Placement[]>();for(const p of groups.get(id)??[]){const key=Math.floor(p.x/128)+','+Math.floor(p.z/128),list=byCell.get(key)??[];list.push(p);byCell.set(key,list);}
      model.traverse(o=>{if(!(o instanceof T.Mesh))return;
        const geometry=o.geometry.clone();geometry.applyMatrix4(o.matrixWorld);geometry.translate(base.x,base.y,base.z);
        const actor=id.startsWith('adult-');let material=o.material;
        if(actor){const source=Array.isArray(material)?material:[material];material=source.map(m=>{const next=m.clone();next.onBeforeCompile=(shader:Parameters<T.Material['onBeforeCompile']>[0])=>{shader.uniforms.actorClock=actorClock;shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float actorClock;');shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
          float gait=sin(actorClock*2.4)*sign(position.x);transformed.z+=gait*(position.y<.95?.08:position.y<1.5?.035:0.);`);};next.customProgramCacheKey=()=> 'sunspoke-local-people';return next;});if(!Array.isArray(o.material))material=material[0];}
        for(const [cell,list] of byCell){
          const mesh=new T.InstancedMesh(geometry,fadeMaterial(material),list.length),dummy=new T.Object3D();mesh.name='Imported '+id;
          list.forEach((p,i)=>{const scale=p.height/Math.max(.01,dimensions.y);dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.rotation??0,0);dummy.scale.set(p.size?p.size[0]/dimensions.x:scale,p.size?p.size[1]/dimensions.y:scale,p.size?p.size[2]/dimensions.z:scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
          mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();root.add(mesh);chunks.push({mesh,center:mesh.boundingSphere!.center.clone(),radius:mesh.boundingSphere!.radius,resource:id,placements:list,actor,key:id+':'+cell,part:o.name,levels:{[requested]:geometry}});
        }
      });
      prepared.add(id+':'+requested);loaded.add(id);root.userData.loaded=[...loaded];
      if(quality!==requested)void upgrade(id,quality);
      if(quality==='high'&&requested!=='medium')void upgrade(id,'medium');
    }catch(error){library.errors.push(id+': '+String(error));}finally{pending.delete(id);}
    update(last);
  }
  async function upgrade(id:string,level:Quality){
    const key=id+':'+level;
    if(prepared.has(key)||upgrading.has(key))return;
    upgrading.add(key);
    try{const model=await library.model(id,level),bounds=new T.Box3().setFromObject(model),size=bounds.getSize(new T.Vector3()),base=new T.Vector3(-bounds.min.x-size.x/2,-bounds.min.y,-bounds.min.z-size.z/2);
      const reference=referenceDimensions.get(id)??size;
      model.traverse(o=>{if(!(o instanceof T.Mesh))return;const geometry=o.geometry.clone();geometry.applyMatrix4(o.matrixWorld);geometry.translate(base.x,base.y,base.z);
        // Keep the initial footprint stable when decimation changes a model's bounds.
        geometry.scale(reference.x/Math.max(.001,size.x),reference.y/Math.max(.001,size.y),reference.z/Math.max(.001,size.z));
        for(const chunk of chunks)if(chunk.resource===id&&chunk.part===o.name)chunk.levels[level]=geometry;});
      prepared.add(key);update(last);
    }catch(error){library.errors.push('LOD '+id+': '+String(error));}
    finally{upgrading.delete(key);}
  }
  function update(position:T.Vector3,time=clock){
    clock=time;actorClock.value=time;
    last.copy(position);const reach={low:150,medium:260,high:420}[quality];
    const dummy=actorDummy;let actors={low:8,medium:16,high:24}[quality];const allowance=new Map<string,number>();
    for(const chunk of chunks){chunk.mesh.visible=chunk.center.distanceToSquared(position)<((chunk.actor?65:reach)+chunk.radius)**2;
      const fade=chunk.actor?1:1-T.MathUtils.smoothstep(chunk.center.distanceTo(position),reach+chunk.radius-28,reach+chunk.radius);for(const m of Array.isArray(chunk.mesh.material)?chunk.mesh.material:[chunk.mesh.material])m.opacity=(m.userData.baseOpacity??1)*fade;
      const distance=chunk.center.distanceTo(position),level=quality==='high'&&distance<100?'high':quality!=='low'&&distance<220?'medium':'low';chunk.mesh.geometry=chunk.levels[level]??chunk.levels[quality]??chunk.mesh.geometry;
      if(chunk.actor&&chunk.mesh.visible){if(!allowance.has(chunk.key)){const count=Math.min(chunk.placements.length,actors);allowance.set(chunk.key,count);actors-=count;}chunk.mesh.count=allowance.get(chunk.key)!;
        for(let i=0;i<chunk.mesh.count;i++){const p=chunk.placements[i],yaw=p.rotation??0,wave=Math.sin(time*.18+i)*.65,scale=p.height/1.75;dummy.position.set(p.x+Math.sin(yaw)*wave,p.y,p.z+Math.cos(yaw)*wave);dummy.rotation.set(0,yaw+(Math.cos(time*.18+i)<0?Math.PI:0),0);dummy.scale.setScalar(scale);dummy.updateMatrix();chunk.mesh.setMatrixAt(i,dummy.matrix);}chunk.mesh.instanceMatrix.needsUpdate=true;}
    }
    // Keep the inexpensive procedural silhouettes beyond the detailed asset range.
    for(const object of proxies){const resource=object.userData.resource;if(!loaded.has(resource))continue;
      if(!object.boundingSphere)object.computeBoundingSphere();const radius=object.boundingSphere!.radius,distance=object.boundingSphere!.center.distanceTo(position),fade=T.MathUtils.smoothstep(distance,reach+radius-28,reach+radius);object.visible=fade>.002;for(const m of Array.isArray(object.material)?object.material:[object.material])m.opacity=(m.userData.baseOpacity??1)*fade;}
  }
  async function essential(progress:(fraction:number)=>void){const ids=['palm','bench','boulder'].filter(id=>groups.has(id)&&library.manifest.models.some(a=>a.id===id));let done=0;await Promise.all(ids.map(async id=>{await load(id);progress(++done/ids.length);}));}
  async function remaining(){for(const id of groups.keys()){if(library.manifest.models.some(a=>a.id===id)){await load(id);await new Promise(resolve=>setTimeout(resolve,24));}}}
  return {essential,remaining,update,setQuality:(next:Quality)=>{quality=next;for(const id of loaded){void upgrade(id,next);if(next==='high')void upgrade(id,'medium');}update(last);},root};
}
