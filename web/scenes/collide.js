/* N pontos saem de lugares distintos, viajam por curvas separadas e caem
   exatamente no mesmo destino. O frame que vende o contraexemplo. */
SG.util.css(`
  .cl-target { position:absolute; font-family: var(--mono), "JetBrains Mono", monospace;
               white-space:nowrap; will-change:opacity,transform; }
`);

SG.register("collide", {
  defaults: {
    bg: null,
    dotColors: ["#e11d48", "#8b9cff", "#3ddc97"],
    starts: [[0.14, 0.22], [0.5, 0.14], [0.86, 0.3]],  // frações do canvas
    target: [0.5, 0.72],
    bow: [-0.22, 0.0, 0.22],   // curvatura lateral de cada trajetória
    dotR: 15,
    trail: true,
    trailWidth: 3,
    delay: 0.4,
    dur: 2.4,
    stagger: 0.18,             // atraso entre as partidas
    label: "(-1/4, 0, 0)",     // rótulo do destino
    labelSize: 40,
    labelColor: null,
    flash: true,               // anel de impacto quando os pontos se encontram
  },
  mount(ctx) {
    const p = ctx.props, u = SG.util;
    ctx.root.style.background = p.bg || ctx.theme.bg || "#000";
    ctx.cv = u.canvas(ctx);
    ctx.g = ctx.cv.getContext("2d");
    if (p.label) {
      ctx.lab = u.el("div", "cl-target", p.label);
      ctx.lab.style.fontSize = p.labelSize + "px";
      ctx.lab.style.color = p.labelColor || ctx.theme.fg || "#fff";
      ctx.root.appendChild(ctx.lab);
    }
  },
  seek(t, ctx) {
    const p = ctx.props, u = SG.util, g = ctx.g;
    const W = ctx.cv.width, H = ctx.cv.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = p.bg || ctx.theme.bg || "#000";
    g.fillRect(0, 0, W, H);

    const tx = p.target[0] * W, ty = p.target[1] * H;

    // curva quadrática start -> target, com o controle deslocado na normal
    const path = (i) => {
      const sx = p.starts[i][0] * W, sy = p.starts[i][1] * H;
      const mx = (sx + tx) / 2, my = (sy + ty) / 2;
      const dx = tx - sx, dy = ty - sy;
      const len = Math.hypot(dx, dy) || 1;
      const bow = (p.bow[i] ?? 0) * len;
      return { sx, sy, cx: mx - (dy / len) * bow, cy: my + (dx / len) * bow };
    };
    const at = (q, k) => {
      const m = 1 - k;
      return [m * m * q.sx + 2 * m * k * q.cx + k * k * tx,
              m * m * q.sy + 2 * m * k * q.cy + k * k * ty];
    };

    for (let i = 0; i < p.starts.length; i++) {
      const q = path(i);
      const k = u.prog(t, p.delay + i * p.stagger, p.dur, "inOutCubic");
      const col = p.dotColors[i % p.dotColors.length];

      if (p.trail && k > 0) {
        g.strokeStyle = col;
        g.globalAlpha = 0.34;
        g.lineWidth = p.trailWidth;
        g.beginPath();
        const steps = 48;
        for (let s = 0; s <= steps; s++) {
          const kk = (s / steps) * k;
          const [x, y] = at(q, kk);
          s === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
        }
        g.stroke();
        g.globalAlpha = 1;
      }

      const [x, y] = at(q, k);
      const pop = u.prog(t, p.delay + i * p.stagger - 0.25, 0.35, "outBack");
      // ao convergir, os pontos aninham em anéis concêntricos — senão o último
      // desenhado cobre os outros e some a leitura de "são três"
      const nest = u.lerp(1, 1 - i * (1 / p.starts.length) * 0.82, k);
      g.fillStyle = col;
      g.beginPath();
      g.arc(x, y, p.dotR * u.clamp(pop) * nest, 0, Math.PI * 2);
      g.fill();
    }

    // impacto: anel expandindo no instante em que o último ponto chega
    const arriveAt = p.delay + (p.starts.length - 1) * p.stagger + p.dur;
    if (p.flash) {
      const f = u.prog(t, arriveAt, 0.8, "outCubic");
      if (f > 0 && f < 1) {
        g.strokeStyle = ctx.theme.fg || "#fff";
        g.globalAlpha = (1 - f) * 0.75;
        g.lineWidth = 4 * (1 - f) + 1;
        g.beginPath();
        g.arc(tx, ty, p.dotR + f * 120, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      }
    }

    if (ctx.lab) {
      const a = u.prog(t, arriveAt + 0.15, 0.5, "outCubic");
      ctx.lab.style.left = (tx + p.dotR * 2.6) + "px";
      ctx.lab.style.top = (ty - p.labelSize * 0.62) + "px";
      ctx.lab.style.opacity = a.toFixed(4);
      ctx.lab.style.transform = `translateX(${((1 - a) * 18).toFixed(2)}px)`;
    }
  },
});
