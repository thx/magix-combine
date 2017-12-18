let nativeTags = (() => {
    let tags = 'a,abbr,address,area,article,aside,audio,b,base,bdi,bdo,blockquote,body,br,button,canvas,caption,cite,code,col,colgroup,data,datalist,dd,del,details,dfn,dialog,div,dl,dt,em,embed,fieldset,figcaption,figure,footer,form,h1,h2,h3,h4,h5,h6,head,header,hgroup,hr,html,i,iframe,img,input,ins,kbd,keygen,label,legend,li,link,main,map,mark,menu,menuitem,meta,meter,nav,noscript,object,ol,optgroup,option,output,p,param,pre,progress,q,rb,rp,rt,rtc,ruby,s,samp,script,section,select,small,source,span,strong,style,sub,summary,sup,table,tbody,td,template,textarea,tfoot,th,thead,time,title,tr,track,u,ul,var,video,wbr'.split(',');
    let o = {};
    for (let tag of tags) {
        o[tag] = 1;
    }
    return o;
})();
let svgTags = (() => {
    let tags = 'svg,a,altglyph,altglyphdef,altglyphitem,animate,animatecolor,animatemotion,animatetransform,circle,clippath,color-profile,cursor,defs,desc,discard,ellipse,feblend,fecolormatrix,fecomponenttransfer,fecomposite,feconvolvematrix,fediffuselighting,fedisplacementmap,fedistantlight,fedropshadow,feflood,fefunca,fefuncb,fefuncg,fefuncr,fegaussianblur,feimage,femerge,femergenode,femorphology,feoffset,fepointlight,fespecularlighting,fespotlight,fetile,feturbulence,filter,font,font-face,font-face-format,font-face-name,font-face-src,font-face-uri,foreignobject,g,glyph,glyphref,hatch,hatchpath,hkern,image,line,lineargradient,marker,mask,mesh,meshgradient,meshpatch,meshrow,metadata,missing-glyph,mpath,path,pattern,polygon,polyline,radialgradient,rect,script,set,solidcolor,stop,style,switch,symbol,text,textpath,title,tref,tspan,unknown,use,view,vkern'.split(',');
    let o = {};
    for (let tag of tags) {
        o[tag] = 1;
    }
    return o;
})();
module.exports = {
    nativeTags,
    svgTags
};