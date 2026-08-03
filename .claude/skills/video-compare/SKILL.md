---
name: video-compare
description: Montar reel tipo "compare" no social-generator — timelapse/vídeo fullscreen com comparações "X vs Y" sobrepostas (cena versus) e trilha sonora. Use SEMPRE que for editar/criar timeline de projeto compare, mexer na cena versus ou configurar música.
---

# Vídeo tipo `compare` (fullscreen + overlay)

`timeline.type: "compare"`: o vídeo (timelapse, sem fala) cobre o frame inteiro
1080×1920; as cenas viram uma camada **transparente** por cima (o render tira
screenshot com alpha e o ffmpeg faz overlay). Referência do formato: reel da
@codingmermaid.ai (ML vs AI engineer) — blocos temáticos com título grande e
listas em duas colunas.

## Regras próprias do tipo

- Canvas das cenas: **1080×1920** (frame inteiro). Screenshot de verificação
  nesse viewport.
- **Toda cena precisa deixar o fundo transparente** (`bg: "none"`), senão tapa
  o vídeo. `pulse` com alpha baixo (~0.25) funciona como camada ambiente.
- Sem fala → sem transcrição: `./sg.sh new video.mp4 --type compare` já pula o
  whisper. Ancoragem de eventos é por ritmo, não por palavra.
- Fonte deitada (1920×1080) sofre cover-crop pesado: só ~1/3 central aparece.
  Ajuste `source.crop.x` se o que interessa não estiver no centro.

## Música (`timeline.music`)

```json
"music": { "file": "trilha.mp3", "gain_db": -6, "fade": 1.5 }
```

Arquivo em `projects/<slug>/assets/`. Loopa se for mais curta que o vídeo,
substitui o áudio do source, fade-out em segundos no fim. O preview toca a
mesma trilha (não simula o fade; `gain_db > 0` não sobe volume no preview).

## Cena `versus`

Três modos, combináveis com `title` (título grande estilo "Skills"):

- `rows: [{l, r, t}]` — linhas pareadas (célula esquerda + direita).
- `listL`/`listR: [{w, t}]` — listas independentes por coluna (blocos do reel).
- `center: [{w, t}]` — coluna única centralizada, sem cabeçalho de colunas
  ("base comum").

Todo `t` é local ao segmento. Cabeçalhos `left`/`right` + badge `vs`; cores
`color`/`color2` (default accent/accent2 do tema). **Lado "AI Engineer" usa o
verde da comunicação de AI Engineering do Lucas: `#009966`** (via `color2` nos
props, não no `theme.accent2` — mudar o tema pintaria as partículas do `pulse`
de verde junto). `top: "center"` centraliza o
bloco na vertical (preferência do Lucas; o default 130 cola no topo). Cada card
que entra é um evento visual — intercale esquerda/direita pra densidade.

## Estrutura que funcionou (ml-vs-ai)

gancho `hookchip` centrado (2.5s) → blocos `versus` de 3.3–4.8s (título +
6×6 itens) → fechamento `center`. `pulse` embaixo o tempo todo, `beats` no
início de cada bloco, `burst` no gancho.

Ritmo, invariantes de `seek(t)` puro e armadilhas gerais: ver `CLAUDE.md`.
