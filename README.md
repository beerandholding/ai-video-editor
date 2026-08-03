# social-generator

Gerador de vídeo vertical para Instagram em **split 50/50**: a metade de cima é
gerada (animação/slides/gráficos), a metade de baixo é o teu vídeo.

A mesma pasta `web/scenes/` roda no preview e no render — o que você vê na tela
é exatamente o que sai no mp4.

```
1080 ┌──────────────┐
     │   GERADO     │  960px  ← cenas HTML/CSS/canvas, seek(t) puro
     ├──────────────┤
     │  SEU VÍDEO   │  960px  ← source.mp4, cover-crop configurável
     └──────────────┘ 1920
```

## Fluxo

```bash
./sg.sh serve                 # abre http://127.0.0.1:8420/player.html
```

1. Arrasta o vídeo na página (ou `+ vídeo`) → cria `projects/<slug>/`
2. `./sg.sh transcribe <slug>` → transcrição com timestamps por palavra
3. Você me fala o que quer; eu escrevo `projects/<slug>/timeline.json`
4. A página **recarrega sozinha** a cada alteração — você revisa frame a frame
5. Botão **renderizar** (ou `./sg.sh render <slug>`) → `projects/<slug>/out/final.mp4`

Passos 3–4 em loop: você olha a tela, me fala o ajuste, a tela atualiza.

## Comandos

```bash
./sg.sh new video.mp4 [--slug X] [--no-transcribe]   # importa + transcreve
./sg.sh transcribe <slug> [--model large-v3] [--lang pt]
./sg.sh serve [--port 8420]
./sg.sh render <slug> [--workers 6] [--x264] [--crf 20]
./sg.sh clips <slug> [--cut 44.0-44.74] [--keep 10-50] [--reset]
./sg.sh ls
./sg.sh timeline <slug>
./sg.sh publish <slug> [--to youtube,instagram,tiktok] [--dry-run] [--force]
./sg.sh captions <slug> [--keywords "seed"] [--force] [--print-only]
./sg.sh keywords "engenharia de ia" [--limit 25]
```

## Descrições (captions)

`./sg.sh captions <slug>` gera o `publish.json` a partir do transcript, no
padrão da casa (o de `blog-posts/descricao-reels-fable5.txt`): Instagram com
gancho de dor + lista de dores + punchline + CTA @beerandcode; TikTok curto;
título de YouTube com curiosity gap; hashtags separadas por plataforma.
`--keywords "semente"` injeta volumes do DataForSEO no prompt. Usa a API da
Anthropic (`ANTHROPIC_API_KEY` no `.env`, modelo `claude-opus-5`). Não
sobrescreve texto existente sem `--force`. **Sempre revise antes de publicar.**

## Publicação

`./sg.sh publish <slug>` sobe o `out/final.mp4` para YouTube Shorts, Instagram
Reels e TikTok. Título/legenda/hashtags vêm de `projects/<slug>/publish.json`
(criado vazio na primeira rodada; `overrides` permite texto diferente por
plataforma). O resultado de cada publicação fica gravado em `results` — rodar
de novo não reposta sem `--force`. `--dry-run` valida vídeo (9:16, duração) e
credenciais sem postar.

**Pela UI (o caminho normal):** com o vídeo renderizado, o botão **publicar**
do preview abre o modal — escolhe plataformas, publica agora ou agenda
(o `serve` tem um scheduler que dispara agendamentos vencidos a cada 30s).
A descrição/hashtags vêm do `publish.json`. O login de cada plataforma é o
link "conectar" no próprio modal: abre o OAuth do provedor, o callback local
salva o token em `~/.config/social-generator/` e não pede login de novo
(refresh automático).

Setup por plataforma (uma vez cada — só as credenciais do APP no `.env`;
os tokens de usuário vêm do fluxo "conectar" da UI):

- **YouTube**: OAuth client (tipo *Web application*) no Google Cloud com a
  YouTube Data API v3 ativa, redirect `http://localhost:8420/oauth/youtube/callback`.
  No `.env`: `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`.
