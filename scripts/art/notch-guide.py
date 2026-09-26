from PIL import Image, ImageDraw, ImageFilter, ImageChops
W,H=1696,2528; src=Image.open('kh.png').convert('RGB')
TEAL=src.getpixel((80,1264)); GOLD=(214,164,74); INK=(40,30,25)
print('teal',TEAL)
L,T,R,B=145,110,W-145,H-110          # outer frame line (matches the art)
NX,NY=424,843                         # notch corner: 1/4 card width, 1/3 card height
def frame_poly(o):                    # frame outline inset by o, with the two stepped notches
    return [(NX+o,T+o),(R-o,T+o),(R-o,H-NY-o),(W-NX-o,H-NY-o),(W-NX-o,B-o),(L+o,B-o),(L+o,NY+o),(NX+o,NY+o)]
def mask_poly(o,r=18):
    m=Image.new('L',(W,H),0); ImageDraw.Draw(m).polygon(frame_poly(o),fill=255)
    return m.filter(ImageFilter.GaussianBlur(r)).point(lambda v:255 if v>127 else 0)  # rounded turns
def stroke(m,w):
    a=m.filter(ImageFilter.MaxFilter(w|1)); b=m.filter(ImageFilter.MinFilter(w|1)); return ImageChops.subtract(a,b)
img=Image.new('RGB',(W,H),TEAL)
outer=mask_poly(0)
# inner arch: arched top, sides and bottom parallel to the frame, following the notches
arch=Image.new('L',(W,H),0); d=ImageDraw.Draw(arch); rr=(R-L)//2-50; cx=W//2
d.rectangle((L+50,T+50+rr,R-50,B-50),fill=255); d.ellipse((cx-rr,T+50,cx+rr,T+50+2*rr),fill=255)
inner=ImageChops.multiply(arch,mask_poly(50))
for m,w in [(outer,17),(inner,11)]:
    img.paste(INK,mask=stroke(m,w+6)); img.paste(GOLD,mask=stroke(m,w))
# rounded card edge like the original (white outside)
cm=Image.new('L',(W,H),0); ImageDraw.Draw(cm).rounded_rectangle((0,0,W-1,H-1),radius=70,fill=255)
out=Image.new('RGB',(W,H),'white'); out.paste(img,mask=cm); out.save('guide.png')
out.resize((424,632)).save('guide_s.png')
