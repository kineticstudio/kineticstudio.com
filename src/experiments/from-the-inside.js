/* From the inside.

   The hero of a client homepage in the Creative Studio (round five, "from
   the inside"), on its own: small neutral dots rise one by one up the
   columns of an arch, left to right, each landing at the top of its column
   first; they swell to different sizes; then they grow, in irregular
   pockets that open on the left and the right and spread inward, until
   they close into one continuous field of moving colour. Forest green with
   mossy light, a blurred orange ribbon and a mint band, bent by two nested
   slow warps like a fluid, with film grain. The cursor stirs it: a soft
   brush that turns the colour round it and drags it after the pointer.

   One fragment and vertex shader, as the page draws it (every dot is a
   quad on one shared grid; the colour is computed at each dot's place in
   the world, so overlapping dots never seam, and a single full quad takes
   over once they have closed). At the page's own pace, the 3 s build Hunter
   set. Here it runs on: after a while the field breaks back into dots, they
   fall away right to left, and the arch builds again. The page's copy, nav,
   its scroll into the dark section and the type scramble are left out; the
   arch sits higher, alone on its ground. The page never names the client. */

export const params = {
  build: {
    duration: [3, 1, 12, 0.5],
    dots: [14, 6, 40, 1],
    again: [8, 0, 30, 1],
  },
  shape: {
    width: [88, 30, 120, 1],
    crown: [20, 0, 70, 1],
  },
  flow: {
    speed: [65, 0, 200, 1],
    amount: [110, 0, 200, 1],
    swirl: [110, 0, 250, 1],
  },
  colour: {
    ground: "#d7d4cc",
    palette: { type: "select", options: ["Green", "Blue"] },
  },
  rebuild: { type: "action", label: "Build again" },
};

// Pixel arch v2's settings that stay put, at the page's pace (flight halved with the duration)
const STATE = {
  flightTime: 0.25, sizePhase: 18, morph: 35, sizeVariation: 45, growthStagger: 50, dotScale: 20,
  dotColor: "#66736e", archHeight: 105, grain: 75, fluidity: 70, rotation: 18, rotationDrift: 12, cursorRadius: 45,
  fern: "#325b35", moss: "#8a9b55", mist: "#cee1d3", sectionColor: "#0a1c15",
};
// the two palettes: the page's forest, and the first pixel arch's blue
const PALETTES = {
  Green: { green: true, blue: "#073b25", warm: "#ed914c" },
  Blue: { green: false, blue: "#063975", warm: "#ff943f" },
};
// the build at the page's pace takes `duration`; breaking back into dots is quicker
const UNBUILD = 0.55;

