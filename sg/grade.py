"""Tratamento de cor do vídeo de baixo.

O mesmo ajuste tem que sair igual no preview e no render, então os parâmetros são
escolhidos entre os que têm equivalente **exato** dos dois lados:

    ganho por canal → gama → contraste em torno de 0.5 → lift → saturação

No render isso vira `lutrgb` + `colorchannelmixer`. No player vira um
`<filter>` SVG com `feComponentTransfer` + `feColorMatrix`. As duas contas são a
mesma; `web/player.js` espelha `params()`. Mudou aqui, muda lá.

Duas pegadinhas que fazem os lados divergirem em silêncio:
  - o filtro SVG precisa de `color-interpolation-filters="sRGB"`, senão o browser
    faz a conta em linearRGB e o preview fica mais claro que o render;
  - o ffmpeg precisa de `format=gbrp` antes do lut, senão ele aplicaria em YUV.
"""
from __future__ import annotations

DEFAULTS = {
    "exposure": 1.0,     # ganho geral (multiplica)
    "gamma": 1.0,        # > 1 abre os meios-tons sem estourar as altas
    "contrast": 1.0,     # em torno de 0.5
    "saturation": 1.0,
    "temp": 0.0,         # -1 frio (azul) … +1 quente (âmbar)
    "tint": 0.0,         # -1 verde … +1 magenta
    "lift": 0.0,         # levanta (ou baixa) o preto, -0.2 … 0.2
}

# coeficientes de luminância do feColorMatrix type="saturate" (a especificação SVG)
LR, LG, LB = 0.213, 0.715, 0.072


def resolve(source: dict | None) -> dict:
    g = dict(DEFAULTS)
    for k, v in ((source or {}).get("grade") or {}).items():
        if k in g:
            g[k] = float(v)
    return g


def is_identity(g: dict) -> bool:
    return all(abs(g[k] - DEFAULTS[k]) < 1e-6 for k in DEFAULTS)


def gains(g: dict) -> tuple[float, float, float]:
    """Ganho por canal a partir de exposure + temp + tint."""
    t, ti, e = g["temp"], g["tint"], g["exposure"]
    r = e * (1 + 0.30 * t) * (1 + 0.15 * ti)
    gr = e * (1 - 0.30 * ti)
    b = e * (1 - 0.30 * t) * (1 + 0.15 * ti)
    return max(r, 0.0), max(gr, 0.0), max(b, 0.0)


def params(g: dict) -> dict:
    """Os números que os dois lados consomem.

    canal: out = amp_c * in^exp        (ganho + gama juntos: (gain*in)^exp)
    todos: out = out * slope + inter   (contraste em torno de 0.5, mais o lift)
    """
    exp = 1.0 / max(g["gamma"], 1e-6)
    r, gg, b = gains(g)
    c = g["contrast"]
    return {
        "ampR": r ** exp, "ampG": gg ** exp, "ampB": b ** exp,
        "exp": exp,
        "slope": c,
        "inter": 0.5 - 0.5 * c + g["lift"],
        "sat": g["saturation"],
    }


def ffmpeg_filter(g: dict) -> str:
    """Trecho de filtergraph, ou "" quando não há nada a fazer."""
    if is_identity(g):
        return ""
    p = params(g)
    gr, gg_, gb = gains(g)

    def lut(gain: float) -> str:
        # (ganho·val)^exp  ->  contraste em torno de 0.5 + lift  ->  volta pra 0..255.
        # O clip antes do pow equivale ao clamp que o SVG faz no fim da primitiva.
        # o intercept vai entre parênteses: ele é negativo quando há contraste,
        # e "+-0.04" solto é expressão duvidosa pro avaliador do ffmpeg
        return (f"clip((pow(clip(val/255*{gain:.6f},0,1),{p['exp']:.6f})"
                f"*{p['slope']:.6f}+({p['inter']:.6f}))*255,0,255)")

    out = (f"format=gbrp,lutrgb=r='{lut(gr)}':g='{lut(gg_)}':b='{lut(gb)}'")
    s = p["sat"]
    if abs(s - 1.0) > 1e-6:
        m = {
            "rr": LR + (1 - LR) * s, "rg": LG - LG * s, "rb": LB - LB * s,
            "gr": LR - LR * s, "gg": LG + (1 - LG) * s, "gb": LB - LB * s,
            "br": LR - LR * s, "bg": LG - LG * s, "bb": LB + (1 - LB) * s,
        }
        out += ",colorchannelmixer=" + ":".join(f"{k}={v:.6f}" for k, v in m.items())
    return out
