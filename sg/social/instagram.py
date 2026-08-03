"""Instagram Reels via Graph API com upload resumable (arquivo local, sem URL pública).

Setup (uma vez):
  1. Conta Instagram Business/Creator vinculada a uma Página do Facebook.
  2. App na Meta (developers.facebook.com) com instagram_content_publish,
     instagram_basic, pages_read_engagement.
  3. No .env:  IG_USER_ID=...  IG_ACCESS_TOKEN=...  (token longo, 60 dias)

Fluxo: cria container REELS resumable → sobe o binário → espera processar →
media_publish. Cota: 25 posts/24h por conta.
"""
from __future__ import annotations

import time
from pathlib import Path

import requests

from .common import (PublishError, PublishSpec, load_env, load_token,
                     require_env, validate_vertical)

GRAPH = "https://graph.facebook.com/v21.0"
RUPLOAD = "https://rupload.facebook.com/ig-api-upload/v21.0"
MAX_SECONDS = 90


def publish(video: Path, spec: PublishSpec, dry_run: bool = False) -> dict:
    info = validate_vertical(video, MAX_SECONDS, "instagram")
    if dry_run:
        return {"platform": "instagram", "dry_run": True, **info}
    stored = load_token("instagram-token")
    if stored:
        ig_user, token = stored["ig_user_id"], stored["access_token"]
        load_env()
    else:
        ig_user, token = require_env("IG_USER_ID", "IG_ACCESS_TOKEN")

    r = requests.post(f"{GRAPH}/{ig_user}/media", data={
        "media_type": "REELS",
        "upload_type": "resumable",
        "caption": spec.caption_with_tags,
        "share_to_feed": "true",
        "access_token": token,
    }, timeout=30)
    _check(r, "criar container")
    container = r.json()["id"]

    with open(video, "rb") as f:
        r = requests.post(f"{RUPLOAD}/{container}", headers={
            "Authorization": f"OAuth {token}",
            "offset": "0",
            "file_size": str(info["size"]),
        }, data=f, timeout=600)
    _check(r, "upload do vídeo")

    # o container processa async; publicar antes de FINISHED falha
    for _ in range(60):
        r = requests.get(f"{GRAPH}/{container}",
                         params={"fields": "status_code", "access_token": token}, timeout=30)
        _check(r, "status do container")
        status = r.json().get("status_code")
        if status == "FINISHED":
            break
        if status == "ERROR":
            raise PublishError("instagram: processamento do vídeo falhou (status ERROR)")
        time.sleep(5)
    else:
        raise PublishError("instagram: container não ficou pronto em 5min")

    r = requests.post(f"{GRAPH}/{ig_user}/media_publish", data={
        "creation_id": container, "access_token": token,
    }, timeout=30)
    _check(r, "media_publish")
    media_id = r.json()["id"]

    r = requests.get(f"{GRAPH}/{media_id}",
                     params={"fields": "permalink", "access_token": token}, timeout=30)
    url = r.json().get("permalink", "") if r.ok else ""
    return {"platform": "instagram", "id": media_id, "url": url}


def _check(r: requests.Response, step: str) -> None:
    if not r.ok:
        try:
            err = r.json().get("error", {}).get("message", r.text[:300])
        except Exception:
            err = r.text[:300]
        raise PublishError(f"instagram: {step} falhou — {err}")
