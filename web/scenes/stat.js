/* Big count-up number with a label. */
SG.util.css(`
  .st { position:absolute; inset:0; display:flex; flex-direction:column;
        align-items:center; justify-content:center; gap:10px; padding:72px; }
  .st-val { font-weight:900; letter-spacing:-.045em; line-height:.9;
            font-variant-numeric:tabular-nums; }
  .st-lab { font-size:36px; font-weight:600; opacity:.7; text-align:center; }
  .st-cap { font-size:26px; opacity:.45; text-align:center; max-width:820px; line-height:1.35; }
`);

SG.register("stat", {
  defaults: {
    from: 0, value: 87, decimals: 0,
    prefix: "", suffix: "",
    label: "anos sem solução",
    caption: null,
    size: 230,
    color: null,
    delay: 0.15, dur: 1.3,
  },
  mount(ctx) {
    const p = ctx.props, u = SG.util;
    const wrap = u.el("div", "st");
    ctx.val = u.el("div", "st-val");
    ctx.val.style.fontSize = p.size + "px";
    ctx.val.style.color = p.color || ctx.theme.fg || "#fff";
    wrap.appendChild(ctx.val);
    if (p.label) { ctx.lab = u.el("div", "st-lab", p.label); wrap.appendChild(ctx.lab); }
    if (p.caption) { ctx.cap = u.el("div", "st-cap", p.caption); wrap.appendChild(ctx.cap); }
    ctx.root.appendChild(wrap);
  },
  seek(t, ctx) {
    const p = ctx.props, u = SG.util;
    const a = u.prog(t, p.delay, p.dur, "outExpo");
    const n = u.lerp(p.from, p.value, a);
    ctx.val.textContent = p.prefix + n.toFixed(p.decimals) + p.suffix;
    ctx.val.style.opacity = u.prog(t, p.delay, 0.3, "outCubic").toFixed(4);
    ctx.val.style.transform = `scale(${(0.94 + a * 0.06).toFixed(4)})`;
    if (ctx.lab) {
      const b = u.prog(t, p.delay + 0.35, 0.5, "outCubic");
      ctx.lab.style.opacity = b.toFixed(4);
      ctx.lab.style.transform = `translateY(${((1 - b) * 14).toFixed(2)}px)`;
    }
    if (ctx.cap) ctx.cap.style.opacity = u.prog(t, p.delay + 0.6, 0.5, "outCubic").toFixed(4);
  },
});
