"""Shared bits for the social drivers: env, token store, video validation."""
from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

CONFIG_DIR = Path(os.environ.get("SG_CONFIG_DIR", "~/.config/social-generator")).expanduser()
ROOT = Path(__file__).resolve().parent.parent.parent


class PublishError(RuntimeError):
    pass


@dataclass
class PublishSpec:
    """What gets posted — one spec drives every platform."""
    title: str = ""
    caption: str = ""
    hashtags: list[str] = field(default_factory=list)
    # per-platform overrides: {"youtube": {"title": ...}, ...}
    overrides: dict = field(default_factory=dict)

    def for_platform(self, name: str) -> "PublishSpec":
        ov = self.overrides.get(name) or {}
        return PublishSpec(
            title=ov.get("title", self.title),
            caption=ov.get("caption", self.caption),
            hashtags=ov.get("hashtags", self.hashtags),
        )

    @property
    def caption_with_tags(self) -> str:
        tags = " ".join(f"#{t.lstrip('#')}" for t in self.hashtags)
        return f"{self.caption}\n\n{tags}".strip()


def load_env() -> None:
    """Load KEY=VALUE lines from the repo-root .env without adding a dependency."""
    env = ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def require_env(*keys: str) -> list[str]:
    load_env()
    missing = [k for k in keys if not os.environ.get(k)]
    if missing:
        raise PublishError(
            f"faltam credenciais no ambiente/.env: {', '.join(missing)} "
            f"(veja README, seção 'Publicação')"
        )
    return [os.environ[k] for k in keys]


def token_path(name: str) -> Path:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    return CONFIG_DIR / f"{name}.json"


def save_token(name: str, data: dict) -> None:
    p = token_path(name)
    p.write_text(json.dumps(data, indent=2))
    p.chmod(0o600)


def load_token(name: str) -> dict | None:
    p = token_path(name)
    return json.loads(p.read_text()) if p.exists() else None


def probe_video(path: Path) -> dict:
    cmd = ["ffprobe", "-v", "error", "-print_format", "json",
           "-show_format", "-show_streams", str(path)]
    data = json.loads(subprocess.run(cmd, capture_output=True, text=True, check=True).stdout)
    v = next(s for s in data["streams"] if s["codec_type"] == "video")
    return {
        "duration": float(data["format"]["duration"]),
        "size": int(data["format"]["size"]),
        "width": int(v["width"]),
        "height": int(v["height"]),
    }


def validate_vertical(path: Path, max_seconds: float, platform: str) -> dict:
    """Every short-form platform wants 9:16; each caps duration differently."""
    if not path.exists():
        raise PublishError(f"{platform}: vídeo não existe: {path}")
    info = probe_video(path)
    if info["duration"] > max_seconds:
        raise PublishError(
            f"{platform}: vídeo tem {info['duration']:.1f}s, máximo {max_seconds:.0f}s")
    ratio = info["width"] / info["height"]
    if abs(ratio - 9 / 16) > 0.02:
        raise PublishError(
            f"{platform}: proporção {info['width']}x{info['height']} não é 9:16")
    return info
