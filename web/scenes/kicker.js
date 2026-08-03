/* Small letterspaced header line, optionally with a rule and a subtitle. */
SG.util.css(`
  .kk { position:absolute; left:72px; right:72px; display:flex; flex-direction:column; gap:18px; }
  .kk-rule { height:1px; background:currentColor; opacity:.18; transform-origin:left center; }
  .kk-sub { font-size:34px; font-weight:500; line-height:1.3; opacity:.8; }
`);

SG.register("kicker", {
  defaults: {
    text: "the jacobian conjecture · 1939 → 2026",
    sub: null,
    top: 64,
    color: null,
    rule: false,
    mono: false,
    delay: 0.1,
    dur: 0.6,
  },
  mount(ctx) {
    const p = ctx.props, u = SG.util;
    const wrap = u.el("div", "kk");
    wrap.style.top = p.top + "px";
    wrap.style.color = p.color || ctx.theme.fg || "#fff";
    ctx.line = u.el("div", "sg-kicker" + (p.mono ? " sg-mono" : ""), p.text);
    wrap.appendChild(ctx.line);
    if (p.rule) { ctx.rule = u.el("div", "kk-rule"); wrap.appendChild(ctx.rule); }
    if (p.sub) { ctx.sub = u.el("div", "kk-sub", p.sub); wrap.appendChild(ctx.sub); }
    ctx.root.appendChild(wrap);
  },
  seek(t, ctx) {
    const p = ctx.props, u = SG.util;
    const a = u.prog(t, p.delay, p.dur, "outCubic");
    ctx.line.style.opacity = a.toFixed(4);
    ctx.line.style.transform = `translateY(${((1 - a) * 12).toFixed(2)}px)`;
    if (ctx.rule) ctx.rule.style.transform = `scaleX(${u.prog(t, p.delay + 0.1, 0.7, "outQuint").toFixed(4)})`;
    if (ctx.sub) {
      const b = u.prog(t, p.delay + 0.22, p.dur, "outCubic");
      ctx.sub.style.opacity = b.toFixed(4);
      ctx.sub.style.transform = `translateY(${((1 - b) * 14).toFixed(2)}px)`;
    }
  },
});
