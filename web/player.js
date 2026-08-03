/* Review UI: drives the source video (bottom) and the scene host (top) from one clock. */
(function () {
  const $ = s => document.querySelector(s);
  const stage = $("#stage"), host = $("#host"), vid = $("#vid");
  const trackEl = $("#track"), headEl = $("#head"), playedEl = $("#played"), segbar = $("#segbar");
  const statusEl = $("#status"), tcEl = $("#tc");

  const S = {
    slug: null, tl: null, tr: null, fps: 25, dur: 0,
    playing: false, loopSeg: false, curSeg: -1, ready: false,
    clips: [[0, 0]], offs: [0], kept: 0, srcDur: 0, drift: 0,
  };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const setStatus = (msg, cls = "") => { statusEl.textContent = msg; statusEl.className = cls; };
  const fmt = t => {
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
  };

  // ---------------------------------------------------------------- layout
  const PAD = 14;
  function fit() {
    const wrap = $("#stagewrap");
    const w = wrap.clientWidth - PAD * 2, h = wrap.clientHeight - PAD * 2;
    if (w <= 0 || h <= 0) return;
    const k = Math.min(w / 1080, h / 1920);
    const dx = (wrap.clientWidth - 1080 * k) / 2;
    const dy = (wrap.clientHeight - 1920 * k) / 2;
    stage.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${k})`;
  }
  addEventListener("resize", fit);
  new ResizeObserver(fit).observe($("#stagewrap"));

  /* split: host em cima (1080×960), vídeo embaixo. compare: vídeo fullscreen e o
     host vira overlay 1080×1920 transparente por cima (z-index no CSS). Mesma
     geometria que o render monta no ffmpeg — mudou aqui, muda em sg/render.py. */
  function applyLayout() {
    const compare = (S.tl.type || "split") === "compare";
    const H = S.tl.height || 1920;
    const topH = compare ? H : Math.round(H * S.tl.split);
    stage.classList.toggle("compare", compare);
    stage.style.setProperty("--split", S.tl.split);
    host.style.height = topH + "px";
    $("#bottom").style.top = (compare ? 0 : topH) + "px";
    $("#bottom").style.height = (compare ? H : H - topH) + "px";
  }

  /* trilha do timeline.music (compare): o preview toca o mesmo arquivo que o
     render mixa. gain_db vira volume do elemento (só atenua — >0dB não dá em
     <audio>); o fade-out do render não é simulado aqui. */
  const music = new Audio();
  music.loop = true;
  function applyMusic() {
    const m = S.tl.music;
    if (!m || !m.file) {
      S.hasMusic = false;
      music.pause();
      music.removeAttribute("src");
      return;
    }
    const src = `/assets/${S.slug}/${m.file}`;
    if (!music.src.endsWith(src)) music.src = src;
    music.volume = Math.min(1, Math.pow(10, (m.gain_db || 0) / 20));
    S.hasMusic = true;
  }
  function musicSeek(t) {
    if (!S.hasMusic || !isFinite(music.duration) || !music.duration) return;
    music.currentTime = t % music.duration;
  }

  function applyCrop() {
    const c = ((S.tl && S.tl.source) || {}).crop || {};
    vid.style.objectPosition = `${((c.x ?? 0.5) * 100).toFixed(2)}% ${((c.y ?? 0.5) * 100).toFixed(2)}%`;
    vid.style.transform = `scale(${c.zoom || 1})`;
  }

  /* Espelho de sg/grade.py — a mesma conta, em SVG. Mudou lá, muda aqui, senão o
     preview mente sobre a cor que vai sair no mp4.
     `color-interpolation-filters="sRGB"` é obrigatório: o default do SVG é
     linearRGB e o preview sairia bem mais claro que o render. */
  const GRADE_DEFAULTS = { exposure: 1, gamma: 1, contrast: 1, saturation: 1,
                           temp: 0, tint: 0, lift: 0 };

  function applyGrade() {
    const g = Object.assign({}, GRADE_DEFAULTS, ((S.tl && S.tl.source) || {}).grade || {});
    const same = Object.keys(GRADE_DEFAULTS).every(k => Math.abs(g[k] - GRADE_DEFAULTS[k]) < 1e-6);
    if (same) { vid.style.filter = ""; return; }

    const e = 1 / Math.max(g.gamma, 1e-6);
    const gr = Math.max(g.exposure * (1 + 0.30 * g.temp) * (1 + 0.15 * g.tint), 0);
    const gg = Math.max(g.exposure * (1 - 0.30 * g.tint), 0);
    const gb = Math.max(g.exposure * (1 - 0.30 * g.temp) * (1 + 0.15 * g.tint), 0);
    const slope = g.contrast, inter = 0.5 - 0.5 * g.contrast + g.lift;
    const amp = v => Math.pow(v, e);   // (ganho·in)^exp = ganho^exp · in^exp

    const f = (c, a) =>
      `<feFunc${c} type="gamma" amplitude="${amp(a).toFixed(6)}" ` +
      `exponent="${e.toFixed(6)}" offset="0"/>`;
    const lin = c => `<feFunc${c} type="linear" slope="${slope.toFixed(6)}" ` +
      `intercept="${inter.toFixed(6)}"/>`;

    $("#gradefx").innerHTML =
      `<filter id="sg-grade" color-interpolation-filters="sRGB">` +
      `<feComponentTransfer>${f("R", gr)}${f("G", gg)}${f("B", gb)}</feComponentTransfer>` +
      `<feComponentTransfer>${lin("R")}${lin("G")}${lin("B")}</feComponentTransfer>` +
      `<feColorMatrix type="saturate" values="${g.saturation.toFixed(6)}"/>` +
      `</filter>`;
    // reatribui pra forçar o Chrome a reavaliar o filtro depois do innerHTML
    vid.style.filter = "none";
    void vid.offsetWidth;
    vid.style.filter = "url(#sg-grade)";
  }

  // ---------------------------------------------------------------- clips
  /* Mirror of sg/clips.py. `source.clips` are keep-ranges in SOURCE seconds and
     timeline time is their concatenation, so the video element has to be driven
     through this map — never with the raw timeline second. Change one side, change
     the other, or the preview stops matching the render. */
  function setClips() {
    const s = (S.tl && S.tl.source) || {};
    const dur = (s.meta && s.meta.duration) || S.dur || 0;
    const raw = (Array.isArray(s.clips) && s.clips.length) ? s.clips
      : (s.trim ? [s.trim] : null);
    let C = (raw || [[0, dur]])
      .map(r => [Math.max(0, +r[0]), Math.min(dur || +r[1], +r[1])])
      .filter(r => r[1] - r[0] > 1e-6)
      .sort((a, b) => a[0] - b[0]);
    if (!C.length) C = [[0, dur]];
    S.clips = C;
    S.offs = [];
    let acc = 0;
    for (const [a, b] of C) { S.offs.push(acc); acc += b - a; }
    S.kept = acc;
    S.srcDur = dur;
    S.drift = Math.abs(acc - S.dur) > 0.05 ? acc - S.dur : 0;
  }

  const srcAt = t => {                    // timeline second -> source second
    const C = S.clips, O = S.offs;
    for (let i = 0; i < C.length; i++) {
      const len = C[i][1] - C[i][0];
      if (t < O[i] + len || i === C.length - 1) return C[i][0] + clamp(t - O[i], 0, len);
    }
    return C[C.length - 1][1];
  };
  const tlAt = s => {                     // source second -> timeline second
    const C = S.clips, O = S.offs;
    for (let i = 0; i < C.length; i++) {
      if (s < C[i][0]) return O[i];       // landed in a cut: snap to the cut point
      if (s < C[i][1]) return O[i] + (s - C[i][0]);
    }
    return S.dur;
  };
  const clipAtSrc = s => {
    const C = S.clips;
    for (let i = 0; i < C.length; i++) if (s >= C[i][0] - 1e-6 && s < C[i][1]) return i;
    return -1;
  };

  // ---------------------------------------------------------------- clock
  function hostSeek(t) {
    const w = host.contentWindow;
    if (w && w.SG && w.SG.ready) w.SG.seek(t);
  }

  function paint(t) {
    const f = Math.round(t * S.fps), total = Math.round(S.dur * S.fps);
    const p = S.dur ? t / S.dur : 0;
    headEl.style.left = (p * 100) + "%";
    playedEl.style.width = (p * 100) + "%";
    const seg = segIndexAt(t);
    tcEl.innerHTML = `${fmt(t)} · <b>f${String(f).padStart(4, "0")}</b>/${total}` +
      (seg >= 0 ? ` · ${S.tl.segments[seg].id}` : "");
    if (seg !== S.curSeg) { S.curSeg = seg; markSeg(); }
    markWord(t);
  }

  function seek(t, andVideo = true) {
    t = clamp(t, 0, Math.max(0, S.dur - 1 / S.fps));
    // land mid-frame, avoids boundary flicker
    if (andVideo) vid.currentTime = srcAt(t) + 0.5 / S.fps;
    if (!S.playing) musicSeek(t);
    hostSeek(t);
    paint(t);
  }

  const now = () => clamp(tlAt(vid.currentTime - 0.5 / S.fps), 0, S.dur);
  const frame = () => Math.round(now() * S.fps);
  const stepFrames = n => { pause(); seek((frame() + n) / S.fps); };

  let jumping = false;   // a cut hop is in flight; currentTime is still stale

  function tick() {
    if (!S.playing) return;
    // playback ran into a cut — hop to the next surviving clip
    const ct = vid.currentTime;
    if (!jumping && S.clips.length > 1 && clipAtSrc(ct) < 0) {
      const nx = S.clips.find(c => c[0] > ct - 1e-6);
      if (!nx) { pause(); return; }
      jumping = true;
      vid.currentTime = nx[0] + 0.5 / S.fps;
      requestAnimationFrame(tick);
      return;
    }
    const t = now();
    if (S.loopSeg && S.curSeg >= 0) {
      const s = S.tl.segments[S.curSeg];
      if (t >= s.end - 1 / S.fps) { seek(s.start); requestAnimationFrame(tick); return; }
    }
    hostSeek(t); paint(t);
    requestAnimationFrame(tick);
  }
  function play() {
    S.playing = true; $("#play").textContent = "⏸"; vid.play();
    if (S.hasMusic) { musicSeek(now()); music.play(); }
    requestAnimationFrame(tick);
  }
  function pause() {
    S.playing = false; $("#play").textContent = "▶"; vid.pause();
    music.pause();
  }
  const toggle = () => (S.playing ? pause() : play());

  function segIndexAt(t) {
    const segs = (S.tl && S.tl.segments) || [];
    let hit = -1;
    segs.forEach((s, i) => { if (t >= s.start && t < s.end) hit = i; });
    return hit;
  }

  // ---------------------------------------------------------------- panels
  const SEG_COLORS = ["#2b3550", "#3a2b50", "#503a2b", "#2b5043", "#4a2b3a", "#2b4450"];

  function renderSegs() {
    const segs = (S.tl && S.tl.segments) || [];
    segbar.innerHTML = "";
    segs.forEach((s, i) => {
      const b = document.createElement("i");
      b.style.left = (s.start / S.dur * 100) + "%";
      b.style.width = ((s.end - s.start) / S.dur * 100) + "%";
      b.style.background = SEG_COLORS[i % SEG_COLORS.length];
      b.textContent = layerNames(s);
      segbar.appendChild(b);
    });

    const pane = $("#pane-segs");
    pane.innerHTML = "";
    segs.forEach((s, i) => {
      const d = document.createElement("div");
      d.className = "seg"; d.dataset.i = i;
      d.innerHTML =
        `<div class="row1"><span class="id">${s.id}</span>` +
        `<span class="sc">${layerNames(s)}</span>` +
        `<span class="tm">${s.start.toFixed(2)}–${s.end.toFixed(2)}s</span></div>` +
        `<div class="pv">${escape_(preview(s))}</div>`;
      d.onclick = () => { pause(); seek(s.start + 0.02); };
      pane.appendChild(d);
    });
    markSeg();
  }

  const layersOf = s => (Array.isArray(s.layers) && s.layers.length)
    ? s.layers : [{ scene: s.scene || "blank", props: s.props || {} }];
  const layerNames = s => layersOf(s).map(l => l.scene).join(" + ");

  function preview(s) {
    return layersOf(s).map(l => {
      const p = l.props || {};
      const bits = [p.text, p.title, p.head,
        Array.isArray(p.lines) ? p.lines.join(" / ") : null,
        Array.isArray(p.items) ? p.items.join(" · ") : null,
        p.label, p.annot, p.fn, p.code, p.src].filter(Boolean);
      return bits.length ? bits.join(" · ") : JSON.stringify(p).slice(0, 90);
    }).join("\n");
  }
  const escape_ = s => s.replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

  function markSeg() {
    document.querySelectorAll(".seg").forEach(d => {
      d.classList.toggle("cur", +d.dataset.i === S.curSeg);
    });
    const cur = document.querySelector(".seg.cur");
    if (cur && $("#pane-segs").classList.contains("on")) {
      cur.scrollIntoView({ block: "nearest" });
    }
  }

  let WORDS = [];        // [{node, start, end}] sorted by start
  let lastIdx = -1;      // index of the highlighted word, -1 = none

  /* transcript.json stays in SOURCE time — it's whisper's ground truth. Map it into
     timeline time for display. Cut-away words survive with `cut`, struck through, so
     the text still reads and you can see exactly what disappeared. */
  function tlWords() {
    return ((S.tr && S.tr.words) || []).map(w => {
      const i = clipAtSrc(w.start);
      if (i < 0) {
        const t = tlAt(w.start);
        return { word: w.word, src: w.start, start: t, end: t, cut: true };
      }
      const a = tlAt(w.start);
      const b = tlAt(Math.min(w.end, S.clips[i][1] - 1e-4));
      return { word: w.word, src: w.start, start: a, end: Math.max(b, a + 0.01), cut: false };
    });
  }

  function renderTranscript() {
    const box = $("#tr");
    box.innerHTML = "";
    WORDS = []; lastIdx = -1; pastUpto = -1;
    const words = tlWords();
    if (!words.length) {
      box.innerHTML = `<div style="color:var(--muted)">sem transcrição —
        rode <code>./sg.sh transcribe ${S.slug}</code></div>`;
      return;
    }
    const frag = document.createDocumentFragment();
    words.forEach(w => {
      const n = document.createElement("span");
      n.className = w.cut ? "w cut" : "w";
      n.textContent = w.word + " ";
      n.title = w.cut ? `cortado (fonte ${w.src.toFixed(2)}s)`
        : `${w.start.toFixed(2)}s · fonte ${w.src.toFixed(2)}s`;
      n.onclick = () => { pause(); seek(w.start); };
      frag.appendChild(n);
      WORDS.push({ node: n, start: w.start, end: w.end });
    });
    box.appendChild(frag);
  }

  /** dashed marks on the scrub bar where the source was cut */
  function renderCuts() {
    const box = $("#cuts");
    box.innerHTML = "";
    if (!S.dur || S.clips.length < 2) return;
    S.offs.slice(1).forEach(o => {
      const i = document.createElement("i");
      i.style.left = (o / S.dur * 100) + "%";
      box.appendChild(i);
    });
  }

  /** last word with start <= t, via binary search */
  function wordIndexAt(t) {
    let lo = 0, hi = WORDS.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (WORDS[mid].start <= t) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    return ans >= 0 && t < WORDS[ans].end ? ans : ~ans; // ~i encodes "past index i, not inside"
  }

  function markWord(t) {
    if (!WORDS.length) return;
    const raw = wordIndexAt(t);
    const idx = raw >= 0 ? raw : -1;                    // currently spoken word
    const upto = raw >= 0 ? raw : ~raw;                 // last word that already ended
    if (idx === lastIdx) { repaintPast(upto); return; }
    if (lastIdx >= 0) WORDS[lastIdx].node.classList.remove("on");
    if (idx >= 0) {
      const n = WORDS[idx].node;
      n.classList.add("on");
      if ($("#pane-tr").classList.contains("on")) n.scrollIntoView({ block: "nearest" });
    }
    lastIdx = idx;
    repaintPast(upto);
  }

  let pastUpto = -1;
  function repaintPast(upto) {
    if (upto === pastUpto) return;
    const [a, b] = upto > pastUpto ? [pastUpto + 1, upto] : [upto + 1, pastUpto];
    const add = upto > pastUpto;
    for (let i = Math.max(0, a); i <= Math.min(b, WORDS.length - 1); i++) {
      WORDS[i].node.classList.toggle("past", add);
    }
    pastUpto = upto;
  }

  function renderInfo() {
    const m = ((S.tl.source || {}).meta) || {};
    const c = (S.tl.source || {}).crop || {};
    const compare = (S.tl.type || "split") === "compare";
    const rows = [
      ["projeto", S.slug],
      ["tipo", S.tl.type || "split"],
      ["duração", `${S.dur.toFixed(2)}s · ${Math.round(S.dur * S.fps)} frames @ ${S.fps}fps`],
      ["saída", compare
        ? `${S.tl.width}×${S.tl.height} · overlay fullscreen`
        : `${S.tl.width}×${S.tl.height} · topo ${S.tl.width}×${Math.round(S.tl.height * S.tl.split)}`],
      ["música", S.tl.music && S.tl.music.file
        ? `${S.tl.music.file} · ${S.tl.music.gain_db ?? 0}dB`
        : "—"],
      ["fonte", `${m.width}×${m.height} @ ${m.fps}fps · áudio: ${m.has_audio ? "sim" : "não"}`],
      ["crop", `x=${c.x ?? 0.5} y=${c.y ?? 0.5} zoom=${c.zoom ?? 1}`],
      ["clipes", S.clips.length === 1
        ? "1 (fonte inteira)"
        : `${S.clips.length} · ${(S.srcDur - S.kept).toFixed(2)}s cortados`],
      ["segmentos", (S.tl.segments || []).length],
      ["transcrição", S.tr && S.tr.words && S.tr.words.length
        ? `${S.tr.words.length} palavras · ${S.tr.language}` : "—"],
      ["timeline", `projects/${S.slug}/timeline.json`],
    ];
    $("#meta").innerHTML = rows.map(([k, v]) => `<div>${k}: <b>${v}</b></div>`).join("");
  }

  // ---------------------------------------------------------------- loading
  async function loadProjects(select) {
    const { projects } = await fetch("/api/projects").then(r => r.json());
    const sel = $("#proj");
    sel.innerHTML = projects.map(p =>
      `<option value="${p.slug}">${p.slug} · ${(p.duration || 0).toFixed(1)}s · ${p.segments} seg</option>`
    ).join("");
    if (!projects.length) { setStatus("nenhum projeto — envie um vídeo", "err"); return null; }
    const want = select || localStorage.sgProject || projects[0].slug;
    sel.value = projects.some(p => p.slug === want) ? want : projects[0].slug;
    return sel.value;
  }

  async function openProject(slug, keepTime = false) {
    const t0 = keepTime ? now() : 0;
    S.slug = slug;
    localStorage.sgProject = slug;
    S.ready = false;
    [S.tl, S.tr] = await Promise.all([
      fetch(`/api/project/${slug}/timeline`, { cache: "no-store" }).then(r => r.json()),
      fetch(`/api/project/${slug}/transcript`, { cache: "no-store" }).then(r => r.json()).catch(() => null),
    ]);
    S.fps = S.tl.fps || 25;
    S.dur = S.tl.duration || 0;
    setClips();
    applyLayout(); applyMusic();
    applyCrop(); applyGrade();
    renderSegs(); renderCuts(); renderTranscript(); renderInfo();

    if (vid.dataset.slug !== slug) {
      vid.src = `/media/${slug}/source.mp4`;
      vid.dataset.slug = slug;
      await new Promise(r => vid.addEventListener("loadeddata", r, { once: true }));
    }
    host.src = `/host.html?project=${slug}&t=${Date.now()}`;
    await new Promise(r => host.addEventListener("load", r, { once: true }));
    await waitReady();
    S.ready = true;
    fit(); seek(t0);
    setStatus("pronto", "ok");
    refreshPublish();
  }

  function waitReady() {
    return new Promise(res => {
      const t = setInterval(() => {
        const w = host.contentWindow;
        if (w && w.SG && w.SG.ready) { clearInterval(t); res(); }
      }, 40);
      setTimeout(() => { clearInterval(t); res(); }, 15000);
    });
  }

  async function reloadHost() {
    const t = now();
    host.src = `/host.html?project=${S.slug}&t=${Date.now()}`;
    await new Promise(r => host.addEventListener("load", r, { once: true }));
    await waitReady();
    seek(t, false);
  }

  async function reloadTimeline() {
    const t = now();
    S.tl = await fetch(`/api/project/${S.slug}/timeline`, { cache: "no-store" }).then(r => r.json());
    S.tr = await fetch(`/api/project/${S.slug}/transcript`, { cache: "no-store" })
      .then(r => r.json()).catch(() => S.tr);
    S.fps = S.tl.fps || 25; S.dur = S.tl.duration || S.dur;
    setClips();
    applyLayout(); applyMusic();
    applyCrop(); applyGrade(); renderSegs(); renderCuts(); renderTranscript(); renderInfo();
    const w = host.contentWindow;
    if (w && w.SG && w.SG.reload) await w.SG.reload(t);
    seek(clamp(t, 0, S.dur), true);
    if (S.drift) {
      // duration and the clips disagree: the render would produce a different
      // number of frames than the preview shows. `sg.sh clips` keeps them equal.
      setStatus(`duration ≠ soma dos clipes (${S.drift > 0 ? "+" : ""}${S.drift.toFixed(2)}s)`, "err");
    } else {
      setStatus("timeline recarregada " + new Date().toLocaleTimeString(), "ok");
    }
  }

  // ---------------------------------------------------------------- ws
  function connect() {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    ws.onmessage = async ev => {
      const m = JSON.parse(ev.data);
      if (m.type === "reload") {
        if (m.kind === "timeline") return reloadTimeline();
        const files = m.files || [];
        if (files.some(f => f.startsWith("player."))) { sessionStorage.sgT = now(); location.reload(); }
        else { setStatus("recarregando cenas…"); await reloadHost(); setStatus("cenas atualizadas", "ok"); }
      } else if (m.type === "projects-changed") {
        loadProjects(S.slug);
      } else if (m.type === "render") {
        if (m.stage === "error") { setStatus("erro: " + m.error, "err"); $("#render").disabled = false; $("#bar").style.width = 0; }
        else if (m.stage === "done") {
          setStatus("render pronto ✓", "ok"); $("#render").disabled = false; $("#bar").style.width = "100%";
          if (m.url) window.open(m.url, "_blank");
          refreshPublish();
        } else {
          setStatus(`${m.stage} ${(m.pct * 100).toFixed(0)}%`);
          $("#bar").style.width = (m.pct * 100) + "%";
        }
      } else if (m.type === "publish") {
        onPublishMsg(m);
      } else if (m.type === "oauth") {
        setStatus(`${m.platform} conectado ✓`, "ok");
        refreshPublish();
      }
    };
    ws.onclose = () => setTimeout(connect, 1200);
  }

  // ---------------------------------------------------------------- events
  $("#play").onclick = toggle;
  $("#pf").onclick = () => stepFrames(-1);
  $("#nf").onclick = () => stepFrames(1);
  $("#ps").onclick = () => jumpSeg(-1);
  $("#ns").onclick = () => jumpSeg(1);
  $("#proj").onchange = e => openProject(e.target.value);
  $("#upload-btn").onclick = () => $("#file").click();
  $("#file").onchange = e => e.target.files[0] && upload(e.target.files[0]);

  $("#loop").onclick = e => { S.loopSeg = !S.loopSeg; e.target.classList.toggle("on", S.loopSeg); };
  $("#guides-btn").onclick = e => { stage.classList.toggle("guides"); e.target.classList.toggle("on"); };
  let mode = 0;
  const MODES = ["ambos", "só topo", "só vídeo"];
  $("#mode").onclick = () => setMode((mode + 1) % 3);
  function setMode(m) {
    mode = m;
    stage.className = (stage.classList.contains("guides") ? "guides " : "") +
      ["", "mode-top", "mode-bottom"][m];
    $("#mode").textContent = MODES[m];
  }

  function jumpSeg(d) {
    const segs = S.tl.segments || [];
    if (!segs.length) return;
    pause();
    const i = clamp((S.curSeg < 0 ? 0 : S.curSeg) + d, 0, segs.length - 1);
    seek(segs[i].start + 0.02);
  }

  $("#render").onclick = async () => {
    $("#render").disabled = true;
    $("#bar").style.width = 0;
    setStatus("renderizando…");
    await fetch(`/api/project/${S.slug}/render`, { method: "POST" });
  };

  // ---------------------------------------------------------------- publicar
  const PLATS = ["youtube", "instagram", "tiktok"];
  const pub = { state: null, busy: {} };

  async function refreshPublish() {
    try {
      pub.state = await fetch(`/api/project/${S.slug}/publish`, { cache: "no-store" }).then(r => r.json());
    } catch { pub.state = null; }
    const b = $("#publish-btn");
    const ok = !!(pub.state && pub.state.video);
    b.disabled = !ok;
    b.title = ok ? "publicar nas redes" : "renderize antes";
    if (!$("#pubmodal").hidden) renderPubModal();
  }

  function capFor(p) {
    const s = pub.state.spec, ov = (s.overrides || {})[p] || {};
    const cap = ov.caption !== undefined ? ov.caption : s.caption;
    const tags = (ov.hashtags !== undefined ? ov.hashtags : s.hashtags) || [];
    const title = ov.title !== undefined ? ov.title : s.title;
    return { title, text: (cap || "") + (tags.length ? "\n\n" + tags.map(t => "#" + t).join(" ") : "") };
  }

  function renderPubModal() {
    const st = pub.state;
    $("#pubvideo").textContent = st.video ? `${st.video.name} · ${(st.video.size / 1e6).toFixed(1)}MB` : "";
    $("#pubplats").innerHTML = PLATS.map(p => {
      const c = st.connected[p] || {};
      const done = st.results[p];
      const busy = pub.busy[p];
      const cap = capFor(p);
      const badge = c.connected
        ? `<span class="badge ok">conectado ✓</span>
           <a class="connect" href="/oauth/${p}" target="_blank" title="refazer o login">reconectar</a>` +
          (p === "tiktok"
            ? ` <a class="connect" href="/oauth/tiktok?scopes=user.info.basic,video.upload,video.publish"
                   target="_blank" title="reautoriza pedindo o Direct Post — só funciona depois do TikTok aprovar o escopo video.publish">+ direct post</a>`
            : "")
        : c.configured
          ? `<a class="connect" href="/oauth/${p}" target="_blank">conectar →</a>`
          : `<span class="badge warn" title="faltam as credenciais do app no .env — veja o README">app não configurado</span>`;
      let foot = "";
      if (busy === "uploading") foot = `<div class="posted">enviando…</div>`;
      else if (busy && busy.startsWith("erro")) foot = `<div class="err">${busy}</div>`;
      else if (done) foot = `<div class="posted">publicado ${done.at || ""} ${done.url ? `· <a href="${done.url}" target="_blank" style="color:inherit">${done.url}</a>` : ""}${done.note ? "<br>" + esc(done.note) : ""}</div>`;
      return `<div class="pubplat">
        <div class="hd">
          <input type="checkbox" data-plat="${p}" ${c.connected && !done ? "checked" : ""} ${c.connected ? "" : "disabled"}>
          <b>${p}</b>${badge}
          <span class="right">
            <button class="copycap" data-plat="${p}" title="copiar legenda + hashtags">copiar legenda</button>
            ${done ? `<span class="badge ok">postado</span>` : ""}
          </span>
        </div>
        <div class="cap">${p === "youtube" ? "<b>" + esc(cap.title) + "</b>\n" : ""}${esc(cap.text)}</div>
        ${foot}
      </div>`;
    }).join("");
    const sch = st.scheduled;
    $("#pubmsg").className = "";
    $("#pubmsg").innerHTML = sch
      ? `agendado pra ${new Date(sch.at).toLocaleString()} (${sch.platforms.join(", ")}) · <a href="#" id="pubcancel" style="color:var(--accent)">cancelar</a>`
      : "";
    const cancel = $("#pubcancel");
    if (cancel) cancel.onclick = async e => {
      e.preventDefault();
      await fetch(`/api/project/${S.slug}/publish/cancel`, { method: "POST" });
      refreshPublish();
    };
    document.querySelectorAll(".copycap").forEach(b => {
      b.onclick = async () => {
        await navigator.clipboard.writeText(capFor(b.dataset.plat).text);
        b.textContent = "copiado ✓";
        setTimeout(() => { b.textContent = "copiar legenda"; }, 1600);
      };
    });
  }

  function esc(s) {
    return (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function onPublishMsg(m) {
    if (m.slug !== S.slug) return;
    if (m.stage === "scheduled") { setStatus("agendado ✓", "ok"); refreshPublish(); return; }
    if (m.stage === "uploading") { pub.busy[m.platform] = "uploading"; setStatus(`${m.platform}: enviando…`); }
    else if (m.stage === "done") { delete pub.busy[m.platform]; setStatus(`${m.platform}: publicado ✓`, "ok"); refreshPublish(); return; }
    else if (m.stage === "skipped") { delete pub.busy[m.platform]; setStatus(`${m.platform}: já publicado`, "ok"); refreshPublish(); return; }
    else if (m.stage === "error") { pub.busy[m.platform] = "erro: " + m.error; setStatus(`${m.platform}: erro`, "err"); }
    if (!$("#pubmodal").hidden) renderPubModal();
  }

  $("#publish-btn").onclick = async () => {
    await refreshPublish();
    if (!pub.state || !pub.state.video) return;
    $("#pubmodal").hidden = false;
    renderPubModal();
  };
  $("#pubclose").onclick = () => { $("#pubmodal").hidden = true; };
  $("#pubmodal").onclick = e => { if (e.target.id === "pubmodal") $("#pubmodal").hidden = true; };
  document.querySelectorAll('input[name="when"]').forEach(r => {
    r.onchange = () => { $("#pubwhen").disabled = document.querySelector('input[name="when"]:checked').value !== "later"; };
  });

  $("#pubgo").onclick = async () => {
    const plats = [...document.querySelectorAll("#pubplats input[data-plat]:checked")].map(i => i.dataset.plat);
    const msg = $("#pubmsg");
    if (!plats.length) { msg.className = "err"; msg.textContent = "selecione ao menos uma plataforma conectada"; return; }
    let when = null;
    if (document.querySelector('input[name="when"]:checked').value === "later") {
      const v = $("#pubwhen").value;
      if (!v) { msg.className = "err"; msg.textContent = "escolha data e hora"; return; }
      const d = new Date(v);
      if (d <= new Date()) { msg.className = "err"; msg.textContent = "agendamento no passado"; return; }
      when = d.toISOString();
    }
    $("#pubgo").disabled = true;
    const r = await fetch(`/api/project/${S.slug}/publish`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platforms: plats, when }),
    });
    $("#pubgo").disabled = false;
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { msg.className = "err"; msg.textContent = d.detail || "falhou"; return; }
    msg.className = "ok";
    msg.textContent = when ? `agendado ✓ ${new Date(when).toLocaleString()}` : "publicando… acompanhe pelos cards";
    if (when) refreshPublish();
  };

  let scrubbing = false;
  const scrubTo = e => {
    const r = trackEl.getBoundingClientRect();
    seek(clamp((e.clientX - r.left) / r.width, 0, 1) * S.dur);
  };
  trackEl.onmousedown = e => { pause(); scrubbing = true; scrubTo(e); };
  addEventListener("mousemove", e => scrubbing && scrubTo(e));
  addEventListener("mouseup", () => (scrubbing = false));

  document.querySelectorAll("#tabs button").forEach(b => {
    b.onclick = () => {
      document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("on", x === b));
      document.querySelectorAll(".pane").forEach(p => p.classList.toggle("on", p.id === "pane-" + b.dataset.p));
    };
  });

  addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    const k = e.key;
    if (k === " ") { e.preventDefault(); toggle(); }
    else if (k === "ArrowLeft") { e.preventDefault(); stepFrames(e.shiftKey ? -10 : -1); }
    else if (k === "ArrowRight") { e.preventDefault(); stepFrames(e.shiftKey ? 10 : 1); }
    else if (k === "," ) stepFrames(-1);
    else if (k === "." ) stepFrames(1);
    else if (k === "[") jumpSeg(-1);
    else if (k === "]") jumpSeg(1);
    else if (k === "Home") { pause(); seek(0); }
    else if (k === "End") { pause(); seek(S.dur - 1 / S.fps); }
    else if (k.toLowerCase() === "l") $("#loop").click();
    else if (k.toLowerCase() === "g") $("#guides-btn").click();
    else if (k === "1" || k === "2" || k === "3") setMode(+k - 1);
  });

  vid.addEventListener("seeked", () => {
    jumping = false;
    if (!S.playing) { hostSeek(now()); paint(now()); }
  });
  vid.addEventListener("ended", pause);

  // drag & drop upload
  const drop = $("#drop");
  addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("on"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("on"));
  drop.addEventListener("drop", e => {
    e.preventDefault(); drop.classList.remove("on");
    const f = e.dataTransfer.files[0];
    if (f) upload(f);
  });

  async function upload(file) {
    setStatus("enviando " + file.name + "…");
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/upload", { method: "POST", body: fd }).then(r => r.json());
    setStatus(`projeto '${r.slug}' criado — rode: ./sg transcribe ${r.slug}`, "ok");
    await loadProjects(r.slug);
    await openProject(r.slug);
  }

  (async function boot() {
    connect();
    const slug = await loadProjects();
    if (slug) await openProject(slug);
    if (sessionStorage.sgT) { seek(+sessionStorage.sgT); delete sessionStorage.sgT; }
    fit();
  })();
})();
