/* Comparação "X vs Y" — feita pro type=compare (overlay sobre o timelapse),
   mas funciona no topo do split também. Três modos, combináveis com `title`:

   - rows:  [{l, r, t}]          linhas pareadas (célula esq + dir por linha)
   - listL/listR: [{w, t}]       listas independentes por coluna (blocos tipo
                                 "Skills" do reel de referência)
   - center: [{w, t}]            coluna única centralizada, sem cabeçalho de
                                 colunas ("Shared foundation")

   Todo `t` é local ao segmento. Esquerda desliza da esquerda, direita da
   direita, center sobe — cada item é um evento visual. Fundo transparente por
   padrão: os cards têm o próprio scrim, o vídeo continua legível por trás. */
SG.util.css(`
  .vs-wrap { position:absolute; left:44px; right:44px; display:flex;
             flex-direction:column; }
  .vs-title { text-align:center; font-weight:900; letter-spacing:-.02em;
              color:#fff; margin-bottom:22px; line-height:1;
              text-shadow:0 4px 26px rgba(0,0,0,.85), 0 1px 4px rgba(0,0,0,.9);
              will-change:transform,opacity; }
  .vs-head { position:relative; display:flex; gap:14px; margin-bottom:16px; }
  .vs-col  { flex:1; text-align:center; font-weight:900; letter-spacing:-.02em;
             text-transform:uppercase; line-height:1.05; color:#fff;
             padding:.5em .3em; border-radius:16px;
             box-shadow:0 10px 40px rgba(0,0,0,.5);
             will-change:transform,opacity; }
  .vs-badge { position:absolute; left:50%; top:50%; z-index:2;
              font-weight:900; font-family:var(--mono), monospace;
              background:#fff; color:#0b0b0e; border-radius:999px;
              padding:.4em .55em; box-shadow:0 8px 30px rgba(0,0,0,.5);
              will-change:transform,opacity; }
  .vs-row  { display:flex; gap:14px; margin-bottom:14px; }
  .vs-cols { display:flex; gap:14px; align-items:flex-start; }
  .vs-list { flex:1; display:flex; flex-direction:column; gap:12px; }
  .vs-center { align-self:center; width:72%; display:flex;
               flex-direction:column; gap:12px; }
  .vs-cell { flex:1; border-radius:14px; padding:16px 20px; font-weight:600;
             line-height:1.25; color:#fff; background:rgba(8,8,12,.74);
             border:2px solid transparent; box-shadow:0 8px 30px rgba(0,0,0,.45);
             will-change:transform,opacity; }
  .vs-list .vs-cell, .vs-center .vs-cell { flex:none; }
  .vs-center .vs-cell { text-align:center; }
`);

