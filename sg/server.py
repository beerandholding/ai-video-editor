"""Preview server: static host + timeline API + hot reload + render trigger."""
from __future__ import annotations

import asyncio
import json
import shutil
import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from . import render as render_mod
from .project import (
    PROJECTS,
    WEB,
    Project,
    default_timeline,
    list_projects,
    probe,
    slugify,
)

app = FastAPI(title="social-generator")
PORT = 8420  # set by serve()


@app.middleware("http")
async def _no_cache(request, call_next):
    """Preview nunca pode rodar código velho: um .js de cache quebra o
    'o que você vê é o que sai' sem nenhum erro aparente."""
    resp = await call_next(request)
    if request.url.path.endswith((".js", ".css", ".html")) or request.url.path == "/":
        resp.headers["Cache-Control"] = "no-store"
    return resp


# ---------------------------------------------------------------- live reload


class Hub:
    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()
        self.loop: asyncio.AbstractEventLoop | None = None

    async def join(self, ws: WebSocket) -> None:
        await ws.accept()
        self.clients.add(ws)

    def leave(self, ws: WebSocket) -> None:
        self.clients.discard(ws)

    async def send(self, msg: dict) -> None:
        dead = []
        for ws in list(self.clients):
            try:
                await ws.send_text(json.dumps(msg))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.leave(ws)

    def send_threadsafe(self, msg: dict) -> None:
        if self.loop:
            asyncio.run_coroutine_threadsafe(self.send(msg), self.loop)


hub = Hub()


def _watch() -> None:
    """Any change under web/ or projects/*/timeline.json reloads open players."""
    from watchfiles import watch

    for changes in watch(str(WEB), str(PROJECTS), raise_interrupt=False):
        paths = [Path(p) for _, p in changes]
        if all(p.suffix in (".png", ".mp4", ".wav") or p.name == "publish.json"
               for p in paths):
            continue  # render artefacts e estado de publicação, não fontes
        kind = "timeline" if any(p.name == "timeline.json" for p in paths) else "code"
        hub.send_threadsafe({"type": "reload", "kind": kind,
                             "files": [p.name for p in paths][:8]})


