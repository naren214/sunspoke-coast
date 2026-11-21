import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { createBloom } from './bloom';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createWorld } from './world';
import { loadBakedWorld } from './world-cache';
import { CountyAtlas } from './atlas';
import { createCar } from './car';
import { GT_ORBIT, GT_PAINTS } from './gt-model';
import { Driving, ChaseCamera } from './driving';
import { GameAudio } from './audio';
import type { Lighting, Quality } from './types';
import {AssetLibrary,createImportedScenery} from './assets';
import {VISUAL_QUALITY,createContactShadows,createOutdoorEnvironment} from './visuals';
import {insideGallery,WATERS} from './geography';
import {districtAt} from './districts';
import {MultiplayerGame} from './multiplayer-game';
import type {GameDownloads} from './downloads';
import type {OpeningScreen} from './opening';
import {VEHICLE} from './vehicle';
import {isSubmerged} from './water-recovery';
import catalog from '../shared/tracks.json';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const clamp = THREE.MathUtils.clamp;
const keys = new Set<string>();
const qaView = new URLSearchParams(location.search).has('qa') && new URLSearchParams(location.search).has('view');
type GameMode = 'driving' | 'pause' | 'atlas' | 'photo';
let started = false;
let lighting: Lighting = 'golden';
const requestedQuality=new URLSearchParams(location.search).get('quality');
let quality: Quality = requestedQuality==='medium'||requestedQuality==='high'||requestedQuality==='low'?requestedQuality:'low';
let volume = .45;
let showControls = true;
let showMinimap = true;
let lastFrame = performance.now();
let elapsed = 0;
let orbitLast = 0;
let pointer: number | undefined;
const orbit = { ...GT_ORBIT };
const frameHistogram = new Uint32Array(10001);
const logicHistogram = new Uint32Array(10001),renderHistogram = new Uint32Array(10001);
let measuredFrames = 0, totalFrameMs = 0, overBudgetFrames = 0, stallsOver100Ms = 0, maxFrameMs = 0;
let totalLogicMs=0,totalRenderSubmitMs=0;
let lastAnimationPhases={logicMs:0,renderSubmitMs:0,totalScriptMs:0};
const stallSamples:{second:number;frameMs:number;position:number[];previousPhases:typeof lastAnimationPhases;heapUsed:number|null;drawCalls:number;triangles:number;visibleTiles:number;programs:number|null}[]=[];


const presets=VISUAL_QUALITY;

