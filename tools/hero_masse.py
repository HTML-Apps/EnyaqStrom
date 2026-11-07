"""Maßbilder (Enyaq7–9) für das Start-Karussell aufbereiten: Auto freistellen, schwarze Bemaßung hell umfärben.
Aufruf: python3 tools/hero_masse.py  (Pfade unten anpassen)"""
import numpy as np, sys
from PIL import Image
from scipy import ndimage as nd
def process(src, out, blank=None, close_rows=None):
    a=np.array(Image.open(src).convert('RGB')).astype(float); h,w=a.shape[:2]
    if blank: 
        for (x0,y0,x1,y1) in blank: a[y0:y1,x0:x1]=255
    L=0.299*a[:,:,0]+0.587*a[:,:,1]+0.114*a[:,:,2]
    nonwhite=L<232
    car=nd.binary_opening(nonwhite,structure=np.ones((9,9)))
    lab,n=nd.label(car); sizes=nd.sum(car,lab,range(1,n+1)); car=np.isin(lab,1+np.where(sizes>5000)[0])
    car=nd.binary_fill_holes(nd.binary_closing(car,structure=np.ones((5,5))))
    if close_rows:
        big=nd.binary_closing(np.pad(car,30),structure=np.ones((31,31)))[30:-30,30:-30]
        rows=np.arange(h)[:,None]<close_rows
        car=nd.binary_fill_holes(car|(big&rows&nonwhite)|(nd.binary_dilation(car,iterations=6)&rows&nonwhite))
    car=nd.binary_dilation(car,iterations=1)
    alpha_car=np.clip((250-L)/30,0,1); edge=car&~nd.binary_erosion(car,iterations=2)
    A=np.where(car,np.where(edge,alpha_car,1.0),np.clip((245-L)/170,0,1))
    rgb=np.where(car[...,None],a,np.array([226,232,240.]))
    o=np.zeros((h,w,4)); o[:,:,:3]=rgb; o[:,:,3]=A*255
    im=Image.fromarray(o.clip(0,255).astype(np.uint8),'RGBA'); ys,xs=np.where(o[:,:,3]>20)
    im=im.crop((xs.min()-2,ys.min()-2,xs.max()+3,ys.max()+3)); im.save(out+'.webp','WEBP',quality=90,method=6)
    print(out, im.size, 'aspect', round(im.size[0]/im.size[1],4))
process('Bilder/Enyaq7.jpg', 'Bilder/hero/7', close_rows=440)
process('Bilder/Enyaq8.jpg', 'Bilder/hero/8', blank=[(200, 0, 560, 68), (990, 0, 1300, 68)])   # Titel „Enyaq iV 50“ entfernen
process('Bilder/Enyaq9.jpg', 'Bilder/hero/9')
