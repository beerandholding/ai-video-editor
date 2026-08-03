/* Camada de fundo que nunca para. Existe pra que nenhum instante do vídeo seja
   uma imagem estática — vai embaixo de tudo. Barato de propósito: o render faz
   ~2100 frames em 6 abas. */
SG.register("pulse", {
  defaults: {
    bg: null,
    dots: 80,
    speed: 34,             // px/s que as partículas sobem
    size: 2.6,
    spread: 1.0,           // 1 = tela toda
    color: null,           // default: accent2 do tema
    alpha: 0.5,
    rings: 3,              // anéis expandindo do centro
    ringSpeed: 0.2,        // ciclos por segundo
    ringColor: null,
    cx: 0.5, cy: 0.44,
    beats: [],             // instantes que dão um flash geral
    beatDur: 0.45,
    beatAlpha: 0.1,
    seed: 7,
  },

  mount(ctx) {
    const p = ctx.props, u = SG.util;
    if (p.bg) ctx.root.style.background = p.bg;
    ctx.cv = u.canvas(ctx);
    ctx.g = ctx.cv.getContext("2d");
    // posições base sorteadas uma vez — o movimento é função pura de t em cima delas
    ctx.pts = Array.from({ length: p.dots }, (_, i) => ({
      x: u.rnd(p.seed + i * 3.1),
      y: u.rnd(p.seed + i * 7.7),
      f: 0.45 + u.rnd(p.seed + i * 11.3) * 1.1,   // velocidade relativa
      r: 0.5 + u.rnd(p.seed + i * 5.9),
    }));
  },

  seek(t, ctx) {
    const p = ctx.props, u = SG.util, g = ctx.g;
    const W = ctx.cv.width, H = ctx.cv.height;
    g.clearRect(0, 0, W, H);
    if (p.bg) { g.fillStyle = p.bg; g.fillRect(0, 0, W, H); }

    const col = p.color || ctx.theme.accent2 || "#8b9cff";
    const cx = W * p.cx, cy = H * p.cy;

    if (p.rings > 0) {
      g.strokeStyle = p.ringColor || col;
      g.lineWidth = 1.4;
      for (let i = 0; i < p.rings; i++) {
        const k = ((t * p.ringSpeed + i / p.rings) % 1 + 1) % 1;
        g.globalAlpha = Math.sin(k * Math.PI) * 0.16 * p.alpha * 2;
        g.beginPath();
        g.arc(cx, cy, 60 + k * 620, 0, Math.PI * 2);
        g.stroke();
      }
    }

    g.fillStyle = col;
    for (const q of ctx.pts) {
      const y = (((q.y - (t * p.speed * q.f) / H) % 1) + 1) % 1;
      const x = 0.5 + (q.x - 0.5) * p.spread;
      g.globalAlpha = p.alpha * (0.25 + 0.75 * Math.sin(y * Math.PI));
      g.beginPath();
      g.arc(x * W, y * H, p.size * q.r, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    for (const b of p.beats) {
      const k = u.prog(t, b, p.beatDur, "outCubic");
      if (k > 0 && k < 1) {
        g.fillStyle = ctx.theme.fg || "#fff";
        g.globalAlpha = (1 - k) * p.beatAlpha;
        g.fillRect(0, 0, W, H);
        g.globalAlpha = 1;
      }
    }
  },
});