SG.register("versus", {
  defaults: {
    title: null,           // título grande em cima ("Skills"); null = sem
    left: "A",
    right: "B",
    color: null,           // cor do lado esquerdo; default theme.accent
    color2: null,          // cor do lado direito; default theme.accent2
    rows: [],              // [{l, r, t}] — modo pareado
    listL: [],             // [{w, t}] — modo listas independentes
    listR: [],
    center: [],            // [{w, t}] — coluna única, sem head
    vs: "VS",
    headT: 0.1,            // quando título/cabeçalhos pipocam
    titleSize: 76,
    size: 42,              // fonte dos cabeçalhos de coluna
    rowSize: 28,           // fonte das células
    vsSize: 32,
    top: 130,              // px do topo do stage, ou "center" pra centralizar
    stagger: 0.16,         // no modo rows: célula direita entra t+stagger
    pop: 0.42,
    bg: "none",            // pinta o root só se pedir (split usa a cor do tema)
  },

  mount(ctx) {
    const p = ctx.props, u = SG.util;
    if (p.bg && p.bg !== "none") ctx.root.style.background = p.bg;
    const c1 = p.color || ctx.theme.accent || "#e11d48";
    const c2 = p.color2 || ctx.theme.accent2 || "#8b9cff";

    const wrap = u.el("div", "vs-wrap");
    if (p.top === "center") {
      wrap.style.top = "0";
      wrap.style.bottom = "0";
      wrap.style.justifyContent = "center";
    } else {
      wrap.style.top = p.top + "px";
    }

    ctx.title = null;
    if (p.title) {
      ctx.title = u.el("div", "vs-title", p.title);
      ctx.title.style.fontSize = p.titleSize + "px";
      wrap.appendChild(ctx.title);
    }

    const hasCols = p.rows.length || p.listL.length || p.listR.length;
    ctx.colL = ctx.colR = ctx.badge = null;
    if (hasCols) {
      const head = u.el("div", "vs-head");
      ctx.colL = u.el("div", "vs-col", p.left);
      ctx.colR = u.el("div", "vs-col", p.right);
      ctx.colL.style.background = c1;
      ctx.colR.style.background = c2;
      ctx.colL.style.fontSize = ctx.colR.style.fontSize = p.size + "px";
      ctx.badge = u.el("div", "vs-badge", p.vs);
      ctx.badge.style.fontSize = p.vsSize + "px";
      head.append(ctx.colL, ctx.badge, ctx.colR);
      wrap.appendChild(head);
    }

    const cell = (txt, border) => {
      const n = u.el("div", "vs-cell", txt);
      n.style.borderColor = border;
      n.style.fontSize = p.rowSize + "px";
      return n;
    };

    // {el, t, dir}: dir = de onde o card entra (-1 esq, +1 dir, 0 sobe)
    ctx.items = [];

    for (const r of p.rows) {
      const row = u.el("div", "vs-row");
      const l = cell(r.l, c1), rt = cell(r.r, c2);
      row.append(l, rt);
      wrap.appendChild(row);
      ctx.items.push({ el: l, t: r.t || 0, dir: -1 });
      ctx.items.push({ el: rt, t: (r.t || 0) + p.stagger, dir: 1 });
    }

    if (p.listL.length || p.listR.length) {
      const cols = u.el("div", "vs-cols");
      const colA = u.el("div", "vs-list"), colB = u.el("div", "vs-list");
      cols.append(colA, colB);
      wrap.appendChild(cols);
      for (const it of p.listL) {
        const n = cell(it.w, c1);
        colA.appendChild(n);
        ctx.items.push({ el: n, t: it.t || 0, dir: -1 });
      }
      for (const it of p.listR) {
        const n = cell(it.w, c2);
        colB.appendChild(n);
        ctx.items.push({ el: n, t: it.t || 0, dir: 1 });
      }
    }

    if (p.center.length) {
      const col = u.el("div", "vs-center");
      wrap.appendChild(col);
      p.center.forEach((it, i) => {
        const n = cell(it.w, i % 2 ? c2 : c1);
        col.appendChild(n);
        ctx.items.push({ el: n, t: it.t || 0, dir: 0 });
      });
    }

    ctx.root.appendChild(wrap);
  },

  seek(t, ctx) {
    const p = ctx.props, u = SG.util;

    const hc = u.clamp(u.prog(t, p.headT, p.pop, "outBack"));
    if (ctx.title) {
      ctx.title.style.opacity = hc.toFixed(4);
      ctx.title.style.transform =
        `translateY(${((1 - hc) * -40).toFixed(1)}px) scale(${u.lerp(0.75, 1, hc).toFixed(4)})`;
    }
    if (ctx.colL) {
      const h2 = ctx.title ? u.clamp(u.prog(t, p.headT + 0.14, p.pop, "outBack")) : hc;
      ctx.colL.style.opacity = ctx.colR.style.opacity = h2.toFixed(4);
      ctx.colL.style.transform = `translateX(${((h2 - 1) * 90).toFixed(1)}px) scale(${u.lerp(0.7, 1, h2).toFixed(4)})`;
      ctx.colR.style.transform = `translateX(${((1 - h2) * 90).toFixed(1)}px) scale(${u.lerp(0.7, 1, h2).toFixed(4)})`;
      const b = u.clamp(u.prog(t, p.headT + 0.28, p.pop, "outBack"));
      ctx.badge.style.opacity = b.toFixed(4);
      ctx.badge.style.transform =
        `translate(-50%,-50%) scale(${u.lerp(0.3, 1, b).toFixed(4)}) rotate(${((1 - b) * -18).toFixed(1)}deg)`;
    }

    for (const it of ctx.items) {
      const a = u.clamp(u.prog(t, it.t, p.pop, "outCubic"));
      it.el.style.opacity = a.toFixed(4);
      it.el.style.transform = it.dir === 0
        ? `translateY(${((1 - a) * 46).toFixed(1)}px)`
        : `translateX(${(it.dir * (1 - a) * 70).toFixed(1)}px)`;
    }
  },
});
