"""Fluxos OAuth das 3 plataformas, disparados pela UI do preview.

O server expõe /oauth/{plataforma} → redirect pro provedor → callback local
troca o code e salva o token em ~/.config/social-generator/. Depois disso os
drivers publicam sem pedir login de novo (refresh automático onde existe).

Apps (uma vez, no .env da raiz):
  YouTube  — OAuth client (tipo Web) do Google Cloud com a YouTube Data API v3;
             GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, redirect
             http://localhost:8420/oauth/youtube/callback
  Instagram— app Meta com instagram_content_publish; META_APP_ID / META_APP_SECRET,
             mesmo redirect com /oauth/instagram/callback
  TikTok   — app com Content Posting API; TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET,
             redirect /oauth/tiktok/callback
"""
from __future__ import annotations

import hashlib
import os
import secrets
import time
from urllib.parse import urlencode

import requests

from .common import PublishError, load_env, load_token, save_token

GRAPH = "https://graph.facebook.com/v21.0"
YT_SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]


def _env(*keys: str) -> list[str | None]:
    load_env()
    return [os.environ.get(k) for k in keys]


def status() -> dict:
    """connected = token salvo; configured = app/credenciais presentes pro login."""
    gid, gsec = _env("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET")
    mid, msec = _env("META_APP_ID", "META_APP_SECRET")
    tkey, tsec = _env("TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET")
    yt_tok = load_token("youtube-token")
    ig_tok = load_token("instagram-token")
    tt_tok = load_token("tiktok-token")
    return {
        "youtube": {"connected": bool(yt_tok and yt_tok.get("refresh_token")),
                    "configured": bool(gid and gsec)},
        "instagram": {"connected": bool(ig_tok and ig_tok.get("access_token")
                                        and ig_tok.get("ig_user_id")),
                      "configured": bool(mid and msec)},
        "tiktok": {"connected": bool(tt_tok and tt_tok.get("refresh_token")),
                   "configured": bool(tkey and tsec)},
    }


def auth_url(platform: str, redirect_uri: str, state: str,
             scopes: str | None = None) -> str:
    if platform == "youtube":
        cid, = _env("GOOGLE_CLIENT_ID")
        if not cid:
            raise PublishError("GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET faltando no .env")
        return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode({
            "client_id": cid, "redirect_uri": redirect_uri, "response_type": "code",
            "scope": " ".join(YT_SCOPES), "access_type": "offline",
            "prompt": "consent", "state": state,
        })
    if platform == "instagram":
        mid, = _env("META_APP_ID")
        if not mid:
            raise PublishError("META_APP_ID/META_APP_SECRET faltando no .env")
        return "https://www.facebook.com/v21.0/dialog/oauth?" + urlencode({
            "client_id": mid, "redirect_uri": redirect_uri, "response_type": "code",
            "scope": "instagram_basic,instagram_content_publish,"
                     "pages_show_list,business_management",
            "state": state,
        })
    if platform == "tiktok":
        tkey, = _env("TIKTOK_CLIENT_KEY")
        if not tkey:
            raise PublishError("TIKTOK_CLIENT_KEY/TIKTOK_CLIENT_SECRET faltando no .env")
        # video.publish (Direct Post) exige aprovação do TikTok; sem ela o app
        # só tem video.upload (rascunho na inbox). Aprovado o Direct Post,
        # ponha TIKTOK_SCOPES=user.info.basic,video.upload,video.publish no
        # .env e reconecte pela UI.
        # PKCE obrigatório no Login Kit web — atenção: o TikTok usa o hash
        # SHA256 em HEX no code_challenge, não base64url como o RFC 7636.
        verifier = secrets.token_urlsafe(48)
        save_token("tiktok-pkce", {"verifier": verifier})
        challenge = hashlib.sha256(verifier.encode()).hexdigest()
        return "https://www.tiktok.com/v2/auth/authorize/?" + urlencode({
            "client_key": tkey, "redirect_uri": redirect_uri, "response_type": "code",
            "scope": scopes or os.environ.get("TIKTOK_SCOPES",
                                              "user.info.basic,video.upload"),
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        })
    raise PublishError(f"plataforma desconhecida: {platform}")


