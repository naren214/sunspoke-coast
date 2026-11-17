import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createWorld } from './world';
import { CountyAtlas } from './atlas';
import { createCar } from './car';
import { Driving, ChaseCamera } from './driving';
import { GameAudio } from './audio';
import type { Lighting, Quality } from './types';
import {AssetLibrary,createImportedScenery} from './assets';
import {loadBakedWorld} from './world-cache';
import {VISUAL_QUALITY,createContactShadows,createOutdoorEnvironment} from './visuals';
import {insideGallery,WATERS} from './geography';
import {districtAt} from './districts';
import {MultiplayerGame} from './multiplayer-game';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const clamp = THREE.MathUtils.clamp;
const keys = new Set<string>();
const qaView = new URLSearchParams(location.search).has('qa') && new URLSearchParams(location.search).has('view');
let paused = true;
let started = false;
let lighting: Lighting = 'golden';
let quality: Quality = 'low';
let volume = .45;
let showControls = true;
let lastFrame = performance.now();
let elapsed = 0;
let orbitLast = 0;
let dragging = false;
const orbit = { yaw: 0, pitch: .34, distance: 8.2 };
const frameTimes: number[] = [];


const presets=VISUAL_QUALITY;

async function boot() {
  const renderer = new THREE.WebGLRenderer({ canvas: $('scene') as HTMLCanvasElement, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#e9be94', .00145);
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, .2, 1800);
  let loadingFraction=0;
  const progress=(fraction:number,label:string)=>{if(fraction<loadingFraction)return;loadingFraction=fraction;$('loading-status').textContent=label;$('loading-fill').style.width=`${Math.round(fraction*100)}%`;};
  progress(.02,'Loading Sunspoke Coast');await new Promise(resolve=>requestAnimationFrame(resolve));
  const library=new AssetLibrary();
  await Promise.all([document.fonts.load('190px CoastSignature'),document.fonts.load('900 245px Barlow'),library.init()]);
  const baked=await loadBakedWorld(progress);
  const world = createWorld(baked);
  const scenery=createImportedScenery(world.group,library,world.group.userData.placements??[]);
  const atlas=new CountyAtlas(world);
  let atlasOpen=false,resumeAfterAtlas=false,photoMode=false,resumeAfterPhoto=false;
  let interiorBlend=0,lastDistrict='',districtUntil=0;
  const car = createCar();
  scene.add(world.group, car.group);
  const contacts=createContactShadows(scene,world);
  await Promise.all([world.loadAssets?.(),car.loadAssets((loaded,total)=>progress(.42+.1*loaded/total,'Detailing the Cayenne'),true),library.applySurfaces(world.group,f=>progress(.52+.12*f,'Finishing the streets')),scenery.essential(f=>progress(.64+.12*f,'Planting the coast'))]);
  const drive = new Driving(world);
  const chase = new ChaseCamera(camera, world);
  const audio = new GameAudio();
  const multiplayer=new MultiplayerGame({world,scene,drive,car,atlas,paused:()=>paused,lighting:()=>lighting,light:applyLighting,beginRace:()=>{if(!started)return false;if(atlasOpen){atlasOpen=false;atlas.close();}if(photoMode){photoMode=false;$('photo-mode').hidden=true;}setPaused(false);return true;},teleported:()=>{keys.clear();orbit.yaw=0;orbitLast=elapsed;},toast});
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
  const fill = new THREE.DirectionalLight('#81cbdf', .5);
  fill.position.set(120, 80, 80);
  scene.add(fill);
  const outdoor={golden:createOutdoorEnvironment(renderer,'golden'),twilight:createOutdoorEnvironment(renderer,'twilight'),night:createOutdoorEnvironment(renderer,'night')};
  const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),interiorEnvironment=pmrem.fromScene(room,.04);room.dispose();pmrem.dispose();
  scene.environment=outdoor.golden.texture;scene.environmentIntensity=.6;

  const skyUniforms = { cloudClock:{value:0}, top: { value: new THREE.Color('#619cb6') }, middle: { value: new THREE.Color('#f1bb96') }, bottom: { value: new THREE.Color('#e8c0a2') }, sunDirection: { value: new THREE.Vector3(-.9, .24, -.36).normalize() }, sunColor: { value: new THREE.Color('#ffddb0') }, sunStrength: { value: 1 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 20), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: skyUniforms, vertexShader: 'varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}', fragmentShader: 'varying vec3 vDirection;uniform float cloudClock;uniform vec3 top;uniform vec3 middle;uniform vec3 bottom;uniform vec3 sunDirection;uniform vec3 sunColor;uniform float sunStrength;void main(){vec3 d=normalize(vDirection);float h=max(0.0,d.y);vec3 col=mix(bottom,middle,smoothstep(-.08,.05,d.y));col=mix(col,top,pow(h,.5));float band=smoothstep(.08,.18,d.y)*(1.-smoothstep(.5,.8,d.y));float cloud=pow(max(0.,sin(d.x*25.+d.z*8.+cloudClock*.004)*.3+sin(d.z*18.-d.x*9.-cloudClock*.003)*.25+.4),5.)*band;col=mix(col,middle+vec3(.07),cloud*.25);float s=max(0.0,dot(d,sunDirection));col+=sunColor*pow(s,18.0)*.15*sunStrength;col+=sunColor*smoothstep(.9994,.9998,s)*2.5*sunStrength;gl_FragColor=vec4(col,1.0);}' }));
  scene.add(sky);
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
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .22, .35, 1.15);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function resize() {
    renderer.setPixelRatio(Math.min(devicePixelRatio, presets[quality].pixel));
    renderer.setSize(innerWidth, innerHeight);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(innerWidth, innerHeight);
    ao.setSize(Math.round(innerWidth*renderer.getPixelRatio()/2),Math.round(innerHeight*renderer.getPixelRatio()/2));
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  function applyQuality(next: Quality) {
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
    document.querySelectorAll('#quality button').forEach(b=>b.classList.toggle('selected',(b as HTMLElement).dataset.value===next));
  }
  function applyLighting(next: Lighting) {
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
    document.querySelectorAll('#lighting button').forEach(b => b.classList.toggle('selected', (b as HTMLElement).dataset.value === next));
  }
  function persist() { try { localStorage.setItem('sunspoke-settings', JSON.stringify({quality, lighting, volume, showControls})); } catch {} }
  try { const saved = JSON.parse(localStorage.getItem('sunspoke-settings') || '{}'); if (saved.quality in presets) quality = saved.quality; if (typeof saved.volume === 'number') volume = clamp(saved.volume, 0, 1); if (typeof saved.showControls === 'boolean') showControls = saved.showControls; } catch {}
  applyQuality(quality);
  applyLighting('golden');
  audio.setVolume(volume);
  ($('volume') as HTMLInputElement).value = String(volume * 100);
  ($('controls-toggle') as HTMLInputElement).checked = showControls;
  document.querySelectorAll('#quality button').forEach(b => b.classList.toggle('selected', (b as HTMLElement).dataset.value === quality));
  function setPaused(next: boolean) {
    paused = next; keys.clear(); dragging = false; lastFrame = performance.now();
    $('pause').hidden = !next || !started || atlasOpen || photoMode;
    $('hud').hidden = next || !started;
    $('hint').hidden = !showControls;
    audio.setPaused(next);
    if (next && started) $('resume').focus();
    else ($('scene') as HTMLCanvasElement).focus();
  }
  $('drive').onclick = async () => {
    started = true;
    $('opening').hidden = true;
    try { await audio.start(); } catch { toast('Audio is unavailable. You can keep driving.'); }
    audio.setVolume(volume);
    setPaused(false);void car.loadAssets();
  };
  function toggleAtlas(){
    if(!started)return;
    if(atlasOpen){atlasOpen=false;atlas.close();setPaused(!resumeAfterAtlas);}
    else{resumeAfterAtlas=!paused;atlasOpen=true;setPaused(true);atlas.open(drive.renderState(true));}
  }
  function togglePhoto(){
    if(!started||atlasOpen)return;
    if(photoMode){photoMode=false;$('photo-mode').hidden=true;setPaused(!resumeAfterPhoto);}
    else{resumeAfterPhoto=!paused;photoMode=true;setPaused(true);$('photo-mode').hidden=false;$('capture-photo').focus();}
  }
  $('open-photo').onclick=togglePhoto;$('close-photo').onclick=togglePhoto;
  $('capture-photo').onclick=()=>{
    const previousAspect=camera.aspect;camera.aspect=16/9;camera.updateProjectionMatrix();renderer.setPixelRatio(1);renderer.setSize(1920,1080,false);composer.setPixelRatio(1);composer.setSize(1920,1080);ao.setSize(960,540);
    if(bloom.enabled||ao.enabled)composer.render();else renderer.render(scene,camera);
    const copy=document.createElement('canvas');copy.width=1920;copy.height=1080;copy.getContext('2d')!.drawImage(renderer.domElement,0,0);camera.aspect=previousAspect;resize();
    copy.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='Sunspoke-Coast-Photo.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);});
  };
  $('performance-report').onclick=()=>{
    const sorted=[...frameTimes].sort((a,b)=>a-b),data={build:'visual-overhaul',quality,lighting,viewport:[innerWidth,innerHeight],internal:[canvas.width,canvas.height],seconds:frameTimes.reduce((a,b)=>a+b,0)/1000,frames:frameTimes.length,fps:1000/(frameTimes.reduce((a,b)=>a+b,0)/Math.max(1,frameTimes.length)),medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],assets:library.errors,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,userAgent:navigator.userAgent};
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='Sunspoke-Performance.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
  };
  $('close-map').onclick=toggleAtlas;$('open-map').onclick=toggleAtlas;
  $('pause-button').onclick = () => setPaused(true);
  $('resume').onclick = () => setPaused(false);
  function reset() { if(!multiplayer.reset())drive.reset(); orbit.yaw = 0; orbit.pitch = .34; orbit.distance = 8.2; toast('Back on the coast road'); }
  $('reset').onclick = () => { reset(); setPaused(false); };
  $('hide-hint').onclick = () => { showControls = false; $('hint').hidden = true; ($('controls-toggle') as HTMLInputElement).checked = false; persist(); };
  $('controls-toggle').onchange = e => { showControls = (e.target as HTMLInputElement).checked; persist(); };
  $('volume').oninput = e => { volume = Number((e.target as HTMLInputElement).value) / 100; audio.setVolume(volume); persist(); };
  document.querySelectorAll('#lighting button').forEach(button => button.addEventListener('click', () => { applyLighting((button as HTMLElement).dataset.value as Lighting); multiplayer.setLighting(lighting); persist(); }));
  document.querySelectorAll('#quality button').forEach(button => button.addEventListener('click', () => { applyQuality((button as HTMLElement).dataset.value as Quality); document.querySelectorAll('#quality button').forEach(b => b.classList.toggle('selected', b === button)); persist(); }));
  const drivingKeys = ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','Space','ShiftLeft','ShiftRight','KeyR','KeyM','F2','Escape'];
  window.addEventListener('keydown', e => {
    if (!drivingKeys.includes(e.code)) return;
    if(e.code==='F2'&&started&&!e.repeat){e.preventDefault();togglePhoto();return;}
    if(e.code==='Escape'&&photoMode&&!e.repeat){e.preventDefault();togglePhoto();return;}
    if(photoMode)return;
    if(e.code==='KeyM'&&started&&!e.repeat){e.preventDefault();toggleAtlas();return;}
    if(e.code==='Escape'&&atlasOpen&&!e.repeat){e.preventDefault();toggleAtlas();return;}
    if(atlasOpen)return;
    if ((e.target as HTMLElement)?.matches('input,button') && e.code !== 'Escape' && paused) return;
    e.preventDefault();
    if (e.code === 'Escape' && started && !e.repeat) { setPaused(!paused); return; }
    if (paused) return;
    if (e.repeat) return;
    if (e.code === 'KeyR' && !e.repeat) reset();
    keys.add(e.code);
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => { if (started && !qaView) {if(atlasOpen)resumeAfterAtlas=false;setPaused(true);} });
  document.addEventListener('visibilitychange', () => { if (document.hidden && started && !qaView) setPaused(true); });
  const canvas = $('scene') as HTMLCanvasElement;
  canvas.tabIndex = 0;
  let oldX = 0; let oldY = 0;
  canvas.addEventListener('pointerdown', e => { if (paused&&!photoMode) return; dragging = true; oldX=e.clientX; oldY=e.clientY; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => { if (!dragging) return; orbit.yaw -= (e.clientX-oldX)*.005; orbit.pitch = clamp(orbit.pitch+(e.clientY-oldY)*.004,.12,.9); oldX=e.clientX;oldY=e.clientY;orbitLast=elapsed; });
  canvas.addEventListener('pointerup', () => { dragging=false;orbitLast=elapsed; });
  canvas.addEventListener('pointercancel', () => dragging=false);
  canvas.addEventListener('wheel', e => { if (paused&&!photoMode) return; e.preventDefault(); orbit.distance=clamp(orbit.distance+e.deltaY*.012,5.5,18);orbitLast=elapsed; }, { passive:false });
  window.addEventListener('resize', resize);
  let toastTimer = 0;
  function toast(text: string) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = window.setTimeout(()=>$('toast').hidden=true,2400); }
  let captureJump=false;
  const input = { forward:false,backward:false,left:false,right:false,handbrake:false,brake:false };
  const sunDirection = new THREE.Vector3(-.9,.24,-.36).normalize();
  let fpsStart = performance.now();
  let fpsFrames = 0;
  let measuredFps = 0;
  function animate(now: number) {
    requestAnimationFrame(animate);
    const rawDt = (now-lastFrame)/1000;
    const dt = Math.min(rawDt,.05);
    lastFrame = now;
    elapsed += dt;
    if (!document.hidden) {
      if(!paused&&rawDt>0)frameTimes.push(rawDt*1000); if (frameTimes.length>60000) frameTimes.shift();
      fpsFrames++; if (now-fpsStart>1000) { measuredFps=fpsFrames*1000/(now-fpsStart);fpsStart=now;fpsFrames=0; }
    }
    multiplayer.update(elapsed);
    if(atlasOpen){canvas.dataset.ready='true';return;}
    if (!paused) {
      input.forward=keys.has('KeyW')||keys.has('ArrowUp'); input.backward=keys.has('KeyS')||keys.has('ArrowDown'); input.left=keys.has('KeyA')||keys.has('ArrowLeft'); input.right=keys.has('KeyD')||keys.has('ArrowRight'); input.handbrake=keys.has('Space');
      input.brake=keys.has('ShiftLeft')||keys.has('ShiftRight');
      if(!captureJump&&multiplayer.canDrive())drive.step(dt,input);
      if (!dragging && elapsed-orbitLast>2.5) { orbit.yaw=THREE.MathUtils.damp(orbit.yaw,0,1.5,dt);orbit.pitch=THREE.MathUtils.damp(orbit.pitch,.34,1,dt); }
    }
    const state = drive.renderState(captureJump);
    car.group.position.copy(state.position);
    if(!state.airborne)car.group.position.y+=(world.visualHeight?.(state.position.x,state.position.z)??state.position.y)-(world.surfaceHeight??world.groundHeight)(state.position.x,state.position.z);
    car.group.rotation.set(state.pitch,state.heading,0,'YXZ');
    car.update(paused?0:state.speed,state.steering,paused?0:state.throttle,state.braking,elapsed,lighting==='golden'?0:lighting==='night'?1:.5);
    if (!started) {
      const a = Math.sin(elapsed*.06)*.07;
      camera.position.set(-72+Math.sin(a)*3,3.5,217);
      camera.lookAt(-61,1.1,202);
    } else if(captureJump){camera.position.set(-81,17,24);camera.lookAt(-101,3,0);} else {
      interiorBlend=THREE.MathUtils.damp(interiorBlend,insideGallery(state.position.x,state.position.z)?1:0,2.5,dt);
      chase.update(dt,state,photoMode?orbit:{...orbit,distance:THREE.MathUtils.lerp(orbit.distance,Math.min(orbit.distance,6.8),interiorBlend),pitch:THREE.MathUtils.lerp(orbit.pitch,.25,interiorBlend*.55)});
    }
    contacts.update(state);scenery.update(state.position,elapsed);
    const district=districtAt(state.position.x,state.position.z).name;if(district!==lastDistrict){lastDistrict=district;districtUntil=elapsed+3.8;$('district-label').textContent=district;}$('district-label').classList.toggle('visible',elapsed<districtUntil);
    car.group.traverse(o=>{if(o instanceof THREE.Mesh){for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof THREE.MeshPhysicalMaterial)m.envMap=quality==='high'&&interiorBlend>.8?interiorEnvironment.texture:null;}});
    const targetFov=55+7*THREE.MathUtils.smoothstep(Math.abs(state.speed),12,34);
    camera.fov=THREE.MathUtils.damp(camera.fov,targetFov,3,dt);camera.updateProjectionMatrix();
    sky.position.copy(camera.position);skyUniforms.cloudClock.value=elapsed;
    stars.position.copy(camera.position);
    sun.target.position.copy(state.position);
    sun.position.copy(state.position).addScaledVector(sunDirection,180);
    world.update(elapsed,lighting,state.position);
    audio.update(state,dt);
    $('speed').textContent = String(Math.round(Math.abs(state.speed)*3.6));
    $('gear').textContent = Math.abs(state.speed)<.1?'P':state.speed<0?'R':'D';
    $('speed-fill').style.width = `${Math.min(100,Math.abs(state.speed)/32*100)}%`;
    if (bloom.enabled||ao.enabled) composer.render(); else renderer.render(scene,camera);
    canvas.dataset.ready = 'true';
  }
  progress(.82,'Lighting the evening');await library.environment(renderer,'golden').then(e=>scene.environment=e.texture).catch(()=>{});
  progress(.92,'Preparing the first view');await renderer.compileAsync(scene,camera);
  progress(1,'Ready when you are');$('loading-progress').hidden=true;
  $('drive').innerHTML = 'Drive <span>↗</span>';
  ($('drive') as HTMLButtonElement).disabled = false;
  requestAnimationFrame(animate);void scenery.remaining();void multiplayer.init();
  if (new URLSearchParams(location.search).has('qa')) {
    const params = new URLSearchParams(location.search);
    const report = document.createElement('script'); report.id='qa-report'; report.type='application/json'; document.body.append(report);
    let benchmark: unknown;
    let routeChecks: unknown;
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    (window as any).__SUNSPOKE__ = {
      drive, world, car, camera, renderer, audio, input, multiplayer,
      pause: setPaused, light: applyLighting, quality: applyQuality,
      teleport(x:number,z:number,heading=0) { stateTeleport(x,z,heading); },
      stats() { const sorted=[...frameTimes].sort((a,b)=>a-b);return {fps:measuredFps,medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],frames:sorted.length,width:innerWidth,height:innerHeight,renderWidth:canvas.width,renderHeight:canvas.height,quality,lighting,paused,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),airborne:drive.state.airborne,verticalSpeed:drive.state.verticalSpeed,pitch:drive.state.pitch,captureJump,stunt:world.group.getObjectByName('RAMP TIME stunt compound')?.userData,cityArea:world.group.userData.cityArea,beachgoers:world.group.getObjectByName('Adult beachgoers')?.userData,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,speed:drive.state.speed,heading:drive.state.heading,steering:drive.state.steering,position:drive.state.position.toArray(),audioState:(audio as any).ctx?.state,audioGain:(audio as any).master?.gain.value}; },
      clearStats() { frameTimes.length=0;fpsFrames=0;fpsStart=performance.now(); }
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
      for(let i=0;i<65;i++) { const start=performance.now();if(bloom.enabled)composer.render();else renderer.render(scene,camera);gl.finish();if(i>=5)times.push(performance.now()-start); }
      times.sort((a,b)=>a-b);benchmark={frames:times.length,medianMs:times[30],p95Ms:times[57],meanMs:times.reduce((a,b)=>a+b,0)/times.length};
      report.textContent=JSON.stringify({...((window as any).__SUNSPOKE__.stats()),visibility:document.visibilityState,benchmark,routeChecks});
      report.dataset.benchDone = 'true';
    },1500);
  }
}
boot().catch(error => { console.error(error); $('opening').hidden=true; $('error').hidden=false; $('error-message').textContent = `The 3D scene could not start. ${error instanceof Error ? error.message : String(error)}. Try an up-to-date desktop browser with hardware acceleration enabled.`; });
