/* 3D scene for the project page.
   An illustrative graph of 1,700 nodes that matches the real class mix (2.23% illicit, 20.62% licit, 77.15% unknown),
   the real chronological split and the real score distribution of the unknown class. The nodes are not real transactions.
   Classic three.js build (r149) is vendored in ../vendor so the page also works when opened from disk. */
(function () {
  "use strict";
  var D = window.FORENSICS_DATA;
  var BARS = window.BARS;
  var N = 1700;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------ helpers */
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var R = rng(20261022);
  function gauss() { var u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function hex(h) { var c = new THREE.Color(h); return [c.r, c.g, c.b]; }

  var PAL = {
    dark: { licit: hex("#6F8AB0"), unknown: hex("#4A5262"), accent: hex("#F0922B"), edge: hex("#5C6678"), plane: hex("#8B95A8") },
    light: { licit: hex("#47618A"), unknown: hex("#A9B1BF"), accent: hex("#C2650A"), edge: hex("#9AA3B2"), plane: hex("#6B7586") }
  };

  /* ------------------------------------------------------------ synthetic graph */
  var CLS = new Uint8Array(N);      // 0 unknown, 1 licit, 2 illicit
  var STEP = new Uint8Array(N);
  var LOCAL = new Float32Array(N * 3);
  var PARENT = new Int32Array(N).fill(-1);
  var edges = [];
  var RISK = new Float32Array(N);
  var CASENODES = [];

  (function build() {
    var w = [], tot = 0, s;
    for (s = 1; s <= 49; s++) { var v = 0.55 + R() * 0.9; w.push(v); tot += v; }
    var byStep = []; for (s = 0; s <= 49; s++) byStep.push([]);
    for (var i = 0; i < N; i++) {
      var u = R() * tot, acc = 0, st = 1;
      for (s = 0; s < 49; s++) { acc += w[s]; if (u <= acc) { st = s + 1; break; } }
      STEP[i] = st; byStep[st].push(i);
    }
    for (s = 1; s <= 49; s++) {
      var list = byStep[s];
      for (var k = 0; k < list.length; k++) {
        var n = list[k], p;
        if (k === 0 || R() < 0.12) {
          var rr = 2.6 * Math.cbrt(R()), th = R() * 6.283, ph = Math.acos(2 * R() - 1);
          LOCAL[n * 3] = rr * Math.sin(ph) * Math.cos(th); LOCAL[n * 3 + 1] = rr * Math.sin(ph) * Math.sin(th); LOCAL[n * 3 + 2] = rr * Math.cos(ph);
        } else {
          var back = Math.min(k, 1 + Math.floor(R() * R() * 8));
          p = list[k - back]; PARENT[n] = p;
          var len = 0.5 + R() * 0.5, t2 = R() * 6.283, p2 = Math.acos(2 * R() - 1);
          var x = LOCAL[p * 3] + len * Math.sin(p2) * Math.cos(t2), y = LOCAL[p * 3 + 1] + len * Math.sin(p2) * Math.sin(t2), z = LOCAL[p * 3 + 2] + len * Math.cos(p2);
          var m = Math.sqrt(x * x + y * y + z * z);
          if (m > 3.6) { var f = 3.6 / m; x *= f; y *= f; z *= f; }
          LOCAL[n * 3] = x; LOCAL[n * 3 + 1] = y; LOCAL[n * 3 + 2] = z;
          edges.push([p, n]);
          if (k > 2 && R() < 0.25) { var q = list[Math.floor(R() * k)]; if (q !== p && q !== n) edges.push([q, n]); }
        }
      }
    }
    /* classes: exact counts, illicit weighted by the real prevalence of each split */
    var nIll = Math.round(0.0223 * N), nLic = Math.round(0.2062 * N);
    var idx = []; for (i = 0; i < N; i++) idx.push(i);
    for (i = N - 1; i > 0; i--) { var j = Math.floor(R() * (i + 1)); var tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp; }
    var lab = idx.slice(0, nIll + nLic);
    function prev(st) { return st <= 34 ? 0.1158 : st <= 41 ? 0.0862 : 0.0461; }
    var keyed = lab.map(function (n) { return { n: n, k: Math.pow(R(), 1 / prev(STEP[n])) }; });
    keyed.sort(function (a, b) { return b.k - a.k; });
    for (i = 0; i < keyed.length; i++) CLS[keyed[i].n] = i < nIll ? 2 : 1;
    /* risk of unknown nodes drawn from the real score distribution */
    var q = D.scores.q;
    for (i = 0; i < N; i++) {
      if (CLS[i] !== 0) continue;
      var u2 = R(), ix = u2 < 0.95 ? Math.floor(u2 / 0.95 * 379) : 380 + Math.floor((u2 - 0.95) / 0.05 * 119);
      RISK[i] = q[Math.min(ix, q.length - 1)];
    }
    var unk = []; for (i = 0; i < N; i++) if (CLS[i] === 0) unk.push(i);
    unk.sort(function (a, b) { return RISK[b] - RISK[a]; });
    CASENODES = unk.slice(0, 20);
  })();
  var E = edges.length;

  /* neighbour lists for message passing */
  var NB = []; for (var ni = 0; ni < N; ni++) NB.push([]);
  edges.forEach(function (e) { NB[e[0]].push(e[1]); NB[e[1]].push(e[0]); });
  function bfs(src) {
    var d = new Float32Array(N).fill(99); d[src] = 0; var qd = [src];
    while (qd.length) { var a = qd.shift(); if (d[a] >= 4) continue; NB[a].forEach(function (b) { if (d[b] === 99) { d[b] = d[a] + 1; qd.push(b); } }); }
    return d;
  }

  /* ------------------------------------------------------------ layouts */
  var TIMEX = function (s) { return (s - 25) * 0.46; };
  var SPLITX = [TIMEX(34.5), TIMEX(41.5)];
  var WALLETS = 12;
  var wallets = []; for (var wi = 0; wi < WALLETS; wi++) wallets.push([(wi - 5.5) * 2.3, 8.2, (R() - 0.5) * 3]);

  function layoutOverview() {
    var o = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      var s = STEP[i], a = s * 0.45, r = 3 + s * 0.22;
      o[i * 3] = Math.cos(a) * r + LOCAL[i * 3] * 0.75;
      o[i * 3 + 1] = (((s * 37) % 11) - 5) * 0.55 + LOCAL[i * 3 + 1] * 0.9;
      o[i * 3 + 2] = Math.sin(a) * r + LOCAL[i * 3 + 2] * 0.75;
    }
    return o;
  }
  function layoutTime() {
    var o = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      o[i * 3] = TIMEX(STEP[i]) + LOCAL[i * 3] * 0.13; o[i * 3 + 1] = LOCAL[i * 3 + 1] * 1.55; o[i * 3 + 2] = LOCAL[i * 3 + 2] * 0.95;
    }
    return o;
  }
  function layoutData() {
    var o = new Float32Array(N * 3), r2 = rng(77);
    for (var i = 0; i < N; i++) {
      var th = r2() * 6.283, ph = Math.acos(2 * r2() - 1), rad;
      if (CLS[i] === 2) rad = 1.7 * Math.cbrt(r2());
      else if (CLS[i] === 1) rad = 2.6 + 2.8 * r2();
      else rad = 8.2 + 3.0 * r2();
      o[i * 3] = rad * Math.sin(ph) * Math.cos(th); o[i * 3 + 1] = rad * Math.sin(ph) * Math.sin(th) * 0.9; o[i * 3 + 2] = rad * Math.cos(ph);
    }
    return o;
  }
  var OUTLIERS = []; (function () { var r3 = rng(5); while (OUTLIERS.length < 16) { var k = Math.floor(r3() * N); if (OUTLIERS.indexOf(k) < 0) OUTLIERS.push(k); } })();
  function layoutScale(variant) {
    var o = new Float32Array(N * 3), r4 = rng(99);
    for (var i = 0; i < N; i++) {
      var g = gauss(), y;
      o[i * 3] = (r4() * 2 - 1) * 11; o[i * 3 + 2] = (r4() - 0.5) * 3;
      if (variant === "robust") { y = g * 0.28; if (OUTLIERS.indexOf(i) >= 0) y = 7 + r4() * 55; }
      else { y = Math.max(-4.7, Math.min(4.7, g * 1.5)); }
      o[i * 3 + 1] = y;
    }
    return o;
  }
  var PER = 90;
  function layoutBars(metric) {
    var o = new Float32Array(N * 3), hid = N;
    for (var i = 0; i < N; i++) {
      var b = Math.floor(i / PER);
      if (b < BARS.length) {
        var k = i - b * PER, h = BARS[b][metric] * 10, ang = k * 0.95;
        o[i * 3] = (b - (BARS.length - 1) / 2) * 1.12 + Math.cos(ang) * 0.16;
        o[i * 3 + 1] = -4 + (k / (PER - 1)) * h; o[i * 3 + 2] = Math.sin(ang) * 0.16;
      } else { o[i * 3] = 0; o[i * 3 + 1] = -30; o[i * 3 + 2] = 0; }
    }
    return o;
  }
  function layoutRisk() {
    var o = new Float32Array(N * 3), r5 = rng(31);
    for (var i = 0; i < N; i++) {
      var th = r5() * 6.283;
      if (CLS[i] === 0) { var rad = 6.4 * Math.sqrt(r5()); o[i * 3] = Math.cos(th) * rad; o[i * 3 + 1] = RISK[i] * 14 - 7; o[i * 3 + 2] = Math.sin(th) * rad; }
      else { var rr = 8.5 + 2.2 * r5(); o[i * 3] = Math.cos(th) * rr; o[i * 3 + 1] = -8.6 + r5() * 0.6; o[i * 3 + 2] = Math.sin(th) * rr; }
    }
    return o;
  }

  /* ------------------------------------------------------------ scene definitions */
  var POSE = {
    overview: { p: [0, 17, 27], l: [0, 0, 0], rot: 0.035 },
    data: { p: [0, 4, 27], l: [0, 0, 0], rot: 0.05 },
    time: { p: [4.5, 1, 33], l: [4.5, 0, 0], rot: 0 },
    leak: { p: [4.5, 3, 35], l: [4.5, 2.5, 0], rot: 0 },
    features: { p: [0, 0, 0], l: [0, 0, 0], rot: 0, follow: true },
    scale: { p: [4, 0.5, 30], l: [4, 1.5, 0], rot: 0 },
    model: { p: [0, 19, 24], l: [0, 0, 0], rot: 0.03 },
    bars: { p: [4.5, 1.8, 25], l: [4.5, 1.2, 0], rot: 0 },
    risk: { p: [13, 2, 21], l: [0, 0, 0], rot: 0.04 },
    "case": { p: [0, 0, 0], l: [0, 0, 0], rot: 0, follow: true }
  };

  /* ------------------------------------------------------------ three.js setup */
  var S = {
    theme: "dark", name: "overview", opts: {}, mixT: 1, mixDur: 1.4, mixing: false, ready: false,
    A: { pos: null, col: null, sa: null }, B: { pos: null, col: null, sa: null },
    dist: new Float32Array(N).fill(99), wave: -1, waveT: 0, keep: 0, burst: 99,
    flow: 0, flowT: 1, edgeOp: 1, edgeT: 1,
    rotY: 0, rotTarget: 0, cam: { from: null, to: null, t: 1, dur: 1.6 },
    px: 0, py: 0, ppx: 0, ppy: 0, time: 0, hover: -1, labels: [], selected: -1
  };
  var canvas, renderer, scene, camera, world, nodePts, edgeLines, flowPts, orbitPts, arcLines, walletPts, slabs = [], guideScale, guideBars, thrDisc, labelBox;
  var cbPick = null, cbHover = null;
  var tmpV = new THREE.Vector3();

  function allocState() {
    S.A.pos = new Float32Array(N * 3); S.B.pos = new Float32Array(N * 3);
    S.A.col = new Float32Array(N * 3); S.B.col = new Float32Array(N * 3);
    S.A.sa = new Float32Array(N * 2); S.B.sa = new Float32Array(N * 2);
  }

  function colorsFor(name, o) {
    var P = PAL[S.theme], col = new Float32Array(N * 3), sa = new Float32Array(N * 2), i, c, a, s, th;
    var sel = o.bar, split = o.split, flagged;
    for (i = 0; i < N; i++) {
      c = CLS[i] === 2 ? P.accent : CLS[i] === 1 ? P.licit : P.unknown;
      a = CLS[i] === 0 ? 0.6 : 0.95; s = CLS[i] === 2 ? 2.3 : CLS[i] === 1 ? 1.35 : 0.95;
      if (name === "time" || name === "leak") {
        var st = STEP[i], grp = st <= 34 ? "train" : st <= 41 ? "val" : "test";
        if (split && split !== grp) a *= 0.12; else if (split) { s *= 1.25; }
        if (CLS[i] === 0) a = split ? (split === grp ? 0.75 : 0.06) : 0.5;
      } else if (name === "scale") {
        c = OUTLIERS.indexOf(i) >= 0 ? P.accent : P.licit; a = 0.9; s = OUTLIERS.indexOf(i) >= 0 ? 2.4 : 1.2;
      } else if (name === "bars") {
        var b = Math.floor(i / PER);
        if (b >= BARS.length) { a = 0; }
        else {
          var fam = BARS[b].fam; c = fam === "qt" ? P.licit : fam === "base" ? P.edge : P.unknown;
          if (fam === "rs") c = [P.unknown[0] * 1.5, P.unknown[1] * 1.5, P.unknown[2] * 1.5];
          a = 0.95; s = 1.45;
          if (sel) { if (BARS[b].id === sel) { c = P.accent; s = 2.1; } else a = 0.42; }
        }
      } else if (name === "risk") {
        if (CLS[i] === 0) {
          var rk = RISK[i], t = Math.max(0, Math.min(1, (rk - 0.45) / 0.55));
          c = [P.unknown[0] + (P.accent[0] - P.unknown[0]) * t, P.unknown[1] + (P.accent[1] - P.unknown[1]) * t, P.unknown[2] + (P.accent[2] - P.unknown[2]) * t];
          flagged = rk >= (o.threshold || 0.9);
          a = flagged ? 1 : 0.55; s = flagged ? 1.9 : 1.0;
        } else { a = 0.28; s = 0.9; c = CLS[i] === 2 ? P.accent : P.licit; }
      } else if (name === "case" || name === "features") {
        a *= 0.8;
      }
      if ((name === "case" || name === "features") && o.node === i) { c = P.accent; a = 1; s = 4.2; }
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
      sa[i * 2] = s; sa[i * 2 + 1] = a;
    }
    return { col: col, sa: sa };
  }
  function layoutFor(name, o) {
    if (name === "data") return layoutData();
    if (name === "time" || name === "leak") return layoutTime();
    if (name === "scale") return layoutScale(o.variant || "robust");
    if (name === "bars") return layoutBars(o.metric || "pr");
    if (name === "risk") return layoutRisk();
    return layoutOverview();
  }

  var VS_NODE = [
    "attribute vec3 posB; attribute vec3 colA; attribute vec3 colB; attribute vec2 saA; attribute vec2 saB; attribute float aDist;",
    "uniform float uMix, uPx, uWave, uKeep, uBurst;",
    "varying vec3 vCol; varying float vAlpha; varying float vGlow;",
    "void main(){",
    "  vec3 p = mix(position, posB, uMix);",
    "  vCol = mix(colA, colB, uMix);",
    "  float sz = mix(saA.x, saB.x, uMix); vAlpha = mix(saA.y, saB.y, uMix);",
    "  float wv = exp(-pow(aDist - uWave, 2.0) * 3.0) * step(0.0, uWave) * step(aDist, 6.0);",
    "  float keep = step(aDist, 2.0) * uKeep;",
    "  float ring = exp(-pow(length(p) - uBurst * 22.0, 2.0) * 0.35) * exp(-uBurst * 1.1) * step(uBurst, 6.0);",
    "  vGlow = clamp(wv + keep * 0.7 + ring * 0.8, 0.0, 1.0);",
    "  vec4 mv = modelViewMatrix * vec4(p, 1.0);",
    "  gl_PointSize = sz * (1.0 + vGlow * 1.2) * uPx * 150.0 / -mv.z;",
    "  gl_Position = projectionMatrix * mv;",
    "}"].join("\n");
  var FS_NODE = [
    "precision mediump float; uniform vec3 uAccent; varying vec3 vCol; varying float vAlpha; varying float vGlow;",
    "void main(){ float d = length(gl_PointCoord - 0.5);",
    "  float a = (smoothstep(0.5, 0.34, d) + smoothstep(0.5, 0.0, d) * 0.4 * vGlow) * vAlpha;",
    "  if (a < 0.01) discard; gl_FragColor = vec4(mix(vCol, uAccent, vGlow * 0.85), a); }"].join("\n");

  var VS_EDGE = [
    "attribute vec3 posB; attribute vec2 alAB; attribute float aDist; attribute float aHot;",
    "uniform float uMix, uWave, uKeep, uBurst; varying float vAlpha; varying float vGlow;",
    "void main(){ vec3 p = mix(position, posB, uMix); vAlpha = mix(alAB.x, alAB.y, uMix);",
    "  float wv = exp(-pow(aDist - uWave, 2.0) * 3.0) * step(0.0, uWave) * step(aDist, 6.0);",
    "  float keep = step(aDist, 2.0) * uKeep;",
    "  float ring = exp(-pow(length(p) - uBurst * 22.0, 2.0) * 0.35) * exp(-uBurst * 1.1) * step(uBurst, 6.0);",
    "  vGlow = clamp(wv + keep * 0.6 + ring * 0.6 + aHot * 0.35, 0.0, 1.0);",
    "  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }"].join("\n");
  var FS_EDGE = [
    "precision mediump float; uniform vec3 uEdgeCol; uniform vec3 uAccent; uniform float uEdge; varying float vAlpha; varying float vGlow;",
    "void main(){ float a = uEdge * vAlpha * (0.22 + 0.78 * vGlow); if (a < 0.005) discard; gl_FragColor = vec4(mix(uEdgeCol, uAccent, vGlow), a); }"].join("\n");

  var VS_FLOW = [
    "attribute vec3 sB; attribute vec3 eA; attribute vec3 eB; attribute vec4 al; attribute float aOff; attribute float aSpd;",
    "uniform float uMix, uTime, uPx, uFlow; varying float vAlpha;",
    "void main(){ vec3 s = mix(position, sB, uMix); vec3 e = mix(eA, eB, uMix);",
    "  float t = fract(uTime * aSpd + aOff); vec3 p = mix(s, e, t);",
    "  float aS = mix(al.x, al.y, uMix); float aE = mix(al.z, al.w, uMix);",
    "  vAlpha = uFlow * min(aS, aE) * sin(t * 3.14159);",
    "  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = 2.0 * uPx * 120.0 / -mv.z; gl_Position = projectionMatrix * mv; }"].join("\n");
  var FS_FLOW = [
    "precision mediump float; uniform vec3 uAccent; varying float vAlpha;",
    "void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d) * vAlpha; if (a < 0.01) discard; gl_FragColor = vec4(uAccent, a); }"].join("\n");

  var U = { uMix: { value: 0 }, uPx: { value: 1 }, uWave: { value: -1 }, uKeep: { value: 0 }, uBurst: { value: 99 }, uAccent: { value: new THREE.Color() }, uEdgeCol: { value: new THREE.Color() }, uEdge: { value: 1 }, uTime: { value: 0 }, uFlow: { value: 1 } };

  function makeNodes() {
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(S.A.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("posB", new THREE.BufferAttribute(S.B.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("colA", new THREE.BufferAttribute(S.A.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("colB", new THREE.BufferAttribute(S.B.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("saA", new THREE.BufferAttribute(S.A.sa, 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("saB", new THREE.BufferAttribute(S.B.sa, 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aDist", new THREE.BufferAttribute(S.dist, 1).setUsage(THREE.DynamicDrawUsage));
    var m = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VS_NODE, fragmentShader: FS_NODE, transparent: true, depthWrite: false });
    nodePts = new THREE.Points(g, m); nodePts.frustumCulled = false; world.add(nodePts);
  }
  var EV = { A: null, B: null, al: null, dist: null, hot: null };
  function makeEdges() {
    EV.A = new Float32Array(E * 6); EV.B = new Float32Array(E * 6); EV.al = new Float32Array(E * 4); EV.dist = new Float32Array(E * 2); EV.hot = new Float32Array(E * 2);
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(EV.A, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("posB", new THREE.BufferAttribute(EV.B, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("alAB", new THREE.BufferAttribute(EV.al, 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aDist", new THREE.BufferAttribute(EV.dist, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aHot", new THREE.BufferAttribute(EV.hot, 1));
    for (var k = 0; k < E; k++) { var h = (CLS[edges[k][0]] === 2 || CLS[edges[k][1]] === 2) ? 1 : 0; EV.hot[k * 2] = h; EV.hot[k * 2 + 1] = h; }
    var m = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VS_EDGE, fragmentShader: FS_EDGE, transparent: true, depthWrite: false });
    edgeLines = new THREE.LineSegments(g, m); edgeLines.frustumCulled = false; world.add(edgeLines);
  }
  var FV = {};
  function makeFlow() {
    FV.sA = new Float32Array(E * 3); FV.sB = new Float32Array(E * 3); FV.eA = new Float32Array(E * 3); FV.eB = new Float32Array(E * 3); FV.al = new Float32Array(E * 4);
    var off = new Float32Array(E), spd = new Float32Array(E), r6 = rng(8);
    for (var k = 0; k < E; k++) { off[k] = r6(); spd[k] = 0.05 + r6() * 0.1; }
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(FV.sA, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("sB", new THREE.BufferAttribute(FV.sB, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("eA", new THREE.BufferAttribute(FV.eA, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("eB", new THREE.BufferAttribute(FV.eB, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("al", new THREE.BufferAttribute(FV.al, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aOff", new THREE.BufferAttribute(off, 1)); g.setAttribute("aSpd", new THREE.BufferAttribute(spd, 1));
    var m = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VS_FLOW, fragmentShader: FS_FLOW, transparent: true, depthWrite: false });
    flowPts = new THREE.Points(g, m); flowPts.frustumCulled = false; world.add(flowPts);
  }
  function syncEdges() {
    var k, a, b, i3;
    for (k = 0; k < E; k++) {
      a = edges[k][0]; b = edges[k][1];
      for (i3 = 0; i3 < 3; i3++) {
        EV.A[k * 6 + i3] = S.A.pos[a * 3 + i3]; EV.A[k * 6 + 3 + i3] = S.A.pos[b * 3 + i3];
        EV.B[k * 6 + i3] = S.B.pos[a * 3 + i3]; EV.B[k * 6 + 3 + i3] = S.B.pos[b * 3 + i3];
        FV.sA[k * 3 + i3] = S.A.pos[a * 3 + i3]; FV.sB[k * 3 + i3] = S.B.pos[a * 3 + i3];
        FV.eA[k * 3 + i3] = S.A.pos[b * 3 + i3]; FV.eB[k * 3 + i3] = S.B.pos[b * 3 + i3];
      }
      var aa = S.A.sa[a * 2 + 1], ab = S.B.sa[a * 2 + 1], ba = S.A.sa[b * 2 + 1], bb = S.B.sa[b * 2 + 1];
      EV.al[k * 4] = Math.min(aa, ba); EV.al[k * 4 + 1] = Math.min(ab, bb); EV.al[k * 4 + 2] = Math.min(aa, ba); EV.al[k * 4 + 3] = Math.min(ab, bb);
      FV.al[k * 4] = aa; FV.al[k * 4 + 1] = ab; FV.al[k * 4 + 2] = ba; FV.al[k * 4 + 3] = bb;
      EV.dist[k * 2] = S.dist[a]; EV.dist[k * 2 + 1] = S.dist[b];
    }
    var ea = edgeLines.geometry.attributes, fa = flowPts.geometry.attributes;
    ea.position.needsUpdate = ea.posB.needsUpdate = ea.alAB.needsUpdate = ea.aDist.needsUpdate = true;
    fa.position.needsUpdate = fa.sB.needsUpdate = fa.eA.needsUpdate = fa.eB.needsUpdate = fa.al.needsUpdate = true;
  }
  function pushNodes() {
    var a = nodePts.geometry.attributes;
    a.position.needsUpdate = a.posB.needsUpdate = a.colA.needsUpdate = a.colB.needsUpdate = a.saA.needsUpdate = a.saB.needsUpdate = a.aDist.needsUpdate = true;
  }

  function makeExtras() {
    /* wallet points and arcs for the leakage scene */
    var wp = new Float32Array(WALLETS * 3); wallets.forEach(function (w, i) { wp[i * 3] = w[0]; wp[i * 3 + 1] = w[1]; wp[i * 3 + 2] = w[2]; });
    var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(wp, 3));
    var wcv = document.createElement("canvas"); wcv.width = wcv.height = 64; var wcx = wcv.getContext("2d"); wcx.beginPath(); wcx.arc(32, 32, 28, 0, 6.2832); wcx.fillStyle = "#fff"; wcx.fill();
    walletPts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.7, map: new THREE.CanvasTexture(wcv), alphaTest: 0.4, transparent: true, opacity: 0, depthWrite: false, color: 0xffffff }));
    world.add(walletPts);
    var tl = layoutTime(), seg = [], r7 = rng(12), SEGS = 18;
    wallets.forEach(function (w) {
      for (var c = 0; c < 9; c++) {
        var n = Math.floor(r7() * N), x1 = tl[n * 3], y1 = tl[n * 3 + 1], z1 = tl[n * 3 + 2], px = w[0], py = w[1], pz = w[2];
        var cx = (px + x1) / 2, cy = Math.max(py, y1) + 2.2, cz = (pz + z1) / 2;
        var prev = [px, py, pz];
        for (var s = 1; s <= SEGS; s++) {
          var t = s / SEGS, u = 1 - t;
          var cur = [u * u * px + 2 * u * t * cx + t * t * x1, u * u * py + 2 * u * t * cy + t * t * y1, u * u * pz + 2 * u * t * cz + t * t * z1];
          seg.push(prev[0], prev[1], prev[2], cur[0], cur[1], cur[2]); prev = cur;
        }
      }
    });
    var ag = new THREE.BufferGeometry(); ag.setAttribute("position", new THREE.BufferAttribute(new Float32Array(seg), 3));
    arcLines = new THREE.LineSegments(ag, new THREE.LineBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, color: 0xffffff }));
    world.add(arcLines);
    /* split planes */
    [0, 1].forEach(function (i) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(12, 13), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, color: 0xffffff }));
      m.rotation.y = Math.PI / 2; m.position.set(SPLITX[i], 0, 0); world.add(m); slabs.push(m);
    });
    /* guide lines */
    function lines(arr, color) { var gg = new THREE.BufferGeometry(); gg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(arr), 3)); var l = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ transparent: true, opacity: 0, color: color })); world.add(l); return l; }
    guideScale = lines([-12, 4.7, 0, 12, 4.7, 0, -12, -4.7, 0, 12, -4.7, 0], 0xffffff);
    guideBars = lines([-10.5, -4, 0, 10.5, -4, 0], 0xffffff);
    /* threshold disc */
    var dg = new THREE.CircleGeometry(7, 64); dg.rotateX(-Math.PI / 2);
    thrDisc = new THREE.Mesh(dg, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, color: 0xffffff })); world.add(thrDisc);
    /* orbit beads (14 features) */
    var og = new THREE.BufferGeometry(); og.setAttribute("position", new THREE.BufferAttribute(new Float32Array(14 * 3), 3)); og.setAttribute("color", new THREE.BufferAttribute(new Float32Array(14 * 3), 3));
    var cv = document.createElement("canvas"); cv.width = cv.height = 64; var cx = cv.getContext("2d"); cx.beginPath(); cx.arc(32, 32, 28, 0, 6.2832); cx.fillStyle = "#fff"; cx.fill();
    var tex = new THREE.CanvasTexture(cv);
    orbitPts = new THREE.Points(og, new THREE.PointsMaterial({ size: 0.5, map: tex, alphaTest: 0.4, transparent: true, opacity: 0, depthWrite: false, vertexColors: true }));
    orbitPts.frustumCulled = false; world.add(orbitPts);
  }
  var FAM = [[0, 4, 1.4, 0.55], [4, 6, 1.9, -0.42], [6, 12, 2.5, 0.33], [12, 14, 3.1, -0.27]];
  var famSel = null, famIds = ["fin", "str", "tmp", "net"];

  /* ------------------------------------------------------------ scene switching */
  var FADE = {}; // object -> {from,to,t,dur}
  function fade(obj, target, dur) { obj.__f = { from: obj.material.opacity, to: target, t: 0, dur: dur || 0.9 }; }
  function bake() {
    var e = ease(Math.min(1, S.mixT)), i;
    if (S.mixT >= 1) return;
    for (i = 0; i < N * 3; i++) { S.A.pos[i] += (S.B.pos[i] - S.A.pos[i]) * e; S.A.col[i] += (S.B.col[i] - S.A.col[i]) * e; }
    for (i = 0; i < N * 2; i++) S.A.sa[i] += (S.B.sa[i] - S.A.sa[i]) * e;
  }
  function currentCaseNode(o) { return CASENODES[o.caseIndex || 0]; }
  function setScene(name, o) {
    o = o || {}; if (!S.ready) { S.pending = [name, o]; return; }
    var prevName = S.name; S.name = name; S.opts = o;
    if (name === "case" || name === "features") o.node = o.node != null ? o.node : currentCaseNode(o);
    bake();
    var lay = layoutFor(name, o), c = colorsFor(name, o);
    S.B.pos.set(lay); S.B.col.set(c.col); S.B.sa.set(c.sa);
    S.mixT = 0; S.mixDur = reduce ? 0.001 : (o.fast ? 0.6 : 1.4); S.mixing = true; U.uMix.value = 0;
    syncEdges(); pushNodes();
    /* camera */
    var pose = POSE[name] || POSE.overview, p = pose.p.slice(), l = pose.l.slice();
    if (pose.follow) { var q = [lay[o.node * 3], lay[o.node * 3 + 1], lay[o.node * 3 + 2]]; l = q; p = [q[0] + 5.5, q[1] + 3.8, q[2] + 14]; }
    S.cam.from = { p: camera.position.toArray(), l: S.lookNow ? S.lookNow.slice() : [0, 0, 0] }; S.cam.to = { p: p, l: l }; S.cam.t = 0; S.cam.dur = reduce ? 0.001 : 1.6;
    S.rotTarget = pose.rot ? S.rotY : 0; S.autoRot = reduce ? 0 : pose.rot;
    /* effects per scene */
    fade(edgeLines, 1, 0.8); S.edgeT = (name === "bars" || name === "scale" || name === "risk") ? 0.0 : (name === "data" ? 0.25 : 1);
    S.flowT = (name === "bars" || name === "scale" || reduce) ? 0 : (name === "risk" ? 0.4 : 1);
    var leak = name === "leak", time = name === "time" || leak;
    fade(arcLines, leak ? 0.55 : 0, 1.0); fade(walletPts, leak ? 1 : 0, 1.0);
    slabs.forEach(function (m) { fade(m, time ? 0.07 : 0, 1.0); });
    fade(guideScale, name === "scale" ? 0.5 : 0, 0.9); fade(guideBars, name === "bars" ? 0.4 : 0, 0.9);
    fade(thrDisc, name === "risk" ? 0.16 : 0, 0.9); fade(orbitPts, name === "features" ? 1 : 0, 0.9);
    if (name === "risk") setThreshold(o.threshold || 0.9);
    if (name !== "model") { S.keep = 0; S.keepTarget = 0; }
    if (name !== "model" && name !== "case" && name !== "features") { S.dist.fill(99); S.wave = -1; }
    famSel = o.family || null;
    applyLabels();
    if (name !== prevName || o.burst) triggerBurst();
  }
  function triggerBurst() { if (!reduce) S.burst = 0; }
  function setThreshold(t) { S.opts.threshold = t; if (thrDisc) thrDisc.position.y = t * 14 - 7; }

  /* ------------------------------------------------------------ labels */
  function addLabel(text, getPos, cls) { var el = document.createElement("div"); el.className = "scene-label" + (cls ? " " + cls : ""); el.textContent = text; labelBox.appendChild(el); S.labels.push({ el: el, get: getPos }); }
  function applyLabels() {
    S.labels.forEach(function (l) { l.el.remove(); }); S.labels = [];
    var n = S.name, o = S.opts;
    if (n === "time" || n === "leak") {
      addLabel("Train, 1 to 34", function () { return [(SPLITX[0] - 11) / 2, -7.6, 0]; });
      addLabel("Val, 35 to 41", function () { return [(SPLITX[0] + SPLITX[1]) / 2 - 0.5, -7.6, 0]; });
      addLabel("Test, 42 to 49", function () { return [SPLITX[1] + 3.6, -7.6, 0]; });
    }
    if (n === "leak") addLabel("Wallet table: one static record per address", function () { return [0, 10.6, 0]; }, "accent");
    if (n === "scale") {
      addLabel(o.variant === "qt" ? "QuantileTransformer: every value stays inside +/- 5.1993" : "RobustScaler: a few values land far off the chart", function () { return [0, 9.6, 0]; }, "accent");
      if (o.variant === "qt") { addLabel("+5.1993", function () { return [-10, 5.1, 0]; }); addLabel("-5.1993", function () { return [-10, -4.3, 0]; }); }
    }
    if (n === "bars" && o.bar) {
      var bi = BARS.findIndex(function (b) { return b.id === o.bar; });
      if (bi >= 0) addLabel(BARS[bi].label + ": " + BARS[bi][o.metric || "pr"].toFixed(4), function () {
        var m = o.metric || "pr"; return [(bi - (BARS.length - 1) / 2) * 1.12, -4 + BARS[bi][m] * 10 + 1.0, 0]; }, "accent");
    }
    if (n === "case" || n === "features") {
      var cs = D.cases[o.caseIndex || 0];
      addLabel("Case " + cs.tx + (n === "case" ? ", score " + cs.score.toFixed(6) : ""), function () { var p = S.B.pos, k = o.node; return [p[k * 3], p[k * 3 + 1] + 0.9, p[k * 3 + 2]]; }, "accent");
    }
    if (n === "risk") addLabel("Threshold " + (o.threshold || 0.9).toFixed(2), function () { return [7.2, (S.opts.threshold || 0.9) * 14 - 7 + 0.2, 0]; }, "accent");
  }
  function placeLabels() {
    var w = canvas.clientWidth, h = canvas.clientHeight;
    S.labels.forEach(function (l) {
      var p = l.get(); tmpV.set(p[0], p[1], p[2]).applyMatrix4(world.matrixWorld).project(camera);
      var vis = tmpV.z < 1 && Math.abs(tmpV.x) < 1.1 && Math.abs(tmpV.y) < 1.1;
      l.el.style.opacity = vis ? 1 : 0;
      l.el.style.transform = "translate(" + ((tmpV.x * 0.5 + 0.5) * w).toFixed(1) + "px," + ((-tmpV.y * 0.5 + 0.5) * h).toFixed(1) + "px) translate(-50%,-100%)";
    });
  }

  /* ------------------------------------------------------------ picking */
  function mixedPos(i) {
    var e = ease(Math.min(1, S.mixT));
    tmpV.set(S.A.pos[i * 3] + (S.B.pos[i * 3] - S.A.pos[i * 3]) * e, S.A.pos[i * 3 + 1] + (S.B.pos[i * 3 + 1] - S.A.pos[i * 3 + 1]) * e, S.A.pos[i * 3 + 2] + (S.B.pos[i * 3 + 2] - S.A.pos[i * 3 + 2]) * e);
    return tmpV;
  }
  function pick(cx, cy, rad) {
    var rect = canvas.getBoundingClientRect(), best = -1, bd = rad * rad, w = rect.width, h = rect.height, e = ease(Math.min(1, S.mixT));
    world.updateMatrixWorld();
    for (var i = 0; i < N; i++) {
      var al = S.A.sa[i * 2 + 1] + (S.B.sa[i * 2 + 1] - S.A.sa[i * 2 + 1]) * e; if (al < 0.3) continue;
      mixedPos(i).applyMatrix4(world.matrixWorld).project(camera);
      if (tmpV.z > 1) continue;
      var dx = (tmpV.x * 0.5 + 0.5) * w + rect.left - cx, dy = (-tmpV.y * 0.5 + 0.5) * h + rect.top - cy, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function selectNode(i) {
    S.selected = i; var d = bfs(i); S.dist.set(d); nodePts.geometry.attributes.aDist.needsUpdate = true; syncEdges();
    S.wave = 0; S.waveT = 0; if (S.name === "model") { S.keep = 1; S.keepTarget = 1; }
  }

  /* ------------------------------------------------------------ frame loop */
  var last = 0, hoverTimer = 0, lastRaf = 0;
  function frame(ts) { lastRaf = performance.now(); requestAnimationFrame(frame); tick(ts); }
  /* some embedded browsers pause requestAnimationFrame; a slow timer keeps the scene moving there */
  setInterval(function () { if (S.ready && performance.now() - lastRaf > 400) tick(performance.now()); }, 50);
  function tick(ts) {
    var dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts; S.time += dt;
    if (S.mixing) { S.mixT = Math.min(1, S.mixT + dt / S.mixDur); U.uMix.value = ease(S.mixT); if (S.mixT >= 1) { S.mixing = false; S.A.pos.set(S.B.pos); S.A.col.set(S.B.col); S.A.sa.set(S.B.sa); U.uMix.value = 0; S.mixT = 1; syncEdges(); pushNodes(); } }
    /* camera */
    if (S.cam.t < 1) S.cam.t = Math.min(1, S.cam.t + dt / S.cam.dur);
    var ce = ease(S.cam.t), f = S.cam.from, t = S.cam.to, i;
    var cp = [0, 0, 0], cl = [0, 0, 0];
    for (i = 0; i < 3; i++) { cp[i] = f.p[i] + (t.p[i] - f.p[i]) * ce; cl[i] = f.l[i] + (t.l[i] - f.l[i]) * ce; }
    S.lookNow = cl;
    S.ppx += (S.px - S.ppx) * 0.05; S.ppy += (S.py - S.ppy) * 0.05;
    camera.position.set(cp[0] + (reduce ? 0 : S.ppx * 1.3), cp[1] + (reduce ? 0 : -S.ppy * 0.9), cp[2]);
    camera.lookAt(cl[0], cl[1], cl[2]);
    /* world rotation */
    if (S.autoRot) { S.rotTarget += S.autoRot * dt; S.rotY += (S.rotTarget - S.rotY) * Math.min(1, dt * 3); } else { S.rotTarget = 0; S.rotY += (0 - S.rotY) * Math.min(1, dt * 2.2); }
    world.rotation.y = S.rotY;
    /* uniforms */
    U.uTime.value = S.time; U.uWave.value = S.wave; U.uBurst.value = S.burst;
    if (S.burst < 6) S.burst += dt;
    if (S.wave >= 0) { S.wave += dt * 1.6; if (S.wave > 7) S.wave = -1; }
    S.keep += ((S.keepTarget || 0) - S.keep) * Math.min(1, dt * 3); U.uKeep.value = S.keep;
    S.flow += (S.flowT - S.flow) * Math.min(1, dt * 2.5); U.uFlow.value = S.flow * 0.9;
    S.edge = S.edge == null ? 1 : S.edge; S.edge += (S.edgeT - S.edge) * Math.min(1, dt * 2.5); U.uEdge.value = S.edge * 0.5;
    /* fades */
    [edgeLines, arcLines, walletPts, guideScale, guideBars, thrDisc, orbitPts].concat(slabs).forEach(function (o) {
      if (o && o.__f) { o.__f.t = Math.min(1, o.__f.t + dt / o.__f.dur); if (o !== edgeLines) o.material.opacity = o.__f.from + (o.__f.to - o.__f.from) * ease(o.__f.t); }
    });
    /* orbit */
    if (orbitPts.material.opacity > 0.01 && S.name === "features") {
      var node = S.opts.node, bp = S.B.pos, P = PAL[S.theme], pa = orbitPts.geometry.attributes.position.array, ca = orbitPts.geometry.attributes.color.array;
      for (var fi = 0; fi < 4; fi++) {
        var fm = FAM[fi], cnt = fm[1] - fm[0], on = !famSel || famSel === famIds[fi];
        for (var k = 0; k < cnt; k++) {
          var ang = S.time * fm[3] + k * 6.2832 / cnt, idx = fm[0] + k, tilt = fi * 0.5;
          pa[idx * 3] = bp[node * 3] + Math.cos(ang) * fm[2]; pa[idx * 3 + 1] = bp[node * 3 + 1] + Math.sin(ang) * fm[2] * Math.sin(tilt + 0.6); pa[idx * 3 + 2] = bp[node * 3 + 2] + Math.sin(ang) * fm[2] * Math.cos(tilt + 0.6);
          var cc = on ? P.accent : P.edge, k2 = on ? 1 : 0.35;
          ca[idx * 3] = cc[0] * k2; ca[idx * 3 + 1] = cc[1] * k2; ca[idx * 3 + 2] = cc[2] * k2;
        }
      }
      orbitPts.geometry.attributes.position.needsUpdate = true; orbitPts.geometry.attributes.color.needsUpdate = true;
    }
    placeLabels();
    renderer.render(scene, camera);
  }
  /* edge fade is driven by uEdge, so the generic fade above skips it */

  function applyTheme() {
    var P = PAL[S.theme];
    U.uAccent.value.setRGB(P.accent[0], P.accent[1], P.accent[2]); U.uEdgeCol.value.setRGB(P.edge[0], P.edge[1], P.edge[2]);
    [arcLines, guideScale, guideBars].forEach(function (o) { o && o.material.color.setRGB(P.plane[0], P.plane[1], P.plane[2]); });
    if (walletPts) walletPts.material.color.setRGB(P.accent[0], P.accent[1], P.accent[2]);
    slabs.forEach(function (m) { m.material.color.setRGB(P.plane[0], P.plane[1], P.plane[2]); });
    if (thrDisc) thrDisc.material.color.setRGB(P.accent[0], P.accent[1], P.accent[2]);
  }
  function setTheme(t) {
    S.theme = t; if (!S.ready) return; applyTheme();
    var c = colorsFor(S.name, S.opts); S.B.col.set(c.col); S.B.sa.set(c.sa); S.A.col.set(c.col); S.A.sa.set(c.sa); syncEdges(); pushNodes();
  }

  function resize() {
    var w = window.innerWidth, h = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); U.uPx.value = dpr * (h / 900);
    camera.aspect = w / h;
    if (w >= 1000) camera.setViewOffset(w, h, w * 0.15, 0, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }

  function init(opts) {
    canvas = opts.canvas; labelBox = opts.labels; S.theme = opts.theme || "dark";
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: "high-performance" }); } catch (e) { return false; }
    renderer.setClearColor(0x000000, 0);
    scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400); world = new THREE.Group(); scene.add(world);
    allocState();
    var lay = layoutOverview(); S.A.pos.set(lay); S.B.pos.set(lay);
    var c = colorsFor("overview", {}); S.A.col.set(c.col); S.B.col.set(c.col); S.A.sa.set(c.sa); S.B.sa.set(c.sa);
    makeNodes(); makeEdges(); makeFlow(); makeExtras(); applyTheme(); syncEdges();
    camera.position.set(0, 17, 27); S.cam.from = { p: [0, 17, 27], l: [0, 0, 0] }; S.cam.to = S.cam.from; S.cam.t = 1; S.lookNow = [0, 0, 0];
    resize(); window.addEventListener("resize", resize);
    window.addEventListener("pointermove", function (e) {
      S.px = (e.clientX / window.innerWidth) * 2 - 1; S.py = (e.clientY / window.innerHeight) * 2 - 1;
      var now = performance.now(); if (now - hoverTimer < 60) return; hoverTimer = now;
      if (e.target !== canvas) { if (S.hover !== -1) { S.hover = -1; cbHover && cbHover(-1); canvas.style.cursor = "default"; } return; }
      var h = pick(e.clientX, e.clientY, 14); if (h !== S.hover) { S.hover = h; canvas.style.cursor = h >= 0 ? "pointer" : "default"; cbHover && cbHover(h, e.clientX, e.clientY); }
    });
    canvas.addEventListener("click", function (e) { var h = pick(e.clientX, e.clientY, 18); if (h >= 0) { selectNode(h); triggerBurst(); cbPick && cbPick(h, e.clientX, e.clientY); } });
    S.ready = true; applyTheme();
    if (S.pending) { var pp = S.pending; S.pending = null; setScene(pp[0], pp[1]); }
    requestAnimationFrame(frame);
    return true;
  }

  window.Scene3D = {
    init: init, setScene: setScene, setTheme: setTheme, setThreshold: function (t) { setThreshold(t); if (S.name === "risk") { var c = colorsFor("risk", S.opts); S.B.col.set(c.col); S.B.sa.set(c.sa); S.A.col.set(c.col); S.A.sa.set(c.sa); syncEdges(); pushNodes(); applyLabels(); } },
    setFamily: function (f) { famSel = f; }, burst: triggerBurst, selectNode: selectNode,
    onPick: function (f) { cbPick = f; }, onHover: function (f) { cbHover = f; },
    info: function (i) { var st = STEP[i]; return { cls: CLS[i] === 2 ? "illicit" : CLS[i] === 1 ? "licit" : "unknown", step: st, split: st <= 34 ? "training" : st <= 41 ? "validation" : "test", risk: CLS[i] === 0 ? RISK[i] : null, degree: NB[i].length }; },
    count: function () { var c = [0, 0, 0]; for (var i = 0; i < N; i++) c[CLS[i]]++; return { nodes: N, edges: E, unknown: c[0], licit: c[1], illicit: c[2] }; },
    flaggedInSample: function (t) { var n = 0; for (var i = 0; i < N; i++) if (CLS[i] === 0 && RISK[i] >= t) n++; return n; },
    scene: function () { return S.name; },
    debug: function () { return { name: S.name, arc: arcLines.material.opacity, wallet: walletPts.material.opacity, slab: slabs[0].material.opacity, edge: U.uEdge.value, flow: U.uFlow.value, mix: U.uMix.value, mixT: S.mixT, cam: camera.position.toArray(), arcs: arcLines.geometry.attributes.position.count }; }
  };
})();
