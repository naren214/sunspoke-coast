import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Car, Quality } from "./types";
import { VEHICLE } from "./vehicle.ts";

const sharedCarGeometry=new Map<string,Promise<Map<string,THREE.BufferGeometry>>>();

/** Procedural Cayenne SUV, in metres, facing local -Z. */
export interface CarAppearance {color?:number;label?:string;}
export function createCar(appearance:CarAppearance={}): Car & { setQuality: (quality: Quality) => void; loadAssets: (progress?: (loaded:number,total:number)=>void, essentialOnly?:boolean) => Promise<void> } {
  const group = new THREE.Group();
  group.name = appearance.label??"Porsche Cayenne";
  const body = new THREE.Group();
  body.name="cayenne_body";
  group.add(body);
  const paint = new THREE.MeshPhysicalMaterial({
    color: appearance.color??0x143c40,
    metalness: 0.64,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.15,
  });
  paint.name = "Cayenne midnight-teal clearcoat";
  const sidePaint = paint.clone();
  sidePaint.side = THREE.DoubleSide;
  sidePaint.name = "Sculpted side panels";
  const trim = new THREE.MeshStandardMaterial({
    color: 0x101719,
    roughness: 0.52,
  });
  const chrome = new THREE.MeshStandardMaterial({
    color: 0xaab5b8,
    metalness: 0.92,
    roughness: 0.29,
  });
  const rubber = new THREE.MeshStandardMaterial({
    color: 0x15191b,
    roughness: 0.94,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x75959b,
    metalness: 0.06,
    roughness: 0.09,
    transparent: true,
    opacity: 0.36,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  glass.name = "Neutral solar-control glazing";
  const panorama = glass.clone();
  panorama.color.set(0x2e4b50);
  panorama.opacity = 0.72;
  panorama.name = "Panoramic roof glass";
  const leather = new THREE.MeshStandardMaterial({
    color: 0x855737,
    roughness: 0.83,
  });
  const lens = new THREE.MeshStandardMaterial({
    color: 0x202a30,
    metalness: 0.35,
    roughness: 0.13,
  });
  const tail = new THREE.MeshStandardMaterial({
    color: 0xa70b17,
    emissive: 0xff1724,
    emissiveIntensity: 0.25,
    roughness: 0.2,
  });
  const lamps = new THREE.MeshStandardMaterial({
    color: 0xe4eff2,
    emissive: 0xe8f5ff,
    emissiveIntensity: 0.5,
    roughness: 0.19,
  });
  const caliper = new THREE.MeshStandardMaterial({
    color: 0xa81616,
    metalness: 0.35,
    roughness: 0.4,
  });
  const rotor = new THREE.MeshStandardMaterial({color:0x747e81,metalness:.78,roughness:.52});
  rotor.name = "Brushed brake rotors";
  // One small local texture adds tread cuts without hundreds of extra meshes.
  const treadCanvas=document.createElement("canvas");treadCanvas.width=256;treadCanvas.height=128;
  const treadContext=treadCanvas.getContext("2d")!;
  treadContext.fillStyle="#c5c7c4";treadContext.fillRect(0,0,256,128);
  treadContext.strokeStyle="#555b58";treadContext.lineWidth=2.2;
  for(let i=-2;i<34;i++){
    const x=i*9;treadContext.beginPath();treadContext.moveTo(x,0);treadContext.lineTo(x+9,42);treadContext.lineTo(x-1,84);treadContext.lineTo(x+8,128);treadContext.stroke();
  }
  for(const y of [23,45,82,105]){treadContext.fillStyle="#59605c";treadContext.fillRect(0,y,256,2);}
  const treadTexture=new THREE.CanvasTexture(treadCanvas);treadTexture.wrapS=treadTexture.wrapT=THREE.RepeatWrapping;treadTexture.repeat.set(4,1);treadTexture.anisotropy=4;
  rubber.bumpMap=treadTexture;rubber.bumpScale=.008;
  const mesh = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
    parent: THREE.Object3D = body,
  ) => {
    const item = new THREE.Mesh(geometry, material);
    item.position.set(x, y, z);
    item.castShadow = true;
    item.receiveShadow = true;
    parent.add(item);
    return item;
  };
  const rounded = (
    w: number,
    h: number,
    d: number,
    r: number,
    m: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
    parent: THREE.Object3D = body,
  ) => mesh(new RoundedBoxGeometry(w, h, d, Math.max(w,h,d)>.9&&r>.04?3:1, r), m, x, y, z, parent);
  const tube = (
    points: number[][],
    radius: number,
    material: THREE.Material,
    parent: THREE.Object3D = body,
  ) => {
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(...(p as [number, number, number]))),
    );
    return mesh(
      new THREE.TubeGeometry(
        curve,
        Math.max(8, points.length * 5),
        radius,
        6,
        false,
      ),
      material,
      0,
      0,
      0,
      parent,
    );
  };
  function pane(points: number[][], material: THREE.Material) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(points.flat(), 3),
    );
    const indices: number[] = [];
    for (let i = 1; i < points.length - 1; i++) indices.push(0, i, i + 1);
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return mesh(geometry, material);
  }
  function loft(sections: number[][], material: THREE.Material) {
    // Smooth longitudinal sections and curved shoulders catch broad outdoor
    // reflections instead of reading as flat stacked plates.
    const vertices: number[] = [],
      indices: number[] = [];
    const profile=new THREE.CatmullRomCurve3([[-1,0],[-1,.55],[-.9,.9],[-.58,1],[0,1.025],[.58,1],[.9,.9],[1,.55],[1,0]].map(([x,y])=>new THREE.Vector3(x,y,0)),false,"centripetal");
    const outline=profile.getPoints(24);
    const widths=new THREE.CatmullRomCurve3(sections.map(([z,w,low])=>new THREE.Vector3(z,w,low)),false,"centripetal");
    const crowns=new THREE.CatmullRomCurve3(sections.map(([z,,,high])=>new THREE.Vector3(z,high,0)),false,"centripetal");
    const rows=(sections.length-1)*7,columns=outline.length;
    for(let row=0;row<=rows;row++){
      const p=widths.getPoint(row/rows),c=crowns.getPoint(row/rows);
      for(const cross of outline)vertices.push(cross.x*p.y,p.z+(c.y-p.z)*cross.y,p.x);
    }
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < columns-1; i++) {
        const a = j * columns + i,
          b = a + 1,
          c = a + columns,
          d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    mesh(geometry, material);
  }
  function sculptedSide(side:number){
    const source=new THREE.ShapeGeometry(sideShape,24),flat=source.toNonIndexed(),p=flat.getAttribute("position"),vertices:number[]=[];
    const vertex=(u:number,y:number)=>{
      const height=THREE.MathUtils.clamp((y-.39)/.75,0,1);
      const width=.957+.024*Math.sin(height*Math.PI)+.012*Math.exp(-(((u+1.45)/.62)**2))+.010*Math.exp(-(((u-1.445)/.68)**2));
      vertices.push(u,y,-side*(width-.965));
    };
    for(let i=0;i<p.count;i+=3){
      const a=[p.getX(i),p.getY(i)],b=[p.getX(i+1),p.getY(i+1)],c=[p.getX(i+2),p.getY(i+2)];
      const ab=[(a[0]+b[0])/2,(a[1]+b[1])/2],bc=[(b[0]+c[0])/2,(b[1]+c[1])/2],ca=[(c[0]+a[0])/2,(c[1]+a[1])/2];
      for(const tri of [[a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]])for(const v of tri)vertex(v[0],v[1]);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
    const welded=mergeVertices(geometry,.00001);welded.computeVertexNormals();source.dispose();flat.dispose();geometry.dispose();return welded;
  }
  // Real wheel openings give the flared body its SUV stance.
  const sideShape = new THREE.Shape();
  sideShape.moveTo(-2.39, 0.46);
  sideShape.lineTo(-2.4, 0.82);
  sideShape.quadraticCurveTo(-2.15, 1.05, -1.65, 1.09);
  sideShape.lineTo(-0.9, 1.12);
  sideShape.lineTo(1.63, 1.13);
  sideShape.quadraticCurveTo(2.38, 1.12, 2.42, 0.91);
  sideShape.lineTo(2.4, 0.43);
  sideShape.lineTo(1.905, 0.4);
  sideShape.absarc(1.445, 0.4, 0.46, 0, Math.PI, false);
  sideShape.lineTo(-0.99, 0.4);
  sideShape.absarc(-1.45, 0.4, 0.46, 0, Math.PI, false);
  sideShape.lineTo(-2.39, 0.46);
  for (const side of [-1, 1]) {
    const panel = mesh(
      sculptedSide(side),
      sidePaint,
      side * 0.965,
      0,
      0,
    );
    panel.rotation.y = -Math.PI / 2;
    for (const z of [-1.45, 1.445]) {
      const arch: number[][] = [];
      for (let i = 0; i <= 20; i++) {
        const a = (i / 20) * Math.PI;
        arch.push([
          side * 0.988,
          0.4 + Math.sin(a) * 0.465,
          z + Math.cos(a) * 0.465,
        ]);
      }
      tube(arch, 0.025, paint);
    }
    rounded(0.1, 0.13, 1.91, 0.035, trim, side * 0.965, 0.39, 0.02);
    tube(
      [
        [side * 0.965, 1.01, -1.95],
        [side * 0.997, 1.08, -1.38],
        [side * 0.985, 1.1, 0.6],
        [side * 0.97, 1.08, 2.12],
      ],
      0.018,
      paint,
    );
    // Four doors, flush handles and lower door sculpture.
    for (const z of [-0.91, 0.32, 1.13])
      tube(
        [
          [side * 0.999, 1.06, z],
          [side * 1.001, 0.77, z + 0.05],
          [side * 0.981, 0.46, z + 0.08],
        ],
        0.006,
        trim,
      );
    for (const z of [0.12, 0.96])
      rounded(0.018, 0.027, 0.17, 0.012, chrome, side * 1.003, 1.015, z);
    tube(
      [
        [side * 0.981, 0.52, -0.9],
        [side * 0.993, 0.57, 0.3],
        [side * 0.979, 0.54, 1.0],
      ],
      0.014,
      paint,
    );
  }
  rounded(1.59, 0.22, 4.34, 0.1, trim, 0, 0.43, 0);
  loft(
    [
      [-2.39, 0.75, 0.73, 0.88],
      [-2.17, 0.89, 0.76, 1.02],
      [-1.65, 0.95, 0.81, 1.1],
      [-0.94, 0.9, 0.87, 1.13],
    ],
    paint,
  );
  loft(
    [
      [1.35, 0.9, 0.79, 1.12],
      [1.98, 0.96, 0.74, 1.13],
      [2.4, 0.87, 0.64, 1.02],
    ],
    paint,
  );
  // Broad sculpted bumpers and the Cayenne's three-part front intake.
  rounded(1.82, 0.41, 0.32, 0.13, paint, 0, 0.65, -2.27);
  rounded(1.86, 0.35, 0.28, 0.1, paint, 0, 0.61, 2.29);
  rounded(1.25, 0.27, 0.06, 0.055, trim, 0, 0.61, -2.445);
  for (let i = -3; i <= 3; i++)
    rounded(1.18, 0.014, 0.018, 0.005, lens, 0, 0.61 + i * 0.033, -2.482);
  for (const side of [-1, 1]) {
    rounded(0.28, 0.29, 0.064, 0.065, trim, side * 0.79, 0.63, -2.411);
    for (let j = 0; j < 3; j++)
      rounded(
        0.255,
        0.018,
        0.022,
        0.006,
        lens,
        side * 0.79,
        0.55 + j * 0.067,
        -2.45,
      );
    const housing = rounded(
      0.43,
      0.19,
      0.12,
      0.07,
      lens,
      side * 0.66,
      0.98,
      -2.27,
    );
    housing.rotation.y = side * -0.16;
    // Four-point daytime LEDs sit inside each dark headlamp housing.
    for (const dx of [-0.105, 0.105])
      for (const dy of [-0.046, 0.046])
        rounded(
          0.071,
          0.025,
          0.022,
          0.011,
          lamps,
          side * 0.66 + dx,
          0.98 + dy,
          -2.345,
        );
    tube(
      [
        [side * 0.49, 1.065, -2.15],
        [side * 0.53, 1.115, -1.62],
        [side * 0.62, 1.145, -1.0],
      ],
      0.008,
      paint,
    );
    rounded(0.34, 0.022, 0.05, 0.009, trim, side * 0.73, 0.43, -2.37);
  }
  // Enclosed cabin with raked front and rear glass, a solid roof and panoramic panel.
  pane(
    [
      [-0.86, 1.12, -0.94],
      [0.86, 1.12, -0.94],
      [0.73, 1.64, -0.37],
      [-0.73, 1.64, -0.37],
    ],
    glass,
  );
  pane(
    [
      [-0.76, 1.59, 1.18],
      [0.76, 1.59, 1.18],
      [0.86, 1.15, 2.02],
      [-0.86, 1.15, 2.02],
    ],
    glass,
  );
  for (const side of [-1, 1]) {
    const s = side;
    pane(
      [
        [s * 0.885, 1.12, -0.87],
        [s * 0.74, 1.6, -0.33],
        [s * 0.752, 1.63, 0.27],
        [s * 0.89, 1.12, 0.28],
      ],
      glass,
    );
    pane(
      [
        [s * 0.89, 1.12, 0.36],
        [s * 0.754, 1.63, 0.35],
        [s * 0.77, 1.59, 1.05],
        [s * 0.89, 1.12, 1.19],
      ],
      glass,
    );
    pane(
      [
        [s * 0.89, 1.12, 1.28],
        [s * 0.77, 1.57, 1.14],
        [s * 0.86, 1.16, 1.88],
      ],
      glass,
    );
    tube(
      [
        [s * 0.9, 1.1, -0.95],
        [s * 0.755, 1.63, -0.39],
        [s * 0.75, 1.66, 0.3],
        [s * 0.77, 1.62, 1.17],
        [s * 0.9, 1.1, 2.01],
      ],
      0.038,
      paint,
    );
    tube(
      [
        [s * 0.89, 1.095, -0.91],
        [s * 0.91, 1.095, 0.4],
        [s * 0.89, 1.1, 1.91],
      ],
      0.022,
      chrome,
    );
    tube(
      [
        [s * 0.894, 1.11, 0.32],
        [s * 0.755, 1.65, 0.32],
      ],
      0.035,
      trim,
    );
    tube(
      [
        [s * 0.89, 1.12, 1.23],
        [s * 0.77, 1.6, 1.1],
      ],
      0.032,
      paint,
    );
    tube(
      [
        [s * 0.87, 1.14, -0.77],
        [s * 1.01, 1.23, -0.68],
      ],
      0.027,
      trim,
    );
    rounded(0.21, 0.11, 0.24, 0.052, paint, s * 0.995, 1.235, -0.63);
    rounded(0.16, 0.075, 0.014, 0.019, chrome, s * 0.995, 1.235, -0.503);
    rounded(0.145, 0.012, 0.012, 0.004, lamps, s * 0.995, 1.216, -0.754);
    // Interior remains visible through the front and side glazing.
    rounded(0.56, 0.15, 0.58, 0.075, leather, s * 0.37, 0.72, -0.04);
    const seat = rounded(
      0.56,
      0.56,
      0.18,
      0.075,
      leather,
      s * 0.37,
      0.97,
      0.18,
    );
    seat.rotation.x = -0.12;
    rounded(0.29, 0.17, 0.14, 0.045, leather, s * 0.37, 1.27, 0.21);
  }
  loft([[-.42,.72,1.59,1.64],[-.22,.75,1.62,1.672],[.28,.77,1.635,1.686],[.85,.77,1.61,1.68],[1.18,.73,1.58,1.635]],paint);
  rounded(1.29, 0.015, 1.13, 0.045, panorama, 0, 1.701, 0.33);
  rounded(1.6, 0.065, 0.27, 0.025, paint, 0, 1.635, 1.29);
  rounded(1.43, 0.022, 0.03, 0.009, tail, 0, 1.606, 1.43);
  rounded(1.39, 0.16, 0.42, 0.06, leather, 0, 0.73, 1.0);
  rounded(1.39, 0.5, 0.16, 0.065, leather, 0, 0.98, 1.2);
  rounded(1.62, 0.2, 0.29, 0.055, trim, 0, 1.01, -0.65);
  rounded(0.42, 0.15, 0.022, 0.014, lens, 0.1, 1.085, -0.482);
  const steeringPivot = new THREE.Group();
  steeringPivot.position.set(-0.38, 1.04, -0.36);
  steeringPivot.rotation.x = -0.35;
  body.add(steeringPivot);
  mesh(
    new THREE.TorusGeometry(0.15, 0.019, 8, 28),
    trim,
    0,
    0,
    0,
    steeringPivot,
  );
  rounded(0.07, 0.1, 0.03, 0.02, trim, 0, 0, 0, steeringPivot);
  for (const x of [-0.09, 0.09])
    rounded(0.18, 0.022, 0.02, 0.006, chrome, x, 0, 0, steeringPivot);
  // Rear hatch, continuous light bar, diffuser, wiper and paired exhaust outlets.
  rounded(1.82, 0.1, 0.07, 0.035, trim, 0, 1.145, 2.35);
  const rearHatch=rounded(1.76, 0.39, 0.07, 0.055, paint, 0, 0.94, 2.375);
  const hatchVertices=rearHatch.geometry.getAttribute("position");
  for(let i=0;i<hatchVertices.count;i++)hatchVertices.setZ(i,hatchVertices.getZ(i)-.023*(hatchVertices.getX(i)/.88)**2);
  rearHatch.geometry.computeVertexNormals();
  rounded(1.79, 0.046, 0.075, 0.021, tail, 0, 1.15, 2.39);
  for (const side of [-1, 1]) {
    rounded(0.27, 0.08, 0.09, 0.035, tail, side * 0.8, 1.145, 2.35);
    rounded(0.3, 0.15, 0.12, 0.045, chrome, side * 0.66, 0.43, 2.38);
    rounded(0.25, 0.105, 0.014, 0.035, trim, side * 0.66, 0.43, 2.449);
    rounded(0.22, 0.028, 0.025, 0.012, tail, side * 0.78, 0.59, 2.424);
  }
  rounded(1.47, 0.12, 0.12, 0.035, trim, 0, 0.4, 2.34);
  rounded(0.42, 0.16, 0.02, 0.015, trim, 0, 0.67, 2.44);
  tube(
    [
      [-0.3, 1.25, 1.86],
      [0.25, 1.25, 1.86],
    ],
    0.013,
    trim,
  );
  function badge(
    text: string,
    width: number,
    height: number,
    y: number,
    z: number,
    italic = false,
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 1024, 128);
    ctx.fillStyle = "#d8dfdc";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = (italic ? "italic " : "") + "72px Arial";
    ctx.fillText(text, 512, 68, 1000);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      roughness: 0.35,
      metalness: 0.55,
      depthWrite: false,
    });
    const label = mesh(new THREE.PlaneGeometry(width, height), material, 0, y, z);
    label.name=text;
    material.name='badge_'+text;
    label.castShadow = false;
    return label;
  }
  badge("P O R S C H E", 1.11, 0.105, 1.025, 2.419);
  badge("Cayenne", 0.43, 0.09, 0.855, 2.423, true).position.x = 0.64;
  // Gold calligraphy sits directly on the painted rear hatch.
  const signatureCanvas = document.createElement("canvas");
  signatureCanvas.width = 1024;
  signatureCanvas.height = 256;
  const signatureContext = signatureCanvas.getContext("2d")!;
  signatureContext.font = '190px CoastSignature, cursive';
  signatureContext.textAlign = "center";
  signatureContext.textBaseline = "middle";
  signatureContext.strokeStyle = "#deb56a";
  signatureContext.lineWidth = 2;
  signatureContext.strokeText("NAREN", 512, 138, 930);
  signatureContext.fillStyle = "#f2cf8f";
  signatureContext.fillText("NAREN", 512, 138, 930);
  const signatureTexture = new THREE.CanvasTexture(signatureCanvas);
  signatureTexture.colorSpace = THREE.SRGBColorSpace;
  const signatureMaterial = new THREE.MeshStandardMaterial({
    map: signatureTexture,
    emissiveMap: signatureTexture,
    emissive: "#b48a42",
    emissiveIntensity: 0.08,
    transparent: true,
    alphaTest: 0.03,
    metalness: 0.4,
    roughness: 0.4,
    depthWrite: false,
  });
  const signature = mesh(
    new THREE.PlaneGeometry(1.0, 0.23),
    signatureMaterial,
    -0.15,
    0.865,
    2.427,
  );
  signature.name = "NAREN rear calligraphy";
  signature.castShadow = false;
  // Small enamel hood crest, built as original geometry.
  const crest = new THREE.Shape();
  crest.moveTo(-0.032, 0.042);
  crest.lineTo(0.032, 0.042);
  crest.lineTo(0.027, -0.014);
  crest.quadraticCurveTo(0, -0.054, -0.027, -0.014);
  crest.closePath();
  const gold = new THREE.MeshStandardMaterial({
    color: 0xc49e47,
    metalness: 0.6,
    roughness: 0.33,
    side: THREE.DoubleSide,
  });
  const emblem = mesh(new THREE.ShapeGeometry(crest), gold, 0, 1.085, -2.1);
  emblem.rotation.x = -Math.PI / 2;
  const wheels: { pivot: THREE.Group; spin: THREE.Group; front: boolean }[] =
    [];
  for (const side of [-1, 1])
    for (const z of [-1.45, 1.445]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.84, VEHICLE.wheelRadius, z);
      group.add(pivot);
      const spin = new THREE.Group();
      pivot.add(spin);
      const tireProfile=[new THREE.Vector2(.255,-.15),new THREE.Vector2(.33,-.15),new THREE.Vector2(.372,-.123),new THREE.Vector2(.388,-.075),new THREE.Vector2(.39,0),new THREE.Vector2(.388,.075),new THREE.Vector2(.372,.123),new THREE.Vector2(.33,.15),new THREE.Vector2(.255,.15)];
      const tire = mesh(
        new THREE.LatheGeometry(tireProfile,36),
        rubber,
        0,
        0,
        0,
        spin,
      );
      tire.rotation.z = Math.PI / 2;
      for (const face of [-1, 1]) {
        const x = face * 0.151;
        const rim = mesh(
          new THREE.TorusGeometry(0.286, 0.016, 8, 36),
          chrome,
          x,
          0,
          0,
          spin,
        );
        rim.rotation.y = Math.PI / 2;
        const disc = mesh(
          new THREE.CylinderGeometry(0.244, 0.244, 0.012, 28),
          rotor,
          face * 0.122,
          0,
          0,
          spin,
        );
        disc.rotation.z = Math.PI / 2;
        const hub = mesh(
          new THREE.CylinderGeometry(0.055, 0.055, 0.027, 14),
          chrome,
          face * 0.16,
          0,
          0,
          spin,
        );
        hub.rotation.z = Math.PI / 2;
        for (let i = 0; i < 10; i++) {
          const angle = (i / 10) * Math.PI * 2;
          const spoke = rounded(
            0.025,
            0.023,
            0.25,
            0.006,
            chrome,
            x,
            Math.sin(angle) * 0.154,
            Math.cos(angle) * 0.154,
            spin,
          );
          spoke.rotation.x = -angle;
        }
      }
      rounded(
        0.035,
        0.16,
        0.075,
        0.018,
        caliper,
        side * 0.149,
        0.04,
        -0.16,
        pivot,
      );
      wheels.push({ pivot, spin, front: z < 0 });
    }
  const headlights: THREE.SpotLight[] = [];
  for (const side of [-1, 1]) {
    const light = new THREE.SpotLight(0xe8f1ff, 0, 58, 0.40, 0.70, 2);
    light.position.set(side * 0.65, 0.98, -2.29);
    light.target.position.set(side * 0.7, 0.02, -25);
    body.add(light, light.target);
    headlights.push(light);
  }
  // Merge static parts per material while retaining textured badge UVs.
  function batchParts(parent: THREE.Group) {
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const child of [...parent.children]) {
      if (
        !(child instanceof THREE.Mesh) ||
        Array.isArray(child.material) ||
        ("map" in child.material && child.material.map) ||
        ("bumpMap" in child.material && child.material.bumpMap) ||
        ("normalMap" in child.material && child.material.normalMap)
      )
        continue;
      child.updateMatrix();
      const geometry = child.geometry.index
        ? child.geometry.toNonIndexed()
        : child.geometry.clone();
      geometry.deleteAttribute("uv");
      geometry.applyMatrix4(child.matrix);
      const parts = batches.get(child.material) ?? [];
      parts.push(geometry);
      batches.set(child.material, parts);
      parent.remove(child);
      child.geometry.dispose();
    }
    for (const [material, parts] of batches) {
      const geometry = mergeGeometries(parts, false);
      if (geometry) mesh(geometry, material, 0, 0, 0, parent);
      parts.forEach((part) => part.dispose());
    }
  }
  batchParts(body);
  batchParts(steeringPivot);
  wheels.forEach((w) => {
    batchParts(w.spin);
    batchParts(w.pivot);
  });
  let wheelAngle = 0,
    previousTime = 0;
  group.userData.visualRevision="sculpted-cayenne-v2";
  wheels.forEach((w,i)=>{w.pivot.name=['wheel_fl','wheel_rl','wheel_fr','wheel_rr'][i];w.spin.name=w.pivot.name+'_spin';});
  group.userData.wheelPivots=wheels.map(w=>w.pivot.name);
  const roles=[paint,sidePaint,trim,chrome,rubber,glass,panorama,leather,lens,tail,lamps,caliper,rotor];
  const names=['paint','side_paint','black_trim','brushed_alloy','tire_rubber','cabin_glass','panoramic_glass','saddle_leather','lamp_lenses','rear_lights','front_lights','brake_caliper','brake_rotors'];
  roles.forEach((material,i)=>{material.name=names[i];});
  signatureMaterial.name='NAREN_calligraphy';
  group.updateMatrixWorld(true);
  const parts=new Map<string,{mesh:THREE.Mesh;restInverse:THREE.Matrix4;low?:THREE.BufferGeometry;high?:THREE.BufferGeometry}>();
  const loadedAssets=new Set<string>();
  let partIndex=0,currentQuality:Quality='low';
  group.traverse(object=>{if(object instanceof THREE.Mesh){parts.set('car_part_'+partIndex.toString().padStart(3,'0'),{mesh:object,restInverse:object.matrixWorld.clone().invert(),high:object.geometry});partIndex++;}});
  const setQuality=(quality:Quality)=>{
    currentQuality=quality;
    paint.clearcoat=sidePaint.clearcoat=quality==='low'?.7:1;
    rubber.bumpScale=quality==='low'?.005:.008;
    glass.opacity=quality==='low'?.34:.36;
    for(const part of parts.values()){const geometry=quality==='low'?part.low:part.high;if(geometry)part.mesh.geometry=geometry;}
  };
  return {
    group,
    setQuality,
    async loadAssets(progress,essentialOnly=false){
      const loader=new GLTFLoader();let completed=0;
      // Keep the live paint, lamp and font materials. Only geometry is imported,
      // so embedded preview textures never add decoding or GPU memory work.
      const placeholder=new THREE.MeshBasicMaterial();
      loader.register(()=>({name:'SUNSPOKE_GEOMETRY_ONLY',loadMaterial:()=>Promise.resolve(placeholder)}));
      try{
        const levels=(essentialOnly?['low']:['low','high']).filter(level=>!loadedAssets.has(level));
        await Promise.all(levels.map(async level=>{
          if(!sharedCarGeometry.has(level))sharedCarGeometry.set(level,(async()=>{
          const geometries=new Map<string,THREE.BufferGeometry>();
          const asset=await loader.loadAsync('/assets/car/cayenne-'+level+'.glb');asset.scene.updateMatrixWorld(true);
          for(const [id,part] of parts){
            const incoming=asset.scene.getObjectByName(id);
            if(!(incoming instanceof THREE.Mesh))continue;
            const geometry=incoming.geometry.clone();geometry.applyMatrix4(incoming.matrixWorld);geometry.applyMatrix4(part.restInverse);
            // Blender exports glTF image UVs with a flipped V axis. The game
            // deliberately retains its existing CanvasTextures (flipY=true).
            const uv=geometry.getAttribute('uv');if(uv){for(let i=0;i<uv.count;i++)uv.setY(i,1-uv.getY(i));uv.needsUpdate=true;}
            geometry.computeBoundingSphere();geometries.set(id,geometry);
          }
          const retired=new Set<THREE.BufferGeometry>();
          asset.scene.traverse(object=>{if(object instanceof THREE.Mesh&&!retired.has(object.geometry)){retired.add(object.geometry);object.geometry.dispose();}});
          return geometries;})().catch(error=>{sharedCarGeometry.delete(level);throw error;}));
          const geometries=await sharedCarGeometry.get(level)!;
          for(const[id,part]of parts){const geometry=geometries.get(id);if(geometry){if(level==='low')part.low=geometry;else part.high=geometry;}}
          loadedAssets.add(level);progress?.(++completed,levels.length);
        }));
        setQuality(currentQuality);group.userData.assetStatus='optimized-local-glb';
      }catch(error){group.userData.assetStatus='procedural-fallback';console.warn('Cayenne detail assets unavailable; keeping the complete procedural car.',error);}finally{placeholder.dispose();}
    },
    update(speed, steering, throttle, braking, time, night) {
      const dt = Math.min(0.05, Math.max(0, time - previousTime));
      previousTime = time;
      wheelAngle -= (speed * dt) / VEHICLE.wheelRadius;
      for (const wheel of wheels) {
        wheel.spin.rotation.x = wheelAngle;
        wheel.pivot.rotation.y = wheel.front ? steering : 0;
      }
      body.rotation.z = THREE.MathUtils.damp(
        body.rotation.z,
        -steering * Math.min(Math.abs(speed) / 30, 1) * 0.055,
        6,
        dt,
      );
      body.rotation.x = THREE.MathUtils.damp(
        body.rotation.x,
        braking ? -0.012 : throttle * 0.01,
        7,
        dt,
      );
      body.position.y =
        Math.sin(time * 7) * Math.min(Math.abs(speed) / 30, 1) * 0.004;
      steeringPivot.rotation.z = steering * 2;
      tail.emissiveIntensity = braking ? 3 : 0.2 + night * 0.8;
      lamps.emissiveIntensity = 0.5 + night * 2.3;
      headlights.forEach((light) => (light.intensity = night * 70));
    },
  };
}

