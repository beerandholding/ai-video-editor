/* Mono code / formula block with typewriter and line highlighting. */
SG.util.css(`
  .cd { position:absolute; inset:0; display:flex; flex-direction:column;
        justify-content:center; padding:72px 80px; gap:6px; }
  .cd-head { font-size:24px; letter-spacing:.22em; opacity:.4; margin-bottom:22px; }
  .cd-line { font-family: var(--mono), "JetBrains Mono", monospace; white-space:pre;
             line-height:1.5; letter-spacing:-.01em; }
  .cd-hi { position:absolute; left:0; right:0; opacity:0; }
`);

SG.register("code", {
  defaults: {
    head: null,
    code: "det J(f) = const ≠ 0\n  ⇒  f é invertível?",
    size: 42,
    typewriter: true,
    cps: 26,              // chars per second
    delay: 0.2,
    highlight: [],        // 1-based line numbers to accent once typed
    accent: null,
    color: null,
  },
  mount(ctx) {
    const p = ctx.props, u = SG.util;
    const wrap = u.el("div", "cd");
    if (p.head) { ctx.head = u.el("div", "cd-head sg-mono", p.head); wrap.appendChild(ctx.head); }
    ctx.raw = String(p.code).split("\n");
    ctx.lines = ctx.raw.map(() => {
      const n = u.el("div", "cd-line");
      n.style.fontSize = p.size + "px";
      n.style.color = p.color || ctx.theme.fg || "#fff";
      wrap.appendChild(n);
      return n;
    });
    ctx.offsets = [];
    let acc = 0;
    for (const l of ctx.raw) { ctx.offsets.push(acc); acc += l.length + 1; }
    ctx.total = acc;
    ctx.root.appendChild(wrap);
  },
  seek(t, ctx) {
    const p = ctx.props, u = SG.util;
    if (ctx.head) ctx.head.style.opacity = u.prog(t, p.delay - 0.1, 0.4).toFixed(4);
    const typed = p.typewriter
      ? u.clamp((t - p.delay) * p.cps, 0, ctx.total)
      : (t >= p.delay ? ctx.total : 0);
    ctx.raw.forEach((line, i) => {
      const n = ctx.lines[i];
      const shown = u.clamp(typed - ctx.offsets[i], 0, line.length);
      n.textContent = line.slice(0, Math.floor(shown)) || " ";
      n.style.opacity = shown > 0 ? "1" : "0";
      const done = shown >= line.length && line.length > 0;
      n.style.color = (done && p.highlight.includes(i + 1))
        ? (p.accent || ctx.theme.accent || "#e11d48")
        : (p.color || ctx.theme.fg || "#fff");
    });
  },
});