const VERTEX = `
precision highp float;
attribute vec2 corner;
attribute vec2 target;
attribute vec2 sizeSeed;
attribute float delay, growthRank;
uniform vec2 resolution;
uniform float progress, cell, expansion, finalPass, launchY, dotScale, growthStagger, flightSpan, variation, sizeVariation;
varying vec2 local, world;
varying float radius, halfSize;
void main(){
  if(finalPass>.5){
    world=(corner*.5+.5)*resolution; local=vec2(0.);radius=0.;halfSize=0.;
    gl_Position=vec4(corner.x,-corner.y,0.,1.);return;
  }
  float release=delay*(1.-flightSpan);
  float flight=clamp((progress-release)/flightSpan,0.,1.);
  float growth=clamp((expansion-growthRank*growthStagger)/(1.-growthStagger),0.,1.);
  float morph=growth*growth*growth*(growth*(growth*6.-15.)+10.);
  float ease=1.-pow(1.-flight,3.);
  vec2 seed=sizeSeed;
  float sizeWave=.5+.5*sin(seed.x*6.283185+variation*(4.+seed.y*3.));
  float variedSize=cell*.41*dotScale+cell*.18*sizeVariation*(.25+.75*seed.y)*sizeWave*smoothstep(0.,.3,variation);
  halfSize=mix(variedSize,cell*1.55,morph);
  radius=halfSize;
  local=corner*halfSize;
  world=target+local;
  vec2 placed=vec2(target.x,mix(launchY,target.y,ease))+local;
  if(progress<release)placed.y=resolution.y+cell*4.;
  gl_Position=vec4(placed/resolution*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);
}`;
const FRAGMENT = `
precision highp float;
uniform vec4 arch;
uniform float dome, finalPass, clock, grain, flowAmount, fluidity, rotation, cursorAmount, cursorRadius, darkBlend, expansion, greenPalette;
uniform vec3 blue, warm, background, pointer, sectionColor, dotColor;
uniform vec3 fern, moss, mist;
uniform float pixelWidth;
uniform vec2 pointerVelocity;
varying vec2 local, world;
varying float radius, halfSize;
float gauss(vec2 uv,vec2 center,vec2 scale){vec2 p=(uv-center)/scale;return exp(-dot(p,p));}
float archDistance(vec2 p){
  float box=max(max(arch.x-p.x,p.x-arch.x-arch.z),max(arch.y-p.y,p.y-arch.y-arch.w));
  vec2 radii=vec2(arch.z*.5,dome);
  vec2 q=(p-vec2(arch.x+arch.z*.5,arch.y+dome))/radii;
  float ellipse=(dot(q,q)-1.)/max(length(2.*q/radii),.00001);
  return p.y<arch.y+dome?max(box,ellipse):box;
}
void main(){
  float aa=pixelWidth*.75;
  float coverage=1.;
  if(finalPass<.5){
    vec2 q=abs(local)-vec2(halfSize-radius);
    float edge=length(max(q,0.))+min(max(q.x,q.y),0.)-radius;
    coverage=1.-smoothstep(-aa,aa,edge);
  }
  float outline=1.-smoothstep(-aa,aa,archDistance(world));
  if(coverage<=0.)discard;
  vec2 surfaceUv=(world-arch.xy)/arch.zw;
  vec2 uv=surfaceUv;
  vec2 reach=uv-pointer.xy;
  vec2 metric=arch.zw/min(arch.z,arch.w);
  vec2 brush=reach*metric/max(.1,cursorRadius);
  float influence=exp(-dot(brush,brush)*2.)*pointer.z*cursorAmount;
  float turn=influence*1.05;
  vec2 spun=vec2(reach.x*cos(turn)-reach.y*sin(turn),reach.x*sin(turn)+reach.y*cos(turn));
  uv=pointer.xy+spun-pointerVelocity*influence*.2;
  uv-=(pointer.xy-.5)*pointer.z*cursorAmount*.055;
  vec2 centered=uv-.5;
  uv=vec2(centered.x*cos(rotation)-centered.y*sin(rotation),
          centered.x*sin(rotation)+centered.y*cos(rotation))+.5;
  float a=flowAmount,organic=fluidity*a;
  vec2 p=uv+vec2(sin(clock*.53+uv.y*3.1)*.045,cos(clock*.41+uv.x*3.)*.055)*a;
  p+=vec2(sin(uv.y*5.2+clock*.36+sin(uv.x*4.1-clock*.22)),
          cos(uv.x*4.7-clock*.29+sin(uv.y*3.9+clock*.18)))*.095*organic;
  p+=vec2(sin(p.y*9.3+p.x*3.4-clock*.31),
          cos(p.x*8.1-p.y*2.8+clock*.27))*.035*organic;
  vec2 greenUv=p;
  vec3 color=mix(blue,vec3(.004,.11,.14),pow(clamp(p.y,0.,1.),3.));
  color=mix(color,vec3(.137,.427,.69),gauss(p,vec2(.7+sin(clock*.34)*.12*a,.43),vec2(.9,.36))*.82);
  color=mix(color,vec3(.667,.761,.733),gauss(p,vec2(1.05+cos(clock*.28)*.15*a,.6),vec2(.58,.22))*.92);
  p.y+=.13*p.x;
  color=mix(color,vec3(.839,.208,.098),min(1.,gauss(p,vec2(.39+sin(clock*.37)*.12*a,.82+cos(clock*.29)*.06*a),vec2(.8,.17))*1.08));
  color=mix(color,warm,gauss(p,vec2(.72+cos(clock*.31)*.12*a,.79+sin(clock*.43)*.05*a),vec2(.47,.13)));
  if(greenPalette>.5){
    vec2 q=greenUv;
    color=mix(blue,fern,gauss(q,vec2(.48,.52),vec2(.9,.72))*.85);
    color=mix(color,moss,gauss(q,vec2(.72,.83),vec2(.58,.46))*.83);
    color=mix(color,blue,gauss(q,vec2(.47,.22),vec2(.34,.48))*.55);
    float orange=(q.y-(.83-.82*q.x))/.068;
    float orangeReach=(q.x-.08)/.29;
    color=mix(color,warm,exp(-orange*orange-orangeReach*orangeReach)*.98);
    float mint=(q.y-(1.10-.39*q.x))/.125;
    color=mix(color,mist,exp(-mint*mint)*.94);
  }
  float noise=fract(sin(dot(world,vec2(127.1,311.7)))*43758.5453)-.5;
  if(greenPalette>.5){
    vec3 grainPoint=fract(vec3(floor(world/pixelWidth).xyx)*.1031);
    grainPoint+=dot(grainPoint,grainPoint.yzx+33.33);
    noise=fract((grainPoint.x+grainPoint.y)*grainPoint.z)-.5;
  }
  color=clamp(color+noise*grain*mix(.012,.14,greenPalette),0.,1.);
  color=mix(color,sectionColor,smoothstep(.3,1.,surfaceUv.y)*darkBlend*.7);
  color=mix(dotColor,color,smoothstep(.02,.55,expansion));
  gl_FragColor=vec4(mix(background,color,outline),coverage);
}`;

