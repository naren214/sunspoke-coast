"""Render optional local asset thumbnails through Blender CPU; no browser UI."""
import bpy,json,math,sys
from mathutils import Vector
from pathlib import Path
root=Path(__file__).resolve().parents[2];out=root/'public/assets/previews';out.mkdir(exist_ok=True)
manifest=json.loads((root/'public/assets/manifest.json').read_text(encoding='utf-8'))
selected={'palm','fir','broadleaf','bench','adult-man','adult-woman','tower-a','tower-sky-a','house-a','container'}
for record in manifest['models']:
    if record['id']not in selected:continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(root/'public'/record['url'].lstrip('/')))
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=12;scene.cycles.use_denoising=True
    scene.render.resolution_x=320;scene.render.resolution_y=320;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
    scene.world=bpy.data.worlds.new('Preview studio');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.17,.22,.26,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.55
    objects=[o for o in scene.objects if o.type=='MESH'];vertices=[o.matrix_world@Vector(p)for o in objects for p in o.bound_box]
    lo=Vector([min(v[i]for v in vertices)for i in range(3)]);hi=Vector([max(v[i]for v in vertices)for i in range(3)]);size=max(hi-lo);target=(lo+hi)/2
    light_data=bpy.data.lights.new('Softbox','AREA');light_data.energy=600*size*size;light_data.shape='DISK';light_data.size=4*size;light=bpy.data.objects.new('Softbox',light_data);scene.collection.objects.link(light);light.location=target+Vector((1.5,-2,3))*size;light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler()
    camera_data=bpy.data.cameras.new('Preview camera');camera=bpy.data.objects.new('Preview camera',camera_data);scene.collection.objects.link(camera);camera.location=target+Vector((1.4,-2,1))*size;camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=size*1.3;scene.camera=camera
    scene.view_settings.view_transform='AgX';scene.render.filepath=str(out/(record['id']+'.png'));bpy.ops.render.render(write_still=True);print('PREVIEW',record['id'],flush=True)
