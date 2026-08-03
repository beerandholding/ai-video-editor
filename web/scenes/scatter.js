/* Nuvem de pontos agrupada em clusters, uma consulta entra voando e os k
   vizinhos mais próximos acendem, com o raio de busca abrindo até alcançá-los.
   Serve pra embeddings/busca vetorial, clustering, "achar o mais parecido".

   Os vizinhos NÃO são escolhidos na mão: as posições saem de u.rnd(seed) e a
   distância é calculada de verdade no mount. Trocar o seed muda a nuvem e os
   vizinhos acompanham — continua sendo função pura do tempo. */
SG.util.css(`
  .sc-lab { position:absolute; font-weight:600; white-space:nowrap;
            will-change:opacity,transform; }
`);

SG.register("scatter", {
  defaults: {
    bg: null,
    n: 130,               // pontos da nuvem
    clusters: 4,
    spread: 0.13,         // dispersão dentro do cluster (fração da tela)
    margin: 0.14,         // borda livre em volta
    ring0: 0.30,          // raio do anel onde os clusters são plantados
    // afasta a nuvem da consulta. Sem isso os k vizinhos podem cair colados nela
    // e as linhas somem — morre a leitura de "achou os mais parecidos".
    minGap: 0.115,
    seed: 3,
    dotR: 6,
    color: null,          // nuvem (default accent2)
    drawDelay: 0.0, drawDur: 0.7,

    query: [0.5, 0.52],   // onde a consulta pousa (fração da tela)
    queryFrom: null,      // de onde ela vem; default = fora, em cima
    queryDelay: 0.6, queryDur: 0.9,
    queryR: 15,
    queryColor: null,     // default accent

    k: 4,                 // quantos vizinhos acendem
    hitDelay: 1.7, hitStagger: 0.16,
    hitColor: "#3ddc97",
    hitR: 11,
    links: true,          // linhas da consulta até os vizinhos
    ring: true,           // raio de busca abrindo até o k-ésimo

    label: null, labelDelay: 0, labelSize: 34, labelTop: 810, labelColor: null,
  },

  mount(ctx) {
    const p = ctx.props, u = SG.util;
    if (p.bg) ctx.root.style.background = p.bg;
    ctx.cv = u.canvas(ctx);
    ctx.g = ctx.cv.getContext("2d");
    const W = ctx.cv.width, H = ctx.cv.height;

    ctx.qx = p.query[0] * W;
    ctx.qy = p.query[1] * H;

    // centros num anel jitterado em volta do centro: sorteio puro deixava metade
    // da tela vazia e os clusters empilhados num canto
    const K = Math.max(1, p.clusters);
    const cs = Array.from({ length: K }, (_, c) => {
      const ang = (c / K) * Math.PI * 2 + u.rnd(p.seed + c * 13.7) * 0.9;
      const rad = p.ring0 * (0.72 + u.rnd(p.seed + c * 29.1) * 0.5);
      return [0.5 + Math.cos(ang) * rad, 0.5 + Math.sin(ang) * rad * (W / H)];
    });

    const gap = p.minGap * H;
    ctx.pts = Array.from({ length: p.n }, (_, i) => {
      const c = cs[i % cs.length];
      // duas amostras somadas aproximam uma gaussiana e evitam o bloco quadrado
      const dx = (u.rnd(p.seed + i * 3.3) + u.rnd(p.seed + i * 7.1) - 1) * p.spread;
      const dy = (u.rnd(p.seed + i * 5.7) + u.rnd(p.seed + i * 11.9) - 1) * p.spread;
      let x = u.clamp(c[0] + dx, p.margin * 0.5, 1 - p.margin * 0.5) * W;
      let y = u.clamp(c[1] + dy, p.margin * 0.5, 1 - p.margin * 0.5) * H;
      // empurra pra fora do raio mínimo, preservando a ordem de distância
      const d = Math.hypot(x - ctx.qx, y - ctx.qy);
      if (gap > 0 && d < gap && d > 1e-6) {
        const s = (gap + d * 0.45) / d;
        x = ctx.qx + (x - ctx.qx) * s;
        y = ctx.qy + (y - ctx.qy) * s;
      }
      return { x, y, r: 0.6 + u.rnd(p.seed + i * 17.3) * 0.8 };
    });
    const from = p.queryFrom || [p.query[0], -0.12];
    ctx.fx = from[0] * W;
    ctx.fy = from[1] * H;

    // os k mais próximos, de verdade
    const order = ctx.pts
      .map((q, i) => ({ i, d: Math.hypot(q.x - ctx.qx, q.y - ctx.qy) }))
      .sort((a, b) => a.d - b.d);
    ctx.hits = order.slice(0, Math.max(0, p.k));
    ctx.rMax = ctx.hits.length ? ctx.hits[ctx.hits.length - 1].d : 0;

    if (p.label) {
      ctx.lab = u.el("div", "sc-lab", p.label);
      ctx.lab.style.cssText += `left:0;right:0;text-align:center;top:${p.labelTop}px;` +
        `font-size:${p.labelSize}px;color:${p.labelColor || ctx.theme.fg || "#fff"}`;
      ctx.root.appendChild(ctx.lab);
    }
  },

  seek(t, ctx) {
    const p = ctx.props, u = SG.util, g = ctx.g;
    const W = ctx.cv.width, H = ctx.cv.height;
    g.clearRect(0, 0, W, H);
    if (p.bg) { g.fillStyle = p.bg; g.fillRect(0, 0, W, H); }

    const cloud = p.color || ctx.theme.accent2 || "#8b9cff";
    const qcol = p.queryColor || ctx.theme.accent || "#e11d48";
    const draw = u.prog(t, p.drawDelay, p.drawDur, "outCubic");
    if (draw <= 0) return;

    const hitAt = i => p.hitDelay + i * p.hitStagger;
    const lit = new Map();
    ctx.hits.forEach((h, i) => lit.set(h.i, u.prog(t, hitAt(i), 0.34, "outBack")));

    // nuvem — os pontos entram em ordem, dá um varrimento em vez de tudo de uma vez
    ctx.pts.forEach((q, i) => {
      const a = u.clamp(draw * 1.4 - (i / ctx.pts.length) * 0.4);
      if (a <= 0) return;
      const L = u.clamp(lit.get(i) || 0);
      g.globalAlpha = a * u.lerp(0.5, 1, L);
      g.fillStyle = L > 0.02 ? p.hitColor : cloud;
      g.beginPath();
      g.arc(q.x, q.y, u.lerp(p.dotR * q.r, p.hitR, L), 0, Math.PI * 2);
      g.fill();
    });
    g.globalAlpha = 1;

    const qp = u.prog(t, p.queryDelay, p.queryDur, "inOutCubic");
    const qx = u.lerp(ctx.fx, ctx.qx, qp), qy = u.lerp(ctx.fy, ctx.qy, qp);

    if (p.ring && qp > 0.99) {
      const rp = u.prog(t, p.hitDelay - 0.35, 0.9, "outCubic");
      if (rp > 0) {
        g.strokeStyle = qcol;
        g.globalAlpha = 0.42 * (1 - 0.25 * rp);
        g.lineWidth = 2;
        g.setLineDash([7, 7]);
        g.beginPath();
        g.arc(ctx.qx, ctx.qy, (ctx.rMax + p.hitR) * rp, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
        g.globalAlpha = 1;
      }
    }

    if (p.links) {
      g.strokeStyle = p.hitColor;
      g.lineWidth = 2;
      ctx.hits.forEach((h, i) => {
        const a = u.clamp(u.prog(t, hitAt(i), 0.34, "outCubic"));
        if (a <= 0) return;
        const q = ctx.pts[h.i];
        g.globalAlpha = a * 0.55;
        g.beginPath();
        g.moveTo(ctx.qx, ctx.qy);
        g.lineTo(u.lerp(ctx.qx, q.x, a), u.lerp(ctx.qy, q.y, a));
        g.stroke();
      });
      g.globalAlpha = 1;
    }

    if (qp > 0) {
      const pop = u.clamp(u.prog(t, p.queryDelay - 0.2, 0.4, "outBack"));
      g.fillStyle = qcol;
      g.beginPath();
      g.arc(qx, qy, p.queryR * pop, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = qcol;
      g.globalAlpha = 0.45;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(qx, qy, p.queryR * pop * 1.9, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }

    if (ctx.lab) {
      const a = u.prog(t, p.labelDelay, 0.5, "outCubic");
      ctx.lab.style.opacity = a.toFixed(4);
      ctx.lab.style.transform = `translateY(${((1 - a) * 16).toFixed(2)}px)`;
    }
  },
});
