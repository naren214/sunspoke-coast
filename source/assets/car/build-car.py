"""Rebuild optimized local car GLBs with Blender 5.3, preserving part IDs."""
import bpy,json,math,gzip
from pathlib import Path
from mathutils import Matrix

here=Path(__file__).resolve().parent
project=here.parents[2]
output=project/'public/assets/car'
data=json.loads(gzip.decompress((here/'sunspoke-gt-source.json.gz').read_bytes()))
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
convert=Matrix.Rotation(math.pi/2,4,'X')
materials=[]
for source in data['materials']:
    material=bpy.data.materials.new(source['name']);material.use_nodes=True
    shader=material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(*source['color'],1)
    shader.inputs['Metallic'].default_value=source['metalness'];shader.inputs['Roughness'].default_value=source['roughness']
    shader.inputs['Coat Weight'].default_value=source['clearcoat']
    shader.inputs['Coat Roughness'].default_value=source['clearcoatRoughness']
    material.use_backface_culling=not source['doubleSided']
    if source.get('emissive'):
        shader.inputs['Emission Color'].default_value=(*source['emissive'],1)
        shader.inputs['Emission Strength'].default_value=source['emissiveIntensity']
    if source.get('transparent'):
        shader.inputs['Alpha'].default_value=source['opacity']
        material.surface_render_method='DITHERED'
    if source['name']=='NAREN_calligraphy':
        filename='naren.png'
        image=bpy.data.images.load(str(here/filename));image.pack()
        tex=material.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image
        material.node_tree.links.new(tex.outputs['Color'],shader.inputs['Base Color']);material.node_tree.links.new(tex.outputs['Alpha'],shader.inputs['Alpha'])
        material.surface_render_method='DITHERED'
    materials.append(material)

def build_node(source,parent=None):
    if 'mesh' in source:
        asset=source['mesh'];vertices=asset['positions'];indices=asset['indices']
        mesh=bpy.data.meshes.new(source['name'])
        verts=[(vertices[i],-vertices[i+2],vertices[i+1]) for i in range(0,len(vertices),3)]
        faces=[tuple(indices[i:i+3]) for i in range(0,len(indices),3)]
        mesh.from_pydata(verts,[],faces)
        mesh.validate()
        mesh.update()
        for polygon in mesh.polygons:polygon.use_smooth=True
        normals=asset.get('normals')
        if normals:
            transformed=[(normals[i],-normals[i+2],normals[i+1]) for i in range(0,len(normals),3)]
            mesh.normals_split_custom_set([transformed[loop.vertex_index] for loop in mesh.loops])
        uvs=asset.get('uvs')
        if uvs:
            uv=mesh.uv_layers.new(name='UVMap')
            for loop in mesh.loops:uv.data[loop.index].uv=(uvs[loop.vertex_index*2],uvs[loop.vertex_index*2+1])
        obj=bpy.data.objects.new(source['name'],mesh);obj.data.materials.append(materials[asset['material']])
    else:obj=bpy.data.objects.new(source['name'],None)
    bpy.context.collection.objects.link(obj);obj.parent=parent
    values=source['matrix'];matrix=Matrix([[values[col*4+row] for col in range(4)] for row in range(4)])
    obj.matrix_local=convert@matrix@convert.inverted()
    for child in source['children']:build_node(child,obj)
    return obj

build_node(data['scene'])
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(here/'sunspoke-gt.blend'))
settings=dict(export_format='GLB',export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_materials='EXPORT',export_extras=False)
bpy.ops.export_scene.gltf(filepath=str(output/'sunspoke-gt-high.glb'),**settings)
for obj in bpy.context.scene.objects:
    if obj.type!='MESH' or len(obj.data.polygons)<80:continue
    modifier=obj.modifiers.new(name='Low-detail optimization',type='DECIMATE');modifier.ratio=.62
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
bpy.ops.export_scene.gltf(filepath=str(output/'sunspoke-gt-low.glb'),**settings)
print('Exported original high and low car detail assets')
