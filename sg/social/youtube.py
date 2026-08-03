"""YouTube Shorts via YouTube Data API v3.

Setup (uma vez):
  1. Google Cloud Console → projeto → ativar "YouTube Data API v3".
  2. Credentials → OAuth client ID → Desktop app → baixar o JSON em
     ~/.config/social-generator/youtube-client.json
  3. ./sg.sh publish <slug> --to youtube  → na primeira vez imprime a URL de
     autorização; cole o código de volta. O refresh token fica salvo.

Vertical + ≤3min = o YouTube classifica como Short sozinho.
"""
from __future__ import annotations

from pathlib import Path

from .common import (CONFIG_DIR, PublishError, PublishSpec, load_token,
                     save_token, validate_vertical)

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]
MAX_SECONDS = 180


def _credentials():
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
    except ImportError as e:
        raise PublishError(
            "dependências do YouTube ausentes — rode: "
            ".venv/bin/pip install google-api-python-client google-auth-oauthlib") from e

    stored = load_token("youtube-token")
    if stored:
        creds = Credentials.from_authorized_user_info(stored, SCOPES)
        if creds.valid:
            return creds
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            save_token("youtube-token", {
                "token": creds.token, "refresh_token": creds.refresh_token,
                "client_id": creds.client_id, "client_secret": creds.client_secret,
                "token_uri": creds.token_uri, "scopes": SCOPES,
            })
            return creds

    client = CONFIG_DIR / "youtube-client.json"
    if not client.exists():
        raise PublishError(f"OAuth client não encontrado em {client} (veja sg/social/youtube.py)")
    flow = InstalledAppFlow.from_client_secrets_file(str(client), SCOPES)
    # WSL/headless: sobe um listener local e imprime a URL pro Lucas abrir.
    creds = flow.run_local_server(port=0, open_browser=False,
                                  authorization_prompt_message="abra no navegador: {url}")
    save_token("youtube-token", {
        "token": creds.token, "refresh_token": creds.refresh_token,
        "client_id": creds.client_id, "client_secret": creds.client_secret,
        "token_uri": creds.token_uri, "scopes": SCOPES,
    })
    return creds


def publish(video: Path, spec: PublishSpec, dry_run: bool = False) -> dict:
    info = validate_vertical(video, MAX_SECONDS, "youtube")
    if dry_run:
        return {"platform": "youtube", "dry_run": True, **info}

    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload

    yt = build("youtube", "v3", credentials=_credentials())
    body = {
        "snippet": {
            "title": spec.title[:100] or video.stem,
            "description": spec.caption_with_tags,
            "categoryId": "28",  # Science & Technology
        },
        "status": {"privacyStatus": "public", "selfDeclaredMadeForKids": False},
    }
    media = MediaFileUpload(str(video), mimetype="video/mp4",
                            chunksize=8 * 1024 * 1024, resumable=True)
    req = yt.videos().insert(part="snippet,status", body=body, media_body=media)
    resp = None
    while resp is None:
        status, resp = req.next_chunk()
        if status:
            print(f"  youtube: {int(status.progress() * 100)}%")
    vid = resp["id"]
    return {"platform": "youtube", "id": vid, "url": f"https://youtube.com/shorts/{vid}"}