@app.on_event("startup")
async def _startup() -> None:
    hub.loop = asyncio.get_running_loop()
    threading.Thread(target=_watch, daemon=True).start()
    threading.Thread(target=_scheduler, daemon=True).start()


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    await hub.join(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        hub.leave(ws)


# ---------------------------------------------------------------- api


def _proj(slug: str) -> Project:
    p = Project(slug)
    if not p.exists():
        raise HTTPException(404, f"unknown project '{slug}'")
    return p


@app.get("/api/projects")
def api_projects() -> dict:
    out = []
    for slug in list_projects():
        p = Project(slug)
        tl = p.load_timeline()
        out.append({
            "slug": slug,
            "duration": tl.get("duration"),
            "segments": len(tl.get("segments", [])),
            "has_transcript": p.transcript_path.exists(),
        })
    return {"projects": out}


@app.get("/api/project/{slug}/timeline")
def api_timeline(slug: str) -> dict:
    return _proj(slug).load_timeline()


@app.post("/api/project/{slug}/timeline")
async def api_save_timeline(slug: str, tl: dict) -> dict:
    _proj(slug).save_timeline(tl)
    return {"ok": True}


@app.get("/api/project/{slug}/transcript")
def api_transcript(slug: str) -> dict:
    return _proj(slug).load_transcript()


@app.get("/media/{slug}/source.mp4")
def media_source(slug: str) -> FileResponse:
    return FileResponse(_proj(slug).source, media_type="video/mp4")


@app.get("/media/{slug}/out/{name}")
def media_out(slug: str, name: str) -> FileResponse:
    f = _proj(slug).out / name
    if not f.exists():
        raise HTTPException(404, name)
    return FileResponse(f, media_type="video/mp4")


@app.get("/assets/{slug}/{name:path}")
def assets(slug: str, name: str) -> FileResponse:
    f = (_proj(slug).assets / name).resolve()
    if not f.is_file() or _proj(slug).assets.resolve() not in f.parents:
        raise HTTPException(404, name)
    return FileResponse(f)


@app.post("/api/upload")
async def api_upload(file: UploadFile, slug: str | None = None) -> dict:
    name = slug or slugify(Path(file.filename or "video").stem)
    proj = Project(name)
    n, base = 1, name
    while proj.exists():
        n += 1
        proj = Project(f"{base}-{n}")
    proj.ensure_dirs()
    with proj.source.open("wb") as fh:
        shutil.copyfileobj(file.file, fh)
    meta = probe(proj.source)
    proj.save_timeline(default_timeline(meta, meta["duration"]))
    hub.send_threadsafe({"type": "projects-changed"})
    return {"slug": proj.slug, "meta": meta}


@app.post("/api/project/{slug}/render")
async def api_render(slug: str, workers: int = 4, nvenc: bool = True) -> JSONResponse:
    proj = _proj(slug)

    def progress(stage: str, pct: float) -> None:
        hub.send_threadsafe({"type": "render", "stage": stage, "pct": pct})

    def work() -> None:
        try:
            out = render_mod.render(proj, PORT, workers=workers, nvenc=nvenc,
                                    progress=progress)
            hub.send_threadsafe({"type": "render", "stage": "done", "pct": 1.0,
                                 "url": f"/media/{slug}/out/{out.name}"})
        except Exception as exc:  # surfaced in the player's status bar
            hub.send_threadsafe({"type": "render", "stage": "error", "pct": 0.0,
                                 "error": str(exc)})

    threading.Thread(target=work, daemon=True).start()
    return JSONResponse({"started": True})


# ---------------------------------------------------------------- publicação


@app.get("/api/project/{slug}/publish")
def api_publish_state(slug: str) -> dict:
    from .publish import find_video, load_spec
    from .social.oauth import status as oauth_status

    proj = _proj(slug)
    video = find_video(proj)
    data = load_spec(proj)
    return {
        "video": ({"name": video.name, "url": f"/media/{slug}/out/{video.name}",
                   "size": video.stat().st_size} if video else None),
        "connected": oauth_status(),
        "spec": {k: data[k] for k in ("title", "caption", "hashtags", "overrides")},
        "results": data["results"],
        "scheduled": data.get("scheduled"),
    }


@app.post("/api/project/{slug}/publish")
async def api_publish(slug: str, body: dict) -> dict:
    from .publish import load_spec, save_spec

    proj = _proj(slug)
    platforms = body.get("platforms") or []
    when = body.get("when")  # null = agora; ISO-8601 = agendar
    if not platforms:
        raise HTTPException(400, "nenhuma plataforma selecionada")
    data = load_spec(proj)
    if not data["title"] and not data["caption"]:
        raise HTTPException(400, "publish.json sem descrição — gere as captions antes")

    if when:
        data["scheduled"] = {"at": when, "platforms": platforms}
        save_spec(proj, data)
        hub.send_threadsafe({"type": "publish", "slug": slug, "stage": "scheduled",
                             "at": when, "platforms": platforms})
        return {"scheduled": when}

    threading.Thread(target=_publish_work, args=(slug, platforms), daemon=True).start()
    return {"started": True}


def _publish_work(slug: str, platforms: list[str], force: bool = False) -> None:
    from .publish import run_platform
    from .social.common import PublishError

    proj = Project(slug)
    for name in platforms:
        hub.send_threadsafe({"type": "publish", "slug": slug,
                             "platform": name, "stage": "uploading"})
        try:
            res = run_platform(proj, name, force=force)
            hub.send_threadsafe({"type": "publish", "slug": slug, "platform": name,
                                 "stage": "skipped" if res.get("skipped") else "done",
                                 "url": res.get("url") or "", "id": res.get("id") or ""})
        except PublishError as exc:
            hub.send_threadsafe({"type": "publish", "slug": slug, "platform": name,
                                 "stage": "error", "error": str(exc)})
        except Exception as exc:  # driver quebrou de um jeito inesperado
            hub.send_threadsafe({"type": "publish", "slug": slug, "platform": name,
                                 "stage": "error", "error": f"{type(exc).__name__}: {exc}"})


def _scheduler() -> None:
    """A cada 30s procura agendamentos vencidos e publica."""
    import time as _time
    from datetime import datetime, timezone

    from .publish import load_spec, save_spec

    while True:
        _time.sleep(30)
        try:
            for slug in list_projects():
                proj = Project(slug)
                data = load_spec(proj)
                sched = data.get("scheduled")
                if not sched:
                    continue
                due = datetime.fromisoformat(sched["at"].replace("Z", "+00:00"))
                if due > datetime.now(timezone.utc):
                    continue
                data["scheduled"] = None
                save_spec(proj, data)
                _publish_work(slug, sched["platforms"])
        except Exception:
            pass  # nunca derruba o server por causa do scheduler


@app.post("/api/project/{slug}/publish/cancel")
async def api_publish_cancel(slug: str) -> dict:
    from .publish import load_spec, save_spec

    proj = _proj(slug)
    data = load_spec(proj)
    data["scheduled"] = None
    save_spec(proj, data)
    return {"ok": True}


# ---------------------------------------------------------------- oauth


def _oauth_redirect(platform: str) -> str:
    """Plataformas que recusam http://localhost (TikTok) usam um túnel HTTPS:
    ponha p.ex. TIKTOK_OAUTH_BASE=https://xxx.trycloudflare.com no .env e
    registre <base>/oauth/tiktok/callback no app. O túnel só precisa existir
    na hora do login — o refresh do token não passa pelo redirect."""
    import os

    from .social.common import load_env, load_token

    load_env()
    stored = load_token(f"{platform}-oauth-base") or {}
    base = (os.environ.get(f"{platform.upper()}_OAUTH_BASE")
            or stored.get("base")
            or f"http://localhost:{PORT}").rstrip("/")
    return f"{base}/oauth/{platform}/callback"


@app.get("/oauth/{platform}")
def oauth_start(platform: str, scopes: str | None = None) -> RedirectResponse:
    from .social.common import PublishError
    from .social.oauth import auth_url

    try:
        return RedirectResponse(auth_url(platform, _oauth_redirect(platform),
                                         state="sg", scopes=scopes))
    except PublishError as e:
        raise HTTPException(400, str(e))


@app.get("/oauth/{platform}/callback")
def oauth_callback(platform: str, code: str | None = None,
                   error: str | None = None) -> JSONResponse:
    from fastapi.responses import HTMLResponse

    from .social.common import PublishError
    from .social.oauth import exchange

    if error or not code:
        return HTMLResponse(f"<h2>login cancelado: {error or 'sem code'}</h2>", 400)
    try:
        exchange(platform, code, _oauth_redirect(platform))
    except PublishError as e:
        return HTMLResponse(f"<h2>falhou: {e}</h2>", 400)
    hub.send_threadsafe({"type": "oauth", "platform": platform, "connected": True})
    return HTMLResponse(
        "<body style='font-family:sans-serif;background:#0b0b0e;color:#eee;"
        "display:grid;place-items:center;height:100vh'>"
        f"<h2>{platform} conectado ✓ — pode fechar esta aba</h2></body>")


# ---------------------------------------------------------------- static


@app.get("/")
def index() -> RedirectResponse:
    return RedirectResponse("/player.html")


app.mount("/", StaticFiles(directory=str(WEB), html=True), name="web")


def serve(port: int = 8420, host: str = "127.0.0.1") -> None:
    global PORT
    PORT = port
    import uvicorn

    uvicorn.run(app, host=host, port=port, log_level="warning")
