/* Orb tabs.

   Demi's liquid-glass study, as tabs (clients/demi/prototypes/Orb-tabs.html
   with liquid-glass-src and orb-tabs-src). Four coloured dots sit on grey
   paper; a lens of clear glass floats over the chosen one and, when another
   is picked, travels there on an exact damped spring, stretching along its
   velocity and settling with a little bounce. It is ray-traced per pixel:
   the paper and its dots are a texture the glass refracts (with a touch of
   dispersion and frost, internal bounces, a studio of softboxes in its
   reflections), and the paper under it takes a cast shadow and a focused
   caustic. A light bloom picks up the white labels. When nobody is choosing,
   it tours the tabs by itself.

   The labels were set in DM Sans; they are set here in the site's own
   grotesk (Neue Montreal), which is bundled with it. */

const LABELS = ["Meetings", "Email", "Messages", "Tasks"];

const DOT_SETS = [
  { id: "electric", label: "Electric", colors: ["#10ef62", "#ffd63d", "#0561ff", "#ae00ff"] },
  { id: "soft", label: "Soft", colors: ["#77f283", "#f2d060", "#2a62f4", "#a11fee"] },
  { id: "warm", label: "Warm", colors: ["#ff7a45", "#ffd63d", "#ff4f8b", "#7a3cff"] },
];

export const params = {
  tabs: {
    active: { type: "select", options: LABELS, default: "Email" },
    tour: { type: "toggle", labels: ["Click only", "Tour"], default: true },
    dots: { type: "swatches", label: "Dots", options: DOT_SETS, default: "electric" },
  },
  travel: {
    speed: [8, 3, 18, 0.25],
    bounce: [0.24, 0, 0.65, 0.01],
    stretch: [0.55, 0, 2, 0.05],
  },
  glass: {
    size: [1.17, 0.8, 1.6, 0.01],
    refraction: [1.34, 1.05, 2, 0.01],
    film: { type: "toggle", labels: ["Clear", "Iridescent"], default: false },
  },
  colour: { ground: "#bdbdbd" },
};

const FACES = import.meta.glob("../assets/fonts/PPNeueMontreal-Regular.woff2", { query: "?url", import: "default", eager: true });
const FAMILY = "Orb Tabs Grotesk";

/* ---- the renderer's settings: the optical version's defaults, then the
   orb tabs' own (liquid-glass-src/parameters.js, orb-tabs-src/experience.js) ---- */
const SETTINGS = {
  "optical.colorLighting": 0.35, "optical.warmLight": "#ffb16d", "optical.coolLight": "#91bcff", "optical.frost": 0.035,
  "optical.absorption": 0.3, "optical.lightSize": 1.3, "optical.internalBounces": 2, "optical.microtexture": 0,
  "shape.size": 1.17, "shape.width": 1, "shape.height": 1, "shape.thickness": 0.72, "shape.floatHeight": 0.4,
  "shape.rotation": 0, "shape.horizontal": 0, "shape.vertical": 0, "shape.roundness": 1, "shape.organic": 0.65, "shape.secondaryLobe": 1,
  "glass.refraction": 1.34, "glass.transmission": 1, "glass.reflections": 1, "glass.reflectionSoftness": 0.28, "glass.tint": "#a7cee8",
  "glass.tintStrength": 0, "glass.dispersion": 0.007, "glass.iridescence": 1, "glass.filmHue": 0, "glass.rim": 1, "glass.backgroundDistance": 0.08,
  "lighting.castShadow": 1, "lighting.rotation": 0, "lighting.exposure": 1, "lighting.highlights": 1, "lighting.contrast": 1,
  "lighting.shadow": 0.06, "lighting.shadowSoftness": 0.65, "lighting.caustic": 1.5, "lighting.grain": 0.0012,
  "motion.flowSpeed": 0.55, "motion.breathing": 1, "motion.cursorFollow": 0, "motion.stretch": 0.65, "motion.dragPull": 1, "motion.spring": 38, "motion.damping": 8,
};
const BLOOM = { amount: 0.25, radius: 5, threshold: 0.98 };
const UNIFORMS = Object.keys(SETTINGS);
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

