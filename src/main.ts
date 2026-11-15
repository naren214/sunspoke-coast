import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createWorld } from './world';
import { createCar } from './car';
import { Driving, ChaseCamera } from './driving';
import { GameAudio } from './audio';
import type { Lighting, Quality } from './types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const clamp = THREE.MathUtils.clamp;
const keys = new Set<string>();
const qaView = new URLSearchParams(location.search).has('qa') && new URLSearchParams(location.search).has('view');
let paused = true;
let started = false;
let lighting: Lighting = 'golden';
let quality: Quality = 'medium';
let volume = .45;
let showControls = true;
let accumulator = 0;
let lastFrame = performance.now();
let elapsed = 0;
let orbitLast = 0;
let dragging = false;
const orbit = { yaw: 0, pitch: .34, distance: 9.5 };
const frameTimes: number[] = [];
const presets = { low: { pixel: 1, shadow: 1024, bloom: false }, medium: { pixel: 1, shadow: 2048, bloom: true }, high: { pixel: 1.5, shadow: 2048, bloom: true } };

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
  const world = createWorld();
  await document.fonts.load('190px CoastSignature');
  const car = createCar();
  scene.add(world.group, car.group);
  const drive = new Driving(world);
  const chase = new ChaseCamera(camera, world);
  const audio = new GameAudio();
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
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .03);
  scene.environment = environment.texture;
  room.dispose();
  pmrem.dispose();
  scene.environmentIntensity = .7;

  const skyUniforms = { top: { value: new THREE.Color('#619cb6') }, middle: { value: new THREE.Color('#f1bb96') }, bottom: { value: new THREE.Color('#e8c0a2') }, sunDirection: { value: new THREE.Vector3(-.9, .24, -.36).normalize() }, sunColor: { value: new THREE.Color('#ffddb0') }, sunStrength: { value: 1 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 20), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: skyUniforms, vertexShader: 'varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}', fragmentShader: 'varying vec3 vDirection;uniform vec3 top;uniform vec3 middle;uniform vec3 bottom;uniform vec3 sunDirection;uniform vec3 sunColor;uniform float sunStrength;void main(){vec3 d=normalize(vDirection);float h=max(0.0,d.y);vec3 col=mix(bottom,middle,smoothstep(-.08,.05,d.y));col=mix(col,top,pow(h,.5));float s=max(0.0,dot(d,sunDirection));col+=sunColor*pow(s,18.0)*.15*sunStrength;col+=sunColor*smoothstep(.9994,.9998,s)*2.5*sunStrength;gl_FragColor=vec4(col,1.0);}' }));
  scene.add(sky);
  const starGeometry = new THREE.BufferGeometry();
  const starPositions = [];
  for (let i = 0; i < 500; i++) { const y = .12 + (i * .61803398875 % 1) * .85; const a = i * 2.399963; const r = Math.sqrt(1 - y * y); starPositions.push(Math.cos(a) * r * 1000, y * 1000, Math.sin(a) * r * 1000); }
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ size: 1.35, color: '#c9e5ff', transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true }));
  scene.add(stars);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .22, .35, 1.15);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function resize() {
    renderer.setPixelRatio(Math.min(devicePixelRatio, presets[quality].pixel));
    renderer.setSize(innerWidth, innerHeight);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  function applyQuality(next: Quality) {
    quality = next;
    bloom.enabled = presets[next].bloom;
    sun.shadow.mapSize.setScalar(presets[next].shadow);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    resize();
    document.querySelectorAll('#quality button').forEach(b=>b.classList.toggle('selected',(b as HTMLElement).dataset.value===next));
  }
  function applyLighting(next: Lighting) {
    lighting = next;
    const data = { golden: { top: '#78adc2', mid: '#f4bd98', bottom: '#ecc9a7', fog: '#e9be94', hemi: '#b5d8df', ground: '#b19574', sun: '#ffc994', intensity: 2.7, ambient: .85, env: .55, exposure: .95, skySun: 1 }, twilight: { top: '#354c83', mid: '#dd9ba8', bottom: '#b691ac', fog: '#9e90ae', hemi: '#869ed0', ground: '#74788d', sun: '#f1b2ac', intensity: .75, ambient: 1.35, env: .65, exposure: 1.12, skySun: .4 }, night: { top: '#08152f', mid: '#244064', bottom: '#324d67', fog: '#253d56', hemi: '#7995c2', ground: '#4e6484', sun: '#a9c8ff', intensity: .2, ambient: .3, env: .18, exposure: 1.1, skySun: 0 } }[next];
    skyUniforms.top.value.set(data.top); skyUniforms.middle.value.set(data.mid); skyUniforms.bottom.value.set(data.bottom); skyUniforms.sunStrength.value = data.skySun;
    (scene.fog as THREE.FogExp2).color.set(data.fog);
    (scene.fog as THREE.FogExp2).density = next === 'night' ? .0018 : .00145;
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
    paused = next; keys.clear(); dragging = false; accumulator = 0; lastFrame = performance.now();
    $('pause').hidden = !next || !started;
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
    setPaused(false);
  };
  $('pause-button').onclick = () => setPaused(true);
  $('resume').onclick = () => setPaused(false);
  function reset() { drive.reset(); orbit.yaw = 0; orbit.pitch = .34; orbit.distance = 9.5; toast('Back on the coast road'); }
  $('reset').onclick = () => { reset(); setPaused(false); };
  $('hide-hint').onclick = () => { showControls = false; $('hint').hidden = true; ($('controls-toggle') as HTMLInputElement).checked = false; persist(); };
  $('controls-toggle').onchange = e => { showControls = (e.target as HTMLInputElement).checked; persist(); };
  $('volume').oninput = e => { volume = Number((e.target as HTMLInputElement).value) / 100; audio.setVolume(volume); persist(); };
  document.querySelectorAll('#lighting button').forEach(button => button.addEventListener('click', () => { applyLighting((button as HTMLElement).dataset.value as Lighting); persist(); }));
  document.querySelectorAll('#quality button').forEach(button => button.addEventListener('click', () => { applyQuality((button as HTMLElement).dataset.value as Quality); document.querySelectorAll('#quality button').forEach(b => b.classList.toggle('selected', b === button)); persist(); }));
  const drivingKeys = ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','Space','KeyR','Escape'];
  window.addEventListener('keydown', e => {
    if (!drivingKeys.includes(e.code)) return;
    if ((e.target as HTMLElement)?.matches('input,button') && e.code !== 'Escape' && paused) return;
    e.preventDefault();
    if (e.code === 'Escape' && started && !e.repeat) { setPaused(!paused); return; }
    if (paused) return;
    if (e.repeat) return;
    if (e.code === 'KeyR' && !e.repeat) reset();
    keys.add(e.code);
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => { if (started && !qaView) setPaused(true); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && started && !qaView) setPaused(true); });
  const canvas = $('scene') as HTMLCanvasElement;
  canvas.tabIndex = 0;
  let oldX = 0; let oldY = 0;
  canvas.addEventListener('pointerdown', e => { if (paused) return; dragging = true; oldX=e.clientX; oldY=e.clientY; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => { if (!dragging) return; orbit.yaw -= (e.clientX-oldX)*.005; orbit.pitch = clamp(orbit.pitch+(e.clientY-oldY)*.004,.12,.9); oldX=e.clientX;oldY=e.clientY;orbitLast=elapsed; });
  canvas.addEventListener('pointerup', () => { dragging=false;orbitLast=elapsed; });
  canvas.addEventListener('pointercancel', () => dragging=false);
  canvas.addEventListener('wheel', e => { if (paused) return; e.preventDefault(); orbit.distance=clamp(orbit.distance+e.deltaY*.012,5.5,18);orbitLast=elapsed; }, { passive:false });
  window.addEventListener('resize', resize);
  let toastTimer = 0;
  function toast(text: string) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = window.setTimeout(()=>$('toast').hidden=true,2400); }
  const input = { forward:false,backward:false,left:false,right:false,handbrake:false };
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
      frameTimes.push(rawDt*1000); if (frameTimes.length>1800) frameTimes.shift();
      fpsFrames++; if (now-fpsStart>1000) { measuredFps=fpsFrames*1000/(now-fpsStart);fpsStart=now;fpsFrames=0; }
    }
    if (!paused) {
      input.forward=keys.has('KeyW')||keys.has('ArrowUp'); input.backward=keys.has('KeyS')||keys.has('ArrowDown'); input.left=keys.has('KeyA')||keys.has('ArrowLeft'); input.right=keys.has('KeyD')||keys.has('ArrowRight'); input.handbrake=keys.has('Space');
      accumulator+=dt;
      while (accumulator>=1/60) { drive.step(1/60,input);accumulator-=1/60; }
      if (!dragging && elapsed-orbitLast>2.5) { orbit.yaw=THREE.MathUtils.damp(orbit.yaw,0,1.5,dt);orbit.pitch=THREE.MathUtils.damp(orbit.pitch,.34,1,dt); }
    }
    const state = drive.state;
    car.group.position.copy(state.position);
    const forwardX = Math.sin(state.heading), forwardZ = Math.cos(state.heading);
    const slope = (world.groundHeight(state.position.x-forwardX,state.position.z-forwardZ)-world.groundHeight(state.position.x+forwardX,state.position.z+forwardZ))/2;
    car.group.rotation.set(Math.atan(slope),state.heading,0,'YXZ');
    car.update(paused?0:state.speed,state.steering,paused?0:state.throttle,state.braking,elapsed,lighting==='golden'?0:lighting==='night'?1:.5);
    if (!started) {
      const a = Math.sin(elapsed*.06)*.07;
      camera.position.set(-72+Math.sin(a)*3,3.5,217);
      camera.lookAt(-61,1.1,202);
    } else chase.update(dt,state,orbit);
    sky.position.copy(camera.position);
    stars.position.copy(camera.position);
    sun.target.position.copy(state.position);
    sun.position.copy(state.position).addScaledVector(sunDirection,180);
    world.update(elapsed,lighting,state.position);
    audio.update(state,dt);
    $('speed').textContent = String(Math.round(Math.abs(state.speed)*3.6));
    $('gear').textContent = Math.abs(state.speed)<.1?'P':state.speed<0?'R':'D';
    $('speed-fill').style.width = `${Math.min(100,Math.abs(state.speed)/32*100)}%`;
    if (bloom.enabled) composer.render(); else renderer.render(scene,camera);
    canvas.dataset.ready = 'true';
  }
  await renderer.compileAsync(scene,camera);
  $('drive').innerHTML = 'Drive <span>↗</span>';
  ($('drive') as HTMLButtonElement).disabled = false;
  requestAnimationFrame(animate);
  if (new URLSearchParams(location.search).has('qa')) {
    const params = new URLSearchParams(location.search);
    const report = document.createElement('script'); report.id='qa-report'; report.type='application/json'; document.body.append(report);
    let benchmark: unknown;
    let routeChecks: unknown;
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    (window as any).__SUNSPOKE__ = {
      drive, world, car, camera, renderer, audio, input,
      pause: setPaused, light: applyLighting, quality: applyQuality,
      teleport(x:number,z:number,heading=0) { stateTeleport(x,z,heading); },
      stats() { const sorted=[...frameTimes].sort((a,b)=>a-b);return {fps:measuredFps,medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],frames:sorted.length,width:innerWidth,height:innerHeight,renderWidth:canvas.width,renderHeight:canvas.height,quality,lighting,paused,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,speed:drive.state.speed,heading:drive.state.heading,steering:drive.state.steering,position:drive.state.position.toArray(),audioState:(audio as any).ctx?.state,audioGain:(audio as any).master?.gain.value}; },
      clearStats() { frameTimes.length=0;fpsFrames=0;fpsStart=performance.now(); }
    };
    function stateTeleport(x:number,z:number,heading:number) { drive.state.position.set(x,world.groundHeight(x,z),z);drive.state.heading=heading;drive.state.speed=0;drive.state.steering=0; }
    if (params.get('quality') && params.get('quality')! in presets) applyQuality(params.get('quality') as Quality);
    const view = params.get('view');
    if (view) { const poses:Record<string,number[]>={beach:[-65,110,0],highway:[-65,110,0],casino:[-65,145,0],headland:[-65,-252,Math.PI],inland:[180,-85,Math.PI]};const p=poses[view]||poses.beach;stateTeleport(p[0],p[1],p[2]);if(view==='highway'){for(let i=0;i<480;i++)drive.step(1/60,{forward:true,backward:false,left:false,right:false,handbrake:false});drive.state.position.set(p[0],world.groundHeight(p[0],p[1]),p[1]);}started=true;$('opening').hidden=true;setPaused(false); }
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



