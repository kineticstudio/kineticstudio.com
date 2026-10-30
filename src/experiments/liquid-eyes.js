/* Liquid eyes.

   A small character of clear glass floats over a desktop wallpaper and looks
   around. It is ray-traced per pixel with the same optical renderer as Orb
   tabs (refraction through the volume, a touch of dispersion, internal
   bounces, a studio of softboxes in its reflections, an iridescent film),
   lifted off the wallpaper so the paper below takes its cast shadow and a
   focused caustic, with a light bloom on top. The eyes are part of the glass
   itself: in the opening character they are true holes cut through the
   volume, so the wallpaper shows through them; the others are wells, rings,
   slots, visors, cutouts or two white hot lights inside the glass. It
   breathes and bobs, its surface flows, and when nobody is pointing it
   glances about by itself; over the piece it watches the cursor, and it can
   be dragged somewhere else.

   Ported from a Creative Studio prototype (liquid-glass-src, with the eye
   geometry from liquid-eyes-src), at the owner's saved desktop look: the
   optical shader, the floating lift, the eye volumes and the bloom are the
   prototype's, unchanged. Added here: the idle glances (the prototype only
   looked at the cursor), and Size, which moves the camera in rather than
   resizing the glass, so the optics stay exactly as tuned. Not carried over:
   the colour-volume and stone materials, spectral caustics and the email
   scenes. The page never names the client. */

// the prototype's characters, in its order (its plain "Glass blob" has no eyes, so it is left out)
const CHARACTERS = [
  ["Negative space", 1],
  ["Split personality", 0],
  ["Suspended pupils", 2],
  ["Liquid visor", 3],
  ["Little lookout", 4],
  ["Deep wells", 5],
  ["Twin halos", 6],
  ["Infinity", 7],
  ["Happy cutouts", 8],
  ["Soft slots", 9],
  ["White hot spots", 10],
];
// (Clouds, Hills and Skye, which look like stock photos of unknown origin, stay in the Studio's prototype, off the site)
const BACKDROPS = ["Watercolor", "Paper"];

export const params = {
  character: {
    eyes: { type: "select", options: CHARACTERS.map(([name]) => name), default: "Negative space" },
    size: [1.55, 0.6, 2.6, 0.01],
    breathing: [3, 0, 4, 0.05],
  },
  gaze: {
    glance: [0.7, 0, 1, 0.01],
    aperture: [1, 0.65, 1.45, 0.01],
  },
  glass: {
    refraction: [1.43, 1.05, 2, 0.01],
    exposure: [1.57, 0.8, 2.2, 0.01],
    film: { type: "toggle", labels: ["Clear", "Iridescent"], default: true },
    // white is the prototype's clear glass; a colour stains the volume by the depth light travels through it
    tint: "#ffffff",
  },
  scene: {
    backdrop: { type: "select", options: BACKDROPS, default: "Watercolor" },
  },
};

// The site's root, from <link rel="site-root">, so this also works framed from a folder
const asset = (file) => new URL(`experiments/liquid-eyes/${file}`, document.querySelector('link[rel="site-root"]')?.href ?? `${location.origin}/`).href;
const WALLPAPERS = { Watercolor: "watercolor.webp" };
const DPR_CAP = 2;
const MAX_PIXELS = 3.2e6;

/* ---- the renderer's settings: the prototype's saved desktop look, in its
   uniform order (liquid-glass-src/presets.js savedLook3 with the desktop
   entry's overrides: no frost, centred, upright) ---- */
const SETTINGS = {
  "optical.colorLighting": 0.35, "optical.warmLight": "#ffb16d", "optical.coolLight": "#91bcff", "optical.frost": 0,
  "optical.absorption": 0.35, "optical.lightSize": 1.9, "optical.internalBounces": 2, "optical.microtexture": 0,
  "shape.size": 0.54, "shape.width": 0.86, "shape.height": 0.87, "shape.thickness": 0.56, "shape.floatHeight": 0.8,
  "shape.rotation": 0, "shape.horizontal": 0, "shape.vertical": -0.38, "shape.roundness": 0.78, "shape.organic": 1.2, "shape.secondaryLobe": 0.91,
  "glass.refraction": 1.43, "glass.transmission": 1, "glass.reflections": 0.84, "glass.reflectionSoftness": 0.44, "glass.tint": "#a7cee8",
  "glass.tintStrength": 0, "glass.dispersion": 0.005, "glass.iridescence": 1, "glass.filmHue": 0, "glass.rim": 1, "glass.backgroundDistance": 0.1,
  "lighting.castShadow": 1, "lighting.rotation": 0, "lighting.exposure": 1.57, "lighting.highlights": 1.2, "lighting.contrast": 1,
  "lighting.shadow": 0.045, "lighting.shadowSoftness": 1, "lighting.caustic": 1.476, "lighting.grain": 0.0182,
  "motion.flowSpeed": 1.2, "motion.breathing": 3, "motion.cursorFollow": 1, "motion.stretch": 2.05, "motion.dragPull": 2.25, "motion.spring": 38, "motion.damping": 8,
};
const BLOOM = { amount: 0.9, radius: 4, threshold: 0.88 };
const EYES = { gap: 0.66, hotspotGlow: 1.4, hotspotHalo: 0.6 };
// the paper behind the wallpaper (and the whole of Paper, the prototype's Studio): a soft radial light
const PAPER = { color: "#b1b3b6", gradient: 1, lightX: 48, lightY: 38 };
const UNIFORMS = Object.keys(SETTINGS);
const EYE_UNIFORMS = ["eyes.variant", "eyes.size", "eyes.gap", "eyes.hotspotGlow", "eyes.hotspotHalo", "eyes.reveal"];
const isColor = (k) => typeof SETTINGS[k] === "string";
const rgb = (hex) => [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16) / 255);

const VERTEX = `#version 300 es
in vec2 position;
void main(){gl_Position=vec4(position,0.,1.);}`;

