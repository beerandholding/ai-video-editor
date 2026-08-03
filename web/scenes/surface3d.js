/* Rotating wireframe surface z = f(x, y), drawn on canvas. Deterministic per t. */
SG.register("surface3d", {
  defaults: {
    fn: "sin(x) * cos(y)",   // x, y in [-range, range]; sin/cos/exp/sqrt/abs/PI available
    range: 3.2,
    grid: 30,
    amp: 1.0,
    yaw: -0.6,               // starting rotation (radians)
    yawSpeed: 0.16,          // radians per second
    pitch: 1.02,
    scale: 118,
    cx: 0.5, cy: 0.52,       // centre as a fraction of the canvas
    color: null,
    lineWidth: 1.35,
    box: true,
    bg: null,
    stars: 0,                // number of background dots
    reveal: 1.1,             // seconds for the mesh to draw in
    delay: 0.0,
  },
  mount(ctx) {
    const p = ctx.props, u = SG.util;
    ctx.root.style.background = p.bg || ctx.theme.bg || "#000";
    ctx.cv = u.canvas(ctx);
    ctx.g = ctx.cv.getContext("2d");
    const body = `with (Math) { return (${p.fn}); }`;
    try { ctx.f = new Function("x", "y", body); ctx.f(0, 0); }
    catch (e) { console.warn("bad fn", p.fn, e); ctx.f = () => 0; }
  },
  seek(t, ctx) {
    const p = ctx.props, u = SG.util, g = ctx.g;
    const W = ctx.cv.width, H = ctx.cv.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = p.bg || ctx.theme.bg || "#000";
    g.fillRect(0, 0, W, H);

    const col = p.color || ctx.theme.accent2 || "#8b9cff";
    const cx = W * p.cx, cy = H * p.cy;
    const yaw = p.yaw + t * p.yawSpeed;
    const sp = Math.sin(p.pitch), cp = Math.cos(p.pitch);
    const sy = Math.sin(yaw), cyw = Math.cos(yaw);

    for (let i = 0; i < p.stars; i++) {
      const a = u.rnd(i + 1), b = u.rnd(i + 97);
      g.fillStyle = `rgba(255,255,255,${(0.05 + a * 0.16).toFixed(3)})`;
      g.fillRect(a * W, b * H, 2, 2);
    }

    const proj = (x, y, z) => {
      const X = x * cyw - y * sy;
      const Y = x * sy + y * cyw;
      const Y2 = Y * cp - z * sp;
      const k = 1 / (1 + (Y * sp + z * cp) * 0.035);
      return [cx + X * p.scale * k, cy - Y2 * p.scale * k];
    };

    if (p.box) {
      const r = p.range, h = p.amp * 1.35;
      const V = [[-r,-r,-h],[r,-r,-h],[r,r,-h],[-r,r,-h],[-r,-r,h],[r,-r,h],[r,r,h],[-r,r,h]];
      const E = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
      g.strokeStyle = "rgba(255,255,255,.16)";
      g.lineWidth = 1;
      g.beginPath();
      for (const [a, b] of E) {
        const A = proj(...V[a]), B = proj(...V[b]);
        g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]);
      }
      g.stroke();
    }

    const n = Math.max(4, p.grid | 0);
    const rev = u.prog(t, p.delay, p.reveal, "outCubic");
    const step = (2 * p.range) / n;
    const pt = (i, j) => {
      const x = -p.range + i * step, y = -p.range + j * step;
      return proj(x, y, ctx.f(x, y) * p.amp);
    };

    g.strokeStyle = col;
    g.lineWidth = p.lineWidth;
    g.globalAlpha = 0.9;
    const rows = Math.ceil((n + 1) * rev);
    g.beginPath();
    for (let j = 0; j <= n; j++) {
      if (j >= rows) break;
      for (let i = 0; i <= n; i++) {
        const q = pt(i, j);
        i === 0 ? g.moveTo(q[0], q[1]) : g.lineTo(q[0], q[1]);
      }
    }
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j < Math.min(rows, n + 1); j++) {
        const q = pt(i, j);
        j === 0 ? g.moveTo(q[0], q[1]) : g.lineTo(q[0], q[1]);
      }
    }
    g.stroke();
    g.globalAlpha = 1;
  },
});