/* The floating orb (liquid-glass-src/floating.js): the same renderer with
   the glass lifted off the paper into a lens, and a cast shadow and caustic
   projected from its real footprint. */
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

/* The tabs keep the study's caustic and shadow bands proportional at tab size
   (orb-tabs-src/experience.js shader()). */
function atTabScale(fragment) {
  const swaps = [
    ["float penumbra=(.025+.145*altitude)*lighting_shadowSoftness;", "float penumbra=(.025*shape_size+.145*altitude)*lighting_shadowSoftness;"],
    ["float border=exp(-pow((distance+.13)/(.16+penumbra*.45),2.));", "float border=exp(-pow((distance+.13*shape_size)/(.16*shape_size+penumbra*.45),2.));"],
    ["float focus=(1.-smoothstep(-.68,-.25,distance))*coverage;", "float focus=(1.-smoothstep(-.68*shape_size,-.25*shape_size,distance))*coverage;"],
  ];
  for (const [a, b] of swaps) {
    if (!fragment.includes(a)) throw new Error("Missing tab-scale shader anchor.");
    fragment = fragment.replace(a, b);
  }
  return fragment;
}

/* Exact damped spring, stable at any frame cadence and continuous on retarget. */
function advanceTravel(position, velocity, target, dt, omega, damping) {
  const offset = position - target;
  const decay = Math.exp(-damping * omega * dt);
  let next, speed;
  if (damping < 0.999) {
    const wd = omega * Math.sqrt(1 - damping * damping), a = offset, b = (velocity + damping * omega * offset) / wd;
    const c = Math.cos(wd * dt), s = Math.sin(wd * dt);
    next = target + decay * (a * c + b * s);
    speed = decay * (-a * wd * s + b * wd * c - damping * omega * (a * c + b * s));
  } else {
    const step = (velocity + omega * offset) * dt;
    next = target + (offset + step) * decay;
    speed = (velocity - omega * step) * decay;
  }
  return Math.abs(next - target) < 0.00002 && Math.abs(speed) < 0.0002 ? [target, 0] : [next, speed];
}

/* The screenshot's asymmetric arrangement, centred with generous margins.
   On a tall stage the four stack into a diamond so each stays a fair size. */
