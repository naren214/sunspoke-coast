"""Fetch CC0 source assets and prepare compact browser materials. Run with --surfaces/--models."""
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urljoin
from io import BytesIO
from concurrent.futures import ThreadPoolExecutor
import json, re, sys, hashlib
from PIL import Image

PROJECT=Path(__file__).resolve().parents[2]
SOURCE=PROJECT/'source/assets'
PUBLIC=PROJECT/'public/assets'
CACHE=SOURCE/'cache'
for p in [PUBLIC,CACHE,SOURCE/'provenance',PUBLIC/'materials',PUBLIC/'environments',PUBLIC/'models',PUBLIC/'previews']:p.mkdir(parents=True,exist_ok=True)
HEADER={'User-Agent':'SunspokeCoast/1.0 (CC0 asset import; locally bundled game assets)'}

def fetch(url,byte_range=None):
    header=HEADER|({'Range':f'bytes={byte_range[0]}-{byte_range[1]}'} if byte_range else {})
    with urlopen(Request(url,headers=header),timeout=120) as r:
        if byte_range and r.status!=206:raise RuntimeError('Range request was not honored')
        return r.read()

def api(name,kind='files'):
    file=SOURCE/'provenance'/f'{name}-{kind}.json'
    if file.exists():return json.loads(file.read_text(encoding='utf-8'))
    result=json.loads(fetch('https://api.polyhaven.com/'+kind+'/'+name));file.write_text(json.dumps(result,indent=2),encoding='utf-8');return result

def manifest():
    f=PUBLIC/'manifest.json'
    return json.loads(f.read_text(encoding='utf-8')) if f.exists() else {'models':[],'materials':[],'environments':[]}

def put_manifest(key,values):
    data=manifest();ids={v['id'] for v in values};data[key]=[v for v in data[key] if v['id'] not in ids]+values
    (PUBLIC/'manifest.json').write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')

def image(url,out,maxsize=1024):
    im=Image.open(BytesIO(fetch(url)));im.thumbnail((maxsize,maxsize),Image.Resampling.LANCZOS)
    if out.suffix.lower()=='.png':im.save(out,optimize=True)
    else:im.convert('RGB').save(out,quality=84,optimize=True)
    return list(im.size)

def author(name):return ', '.join(api(name,'info').get('authors',{}))

def material(job):
    id,name,repeat=job;out=PUBLIC/'materials'/id;out.mkdir(exist_ok=True)
    d=api(name);record={'id':id,'source':'https://polyhaven.com/a/'+name,'author':author(name),'license':'CC0-1.0','repeat':repeat,'changes':'1K source maps resized to 1024 pixels and recompressed as JPEG. OpenGL normal map; roughness is grayscale.'}
    for channel,terms in [('baseColor',['Diffuse','diff']),('normal',['nor_gl']),('roughness',['Rough','rough'])]:
        key=next((k for k in terms if k in d),None)
        if key:
            entry=d[key]['1k'];format='jpg' if 'jpg'in entry else 'png';p=out/(channel+'.jpg');image(entry[format]['url'],p)
            record[channel]='/assets/materials/'+id+'/'+p.name
    record['sizeBytes']=sum(p.stat().st_size for p in out.iterdir());print('MATERIAL',id,record['sizeBytes'],flush=True);return record

def environment(job):
    id,name=job;d=api(name);entry=d['hdri']['1k']['hdr'];p=PUBLIC/'environments'/(id+'.hdr')
    p.write_bytes(fetch(entry['url']));print('HDRI',id,p.stat().st_size,flush=True)
    return {'id':id,'url':'/assets/environments/'+p.name,'source':'https://polyhaven.com/a/'+name,'author':author(name),'license':'CC0-1.0','sizeBytes':p.stat().st_size,'resolution':[1024,512],'changes':'Original 1K Radiance HDR; no tonemapping applied.'}

def poly_model(job):
    id,name,target=job;folder=CACHE/id;folder.mkdir(exist_ok=True)
    d=api(name)['gltf']['1k']['gltf'];g=json.loads(fetch(d['url']))
    # Some tree files contain several complete trees; acquire the smallest tree only.
    if name=='fir_tree_01':
        selected=min(range(len(g['meshes'])),key=lambda k:sum(g['accessors'][p['indices']]['count'] for p in g['meshes'][k]['primitives']))
        mesh=g['meshes'][selected];views=set()
        for p in mesh['primitives']:
            for a in list(p['attributes'].values())+[p['indices']]:views.add(g['accessors'][a]['bufferView'])
        ordered=sorted(views);start=min(g['bufferViews'][v].get('byteOffset',0) for v in ordered);end=max(g['bufferViews'][v].get('byteOffset',0)+g['bufferViews'][v]['byteLength'] for v in ordered)
        binary=fetch(next(v['url']for k,v in d['include'].items()if k.endswith('.bin')),(start,end-1))
        old=g['bufferViews'];mapping={v:i for i,v in enumerate(ordered)};g['bufferViews']=[dict(old[v],byteOffset=old[v].get('byteOffset',0)-start)for v in ordered]
        active_accessors={a for p in mesh['primitives'] for a in list(p['attributes'].values())+[p['indices']]};amap={v:i for i,v in enumerate(sorted(active_accessors))};g['accessors']=[dict(g['accessors'][v],bufferView=mapping[g['accessors'][v]['bufferView']])for v in sorted(active_accessors)]
        for p in mesh['primitives']:
            p['attributes']={k:amap[v]for k,v in p['attributes'].items()};p['indices']=amap[p['indices']]
        node=next(n for n in g['nodes'] if n.get('mesh')==selected);g['nodes']=[dict(node,mesh=0)];g['meshes']=[mesh];g['scenes']=[{'nodes':[0]}];g['scene']=0;g['buffers']=[{'uri':'mesh.bin','byteLength':len(binary)}];(folder/'mesh.bin').write_bytes(binary)
        includes={k:v for k,v in d['include'].items()if not k.endswith('.bin')}
    else:includes=d['include']
    def dependency(pair):
        relative,item=pair;out=folder/relative;out.parent.mkdir(parents=True,exist_ok=True)
        if not out.exists():out.write_bytes(fetch(item['url']))
        if out.suffix.lower()in['.png','.jpg','.jpeg']:
            im=Image.open(out);im.thumbnail((1024,1024),Image.Resampling.LANCZOS)
            if im.mode in ['RGBA','LA']:im.save(out,optimize=True)
            else:im.convert('RGB').save(out,quality=83,optimize=True) if out.suffix.lower()in['.jpg','.jpeg']else im.save(out,optimize=True)
    with ThreadPoolExecutor(max_workers=4)as e:list(e.map(dependency,includes.items()))
    (folder/'source.gltf').write_text(json.dumps(g),encoding='utf-8')
    record={'id':id,'input':str(folder/'source.gltf'),'targetTriangles':target,'source':'https://polyhaven.com/a/'+name,'author':author(name),'license':'CC0-1.0','category': 'vegetation' if id in ['fir','broadleaf']else 'rock'if id=='boulder'else 'prop'}
    print('MODEL SOURCE',id,flush=True);return record

