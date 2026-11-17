import * as T from 'three';
import type {Track} from '../shared/protocol';

export function createTurnMarkers(scene:T.Scene,track:Track){
  const root=new T.Group();root.name='Race turn chevrons';root.userData.turnCount=track.turns?.length??0;
  const textures=new Map<string,T.CanvasTexture>(),geometry=new T.PlaneGeometry(5.2,2.5),postGeometry=new T.BoxGeometry(.12,2,.12),postMaterial=new T.MeshBasicMaterial({color:'#c4c5af'});
  const materials:T.MeshBasicMaterial[]=[];
  for(const turn of track.turns??[]){
    if(!textures.has(turn.direction)){
      const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;const ctx=canvas.getContext('2d')!;
      ctx.fillStyle='#102b33';ctx.fillRect(0,0,1024,512);ctx.strokeStyle='#ffd16c';ctx.lineWidth=22;ctx.strokeRect(16,16,992,480);
      ctx.save();if(turn.direction==='left'){ctx.translate(1024,0);ctx.scale(-1,1);}ctx.fillStyle='#ffd16c';
      for(const x of [270,510,750]){ctx.beginPath();ctx.moveTo(x-85,90);ctx.lineTo(x+95,235);ctx.lineTo(x-85,380);ctx.lineTo(x-135,320);ctx.lineTo(x-30,235);ctx.lineTo(x-135,150);ctx.closePath();ctx.fill();}ctx.restore();
      ctx.fillStyle='#fff0c6';ctx.textAlign='center';ctx.font='700 56px Barlow,Arial';ctx.fillText(turn.direction.toUpperCase(),512,465);
      const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;textures.set(turn.direction,texture);
    }
    const group=new T.Group();group.name=turn.direction+' turn chevrons';group.position.set(turn.signX,turn.signY,turn.signZ);group.rotation.y=turn.heading;
    const material=new T.MeshBasicMaterial({map:textures.get(turn.direction),toneMapped:false,fog:false});materials.push(material);
    const sign=new T.Mesh(geometry,material);sign.position.y=3;group.add(sign);
    for(const x of [-2,2]){const post=new T.Mesh(postGeometry,postMaterial);post.position.set(x,1,0);group.add(post);}
    root.add(group);
  }
  scene.add(root);
  return {root,setCurrent(index:number,active:boolean){root.children.forEach((group,i)=>{group.visible=!active||i===index||i===index+1;materials[i].color.setHex(!active||i===index?0xffffff:0xa8b5b8);});},dispose(){scene.remove(root);geometry.dispose();postGeometry.dispose();postMaterial.dispose();materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}};
}