/* The optical renderer (liquid-glass-src/optical-fragment.js), unchanged. */
const OPTICAL = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 resolution;
uniform sampler2D backdrop;
uniform float time;
uniform vec2 pointer;
uniform vec2 velocity;
uniform float press;
uniform float opal;
uniform float aspect;
uniform float worldHeight;
${UNIFORMS.map((k) => `uniform ${isColor(k) ? "vec3" : "float"} ${k.replace(".", "_")};`).join("\n")}
const float PI=3.14159265359;
mat2 rotate(float angle){float c=cos(angle),s=sin(angle);return mat2(c,s,-s,c);}
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
float ellipsoid(vec3 p,vec3 r){float k0=length(p/r);float k1=length(p/(r*r));return k0*(k0-1.)/max(k1,.0001);}
float scene(vec3 p){
  p.xy=rotate(-radians(shape_rotation))*(p.xy-vec2(shape_horizontal,shape_vertical));
  vec3 scale=vec3(shape_size*shape_width,shape_size*shape_height,shape_thickness);
  p/=scale;
  vec2 center=pointer*.12;
  p.xy-=center;
  float breathe=sin(time*.63)*.026*motion_breathing;
  p.xy+=vec2(sin(p.y*2.4+time*.43),sin(p.x*2.7-time*.32))*.054*shape_organic;
  p.xy-=velocity*clamp(p.z,0.,1.)*.045*motion_stretch;
  float body=ellipsoid(p-vec3(-.16,.08,0.),vec3(.83+breathe,.91-breathe,.55));
  vec2 follow=pointer*.36;
  float lobe=ellipsoid(p-vec3(.48+follow.x*.55,-.3+follow.y*.55,.005),vec3(.59,.59,.47)*shape_secondaryLobe);
  float top=ellipsoid(p-vec3(-.36-follow.x*.1,.51+follow.y*.2,-.015),vec3(.54,.58,.46));
  float d=smin(smin(body,lobe,.48*shape_roundness),top,.4*shape_roundness);
  vec2 tip=pointer*.69;
  float pull=ellipsoid(p-vec3(tip,0.),vec3(.41+press*.04*motion_dragPull,.41,.36));
  d=smin(d,pull,(.43+press*.2*motion_dragPull)*shape_roundness);
  return d*min(min(scale.x,scale.y),scale.z)/max(1.,1.+.15*(shape_organic-1.));
}
vec3 normalAt(vec3 p){vec2 e=vec2(.0015,0.);return normalize(vec3(scene(p+e.xyy)-scene(p-e.xyy),scene(p+e.yxy)-scene(p-e.yxy),scene(p+e.yyx)-scene(p-e.yyx)));}
float softbox(vec2 p,vec2 bounds,float feather){
  vec2 q=abs(p)-bounds;
  return 1.-smoothstep(-feather,feather,length(max(q,0.))+min(max(q.x,q.y),0.));
}
vec3 linearColor(vec3 c){return pow(max(c,vec3(0.)),vec3(2.2));}
vec3 environment(vec3 direction){
  vec3 d=direction;
  d.xy=rotate(radians(lighting_rotation))*d.xy;
  vec3 c=mix(vec3(.025,.032,.045),vec3(.55,.58,.62),smoothstep(-.65,.8,d.y));
  c=mix(c,vec3(.018,.022,.03),(1.-smoothstep(-.45,.15,d.z))*.8);
  if(d.z>.001){
    vec2 p=d.xy/max(d.z,.04);
    float feather=.08+glass_reflectionSoftness*.45;
    float key=softbox(p-vec2(-.85,.3),vec2(.24,1.35)*optical_lightSize,feather);
    float top=softbox(p-vec2(.2,1.5),vec2(1.5,.18)*optical_lightSize,feather);
    float side=softbox(p-vec2(1.6,-.1),vec2(.18,.9)*optical_lightSize,feather);
    float flag=softbox(p-vec2(.3,-.9),vec2(1.4,.28),.18);
    c=mix(c,vec3(.009,.011,.015),flag*.9);
    c+=vec3(2.8,2.85,2.9)*key*lighting_highlights;
    c+=vec3(2.)*top*lighting_highlights;
    c+=vec3(.8,.87,1.)*side*lighting_highlights;
  }
  float warm=exp((dot(d,normalize(vec3(-.85,-.25,.3)))-1.)*5.5);
  float cool=exp((dot(d,normalize(vec3(.8,.5,.1)))-1.)*4.5);
  c+=optical_colorLighting*2.5*(linearColor(optical_warmLight)*warm+linearColor(optical_coolLight)*cool);
  return max(vec3(0.),(c-.25)*lighting_contrast+.25);
}
float dielectricFresnel(float cosine,float eta){
  float ci=clamp(abs(cosine),0.,1.);
  float st2=eta*eta*(1.-ci*ci);
  if(st2>=1.)return 1.;
  float ct=sqrt(max(0.,1.-st2));
  float rs=(eta*ci-ct)/max(eta*ci+ct,.00001);
  float rp=(ci-eta*ct)/max(ci+eta*ct,.00001);
  return .5*(rs*rs+rp*rp);
}
vec2 worldUV(vec2 p){return vec2(p.x/(worldHeight*aspect)+.5,p.y/worldHeight+.5);}
vec3 outsideRadiance(vec3 p,vec3 direction,float blur){
  float planeZ=-.68*shape_thickness-glass_backgroundDistance;
  if(direction.z<-.001){
    float distance=(planeZ-p.z)/direction.z;
    if(distance>0.){
      vec2 uv=worldUV(p.xy+direction.xy*distance);
      float lod=optical_frost*(7.5+min(distance,4.))+blur;
      return linearColor(textureLod(backdrop,clamp(uv,vec2(.001),vec2(.999)),lod).rgb);
    }
  }
  return environment(direction);
}
bool exitSurface(inout vec3 p,vec3 direction,out vec3 n,out float distance){
  distance=0.;
  for(int step=0;step<96;step++){
    float d=scene(p);
    if(step>1&&d>-.00018){n=normalAt(p);return true;}
    float advance=max(-d*.85,.0003);
    p+=direction*advance;
    distance+=advance;
    if(distance>8.)break;
  }
  n=normalAt(p);
  return false;
}
vec3 surfaceReflection(vec3 direction,vec3 n,vec3 position){
  vec3 color=environment(direction);
  float grazing=pow(1.-max(n.z,0.),1.4);
  vec3 film=.5+.5*cos(2.*PI*(n.z*.9+position.y*.12)+radians(glass_filmHue)+vec3(0.,2.094,4.188));
  return color*mix(vec3(1.),.45+film*1.1,clamp(opal*glass_iridescence*grazing*.65,0.,.9));
}
vec3 traceGlass(vec3 entry,vec3 normal,float ior){
  vec3 incoming=vec3(0.,0.,-1.);
  float nv=max(normal.z,0.);
  float frontF=dielectricFresnel(nv,1./ior);
  frontF=clamp(frontF*glass_reflections*(1.+(glass_rim-1.)*pow(1.-nv,2.)),0.,1.);
  vec3 reflection=surfaceReflection(reflect(incoming,normal),normal,entry);
  vec3 result=reflection*(1.-(1.-frontF)*glass_transmission);
  vec3 throughput=vec3((1.-frontF)*glass_transmission);
  vec3 direction=refract(incoming,normal,1./ior);
  float spread=glass_dispersion*2.+opal*.004*glass_iridescence;
  float redIOR=max(1.01,ior-spread),blueIOR=ior+spread;
  vec3 redDirection=refract(incoming,normal,1./redIOR);
  vec3 blueDirection=refract(incoming,normal,1./blueIOR);
  float bias=.002*min(shape_size,shape_thickness);
  vec3 p=entry-normal*bias;
  vec3 absorption=-log(max(linearColor(glass_tint),vec3(.01)))*glass_tintStrength*(.2+optical_absorption*3.);
  float traveled=0.;
  for(int bounce=0;bounce<4;bounce++){
    vec3 exitNormal;float distance;
    if(!exitSurface(p,direction,exitNormal,distance))break;
    traveled+=distance;
    throughput*=exp(-absorption*distance);
    vec3 outgoing=refract(direction,-exitNormal,ior);
    vec3 exitF=vec3(dielectricFresnel(dot(direction,exitNormal),ior));
    vec3 emitted=vec3(0.);
    float blur=optical_frost*traveled;
    if(dot(outgoing,outgoing)>.0001)emitted=outsideRadiance(p,outgoing,blur);
    if(spread>.0001){
      vec3 redOut=refract(redDirection,-exitNormal,redIOR);
      vec3 blueOut=refract(blueDirection,-exitNormal,blueIOR);
      exitF.r=dielectricFresnel(dot(redDirection,exitNormal),redIOR);
      exitF.b=dielectricFresnel(dot(blueDirection,exitNormal),blueIOR);
      emitted.r=dot(redOut,redOut)>.0001?outsideRadiance(p+(redDirection-direction)*distance,redOut,blur).r:0.;
      emitted.b=dot(blueOut,blueOut)>.0001?outsideRadiance(p+(blueDirection-direction)*distance,blueOut,blur).b:0.;
    }
    result+=throughput*(1.-exitF)*emitted;
    throughput*=exitF;
    if(float(bounce)>=optical_internalBounces||max(max(throughput.r,throughput.g),throughput.b)<.045)break;
    direction=reflect(direction,exitNormal);
    redDirection=reflect(redDirection,exitNormal);
    blueDirection=reflect(blueDirection,exitNormal);
    p-=exitNormal*bias;
  }
  return result;
}
vec4 renderSample(vec2 pixel){
  vec2 uv=pixel/resolution;
  vec2 p=(uv-.5)*vec2(worldHeight*aspect,worldHeight);
  vec3 c=textureLod(backdrop,uv,0.).rgb;
  float coverage=0.;
  float ground=scene(vec3(p-vec2(.026,-.055),0.));
  c*=1.-exp(-max(ground,0.)*12./lighting_shadowSoftness)*lighting_shadow;
  float caustic=exp(-pow((ground-.045)*35.,2.))*lighting_caustic*(1.-smoothstep(-1.,.6,p.y));
  c+=caustic*vec3(.92,.96,1.);
  float rayTop=.8*shape_thickness+.3;
  vec3 origin=vec3(p,rayTop),direction=vec3(0.,0.,-1.);
  float t=0.,d=1.;
  for(int step=0;step<112;step++){
    d=scene(origin+direction*t);
    if(d<.00012||t>rayTop*2.)break;
    t+=max(d*.86,.0001);
  }
  if(d<.00012&&t<=rayTop*2.){
    coverage=1.;
    vec3 position=origin+direction*t;
    vec3 normal=normalAt(position);
    vec2 textureWave=vec2(sin(position.y*157.+sin(position.x*137.)),cos(position.x*173.+sin(position.y*151.)));
    normal=normalize(normal+vec3(textureWave*.014*optical_microtexture,0.));
    vec3 radiance=traceGlass(position,normal,glass_refraction);
    c=pow(max(radiance*lighting_exposure,vec3(0.)),vec3(1./2.2));
  }
  return vec4(clamp(c,0.,1.),coverage);
}
void main(){
  vec4 center=renderSample(gl_FragCoord.xy);
  vec4 contrast=fwidth(center);
  vec3 c=center.rgb;
  if(max(max(contrast.r,contrast.g),max(contrast.b,contrast.a))>.05){
    c=(renderSample(gl_FragCoord.xy+vec2(-.375,-.125)).rgb
      +renderSample(gl_FragCoord.xy+vec2(.125,-.375)).rgb
      +renderSample(gl_FragCoord.xy+vec2(.375,.125)).rgb
      +renderSample(gl_FragCoord.xy+vec2(-.125,.375)).rgb)*.25;
  }
  float grain=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5;
  fragColor=vec4(c+grain*lighting_grain,1.);
}
`;

/* The characters (liquid-eyes-src/shader.js): the optical material and
   integrator, with only the sculpted volume and the eye treatment changed. */
const GEOMETRY = `
uniform float concept;
uniform float reveal;
uniform float blink;
uniform float eyeGap;
uniform float eyeSize;
uniform vec2 gaze;
vec3 characterPoint(vec3 p){
  p/=shape_size;
  p.xy-=gaze*.065;
  p.y-=sin(time*.65)*.025*motion_breathing;
  return p;
}
float shapeAt(vec3 q){
  float idle=ellipsoid(q,vec3(.72,.74,.48));
  float gap=eyeGap;
  float d;
  if(concept>4.5){
    vec2 look=q.xy-gaze*.11;
    vec2 eye=look;eye.x=abs(eye.x)-gap*.62;
    float cut;
    if(concept<5.5){
      // Deep oval wells, with enough glass between them to read as one face.
      d=ellipsoid(q,vec3(1.,.77,.56));
      vec2 radius=vec2(.205,.36*blink)*eyeSize;
      cut=(length(eye/radius)-1.)*min(radius.x,radius.y);
    }else if(concept<6.5){
      // Independent annular volumes: the entire eye is an empty glass ring.
      vec3 ring=q;ring.x=abs(ring.x)-gap*.91;
      d=ellipsoid(ring,vec3(.43,.56,.29));
      vec2 h=look;h.x=abs(h.x)-gap*.91;
      vec2 radius=vec2(.265,.375*blink)*eyeSize;
      cut=(length(h/radius)-1.)*min(radius.x,radius.y);
    }else if(concept<7.5){
      // Two lens rims fused into a low, liquid infinity mark.
      vec3 l=q-vec3(-gap*.71,0.,0.),r=q-vec3(gap*.71,0.,0.);
      d=smin(ellipsoid(l,vec3(.56,.51,.32)),ellipsoid(r,vec3(.56,.51,.32)),.24);
      vec2 h=look;h.x=abs(h.x)-gap*.71;
      vec2 radius=vec2(.305,.30*blink)*eyeSize;
      cut=(length(h/radius)-1.)*min(radius.x,radius.y);
    }else if(concept<8.5){
      // Curved open slits: a smile carried by the absence of material.
      d=ellipsoid(q,vec3(1.03,.67,.41));
      eye.y-=.12-.48*pow(eye.x/.40,2.);
      vec2 radius=vec2(.25,.115*blink)*eyeSize;
      cut=(length(eye/radius)-1.)*min(radius.x,radius.y)*.65;
    }else{
      // Long capsule apertures give a quieter, more graphic character.
      d=ellipsoid(q,vec3(.92,.77,.45));
      vec2 slot=abs(eye)-vec2(.015,.17*blink)*eyeSize;
      float radius=.115*eyeSize*blink;
      cut=length(max(slot,0.))+min(max(slot.x,slot.y),0.)-radius;
    }
    d=max(d,-cut);
    return mix(idle,d,reveal);
  }
  if(concept<.5){
    // One drop separates into two complete glass eyeballs.
    float x=mix(0.,gap*.92,reveal);
    float r=mix(.72,.43,reveal);
    float a=ellipsoid(q-vec3(-x,.025,0.),vec3(r,r*mix(1.,blink,reveal),.45));
    float b=ellipsoid(q-vec3(x,-.025,0.),vec3(r,r*mix(1.,blink,reveal),.45));
    return smin(a,b,mix(.42,.075,reveal));
  }
  if(concept<1.5){
    // True holes, cut right through the volume to reveal the desktop behind.
    d=ellipsoid(q,vec3(.99,.72,.40));
    vec2 hole=q.xy-vec2(gaze.x*.055,gaze.y*.055+.035);
    hole.x=abs(hole.x)-gap*.59;
    vec2 r=vec2(.17,.29*blink)*eyeSize;
    float cut=(length(hole/r)-1.)*min(r.x,r.y);
    d=max(d,-cut);
  }else if(concept<2.5){
    d=ellipsoid(q,vec3(.84,.82,.47));
    d+=sin(q.y*4.+time*.6)*sin(q.x*3.5-time*.3)*.024;
  }else if(concept<3.5){
    d=ellipsoid(q,vec3(1.13,.55,.39));
  }else{
    // Two connected lobes grow from the body and become the eyes themselves.
    d=ellipsoid(q-vec3(0.,-.31,0.),vec3(.70,.44,.37));
    float x=gap*.67;
    float a=ellipsoid(q-vec3(-x,.30,.035),vec3(.32,.43,.37));
    float b=ellipsoid(q-vec3(x,.36,.035),vec3(.32,.43,.37));
    d=smin(smin(d,a,.32),b,.32);
  }
  return mix(idle,d,reveal);
}
float scene(vec3 p){return shapeAt(characterPoint(p))*shape_size*.78;}
float ovalMask(vec2 p,vec2 radius){return 1.-smoothstep(.84,1.,length(p/radius));}
vec3 eyesOnGlass(vec3 color,vec2 p,float coverage){
  vec3 q=characterPoint(vec3(p,0.));
  if(coverage<.5||concept>.5&&concept<1.5||concept>4.5)return color;
  float gap=eyeGap;
  vec2 e=q.xy;
  vec2 radii;
  if(concept<.5){e.x=abs(e.x)-gap*.92;e.y-=.0;radii=vec2(.125,.17);}
  else if(concept<2.5){e.x=abs(e.x-gaze.x*.065)-gap*.57;e.y-=.025;radii=vec2(.12,.235);}
  else if(concept<3.5){
    float visor=ovalMask(q.xy,vec2(.88,.32));
    color=mix(color,vec3(.075,.115,.10),visor*.86*reveal);
    e.x=abs(e.x)-gap*.57;e.y-=.01;radii=vec2(.11,.19);
  }else{float side=sign(e.x);e.x=abs(e.x)-gap*.67;e.y-=side>0.?.36:.30;radii=vec2(.13,.19);}
  e-=gaze*vec2(.085,.075);
  radii*=vec2(eyeSize,eyeSize*blink);
  float eye=ovalMask(e,radii)*reveal;
  vec3 ink=concept>2.5&&concept<3.5?vec3(.91,.97,.88):vec3(.065,.10,.078);
  color=mix(color,ink,eye*.95);
  // A small reflected light makes the suspended pupils read through the glass.
  float glint=ovalMask(e-vec2(-.031,.05*blink),vec2(.026,.037*blink))*eye;
  color=mix(color,vec3(.94,.98,.92),glint*.8);
  return color;
}
`;

/* The desktop character (liquid-eyes-src/desktop-shader.js): the eyes on the
   floating renderer, sized and placed by the shape dials, the white hot spots
   as two luminous volumes sampled along every refracted ray inside the glass. */
function desktopEyes() {
  const swap = (source, before, after) => {
    if (!source.includes(before)) throw new Error(`liquid-eyes: missing shader anchor: ${before.slice(0, 60)}`);
    return source.replace(before, after);
  };
  const start = OPTICAL.indexOf("float scene(vec3 p){"), end = OPTICAL.indexOf("vec3 normalAt(vec3 p){");
  let f = OPTICAL.slice(0, start) + GEOMETRY + OPTICAL.slice(end);
  f = swap(f, "return vec4(clamp(c,0.,1.),coverage);", "c=eyesOnGlass(c,p,coverage);\n  return vec4(clamp(c,0.,1.),coverage);");
  f = swap(f, "uniform float concept;", "uniform float eyes_variant;\n#define concept eyes_variant");
  f = swap(f, "uniform float reveal;", "uniform float eyes_reveal;\n#define reveal eyes_reveal");
  f = swap(f, "uniform float blink;", "const float blink=1.;");
  f = swap(f, "uniform float eyeGap;", "uniform float eyes_gap;\n#define eyeGap eyes_gap");
  f = swap(f, "uniform float eyeSize;", "uniform float eyes_size;\n#define eyeSize eyes_size");
  f = swap(f, "uniform vec2 gaze;", "uniform vec2 eyesGaze;\n#define gaze eyesGaze");
  f = swap(f, "  if(concept>4.5){", `
  if(concept>9.5){
    float body=ellipsoid(q,vec3(.84,.82,.47));
    body+=sin(q.y*4.+time*.6)*sin(q.x*3.5-time*.3)*.018*shape_organic;
    return mix(idle,body,reveal);
  }
  if(concept>4.5){`);
  f = swap(f, "  p/=shape_size;", `
  p.xy=rotate(-radians(shape_rotation))*(p.xy-vec2(shape_horizontal,shape_vertical));
  p/=vec3(shape_size*shape_width,shape_size*shape_height,shape_thickness);`);
  f = swap(f, "shape_size*.78;", "min(min(shape_size*shape_width,shape_size*shape_height),shape_thickness)*.78;");
  f = withFloating(f);
  // floating, the character is the eye volume; the plain lens's geometry stays for the paper
  const orbAt = f.indexOf("float orbScene(vec3 p){"), sceneAt = f.indexOf("float scene(vec3 p){", orbAt);
  if (orbAt < 0 || sceneAt < 0) throw new Error("liquid-eyes: floating eyes geometry anchor changed.");
  const plain = withFloating(OPTICAL);
  const baseSurface = plain.slice(plain.indexOf("float surfaceScene(vec3 p){"), plain.indexOf("float orbDepth(){")).replace("float surfaceScene(", "float baseSurfaceScene(");
  const baseOrb = plain.slice(plain.indexOf("float orbScene(vec3 p){"), plain.indexOf("float scene(vec3 p){")).replace("float orbScene(", "float baseOrbScene(");
  f = f.slice(0, orbAt) + baseSurface + baseOrb + `float orbScene(vec3 p){
  return mix(baseOrbScene(p),surfaceScene(p),smoothstep(0.,1.,reveal));
}\n` + f.slice(sceneAt);
  f = swap(f, "if(lift<=0.)return surfaceScene(p);", "if(lift<=0.)return baseSurfaceScene(p);");
  f = swap(f, "return mix(surfaceScene(q),orb,lift);", "return mix(baseSurfaceScene(q),orb,lift);");
  f = swap(f, "vec3 eyesOnGlass(vec3 color,vec2 p,float coverage){", "vec3 liftOffset();\nvec3 eyesOnGlass(vec3 color,vec2 p,float coverage){");
  f = swap(f, "vec3 q=characterPoint(vec3(p,0.));", "vec3 q=characterPoint(vec3(p-liftOffset().xy*lift,0.));");
  f = swap(f, "uniform float eyes_variant;", "uniform float eyes_variant;\nuniform float eyes_hotspotGlow;\nuniform float eyes_hotspotHalo;");
  f = swap(f, "vec3 traceGlass(vec3 entry,vec3 normal,float ior){", `
float hotspotAlongRay(vec3 a,vec3 b,vec3 center,float awakening){
  vec3 radius=vec3(.125,.205,.12)*eyeSize;
  vec3 q=(a-center)/radius;
  vec3 ray=(b-a)/radius;
  float t=clamp(-dot(q,ray)/max(dot(ray,ray),.00001),0.,1.);
  float distance2=dot(q+ray*t,q+ray*t);
  // A diffuse internal glow arrives first; white cores gather more slowly.
  float core=7.*exp(-distance2*1.8)*pow(smoothstep(.18,1.,awakening),2.);
  float halo=eyes_hotspotHalo*.55*exp(-distance2*.26)*smoothstep(0.,.65,awakening);
  return (core+halo)*eyes_hotspotGlow;
}
vec3 embeddedEyeLight(vec3 start,vec3 end){
  if(concept<9.5)return vec3(0.);
  vec3 a=characterPoint(start-liftOffset()*lift);
  vec3 b=characterPoint(end-liftOffset()*lift);
  vec3 gazeOffset=vec3(gaze*vec2(.065,.055),.12);
  float light=hotspotAlongRay(a,b,vec3(-eyeGap*.57,.025,0.)+gazeOffset,reveal)
    +hotspotAlongRay(a,b,vec3(eyeGap*.57,.025,0.)+gazeOffset,smoothstep(.035,1.,reveal));
  return vec3(light);
}
vec3 traceGlass(vec3 entry,vec3 normal,float ior){`);
  f = swap(f, "    vec3 exitNormal;float distance;", "    vec3 segmentStart=p;\n    vec3 exitNormal;float distance;");
  f = swap(f, "    throughput*=exp(-absorption*distance);", "    throughput*=exp(-absorption*distance);\n    result+=throughput*embeddedEyeLight(segmentStart,p);");
  return f;
}

/* The floating lift (liquid-glass-src/floating.js): the same renderer with
   the glass lifted off the paper, and a cast shadow and caustic projected
   from its real footprint. */
function withFloating(fragment) {
  const replace = (before, after) => {
    if (!fragment.includes(before)) throw new Error(`Missing floating shader anchor: ${before}`);
    fragment = fragment.replace(before, after);
  };
  replace("uniform float worldHeight;", "uniform float worldHeight;\nuniform float lift;");
  replace("float scene(vec3 p){", "float surfaceScene(vec3 p){");
  replace("vec3 normalAt(vec3 p){", `
float orbDepth(){return shape_size*(.48+.58*shape_thickness);}
vec3 liftOffset(){return vec3(0.,.38+sin(time*.8)*.045*motion_breathing,.65*shape_floatHeight+orbDepth()*.4);}
float orbScene(vec3 p){
  p.xy=rotate(-radians(shape_rotation))*(p.xy-vec2(shape_horizontal,shape_vertical));
  vec3 scale=vec3(shape_size*shape_width,shape_size*shape_height,orbDepth());
  p/=scale;
  p.xy-=pointer*.12;
  float breathe=sin(time*.63)*.024*motion_breathing;
  p+=vec3(sin(p.y*2.7+time*.43),sin(p.z*2.5-time*.32),sin(p.x*2.4+time*.37))*.032*shape_organic;
  p.xy-=velocity*clamp(p.z,0.,1.)*.032*motion_stretch;
  float body=ellipsoid(p,vec3(.91+breathe,.94-breathe,1.));
  vec3 tip=vec3(pointer*.56+vec2(.12,-.1),.08);
  float pull=ellipsoid(p-tip,vec3(.28+.06*press*motion_dragPull,.3,.3)*shape_secondaryLobe);
  float d=smin(body,pull,(.28+.16*press*motion_dragPull)*shape_roundness);
  return d*min(min(scale.x,scale.y),scale.z)/(1.+.12*shape_organic);
}
float scene(vec3 p){
  if(lift<=0.)return surfaceScene(p);
  vec3 q=p-liftOffset()*lift;
  float orb=orbScene(q);
  if(lift>=1.)return orb;
  return mix(surfaceScene(q),orb,lift);
}
float airborneShadow(vec2 p){
  vec2 center=vec2(shape_horizontal+.14,shape_vertical-.95);
  vec2 radius=vec2(.83*shape_size*shape_width,.18*shape_size*shape_height)*lighting_shadowSoftness;
  vec2 q=(p-center)/radius;
  return exp(-dot(q,q)*1.5)*lighting_shadow*.72;
}
float projectedEllipsoid(vec2 p,vec3 center,vec3 radius,vec3 scale,float altitude,vec2 slope){
  mat2 rotation=rotate(radians(shape_rotation));
  vec2 axisX=rotation[0],axisY=rotation[1];
  vec3 r=radius*scale;
  vec2 c=vec2(shape_horizontal,shape_vertical)+rotation*(center.xy*scale.xy)+liftOffset().xy*lift;
  c+=slope*(altitude+center.z*scale.z);
  vec2 q=p-c;
  float rz=r.z*lift;
  float xx=axisX.x*axisX.x*r.x*r.x+axisY.x*axisY.x*r.y*r.y+slope.x*slope.x*rz*rz;
  float yy=axisX.y*axisX.y*r.x*r.x+axisY.y*axisY.y*r.y*r.y+slope.y*slope.y*rz*rz;
  float xy=axisX.x*axisX.y*r.x*r.x+axisY.x*axisY.y*r.y*r.y+slope.x*slope.y*rz*rz;
  float radial=sqrt(max(0.,(yy*q.x*q.x-2.*xy*q.x*q.y+xx*q.y*q.y)/max(xx*yy-xy*xy,.00001)));
  return (radial-1.)*min(r.x,r.y);
}
float projectedFootprint(vec2 p,float altitude,vec2 slope){
  vec3 scale=vec3(shape_size*shape_width,shape_size*shape_height,shape_thickness);
  vec2 follow=pointer*.12;
  float breathe=sin(time*.63)*.026*motion_breathing;
  float orb=projectedEllipsoid(p,vec3(follow,0.),vec3(.91+breathe,.94-breathe,1.),vec3(scale.xy,orbDepth()),altitude,slope);
  float orbPull=projectedEllipsoid(p,vec3(pointer*.56+vec2(.12,-.1)+follow,.08),vec3(.28+.06*press*motion_dragPull,.3,.3)*shape_secondaryLobe,vec3(scale.xy,orbDepth()),altitude,slope);
  orb=smin(orb,orbPull,(.28+.16*press*motion_dragPull)*shape_roundness*min(scale.x,scale.y));
  if(lift>=1.)return orb;
  float body=projectedEllipsoid(p,vec3(vec2(-.16,.08)+follow,0.),vec3(.83+breathe,.91-breathe,.55),scale,altitude,slope);
  float lobe=projectedEllipsoid(p,vec3(vec2(.48,-.3)+pointer*.198+follow,.005),vec3(.59,.59,.47)*shape_secondaryLobe,scale,altitude,slope);
  float top=projectedEllipsoid(p,vec3(vec2(-.36,.51)+pointer*vec2(-.036,.072)+follow,-.015),vec3(.54,.58,.46),scale,altitude,slope);
  float pull=projectedEllipsoid(p,vec3(pointer*.69+follow,0.),vec3(.41+press*.04*motion_dragPull,.41,.36),scale,altitude,slope);
  float blend=min(scale.x,scale.y)*shape_roundness;
  float surface=smin(smin(body,lobe,.48*blend),top,.4*blend);
  surface=smin(surface,pull,(.43+press*.2*motion_dragPull)*blend);
  return mix(surface,orb,lift);
}
vec3 shadePaper(vec2 p,vec3 paper){
  if(lighting_castShadow<.5)return paper;
  float altitude=mix(.055,liftOffset().z+.68*shape_thickness+glass_backgroundDistance,lift);
  vec2 slope=rotate(-radians(lighting_rotation))*vec2(.30,-.60);
  float penumbra=(.025+.145*altitude)*lighting_shadowSoftness;
  vec2 scale=shape_size*vec2(shape_width,shape_height);
  mat2 rotation=rotate(radians(shape_rotation));
  vec2 center=vec2(shape_horizontal,shape_vertical)+rotation*(pointer*.12*scale)+liftOffset().xy*lift+slope*altitude;
  vec2 orbBounds=max(vec2(1.1),abs(pointer*.56+vec2(.12,-.1))+vec2(.5*shape_secondaryLobe+.2*press*motion_dragPull));
  vec2 localBounds=mix(vec2(1.65)+abs(pointer)*.85,orbBounds,lift)*scale;
  vec2 bounds=abs(rotation[0])*localBounds.x+abs(rotation[1])*localBounds.y+abs(slope)*orbDepth()*lift+vec2(penumbra*1.5);
  if(any(greaterThan(abs(p-center),bounds)))return paper;
  float distance=projectedFootprint(p,altitude,slope);
  float coverage=1.-smoothstep(-penumbra,penumbra,distance);
  float border=exp(-pow((distance+.13)/(.16+penumbra*.45),2.));
  float strength=clamp(lighting_shadow*9.,0.,.85);
  float shadow=coverage*strength*(.48+.52*border)/(1.+.12*altitude);
  float focus=(1.-smoothstep(-.68,-.25,distance))*coverage;
  float caustic=focus*lighting_caustic*1.4*mix(.3,1.,lift);
  return clamp(paper*(vec3(1.-shadow)+vec3(.94,.97,1.)*caustic),0.,1.);
}
vec3 normalAt(vec3 p){`);
  replace("float rayTop=.8*shape_thickness+.3;", "float rayTop=.8*shape_thickness+.3+lift*(liftOffset().z+orbDepth()*1.6);");
  replace("return linearColor(textureLod(backdrop,clamp(uv,vec2(.001),vec2(.999)),lod).rgb);",
    "return linearColor(shadePaper(p.xy+direction.xy*distance,textureLod(backdrop,clamp(uv,vec2(.001),vec2(.999)),lod).rgb));");
  replace("c*=1.-exp(-max(ground,0.)*12./lighting_shadowSoftness)*lighting_shadow;",
    "if(lighting_castShadow>.5)c=shadePaper(p,c);else c*=1.-mix(exp(-max(ground,0.)*12./lighting_shadowSoftness)*lighting_shadow,airborneShadow(p),lift);");
  replace("c+=caustic*vec3(.92,.96,1.);", "if(lighting_castShadow<.5)c+=caustic*vec3(.92,.96,1.)*pow(1.-lift,3.);");
  return fragment;
}

/* Bright-pass bloom (liquid-glass-src/bloom.js): the scene stays at native
   resolution; only the glow is downsampled and blurred. */
function createBloom(gl, compile) {
  const header = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform sampler2D source;
uniform vec2 targetSize;
`;
  const programs = [];
  function program(body, names) {
    const handle = gl.createProgram();
    const vs = compile(gl.VERTEX_SHADER, VERTEX), fs = compile(gl.FRAGMENT_SHADER, header + body);
    gl.attachShader(handle, vs);
    gl.attachShader(handle, fs);
    gl.bindAttribLocation(handle, 0, "position");
    gl.linkProgram(handle);
    if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(handle));
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    const uniforms = Object.fromEntries(["source", "targetSize", ...names].map((n) => [n, gl.getUniformLocation(handle, n)]));
    gl.useProgram(handle);
    gl.uniform1i(uniforms.source, 0);
    programs.push(handle);
    return { handle, uniforms };
  }
  const bright = program(`
uniform vec2 sourceSize;
uniform float threshold;
vec3 extractLight(vec2 uv){
  vec3 color=texture(source,uv).rgb;
  float peak=max(max(color.r,color.g),color.b);
  float weight=smoothstep(threshold-.08,threshold+.08,peak);
  return pow(max(color,vec3(0.)),vec3(2.2))*weight;
}
void main(){
  vec2 uv=gl_FragCoord.xy/targetSize,texel=.5/sourceSize;
  vec3 light=extractLight(uv+vec2(-texel.x,-texel.y))+extractLight(uv+vec2(texel.x,-texel.y))+extractLight(uv+vec2(-texel.x,texel.y))+extractLight(uv+vec2(texel.x,texel.y));
  fragColor=vec4(light*.25,1.);
}`, ["sourceSize", "threshold"]);
  const blur = program(`
uniform vec2 direction;
void main(){
  vec2 uv=gl_FragCoord.xy/targetSize;
  vec3 light=texture(source,uv).rgb*.227027027;
  light+=(texture(source,uv+direction*1.3846153846).rgb+texture(source,uv-direction*1.3846153846).rgb)*.3162162162;
  light+=(texture(source,uv+direction*3.2307692308).rgb+texture(source,uv-direction*3.2307692308).rgb)*.0702702703;
  fragColor=vec4(light,1.);
}`, ["direction"]);
  const composite = program(`
uniform sampler2D glow;
uniform float strength;
void main(){
  vec3 scene=texelFetch(source,ivec2(gl_FragCoord.xy),0).rgb;
  vec3 light=texture(glow,gl_FragCoord.xy/targetSize).rgb;
  vec3 color=pow(pow(max(scene,vec3(0.)),vec3(2.2))+light*strength,vec3(1./2.2));
  fragColor=vec4(clamp(color,0.,1.),1.);
}`, ["glow", "strength"]);
  gl.useProgram(composite.handle);
  gl.uniform1i(composite.uniforms.glow, 1);

  const floatGlow = Boolean(gl.getExtension("EXT_color_buffer_float"));
  const target = (hdr) => ({ texture: gl.createTexture(), framebuffer: gl.createFramebuffer(), hdr, width: 0, height: 0 });
  const scene = target(false), glow = target(floatGlow), scratch = target(floatGlow);
  function resizeTarget(t, width, height) {
    if (t.width === width && t.height === height) return;
    t.width = width;
    t.height = height;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const allocate = () => gl.texImage2D(gl.TEXTURE_2D, 0, t.hdr ? gl.RGBA16F : gl.RGBA8, width, height, 0, gl.RGBA, t.hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    allocate();
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE && t.hdr) {
      t.hdr = false;
      allocate();
    }
  }
  function pass(shader, output, input, width, height) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, output?.framebuffer || null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(shader.handle);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input.texture);
    gl.uniform2f(shader.uniforms.targetSize, width, height);
  }
  return {
    begin(width, height) {
      resizeTarget(scene, width, height);
      resizeTarget(glow, Math.max(1, Math.ceil(width / 2)), Math.max(1, Math.ceil(height / 2)));
      resizeTarget(scratch, glow.width, glow.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, scene.framebuffer);
      gl.viewport(0, 0, width, height);
    },
    finish(strength, radius, threshold, pixelRatio) {
      pass(bright, glow, scene, glow.width, glow.height);
      gl.uniform2f(bright.uniforms.sourceSize, scene.width, scene.height);
      gl.uniform1f(bright.uniforms.threshold, threshold);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      pass(blur, scratch, glow, glow.width, glow.height);
      gl.uniform2f(blur.uniforms.direction, (radius * 0.5 * pixelRatio) / scene.width, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      pass(blur, glow, scratch, glow.width, glow.height);
      gl.uniform2f(blur.uniforms.direction, 0, (radius * 0.5 * pixelRatio) / scene.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      pass(composite, null, scene, scene.width, scene.height);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, glow.texture);
      gl.uniform1f(composite.uniforms.strength, strength);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
    },
    destroy() {
      for (const t of [scene, glow, scratch]) {
        gl.deleteTexture(t.texture);
        gl.deleteFramebuffer(t.framebuffer);
      }
      for (const p of programs) gl.deleteProgram(p);
    },
  };
}