function dotLayout(width, height, size = 1) {
  const tall = height > width * 1.15;
  const diameter = (tall ? Math.min(width * 0.3, height * 0.16) : Math.min(width * 0.172, height * 0.194)) * size;
  const margin = diameter * 0.72;
  const clamp = (value, max) => Math.max(margin, Math.min(max - margin, value));
  const at = tall ? [[0.27, 0.42], [0.5, 0.27], [0.73, 0.42], [0.6, 0.66]] : [[0.26, 0.47], [0.5, 0.315], [0.735, 0.47], [0.59, 0.76]];
  return { diameter, points: at.map(([x, y]) => [clamp(width * x, width), clamp(height * y, height)]) };
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

const luminance = (hex) => {
  const lin = rgb(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return lin[0] * 0.2126 + lin[1] * 0.7152 + lin[2] * 0.0722;
};

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const still = Boolean(ctx.reducedMotion);

  const wrap = document.createElement("div");
  wrap.style.cssText = "position:absolute;inset:0;overflow:hidden";
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none";
  const list = document.createElement("div");
  list.setAttribute("role", "tablist");
  list.setAttribute("aria-label", "Choose a workspace");
  list.style.cssText = "position:absolute;inset:0;pointer-events:none";
  wrap.append(canvas, list);
  host.append(wrap);

  // the paper and its dots, painted in 2D and handed to the glass as a texture
  const paper = document.createElement("canvas");
  const pctx = paper.getContext("2d");

  let face = null;
  const faceUrl = Object.values(FACES)[0];
  const family = () => (face && face.status === "loaded" ? `"${FAMILY}", ` : "") + '"Helvetica Neue", Helvetica, Arial, sans-serif';

  const active = () => Math.max(0, LABELS.indexOf(v["tabs.active"]));
  let current = active();
  const colors = () => (DOT_SETS.find((d) => d.id === v["tabs.dots"]) ?? DOT_SETS[0]).colors;

  const buttons = LABELS.map((label, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "tab");
    b.textContent = label;
    b.style.cssText = "position:absolute;display:block;transform:translate(-50%,-50%);border:0;border-radius:50%;padding:0;background:transparent;color:transparent;font-size:0;cursor:pointer;pointer-events:auto;-webkit-tap-highlight-color:transparent;touch-action:manipulation;outline-offset:8px";
    b.addEventListener("click", () => choose(i, true));
    b.addEventListener("keydown", (e) => {
      let next = i;
      if (["ArrowRight", "ArrowDown"].includes(e.key)) next = (i + 1) % 4;
      else if (["ArrowLeft", "ArrowUp"].includes(e.key)) next = (i + 3) % 4;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = 3;
      else return;
      e.preventDefault();
      choose(next, true);
      buttons[next].focus({ preventScroll: true });
    });
    list.append(b);
    return b;
  });

  let W = 1, H = 1, dpr = 1, cssW = 1, cssH = 1;
  let position = null, velocity = [0, 0];
  let time = 0, raf = 0, last = 0;
  let onScreen = true, tabVisible = !document.hidden;
  let pointerIn = false, lastChoice = 0, clock = 0;

  const layout = () => dotLayout(W, H, 1);
  const target = () => layout().points[current].map((value, i) => value / (i ? H : W));

  function syncButtons() {
    buttons.forEach((b, i) => {
      b.setAttribute("aria-selected", String(i === current));
      b.tabIndex = i === current ? 0 : -1;
    });
  }

  function paint() {
    const ground = v["colour.ground"];
    pctx.fillStyle = ground;
    pctx.fillRect(0, 0, W, H);
    const { diameter, points } = layout();
    const set = colors();
    for (const [i, [x, y]] of points.entries()) {
      const color = set[i];
      pctx.fillStyle = color;
      pctx.beginPath();
      pctx.arc(x, y, diameter / 2, 0, Math.PI * 2);
      pctx.fill();
      pctx.fillStyle = luminance(color) > 0.35 ? "#111111" : "#ffffff";
      let size = diameter * 0.153;
      const font = () => `400 ${size}px ${family()}`;
      pctx.font = font();
      size *= Math.min(1, (diameter * 0.82) / Math.max(1, pctx.measureText(LABELS[i]).width));
      pctx.font = font();
      pctx.textAlign = "center";
      pctx.textBaseline = "middle";
      pctx.fillText(LABELS[i], x, y);
      Object.assign(buttons[i].style, { left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%`, width: `${(diameter / W) * 100}%`, height: `${(diameter / H) * 100}%` });
    }
    if (gl) {
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
      const vs = compile(gl.VERTEX_SHADER, VERTEX), fs = compile(gl.FRAGMENT_SHADER, atTabScale(withFloating(OPTICAL)));
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.bindAttribLocation(program, 0, "position");
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      locations = Object.fromEntries(["resolution", "backdrop", "time", "pointer", "velocity", "press", "opal", "aspect", "worldHeight", "lift"].map((n) => [n, gl.getUniformLocation(program, n)]));
      uniformAt = Object.fromEntries(UNIFORMS.map((k) => [k, gl.getUniformLocation(program, k.replace(".", "_"))]));
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
      console.warn("orb-tabs: the liquid renderer could not start; showing the flat tabs.", error);
      failed = true;
    }
  }
  if (failed) {
    // no glass: the paper and its dots on their own
    canvas.replaceWith(paper);
    paper.style.cssText = canvas.style.cssText;
  }

  function render() {
    if (failed) return;
    const worldHeight = Math.max(4.3, 3.25 / (cssW / cssH));
    const p = position || target(), aspect = cssW / cssH;
    const settings = { ...SETTINGS, "shape.size": v["glass.size"], "glass.refraction": v["glass.refraction"] };
    // the orb's size and place follow the chosen dot; its depth and paper gap scale with it
    const size = (layout().diameter / H) * worldHeight * 0.54 * settings["shape.size"];
    const lift = 1;
    const frame = {
      ...settings,
      "shape.size": size,
      "shape.horizontal": (p[0] - 0.5) * worldHeight * aspect,
      "shape.vertical": (0.5 - p[1]) * worldHeight - lift * (0.38 + Math.sin(time * 0.8) * 0.045 * settings["motion.breathing"]),
      "shape.thickness": settings["shape.thickness"] * size,
      "glass.backgroundDistance": settings["glass.backgroundDistance"] * size,
      "shape.floatHeight": settings["shape.floatHeight"] * size,
    };
    const strength = v["travel.stretch"];
    const stretch = [velocity[0] * aspect, -velocity[1]].map((x) => Math.max(-5, Math.min(5, ((x * worldHeight) / Math.max(size, 0.1)) * strength)));

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
    gl.uniform1f(locations.worldHeight, worldHeight);
    gl.uniform1f(locations.time, time);
    gl.uniform2f(locations.pointer, 0, 0);
    gl.uniform2fv(locations.velocity, stretch);
    gl.uniform1f(locations.lift, lift);
    gl.uniform1f(locations.press, 0);
    gl.uniform1f(locations.opal, v["glass.film"] ? 1 : 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    bloom.finish(BLOOM.amount, BLOOM.radius, BLOOM.threshold, dpr);
  }

  function choose(i, byHand) {
    if (byHand) lastChoice = clock;
    if (i === current) return;
    current = i;
    syncButtons();
    if (still) {
      position = target();
      velocity = [0, 0];
      render();
    }
    sync();
  }

  function advance(dt) {
    if (!position) position = target();
    const destination = target();
    let moving = false;
    for (let i = 0; i < 2; i++) {
      if (position[i] !== destination[i] || velocity[i] !== 0) moving = true;
      [position[i], velocity[i]] = still ? [destination[i], 0] : advanceTravel(position[i], velocity[i], destination[i], dt, v["travel.speed"], 1 - v["travel.bounce"]);
    }
    return moving;
  }

  // the tour: when nobody has chosen for a while, the orb moves on by itself
  const TOUR = [1, 0, 3, 2];
  function tour() {
    if (!v["tabs.tour"] || pointerIn || clock - lastChoice < 3200) return;
    const at = TOUR.indexOf(current);
    lastChoice = clock;
    current = TOUR[(at + 1) % TOUR.length];
    syncButtons();
  }

  function frameLoop(now) {
    raf = requestAnimationFrame(frameLoop);
    const dt = Math.min(0.035, Math.max(0, (now - last) / 1000));
    last = now;
    clock += dt * 1000;
    time += dt * SETTINGS["motion.flowSpeed"];
    tour();
    advance(dt);
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
    dpr = Math.min(2, window.devicePixelRatio || 1);
    if (gl && !failed) {
      const max = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
      dpr = Math.min(dpr, max[0] / cssW, max[1] / cssH);
    }
    W = Math.max(1, Math.round(cssW * dpr));
    H = Math.max(1, Math.round(cssH * dpr));
    canvas.width = paper.width = W;
    canvas.height = paper.height = H;
    position = target();
    velocity = [0, 0];
    paint();
    render();
  }

  const onEnter = () => (pointerIn = true);
  const onLeave = () => {
    pointerIn = false;
    lastChoice = clock;
  };
  wrap.addEventListener("pointerenter", onEnter);
  wrap.addEventListener("pointerleave", onLeave);

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

  if (faceUrl) {
    face = new FontFace(FAMILY, `url(${faceUrl}) format("woff2")`, { weight: "400" });
    document.fonts.add(face);
    face.load().then(() => {
      paint();
      render();
    }).catch(() => {});
  }

  syncButtons();
  resize();
  sync();

  return {
    update(values, path) {
      Object.assign(v, values);
      if (path == null || path === "tabs.active") {
        lastChoice = clock;
        const i = active();
        if (i !== current) choose(i, true);
      }
      if (path == null || path === "tabs.dots" || path === "colour.ground") paint();
      render();
    },
    action() {},
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      wrap.removeEventListener("pointerenter", onEnter);
      wrap.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("webglcontextlost", onLost);
      if (face) document.fonts.delete(face);
      if (gl && !failed) {
        bloom?.destroy();
        gl.deleteProgram(program);
        gl.deleteTexture(texture);
        gl.deleteBuffer(buffer);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
      wrap.remove();
    },
  };
}
