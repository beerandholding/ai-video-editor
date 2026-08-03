/* Big stacked headline with one emphasised line. The reference's opening hook. */
SG.util.css(`
  .th { position:absolute; inset:0; display:flex; flex-direction:column; padding:64px 72px; }
  .th-line { font-weight:800; line-height:.98; letter-spacing:-.02em;
             text-transform:uppercase; will-change:transform,opacity;
             text-shadow:0 2px 24px rgba(0,0,0,.35); }
  .th-em { font-weight:900; letter-spacing:-.035em; }
`);

SG.register("title-hook", {
  defaults: {
    lines: ["LINHA UM", "DESTAQUE", "LINHA TRES"],
    emphasis: 1,          // index of the big line, or -1 for none
    align: "bottom",      // top | center | bottom
    justify: "center",    // left | center | right
    bg: "transparent",
    color: null,
    emColor: null,
    size: 78,             // px for normal lines
    emSize: 132,          // px for the emphasised line
    delay: 0.15,
    stagger: 0.11,
    dur: 0.5,
    hold: null,           // seconds before fading out; null = stay
  },
  mount(ctx) {
    const p = ctx.props, u = SG.util;
    const wrap = u.el("div", "th");
    wrap.style.background = p.bg;
    wrap.style.justifyContent =
      p.align === "top" ? "flex-start" : p.align === "center" ? "center" : "flex-end";
    wrap.style.alignItems =
      p.justify === "left" ? "flex-start" : p.justify === "right" ? "flex-end" : "center";
    wrap.style.textAlign = p.justify;
    ctx.nodes = p.lines.map((txt, i) => {
      const n = u.el("div", "th-line" + (i === p.emphasis ? " th-em" : ""), txt);
      n.style.fontSize = (i === p.emphasis ? p.emSize : p.size) + "px";
      n.style.color = (i === p.emphasis ? p.emColor : p.color) || ctx.theme.fg || "#fff";
      wrap.appendChild(n);
      return n;
    });
    ctx.root.appendChild(wrap);
    ctx.wrap = wrap;
  },
  seek(t, ctx) {
    const p = ctx.props, u = SG.util;
    const out = p.hold == null ? 1 : 1 - u.prog(t, p.delay + p.hold, 0.4, "inCubic");
    ctx.nodes.forEach((n, i) => {
      const a = u.prog(t, p.delay + i * p.stagger, p.dur, "outQuint");
      n.style.opacity = (a * out).toFixed(4);
      n.style.transform =
        `translateY(${((1 - a) * 46).toFixed(2)}px) scale(${(0.965 + a * 0.035).toFixed(4)})`;
    });
  },
});