/* One change for the web: the edge supersampling also fired on the grain of
   the wallpaper itself, tracing four extra rays through empty paper over most
   of the frame. Here it fires only where the glass is (or borders), which is
   where it shows; the paper's grain is drawn once, as it is anyway. */
const FRAGMENT = desktopEyes().replace(
  "if(max(max(contrast.r,contrast.g),max(contrast.b,contrast.a))>.05){",
  "if(max(center.a,contrast.a)>0.&&max(max(contrast.r,contrast.g),max(contrast.b,contrast.a))>.05){",
);

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const still = Boolean(ctx.reducedMotion);

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:pan-y";
  host.append(canvas);
  // the wallpaper, painted in 2D and handed to the glass as a texture
  const paper = document.createElement("canvas");
  const pctx = paper.getContext("2d");

  let W = 1, H = 1, dpr = 1, cssW = 1, cssH = 1;
  let raf = 0, last = 0, onScreen = true, tabVisible = !document.hidden;
  let time = still ? 1.9 : 0;
  // the character's place on the wallpaper, in world units (the prototype's centre)
  const pos = [SETTINGS["shape.horizontal"], SETTINGS["shape.vertical"]];
  // the body's spring after the cursor, and the gaze (the prototype's), plus the idle glances
  const pointer = [0, 0], target = [0, 0], velocity = [0, 0];
  const gaze = [0, 0];
  let cursorWorld = null, drag = null;
  let look = [0, 0], lookHold = 1.1, reveal = still ? 1 : 0;
  // the piece fades in once its wallpaper is there, and the eyes open over it
  let shown = false;
  const show = () => {
    if (shown) return;
    shown = true;
    (failed ? paper : canvas).style.opacity = "1";
  };
  const showLate = setTimeout(show, 2500);

  const variant = () => (CHARACTERS.find(([name]) => name === v["character.eyes"]) ?? CHARACTERS[0])[1];
  const zoom = () => v["character.size"];
  const worldHeight = () => Math.max(4.3, 3.25 / (cssW / cssH)) / zoom();
  const breathing = () => v["character.breathing"];
  const lifted = () => 0.38 + Math.sin(time * 0.8) * 0.045 * breathing();
  const size = SETTINGS["shape.size"], sw = size * SETTINGS["shape.width"], sh = size * SETTINGS["shape.height"];

  // a pointer in world units (liquid-glass-src/desktop-drag.js desktopWorldPoint)
  function worldPoint(e) {
    const r = canvas.getBoundingClientRect(), h = worldHeight();
    return { x: ((e.clientX - r.left) / r.width - 0.5) * h * (r.width / r.height), y: (0.5 - (e.clientY - r.top) / r.height) * h, width: (h * r.width) / r.height, height: h, pixel: h / r.height };
  }
  const hits = (p) => Math.hypot((p.x - pos[0]) / Math.max(sw * 1.45, p.pixel * 24), (p.y - pos[1] - lifted()) / Math.max(sh * 1.3, p.pixel * 24)) <= 1;
  // keep the character on the wallpaper (desktopDragPosition)
  function place(x, y) {
    const h = worldHeight(), w = (h * cssW) / cssH;
    const margin = Math.max(size * Math.max(SETTINGS["shape.width"], SETTINGS["shape.height"]) * 1.15, (h / cssH) * 16);
    const lx = Math.max(0, w / 2 - margin), ly = Math.max(0, h / 2 - margin), lift = lifted();
    pos[0] = Math.max(-lx, Math.min(lx, x));
    pos[1] = Math.max(-ly - lift, Math.min(ly - lift, y));
  }

  /* ---- the wallpaper ---- */
  const images = new Map();
  function imageFor(name) {
    const file = WALLPAPERS[name];
    if (!file) return null;
    let record = images.get(name);
    if (!record) {
      const image = new Image();
      image.decoding = "async";
      record = { image, ready: false };
      images.set(name, record);
      image.addEventListener("load", () => {
        record.ready = true;
        if (v["scene.backdrop"] === name) paint(), render(), show();
      }, { once: true });
      image.src = asset(file);
    }
    return record.ready ? record.image : null;
  }
  function paint() {
    const w = W, h = H, ground = rgb(PAPER.color).map((c) => c * 255);
    const shade = (d) => `rgb(${ground.map((c, i) => Math.round(Math.max(0, Math.min(255, c + d[i] * PAPER.gradient)))).join(",")})`;
    const grad = pctx.createRadialGradient((w * PAPER.lightX) / 100, (h * PAPER.lightY) / 100, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    grad.addColorStop(0, shade([16, 16, 15]));
    grad.addColorStop(0.6, PAPER.color);
    grad.addColorStop(1, shade([-14, -14, -13]));
    pctx.fillStyle = grad;
    pctx.fillRect(0, 0, w, h);
    const image = imageFor(v["scene.backdrop"]);
    if (!WALLPAPERS[v["scene.backdrop"]] || image) queueMicrotask(show);
    if (image) {
      // cover, centred (paintDesktopScene)
      const cover = Math.max(w / image.naturalWidth, h / image.naturalHeight);
      const dw = image.naturalWidth * cover, dh = image.naturalHeight * cover;
      pctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
    }
    if (gl && !failed) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, paper);
      gl.generateMipmap(gl.TEXTURE_2D);
    }
  }

  /* ---- WebGL ---- */
  const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, powerPreference: "high-performance" });
  let program = null, locations = {}, uniformAt = {}, bloom = null, texture = null, buffer = null, failed = !gl;
  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }
  if (gl) {
    try {
      program = gl.createProgram();
      const vs = compile(gl.VERTEX_SHADER, VERTEX), fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.bindAttribLocation(program, 0, "position");
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      locations = Object.fromEntries(["resolution", "backdrop", "time", "pointer", "eyesGaze", "velocity", "press", "opal", "aspect", "worldHeight", "lift"].map((n) => [n, gl.getUniformLocation(program, n)]));
      uniformAt = Object.fromEntries([...UNIFORMS, ...EYE_UNIFORMS].map((k) => [k, gl.getUniformLocation(program, k.replace(".", "_"))]));
      gl.useProgram(program);
      gl.uniform1i(locations.backdrop, 0);
      bloom = createBloom(gl, compile);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    } catch (error) {
      console.warn("liquid-eyes: the liquid renderer could not start; showing the wallpaper.", error);
      failed = true;
    }
  }
  if (failed) {
    canvas.replaceWith(paper);
    paper.style.cssText = canvas.style.cssText;
  }
  (failed ? paper : canvas).style.opacity = "0";
  (failed ? paper : canvas).style.transition = still ? "none" : "opacity .6s ease";

  function render() {
    if (failed) return;
    const aspect = cssW / cssH, wh = worldHeight();
    const frame = {
      ...SETTINGS,
      "shape.horizontal": pos[0],
      "shape.vertical": pos[1],
      "glass.refraction": v["glass.refraction"],
      "lighting.exposure": v["glass.exposure"],
      "glass.tint": v["glass.tint"],
      "glass.tintStrength": 1,
      "motion.breathing": breathing(),
      // below the prototype's size floor the depth would shrink; at its size it is the dialled depth
      "shape.thickness": SETTINGS["shape.thickness"] * Math.min(1, size / 0.45),
      "eyes.variant": variant(),
      "eyes.size": v["gaze.aperture"],
      "eyes.gap": EYES.gap,
      "eyes.hotspotGlow": EYES.hotspotGlow,
      "eyes.hotspotHalo": EYES.hotspotHalo,
      "eyes.reveal": reveal,
    };
    bloom.begin(W, H);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    for (const [k, loc] of Object.entries(uniformAt)) {
      if (!loc) continue;
      const value = frame[k];
      if (typeof value === "string") gl.uniform3fv(loc, rgb(value));
      else gl.uniform1f(loc, Number(value));
    }
    gl.uniform2f(locations.resolution, W, H);
    gl.uniform1f(locations.aspect, aspect);
    gl.uniform1f(locations.worldHeight, wh);
    gl.uniform1f(locations.time, time);
    gl.uniform2fv(locations.pointer, pointer);
    gl.uniform2fv(locations.velocity, velocity);
    gl.uniform2fv(locations.eyesGaze, gaze);
    gl.uniform1f(locations.lift, 1);
    gl.uniform1f(locations.press, 0);
    gl.uniform1f(locations.opal, v["glass.film"] ? 1 : 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    bloom.finish(BLOOM.amount, BLOOM.radius, BLOOM.threshold, dpr);
  }

  // where the eyes look: the cursor (desktopGaze), or, untouched, a glance somewhere and a hold
  function gazeGoal(dt) {
    if (cursorWorld && !drag) {
      const x = (cursorWorld[0] - pos[0]) / sw, y = (cursorWorld[1] - pos[1] - lifted()) / sh;
      const s = Math.max(1, Math.hypot(x, y) / 1.25);
      return [x / s, y / s];
    }
    lookHold -= dt;
    if (lookHold <= 0) {
      const amount = v["gaze.glance"];
      if (Math.random() < 0.3) look = [0, 0];
      else {
        const a = Math.random() * Math.PI * 2, r = (0.55 + Math.random() * 0.7) * amount;
        look = [Math.cos(a) * r * 1.1, Math.sin(a) * r * 0.8];
      }
      lookHold = 0.7 + Math.random() * 1.9;
    }
    return look;
  }

  function step(dt) {
    time += dt * SETTINGS["motion.flowSpeed"];
    // the body leans after the cursor on the prototype's spring
    for (let i = 0; i < 2; i++) {
      velocity[i] += (target[i] * SETTINGS["motion.cursorFollow"] - pointer[i]) * SETTINGS["motion.spring"] * dt;
      velocity[i] *= Math.exp(-SETTINGS["motion.damping"] * dt);
      pointer[i] += velocity[i] * dt;
    }
    // a quick saccade to the goal, then a hold
    const goal = gazeGoal(dt), k = 1 - Math.exp(-dt / 0.075);
    gaze[0] += (goal[0] - gaze[0]) * k;
    gaze[1] += (goal[1] - gaze[1]) * k;
    // the eyes come on (advanceEyeReveal): never an eyelid, an activation fade
    if (shown && reveal < 1) {
      reveal += (1 - reveal) * (1 - Math.exp(-dt / 0.24));
      if (1 - reveal < 0.0001) reveal = 1;
    }
  }

  function frameLoop(now) {
    raf = requestAnimationFrame(frameLoop);
    const dt = Math.min(0.035, Math.max(0, (now - last) / 1000));
    last = now;
    step(dt);
    render();
  }
  function sync() {
    const run = !still && !failed && onScreen && tabVisible && W > 1;
    if (run && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frameLoop);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function resize() {
    const r = host.getBoundingClientRect();
    cssW = Math.max(1, r.width);
    cssH = Math.max(1, r.height);
    dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1, Math.sqrt(MAX_PIXELS / (cssW * cssH)));
    if (gl && !failed) {
      const max = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
      dpr = Math.min(dpr, max[0] / cssW, max[1] / cssH);
    }
    W = Math.max(1, Math.round(cssW * dpr));
    H = Math.max(1, Math.round(cssH * dpr));
    canvas.width = paper.width = W;
    canvas.height = paper.height = H;
    place(pos[0], pos[1]);
    paint();
    render();
  }

  /* ---- the pointer: the eyes watch it; press on the character to carry it ---- */
  function track(e) {
    const p = worldPoint(e);
    cursorWorld = [p.x, p.y];
    // the body's lean target, in the character's own units (trackPointer)
    const x = (p.x - pos[0]) / sw, y = (p.y - pos[1] - lifted()) / sh, len = Math.hypot(x, y), limit = 1.25;
    target[0] = len > limit ? (x / len) * limit : x;
    target[1] = len > limit ? (y / len) * limit : y;
  }
  const onMove = (e) => {
    if (drag) {
      if (e.pointerId !== drag.id) return;
      const p = worldPoint(e);
      place(p.x - drag.x, p.y - drag.y);
      if (still) render();
      return;
    }
    canvas.style.cursor = e.pointerType === "mouse" && hits(worldPoint(e)) ? "grab" : "";
    track(e);
  };
  const onDown = (e) => {
    if (e.button !== 0 || drag || e.pointerType === "touch") return;
    const p = worldPoint(e);
    if (!hits(p)) return;
    drag = { id: e.pointerId, x: p.x - pos[0], y: p.y - pos[1] };
    target[0] = pointer[0];
    target[1] = pointer[1];
    velocity[0] = velocity[1] = 0;
    canvas.style.cursor = "grabbing";
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const finish = () => {
    if (!drag) return;
    if (canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
    drag = null;
    canvas.style.cursor = "";
    target[0] = target[1] = 0;
  };
  const onLeave = () => {
    if (drag) return;
    target[0] = target[1] = 0;
    cursorWorld = null;
    lookHold = 0.4;
  };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointercancel", finish);
  canvas.addEventListener("lostpointercapture", finish);
  canvas.addEventListener("pointerleave", onLeave);

  const ro = new ResizeObserver(() => {
    resize();
    sync();
  });
  ro.observe(host);
  const io = new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    sync();
  });
  io.observe(host);
  const onVis = () => {
    tabVisible = !document.hidden;
    sync();
  };
  document.addEventListener("visibilitychange", onVis);
  const onLost = (e) => {
    e.preventDefault();
    failed = true;
    sync();
  };
  canvas.addEventListener("webglcontextlost", onLost);

  resize();
  sync();

  return {
    update(values, path) {
      const was = v["character.eyes"];
      Object.assign(v, values);
      // a new character opens its eyes again, as the prototype's do on lift-off
      if (path === "character.eyes" && v["character.eyes"] !== was && !still) reveal = 0;
      if (path == null || path === "character.size") place(pos[0], pos[1]);
      if (path == null || path === "scene.backdrop") paint();
      render();
    },
    action() {},
    destroy() {
      clearTimeout(showLate);
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", finish);
      canvas.removeEventListener("pointercancel", finish);
      canvas.removeEventListener("lostpointercapture", finish);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("webglcontextlost", onLost);
      if (gl && !failed) {
        bloom?.destroy();
        gl.deleteProgram(program);
        gl.deleteTexture(texture);
        gl.deleteBuffer(buffer);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
      canvas.remove();
      paper.remove();
    },
  };
}
