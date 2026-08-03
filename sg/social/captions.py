"""Gera descrições por rede social a partir do transcript, no padrão da casa.

Padrão (extraído de blog-posts/descricao-reels-fable5.txt, aprovado pelo Lucas):
- Instagram: gancho de dor em 1 linha + emoji, história curta, lista de dores
  com emojis (🔥🤡🌀), virada, punchline "IA sem engenharia é X", CTA
  "👉 Segue o @beerandcode".
- TikTok: 1 parágrafo seco com a mesma virada + CTA @beerandcode 🍺.
- YouTube: título de curiosidade + hashtags com #shorts.
- Hashtags separadas por plataforma (IG nicho+brand, TikTok techtok/foryou).

Requer ANTHROPIC_API_KEY no ambiente/.env (ou perfil do `ant auth login`).
"""
from __future__ import annotations

import json

from .common import PublishError, load_env

MODEL = "claude-opus-5"

SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "título interno/base do post"},
        "caption_instagram": {"type": "string"},
        "caption_tiktok": {"type": "string"},
        "title_youtube": {"type": "string"},
        "hashtags_instagram": {"type": "array", "items": {"type": "string"}},
        "hashtags_youtube": {"type": "array", "items": {"type": "string"}},
        "hashtags_tiktok": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["title", "caption_instagram", "caption_tiktok", "title_youtube",
                 "hashtags_instagram", "hashtags_youtube", "hashtags_tiktok"],
    "additionalProperties": False,
}

EXEMPLO = '''=== INSTAGRAM (post sobre a Conjectura Jacobiana) ===
"IA não funciona no meu projeto." Será? ⚽🧠

Enquanto o mundo via a final da Copa, um pesquisador passou uma manhã conversando com o Fable 5 e derrubou uma conjectura matemática aberta desde 1939. 87 anos. Resolvida numa conversa.

Aí você olha pro seu dia a dia e a história é outra:

🔥 A IA queima tokens como se fosse de graça — e a fatura chega
🤡 Gera código que compila mas não faz sentido nenhum no seu contexto
🌀 Se perde no seu projeto: inventa arquivo, ignora padrão, refatora o que ninguém pediu

E a conclusão fácil é "IA não serve pra projeto de verdade".

Só que a mesma ferramenta que "não dá conta" do seu CRUD acabou de resolver o que gerações de matemáticos não resolveram. A diferença não está no modelo. Está em quem opera: contexto certo, padrão definido, escopo fechado, orquestração.

IA sem engenharia é estagiário com amnésia. IA com engenharia derruba problema de 87 anos.

A ferramenta já está pronta. O que falta é você aprender a orquestrar.

👉 Segue o @beerandcode e aprenda Engenharia de IA de verdade.

=== TIKTOK (mesmo post) ===
Sua IA queima tokens, gera código sem sentido e se perde no seu projeto. A mesma IA resolveu em uma manhã um problema aberto desde 1939. O problema não é o modelo — é a falta de orquestração. Segue o @beerandcode 🍺

=== HASHTAGS ===
Instagram: inteligenciaartificial ia engenhariadeia claudeai llm programacao desenvolvedor devbrasil codigolimpo produtividadedev carreiraemti beerandcode
YouTube: inteligenciaartificial ia programacao dev shorts
TikTok: ia inteligenciaartificial techtok programacao dev devbrasil vidadeprogramador aprendanotiktok ia2026 foryou'''


def generate(transcript_text: str, duration: float, keywords: list[dict] | None = None,
             model: str = MODEL) -> dict:
    load_env()
    try:
        import anthropic
    except ImportError as e:
        raise PublishError("rode: .venv/bin/pip install anthropic") from e

    kw = ""
    if keywords:
        kw = "\nPALAVRAS-CHAVE (volume de busca mensal no Brasil via DataForSEO — use as de maior volume no texto/hashtags quando encaixarem naturalmente):\n" + \
             "\n".join(f"- {k['keyword']} ({k['volume']}/mês)" for k in keywords[:12])

    prompt = f"""Você escreve as descrições de redes sociais dos reels do Lucas (Beer And Code — maior comunidade de engenharia de IA do Brasil). Público: desenvolvedores brasileiros. Tom: provocação com prova, dor antes da solução, zero corporativês.

PADRÃO DA CASA (exemplo real aprovado — siga a ESTRUTURA, não copie o texto):
{EXEMPLO}

Regras:
- Instagram: gancho de dor entre aspas ou pergunta + 1-2 emojis; história do vídeo em 2-3 frases; lista de 3 dores do dev com emojis; virada conectando ao conteúdo do vídeo; punchline no formato "X sem Y é A. X com Y é B."; CTA "👉 Segue o @beerandcode".
- TikTok: 1 parágrafo, máx 280 chars, termina com "Segue o @beerandcode 🍺".
- Título YouTube: curiosity gap, máx 90 chars, sem clickbait vazio — a promessa tem que estar no vídeo.
- Hashtags: 10-12 IG (nicho + beerandcode), 5 YouTube (incluir shorts), 8-10 TikTok (incluir techtok e foryou). Sem #.
- Fatos só do transcript — não invente números nem claims.{kw}

TRANSCRIPT DO VÍDEO ({duration:.0f}s):
{transcript_text}"""

    client = anthropic.Anthropic()
    try:
        response = client.messages.create(
            model=model,
            max_tokens=16000,
            output_config={"format": {"type": "json_schema", "schema": SCHEMA}},
            messages=[{"role": "user", "content": prompt}],
        )
    except TypeError as e:
        if "authentication" in str(e):
            raise PublishError(
                "sem credencial da Anthropic — põe ANTHROPIC_API_KEY no .env da raiz "
                "(ou roda `ant auth login`)") from e
        raise
    except anthropic.AuthenticationError as e:
        raise PublishError(f"captions: chave da Anthropic inválida — {e.message}") from e
    if response.stop_reason == "refusal":
        raise PublishError("captions: o modelo recusou a geração (stop_reason=refusal)")
    text = next(b.text for b in response.content if b.type == "text")
    return json.loads(text)


def to_publish_spec(gen: dict) -> dict:
    """Mapeia a saída do modelo pro formato do publish.json."""
    return {
        "title": gen["title"],
        "caption": gen["caption_instagram"],
        "hashtags": gen["hashtags_instagram"],
        "overrides": {
            "youtube": {
                "title": gen["title_youtube"],
                "hashtags": gen["hashtags_youtube"],
            },
            "tiktok": {
                "caption": gen["caption_tiktok"],
                "hashtags": gen["hashtags_tiktok"],
            },
        },
    }