const rgb = (hex) => {
  const s = String(hex).replace("#", "");
  const n = s.length === 3 ? s.replace(/./g, "$&$&") : s;
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
};
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const CORNERS = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1];

/* ---- the page's choreography ---- */
// three phases: assemble tiny dots, vary their sizes, expand
function phases(progress) {
  const { sizePhase, morph } = STATE;
  const expansionStart = 1 - morph / 100, buildEnd = 1 - (morph + sizePhase) / 100;
  return { arrival: clamp(progress / buildEnd), variation: clamp((progress - buildEnd) / (sizePhase / 100)), expansion: clamp((progress - expansionStart) / (1 - expansionStart)) };
}
// every dot's flight takes the same time; the last one lands at the end of the build
function flightSpan(duration) {
  const buildSeconds = duration * (1 - (STATE.sizePhase + STATE.morph) / 100);
  return Math.max(0.01, Math.min(0.9, STATE.flightTime / buildSeconds));
}
// irregular pockets begin on the left, then the right, and spread inward
function growthOrder(x, y, seed) {
  const left = Math.hypot((x - 0.08) * 1.1, (y - 0.38) * 0.45);
  const right = 0.14 + Math.hypot((x - 0.92) * 1.1, (y - 0.26) * 0.45);
  return Math.min(left, right) + seed * 0.22;
}
function growthProgress(expansion, rank, stagger) {
  const spread = stagger / 100, t = clamp((expansion - rank * spread) / (1 - spread));
  return t * t * t * (t * (t * 6 - 15) + 10);
}
function insideArch(x, y, g) {
  if (x < g.left || x > g.left + g.width || y < g.top || y > g.top + g.height) return false;
  return y >= g.top + g.dome || ((x - g.left - g.width / 2) / (g.width / 2)) ** 2 + ((y - g.top - g.dome) / g.dome) ** 2 <= 1;
}
const circleFits = (x, y, r, g) => [-r, r].every((dx) => [-r, r].every((dy) => insideArch(x + dx, y + dy, g)));
function dotSizeSeed(x, y) {
  return [[127.1, 311.7], [269.5, 183.3]].map(([a, b]) => {
    const raw = Math.sin(x * a + y * b) * 43758.5453;
    return Math.fround(raw - Math.floor(raw));
  });
}
// one grid supplies both the arrival targets and the growth wave; columns release left to right
function dotGrid(g, cell) {
  const columns = Math.ceil(g.width / cell), rows = Math.ceil(g.height / cell), out = [];
  const r = cell * ((0.41 * STATE.dotScale) / 100 + (0.18 * STATE.sizeVariation) / 100);
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < columns; col++) {
      const x = g.left + (col + 0.5) * cell, y = g.top + (row + 0.5) * cell;
      if (!circleFits(x, y, r, g)) continue;
      const raw = Math.sin(col * 127.1 + row * 311.7) * 43758.5453;
      out.push({ x, y, row, col, growthRank: growthOrder((x - g.left) / g.width, (y - g.top) / g.height, raw - Math.floor(raw)) });
    }
  if (!out.length) return out;
  let low = Infinity, high = -Infinity;
  for (const d of out) {
    low = Math.min(low, d.growthRank);
    high = Math.max(high, d.growthRank);
  }
  for (const d of out) d.growthRank = (d.growthRank - low) / Math.max(0.0001, high - low);
  out.sort((a, b) => a.col - b.col || a.row - b.row);
  out.forEach((d, i) => (d.delay = i / Math.max(1, out.length - 1)));
  return out;
}

