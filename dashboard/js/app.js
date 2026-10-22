(function () {
  "use strict";
  var D = window.FORENSICS_DATA, EXP = window.EXPERIMENTS, BARS = window.BARS, GROUPS = window.GROUPS;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function el(tag, attrs, text) { var e = document.createElement(tag); if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); }); if (text != null) e.textContent = text; return e; }
  function fmt(n) { return Number(n).toLocaleString("en-US"); }

  /* ------------------------------------------------------------ theme */
  var root = document.documentElement, themeBtn = $("#theme");
  var saved = null; try { saved = localStorage.getItem("theme"); } catch (e) {}
  var qth = new URLSearchParams(location.search).get("theme"); if (qth === "light" || qth === "dark") saved = qth;
  var theme = saved || (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  function setTheme(t) {
    theme = t; root.setAttribute("data-theme", t); themeBtn.textContent = t === "dark" ? "Light" : "Dark";
    try { localStorage.setItem("theme", t); } catch (e) {}
    if (window.Scene3D) Scene3D.setTheme(t);
  }
  root.setAttribute("data-theme", theme); themeBtn.textContent = theme === "dark" ? "Light" : "Dark";
  themeBtn.addEventListener("click", function () { setTheme(theme === "dark" ? "light" : "dark"); });

  /* ------------------------------------------------------------ scene state per section */
  var ctx = {
    split: "", family: null, variant: "robust", metric: "pr", bar: null, threshold: 0.9, caseIndex: 0
  };
  var SCENES = [
    { id: "hero", label: "Overview", scene: "overview", cap: ["Illustrative graph", "1,700 nodes drawn to match the real class mix and split. They are not real transactions. Click any node."] },
    { id: "facts", label: "The data", scene: "data", cap: ["Grouped by class", "Illicit nodes sit in the core, licit around them, unknown on the outside. Most of the graph is unlabelled."] },
    { id: "split", label: "Time split", scene: "time", cap: ["Arranged by time step", "Each column is a time step. Edges never leave their column, so no information crosses the split."] },
    { id: "leak", label: "Leakage audit", scene: "leak", cap: ["Static wallet records", "Each wallet record is one snapshot of an address's whole history, yet it can reach transactions in many time steps."] },
    { id: "features", label: "Features", scene: "features", cap: ["Fourteen features", "Beads orbit one transaction, one ring per feature family. Pick a family to light its ring."] },
    { id: "scaling", label: "Scaling", scene: "scale", cap: ["One value per node", "Toggle the scaler. RobustScaler throws a few values far off the chart, the quantile transform keeps all of them bounded."] },
    { id: "model", label: "Model", scene: "model", cap: ["Message passing", "Click a node. Layer 1 reaches its neighbours, layer 2 reaches their neighbours."] },
    { id: "experiments", label: "Experiments", scene: "bars", cap: ["Test results as bars", "Each column is one experiment, built from the same nodes. Taller means a higher value of the chosen metric."] },
    { id: "unknown", label: "Unknown scoring", scene: "risk", cap: ["Risk of unknown nodes", "Height is the illicit-risk score. Nodes above the plane are flagged. The sample follows the real score distribution."] },
    { id: "analyzer", label: "Analyzer", scene: "case", cap: ["One transaction", "The selected node stands for one of the real top-20 cases. Its numbers are on the right."] },
    { id: "limits", label: "Limits", scene: "overview", cap: ["Back to the graph", "Limits, next steps and the plots behind the numbers."] }
  ];
  var byId = {}; SCENES.forEach(function (s) { byId[s.id] = s; });
  var current = null;

  function sceneOpts(id) {
    var o = { burst: true };
    if (id === "split") o.split = ctx.split;
    if (id === "features") { o.family = ctx.family; o.caseIndex = 0; }
    if (id === "scaling") o.variant = ctx.variant;
    if (id === "experiments") { o.metric = ctx.metric; o.bar = ctx.bar; }
    if (id === "unknown") o.threshold = ctx.threshold;
    if (id === "analyzer") o.caseIndex = ctx.caseIndex;
    return o;
  }
  function go(id, opts) {
    var s = byId[id]; if (!s) return;
    var changed = current !== id; current = id;
    $$("#rail button").forEach(function (b) { b.setAttribute("aria-current", b.dataset.id === id ? "true" : "false"); });
    $("#cap-title").textContent = s.cap[0]; $("#cap-text").textContent = s.cap[1];
    var o = sceneOpts(id); if (opts) Object.keys(opts).forEach(function (k) { o[k] = opts[k]; });
    if (id === "features" && ctx.family === null) o.family = null;
    var key = id === "scaling" ? "scale" : id === "experiments" ? "bars" : id === "unknown" ? "risk" : id === "analyzer" ? "case" : id === "hero" || id === "limits" ? "overview" : id === "facts" ? "data" : id === "split" ? "time" : id === "leak" ? "leak" : id;
    if (window.Scene3D) { if (id === "features" || id === "analyzer") o.caseIndex = id === "features" ? 0 : ctx.caseIndex; Scene3D.setScene(s.scene, o); }
    return changed;
  }
  function refresh() { go(current || "hero", { burst: false, fast: true }); }

  /* rail */
  var rail = $("#rail");
  SCENES.forEach(function (s) {
    var b = el("button", { type: "button", "data-id": s.id }, s.label);
    b.addEventListener("click", function () { var t = document.getElementById(s.id); t.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: s.id === "hero" ? "start" : "center" }); go(s.id); });
    rail.appendChild(b);
  });
  $$("[data-go]").forEach(function (a) {
    a.addEventListener("click", function (e) { e.preventDefault(); var id = a.dataset.go; document.getElementById(id).scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }); go(id); });
  });

  /* observe sections */
  var visible = {}, locked = false;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { visible[en.target.id] = en.isIntersecting ? en.intersectionRatio : 0; });
    if (locked) return;
    var best = null, bv = 0.0;
    Object.keys(visible).forEach(function (id) { if (visible[id] > bv) { bv = visible[id]; best = id; } });
    if (best && best !== current && (bv > 0.2 || best === "hero")) go(best);
  }, { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1], rootMargin: "-20% 0px -20% 0px" });
  SCENES.forEach(function (s) { io.observe(document.getElementById(s.id)); });

  /* ------------------------------------------------------------ count up */
  var counted = false;
  function countUp() {
    if (counted || reduce) return; counted = true;
    setTimeout(function () { $$("[data-count]").forEach(function (n) { n.textContent = fmt(+n.dataset.count); }); }, 1600);
    $$("[data-count]").forEach(function (n) {
      var target = +n.dataset.count, t0 = performance.now(), dur = 1100;
      (function step(now) { var p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3); n.textContent = fmt(Math.round(target * e)); if (p < 1) requestAnimationFrame(step); })(t0);
    });
  }
  new IntersectionObserver(function (en) { if (en[0].isIntersecting) countUp(); }, { threshold: 0.4 }).observe($("#facts"));

  /* ------------------------------------------------------------ split buttons */
  $$("#split-btns .btn").forEach(function (b) {
    b.addEventListener("click", function () {
      ctx.split = b.dataset.split; $$("#split-btns .btn").forEach(function (x) { x.classList.toggle("on", x === b && ctx.split !== ""); });
      $$("[data-row]").forEach(function (r) { r.classList.toggle("hl", r.dataset.row === ctx.split); });
      go("split", { burst: true, fast: true });
    });
  });

  /* ------------------------------------------------------------ leakage steps */
  var steps = $("#leak-steps");
  window.LEAK_STEPS.forEach(function (s, i) {
    var li = el("li"), b = el("button", { type: "button", "aria-expanded": "false" }, s.t), d = el("div", { class: "d" }, s.d);
    b.addEventListener("click", function () {
      var open = li.classList.contains("open");
      $$("#leak-steps li").forEach(function (x) { x.classList.remove("open"); $("button", x).setAttribute("aria-expanded", "false"); });
      if (!open) { li.classList.add("open"); b.setAttribute("aria-expanded", "true"); }
      if (window.Scene3D) Scene3D.burst();
    });
    li.appendChild(b); li.appendChild(d); steps.appendChild(li);
  });
  $("button", steps.firstChild).click();

  /* ------------------------------------------------------------ feature families */
  var famBtns = $("#fam-btns"), famBody = $("#fam-table tbody");
  function renderFam() {
    famBody.textContent = "";
    window.FEATURE_FAMILIES.forEach(function (f) {
      if (ctx.family && ctx.family !== f.id) return;
      f.items.forEach(function (it) { var tr = el("tr"); it.forEach(function (c) { tr.appendChild(el("td", null, c)); }); famBody.appendChild(tr); });
    });
  }
  [{ id: null, name: "All 14" }].concat(window.FEATURE_FAMILIES).forEach(function (f) {
    var b = el("button", { class: "btn", type: "button", "aria-pressed": f.id === null ? "true" : "false" }, f.name + (f.items ? " (" + f.items.length + ")" : ""));
    b.addEventListener("click", function () {
      ctx.family = f.id; $$("#fam-btns .btn").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      renderFam(); if (window.Scene3D) { Scene3D.setFamily(f.id); Scene3D.burst(); }
    });
    famBtns.appendChild(b);
  });
  renderFam();

  /* ------------------------------------------------------------ scaling toggle */
  $$("#scale-btns .btn").forEach(function (b) {
    b.addEventListener("click", function () {
      ctx.variant = b.dataset.variant; $$("#scale-btns .btn").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      var big = $("#vs-big"), sub = $("#vs-sub");
      if (ctx.variant === "qt") { big.textContent = "5.1993"; sub.textContent = "largest absolute value after the QuantileTransformer, in every run"; }
      else { big.innerHTML = "2.29 × 10<sup>10</sup>"; sub.textContent = "largest scaled value, Local_feature_37 (raw maximum 13.85, IQR 1.22e-8)"; }
      go("scaling", { burst: true, fast: true });
    });
  });
  $("#vs-big").innerHTML = "2.29 × 10<sup>10</sup>";

  /* ------------------------------------------------------------ experiments explorer */
  var list = $("#exp-list"), filters = $("#exp-filters"), filter = "all";
  $("#exp-intro").textContent = EXP.length + " audits, baselines, model runs and fixes, with why we ran each one and what it taught us. Select one to light its bar.";
  var groupName = {}; GROUPS.forEach(function (g) { groupName[g.id] = g.label; });
  function fchip(id, label) {
    var b = el("button", { class: "btn", type: "button", "aria-pressed": id === "all" ? "true" : "false", "data-f": id }, label);
    b.addEventListener("click", function () { filter = id; $$("#exp-filters .btn").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); renderExps(); if (window.Scene3D) Scene3D.burst(); });
    filters.appendChild(b);
  }
  fchip("all", "All " + EXP.length);
  GROUPS.forEach(function (g) { fchip(g.id, g.label); });
  fchip("bad", "Failed or replaced");
  function verdictText(v) { return v === "kept" ? "kept" : v === "replaced" ? "replaced" : v === "failed" ? "failed" : "finding"; }
  function renderExps() {
    list.textContent = "";
    EXP.forEach(function (x) {
      if (filter === "bad" ? !(x.verdict === "failed" || x.verdict === "replaced") : (filter !== "all" && x.group !== filter)) return;
      var li = el("li", { "data-id": x.id });
      var h = el("button", { class: "h", type: "button", "aria-expanded": "false" });
      var t = el("span", { class: "t" }, x.name); t.appendChild(el("span", { class: "g" }, groupName[x.group]));
      h.appendChild(t); h.appendChild(el("span", { class: "tag " + x.verdict }, verdictText(x.verdict)));
      var b = el("div", { class: "b" }), dl = el("dl");
      [["Why", x.why], ["What", x.what], ["Result", x.result], ["Learned", x.learned]].forEach(function (p) { dl.appendChild(el("dt", null, p[0])); dl.appendChild(el("dd", null, p[1])); });
      b.appendChild(dl); li.appendChild(h); li.appendChild(b);
      h.addEventListener("click", function () {
        var open = li.classList.contains("open");
        $$("#exp-list li").forEach(function (y) { y.classList.remove("open"); $(".h", y).setAttribute("aria-expanded", "false"); });
        if (!open) { li.classList.add("open"); h.setAttribute("aria-expanded", "true"); }
        ctx.bar = !open && x.bar ? x.bar : null; markCmp();
        go("experiments", { fast: true, burst: true });
      });
      list.appendChild(li);
    });
  }
  renderExps();
  $$("#metric-btns .btn").forEach(function (b) {
    b.addEventListener("click", function () { ctx.metric = b.dataset.metric; $$("#metric-btns .btn").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); go("experiments", { fast: true, burst: false }); });
  });

  /* comparison table */
  var sortKey = "pr", sortDir = -1, cmpHead = $("#cmp thead"), cmpBody = $("#cmp tbody");
  var cols = [["label", "Configuration"], ["seeds", "Seeds"], ["pr", "PR-AUC"], ["f1", "F1"], ["roc", "ROC-AUC"]];
  function renderCmp() {
    cmpHead.textContent = ""; var tr = el("tr");
    cols.forEach(function (c) { var th = el("th", { scope: "col", tabindex: "0", "aria-sort": sortKey === c[0] ? (sortDir < 0 ? "descending" : "ascending") : "none" }, c[1] + (sortKey === c[0] ? (sortDir < 0 ? " ▼" : " ▲") : ""));
      function act() { if (sortKey === c[0]) sortDir *= -1; else { sortKey = c[0]; sortDir = c[0] === "label" ? 1 : -1; } renderCmp(); }
      th.addEventListener("click", act); th.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } }); tr.appendChild(th); });
    cmpHead.appendChild(tr);
    var rows = BARS.slice().sort(function (a, b) { var x = a[sortKey], y = b[sortKey]; return (typeof x === "string" ? x.localeCompare(y) : x - y) * sortDir; });
    var best = {}; ["pr", "f1", "roc"].forEach(function (k) { best[k] = Math.max.apply(null, BARS.map(function (b) { return b[k]; })); });
    cmpBody.textContent = "";
    rows.forEach(function (r) {
      var row = el("tr", { "data-bar": r.id });
      cols.forEach(function (c) { var v = r[c[0]]; var td = el("td", null, typeof v === "number" && c[0] !== "seeds" ? v.toFixed(4) : String(v)); if (best[c[0]] === v) td.className = "best"; row.appendChild(td); });
      row.addEventListener("click", function () {
        ctx.bar = ctx.bar === r.id ? null : r.id; markCmp();
        var x = EXP.filter(function (e) { return e.bar === r.id; })[0];
        if (x && ctx.bar) { $$("#exp-list li").forEach(function (y) { y.classList.remove("open"); }); var li = $('#exp-list li[data-id="' + x.id + '"]'); if (li) { li.classList.add("open"); } }
        go("experiments", { fast: true, burst: true });
      });
      cmpBody.appendChild(row);
    });
    markCmp();
  }
  function markCmp() { $$("#cmp tbody tr").forEach(function (r) { r.classList.toggle("hl", r.dataset.bar === ctx.bar); }); }
  renderCmp();

  /* ------------------------------------------------------------ threshold */
  var thr = $("#thr");
  function thrUpdate() {
    var t = (+thr.value).toFixed(2), key = String(+t); var c = D.scores.thr[key] != null ? D.scores.thr[key] : D.scores.thr[(+t).toString()];
    if (c == null) { var k = Object.keys(D.scores.thr).map(Number).sort(function (a, b) { return Math.abs(a - +t) - Math.abs(b - +t); })[0]; c = D.scores.thr[String(k)]; }
    $("#thr-out").textContent = t; $("#thr-count").textContent = fmt(c); $("#thr-pct").textContent = (c / D.scores.total * 100).toFixed(2) + "%";
    ctx.threshold = +t; if (window.Scene3D) { Scene3D.setThreshold(+t); $("#thr-sample").textContent = fmt(Scene3D.flaggedInSample(+t)); }
  }
  thr.addEventListener("input", function () { thrUpdate(); });
  thr.addEventListener("change", function () { if (window.Scene3D) Scene3D.burst(); });

  /* ------------------------------------------------------------ analyzer */
  var caseList = $("#case-list"), detail = $("#case-detail");
  function num(v) { if (v == null) return "n/a"; var a = Math.abs(v); if (a !== 0 && a < 0.001) return v.toExponential(2).replace("e-", "e-"); return +v.toPrecision(4) + ""; }
  function renderCase(i) {
    var c = D.cases[i]; detail.textContent = "";
    detail.appendChild(el("h3", null, "Transaction " + c.tx));
    var m = el("div", { class: "meta" });
    [["time step", c.step], ["score", c.score.toFixed(6)], ["band", c.band], ["logit margin", c.margin != null ? c.margin : "n/a"], ["fingerprint", c.fingerprint ? "yes" : "no"]].forEach(function (p) { var s = el("span", null, p[0] + " "); s.appendChild(el("b", null, String(p[1]))); m.appendChild(s); });
    detail.appendChild(m);
    detail.appendChild(el("p", { class: "small" }, "Class 3, no ground-truth label. Features below are the ones that fall in the top or bottom 5% of the 46,045 labelled transactions."));
    var tb = el("table", { class: "tbl compact" }), th = el("thead"), hr = el("tr");
    ["Feature", "Observed", "Percentile", "Overall", "Class 1", "Class 2", "Unusual"].forEach(function (h) { hr.appendChild(el("th", null, h)); });
    th.appendChild(hr); tb.appendChild(th); var tbd = el("tbody");
    if (!c.features.length) { var er = el("tr"), ec = el("td", { colspan: "7" }, "No extreme behaviour detected for this transaction."); er.appendChild(ec); tbd.appendChild(er); }
    c.features.forEach(function (f) {
      var r = el("tr"); [f.name, num(f.value), f.pct.toFixed(2), num(f.med), num(f.c1), num(f.c2)].forEach(function (v) { r.appendChild(el("td", null, v)); });
      r.appendChild(el("td", { class: "u-" + f.u }, f.u)); tbd.appendChild(r);
    });
    tb.appendChild(tbd); var sc = el("div", { class: "scroll" }); sc.appendChild(tb); detail.appendChild(sc);
    detail.appendChild(el("h3", { class: "sub" }, "What the model reacts to"));
    if (c.attr) {
      var g = el("div", { class: "att" });
      c.attr.forEach(function (a) { g.appendChild(el("span", null, a.name + " (" + a.f + ")")); g.appendChild(el("span", { class: "v" }, (a.d > 0 ? "+" : "") + a.d.toFixed(4))); });
      detail.appendChild(g);
      detail.appendChild(el("p", { class: "note" }, "Change in the illicit logit when the feature is replaced by a training-only baseline. A negative value means the transaction's own value pushes the score up. This is model sensitivity, not cause."));
    } else detail.appendChild(el("p", { class: "note" }, "Case-specific attribution unavailable in the saved outputs for this transaction. The notebook analyzer computes it live."));
    detail.appendChild(el("p", { class: "note" }, "Unusual and model-sensitive are separate claims about the same feature. Together they support prioritising a transaction. They do not establish illicit activity."));
  }
  D.cases.forEach(function (c, i) {
    var b = el("button", { class: "btn", type: "button", "aria-pressed": i === 0 ? "true" : "false" }, "#" + c.rank + " " + c.tx);
    b.addEventListener("click", function () {
      ctx.caseIndex = i; $$("#case-list .btn").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      renderCase(i); go("analyzer", { caseIndex: i, burst: true });
    });
    caseList.appendChild(b);
  });
  renderCase(0);

  /* ------------------------------------------------------------ scene hooks */
  var tip = $("#tip"), inspect = $("#inspect");
  function ok() {
    var good = window.Scene3D && Scene3D.init({ canvas: $("#scene"), labels: $("#labels"), theme: theme });
    if (!good) { document.body.classList.add("no-webgl"); return; }
    Scene3D.onHover(function (i, x, y) {
      if (i < 0) { tip.classList.remove("on"); return; }
      var n = Scene3D.info(i); tip.textContent = n.cls + " node, time step " + n.step + " (" + n.split + "), " + n.degree + " neighbour" + (n.degree === 1 ? "" : "s");
      tip.style.left = x + "px"; tip.style.top = y + "px"; tip.classList.add("on");
    });
    Scene3D.onPick(function (i) {
      var n = Scene3D.info(i);
      inspect.textContent = "";
      var b = el("b", null, "Selected node. "); inspect.appendChild(b);
      inspect.appendChild(document.createTextNode(n.cls + ", time step " + n.step + " (" + n.split + "), " + n.degree + " direct neighbour" + (n.degree === 1 ? "" : "s") + (n.risk != null ? ", sample risk " + n.risk.toFixed(3) : "") + ". Illustrative node, not a real transaction."));
    });
    var q = new URLSearchParams(location.search);
    var h = q.get("only") || (location.hash || "").replace("#", "");
    var start = byId[h] ? h : "hero";
    if (q.get("only")) { locked = true; document.documentElement.style.scrollBehavior = "auto"; if (byId[h]) { document.body.classList.add("solo"); document.getElementById(h).classList.add("solo-target"); } }
    if (q.get("exp")) { var xe = EXP.filter(function (e) { return e.id === q.get("exp"); })[0]; if (xe && xe.bar) ctx.bar = xe.bar; }
    if (q.get("metric")) ctx.metric = q.get("metric");
    if (q.get("variant")) ctx.variant = q.get("variant");
    if (q.get("case")) ctx.caseIndex = Math.min(19, +q.get("case") || 0);
    if (q.get("thr")) { thr.value = q.get("thr"); }
    thrUpdate(); renderCase(ctx.caseIndex);
    go(start, { burst: false });
    if (byId[h] && h !== "hero" && !q.get("only")) document.getElementById(h).scrollIntoView({ block: "start" });
  }
  if (document.readyState === "complete") ok(); else window.addEventListener("load", ok);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") tip.classList.remove("on"); });
  window.addEventListener("hashchange", function () { var h = (location.hash || "").replace("#", ""); if (byId[h]) go(h); });
})();
