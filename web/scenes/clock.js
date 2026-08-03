/* Relógio: o ponteiro varre várias voltas e para numa hora — duas leituras
   possíveis pro mesmo ponteiro. Imagem de "reversível em cada pedaço,
   irreversível no todo". */
SG.util.css(`
  .ck-lab { position:absolute; font-weight:700; white-space:nowrap;
            will-change:opacity,transform; }
`);

SG.register("clock", {
  defaults: {
    bg: null,
    face: null,             // cor do mostrador; null = --fg
    hand: null,             // cor do ponteiro; null = --accent
    r: 0.29,                // raio como fração da altura
    cx: 0.5, cy: 0.46,
    hour: 3,                // hora onde o ponteiro para
    turns: 2,               // voltas antes de parar
    sweepDelay: 0.2,
    sweepDur: 2.2,
    ticks: true,
    labels: ["3h?", "15h?"], // aparecem depois que o ponteiro para
    labelSize: 54,
    labelDelay: 0.45,       // após o fim da varredura
    labelGap: 0.5,          // entre um rótulo e o outro
  },
  mount(ctx) {
    const p = ctx.props, u = SG.util;
    ctx.root.style.background = p.bg || ctx.theme.bg || "#000";
    ctx.cv = u.canvas(ctx);
    ctx.g = ctx.cv.getContext("2d");
    ctx.labs = (p.labels || []).map((txt, i) => {
      const n = u.el("div", "ck-lab", txt);
      n.style.fontSize = p.labelSize + "px";
      n.style.color = i === 0 ? (p.hand || ctx.theme.accent || "#e11d48")
                              : (p.face || ctx.theme.fg || "#fff");
      ctx.root.appendChild(n);
      return n;
    });
  },
  seek(t, ctx) {
    const p = ctx.props, u = SG.util, g = ctx.g;
    const W = ctx.cv.width, H = ctx.cv.height;
    const face = p.face || ctx.theme.fg || "#fff";
    const hand = p.hand || ctx.theme.accent || "#e11d48";
    const cx = W * p.cx, cy = H * p.cy, R = H * p.r;

    g.clearRect(0, 0, W, H);
    g.fillStyle = p.bg || ctx.theme.bg || "#000";
    g.fillRect(0, 0, W, H);

    const draw = u.prog(t, 0, 0.5, "outCubic");
    g.strokeStyle = face;
    g.globalAlpha = 0.55 * draw;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * draw);
    g.stroke();

    if (p.ticks) {
      g.globalAlpha = draw;
      for (let i = 0; i < 12; i++) {
        const a = -Math.PI / 2 + (i / 12) * Math.PI * 2;
        const big = i % 3 === 0;
        const r0 = R * (big ? 0.86 : 0.92);
        g.lineWidth = big ? 5 : 2.5;
        g.globalAlpha = draw * (big ? 0.85 : 0.4);
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        g.lineTo(cx + Math.cos(a) * R * 0.98, cy + Math.sin(a) * R * 0.98);
        g.stroke();
      }
    }
    g.globalAlpha = 1;

    // ponteiro: varre `turns` voltas e assenta na hora escolhida
    const sw = u.prog(t, p.sweepDelay, p.sweepDur, "outQuint");
    const angle = -Math.PI / 2 + Math.PI * 2 * (p.turns * sw + (p.hour / 12) * sw);
    g.strokeStyle = hand;
    g.lineWidth = 9;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(angle) * R * 0.74, cy + Math.sin(angle) * R * 0.74);
    g.stroke();
    g.fillStyle = hand;
    g.beginPath(); g.arc(cx, cy, 11, 0, Math.PI * 2); g.fill();
    g.lineCap = "butt";

    const base = p.sweepDelay + p.sweepDur + p.labelDelay;
    ctx.labs.forEach((n, i) => {
      const a = u.prog(t, base + i * p.labelGap, 0.45, "outBack");
      n.style.left = (cx + R * 1.16) + "px";
      n.style.top = (cy - 42 + i * (p.labelSize * 1.5)) + "px";
      n.style.opacity = u.clamp(a).toFixed(4);
      n.style.transform = `translateX(${((1 - u.clamp(a)) * 26).toFixed(2)}px)`;
    });
  },
});
