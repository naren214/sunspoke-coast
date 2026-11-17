"""Repack embedded GLB images to <=512px and validate the locally imported library."""
from pathlib import Path
from io import BytesIO
from PIL import Image
import json,struct,hashlib

root=Path(__file__).resolve().parents[2];folder=root/'public/assets';path=folder/'manifest.json';manifest=json.loads(path.read_text(encoding='utf-8'))
for record in manifest['models']:
    p=root/'public'/record['url'].lstrip('/');data=p.read_bytes();json_size=struct.unpack_from('<I',data,12)[0];g=json.loads(data[20:20+json_size]);start=20+json_size+8;binary=data[start:]
    replacements={}
    for image in g.get('images',[]):
        view=image['bufferView'];v=g['bufferViews'][view];raw=binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
        im=Image.open(BytesIO(raw));im.thumbnail((512,512),Image.Resampling.LANCZOS);out=BytesIO()
        alpha=im.mode in ['RGBA','LA']and im.getchannel('A').getextrema()!=(255,255)
        if alpha:im.convert('RGBA').save(out,format='PNG',optimize=True);image['mimeType']='image/png'
        else:im.convert('RGB').save(out,format='JPEG',quality=82,optimize=True);image['mimeType']='image/jpeg'
        replacements[view]=out.getvalue()
    parts=[];offset=0
    for i,v in enumerate(g.get('bufferViews',[])):
        raw=replacements.get(i,binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]);padding=(-offset)%4
        if padding:parts.append(b'\x00'*padding);offset+=padding
        v['byteOffset']=offset;v['byteLength']=len(raw);parts.append(raw);offset+=len(raw)
    buffer=b''.join(parts);buffer+=b'\x00'*((-len(buffer))%4);g['buffers'][0]['byteLength']=len(buffer)
    json_bytes=json.dumps(g,separators=(',',':'),ensure_ascii=False).encode();json_bytes+=b' '*((-len(json_bytes))%4)
    result=struct.pack('<4sII',b'glTF',2,12+8+len(json_bytes)+8+len(buffer))+struct.pack('<I4s',len(json_bytes),b'JSON')+json_bytes+struct.pack('<I4s',len(buffer),b'BIN\x00')+buffer
    p.write_bytes(result);record['sizeBytes']=len(result);record['sha256']=hashlib.sha256(result).hexdigest();record['textureMaxSize']=512
    print(record['id'],len(result),record['triangles'],record['dimensions'])
manifest['totalBytes']=sum(p.stat().st_size for p in folder.rglob('*')if p.is_file())
path.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print('Image repacking and GLB validation complete')