export function mount(host, values, ctx = {}) {
  const v = { ...values };
  const reduced = Boolean(ctx.reducedMotion);
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = `position:absolute;inset:0;width:100%;height:100%;display:block;background:${v["colour.ground"]}`;
  host.append(canvas);

  let gl = canvas.getContext("webgl", { alpha: false, antialias: true, depth: false, powerPreference: "low-power" });
  let program = null, buffer = null, fullBuffer = null, U = {}, A = [], count = 0, lost = false;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function setup() {
    const vs = compile(gl.VERTEX_SHADER, VERTEX), fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    buffer = gl.createBuffer();
    fullBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, fullBuffer);
    const data = [];
    for (let i = 0; i < 12; i += 2) data.push(CORNERS[i], CORNERS[i + 1], 0, 0, 0, 0, 0, 0);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    U = Object.fromEntries(
      ["resolution", "progress", "cell", "expansion", "finalPass", "launchY", "dotScale", "growthStagger", "flightSpan", "variation", "sizeVariation", "arch", "dome", "clock", "grain", "flowAmount", "fluidity", "rotation", "cursorAmount", "cursorRadius", "pointerVelocity", "pointer", "darkBlend", "sectionColor", "dotColor", "blue", "warm", "background", "pixelWidth", "greenPalette", "fern", "moss", "mist"].map((n) => [n, gl.getUniformLocation(program, n)]),
    );
    A = ["corner", "target", "delay", "growthRank", "sizeSeed"].map((n) => gl.getAttribLocation(program, n));
  }
  try {
    if (gl) setup();
  } catch (e) {
    console.warn("from-the-inside:", e);
    gl = null;
  }

  let W = 1, H = 1, geo = null, cell = 14;
  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    // the page renders this at full display density; two is plenty
    const scale = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(8_000_000 / (W * H)));
    canvas.width = Math.max(1, Math.round(W * scale));
    canvas.height = Math.max(1, Math.round(H * scale));
    rebuildGrid();
  }
  // the arch: as wide as the dial, its crown where the dial puts it, running off the foot of the stage
  function rebuildGrid() {
    const w = (W * v["shape.width"]) / 100, h = (H * STATE.archHeight) / 100;
    geo = { left: (W - w) / 2, top: (H * v["shape.crown"]) / 100, width: w, height: h, dome: Math.min(w * 0.5, h * 0.72) };
    cell = Math.max(v["build.dots"], Math.sqrt((geo.width * geo.height) / 14000));
    if (!gl || lost) return;
    const dots = dotGrid(geo, cell);
    const data = new Float32Array(dots.length * 48);
    let o = 0;
    for (const { x, y, delay, growthRank } of dots) {
      const [s0, s1] = dotSizeSeed(x, y);
      for (let i = 0; i < 12; i += 2) {
        data[o++] = CORNERS[i];
        data[o++] = CORNERS[i + 1];
        data[o++] = x;
        data[o++] = y;
        data[o++] = delay;
        data[o++] = growthRank;
        data[o++] = s0;
        data[o++] = s1;
      }
    }
    count = dots.length * 6;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  }

  /* ---- the clocks: the build's progress, the flow's time, the pointer ---- */
  let progress = reduced ? 1 : 0, dir = 1, rest = 0, time = 0;
  let raf = 0, last = 0, acc = 0, onScreen = true, tabVisible = !document.hidden;
  const pointer = { x: 0.5, y: 0.5, strength: 0, vx: 0, vy: 0 }, aim = { x: 0.5, y: 0.5, strength: 0 };

  function draw() {
    if (!gl || lost || !geo) return;
    const pal = PALETTES[v["colour.palette"]] ?? PALETTES.Green;
    const prog = reduced ? 1 : progress, clock = reduced ? 0 : time;
    const p = phases(prog);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program);
    const bg = rgb(v["colour.ground"]);
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(U.resolution, W, H);
    gl.uniform1f(U.progress, p.arrival);
    gl.uniform1f(U.cell, cell);
    gl.uniform1f(U.flightSpan, flightSpan(v["build.duration"]));
    gl.uniform1f(U.variation, p.variation);
    gl.uniform1f(U.sizeVariation, STATE.sizeVariation / 100);
    gl.uniform1f(U.expansion, p.expansion);
    gl.uniform1f(U.launchY, H + cell * 2);
    gl.uniform1f(U.dotScale, STATE.dotScale / 100);
    gl.uniform1f(U.growthStagger, STATE.growthStagger / 100);
    gl.uniform4f(U.arch, geo.left, geo.top, geo.width, geo.height);
    gl.uniform1f(U.dome, geo.dome);
    gl.uniform1f(U.clock, clock);
    gl.uniform1f(U.grain, STATE.grain / 100);
    gl.uniform1f(U.flowAmount, v["flow.amount"] / 100);
    gl.uniform1f(U.fluidity, STATE.fluidity / 100);
    gl.uniform1f(U.rotation, ((STATE.rotation + Math.sin(clock * 0.25) * STATE.rotationDrift * (v["flow.amount"] / 100)) * Math.PI) / 180);
    const strength = reduced ? 0 : pointer.strength;
    gl.uniform3f(U.pointer, (pointer.x * W - geo.left) / geo.width, (pointer.y * H - geo.top) / geo.height, strength);
    gl.uniform2f(U.pointerVelocity, (pointer.vx * W) / geo.width, (pointer.vy * H) / geo.height);
    gl.uniform1f(U.cursorRadius, STATE.cursorRadius / 100);
    gl.uniform1f(U.cursorAmount, v["flow.swirl"] / 100);
    gl.uniform1f(U.darkBlend, 0);
    gl.uniform3fv(U.sectionColor, rgb(STATE.sectionColor));
    gl.uniform3fv(U.dotColor, rgb(STATE.dotColor));
    gl.uniform3fv(U.blue, rgb(pal.blue));
    gl.uniform3fv(U.warm, rgb(pal.warm));
    gl.uniform1f(U.greenPalette, pal.green ? 1 : 0);
    gl.uniform3fv(U.fern, rgb(STATE.fern));
    gl.uniform3fv(U.moss, rgb(STATE.moss));
    gl.uniform3fv(U.mist, rgb(STATE.mist));
    gl.uniform3fv(U.background, bg);
    gl.uniform1f(U.pixelWidth, Math.max(W / canvas.width, H / canvas.height));
    // overlapping grown circles already cover what the final quad covers
    const complete = p.arrival === 1 && growthProgress(p.expansion, 1, STATE.growthStagger) === 1;
    if (complete) gl.disable(gl.BLEND);
    else {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
    gl.uniform1f(U.finalPass, complete ? 1 : 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, complete ? fullBuffer : buffer);
    const sizes = [2, 2, 1, 1, 2], offs = [0, 8, 16, 20, 24];
    for (let i = 0; i < 5; i++) {
      if (A[i] < 0) continue;
      gl.enableVertexAttribArray(A[i]);
      gl.vertexAttribPointer(A[i], sizes[i], gl.FLOAT, false, 32, offs[i]);
    }
    gl.drawArrays(gl.TRIANGLES, 0, complete ? 6 : count);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const delta = Math.min(60, Math.max(0, now - last));
    last = now;
    acc += delta;
    // the page's own frame rate: 60 while the dots are in the air, 30 for the field
    const flying = phases(progress).arrival < 1;
    if (acc < 1000 / (flying ? 60 : 30)) return;
    const dt = acc / 1000;
    acc = 0;
    const again = v["build.again"];
    if (dir > 0) {
      progress = Math.min(1, progress + dt / v["build.duration"]);
      if (progress >= 1 && again > 0) {
        rest += dt;
        if (rest >= again) {
          dir = -1;
          rest = 0;
        }
      }
    } else {
      // breaking back into dots and falling away, then a breath, then the build again
      progress = Math.max(0, progress - dt / (v["build.duration"] * UNBUILD));
      if (progress <= 0) {
        rest += dt;
        if (rest >= 0.5) {
          dir = 1;
          rest = 0;
        }
      }
    }
    time += dt * (v["flow.speed"] / 100);
    const follow = 1 - Math.exp(-delta / 180), dragFollow = 1 - Math.exp(-delta / 220);
    for (const [axis, vel] of [["x", "vx"], ["y", "vy"]]) {
      const drag = clamp((aim[axis] - pointer[axis]) * 4, -0.6, 0.6);
      pointer[vel] += (drag - pointer[vel]) * dragFollow;
    }
    for (const k of ["x", "y", "strength"]) pointer[k] += (aim[k] - pointer[k]) * follow;
    draw();
  }

  function sync() {
    const run = !reduced && !lost && !!gl && onScreen && tabVisible && W > 1;
    if (run && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  const onMove = (e) => {
    if (reduced || e.pointerType === "touch") return;
    const r = host.getBoundingClientRect();
    aim.x = (e.clientX - r.left) / r.width;
    aim.y = (e.clientY - r.top) / r.height;
    aim.strength = 1;
  };
  const onLeave = () => (aim.strength = 0);
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerleave", onLeave);

  const onLost = (e) => {
    e.preventDefault();
    lost = true;
    sync();
  };
  const onRestored = () => {
    lost = false;
    try {
      setup();
      rebuildGrid();
      draw();
    } catch {
      gl = null;
    }
    sync();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  const ro = new ResizeObserver(() => {
    resize();
    draw();
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

  resize();
  draw();
  sync();

  return {
    update(nv, path) {
      Object.assign(v, nv);
      canvas.style.background = v["colour.ground"];
      if (path == null || path === "build.dots" || path === "shape.width" || path === "shape.crown") rebuildGrid();
      draw();
    },
    action(name) {
      if (name !== "rebuild" || reduced) return;
      progress = 0;
      dir = 1;
      rest = 0;
      draw();
    },
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      if (gl) {
        gl.deleteBuffer(buffer);
        gl.deleteBuffer(fullBuffer);
        gl.deleteProgram(program);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
      canvas.remove();
    },
  };
}
