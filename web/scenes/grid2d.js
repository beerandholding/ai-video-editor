/* Light-paper plane: cartesian grid, axes, a travelling marker and an annotation. */
SG.util.css(`
  .g2-annot { position:absolute; font-family: var(--mono), "JetBrains Mono", monospace;
              font-size:34px; white-space:nowrap; will-change:opacity,transform; }
`);

SG.register("grid2d", {
  defaults: {
    bg: "#f6f4ee",
    line: "rgba(20,20,30,.13)",
    axis: "rgba(20,20,30,.42)",
    cell: 118,             // px between grid lines
    axes: true,
    labels: true,          // draw x / y letters at the axis ends
    marker: { x: 0.42, y: 0.5, r: 34, color: "#b91c1c" },
    moveTo: null,          // {x, y} — marker travels here over `moveDur`
    moveDur: 1.4,
    moveDelay: 0.6,
    lens: false,           // draw a magnifier handle on the marker
    annot: null,           // text placed to the right of the marker
    annotColor: "#111",
    delay: 0.1,
    drawDur: 0.9,
  },
  mount(ctx) {
    const p = ctx.props, u = SG.util;
    ctx.root.style.background = p.bg;
    ctx.cv = u.canvas(ctx);
    ctx.g = ctx.cv.getContext("2d");
    if (p.annot) {
      ctx.annot = u.el("div", "g2-annot", p.annot);
      ctx.annot.style.color = p.annotColor;
      ctx.root.appendChild(ctx.annot);
    }
  },
  seek(t, ctx) {
    const p = ctx.props, u = SG.util, g = ctx.g;
    const W = ctx.cv.width, H = ctx.cv.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = p.bg; g.fillRect(0, 0, W, H);

    const draw = u.prog(t, p.delay, p.drawDur, "outCubic");
    const ox = W / 2, oy = H / 2;

    g.strokeStyle = p.line; g.lineWidth = 1;
    g.beginPath();
    const nx = Math.ceil(W / 2 / p.cell), ny = Math.ceil(H / 2 / p.cell);
    for (let i = -nx; i <= nx; i++) {
      const x = ox + i * p.cell, ext = H * draw;
      g.moveTo(x, oy - ext / 2); g.lineTo(x, oy + ext / 2);
    }
    for (let j = -ny; j <= ny; j++) {
      const y = oy + j * p.cell, ext = W * draw;
      g.moveTo(ox - ext / 2, y); g.lineTo(ox + ext / 2, y);
    }
    g.stroke();

    if (p.axes) {
      g.strokeStyle = p.axis; g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(ox - W * draw / 2, oy); g.lineTo(ox + W * draw / 2, oy);
      g.moveTo(ox, oy - H * draw / 2); g.lineTo(ox, oy + H * draw / 2);
      g.stroke();
      if (p.labels) {
        g.fillStyle = p.axis;
        g.font = "300 30px " + (ctx.theme.mono || "JetBrains Mono") + ", monospace";
        g.globalAlpha = draw;
        g.fillText("x", W - 44, oy - 14);
        g.fillText("y", ox + 14, 42);
        g.globalAlpha = 1;
      }
    }

    const m = p.marker;
    if (m) {
      const mp = p.moveTo ? u.prog(t, p.moveDelay, p.moveDur, "inOutCubic") : 0;
      const mx = u.lerp(m.x, p.moveTo ? p.moveTo.x : m.x, mp) * W;
      const my = u.lerp(m.y, p.moveTo ? p.moveTo.y : m.y, mp) * H;
      const pop = u.prog(t, p.delay + 0.35, 0.5, "outBack");
      g.strokeStyle = m.color || "#b91c1c";
      g.lineWidth = 2.6;
      g.globalAlpha = u.clamp(pop);
      g.beginPath();
      g.arc(mx, my, (m.r || 34) * u.clamp(pop), 0, Math.PI * 2);
      g.stroke();
      if (p.lens) {
        const r = (m.r || 34) * u.clamp(pop);
        g.beginPath();
        g.moveTo(mx + r * 0.72, my + r * 0.72);
        g.lineTo(mx + r * 1.5, my + r * 1.5);
        g.stroke();
        g.fillStyle = "#111";
        g.beginPath(); g.arc(mx, my, 3.5, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
      if (ctx.annot) {
        const a = u.prog(t, p.delay + 0.7, 0.5, "outCubic");
        ctx.annot.style.left = (mx + (m.r || 34) * 1.9) + "px";
        ctx.annot.style.top = (my - 24) + "px";
        ctx.annot.style.opacity = a.toFixed(4);
        ctx.annot.style.transform = `translateX(${((1 - a) * 14).toFixed(2)}px)`;
      }
    }
  },
});
