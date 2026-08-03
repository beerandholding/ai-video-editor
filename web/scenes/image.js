/* Static image / screenshot from projects/<slug>/assets, with a slow ken-burns. */
SG.util.css(`
  .im { position:absolute; inset:0; overflow:hidden; }
  .im img { position:absolute; inset:0; width:100%; height:100%; will-change:transform,opacity; }
`);

SG.register("image", {
  defaults: {
    src: "",              // relative to projects/<slug>/assets/
    fit: "cover",         // cover | contain
    bg: null,
    zoom: [1.0, 1.08],    // start -> end scale
    pan: [0, 0],          // end translate in px
    delay: 0.0,
    fade: 0.4,
    radius: 0,
    inset: 0,             // px padding around the image
  },
  mount(ctx) {
    const p = ctx.props, u = SG.util;
    ctx.root.style.background = p.bg || ctx.theme.bg || "#000";
    const wrap = u.el("div", "im");
    wrap.style.inset = p.inset + "px";
    wrap.style.borderRadius = p.radius + "px";
    ctx.img = new Image();
    ctx.img.src = `/assets/${ctx.slug}/${p.src}`;
    ctx.img.style.objectFit = p.fit;
    wrap.appendChild(ctx.img);
    ctx.root.appendChild(wrap);
  },
  seek(t, ctx) {
    const p = ctx.props, u = SG.util;
    const a = u.prog(t, p.delay, p.fade, "outCubic");
    const k = u.clamp(t / Math.max(0.001, ctx.duration));
    const z = u.lerp(p.zoom[0], p.zoom[1], k);
    ctx.img.style.opacity = a.toFixed(4);
    ctx.img.style.transform =
      `scale(${z.toFixed(4)}) translate(${(p.pan[0] * k).toFixed(1)}px, ${(p.pan[1] * k).toFixed(1)}px)`;
  },
});
