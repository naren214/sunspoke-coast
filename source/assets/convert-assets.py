"""Run through Blender --background --python; normalize and compact imported glTF."""
import bpy, json, math, sys, bmesh
from pathlib import Path
from mathutils import Vector

PROJECT=Path(__file__).resolve().parents[2]
SOURCE=PROJECT/'source/assets';PUBLIC=PROJECT/'public/assets'
jobs=json.loads((SOURCE/('model-jobs-extra.json' if '--extra' in sys.argv else 'model-jobs-first.json' if '--first' in sys.argv else 'model-jobs.json')).read_text(encoding='utf-8'))
records=[]

for job in jobs:
    try:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=job['input'])
        if job.get('category')=='person':
            actions=list(bpy.data.actions)
            action=next((a for a in actions if 'Idle_Neutral' in a.name),None) or next((a for a in actions if 'Female_Standing' in a.name),None) or next((a for a in actions if 'Idle' in a.name and not any(x in a.name for x in ['Gun','Sword'])),None)
            if action:
                for armature in [o for o in bpy.context.scene.objects if o.type=='ARMATURE']:
                    ad=armature.animation_data_create();ad.use_nla=False;ad.action=action
                    if len(action.slots):ad.action_slot=action.slots[0]
                bpy.context.scene.frame_set(int(action.frame_range[0]+3))
                print('BAKED PERSON POSE',job['id'],action.name,flush=True)
        originals=list(bpy.context.scene.objects)
        bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();meshes=[]
        # Bake object hierarchies/skin transforms into new, static world-space
        # meshes before measuring. Animation tracks must not undo normalization.
        for original in originals:
            if original.type!='MESH':continue
            mesh=bpy.data.meshes.new_from_object(original.evaluated_get(deps),depsgraph=deps)
            matrix=original.matrix_world.copy()
            for vertex in mesh.vertices:vertex.co=matrix@vertex.co
            obj=bpy.data.objects.new(original.name+' baked',mesh);bpy.context.scene.collection.objects.link(obj);meshes.append(obj)
        for original in originals:bpy.data.objects.remove(original,do_unlink=True)
        vertices=[v.co for o in meshes for v in o.data.vertices]
        lo=Vector([min(v[i]for v in vertices)for i in range(3)]);hi=Vector([max(v[i]for v in vertices)for i in range(3)])
        center=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
        scale=job.get('height',0)/(hi.z-lo.z) if job.get('height')else 1
        for o in meshes:
            for vertex in o.data.vertices:vertex.co=(vertex.co-center)*scale
        triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons)for o in meshes)
        budget=job.get('targetTriangles',12000)
        if job['id']in['fir','broadleaf']:budget=8000
        for o in meshes:
            # glTF stores seams as separate vertices; weld geometric duplicates
            # before simplifying so the decimator can actually collapse edges.
            bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=0.00003);bm.to_mesh(o.data);bm.free()
            count=sum(len(p.vertices)-2 for p in o.data.polygons)
            if triangles>budget and count>60:
                bpy.context.view_layer.objects.active=o
                mod=o.modifiers.new('Browser triangle budget','DECIMATE');mod.ratio=max(.0005,budget/triangles);mod.use_collapse_triangulate=True
                bpy.ops.object.modifier_apply(modifier=mod.name)
            for polygon in o.data.polygons:polygon.use_smooth=True
            o.data.set_sharp_from_angle(angle=math.radians(55))
        minimum=min(v.co.z for o in meshes for v in o.data.vertices)
        for o in meshes:
            for vertex in o.data.vertices:vertex.co.z-=minimum
        for im in bpy.data.images:
            if im.source in ['VIEWER','GENERATED'] or not im.size[0]:continue
            _=im.pixels[0]
            width,height=im.size
            if max(width,height)>512:
                factor=512/max(width,height);im.scale(max(1,int(width*factor)),max(1,int(height*factor)))
            resized=SOURCE/'cache'/job['id']/'resized';resized.mkdir(exist_ok=True)
            fmt='JPEG' if im.file_format=='JPEG' else 'PNG';suffix='.jpg' if fmt=='JPEG' else '.png'
            im.filepath_raw=str(resized/(str(len(list(resized.iterdir())))+suffix));im.file_format=fmt;im.save();im.pack()
        for material in bpy.data.materials:
            if material.use_nodes:
                bsdf=next((n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
                if bsdf and not bsdf.inputs['Roughness'].is_linked:bsdf.inputs['Roughness'].default_value=max(.42,bsdf.inputs['Roughness'].default_value)
        bpy.context.view_layer.update()
        vertices=[v.co for o in meshes for v in o.data.vertices]
        lo=Vector([min(v[i]for v in vertices)for i in range(3)]);hi=Vector([max(v[i]for v in vertices)for i in range(3)])
        for o in meshes:o.select_set(True)
        out=PUBLIC/'models'/(job['id']+'.glb')
        bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_materials='EXPORT',export_image_format='AUTO',export_jpeg_quality=82,export_cameras=False,export_lights=False)
        triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons)for o in meshes)
        record={k:v for k,v in job.items()if k not in ['input','targetTriangles','height']}
        record.update(url='/assets/models/'+out.name,sizeBytes=out.stat().st_size,triangles=triangles,bounds={'min':[round(lo.x,4),round(lo.z,4),round(-hi.y,4)],'max':[round(hi.x,4),round(hi.z,4),round(-lo.y,4)]},dimensions=[round(hi.x-lo.x,4),round(hi.z-lo.z,4),round(hi.y-lo.y,4)],up='+Y',forward='+Z',changes='Imported original glTF; centred in X/Z, base at Y=0; metric scaling where noted; decimated to a browser triangle budget; images capped at 512 pixels; static pose; binary glTF export.')
        records.append(record);print('ASSET_READY '+json.dumps(record),flush=True)
        manifest=PUBLIC/'manifest.json';data=json.loads(manifest.read_text(encoding='utf-8')) if manifest.exists()else{'materials':[],'environments':[],'models':[]};ids={r['id']for r in records};data['models']=[r for r in data['models']if r['id']not in ids]+records;manifest.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    except Exception as e:print('ASSET_FAILED',job['id'],repr(e),flush=True)

print('EXPORT COMPLETE',len(records),sum(r['sizeBytes']for r in records),flush=True)
