"""TikTok via Content Posting API (direct post, FILE_UPLOAD em chunks).

Setup (uma vez):
  1. App em developers.tiktok.com com o produto "Content Posting API" aprovado
     (a Meta aprova na hora; o TikTok audita — leva alguns dias).
  2. OAuth com escopo video.publish → access token + refresh token.
     Guarde em ~/.config/social-generator/tiktok-token.json:
       {"access_token": "...", "refresh_token": "...", "expires_at": 0}
  3. No .env:  TIKTOK_CLIENT_KEY=...  TIKTOK_CLIENT_SECRET=...  (pro refresh)

Enquanto o app não for auditado, o post entra como SELF_ONLY (privado) — é
limitação do TikTok para apps não aprovados, não bug nosso.
"""
from __future__ import annotations

import time
from pathlib import Path

import requests

from .common import (PublishError, PublishSpec, load_token, require_env,
                     save_token, validate_vertical)

API = "https://open.tiktokapis.com/v2"
MAX_SECONDS = 600
CHUNK = 10 * 1024 * 1024  # 10MB — dentro da regra 5–64MB


def _access_token() -> str:
    tok = load_token("tiktok-token")
    if not tok:
        raise PublishError(
            "tiktok: sem token em ~/.config/social-generator/tiktok-token.json "
            "(veja sg/social/tiktok.py)")
    if tok.get("expires_at", 0) > time.time() + 60:
        return tok["access_token"]
    key, secret = require_env("TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET")
    r = requests.post("https://open.tiktokapis.com/v2/oauth/token/", data={
        "client_key": key, "client_secret": secret,
        "grant_type": "refresh_token", "refresh_token": tok["refresh_token"],
    }, timeout=30)
    if not r.ok or "access_token" not in r.json():
        raise PublishError(f"tiktok: refresh do token falhou — {r.text[:300]}")
    data = r.json()
    save_token("tiktok-token", {
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token", tok["refresh_token"]),
        "expires_at": time.time() + int(data.get("expires_in", 86400)),
    })
    return data["access_token"]


def publish(video: Path, spec: PublishSpec, dry_run: bool = False) -> dict:
    info = validate_vertical(video, MAX_SECONDS, "tiktok")
    if dry_run:
        return {"platform": "tiktok", "dry_run": True, **info}
    token = _access_token()
    stored = load_token("tiktok-token") or {}
    # sem o escopo video.publish (Direct Post aprovado), cai pro upload de
    # inbox: o vídeo vira rascunho no app e o Lucas finaliza por lá
    direct = "video.publish" in (stored.get("scope") or "")
    size = info["size"]
    # regra do TikTok: total_chunk_count = floor(size/chunk_size) e o resto
    # é absorvido pelo ÚLTIMO chunk (que pode ter até 128MB). Ceil = erro
    # "total chunk count is invalid". Até 64MB vai inteiro num chunk só.
    if size <= 64 * 1024 * 1024:
        chunks, chunk_size = 1, size
    else:
        chunks, chunk_size = size // CHUNK, CHUNK
    source_info = {
        "source": "FILE_UPLOAD",
        "video_size": size,
        "chunk_size": chunk_size,
        "total_chunk_count": chunks,
    }
    if direct:
        body = {
            "post_info": {
                "title": (spec.caption_with_tags)[:2200],
                "privacy_level": "PUBLIC_TO_EVERYONE",
                "disable_duet": False, "disable_comment": False,
                "disable_stitch": False,
            },
            "source_info": source_info,
        }
        endpoint = f"{API}/post/publish/video/init/"
    else:
        body = {"source_info": source_info}
        endpoint = f"{API}/post/publish/inbox/video/init/"

    r = requests.post(endpoint, json=body,
                      headers={"Authorization": f"Bearer {token}"}, timeout=30)
    data = r.json()
    if not r.ok or data.get("error", {}).get("code") not in (None, "ok"):
        raise PublishError(f"tiktok: init falhou — {data.get('error', r.text[:300])}")
    publish_id = data["data"]["publish_id"]
    upload_url = data["data"]["upload_url"]

    with open(video, "rb") as f:
        sent = 0
        for i in range(chunks):
            # último chunk leva o resto da divisão junto
            this = chunk_size if i < chunks - 1 else size - chunk_size * (chunks - 1)
            blob = f.read(this)
            end = sent + len(blob) - 1
            r = requests.put(upload_url, data=blob, headers={
                "Content-Range": f"bytes {sent}-{end}/{size}",
                "Content-Type": "video/mp4",
            }, timeout=600)
            if r.status_code not in (200, 201, 206):
                raise PublishError(f"tiktok: chunk {i} falhou — HTTP {r.status_code}")
            sent = end + 1
            print(f"  tiktok: {int(sent / size * 100)}%")

    for _ in range(60):
        r = requests.post(f"{API}/post/publish/status/fetch/",
                          json={"publish_id": publish_id},
                          headers={"Authorization": f"Bearer {token}"}, timeout=30)
        st = r.json().get("data", {}).get("status")
        if st == "PUBLISH_COMPLETE":
            return {"platform": "tiktok", "id": publish_id, "url": ""}
        if st == "SEND_TO_USER_INBOX":
            return {"platform": "tiktok", "id": publish_id, "url": "",
                    "note": "rascunho enviado — abra o app do TikTok, o vídeo "
                            "está na sua inbox pra finalizar a postagem"}
        if st in ("FAILED", "PUBLISH_FAILED"):
            raise PublishError(f"tiktok: publicação falhou — {r.json()['data']}")
        time.sleep(5)
    raise PublishError("tiktok: status não concluiu em 5min (fica em processamento no app)")