def pizza_model(job):
    id,code,category,height=job;source='https://poly.pizza/m/'+code;html=fetch(source).decode('utf-8')
    if 'Public Domain (CC0)'not in html:raise RuntimeError('Missing verified CC0 label: '+source)
    urls=re.findall(r'https://static\.poly\.pizza/[^"<>\s]+?\.glb(?:\.br)?',html)
    if not urls:raise RuntimeError('No GLB URL '+source)
    url=next((u for u in urls if not u.endswith('.br')),urls[0]).replace('.glb.br','.glb')
    out=CACHE/id;out.mkdir(exist_ok=True);p=out/'source.glb';p.write_bytes(fetch(url));(SOURCE/'provenance'/(id+'-license.html')).write_text(html,encoding='utf-8')
    print('PIZZA SOURCE',id,p.stat().st_size,flush=True)
    return {'id':id,'input':str(p),'targetTriangles':12000,'source':source,'author':'Quaternius','license':'CC0-1.0','category':category,'height':height}

def kenney_models():
    url='https://raw.githubusercontent.com/Hidencod/tge-assets/main/'
    data=json.loads(fetch(url+'catalog.json'));(SOURCE/'provenance/kenney-mirror-license.txt').write_bytes(fetch(url+'LICENSE'))
    selection={'city-kit-commercial':['building-a','building-c','building-g','building-m','building-skyscraper-a','building-skyscraper-c'], 'city-kit-suburban':['building-type-a','building-type-g','building-type-n'], 'furniture-kit':['trashcan','chair','tableround'],'pirate-kit':['boat-row-small','crate']}
    records=[]
    for pack in data['packs']:
        if pack['id']not in selection:continue
        for m in pack['models']:
            slug=m['id'].split('/')[-1]
            if slug not in selection[pack['id']]:continue
            id=('house-'if pack['id']=='city-kit-suburban'else 'tower-'if pack['id']=='city-kit-commercial'else '')+slug.replace('building-skyscraper-','sky-').replace('building-type-','').replace('building-','')
            folder=CACHE/id;folder.mkdir(exist_ok=True);p=folder/'source.glb';p.write_bytes(fetch(url+m['file']))
            height=28 if id.startswith('tower-')else 7 if id.startswith('house-')else 0
            record={'id':id,'input':str(p),'height':height,'targetTriangles':12000,'source':pack['url'],'downloadSource':url+m['file'],'author':'Kenney','license':'CC0-1.0','category':'architecture'if height else 'prop'};records.append(record);print('KENNEY SOURCE',id,p.stat().st_size,flush=True)
    return records

if '--surfaces'in sys.argv:
    with ThreadPoolExecutor(max_workers=3)as e:
        materials=list(e.map(material,[('asphalt','asphalt_02',.16),('sand','coast_sand_01',.17),('grass','aerial_grass_rock',.04),('pavement','concrete_pavement',.3),('facade','concrete_tile_facade',.2),('brick','brick_wall_001',.2),('wood','wood_floor',.5)]))
    put_manifest('materials',materials)
    with ThreadPoolExecutor(max_workers=3)as e:environments=list(e.map(environment,[('golden','belfast_sunset_puresky'),('twilight','qwantani_dusk_2_puresky'),('night','qwantani_night_puresky')]))
    put_manifest('environments',environments)

if '--models'in sys.argv:
    records=[]
    jobs=[('boulder','boulder_01',1800),('bench','painted_wooden_bench',4000),('picnic','wooden_picnic_table',6000),('planter','planter_box_01',4500),('aircon','exterior_aircon_unit',5000),('boat','ship_pinnace',12000),('seating','modular_street_seating',7000),('fir','fir_tree_01',14000),('broadleaf','tree_small_02',16000)]
    for job in jobs:
        try:records.append(poly_model(job))
        except Exception as error:print('FAILED MODEL',job[0],repr(error),flush=True)
    for job in [('palm','DsrrAYmucG','vegetation',9),('adult-man','kZ3DmIoGip','person',1.8),('adult-beach','DojKLcO34E','person',1.8),('container','dQXRtm5GbO','industrial',2.6)]:
        try:records.append(pizza_model(job))
        except Exception as error:print('FAILED PIZZA',job[0],repr(error),flush=True)
    records+=kenney_models()
    (SOURCE/'model-jobs.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
    print('READY FOR CONVERSION',len(records),flush=True)
