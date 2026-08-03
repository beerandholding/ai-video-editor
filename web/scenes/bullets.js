/* Sequentially revealed list. Good for "3 coisas que mudam" style beats. */
SG.util.css(`
  .bl { position:absolute; inset:0; display:flex; flex-direction:column;
        justify-content:center; padding:72px; gap:26px; }
  .bl-title { font-size:52px; font-weight:800; letter-spacing:-.02em; margin-bottom:14px; }
  .bl-item { display:flex; gap:22px; align-items:baseline; font-size:46px;
             font-weight:600; line-height:1.22; will-change:transform,opacity; }
  .bl-mark { flex:0 0 auto; font-weight:800; opacity:.6; }
`);

SG.register("bullets", {
  defaults: {
    title: null,
    items: ["primeiro ponto", "segundo ponto", "terceiro ponto"],
    marker: "—",          // "—", "•", "01" (auto-numbers), or "" for none
    delay: 0.2,
    stagger: 0.55,
    dur: 0.45,
    dim: true,            // fade back earlier items once the next arrives
    accent: null,
    size: 46,
  },
  mount(ctx) {
    const p = ctx.props, u = SG.util;
    const wrap = u.el("div", "bl");
    if (p.title) {
      ctx.title = u.el("div", "bl-title", p.title);
      wrap.appendChild(ctx.title);
    }
    ctx.items = p.items.map((txt, i) => {
      const row = u.el("div", "bl-item");
      row.style.fontSize = p.size + "px";
      if (p.marker !== "") {
        const m = u.el("div", "bl-mark", p.marker === "01" ? String(i + 1).padStart(2, "0") : p.marker);
        m.style.color = p.accent || ctx.theme.accent || "#e11d48";
        if (p.marker === "01") m.classList.add("sg-mono");
        row.appendChild(m);
      }
      row.appendChild(u.el("div", null, txt));
      wrap.appendChild(row);
      return row;
    });
    ctx.root.appendChild(wrap);
  },
  seek(t, ctx) {
    const p = ctx.props, u = SG.util;
    if (ctx.title) {
      const a = u.prog(t, p.delay - 0.15, 0.5, "outCubic");
      ctx.title.style.opacity = a.toFixed(4);
      ctx.title.style.transform = `translateY(${((1 - a) * 16).toFixed(2)}px)`;
    }
    const active = Math.floor(u.clamp((t - p.delay) / p.stagger, 0, p.items.length - 1));
    ctx.items.forEach((row, i) => {
      const a = u.prog(t, p.delay + i * p.stagger, p.dur, "outQuint");
      const dim = p.dim && i < active ? 0.42 : 1;
      row.style.opacity = (a * dim).toFixed(4);
      row.style.transform = `translateX(${((1 - a) * 34).toFixed(2)}px)`;
    });
  },
});