- **Instagram**: app Meta com `instagram_content_publish` + conta IG Business
  ligada a uma Página. Redirect `http://localhost:8420/oauth/instagram/callback`.
  No `.env`: `META_APP_ID` e `META_APP_SECRET`. Upload é resumable (arquivo
  local, não precisa de URL pública).
- **TikTok**: app com Content Posting API, redirect
  `http://localhost:8420/oauth/tiktok/callback`. No `.env`:
  `TIKTOK_CLIENT_KEY` e `TIKTOK_CLIENT_SECRET`. O escopo `video.publish`
  (Direct Post) exige aprovação do TikTok — sem ele o driver usa
  `video.upload`: o vídeo chega como **rascunho na inbox do app** e você
  finaliza por lá. Quando o Direct Post for aprovado, adicione
  `TIKTOK_SCOPES=user.info.basic,video.upload,video.publish` no `.env` e
  reconecte pela UI; aí o post sai direto (público após auditoria do app).

## Cortar pedaços do vídeo

Você não precisa acertar a gravação de primeira. Grava errando, repetindo,
travando — e a gente corta depois. Os tempos são **da fonte** (os mesmos que
aparecem na transcrição):

```bash
./sg.sh clips <slug> --cut 44.0-44.74 --cut 47.02-48.2
```

Isso vira `source.clips` no timeline. **Os segmentos são remapeados sozinhos** e
a `duration` é recalculada — nada de refazer o timeline na mão. O comando avisa
o que mudou de duração, porque `delay`/`cps`/`dur` internos podem não caber mais
no segmento encurtado.

Na tela: tracinhos amarelos na barra marcam cada corte, e as palavras cortadas
aparecem riscadas na transcrição. O play pula o corte igual ao mp4 final.

## Tratamento de cor

`source.grade` no timeline trata a metade de baixo. Os parâmetros foram escolhidos
entre os que têm equivalente **exato** no ffmpeg e no browser, então o preview
mostra a cor real (conferido pixel a pixel: erro médio < 1 de 255).

```jsonc
"grade": {
  "exposure":   1.0,    // ganho geral
  "gamma":      1.45,   // > 1 abre os meios-tons SEM estourar as altas
  "contrast":   1.08,   // em torno de 0.5
  "saturation": 1.06,
  "temp":       0.0,    // -1 frio (azul) … +1 quente (âmbar)
  "tint":      -0.35,   // -1 verde … +1 magenta
  "lift":       0.008   // levanta o preto
}
```

Para vídeo escuro, **prefira `gamma` a `exposure`**: multiplicar clareia tudo e
estoura as altas; a gama abre só os meios-tons. `null` = sem tratamento.

## Atalhos da tela de review

| tecla | ação |
|---|---|
| `espaço` | play / pause |
| `←` `→` | ±1 frame (`shift` = ±10) |
| `[` `]` | segmento anterior / próximo |
| `L` | repetir o segmento atual em loop |
| `G` | guias de corte + safe area do Reels |
| `1` `2` `3` | ver ambos / só topo / só vídeo |
| `Home` `End` | início / fim |

Painéis laterais: **segmentos** (clica pra pular), **transcrição** (clica na
palavra pra pular, palavra atual destacada) e **info**.

## timeline.json

```jsonc
{
  "fps": 25, "width": 1080, "height": 1920, "split": 0.5, "duration": 104.68,
  "source": {
    "crop": { "x": 0.5, "y": 1.0, "zoom": 1.0 },  // âncora 0..1 do cover-crop
    "clips": [[0, 44], [44.74, 116.73]],           // trechos MANTIDOS, em segundos
    "trim": null                                   // legado: equivale a clips de 1 faixa
  },
  "theme": { "bg": "#08080a", "fg": "#fff", "accent": "#e11d48", "accent2": "#8b9cff" },
  "segments": [
    {
      "id": "seg-1", "start": 0.0, "end": 10.0,
      "layers": [                                  // empilhadas, na ordem
        { "scene": "surface3d", "props": { "fn": "sin(x)*cos(y)" } },
        { "scene": "title-hook", "props": { "lines": ["A","B","C"], "emphasis": 1 } }
      ]
    }
  ]
}
```

Atalho: `"scene": "x", "props": {...}` no lugar de `layers` quando é camada única.