export async function boot(downloads:GameDownloads,opening:OpeningScreen) {
  THREE.DefaultLoadingManager.setURLModifier(url=>downloads.resource(url));
  const renderer = new THREE.WebGLRenderer({ canvas: $('scene') as HTMLCanvasElement, antialias: true, powerPreference: 'high-performance' });
  renderer.info.autoReset = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#e9be94', .00145);
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, .2, 1800);
  const progress=(_fraction:number,label:string)=>opening.stage(label);
  progress(.02,'Loading Sunspoke Coast');await new Promise(resolve=>requestAnimationFrame(resolve));
  const library=new AssetLibrary(downloads);
  const [cachedCounty] = await Promise.all([
    loadBakedWorld(progress),
    document.fonts.load('190px CoastSignature'),
    document.fonts.load('900 245px Barlow'),
    library.init()
  ]);
  const world = createWorld(cachedCounty);
  const scenery=createImportedScenery(world.group,library,world.group.userData.placements??[]);
  const atlas=new CountyAtlas(world);
  const canvas = $('scene') as HTMLCanvasElement;
  let mode:GameMode='pause',returnMode:'driving'|'pause'='driving',opener:HTMLElement|null=null;
  let interiorBlend=0,lastDistrict='',districtUntil=0,candidateDistrict='',districtSince=0;
  const car = createCar();
  scene.add(world.group, car.group);
  const contacts=createContactShadows(scene,world);
  await Promise.all([world.loadAssets?.(),car.loadAssets((loaded,total)=>progress(.42+.1*loaded/total,'Detailing the Sunspoke GT'),true),library.applySurfaces(world.group,f=>progress(.52+.12*f,'Finishing the streets')),scenery.essential(f=>progress(.64+.12*f,'Planting the coast'))]);
  const drive = new Driving(world);
  const chase = new ChaseCamera(camera, world);
  const audio = new GameAudio();
  const multiplayer=new MultiplayerGame({world,scene,drive,atlas,paused:()=>mode!=='driving',lighting:()=>lighting,light:applyLighting,
    beginRace:()=>{if(!started||document.hidden||!document.hasFocus())return false;enterMode('driving');return true;},
    teleported:()=>{clearInput();orbit.yaw=0;orbitLast=elapsed;},toast});
  const hemi = new THREE.HemisphereLight('#a9d9e1', '#a38a63', 2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffd0a0', 3.5);
  sun.castShadow = true;
  sun.shadow.camera.left = -75;
  sun.shadow.camera.right = 75;
  sun.shadow.camera.top = 75;
  sun.shadow.camera.bottom = -75;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 400;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -.00015;
  sun.shadow.normalBias = .08;
  scene.add(sun, sun.target);
  scene.onBeforeRender = (_renderer, _scene, renderCamera) => {
    const shadowCamera=renderer.shadowMap.enabled?sun.shadow.camera:undefined;
    if(shadowCamera){sun.updateMatrixWorld(true);sun.target.updateMatrixWorld(true);sun.shadow.updateMatrices(sun);}
    world.updateStaticVisibility?.(renderCamera,shadowCamera);
  };
  const fill = new THREE.DirectionalLight('#81cbdf', .5);
  fill.position.set(120, 80, 80);
  scene.add(fill);
  const outdoor={golden:createOutdoorEnvironment(renderer,'golden'),twilight:createOutdoorEnvironment(renderer,'twilight'),night:createOutdoorEnvironment(renderer,'night')};
  const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),interiorEnvironment=pmrem.fromScene(room,.04);room.dispose();pmrem.dispose();
  scene.environment=outdoor.golden.texture;scene.environmentIntensity=.6;

  const skyUniforms = { cloudClock:{value:0}, top: { value: new THREE.Color('#619cb6') }, middle: { value: new THREE.Color('#f1bb96') }, bottom: { value: new THREE.Color('#e8c0a2') }, sunDirection: { value: new THREE.Vector3(-.9, .24, -.36).normalize() }, sunColor: { value: new THREE.Color('#ffddb0') }, sunStrength: { value: 1 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 20), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: skyUniforms, vertexShader: 'varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}', fragmentShader: 'varying vec3 vDirection;uniform float cloudClock;uniform vec3 top;uniform vec3 middle;uniform vec3 bottom;uniform vec3 sunDirection;uniform vec3 sunColor;uniform float sunStrength;void main(){vec3 d=normalize(vDirection);float h=max(0.0,d.y);vec3 col=mix(bottom,middle,smoothstep(-.08,.05,d.y));col=mix(col,top,pow(h,.5));float band=smoothstep(.08,.18,d.y)*(1.-smoothstep(.5,.8,d.y));float cloud=pow(max(0.,sin(d.x*25.+d.z*8.+cloudClock*.004)*.3+sin(d.z*18.-d.x*9.-cloudClock*.003)*.25+.4),5.)*band;col=mix(col,middle+vec3(.07),cloud*.25);float s=max(0.0,dot(d,sunDirection));col+=sunColor*pow(s,18.0)*.15*sunStrength;col+=sunColor*smoothstep(.9994,.9998,s)*2.5*sunStrength;gl_FragColor=vec4(col,1.0);}' }));
  scene.add(sky);
  // Opaque scenery writes depth first, so the sky shader only shades open pixels.
  sky.renderOrder = 100;
  (sky.material as THREE.ShaderMaterial).fragmentShader=(sky.material as THREE.ShaderMaterial).fragmentShader.replace(
    'gl_FragColor=vec4(col,1.0);','gl_FragColor=vec4(col,1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n');
  const starGeometry = new THREE.BufferGeometry();
  const starPositions = [];
  for (let i = 0; i < 500; i++) { const y = .12 + (i * .61803398875 % 1) * .85; const a = i * 2.399963; const r = Math.sqrt(1 - y * y); starPositions.push(Math.cos(a) * r * 1000, y * 1000, Math.sin(a) * r * 1000); }
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ size: 1.35, color: '#c9e5ff', transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true }));
  scene.add(stars);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const ao=new SSAOPass(scene,camera,Math.round(innerWidth/2),Math.round(innerHeight/2));ao.kernelRadius=8;ao.minDistance=.002;ao.maxDistance=.08;ao.enabled=false;composer.addPass(ao);
  const lakeShape=new THREE.Shape();WATERS[0].polygon!.forEach(([x,z],i)=>i?lakeShape.lineTo(x-965,-z-640):lakeShape.moveTo(x-965,-z-640));
  const lakeReflection=new Reflector(new THREE.ShapeGeometry(lakeShape),{color:0x9abcc3,textureWidth:512,textureHeight:512,clipBias:.003});
  lakeReflection.name='High quality lake reflection';lakeReflection.rotation.x=-Math.PI/2;lakeReflection.position.set(965,8.02,-640);lakeReflection.visible=false;
  const reflectionMaterial=lakeReflection.material as THREE.ShaderMaterial;reflectionMaterial.transparent=true;reflectionMaterial.depthWrite=false;reflectionMaterial.fragmentShader=reflectionMaterial.fragmentShader.replace('#include <tonemapping_fragment>','gl_FragColor.a=.26;\n#include <tonemapping_fragment>');
  const captureReflection=lakeReflection.onBeforeRender.bind(lakeReflection);let nextReflection=0;
  lakeReflection.onBeforeRender=(...args)=>{const time=performance.now();if(time<nextReflection)return;nextReflection=time+125;captureReflection(...args);};scene.add(lakeReflection);
  const bloom = createBloom(innerWidth, innerHeight);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let lastResolution='';
  let measuredPrevious=false;
  function clearStats() {
    frameHistogram.fill(0);
    logicHistogram.fill(0);
    renderHistogram.fill(0);
    stallSamples.length = 0;
    measuredFrames = totalFrameMs = totalLogicMs = totalRenderSubmitMs = 0;
    overBudgetFrames = stallsOver100Ms = maxFrameMs = 0;
    measuredPrevious = false;
  }
  function resize(trackChange=true) {
    renderer.setPixelRatio(Math.min(devicePixelRatio, presets[quality].pixel));
    renderer.setSize(innerWidth, innerHeight);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(innerWidth, innerHeight);
    ao.setSize(Math.round(innerWidth*renderer.getPixelRatio()/2),Math.round(innerHeight*renderer.getPixelRatio()/2));
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    if(trackChange){
      const resolution=[innerWidth,innerHeight,canvas.width,canvas.height].join('x');
      if(lastResolution!==resolution){clearStats();lastResolution=resolution;}
    }
  }
  function applyQuality(next: Quality) {
    if(quality!==next)clearStats();
    quality = next;
    world.setQuality?.(next);car.setQuality(next);multiplayer.quality(next);scenery.setQuality(next);library.setQuality(next);
    ao.enabled=presets[next].ao;lakeReflection.visible=presets[next].reflection;
    $('quality-description').textContent={low:'Lighter detail · contact shadows · 75% resolution',medium:'Full resolution · sun shadows · soft bloom',high:'Rich detail · ambient shading · lake reflections'}[next];
    renderer.shadowMap.enabled = next !== 'low';
    bloom.enabled = presets[next].bloom;
    sun.shadow.mapSize.setScalar(presets[next].shadow);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    resize();
    selectSetting('quality',next);
  }
  function applyLighting(next: Lighting) {
    if(lighting!==next)clearStats();
    lighting = next;scene.environment=outdoor[next].texture;void library.environment(renderer,next).then(environment=>{if(lighting===next)scene.environment=environment.texture;}).catch(()=>{});
    const data = { golden: { top: '#78adc2', mid: '#ead3b6', bottom: '#dcd8c4', fog: '#c4c5ba', hemi: '#b5d8df', ground: '#b19574', sun: '#ffc994', intensity: 2.35, ambient: 1.05, env: .7, exposure: 1, skySun: 1 }, twilight: { top: '#354c83', mid: '#dd9ba8', bottom: '#b691ac', fog: '#9e90ae', hemi: '#869ed0', ground: '#74788d', sun: '#f1b2ac', intensity: .75, ambient: 1.35, env: .65, exposure: 1.12, skySun: .4 }, night: { top: '#08152f', mid: '#244064', bottom: '#324d67', fog: '#253d56', hemi: '#7995c2', ground: '#4e6484', sun: '#a9c8ff', intensity: .18, ambient: .48, env: .3, exposure: 1.05, skySun: 0 } }[next];
    skyUniforms.top.value.set(data.top); skyUniforms.middle.value.set(data.mid); skyUniforms.bottom.value.set(data.bottom); skyUniforms.sunStrength.value = data.skySun;
    (scene.fog as THREE.FogExp2).color.set(data.fog);
    (scene.fog as THREE.FogExp2).density = next === 'night' ? .00155 : .00105;
    hemi.color.set(data.hemi); hemi.groundColor.set(data.ground); hemi.intensity = data.ambient;
    sun.color.set(data.sun); sun.intensity = data.intensity;
    fill.intensity = next === 'golden' ? .4 : next === 'night' ? .18 : .5;
    scene.environmentIntensity = data.env;
    renderer.toneMappingExposure = data.exposure;
    (stars.material as THREE.PointsMaterial).opacity = next === 'night' ? .85 : 0;
    bloom.strength = next === 'night' ? .28 : .18;
    selectSetting('lighting',next);
  }
  function selectSetting(id:string,value:string){
    document.querySelectorAll<HTMLButtonElement>('#'+id+' button').forEach(button=>{
      const selected=button.dataset.value===value;
      button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));
    });
  }
  let paint: keyof typeof GT_PAINTS = 'teal';
  const paintButtons = document.querySelectorAll<HTMLButtonElement>('#car-paint button');
  function applyPaint(next: keyof typeof GT_PAINTS) {
    paint = next;
    car.setPaint(GT_PAINTS[paint]);
    selectSetting('car-paint', paint);
    const selected = Array.from(paintButtons).find(button => button.dataset.value === paint);
    if (selected) $('ride-paint').textContent = selected.textContent;
  }
  function persist() { try { localStorage.setItem('sunspoke-settings', JSON.stringify({quality, lighting, volume,showControls,showMinimap,paint})); } catch {} }
  try { const saved = JSON.parse(localStorage.getItem('sunspoke-settings') || '{}'); if (!requestedQuality&&Object.hasOwn(presets,saved.quality)) quality = saved.quality; if (typeof saved.volume === 'number') volume = clamp(saved.volume, 0, 1); if (typeof saved.showControls === 'boolean') showControls = saved.showControls; if(typeof saved.showMinimap==='boolean')showMinimap=saved.showMinimap; if(saved.paint==='teal'||saved.paint==='red')paint=saved.paint; } catch {}
  applyPaint(paint);
  applyQuality(quality);
  applyLighting('golden');
  audio.setVolume(volume);
  ($('volume') as HTMLInputElement).value = String(volume * 100);
  ($('controls-toggle') as HTMLInputElement).checked = showControls;
  ($('minimap-toggle') as HTMLInputElement).checked=showMinimap;
  atlas.setMinimap(showMinimap);
  function clearInput(){
    keys.clear();
    if(pointer!==undefined&&canvas.hasPointerCapture(pointer))canvas.releasePointerCapture(pointer);
    pointer=undefined;lastFrame=performance.now();measuredPrevious=false;
  }
  function enterMode(next: GameMode,focus=true) {
    clearInput();
    if(mode==='atlas'&&next!=='atlas')atlas.close();
    mode=next;
    $('pause').hidden=!started||mode!=='pause';
    $('hud').hidden=!started||mode!=='driving';
    $('photo-mode').hidden=!started||mode!=='photo';
    $('hint').hidden = !showControls;
    canvas.tabIndex=mode==='driving'?0:-1;
    audio.setPaused(mode!=='driving');
    if(!started)return;
    if(mode==='atlas')atlas.open(drive.renderState(true));
    if(focus)({driving:canvas,pause:$('resume'),atlas:$('close-map'),photo:$('capture-photo')}[mode]).focus({preventScroll:true});
  }
  function setPaused(next: boolean){enterMode(next?'pause':'driving');}
  function toggleOverlay(overlay:'atlas'|'photo',trigger?:HTMLElement){
    if(!started)return;
    if(mode===overlay){
      enterMode(returnMode);
      if(opener?.isConnected&&!opener.closest('[hidden]'))opener.focus({preventScroll:true});
      opener=null;return;
    }
    if(mode==='atlas'||mode==='photo')return;
    returnMode=mode;
    opener=trigger??document.activeElement as HTMLElement|null;
    enterMode(overlay);
  }
  $('drive').onclick = async () => {
    started = true;
    $('opening').hidden = true;
    try { await audio.start(); } catch { toast('Audio is unavailable. You can keep driving.'); }
    audio.setVolume(volume);
    if(document.hidden||!document.hasFocus())enterMode('pause',false);else setPaused(false);
    multiplayer.tryStage();void car.loadAssets();
  };
  const toggleAtlas=(event?:MouseEvent)=>toggleOverlay('atlas',event?.currentTarget as HTMLElement|undefined);
  const togglePhoto=(event?:MouseEvent)=>toggleOverlay('photo',event?.currentTarget as HTMLElement|undefined);
  $('open-photo').onclick=togglePhoto;$('close-photo').onclick=togglePhoto;
  $('capture-photo').onclick=()=>{
    const previousAspect=camera.aspect;camera.aspect=16/9;camera.updateProjectionMatrix();renderer.setPixelRatio(1);renderer.setSize(1920,1080,false);composer.setPixelRatio(1);composer.setSize(1920,1080);ao.setSize(960,540);
    const copy=document.createElement('canvas');copy.width=1920;copy.height=1080;
    try{
      renderer.info.reset();
      if(bloom.enabled||ao.enabled)composer.render();else renderer.render(scene,camera);
      copy.getContext('2d')!.drawImage(renderer.domElement,0,0);
    }finally{camera.aspect=previousAspect;resize(false);}
    copy.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='Sunspoke-Coast-Photo.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);});
  };
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
  function timings(){
    function percentile(histogram:Uint32Array,fraction:number){
      if(!measuredFrames)return null;
      const target=Math.min(measuredFrames-1,Math.floor(measuredFrames*fraction));let seen=0;
      for(let i=0;i<histogram.length;i++){seen+=histogram[i];if(seen>target)return i/10;}
      return histogram===frameHistogram?maxFrameMs:null;
    }
    const seconds=totalFrameMs/1000;
    return {seconds,frames:measuredFrames,fps:seconds?measuredFrames/seconds:null,medianMs:percentile(frameHistogram,.5),p95Ms:percentile(frameHistogram,.95),p99Ms:percentile(frameHistogram,.99),meanLogicMs:measuredFrames?totalLogicMs/measuredFrames:null,meanRenderSubmitMs:measuredFrames?totalRenderSubmitMs/measuredFrames:null,p95LogicMs:percentile(logicHistogram,.95),p95RenderSubmitMs:percentile(renderHistogram,.95),overBudgetFrames,stallsOver100Ms,maxFrameMs:measuredFrames?maxFrameMs:null,stallSamples:stallSamples.slice()};
  }
  $('performance-report').onclick=()=>{
    const data={build:catalog.mapVersion,quality,lighting,viewport:[innerWidth,innerHeight],devicePixelRatio,internal:[canvas.width,canvas.height],...timings(),renderer:gpu,assets:library.errors,rendering:world.group.userData.rendering??null,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,userAgent:navigator.userAgent};
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='Sunspoke-Performance.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
  };
  $('close-map').onclick=toggleAtlas;$('open-map').onclick=toggleAtlas;$('hud-map').onclick=toggleAtlas;
  $('pause-button').onclick = () => setPaused(true);
  $('resume').onclick = () => {setPaused(false);multiplayer.tryStage();};
  function reset(water=false){
    if(!multiplayer.reset()){
      drive.reset();toast(water?'Recovered from the water':'Back on the coast road');
    }
    clearInput();Object.assign(orbit,GT_ORBIT);
  }
  $('reset').onclick = () => { reset(); setPaused(false); };
  $('hide-hint').onclick = () => { showControls = false; $('hint').hidden = true; ($('controls-toggle') as HTMLInputElement).checked = false; persist(); };
  $('controls-toggle').onchange = e => { showControls = (e.target as HTMLInputElement).checked; persist(); };
  $('minimap-toggle').onchange=e=>{showMinimap=(e.target as HTMLInputElement).checked;atlas.setMinimap(showMinimap);persist();};
  $('volume').oninput = e => { volume = Number((e.target as HTMLInputElement).value) / 100; audio.setVolume(volume); persist(); };
  document.querySelectorAll('#lighting button').forEach(button => button.addEventListener('click', () => { applyLighting((button as HTMLElement).dataset.value as Lighting); multiplayer.setLighting(lighting); persist(); }));
  document.querySelectorAll('#quality button').forEach(button => button.addEventListener('click', () => { applyQuality((button as HTMLElement).dataset.value as Quality); persist(); }));
  paintButtons.forEach(button => button.addEventListener('click', () => {
    const value = button.dataset.value;
    if (value === 'teal' || value === 'red') {
      applyPaint(value);
      persist();
    }
  }));
  const drivingKeys = ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','Space','ShiftLeft','ShiftRight','KeyR'];
  window.addEventListener('keydown', e => {
    if(!started)return;
    if(e.code==='Tab'&&mode!=='driving'){
      const panel=$(mode==='photo'?'photo-mode':mode);
      const focusable=[...Array.from(panel.querySelectorAll<HTMLElement>('button,input,select,a[href],[tabindex="0"]'))]
        .filter(el=>!el.matches(':disabled')&&el.getClientRects().length>0);
      if(!focusable.length)return;
      const index=focusable.indexOf(document.activeElement as HTMLElement);
      if(index<0||(e.shiftKey?index===0:index===focusable.length-1)){
        e.preventDefault();focusable[e.shiftKey?focusable.length-1:0].focus();
      }
      return;
    }
    if(e.code==='Escape'&&!e.repeat){
      e.preventDefault();
      if(mode==='atlas'||mode==='photo')toggleOverlay(mode);
      else setPaused(mode==='driving');
      return;
    }
    const target=e.target as HTMLElement;
    if(e.defaultPrevented||e.altKey||e.ctrlKey||e.metaKey||target?.matches?.('input,select,textarea,[contenteditable]'))return;
    if(e.code==='F2'&&!e.repeat&&mode!=='atlas'){e.preventDefault();togglePhoto();return;}
    if(e.code==='KeyM'&&!e.repeat&&mode!=='photo'){e.preventDefault();toggleAtlas();return;}
    if(mode==='photo'){
      if(e.key==='ArrowLeft'||e.key==='ArrowRight')orbit.yaw+=e.key==='ArrowLeft'?-.11:.11;
      else if(e.key==='ArrowUp'||e.key==='ArrowDown')orbit.pitch=clamp(orbit.pitch+(e.key==='ArrowUp'?-.06:.06),.12,.9);
      else if(['+','=','-'].includes(e.key))orbit.distance=clamp(orbit.distance+(['+','='].includes(e.key)?-.7:.7),5.5,18);
      else return;
      e.preventDefault();return;
    }
    if(mode!=='driving'||!drivingKeys.includes(e.code))return;
    if(e.code==='Space'&&target?.closest?.('button,a'))return;
    e.preventDefault();if(e.repeat)return;
    if(e.code==='KeyR'){reset();return;}
    keys.add(e.code);
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  function background(){
    if(!started||qaView)return;
    clearInput();atlas.cancelDrag();
    if(mode==='atlas'||mode==='photo'){returnMode='pause';opener=null;}
    else if(mode==='driving')enterMode('pause',false);
  }
  window.addEventListener('blur',background);
  window.addEventListener('focus',()=>multiplayer.tryStage());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)background();else multiplayer.tryStage();});
  canvas.tabIndex=-1;
  let oldX = 0, oldY = 0;
  canvas.addEventListener('pointerdown',e=>{if((mode!=='driving'&&mode!=='photo')||pointer!==undefined||e.button!==0)return;if(mode==='photo')e.preventDefault();pointer=e.pointerId;oldX=e.clientX;oldY=e.clientY;canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(pointer!==e.pointerId)return;orbit.yaw-=(e.clientX-oldX)*.005;orbit.pitch=clamp(orbit.pitch+(e.clientY-oldY)*.004,.12,.9);oldX=e.clientX;oldY=e.clientY;orbitLast=elapsed;});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>{pointer=undefined;orbitLast=elapsed;});
  canvas.addEventListener('wheel',e=>{if(mode!=='driving'&&mode!=='photo')return;e.preventDefault();orbit.distance=clamp(orbit.distance+e.deltaY*.012,5.5,18);orbitLast=elapsed;},{passive:false});
  window.addEventListener('resize',()=>resize());
  let toastTimer = 0;
  function toast(text: string) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = window.setTimeout(()=>$('toast').hidden=true,2400); }
  let captureJump=false;
  const input = { forward:false,backward:false,left:false,right:false,handbrake:false,brake:false };
  const sunDirection = new THREE.Vector3(-.9,.24,-.36).normalize();
  let submergedFor=0,waterRecoverySent=false,shownSpeed=-1,shownGear='';
  function animate(now: number) {
    const scriptStart=performance.now();
    const rawDt=Math.max(0,(now-lastFrame)/1000),dt=Math.min(rawDt,.05);
    lastFrame=now;elapsed+=dt;
    const friend=multiplayer.update(elapsed);
    const paused=mode!=='driving',driving=started&&!paused&&multiplayer.canDrive();
    const measure=driving&&!document.hidden&&document.hasFocus()&&!captureJump;
    if(measure&&measuredPrevious&&rawDt>0){
      const frameMs=rawDt*1000;measuredFrames++;totalFrameMs+=frameMs;
      frameHistogram[Math.min(frameHistogram.length-1,Math.round(frameMs*10))]++;
      totalLogicMs+=lastAnimationPhases.logicMs;totalRenderSubmitMs+=lastAnimationPhases.renderSubmitMs;
      logicHistogram[Math.min(logicHistogram.length-1,Math.round(lastAnimationPhases.logicMs*10))]++;
      renderHistogram[Math.min(renderHistogram.length-1,Math.round(lastAnimationPhases.renderSubmitMs*10))]++;
      if(frameMs>33.5)overBudgetFrames++;
      if(frameMs>=100){stallsOver100Ms++;stallSamples.push({second:elapsed,frameMs,position:drive.state.position.toArray(),previousPhases:{...lastAnimationPhases},heapUsed:(performance as any).memory?.usedJSHeapSize??null,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,visibleTiles:world.group.children.filter(child=>child.userData.worldCell&&Array.isArray(child.userData.worldBounds)&&child.visible).length,programs:renderer.info.programs?.length??null});}
      maxFrameMs=Math.max(maxFrameMs,frameMs);
    }
    measuredPrevious=measure;
    if(mode==='atlas'){
      atlas.updatePlayers(drive.renderState(true),friend,elapsed,false);
      requestAnimationFrame(animate);return;
    }
    if (!paused) {
      input.forward=keys.has('KeyW')||keys.has('ArrowUp'); input.backward=keys.has('KeyS')||keys.has('ArrowDown'); input.left=keys.has('KeyA')||keys.has('ArrowLeft'); input.right=keys.has('KeyD')||keys.has('ArrowRight'); input.handbrake=keys.has('Space');
      input.brake=keys.has('ShiftLeft')||keys.has('ShiftRight');
      if(!captureJump&&multiplayer.canDrive())drive.step(dt,input);
      if(!isSubmerged(drive.state)){submergedFor=0;waterRecoverySent=false;}
      else if(driving&&!captureJump&&!waterRecoverySent&&(submergedFor+=dt)>=.4){
        waterRecoverySent=true;reset(true);
      }
      if (pointer===undefined && elapsed-orbitLast>2.5) { orbit.yaw=THREE.MathUtils.damp(orbit.yaw,0,1.5,dt);orbit.pitch=THREE.MathUtils.damp(orbit.pitch,GT_ORBIT.pitch,1,dt); }
    }
    const state = drive.renderState(captureJump);
    atlas.updatePlayers(state,friend,elapsed,started&&!paused);
    car.group.position.copy(state.position);
    if(!state.airborne)car.group.position.y+=(world.visualHeight?.(state.position.x,state.position.z)??state.position.y)-(world.surfaceHeight??world.groundHeight)(state.position.x,state.position.z);
    car.group.rotation.set(state.pitch,state.heading,0,'YXZ');
    car.update(paused?0:state.speed,state.steering,paused?0:state.throttle,state.braking,elapsed,lighting==='golden'?0:lighting==='night'?1:.5);
    if (!started) {
      const a = Math.sin(elapsed*.06)*.07;
      camera.position.set(state.position.x+5.1+Math.sin(a)*1.2,state.position.y+1.95,state.position.z+5.6);
      camera.lookAt(state.position.x-2.35,state.position.y+1.0,state.position.z+.10);
    } else if(captureJump){camera.position.set(-81,17,24);camera.lookAt(-101,3,0);} else {
      interiorBlend=THREE.MathUtils.damp(interiorBlend,insideGallery(state.position.x,state.position.z)?1:0,2.5,dt);
      chase.update(dt,state,mode==='photo'?orbit:{...orbit,distance:THREE.MathUtils.lerp(orbit.distance,Math.min(orbit.distance,6.8),interiorBlend),pitch:THREE.MathUtils.lerp(orbit.pitch,.25,interiorBlend*.55)});
    }
    contacts.update(state);scenery.update(state.position,elapsed);
    const district=districtAt(state.position.x,state.position.z).name;
    if(started&&!lastDistrict){candidateDistrict=lastDistrict=district;districtUntil=elapsed+4;$('district-label').textContent=district;}
    if(candidateDistrict!==district){candidateDistrict=district;districtSince=elapsed;}
    if(started&&lastDistrict!==candidateDistrict&&elapsed-districtSince>.9){
      lastDistrict=candidateDistrict;districtUntil=elapsed+4;$('district-label').textContent=lastDistrict;
    }
    $('district-label').classList.toggle('visible',elapsed<districtUntil);
    car.group.traverse(o=>{if(o instanceof THREE.Mesh){for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof THREE.MeshPhysicalMaterial)m.envMap=quality==='high'&&interiorBlend>.8?interiorEnvironment.texture:null;}});
    const targetFov=started?55+7*THREE.MathUtils.smoothstep(Math.abs(state.speed),12,34):42;
    camera.fov=THREE.MathUtils.damp(camera.fov,targetFov,3,dt);camera.updateProjectionMatrix();
    sky.position.copy(camera.position);skyUniforms.cloudClock.value=elapsed;
    stars.position.copy(camera.position);
    sun.target.position.copy(state.position);
    sun.position.copy(state.position).addScaledVector(sunDirection,180);
    world.update(elapsed,lighting,state.position);
    audio.update(state,dt);
    const speed=Math.round(Math.abs(state.speed)*3.6),gear=Math.abs(state.speed)<.1?'P':state.speed<0?'R':'D';
    if(speed!==shownSpeed){shownSpeed=speed;$('speed').textContent=String(speed);}
    if(gear!==shownGear){shownGear=gear;$('gear').textContent=gear;}
    const fill=Math.min(100,Math.abs(state.speed)/VEHICLE.topSpeed*100).toFixed(1)+'%';
    if($('speed-fill').dataset.fill!==fill){$('speed-fill').dataset.fill=fill;$('speed-fill').style.width=fill;}
    const renderStart=performance.now();lastAnimationPhases.logicMs=renderStart-scriptStart;
    renderer.info.reset();
    if (bloom.enabled||ao.enabled) composer.render(); else renderer.render(scene,camera);
    const renderEnd=performance.now();lastAnimationPhases.renderSubmitMs=renderEnd-renderStart;lastAnimationPhases.totalScriptMs=renderEnd-scriptStart;
    canvas.dataset.ready = 'true';
    requestAnimationFrame(animate);
  }
  progress(.82,'Lighting the evening');await library.environment(renderer,'golden').then(e=>scene.environment=e.texture).catch(()=>{});
  progress(.88,'Planting the districts');await scenery.remaining();
  progress(.94,'Preparing the first view');
  let gpuWarmup:{drawCalls:number;triangles:number;visibleTiles:number;sceneryBatches:number;programs:number|null}|null=null;
  const initialCamera={position:camera.position.clone(),quaternion:camera.quaternion.clone(),fov:camera.fov,aspect:camera.aspect,near:camera.near,far:camera.far},shadowsEnabled=renderer.shadowMap.enabled,restoreScenery=scenery.warmupVisibility();
  const shadowCamera=sun.shadow.camera as THREE.OrthographicCamera,initialShadowBounds={left:shadowCamera.left,right:shadowCamera.right,top:shadowCamera.top,bottom:shadowCamera.bottom,near:shadowCamera.near,far:shadowCamera.far},initialSunPosition=sun.position.clone(),initialSunTarget=sun.target.position.clone();
  try{
    camera.position.set(665,4200,-275);camera.lookAt(665,0,-275);camera.fov=70;camera.near=.1;camera.far=10000;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    // Warm the real shadow path across the county so first entry into a new
    // district does not lazily compile its shadow materials during driving.
    sun.target.position.set(500,0,0);sun.position.copy(sun.target.position).addScaledVector(sunDirection,180);
    shadowCamera.left=-1600;shadowCamera.right=1600;shadowCamera.top=1600;shadowCamera.bottom=-1600;shadowCamera.near=1;shadowCamera.far=4000;shadowCamera.updateProjectionMatrix();sun.updateMatrixWorld(true);sun.target.updateMatrixWorld(true);renderer.shadowMap.needsUpdate=true;sun.shadow.needsUpdate=true;
    await renderer.compileAsync(scene,camera);
    renderer.info.reset();if(bloom.enabled||ao.enabled)composer.render();else renderer.render(scene,camera);
    // Warm both light counts. The first render uses the full local light pool
    // for interiors and dusk. Outdoor daylight has no active local lights.
    world.update(0,'golden',drive.state.position);
    if(bloom.enabled||ao.enabled)composer.render();else renderer.render(scene,camera);
    gpuWarmup={drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,visibleTiles:world.group.children.filter(child=>child.userData.worldCell&&Array.isArray(child.userData.worldBounds)&&child.visible).length,sceneryBatches:scenery.root.userData.batches??0,programs:renderer.info.programs?.length??null};
  }finally{
    shadowCamera.left=initialShadowBounds.left;shadowCamera.right=initialShadowBounds.right;shadowCamera.top=initialShadowBounds.top;shadowCamera.bottom=initialShadowBounds.bottom;shadowCamera.near=initialShadowBounds.near;shadowCamera.far=initialShadowBounds.far;shadowCamera.updateProjectionMatrix();sun.position.copy(initialSunPosition);sun.target.position.copy(initialSunTarget);sun.updateMatrixWorld(true);sun.target.updateMatrixWorld(true);renderer.shadowMap.needsUpdate=true;sun.shadow.needsUpdate=true;
    renderer.shadowMap.enabled=shadowsEnabled;camera.position.copy(initialCamera.position);camera.quaternion.copy(initialCamera.quaternion);camera.fov=initialCamera.fov;camera.aspect=initialCamera.aspect;camera.near=initialCamera.near;camera.far=initialCamera.far;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);restoreScenery();
  }
  await new Promise(resolve=>requestAnimationFrame(resolve));
  animate(performance.now());
  opening.ready();
  THREE.DefaultLoadingManager.setURLModifier(url=>url);
  downloads.release();
  void multiplayer.init();
  if (new URLSearchParams(location.search).has('qa')) {
    const params = new URLSearchParams(location.search);
    const report = document.createElement('script'); report.id='qa-report'; report.type='application/json'; document.body.append(report);
    let benchmark: unknown;
    let routeChecks: unknown;
    (window as any).__SUNSPOKE__ = {
      drive, world, car, camera, renderer, audio, input, multiplayer,
      pause: setPaused, light: applyLighting, quality: applyQuality,
      teleport(x:number,z:number,heading=0) { stateTeleport(x,z,heading); },
      stats() { return {...timings(),build:catalog.mapVersion,width:innerWidth,height:innerHeight,devicePixelRatio,renderWidth:canvas.width,renderHeight:canvas.height,quality,lighting,paused:mode!=='driving',renderer:gpu,assets:library.errors.slice(),phases:{...lastAnimationPhases},heapUsed:(performance as any).memory?.usedJSHeapSize??null,airborne:drive.state.airborne,verticalSpeed:drive.state.verticalSpeed,pitch:drive.state.pitch,captureJump,stunt:world.group.getObjectByName('RAMP TIME stunt compound')?.userData,cityArea:world.group.userData.cityArea,beachgoers:world.group.getObjectByName('Adult beachgoers')?.userData,scenery:{loaded:scenery.root.userData.loaded?.length??0,total:scenery.root.userData.total??0,batches:scenery.root.userData.batches??0},warmup:gpuWarmup,programs:renderer.info.programs?.length??null,rendering:world.group.userData.rendering??null,visibleStaticTiles:world.group.children.filter(child=>child.userData.worldCell&&Array.isArray(child.userData.worldBounds)&&child.visible).length,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,speed:drive.state.speed,heading:drive.state.heading,steering:drive.state.steering,position:drive.state.position.toArray(),audioState:(audio as any).ctx?.state,audioGain:(audio as any).master?.gain.value}; },
      clearStats
    };
    function stateTeleport(x:number,z:number,heading:number) { drive.reset();drive.state.position.set(x,(world.surfaceHeight??world.groundHeight)(x,z),z);drive.state.heading=heading; }
    if (params.get('quality') && params.get('quality')! in presets) applyQuality(params.get('quality') as Quality);
    const view = params.get('view');
    if (view) { const poses:Record<string,number[]>={gallery:[930,-865,0],interior:[930,-950,0],verde:[370,-800,0],bridge:[675,-752,-Math.PI/2],skyline:[1120,-780,Math.PI],stunt:[5,0,Math.PI/2],runup:[-101,82,0],jump:[-101,82,0],downtown:[720,220,0],canals:[1030,200,0],airport:[180,390,0],port:[900,600,0],island:[200,905,Math.PI/2],hills:[620,-960,Math.PI],lake:[1190,-640,Math.PI],beach:[-65,110,0],crowd:[-99,100,Math.PI/2],quarter:[263,160,Math.PI/2],highway:[-65,110,0],casino:[-65,145,0],headland:[-65,-252,Math.PI],inland:[180,-85,Math.PI]};const p=poses[view]||poses.beach;stateTeleport(p[0],p[1],p[2]);if(view==='highway'){for(let i=0;i<480;i++)drive.step(1/60,{forward:true,backward:false,left:false,right:false,handbrake:false});drive.state.position.set(p[0],world.groundHeight(p[0],p[1]),p[1]);}if(view==='jump'&&params.has('capture')){for(let i=0;i<600;i++){drive.step(1/60,{forward:true,backward:false,left:false,right:false,handbrake:false});if(drive.state.airborne&&drive.state.position.z<0)break;}captureJump=true;}started=true;$('opening').hidden=true;setPaused(false); }
    if(params.has('map'))toggleAtlas();
    const time = params.get('time');if (time==='night'||time==='twilight')applyLighting(time);
    window.setInterval(()=>{report.textContent=JSON.stringify({...((window as any).__SUNSPOKE__.stats()),visibility:document.visibilityState,benchmark,routeChecks});},500);
    if(params.has('routes')) import('./qa').then(({validateRoads})=>{routeChecks=validateRoads(world);});
    if(params.has('benchmark')) window.setTimeout(()=>{
      const times:number[]=[];
      renderer.info.reset();for(let i=0;i<65;i++) { const start=performance.now();if(bloom.enabled)composer.render();else renderer.render(scene,camera);gl.finish();if(i>=5)times.push(performance.now()-start); }renderer.info.reset();
      times.sort((a,b)=>a-b);benchmark={frames:times.length,medianMs:times[30],p95Ms:times[57],meanMs:times.reduce((a,b)=>a+b,0)/times.length};
      report.textContent=JSON.stringify({...((window as any).__SUNSPOKE__.stats()),visibility:document.visibilityState,benchmark,routeChecks});
      report.dataset.benchDone = 'true';
    },1500);
  }
}
