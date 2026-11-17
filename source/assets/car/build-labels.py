from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
here=Path(__file__).resolve().parent
project=here.parents[2]
for filename,text,font_path,size,color in [
 ('naren.png','NAREN',project/'public/fonts/explora.ttf',190,'#f2cf8f'),
 ('porsche.png','P O R S C H E',Path('C:/Windows/Fonts/arial.ttf'),72,'#d8dfdc'),
 ('cayenne.png','Cayenne',Path('C:/Windows/Fonts/ariali.ttf'),72,'#d8dfdc')]:
    if not font_path.exists():
        font_path=project/'public/fonts'/('baskervville-italic.ttf' if filename=='cayenne.png' else 'barlow.ttf')
    image=Image.new('RGBA',(1024,256 if filename=='naren.png' else 128),(0,0,0,0))
    draw=ImageDraw.Draw(image);font=ImageFont.truetype(str(font_path),size)
    draw.text((512,image.height/2),text,font=font,fill=color,anchor='mm',stroke_width=1 if filename=='naren.png' else 0)
    image.save(here/filename)
