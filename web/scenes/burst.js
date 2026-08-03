/* Explosão radial em instantes específicos. Pontuação visual: vai numa palavra
   que precisa de impacto ("derrubou", "contraexemplo", "legado?"). Sem isso as
   frases entram e saem no mesmo peso e o vídeo achata. */
SG.register("burst", {
  defaults: {
    at: [],              // instantes (locais ao segmento)
    dur: 0.5,
    spokes: 16,
    r0: 50, r1: 330,
    len: 0.28,           // comprimento do risco, fração do raio
    lw: 5,
    ring: true,
    ringLw: 3,
    color: null,
    cx: 0.5, cy: 0.44,
    rot: 0.14,           // giro por explosão, pra não ficarem idênticas
    alpha: 0.85,
  },

  mount(ctx) {
    const u = SG.util;
    ctx.cv = u.canvas(ctx);
    ctx.g = ctx.cv.getContext("2d");
  },

  seek(t, ctx) {
    const p = ctx.props, u = SG.util, g = ctx.g;
    const W = ctx.cv.width, H = ctx.cv.height;
    g.clearRect(0, 0, W, H);
    const cx = W * p.cx, cy = H * p.cy;
    const col = p.color || ctx.theme.accent || "#e11d48";

    p.at.forEach((a, idx) => {
      const k = u.prog(t, a, p.dur, "outQuint");
      if (k <= 0 || k >= 1) return;
      const fade = (1 - k) * p.alpha;
      const r = u.lerp(p.r0, p.r1, k);

      g.strokeStyle = col;
      g.globalAlpha = fade;
      g.lineWidth = p.lw * (1 - k) + 1;
      g.lineCap = "round";
      g.beginPath();
      for (let i = 0; i < p.spokes; i++) {
        const ang = (i / p.spokes) * Math.PI * 2 + idx * p.rot;
        const c = Math.cos(ang), s = Math.sin(ang);
        g.moveTo(cx + c * r, cy + s * r);
        g.lineTo(cx + c * r * (1 + p.len), cy + s * r * (1 + p.len));
      }
      g.stroke();

      if (p.ring) {
        g.lineWidth = p.ringLw * (1 - k) + 0.6;
        g.globalAlpha = fade * 0.7;
        g.beginPath();
        g.arc(cx, cy, r * 0.92, 0, Math.PI * 2);
        g.stroke();
      }
      g.globalAlpha = 1;
    });
  },
});
