# jacobiana — estado

Reel sobre o contraexemplo da Conjectura Jacobiana (Alpöge + Fable 5, julho/2026).
Segunda gravação, feita em 28/07/2026. Fonte **1080×1920 nativo, 15 Mbps** — sem
upscale, ao contrário da primeira tentativa.

Timeline com 14 segmentos sobre 84.87s (fonte 92.13s, 7.27s cortados).

## Cortes aplicados (`source.clips`)

| fonte | por quê |
|---|---|
| `0 – 0.45` | ar morto antes da primeira palavra |
| `12.80 – 13.65` | pausa de 1.48s encurtada pra 0.63s |
| `30.45 – 32.10` | pausa de 2.35s encurtada pra 0.70s |
| `63.85 – 66.95` | **frase quebrada** — ver abaixo |
| `90.90 – 92.13` | "E aí" solto no fim |

O corte de `63.85` é o importante. Ele fala "A prova agora está em fase de
revisão", para **1.71s em silêncio**, e volta com "pela unidade" — que não quer
dizer nada (provavelmente ia falar "comunidade"). Cortar o silêncio + as duas
palavras deixa a frase inteira e correta: *"A prova agora está em fase de
revisão."* Verificado re-transcrevendo o áudio já colado.

Falso alarme conferido: o whisper transcreveu "encontrou uma corrente" aos 52.8s.
Isolando o trecho, ele fala **"encontrou um contraexemplo"**. Não é erro de fala,
é artefato de transcrição. Não cortar.

## A conferir antes de publicar

- **87 vs 90 anos.** Keller propôs em **1939** → são 87 anos. Ele fala "quase 90"
  (ok) e depois "90 anos" três vezes (arredondado pra cima). A tela nunca mostra
  87: no gancho mostra **"DE 1939"** (fato duro) e aos 65s mostra **"90 ANOS"**,
  acompanhando a fala. Sem contradição na tela — mas o número é 87.
- **"rodou em um harness de agentes, explorou cenários absurdos"** — caracterização
  dele de como o Fable trabalhou. **Não verifiquei essa parte.** O resto dos fatos
  (Harvard, final da Copa, refutação, sem peer review) foi verificado na sessão
  anterior.
- O vídeo não menciona que a refutação vale para **n ≥ 3** e que **n = 2 continua
  aberto**. Cabe numa tela extra se ele quiser.

## Densidade

Primeira versão tinha 14 segmentos e **seis buracos de 2–4s** sem nada
acontecendo — o pior era 53.9–58.9s, imagem parada por 3.5s. Ele reprovou.

Versão atual: **24 segmentos, 114 eventos, 1 a cada 0.74s.** Os trechos que ainda
passam de 1.5s entre eventos são justamente onde a `warp` está animando
(esticando, desfazendo, dobrando) — ali o movimento é contínuo.

## Cenas novas: `popwords`, `pulse`, `burst`

- **`popwords`** — cada frase entra no instante da palavra correspondente. É o que
  transformou frases de 4s em 4 eventos.
- **`pulse`** — partículas + anéis por baixo de tudo, pra nenhum frame ser estático.
- **`burst`** — explosão radial nas palavras de impacto ("PAROU", "DERRUBOU",
  "CONTRAEXEMPLO", "LEGADO?", "CERTO").

**A conferir:** o `popwords` põe as palavras dele na tela. Não é legenda corrida
(são 3–4 frases por segmento, escolhidas), mas contraria a decisão original de
"legendas: não, só o topo". Se ficar demais, é só reduzir as entradas de `words`.

## Cena nova: `warp`

Construída pra este vídeo, é o visual que carrega a explicação inteira.

- `mode: "stretch"` — deformação linear com giro. Sempre invertível. É o "pode
  esticar e girar o quanto quiser".
- `mode: "fold"` — `u = lerp(x, (x³−3x)/2, k)`. Deixa de ser injetora em k > 0.4;
  em k = 1, **x = 2 e x = −1 caem os dois em u = 1**. Os dois pontos coloridos
  são exatamente esse par. A faixa que virou do avesso fica vermelha.
- `reverseDelay` desfaz a deformação — usado aos 37.6s pra ilustrar "daria para
  desfazer o movimento perfeitamente".

Nada aqui é inventado: a matemática do dobramento é real e o par de pontos que
colide é calculável do próprio mapa.

## Estado

Não renderizado. Timeline verificado por screenshot em 39 instantes.
