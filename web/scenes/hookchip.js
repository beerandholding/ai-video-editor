/* Gancho de abertura: linhas curtas com fundo de caption (chip), como legenda
   de CapCut. Vive no pé do canvas — que é o centro do reel completo. */
SG.util.css(`
  .hc { position:absolute; left:60px; right:60px; display:flex;
        flex-direction:column; align-items:center; gap:10px; }
  .hc-line { display:inline-block; font-weight:900; letter-spacing:-.02em;
             line-height:1.06; text-transform:uppercase; white-space:nowrap;
             padding:.18em .55em; border-radius:14px;
             box-shadow:0 6px 30px rgba(0,0,0,.45);
             will-change:transform,opacity; }
`);

SG.register("hookchip", {
  defaults: {
    // [{w, hot}] — hot: chip na cor de destaque com texto branco
    lines: [],
    size: 58,
    bg: "#ffffff",
    color: "#0b0b0e",
    hotBg: null,            // default = theme.accent
    hotColor: "#ffffff",
    bottom: 64,             // px a partir do pé do canvas; null = centro vertical
    tilt: -1.6,             // graus de inclinação do bloco
    delay: 0.12,
    stagger: 0.14,
    pop: 0.34,
    hold: null,             // segundos visível após delay; null = fica
  },
  mount(ctx) {
    const p = ctx.props, u = SG.util;
    const wrap = u.el("div", "hc");
    if (p.bottom != null) wrap.style.bottom = p.bottom + "px";
    else { wrap.style.top = "0"; wrap.style.bottom = "0"; wrap.style.justifyContent = "center"; }
    const hotBg = p.hotBg || ctx.theme.accent || "#e11d48";
    ctx.nodes = p.lines.map(l => {
      const n = u.el("div", "hc-line", l.w);
      n.style.fontSize = p.size + "px";
      n.style.background = l.hot ? hotBg : p.bg;
      n.style.color = l.hot ? p.hotColor : p.color;
      wrap.appendChild(n);
      return n;
    });
    ctx.root.appendChild(wrap);
    ctx.wrap = wrap;
  },
  seek(t, ctx) {
    const p = ctx.props, u = SG.util;
    const out = p.hold == null ? 1 : 1 - u.prog(t, p.delay + p.hold, 0.35, "inCubic");
    ctx.wrap.style.opacity = out.toFixed(4);
    ctx.nodes.forEach((n, i) => {
      const a = u.prog(t, p.delay + i * p.stagger, p.pop, "outBack");
      const c = u.clamp(a);
      n.style.opacity = c.toFixed(4);
      n.style.transform =
        `translateY(${((1 - c) * 34).toFixed(2)}px) ` +
        `rotate(${(p.tilt * c).toFixed(2)}deg) ` +
        `scale(${u.lerp(0.6, 1, c).toFixed(4)})`;
    });
  },
});
