"""Offline asset inspection image; not a browser-game screenshot."""
import bpy,math
from pathlib import Path
from mathutils import Vector
here=Path(__file__).resolve().parent;project=here.parents[2]
bpy.ops.wm.open_mainfile(filepath=str(here/'sunspoke-gt.blend'))
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.015))
floor=bpy.context.object;floor.name='Inspection ground'
material=bpy.data.materials.new('Inspection asphalt');material.use_nodes=True
shader=material.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.065,.078,.08,1);shader.inputs['Roughness'].default_value=.84;floor.data.materials.append(material)
scene=bpy.context.scene;scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.44,.58,.65,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5
for location,energy,size,color in [((-4,-2,7),1600,5,(1,.82,.66)),((3,4,5),1000,5,(.63,.82,1)),((0,-5,5),400,4,(.92,1,.96))]:
    bpy.ops.object.light_add(type='AREA',location=location);light=bpy.context.object;light.data.energy=energy;light.data.shape='DISK';light.data.size=size;light.data.color=color
    light.rotation_euler=(Vector((0,0,.7))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(5.8,-7.6,3.4));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,.8))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=58;scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=1200;scene.render.resolution_y=800;scene.render.resolution_percentage=100
(project/'.cache').mkdir(exist_ok=True)
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(project/'.cache/Sunspoke-GT-Asset.png')
scene.view_settings.view_transform='AgX'
bpy.ops.render.render(write_still=True)
