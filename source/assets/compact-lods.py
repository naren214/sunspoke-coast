"""Compress embedded texture payloads in the generated LOD GLBs."""
from pathlib import Path
from io import BytesIO
from PIL import Image
import json,struct,hashlib
root=Path(__file__).resolve().parents[2];path=root/'public/assets/manifest.json';manifest=json.loads(path.read_text(encoding='utf-8'))
for record in manifest['models']:
    record['lodBytes']={}
    for level,url in record.get('lods',{}).items():
        p=root/'public'/url.lstrip('/')
        if level=='high':record['lodBytes'][level]=p.stat().st_size;continue
        data=p.read_bytes();size=struct.unpack_from('<I',data,12)[0];g=json.loads(data[20:20+size]);binary=data[20+size+8:];replacements={}
        for image in g.get('images',[]):
            view=image['bufferView'];v=g['bufferViews'][view];im=Image.open(BytesIO(binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]))
            limit=256 if level=='low' else 512;im.thumbnail((limit,limit),Image.Resampling.LANCZOS);out=BytesIO()
            alpha=im.mode in ['RGBA','LA']and im.getchannel('A').getextrema()!=(255,255)
            if alpha:im.convert('RGBA').save(out,format='PNG',optimize=True);image['mimeType']='image/png'
            else:im.convert('RGB').save(out,format='JPEG',quality=80,optimize=True);image['mimeType']='image/jpeg'
            replacements[view]=out.getvalue()
        parts=[];offset=0
        for i,v in enumerate(g.get('bufferViews',[])):
            raw=replacements.get(i,binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]);pad=(-offset)%4
            if pad:parts.append(b'\0'*pad);offset+=pad
            v['byteOffset']=offset;v['byteLength']=len(raw);parts.append(raw);offset+=len(raw)
        buffer=b''.join(parts);buffer+=b'\0'*((-len(buffer))%4);g['buffers'][0]['byteLength']=len(buffer);text=json.dumps(g,separators=(',',':')).encode();text+=b' '*((-len(text))%4)
        p.write_bytes(struct.pack('<4sII',b'glTF',2,12+8+len(text)+8+len(buffer))+struct.pack('<I4s',len(text),b'JSON')+text+struct.pack('<I4s',len(buffer),b'BIN\0')+buffer);record['lodBytes'][level]=p.stat().st_size
manifest['totalBytes']=sum(p.stat().st_size for p in (root/'public/assets').rglob('*')if p.is_file());path.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print('Compacted all imported model LODs')
