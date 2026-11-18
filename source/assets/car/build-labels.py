from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

here = Path(__file__).resolve().parent
font_path = here.parents[2] / 'public/fonts/explora.ttf'
image = Image.new('RGBA', (1024, 256))
draw = ImageDraw.Draw(image)
font = ImageFont.truetype(str(font_path), 190)
draw.text((512, 128), 'NAREN', font=font, fill='#f2cf8f', anchor='mm', stroke_width=1)
image.save(here / 'naren.png')
