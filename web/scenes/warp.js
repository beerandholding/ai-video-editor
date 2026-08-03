/* A malha como tecido: estica e gira (legal) ou dobra por cima de si mesma (ilegal).
   No modo `fold` a deformação é u = lerp(x, (x³-3x)/2, k), que deixa de ser injetora
   quando k > 0.4 — x=2 e x=-1 caem os dois em u=1. É o contraexemplo desenhado. */
SG.util.css(`
  .wp-label { position:absolute; left:0; right:0; text-align:center;
              font-weight:600; white-space:pre-line; will-change:opacity,transform; }
`);

SG.register("warp", {
  defaults: {
    bg: null,
    mode: "fold",            // "stretch" = deformação legal · "fold" = dobra
    nx: 15, ny: 11,          // linhas da malha
    range: 2.2,              // domínio x ∈ [-range, range]
    ratio: 0.74,             // altura do domínio, relativa a range
    scale: 168,              // px por unidade
    cx: 0.5, cy: 0.42,       // centro da malha na tela (frações)
    delay: 0.3, dur: 2.6, ease: "inOutCubic",
    amount: 1.0,             // k final da deformação
    drawDelay: null,         // quando a malha aparece; default = delay - 0.45
    reverseDelay: null,      // desfaz a deformação a partir daqui ("dá pra voltar")
    reverseDur: 1.8,
    lw: 2,
    grid: null,              // cor das linhas (default: accent2 do tema)
    crease: "#e11d48",       // cor da parte que dobrou
    dots: null,              // [[x,y], ...] no domínio; em fold, colidem em k=1
    dotColors: ["#e11d48", "#3ddc97", "#8b9cff"],
    dotR: 15,
    dotDelay: null,          // default = delay
    flash: false,            // anel de impacto quando a dobra fecha
    label: null, labelDelay: 0, labelSize: 36, labelTop: 800, labelColor: null,
  },

  mount(ctx) {
    const p = ctx.props, u = SG.util;
    // bg "none" deixa a camada de baixo (pulse) aparecer — senão a malha
    // parada vira um frame estático, que é exatamente o que mata o ritmo
    if (p.bg !== "none") ctx.root.style.background = p.bg || ctx.theme.bg || "#000";
    ctx.cv = u.canvas(ctx);
    ctx.g = ctx.cv.getContext("2d");
    if (p.label) {
      ctx.lab = u.el("div", "wp-label", p.label);
      ctx.lab.style.fontSize = p.labelSize + "px";
      ctx.lab.style.top = p.labelTop + "px";
      ctx.lab.style.color = p.labelColor || ctx.theme.fg || "#fff";
      ctx.root.appendChild(ctx.lab);
    }
  },

  seek(t, ctx) {
    const p = ctx.props, u = SG.util, g = ctx.g;
    const W = ctx.cv.width, H = ctx.cv.height;
    g.clearRect(0, 0, W, H);
    if (p.bg !== "none") {
      g.fillStyle = p.bg || ctx.theme.bg || "#000";
      g.fillRect(0, 0, W, H);
    }

    const back = p.reverseDelay == null ? 0 : u.prog(t, p.reverseDelay, p.reverseDur, p.ease);
    const k = p.amount * (u.prog(t, p.delay, p.dur, p.ease) - back);
    const R = p.range, RY = p.range * p.ratio;
    const ox = W * p.cx, oy = H * p.cy, S = p.scale;

    // domínio -> imagem. k = 0 é sempre a identidade, senão a malha "aparece" torta.
    const map = (x, y) => {
      if (p.mode === "stretch") {
        const a = 1 + 0.42 * k, sh = 0.30 * k, r = 0.26 * k;
        const ux = a * x + sh * y, vy = y * (1 - 0.16 * k);
        return [ux * Math.cos(r) - vy * Math.sin(r), ux * Math.sin(r) + vy * Math.cos(r)];
      }
      const folded = (x * x * x - 3 * x) / 2;
      return [u.lerp(x, folded, k), y + 0.22 * k * x];
    };
    const px = (x, y) => { const [a, b] = map(x, y); return [ox + a * S, oy - b * S]; };

    // derivada de u em x: negativa = esse pedaço já virou do avesso
    const flipped = x => p.mode === "fold" && (1 - k) + k * (3 * x * x - 3) / 2 < 0;

    const base = p.grid || ctx.theme.accent2 || "#8b9cff";
    const draw = u.prog(t, p.drawDelay == null ? Math.max(0, p.delay - 0.45) : p.drawDelay,
                        0.55, "outCubic");
    if (draw <= 0) return;

    g.lineWidth = p.lw;
    g.lineJoin = "round";

    const seg = 26;   // amostras por linha — precisa ser fino, a dobra é curva
    const strokeLine = (pts, hot) => {
      g.strokeStyle = hot ? p.crease : base;
      g.globalAlpha = (hot ? 0.95 : 0.5) * draw;
      g.beginPath();
      pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b)));
      g.stroke();
    };

    for (let i = 0; i < p.nx; i++) {                       // linhas de x constante
      const x = -R + (2 * R * i) / (p.nx - 1);
      const pts = [];
      for (let s = 0; s <= seg; s++) pts.push(px(x, -RY + (2 * RY * s) / seg));
      strokeLine(pts, flipped(x));
    }
    for (let j = 0; j < p.ny; j++) {                       // linhas de y constante
      const y = -RY + (2 * RY * j) / (p.ny - 1);
      const pts = [];
      for (let s = 0; s <= seg; s++) pts.push(px(-R + (2 * R * s) / seg, y));
      // a horizontal atravessa a dobra inteira: parte dela vira, então vai neutra
      strokeLine(pts, false);
    }
    g.globalAlpha = 1;

    const dots = p.dots || (p.mode === "fold" ? [[2, -0.33], [-1, 0.33]] : null);
    if (dots && dots.length) {
      const dd = p.dotDelay == null ? p.delay : p.dotDelay;
      dots.forEach(([x, y], i) => {
        const pop = u.clamp(u.prog(t, dd - 0.3, 0.4, "outBack"));
        const [a, b] = px(x, y);
        g.fillStyle = p.dotColors[i % p.dotColors.length];
        g.beginPath();
        // encolhe ao convergir, senão o último desenhado esconde os outros
        g.arc(a, b, p.dotR * pop * u.lerp(1, 1 - i * 0.36, k), 0, Math.PI * 2);
        g.fill();
      });

      if (p.flash) {
        const f = u.prog(t, p.delay + p.dur, 0.75, "outCubic");
        if (f > 0 && f < 1) {
          const [a, b] = px(dots[0][0], dots[0][1]);
          g.strokeStyle = ctx.theme.fg || "#fff";
          g.globalAlpha = (1 - f) * 0.8;
          g.lineWidth = 4 * (1 - f) + 1;
          g.beginPath();
          g.arc(a, b, p.dotR + f * 130, 0, Math.PI * 2);
          g.stroke();
          g.globalAlpha = 1;
        }
      }
    }

    if (ctx.lab) {
      const a = u.prog(t, p.labelDelay, 0.5, "outCubic");
      ctx.lab.style.opacity = a.toFixed(4);
      ctx.lab.style.transform = `translateY(${((1 - a) * 16).toFixed(2)}px)`;
    }
  },
});
