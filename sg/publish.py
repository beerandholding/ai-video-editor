"""Publica o mp4 renderizado nas redes. Estado em projects/<slug>/publish.json.

publish.json:
{
  "title": "...",
  "caption": "...",
  "hashtags": ["ia", "dev"],
  "overrides": {"youtube": {"title": "..."}},
  "results": {"youtube": {"id": "...", "url": "...", "at": "..."}}
}
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from .project import Project
from .social import DRIVERS
from .social.common import PublishError, PublishSpec

SKELETON = {
    "title": "",
    "caption": "",
    "hashtags": [],
    "overrides": {},
    "results": {},
    # {"at": "2026-08-02T18:00:00+00:00", "platforms": ["youtube", ...]} ou null
    "scheduled": None,
}


def spec_path(proj: Project) -> Path:
    return proj.dir / "publish.json"


def load_spec(proj: Project) -> dict:
    p = spec_path(proj)
    if not p.exists():
        return dict(SKELETON)
    return {**SKELETON, **json.loads(p.read_text(encoding="utf-8"))}


def save_spec(proj: Project, data: dict) -> None:
    spec_path(proj).write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def find_video(proj: Project) -> Path | None:
    out = proj.out / "final.mp4"
    if out.exists():
        return out
    mp4s = sorted(proj.out.glob("*.mp4")) if proj.out.exists() else []
    return mp4s[-1] if mp4s else None


def run_platform(proj: Project, name: str, dry_run: bool = False,
                 force: bool = False) -> dict:
    """Publica numa plataforma. Retorna o result dict; levanta PublishError."""
    data = load_spec(proj)
    if name not in DRIVERS:
        raise PublishError(f"plataforma desconhecida: {name}")
    done = data["results"].get(name)
    if done and not force and not dry_run:
        return {**done, "skipped": True}
    video = find_video(proj)
    if video is None:
        raise PublishError(f"nenhum mp4 em {proj.out} — renderize antes")
    spec = PublishSpec(title=data["title"], caption=data["caption"],
                       hashtags=data["hashtags"], overrides=data["overrides"])
    res = DRIVERS[name].publish(video, spec.for_platform(name), dry_run=dry_run)
    if not dry_run:
        res["at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        # recarrega antes de gravar: outra plataforma pode ter escrito no meio
        data = load_spec(proj)
        data["results"][name] = res
        save_spec(proj, data)
    return res


def publish(proj: Project, platforms: list[str], dry_run: bool = False,
            force: bool = False) -> int:
    data = load_spec(proj)
    if not data["title"] and not data["caption"] and not dry_run:
        save_spec(proj, data)
        print(f"publish.json vazio criado em {spec_path(proj)} — "
              "preencha title/caption/hashtags e rode de novo")
        return 1

    video = find_video(proj)
    if video is None:
        print(f"nenhum mp4 em {proj.out} — rode ./sg.sh render {proj.slug} antes")
        return 1

    failed = False
    for name in platforms:
        try:
            res = run_platform(proj, name, dry_run=dry_run, force=force)
        except PublishError as e:
            print(f"  {name}: ERRO — {e}")
            failed = True
            continue
        if res.get("skipped"):
            print(f"  {name}: já publicado em {res.get('at', '?')} "
                  f"({res.get('url') or res.get('id')}) — use --force pra repostar")
        elif dry_run:
            print(f"  {name}: ok pra publicar ({res['duration']:.1f}s, "
                  f"{res['width']}x{res['height']}, {res['size'] / 1e6:.1f}MB)")
        else:
            print(f"  {name}: publicado — {res.get('url') or res.get('id')}")
    return 1 if failed else 0