def exchange(platform: str, code: str, redirect_uri: str) -> None:
    if platform == "youtube":
        _exchange_youtube(code, redirect_uri)
    elif platform == "instagram":
        _exchange_instagram(code, redirect_uri)
    elif platform == "tiktok":
        _exchange_tiktok(code, redirect_uri)
    else:
        raise PublishError(f"plataforma desconhecida: {platform}")


def _exchange_youtube(code: str, redirect_uri: str) -> None:
    cid, csec = _env("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET")
    r = requests.post("https://oauth2.googleapis.com/token", data={
        "client_id": cid, "client_secret": csec, "code": code,
        "grant_type": "authorization_code", "redirect_uri": redirect_uri,
    }, timeout=30)
    d = r.json()
    if not r.ok or "refresh_token" not in d:
        raise PublishError(f"youtube: troca do code falhou — {d}")
    save_token("youtube-token", {
        "token": d["access_token"], "refresh_token": d["refresh_token"],
        "client_id": cid, "client_secret": csec,
        "token_uri": "https://oauth2.googleapis.com/token", "scopes": YT_SCOPES,
    })


def _exchange_instagram(code: str, redirect_uri: str) -> None:
    mid, msec = _env("META_APP_ID", "META_APP_SECRET")
    r = requests.get(f"{GRAPH}/oauth/access_token", params={
        "client_id": mid, "client_secret": msec,
        "redirect_uri": redirect_uri, "code": code}, timeout=30)
    d = r.json()
    if "access_token" not in d:
        raise PublishError(f"instagram: troca do code falhou — {d}")
    # token curto → longo (60 dias)
    r = requests.get(f"{GRAPH}/oauth/access_token", params={
        "grant_type": "fb_exchange_token", "client_id": mid,
        "client_secret": msec, "fb_exchange_token": d["access_token"]}, timeout=30)
    d = r.json()
    if "access_token" not in d:
        raise PublishError(f"instagram: long-lived token falhou — {d}")
    token = d["access_token"]
    # acha a conta IG business ligada a alguma página do usuário
    r = requests.get(f"{GRAPH}/me/accounts", params={
        "fields": "name,instagram_business_account", "access_token": token}, timeout=30)
    pages = r.json().get("data", [])
    ig = next((p["instagram_business_account"]["id"] for p in pages
               if p.get("instagram_business_account")), None)
    if not ig:
        raise PublishError(
            "instagram: nenhuma conta IG Business ligada às suas páginas — "
            "vincule a conta a uma Página do Facebook antes")
    save_token("instagram-token", {
        "access_token": token, "ig_user_id": ig,
        "expires_at": time.time() + d.get("expires_in", 60 * 86400),
    })


def _exchange_tiktok(code: str, redirect_uri: str) -> None:
    tkey, tsec = _env("TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET")
    pkce = load_token("tiktok-pkce") or {}
    r = requests.post("https://open.tiktokapis.com/v2/oauth/token/", data={
        "client_key": tkey, "client_secret": tsec, "code": code,
        "grant_type": "authorization_code", "redirect_uri": redirect_uri,
        "code_verifier": pkce.get("verifier", ""),
    }, headers={"Content-Type": "application/x-www-form-urlencoded"}, timeout=30)
    d = r.json()
    if "access_token" not in d:
        raise PublishError(f"tiktok: troca do code falhou — {d}")
    save_token("tiktok-token", {
        "access_token": d["access_token"], "refresh_token": d["refresh_token"],
        "expires_at": time.time() + int(d.get("expires_in", 86400)),
        "open_id": d.get("open_id"),
        "scope": d.get("scope", ""),
    })
