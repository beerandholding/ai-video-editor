/* Scene engine. Same code path drives the live preview and the headless render.
   Contract: seek(t) is a pure function of time — never rAF-driven state. */
(function () {
  const stage = document.getElementById("stage");
  const qs = new URLSearchParams(location.search);
  const slug = qs.get("project");

  const S = window.SG;
  S.slug = slug;
  S.timeline = null;
  S.transcript = null;
  S.t = 0;
  S._layers = []; // [{key, def, ctx, el}]

  function normLayers(seg) {
    if (Array.isArray(seg.layers) && seg.layers.length) return seg.layers;
    return [{ scene: seg.scene || "blank", props: seg.props || {} }];
  }

  function segmentAt(t) {
    const segs = (S.timeline && S.timeline.segments) || [];
    let hit = null;
    for (const s of segs) if (t >= s.start && t < s.end) hit = s;
    if (!hit && segs.length && t >= segs[segs.length - 1].end) hit = segs[segs.length - 1];
    return hit;
  }

  function layerKey(seg, l, i) {
    return seg.id + "|" + i + "|" + l.scene + "|" + JSON.stringify(l.props || {});
  }

  /* split: cenas ocupam só o topo (1080×960). compare: o vídeo é fullscreen e
     as cenas viram uma camada 1080×1920 de fundo TRANSPARENTE por cima — o
     render tira screenshot com alpha e o ffmpeg faz overlay. */
  function stageH() {
    const tl = S.timeline || {};
    const H = tl.height || 1920;
    return tl.type === "compare" ? H : Math.round(H * (tl.split ?? 0.5));
  }

  function applySize() {
    const h = stageH();
    S.H = h;
    for (const el of [document.documentElement, document.body, stage]) {
      el.style.width = "1080px";
      el.style.height = h + "px";
    }
  }

  function applyTheme() {
    const th = (S.timeline && S.timeline.theme) || {};
    const compare = S.timeline && S.timeline.type === "compare";
    const r = document.documentElement.style;
    for (const [k, v] of Object.entries(th)) r.setProperty("--" + k, v);
    stage.style.background = compare ? "transparent" : (th.bg || "#000");
    document.documentElement.style.background = compare ? "transparent" : "#000";
    document.body.style.background = compare ? "transparent" : "#000";
    stage.style.color = th.fg || "#fff";
    stage.style.fontFamily = (th.font || "Inter") + ", system-ui, sans-serif";
  }

  function teardown() {
    for (const L of S._layers) {
      try { L.def.unmount && L.def.unmount(L.ctx); } catch (e) { console.warn(e); }
      L.el.remove();
    }
    S._layers = [];
  }

  function build(seg) {
    teardown();
    if (!seg) return;
    const th = (S.timeline && S.timeline.theme) || {};
    normLayers(seg).forEach((l, i) => {
      const def = S.scenes[l.scene] || S.scenes.blank;
      if (!S.scenes[l.scene]) console.warn("unknown scene:", l.scene);
      const el = document.createElement("div");
      el.className = "layer layer-" + l.scene;
      stage.appendChild(el);
      const props = Object.assign({}, def.defaults || {}, l.props || {});
      const ctx = {
        root: el, props, theme: th, W: 1080, H: S.H || 960,
        seg, duration: seg.end - seg.start,
        transcript: S.transcript, slug,
      };
      try { def.mount && def.mount(ctx); } catch (e) { console.error("mount", l.scene, e); }
      S._layers.push({ key: layerKey(seg, l, i), def, ctx, el });
    });
    S._cur = seg;
    S._curKeys = normLayers(seg).map((l, i) => layerKey(seg, l, i)).join("~");
  }

  S.seek = function (t) {
    S.t = t;
    const seg = segmentAt(t);
    const keys = seg ? normLayers(seg).map((l, i) => layerKey(seg, l, i)).join("~") : "";
    if (!seg) { teardown(); S._cur = null; S._curKeys = ""; return; }
    if (keys !== S._curKeys) build(seg);
    const local = t - seg.start;
    for (const L of S._layers) {
      try { L.def.seek && L.def.seek(local, L.ctx); } catch (e) { console.error("seek", e); }
    }
  };

  S.reload = async function (t) {
    const [tl, tr] = await Promise.all([
      fetch(`/api/project/${slug}/timeline`, { cache: "no-store" }).then(r => r.json()),
      fetch(`/api/project/${slug}/transcript`, { cache: "no-store" })
        .then(r => r.json()).catch(() => null),
    ]);
    S.timeline = tl;
    S.transcript = tr;
    applySize();
    applyTheme();
    S._curKeys = "";
    S.seek(t == null ? S.t : t);
    return tl;
  };

  (async function init() {
    if (!slug) { stage.textContent = "?project= missing"; return; }
    await S.reload(0);
    await document.fonts.ready;
    // one warm-up frame so first screenshot isn't a cold layout
    S._curKeys = ""; S.seek(0);
    S.ready = true;
    window.parent !== window && window.parent.postMessage({ type: "host-ready" }, "*");
  })();
})();