**Os `start`/`end` dos segmentos são tempo de TIMELINE** — o vídeo já cortado.
`source.clips` é tempo de FONTE — o arquivo original. Sem cortes os dois são
iguais. Com cortes, use `./sg.sh clips` pra mexer; ele mantém os dois lados
coerentes. A transcrição no disco fica sempre em tempo de fonte; a tela converte.

## Cenas disponíveis

| cena | pra que serve | props principais |
|---|---|---|
| `blank` | fundo sólido | `bg` |
| `title-hook` | headline empilhada com uma linha em destaque | `lines`, `emphasis`, `align`, `size`, `emSize`, `stagger` |
| `kicker` | linha pequena com letterspacing, régua e subtítulo | `text`, `sub`, `rule`, `mono`, `top` |
| `bullets` | lista revelada em sequência | `title`, `items`, `marker` (`—` `•` `01`), `stagger` |
| `stat` | número grande com contagem animada | `from`, `value`, `decimals`, `prefix`, `suffix`, `label`, `caption` |
| `code` | bloco mono com typewriter e destaque de linha | `code`, `cps`, `highlight`, `head`, `size` |
| `surface3d` | superfície wireframe `z = f(x,y)` girando | `fn`, `range`, `grid`, `amp`, `yawSpeed`, `stars`, `box` |
| `grid2d` | plano cartesiano claro com marcador e anotação | `bg`, `cell`, `marker`, `moveTo`, `lens`, `annot` |
| `image` | imagem de `projects/<slug>/assets/` com ken-burns | `src`, `fit`, `zoom`, `pan` |
| `clock` | relógio com ponteiro varrendo e parando numa hora | `hour`, `turns`, `sweepDelay`, `sweepDur`, `labels` |
| `collide` | N pontos saem de lugares distintos e caem no mesmo destino | `starts`, `target`, `bow`, `label`, `stagger`, `flash` |
| `warp` | malha deformando: estica/gira (legal) ou dobra por cima de si (ilegal) | `mode`, `scale`, `delay`, `dur`, `reverseDelay`, `dots`, `flash` |
| `popwords` | tipografia cinética, uma palavra por vez no tempo da fala | `words[{t,w,hot,br}]`, `size`, `top`, `align`, `clearAt` |
| `pulse` | fundo em movimento contínuo — evita frame estático | `dots`, `speed`, `rings`, `beats`, `alpha` |
| `burst` | explosão radial em instantes específicos | `at`, `spokes`, `r1`, `cx`, `cy` |
| `flow` | caixas ligadas por setas, acendendo em sequência | `steps[{t,label,sub,hot}]`, `dir`, `boxW`, `gap`, `dim` |
| `scatter` | nuvem de pontos, consulta pousa e os k vizinhos acendem | `n`, `clusters`, `query`, `k`, `hitDelay`, `links`, `ring` |

Cena nova = um arquivo em `web/scenes/` + uma linha em `web/host.html`.

```js
SG.register("minha-cena", {
  defaults: { texto: "oi" },
  mount(ctx) { /* monta o DOM uma vez em ctx.root */ },
  seek(t, ctx) { /* t = segundos desde o início do segmento */ },
});
```

**Regra única e obrigatória:** `seek(t)` tem que ser função pura do tempo. Nada
de `requestAnimationFrame`, `setTimeout`, transições CSS ou `Date.now()` — o
render chama `seek()` em ordem arbitrária de frame, em 6 abas paralelas.

## Como funciona o render

1. Playwright abre `host.html` no Chrome do sistema, viewport 1080×960
2. Para cada frame: `SG.seek(i/fps)` → screenshot PNG (N abas em paralelo)
3. ffmpeg: `vstack` dos PNGs sobre o vídeo cover-cropado + áudio original + nvenc
   (com `clips`, os trechos são colados antes por `trim`/`atrim` + `concat`)

Referência: 104s / 2617 frames em ~85s com `--workers 6` numa RTX 4080S.

## Requisitos

`ffmpeg` com nvenc, Google Chrome, Python 3.12. `./sg.sh` cria o venv sozinho na
primeira execução. Transcrição usa faster-whisper (CUDA quando disponível,
senão CPU com modelo `medium`).
