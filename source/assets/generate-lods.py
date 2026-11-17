"""Rebuild browser LODs from the bundled, redistributable source GLBs."""
import bpy,json,sys,bmesh
from mathutils import Vector
from pathlib import Path
root=Path(__file__).resolve().parents[2]
manifest_path=root/'public/assets/manifest.json'
manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
folder=root/'public/assets/models/lod';folder.mkdir(parents=True,exist_ok=True)
for record in manifest['models']:
    record['lods']={'high':record['url']}
    for level,ratio in [('medium',.48),('low',.18)]:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(root/'public'/record['url'].lstrip('/')))
        original_objects=list(bpy.context.scene.objects);deps=bpy.context.evaluated_depsgraph_get();new_objects=[]
        for original in original_objects:
            if original.type!='MESH':continue
            data=bpy.data.meshes.new_from_object(original.evaluated_get(deps),depsgraph=deps)
            for vertex in data.vertices:vertex.co=original.matrix_world@vertex.co
            obj=bpy.data.objects.new(original.name+' temporary',data);bpy.context.scene.collection.objects.link(obj);new_objects.append((obj,original.name))
        for original in original_objects:bpy.data.objects.remove(original,do_unlink=True)
        for obj,name in new_objects:obj.name=name
        for obj in [o for o in bpy.context.scene.objects if o.type=='MESH']:
            if len(obj.data.polygons)<80:continue
            bpy.context.view_layer.objects.active=obj
            modifier=obj.modifiers.new('Browser LOD','DECIMATE');modifier.ratio=ratio;modifier.use_collapse_triangulate=True
            bpy.ops.object.modifier_apply(modifier=modifier.name)
            bm=bmesh.new();bm.from_mesh(obj.data);loose=[v for v in bm.verts if not v.link_faces]
            if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
            bm.to_mesh(obj.data);bm.free()
        meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];vertices=[v.co for o in meshes for v in o.data.vertices]
        lo=Vector([min(v[i]for v in vertices)for i in range(3)]);hi=Vector([max(v[i]for v in vertices)for i in range(3)]);center=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z));height=record['dimensions'][1];scale=height/max(.001,hi.z-lo.z)
        for obj in meshes:
            for vertex in obj.data.vertices:vertex.co=(vertex.co-center)*scale
        path=folder/(record['id']+'-'+level+'.glb')
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_animations=False,export_apply=True,export_image_format='AUTO')
        record['lods'][level]='/assets/models/lod/'+path.name
    print('LOD',record['id'],flush=True)
manifest_path.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
