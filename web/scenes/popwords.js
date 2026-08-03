/* Tipografia cinética: cada palavra entra no instante em que ele fala.
   É o motor de energia do reel — em vez de uma frase que aparece inteira, você
   tem um evento por palavra. Os tempos vêm do transcript, então isso só funciona
   se estiverem ancorados na palavra certa. */
SG.util.css(`
  .pw { position:absolute; left:60px; right:60px; display:flex; flex-wrap:wrap;
        gap:0 var(--pw-gap); align-content:center; justify-content:center; }
  .pw-w { font-weight:800; letter-spacing:-.02em; line-height:1;
          will-change:transform,opacity,color; white-space:nowrap;
          transform-origin:center bottom; }
  .pw-br { flex-basis:100%; height:0; }
`);

SG.register("popwords", {
  defaults: {
    // [{t, w, hot, br}] — t em segundos DESDE O INÍCIO DO SEGMENTO.
    // hot: usa a cor de destaque · br: quebra linha depois desta palavra
    words: [],
    size: 62,
    hotSize: null,          // default = size * 1.16
    color: null,
    hot: null,              // default = theme.accent
    align: "center",        // top | center | bottom  (ignorado se `top` vier)
    top: null,
    gap: 20,
    lineGap: 14,
    pop: 0.26,              // duração da entrada de cada palavra
    scaleFrom: 0.68,
    rise: 30,
    live: 0.34,             // por quanto tempo a palavra recém-entrada fica maior
    liveScale: 1.14,
    clearAt: null,          // tudo some a partir daqui
    clearDur: 0.4,
  },

  mount(ctx) {
    const p = ctx.props, u = SG.util;
    const wrap = u.el("div", "pw");
    wrap.style.setProperty("--pw-gap", p.gap + "px");
    wrap.style.rowGap = p.lineGap + "px";
    if (p.top != null) { wrap.style.top = p.top + "px"; }
    else if (p.align === "top") { wrap.style.top = "80px"; }
    else if (p.align === "bottom") { wrap.style.bottom = "90px"; }
    else { wrap.style.top = "0"; wrap.style.bottom = "0"; }

    const hotCol = p.hot || ctx.theme.accent || "#e11d48";
    const base = p.color || ctx.theme.fg || "#fff";
    ctx.nodes = [];
    p.words.forEach(w => {
      const n = u.el("div", "pw-w", w.w);
      n.style.fontSize = (w.hot ? (p.hotSize || p.size * 1.16) : p.size) + "px";
      n.style.color = w.hot ? hotCol : base;
      wrap.appendChild(n);
      ctx.nodes.push(n);
      if (w.br) wrap.appendChild(u.el("div", "pw-br"));
    });
    ctx.root.appendChild(wrap);
    ctx.wrap = wrap;
  },

  seek(t, ctx) {
    const p = ctx.props, u = SG.util;
    const gone = p.clearAt == null ? 0 : u.prog(t, p.clearAt, p.clearDur, "inCubic");
    ctx.wrap.style.opacity = (1 - gone).toFixed(4);

    p.words.forEach((w, i) => {
      const n = ctx.nodes[i];
      const a = u.prog(t, w.t, p.pop, "outBack");
      if (a <= 0) { n.style.opacity = "0"; n.style.transform = "scale(0)"; return; }
      // depois de entrar, a palavra "respira" e volta ao tamanho normal
      const hit = p.live ? 1 - u.prog(t, w.t + p.pop, p.live, "outCubic") : 0;
      const s = u.lerp(p.scaleFrom, 1, u.clamp(a)) * u.lerp(1, p.liveScale, hit);
      const y = (1 - u.clamp(a)) * p.rise;
      n.style.opacity = u.clamp(a * 1.6).toFixed(4);
      n.style.transform = `translateY(${y.toFixed(2)}px) scale(${s.toFixed(4)})`;
    });
  },
});
