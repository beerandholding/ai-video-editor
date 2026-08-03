# social-generator — contexto pro Claude

Gerador de reel vertical. Leia o `README.md` pro uso; este arquivo é o que
não dá pra inferir do código.

## Tipos de vídeo (`timeline.type`)

**Cada tipo tem uma skill própria — invoque a skill do tipo ANTES de mexer no
timeline do projeto.** Hoje: `video-split` (50/50, o original; timeline sem
`type` = split) e `video-compare` (fullscreen + overlay). Tipos novos = skill
nova em `.claude/skills/`, este arquivo só lista os nomes.

O tipo se decide na conversa (eu gravo no timeline) — não há UI pra isso.

## Como o Lucas trabalha aqui

Ele **não edita `timeline.json`**. O fluxo é: ele grava, sobe o vídeo, e conversa
comigo enquanto assiste a página. Eu escrevo/edito o `timeline.json`, a página
recarrega sozinha (WebSocket + watchfiles), ele revisa e me fala o próximo ajuste.

Então: **eu sou o editor**. Escrever o timeline é o trabalho, não um passo auxiliar.

## Invariantes que não podem quebrar

1. **`seek(t)` é função pura do tempo.** Sem `requestAnimationFrame`, `setTimeout`,
   transição CSS ou `Date.now()` dentro de cena. O render chama frames em ordem
   arbitrária, em 6 abas paralelas. Estado acumulado = frames errados.
2. **Preview e render rodam o MESMO código** (`web/host.html`). Nunca bifurcar.
   Se divergirem, o "o que você vê é o que sai" morre e a ferramenta perde o sentido.
3. **Cena nova** = arquivo em `web/scenes/` + uma linha `<script>` em `web/host.html`.
   Esquecer a segunda parte faz a cena virar `blank` silenciosamente (só loga warning).
4. **`sg/clips.py` e o bloco de clips do `player.js` são o mesmo mapa em duas
   linguagens.** Mexeu num, mexe no outro — se divergirem, o preview mostra um
   corte e o mp4 sai com outro.
5. **`sg/grade.py` e `applyGrade()` no `player.js`, idem** — a mesma conta de cor
   em `lutrgb`/`colorchannelmixer` e em `feComponentTransfer`/`feColorMatrix`.
   Conferido pixel a pixel: erro médio 0.12–0.74 de 255. Se mexer num lado só, o
   preview passa a mentir sobre a cor que sai no mp4.

## Armadilhas já encontradas

- **`./sg.sh`**, não `./sg` — `sg/` é o pacote Python, um symlink ali colide.
- **O render precisa do server no ar** — ele busca `host.html` por HTTP. `sg.sh render`
  sobe um descartável em `--port 8421`; o `serve` normal fica no 8420.
- **`wait_until="networkidle"` nunca dispara** em `player.html` (WebSocket aberto).
  Use `domcontentloaded` em qualquer script Playwright que aponte pro player.
- **Playwright usa `channel="chrome"`** (Chrome do sistema). `playwright install-deps`
  falha sem sudo e isso é irrelevante — não tente consertar.
- **ctranslate2/faster-whisper** precisa de cuBLAS/cuDNN dos wheels nvidia. O
  `sg.sh` monta o `LD_LIBRARY_PATH`. Sem isso: `libcublas.so.12 is not found`.
- **Cena `code`**: confira se o typewriter termina **antes** do fim do segmento.
  `delay + total_chars/cps < duração`. Já queimou uma vez — a última linha sumiu.
- **Cena `stat`**: alinhe o fim da contagem ao instante em que ele **fala** o número
  (`delay + dur ≈ t_da_palavra`), senão aparece um número errado na tela.
- **Nunca salve arquivo em `web/` ou no `timeline.json` com um render rodando.**
  Os N workers abrem o `host.html` em instantes diferentes: se o código mudar no
  meio, cada um pega uma versão e os frames não batem entre si. Já aconteceu — o
  vídeo saiu com o topo fora do lugar e **nenhum erro apareceu**. O `render_frames`
  agora tira um fingerprint de `web/**` + timeline antes e depois e aborta se mudou,
  mas o certo é não editar durante.

## Ritmo — a regra que ele mais cobra

**Um evento visual a cada ~0.8s.** Não é exagero: ele já devolveu um timeline
inteiro com *"em alguns momentos fico falando e nada acontece"*. Uma frase que
entra e fica parada 3s é um buraco, mesmo que a frase seja boa. Movimento
ambiente sozinho **não conta** — ele disse explicitamente que "só ficar algo
mexendo" não resolve. Tem que ter *evento*: coisa nova entrando.

Ferramentas pra isso:

- **`popwords`** — tipografia cinética, uma palavra/frase por vez, cada uma no
  instante em que ele fala. É o motor principal: transforma uma frase de 4s em
  4 eventos. Os `t` são locais ao segmento.
- **`pulse`** — camada de fundo que nunca para (partículas + anéis + `beats`).
  Vai por baixo de tudo, pra nenhum frame ser imagem estática.
- **`burst`** — explosão radial em instantes específicos. Pontuação nas palavras
  de impacto.

Para conferir a densidade antes de entregar, some `words[].t` e `at[]` de todos
os segmentos e divida pela duração. Menos de 1 evento/s = tem buraco.

Cenas de canvas que pintam o fundo (`warp`) aceitam `bg: "none"` pra deixar o
`pulse` aparecer por baixo. Sem isso, empilhar não adianta.

## Como montar um timeline novo

O passo a passo é por tipo — está na skill (`video-split`, `video-compare`).
O que vale pra todos: **verifique com screenshot antes de entregar** (Playwright
em `host.html?project=<slug>`, `window.SG.seek(t)`, viewport do tipo), não
confie no JSON parecer certo.

## Fatos que não estão no código

- Fontes Inter + JetBrains Mono estão em `web/fonts/`, baixadas. Não dependa de
  fonte do sistema — a máquina só tem DejaVu/Liberation/Ubuntu.
- Render de referência: 104s / 2617 frames em ~85s com `--workers 6` (RTX 4080S).
