/* Caixas ligadas por setas, acendendo em sequência. O visual canônico de
   "isso passa por aqui, depois por aqui": RAG, pipeline de agentes, CI/CD,
   arquitetura. Cada caixa tem seu próprio `t`, então cada uma é um evento —
   é assim que um diagrama vira ritmo em vez de imagem parada. */
SG.util.css(`
  .fl { position:absolute; left:60px; right:60px; display:flex;
        align-items:center; justify-content:center; }
  .fl-col { flex-direction:column; }
  .fl-row { flex-direction:row; }
  .fl-box { border:2px solid currentColor; box-sizing:border-box;
            display:flex; flex-direction:column; align-items:center;
            justify-content:center; text-align:center; font-weight:700;
            line-height:1.14; will-change:transform,opacity;
            transform-origin:center center; }
  .fl-sub { font-weight:500; opacity:.62; margin-top:6px; }
  .fl-arrow { flex:0 0 auto; display:flex; align-items:center;
              justify-content:center; will-change:opacity,transform; }
  .fl-arrow svg { display:block; }
`);

SG.register("flow", {
  defaults: {
    bg: null,
    // [{t, label, sub, hot}] — t em segundos DESDE O INÍCIO DO SEGMENTO
    steps: [],
    dir: "down",          // down (coluna) | right (linha)
    size: 40,
    subSize: 21,
    boxW: 520,            // largura da caixa; em dir=right é a largura de cada uma
    boxH: null,           // null = altura pelo conteúdo
    padY: 18, padX: 26,
    gap: 22,
    radius: 16,
    pop: 0.3,             // duração da entrada
    flash: 0.55,          // quanto tempo a caixa recém-acesa fica destacada
    dim: 0.4,             // opacidade das caixas já passadas (1 = não apaga)
    arrows: true,
    arrowLen: 34,
    color: null,          // borda/texto padrão
    hotColor: null,       // caixa marcada com hot, e o flash de entrada
    top: null,            // px; senão centraliza verticalmente
  },

  mount(ctx) {
    const p = ctx.props, u = SG.util;
    if (p.bg) ctx.root.style.background = p.bg;
    const col = p.dir !== "right";
    const wrap = u.el("div", "fl " + (col ? "fl-col" : "fl-row"));
    wrap.style.gap = p.gap + "px";
    if (p.top != null) wrap.style.top = p.top + "px";
    else { wrap.style.top = "0"; wrap.style.bottom = "0"; }
    wrap.style.color = p.color || ctx.theme.fg || "#fff";

    ctx.boxes = []; ctx.arrows = [];
    p.steps.forEach((s, i) => {
      if (i && p.arrows) {
        const a = u.el("div", "fl-arrow");
        const L = p.arrowLen;
        a.innerHTML = col
          ? `<svg width="18" height="${L}" viewBox="0 0 18 ${L}" fill="none">
               <path d="M9 0 V${L - 8} M2 ${L - 13} L9 ${L - 4} L16 ${L - 13}"
                     stroke="currentColor" stroke-width="2.4"
                     stroke-linecap="round" stroke-linejoin="round"/></svg>`
          : `<svg width="${L}" height="18" viewBox="0 0 ${L} 18" fill="none">
               <path d="M0 9 H${L - 8} M${L - 13} 2 L${L - 4} 9 L${L - 13} 16"
                     stroke="currentColor" stroke-width="2.4"
                     stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        wrap.appendChild(a);
        ctx.arrows.push(a);
      }
      const b = u.el("div", "fl-box");
      b.style.width = p.boxW + "px";
      if (p.boxH) b.style.height = p.boxH + "px";
      b.style.padding = `${p.padY}px ${p.padX}px`;
      b.style.borderRadius = p.radius + "px";
      b.style.fontSize = p.size + "px";
      b.appendChild(u.el("div", null, s.label || ""));
      if (s.sub) {
        const sb = u.el("div", "fl-sub", s.sub);
        sb.style.fontSize = p.subSize + "px";
        b.appendChild(sb);
      }
      wrap.appendChild(b);
      ctx.boxes.push(b);
    });
    ctx.root.appendChild(wrap);
  },

  seek(t, ctx) {
    const p = ctx.props, u = SG.util;
    const base = p.color || ctx.theme.fg || "#fff";
    const hot = p.hotColor || ctx.theme.accent || "#e11d48";

    // índice da última caixa que já entrou — as anteriores apagam
    let cur = -1;
    p.steps.forEach((s, i) => { if (t >= s.t) cur = i; });

    p.steps.forEach((s, i) => {
      const b = ctx.boxes[i];
      const a = u.prog(t, s.t, p.pop, "outBack");
      if (a <= 0) { b.style.opacity = "0"; b.style.transform = "scale(0.86)"; return; }
      // acende ao entrar e volta ao normal; caixa `hot` fica acesa pra sempre
      const lit = s.hot ? 1 : 1 - u.prog(t, s.t + p.pop, p.flash, "outCubic");
      const past = i < cur ? p.dim : 1;
      b.style.opacity = (u.clamp(a * 1.6) * past).toFixed(4);
      b.style.transform = `scale(${u.lerp(0.86, 1, u.clamp(a)) * u.lerp(1, 1.045, lit)})`;
      b.style.color = lit > 0.02 ? hot : base;
      b.style.borderColor = lit > 0.02 ? hot : base;
      b.style.boxShadow = lit > 0.02
        ? `0 0 ${(28 * lit).toFixed(1)}px ${hot}55` : "none";
    });

    ctx.arrows.forEach((el, i) => {
      // a seta i liga a caixa i com a i+1, então entra um pouco antes dela
      const a = u.prog(t, (p.steps[i + 1] || {}).t - 0.14, 0.28, "outCubic");
      el.style.opacity = a.toFixed(4);
      el.style.transform = `scale(${u.lerp(0.5, 1, a).toFixed(3)})`;
    });
  },
});
