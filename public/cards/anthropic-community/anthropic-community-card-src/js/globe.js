/* The community globe, rebuilt live and light: one canvas, no libraries.

   A sphere of land dots on latitude rows, the cities the community meets in as
   clay markers, hairline arcs between neighbouring cities and the thin outline
   of the sphere, seen from just above the equator the way Kinetic's globe was.
   Drawn with a minimal WebGL (one draw call per kind: dots, lines, markers,
   ring); where WebGL is missing it falls back to the 2D canvas with the same
   maths. It never runs on its own: the card calls draw() from its own
   requestAnimationFrame loop with the turn it wants, so the globe follows the
   card's clock and pauses with it.

   Coordinates: the canvas is a box on the miniature's page, in design px; the
   view is given in the same px (the sphere's centre and its outline radius on
   the page). window.ACGlobe.create(canvas) returns the handle. */
(function () {
  'use strict';
  const RAD = Math.PI / 180;
  const unit = (lat, lon) => {
    const a = lat * RAD, b = lon * RAD;
    return [Math.cos(a) * Math.cos(b), Math.cos(a) * Math.sin(b), Math.sin(a)];
  };
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

  // mirror: the land as Kinetic's globe drew it, east and west swapped under the
  // city markers (what the recording shows); false puts it back true to the map
  function decodeDots(b64, mirror) {
    const bin = atob(b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const ll = new Int16Array(u8.buffer), n = ll.length / 2, out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) out.set(unit(ll[2 * i] / 100, (mirror ? -1 : 1) * ll[2 * i + 1] / 100), 3 * i);
    return out;
  }
  // great-circle arcs between linked cities, as line-segment pairs
  function arcs(cities, links) {
    const v = [];
    for (const [i, j] of links) {
      const a = unit(cities[i][1], cities[i][2]), b = unit(cities[j][1], cities[j][2]);
      const om = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
      const n = Math.max(2, Math.ceil(om / (1.5 * RAD)));
      let prev = a;
      for (let k = 1; k <= n; k++) {
        const t = k / n, s0 = Math.sin((1 - t) * om) / Math.sin(om), s1 = Math.sin(t * om) / Math.sin(om);
        const p = [a[0] * s0 + b[0] * s1, a[1] * s0 + b[1] * s1, a[2] * s0 + b[2] * s1];
        v.push(...prev, ...p); prev = p;
      }
    }
    return new Float32Array(v);
  }

  const VS_SPHERE = `
attribute vec3 aP;
uniform vec3 uX, uY, uZ;
uniform float uD, uF, uPS, uPR, uZmin, uEdge, uCull;
uniform vec2 uC, uS, uFade;
uniform vec3 uPtr;
varying float vA;
void main() {
  float X = dot(aP, uX), Y = dot(aP, uY), Z = dot(aP, uZ);
  float w = uD - Z;
  vec2 s = uC + uF * vec2(X, -Y) / w;
  vec2 dp = s - uPtr.xy;
  float near = uPtr.z * exp(-dot(dp, dp) / (uPR * uPR));
  vA = smoothstep(uZmin, uZmin + uEdge, Z) * (1.0 - smoothstep(uFade.x, uFade.y, s.y));
  gl_PointSize = uPS * (1.0 + 1.1 * near) * (uD - 1.0) / w;
  float keep = (uCull > 0.5 && Z < uZmin) ? -1.0 : 1.0;
  gl_Position = vec4(s.x / uS.x * 2.0 - 1.0, 1.0 - s.y / uS.y * 2.0, 0.0, keep);
}`;
  const VS_RING = `
attribute float aT;
uniform vec2 uC, uS, uFade;
uniform float uR;
varying float vA;
void main() {
  vec2 s = uC + uR * vec2(cos(aT), sin(aT));
  // the outline is drawn over the top of the sphere and fades out down its sides
  vA = smoothstep(0.34, 0.62, -sin(aT)) * (1.0 - smoothstep(uFade.x, uFade.y, s.y));
  gl_Position = vec4(s.x / uS.x * 2.0 - 1.0, 1.0 - s.y / uS.y * 2.0, 0.0, 1.0);
}`;
  const FS_POINT = `
precision mediump float;
uniform vec3 uRGB;
uniform float uAlpha, uSoft;
varying float vA;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float a = (1.0 - smoothstep(uSoft, 1.0, dot(q, q))) * uAlpha * vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uRGB * a, a);
}`;
  const FS_LINE = `
precision mediump float;
uniform vec3 uRGB;
uniform float uAlpha;
varying float vA;
void main() {
  float a = uAlpha * vA;
  gl_FragColor = vec4(uRGB * a, a);
}`;

  function create(canvas, look) {
    const D = window.ACGlobeData;
    let mirror = !look || look.mirror !== false;
    let dots = decodeDots(D.dots, mirror);
    const cities = D.cities;
    const cityV = new Float32Array(cities.flatMap((c) => unit(c[1], c[2])));
    const lineV = arcs(cities, D.links);
    const L = Object.assign({
      dot: '#c2c0b6', dotAlpha: 0.95, dotSize: 2.4,
      line: '#d1cfc5', lineAlpha: 0.9,
      marker: '#c96442', markerSize: 5.2,
      ring: '#d9c7bc', ringAlpha: 1,
      hoverRadius: 90,
    });
    for (const k in look || {}) if (look[k] !== undefined) L[k] = look[k];
    const view = { cx: 0, cy: 0, rs: 300, d: 2.6, phi: 21, lam: -82 };
    let W = 1, H = 1, q = 1, fadeY = [1e6, 1e6];

    /* ---- WebGL, if there is one ---- */
    let gl = null;
    try {
      gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
    } catch (e) { gl = null; }
    let P = null;
    function program(vs, fs) {
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
      return { p, u };
    }
    function buffer(data) { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; }
    function initGL() {
      const ring = new Float32Array(361); for (let i = 0; i <= 360; i++) ring[i] = (i / 360) * Math.PI * 2;
      P = {
        pts: program(VS_SPHERE, FS_POINT), lines: program(VS_SPHERE, FS_LINE), ring: program(VS_RING, FS_LINE),
        bDots: buffer(dots), bCities: buffer(cityV), bLines: buffer(lineV), bRing: buffer(ring),
      };
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }
    if (gl) { try { initGL(); } catch (e) { gl = null; } }
    const ctx = gl ? null : canvas.getContext('2d');
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); P = null; });
    canvas.addEventListener('webglcontextrestored', () => { try { initGL(); } catch (e) { gl = null; } });

    /* ---- the view basis: the camera looks at (phi, lam) from d sphere radii ---- */
    function basis() {
      const p = view.phi * RAD, l = view.lam * RAD;
      const z = [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
      const x = [-Math.sin(l), Math.cos(l), 0];
      const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
      const d = view.d, f = view.rs * Math.sqrt(d * d - 1);
      return { x, y, z, d, f, zmin: 1 / d };
    }
    // a city (or any lat/lon) on the page: x, y in canvas px, and how far round the front it is (z)
    function project(lat, lon, B) {
      B = B || basis();
      const v = unit(lat, lon);
      const X = v[0] * B.x[0] + v[1] * B.x[1] + v[2] * B.x[2];
      const Y = v[0] * B.y[0] + v[1] * B.y[1] + v[2] * B.y[2];
      const Z = v[0] * B.z[0] + v[1] * B.z[1] + v[2] * B.z[2];
      const w = B.d - Z;
      return { x: view.cx + (B.f * X) / w, y: view.cy - (B.f * Y) / w, z: Z, front: (Z - B.zmin) / (1 - B.zmin) };
    }

    function resize(w, h, scale) {
      W = w; H = h; q = scale;
      const bw = Math.max(1, Math.round(w * q)), bh = Math.max(1, Math.round(h * q));
      if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
    }
    function setView(v) { Object.assign(view, v); }
    function setMirror(m) {
      m = !!m; if (m === mirror) return;
      mirror = m; dots = decodeDots(D.dots, mirror);
      if (gl && P) { gl.bindBuffer(gl.ARRAY_BUFFER, P.bDots); gl.bufferData(gl.ARRAY_BUFFER, dots, gl.STATIC_DRAW); }
    }
    function setFade(y0, y1) { fadeY = [y0, y1]; }

    function draw(opts) {
      opts = opts || {};
      if (typeof opts.lam === 'number') view.lam = opts.lam;
      const B = basis();
      const ptr = opts.pointer || { x: -1e5, y: -1e5, amt: 0 };
      if (gl && P) drawGL(B, ptr); else if (ctx) draw2D(B, ptr);
    }

    function drawGL(B, ptr) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const common = (pr, cull, edge) => {
        const u = pr.u;
        gl.uniform3fv(u.uX, B.x); gl.uniform3fv(u.uY, B.y); gl.uniform3fv(u.uZ, B.z);
        gl.uniform1f(u.uD, B.d); gl.uniform1f(u.uF, B.f); gl.uniform1f(u.uZmin, B.zmin);
        gl.uniform1f(u.uEdge, edge); gl.uniform1f(u.uCull, cull);
        gl.uniform2f(u.uC, view.cx, view.cy); gl.uniform2f(u.uS, W, H); gl.uniform2f(u.uFade, fadeY[0], fadeY[1]);
        if (u.uPtr) gl.uniform3f(u.uPtr, ptr.x, ptr.y, ptr.amt);
        if (u.uPR) gl.uniform1f(u.uPR, L.hoverRadius);
      };
      const attrib = (pr, buf, name, size) => {
        const loc = gl.getAttribLocation(pr.p, name);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
        return loc;
      };
      // the outline of the sphere
      let pr = P.ring; gl.useProgram(pr.p);
      gl.uniform2f(pr.u.uC, view.cx, view.cy); gl.uniform2f(pr.u.uS, W, H); gl.uniform2f(pr.u.uFade, fadeY[0], fadeY[1]);
      gl.uniform1f(pr.u.uR, view.rs); gl.uniform3fv(pr.u.uRGB, hex(L.ring)); gl.uniform1f(pr.u.uAlpha, L.ringAlpha);
      let loc = attrib(pr, P.bRing, 'aT', 1);
      gl.drawArrays(gl.LINE_STRIP, 0, 361);
      gl.disableVertexAttribArray(loc);
      // the land
      pr = P.pts; gl.useProgram(pr.p); common(pr, 1, 0.07);
      gl.uniform1f(pr.u.uPS, L.dotSize * q); gl.uniform3fv(pr.u.uRGB, hex(L.dot)); gl.uniform1f(pr.u.uAlpha, L.dotAlpha); gl.uniform1f(pr.u.uSoft, 0.35);
      loc = attrib(pr, P.bDots, 'aP', 3);
      gl.drawArrays(gl.POINTS, 0, dots.length / 3);
      gl.disableVertexAttribArray(loc);
      // the lines between neighbouring cities
      pr = P.lines; gl.useProgram(pr.p); common(pr, 0, 0.1);
      gl.uniform3fv(pr.u.uRGB, hex(L.line)); gl.uniform1f(pr.u.uAlpha, L.lineAlpha);
      loc = attrib(pr, P.bLines, 'aP', 3);
      gl.drawArrays(gl.LINES, 0, lineV.length / 3);
      gl.disableVertexAttribArray(loc);
      // the cities
      pr = P.pts; gl.useProgram(pr.p); common(pr, 1, 0.05);
      gl.uniform3f(pr.u.uPtr, -1e5, -1e5, 0);
      gl.uniform1f(pr.u.uPS, L.markerSize * q); gl.uniform3fv(pr.u.uRGB, hex(L.marker)); gl.uniform1f(pr.u.uAlpha, 1); gl.uniform1f(pr.u.uSoft, 0.62);
      loc = attrib(pr, P.bCities, 'aP', 3);
      gl.drawArrays(gl.POINTS, 0, cities.length);
      gl.disableVertexAttribArray(loc);
    }

    // the same picture on a 2D canvas, for a browser without WebGL
    function draw2D(B, ptr) {
      const c = ctx;
      c.setTransform(q, 0, 0, q, 0, 0);
      c.clearRect(0, 0, W, H);
      const fadeA = (y) => 1 - Math.min(1, Math.max(0, (y - fadeY[0]) / (fadeY[1] - fadeY[0])));
      const proj = (v) => {
        const X = v[0] * B.x[0] + v[1] * B.x[1] + v[2] * B.x[2], Y = v[0] * B.y[0] + v[1] * B.y[1] + v[2] * B.y[2], Z = v[0] * B.z[0] + v[1] * B.z[1] + v[2] * B.z[2];
        const w = B.d - Z;
        return [view.cx + (B.f * X) / w, view.cy - (B.f * Y) / w, Z, (B.d - 1) / w];
      };
      c.strokeStyle = L.ring; c.globalAlpha = L.ringAlpha * 0.8; c.lineWidth = 1 / q;
      c.beginPath(); c.arc(view.cx, view.cy, view.rs, Math.PI * 1.2, Math.PI * 1.8); c.stroke();
      c.fillStyle = L.dot;
      const pr2 = L.hoverRadius * L.hoverRadius;
      for (let i = 0; i < dots.length; i += 3) {
        const [x, y, z, k] = proj([dots[i], dots[i + 1], dots[i + 2]]);
        if (z < B.zmin || x < -4 || y < -4 || x > W + 4 || y > H + 4) continue;
        const dx = x - ptr.x, dy = y - ptr.y;
        const s = L.dotSize * k * 0.8 * (1 + 1.1 * ptr.amt * Math.exp(-(dx * dx + dy * dy) / pr2));
        c.globalAlpha = L.dotAlpha * 0.7 * Math.min(1, (z - B.zmin) / 0.07) * fadeA(y);
        c.fillRect(x - s / 2, y - s / 2, s, s);
      }
      c.strokeStyle = L.line; c.lineWidth = 1 / q; c.globalAlpha = L.lineAlpha;
      c.beginPath();
      for (let i = 0; i < lineV.length; i += 6) {
        const a = proj([lineV[i], lineV[i + 1], lineV[i + 2]]), b = proj([lineV[i + 3], lineV[i + 4], lineV[i + 5]]);
        if (a[2] < B.zmin + 0.02 || b[2] < B.zmin + 0.02) continue;
        c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
      }
      c.stroke();
      c.fillStyle = L.marker;
      for (let i = 0; i < cityV.length; i += 3) {
        const [x, y, z, k] = proj([cityV[i], cityV[i + 1], cityV[i + 2]]);
        if (z < B.zmin) continue;
        c.globalAlpha = Math.min(1, (z - B.zmin) / 0.05) * fadeA(y);
        c.beginPath(); c.arc(x, y, (L.markerSize * k) / 2.4, 0, Math.PI * 2); c.fill();
      }
      c.globalAlpha = 1;
    }

    return { resize, setView, setFade, setMirror, draw, project, basis, cities, look: L, get webgl() { return !!(gl && P); }, get dots() { return dots.length / 3; } };
  }

  window.ACGlobe = { create };
})();
