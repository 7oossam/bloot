from PIL import Image, ImageDraw, ImageFilter, ImageChops
import sys
W,H=1024,1536; GOLD=(214,164,74); INK=(40,30,25)
L,T,R,B=92,57,932,1461; SW,SH=int(sys.argv[3]) if len(sys.argv)>3 else 95, int(sys.argv[4]) if len(sys.argv)>4 else 205
def poly(o):
    return [(L+SW+o,T+o),(R-o,T+o),(R-o,B-SH-o),(R-SW-o,B-SH-o),(R-SW-o,B-o),(L+o,B-o),(L+o,T+SH+o),(L+SW+o,T+SH+o)]
def mask(o,r=10):
    m=Image.new('L',(W,H),0); ImageDraw.Draw(m).polygon(poly(o),fill=255)
    return m.filter(ImageFilter.GaussianBlur(r)).point(lambda v:255 if v>127 else 0)
def stroke(m,w):
    return ImageChops.subtract(m.filter(ImageFilter.MaxFilter(w|1)),m.filter(ImageFilter.MinFilter(w|1)))
def build(field, out):
    img=Image.new('RGB',(W,H),(250,247,240)); img.paste(field,mask=mask(0))
    for m,w in [(mask(0),11),(mask(24),7)]:
        img.paste(INK,mask=stroke(m,w+4)); img.paste(GOLD,mask=stroke(m,w))
    img.save(out,quality=94)
if __name__=='__main__':
    build(tuple(map(int,sys.argv[1].split(','))), sys.argv[2])
