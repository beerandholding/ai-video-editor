/* Shared helpers for scenes. Everything here is time-pure. */
(function () {
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, p) => a + (b - a) * p;
  const inv = (a, b, v) => (b === a ? 1 : clamp((v - a) / (b - a)));

  const ease = {
    linear: p => p,
    outCubic: p => 1 - Math.pow(1 - p, 3),
    inCubic: p => p * p * p,
    inOutCubic: p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    outExpo: p => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)),
    outQuint: p => 1 - Math.pow(1 - p, 5),
    outBack: p => 1 + 2.2 * Math.pow(p - 1, 3) + 1.2 * Math.pow(p - 1, 2),
  };

  /** progress of a sub-animation: p = prog(t, delay, dur, 'outCubic') */
  function prog(t, delay, dur, e = "outCubic") {
    const fn = typeof e === "function" ? e : ease[e] || ease.linear;
    return fn(clamp((t - delay) / (dur || 1e-6)));
  }

  /** fade in then out: 1 while visible, 0 outside */
  function inOut(t, start, dur, fadeIn = 0.35, fadeOut = 0.35) {
    const a = prog(t, start, fadeIn, "outCubic");
    const b = 1 - prog(t, start + dur - fadeOut, fadeOut, "inCubic");
    return clamp(Math.min(a, b));
  }

  function el(tag, cls, txt) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }

  function css(str) {
    const s = document.createElement("style");
    s.textContent = str;
    document.head.appendChild(s);
    return s;
  }

  /** stable pseudo-random from an integer seed — keeps renders deterministic */
  function rnd(seed) {
    let x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  /** words of the transcript that fall inside [a,b) of global time */
  function wordsBetween(transcript, a, b) {
    if (!transcript || !transcript.words) return [];
    return transcript.words.filter(w => w.end > a && w.start < b);
  }

  function canvas(ctx, w, h) {
    const c = document.createElement("canvas");
    c.width = w || ctx.W; c.height = h || ctx.H;
    c.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
    ctx.root.appendChild(c);
    return c;
  }

  window.SG.util = { clamp, lerp, inv, ease, prog, inOut, el, css, rnd, wordsBetween, canvas };

  css(`
    .sg-pad { position:absolute; inset:0; display:flex; padding:72px; }
    .sg-kicker { font-size:26px; letter-spacing:.34em; text-transform:lowercase;
                 font-weight:500; opacity:.55; }
    .sg-mono { font-family: var(--mono), "JetBrains Mono", monospace; }
  `);
})();
