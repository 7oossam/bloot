from PIL import Image
import numpy as np, sys
def load(path):
    im=np.asarray(Image.open(path).convert('RGB')).astype(int)
    paper=np.median(im[5:40,5:40].reshape(-1,3),axis=0)
    return im, paper, np.abs(im-paper).sum(2)>60
def geometry(diff):
    H,W=diff.shape
    fx_left=int(np.argmax(diff[H//2,:])); fy_top=int(np.argmax(diff[:,W//2]))
    # step vertical line (TL): smallest x whose column is solid from fy_top+10 to fy_top+250
    col=diff[fy_top+10:fy_top+250,:W//2].mean(0); step_x=int(np.argmax(col>0.97))
    row=diff[:H//2, fx_left+10:fx_left+150].mean(1); step_y=int(np.argmax(row>0.97))
    fx_right=W-1-int(np.argmax(diff[H//2,::-1])); fy_bot=H-1-int(np.argmax(diff[::-1,W//2]))
    col=diff[fy_bot-250:fy_bot-10,W//2:].mean(0)[::-1]; bstep_x=W-1-int(np.argmax(col>0.97))
    row=diff[H//2:, fx_right-150:fx_right-10].mean(1)[::-1]; bstep_y=H-1-int(np.argmax(row>0.97))
    return dict(fx_left=fx_left,fy_top=fy_top,fx_right=fx_right,fy_bot=fy_bot,step_x=step_x,step_y=step_y,bstep_x=bstep_x,bstep_y=bstep_y)
def bbox(mask,x0,y0):
    ys,xs=np.nonzero(mask); return (int(xs.min()+x0),int(ys.min()+y0),int(xs.max()+x0),int(ys.max()+y0))
def analyze(path):
    im,paper,diff=load(path); H,W=diff.shape; g=geometry(diff)
    top=bbox(diff[:g['step_y']-6,:g['step_x']-6],0,0)
    bot=bbox(diff[g['bstep_y']+6:,g['bstep_x']+6:],g['bstep_x']+6,g['bstep_y']+6)
    return im,paper,g,top,bot
if __name__=='__main__':
    for p in sys.argv[1:]:
        im,paper,g,top,bot=analyze(p); H,W=im.shape[:2]
        tw,th=top[2]-top[0],top[3]-top[1]; bw,bh=bot[2]-bot[0],bot[3]-bot[1]
        # centre offsets: notch TL rect = (0..step_x, 0..step_y); BR rect = (bstep_x..W, bstep_y..H)
        tc=((top[0]+top[2])/2-g['step_x']/2,(top[1]+top[3])/2-g['step_y']/2)
        bc=((bot[0]+bot[2])/2-(g['bstep_x']+W)/2,(bot[1]+bot[3])/2-(g['bstep_y']+H)/2)
        print(p,g,'top',top,(tw,th),'off',tuple(round(v) for v in tc),'| bot',bot,(bw,bh),'off',tuple(round(v) for v in bc))
