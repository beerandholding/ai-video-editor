---
name: video-split
description: Montar reel tipo "split" no social-generator — formato 50/50 com topo gerado e o Lucas falando embaixo. Use SEMPRE que for editar/criar timeline de um projeto split (default de projetos sem "type"), cortar fala, ou ancorar animação em transcript.
---

# Vídeo tipo `split` (50/50)

Formato original: metade de cima gerada (cenas HTML/canvas), metade de baixo o
vídeo do Lucas falando, com transcrição por palavra. `timeline.type: "split"`
(ou ausente). Canvas das cenas: **1080×960** (metade de cima).

## Fluxo

1. `./sg.sh new video.mp4` — importa e transcreve (whisper large-v3).
2. Ouça a transcrição procurando repetição, engasgo, contradição → proponha cortes.
3. Corte, depois monte o timeline, depois revise com screenshot.

## Cortar antes de montar

O Lucas grava errando e repetindo de propósito — **cortar é parte do trabalho,
não exceção.**

```bash
./sg.sh clips <slug> --cut 44.0-44.74 --cut 47.02-48.2   # tempos DA FONTE
```

O comando remapeia segmentos e recalcula `duration` sozinho. Ele lista quais
segmentos mudaram de duração — **confira esses**: `delay`/`cps`/`dur` internos
foram calculados pro tamanho antigo (armadilha do typewriter).

- Corte de respiração ("jcut" aprovado): `silencedetect -27dB` pega respiração,
  o whisper mente nas bordas; deixe folga de 60–120ms.
- `start`/`end` de segmento = tempo de TIMELINE (já cortado). `source.clips` e
  `transcript.json` = tempo de FONTE. Pra converter, `clips.to_timeline()` —
  nunca misture na mão.

## Montar o timeline

1. Leia `projects/<slug>/transcript.json` — timestamp por palavra.
2. Pausas > 0.7s entre palavras = fronteiras naturais de segmento.
3. Ancore cada animação na palavra que ela ilustra, não em tempo redondo.
4. Cena `stat`: alinhe o fim da contagem ao instante em que ele FALA o número.
5. Cena `code`: typewriter tem que acabar antes do fim do segmento
   (`delay + total_chars/cps < duração`).
6. Verifique com screenshot (viewport **1080×960**, `window.SG.seek(t)`) antes
   de entregar.

Ritmo, invariantes de `seek(t)` puro e armadilhas gerais: ver `CLAUDE.md`.
