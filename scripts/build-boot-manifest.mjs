import {readFile,writeFile,stat,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'),dist=resolve(root,process.argv.includes('--public')?'public':'dist');
const manifest=JSON.parse(await readFile(resolve(dist,'assets/manifest.json'),'utf8'));
const assets=new Map();
const add=(url,label,type='application/octet-stream')=>assets.set(url,{url,label,type});
add('/world/metadata.json','Reading the county map','application/json');add('/world/county.json.gz','Downloading the coast and city','application/gzip');
add('/assets/manifest.json','Finding your scenery','application/json');add('/assets/car/cayenne-low.glb','Downloading your Cayenne','model/gltf-binary');
for(const id of ['palm','bench','boulder'])add(manifest.models.find(m=>m.id===id).lods.low,'Downloading the beach scenery','model/gltf-binary');
for(const material of manifest.materials)for(const field of ['baseColor','normal','roughness'])if(material[field])add(material[field],'Downloading road and landscape detail','image/jpeg');
for(const file of await readdir(resolve(dist,'gallery')))if(/\.(jpg|jpeg|png|webp)$/.test(file))add('/gallery/'+file,'Downloading the gallery',file.endsWith('.png')?'image/png':file.endsWith('.webp')?'image/webp':'image/jpeg');
add(manifest.environments.find(e=>e.id==='golden').url,'Downloading the golden-hour light');
const hash=createHash('sha256');let totalBytes=0;
for(const asset of assets.values()){const path=resolve(dist,'.'+asset.url),bytes=await readFile(path);asset.bytes=(await stat(path)).size;totalBytes+=asset.bytes;hash.update(asset.url).update(bytes);}
const data={version:hash.digest('hex').slice(0,20),totalBytes,assets:[...assets.values()]};
await writeFile(resolve(dist,'boot-manifest.json'),JSON.stringify(data));console.log(JSON.stringify({startupFiles:data.assets.length,startupDataBytes:totalBytes}));
