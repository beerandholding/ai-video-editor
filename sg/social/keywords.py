"""Pesquisa de palavra-chave via DataForSEO — pra calibrar título/legenda/hashtag.

Credenciais: DATAFORSEO_USERNAME/DATAFORSEO_PASSWORD no ambiente ou .env; se
ausentes, cai no .mcp.json do seo-report do blog (mesma conta).
"""
from __future__ import annotations

import base64
import json
import os
from pathlib import Path

import requests

from .common import PublishError, load_env

API = "https://api.dataforseo.com/v3"
BLOG_MCP = Path("/home/lucas/projects/beerandholding/blog-posts/.mcp.json")


def _auth() -> str:
    load_env()
    user = os.environ.get("DATAFORSEO_USERNAME")
    pwd = os.environ.get("DATAFORSEO_PASSWORD")
    if not (user and pwd) and BLOG_MCP.exists():
        env = json.loads(BLOG_MCP.read_text())["mcpServers"]["dataforseo"]["env"]
        user, pwd = env["DATAFORSEO_USERNAME"], env["DATAFORSEO_PASSWORD"]
    if not (user and pwd):
        raise PublishError("sem credenciais DataForSEO (env ou .mcp.json do seo-report)")
    return base64.b64encode(f"{user}:{pwd}".encode()).decode()


def suggest(seed: str, limit: int = 25, min_volume: int = 30) -> list[dict]:
    r = requests.post(
        f"{API}/dataforseo_labs/google/keyword_suggestions/live",
        headers={"Authorization": f"Basic {_auth()}"},
        json=[{
            "keyword": seed,
            "location_name": "Brazil",
            "language_code": "pt",
            "limit": limit,
            "filters": [["keyword_info.search_volume", ">", min_volume]],
        }],
        timeout=60,
    )
    if not r.ok:
        raise PublishError(f"dataforseo: HTTP {r.status_code} — {r.text[:200]}")
    items = (r.json()["tasks"][0].get("result") or [{}])[0].get("items") or []
    out = []
    for it in items:
        info = it.get("keyword_info") or {}
        props = it.get("keyword_properties") or {}
        out.append({
            "keyword": it.get("keyword"),
            "volume": info.get("search_volume"),
            "difficulty": props.get("keyword_difficulty"),
        })
    out.sort(key=lambda x: -(x["volume"] or 0))
    return out
