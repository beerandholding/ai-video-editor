"""Project layout, timeline load/save, defaults."""
from __future__ import annotations

import json
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROJECTS = ROOT / "projects"
WEB = ROOT / "web"

WIDTH = 1080
HEIGHT = 1920
SPLIT = 0.5  # top half is generated, bottom half is the source video
FPS = 25

TOP_H = int(HEIGHT * SPLIT)
BOTTOM_H = HEIGHT - TOP_H


def slugify(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", name.strip().lower()).strip("-")
    return s or "video"


@dataclass
class Project:
    slug: str

    @property
    def dir(self) -> Path:
        return PROJECTS / self.slug

    @property
    def source(self) -> Path:
        return self.dir / "source.mp4"

    @property
    def audio(self) -> Path:
        return self.dir / "audio.wav"

    @property
    def transcript_path(self) -> Path:
        return self.dir / "transcript.json"

    @property
    def timeline_path(self) -> Path:
        return self.dir / "timeline.json"

    @property
    def assets(self) -> Path:
        return self.dir / "assets"

    @property
    def frames(self) -> Path:
        return self.dir / "render" / "frames"

    @property
    def out(self) -> Path:
        return self.dir / "out"

    def exists(self) -> bool:
        return self.timeline_path.exists()

    def ensure_dirs(self) -> None:
        for d in (self.dir, self.assets, self.frames, self.out):
            d.mkdir(parents=True, exist_ok=True)

    def load_timeline(self) -> dict:
        return json.loads(self.timeline_path.read_text(encoding="utf-8"))

    def save_timeline(self, tl: dict) -> None:
        self.timeline_path.write_text(
            json.dumps(tl, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )

    def load_transcript(self) -> dict:
        if not self.transcript_path.exists():
            return {"language": None, "text": "", "words": [], "segments": []}
        return json.loads(self.transcript_path.read_text(encoding="utf-8"))


def list_projects() -> list[str]:
    if not PROJECTS.exists():
        return []
    return sorted(p.name for p in PROJECTS.iterdir() if (p / "timeline.json").exists())


def probe(path: Path) -> dict:
    """ffprobe -> {duration, width, height, fps, has_audio}."""
    cmd = [
        "ffprobe", "-v", "error", "-print_format", "json",
        "-show_format", "-show_streams", str(path),
    ]
    data = json.loads(subprocess.run(cmd, capture_output=True, text=True, check=True).stdout)
    v = next((s for s in data["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in data["streams"] if s["codec_type"] == "audio"), None)
    if v is None:
        raise ValueError(f"no video stream in {path}")
    num, _, den = v.get("r_frame_rate", "25/1").partition("/")
    fps = float(num) / float(den or 1) if float(den or 1) else 25.0
    duration = float(data["format"].get("duration") or v.get("duration") or 0.0)
    return {
        "duration": round(duration, 3),
        "width": int(v["width"]),
        "height": int(v["height"]),
        "fps": round(fps, 4),
        "has_audio": a is not None,
    }


DEFAULT_THEME = {
    "bg": "#08080a",
    "fg": "#ffffff",
    "muted": "#8a8f98",
    "accent": "#e11d48",
    "accent2": "#8b9cff",
    "font": "Inter",
    "mono": "JetBrains Mono",
}


def default_timeline(meta: dict, duration: float, kind: str = "split") -> dict:
    tl = {
        "version": 1,
        # "split" = topo gerado / baixo vídeo (50/50). "compare" = vídeo
        # fullscreen com as cenas por cima em camada transparente.
        "type": kind,
        "fps": FPS,
        "width": WIDTH,
        "height": HEIGHT,
        "split": SPLIT,
        "duration": round(duration, 3),
        "source": {
            "file": "source.mp4",
            "meta": meta,
            # cover-crop the source into the bottom box; x/y are 0..1 anchors
            "crop": {"x": 0.5, "y": 0.5, "zoom": 1.0},
            # keep-ranges in source seconds; timeline time is their concatenation.
            # null = the whole source. Edit with `sg.sh clips <slug> --cut a-b`.
            "clips": None,
            # tratamento de cor do vídeo de baixo; ver sg/grade.py.
            # null = sem tratamento. O preview aplica o mesmo em SVG.
            "grade": None,
            "trim": None,  # legacy single range; equivalent to clips: [[a, b]]
        },
        "theme": dict(DEFAULT_THEME),
        "segments": [
            {
                "id": "seg-1",
                "start": 0.0,
                "end": round(duration, 3),
                "scene": "blank",
                # compare: fundo transparente pro vídeo aparecer por baixo
                "props": {"bg": "none" if kind == "compare" else DEFAULT_THEME["bg"]},
            }
        ],
    }
    if kind == "compare":
        # trilha sonora; arquivo relativo a projects/<slug>/assets/.
        # null = sem música (fica o áudio do source, se existir).
        tl["music"] = None
    return tl


def import_source(video: Path, slug: str | None = None, force: bool = False,
                  kind: str = "split") -> Project:
    """Copy a video into a new project dir and write a starter timeline."""
    proj = Project(slug or slugify(video.stem))
    if proj.exists() and not force:
        raise FileExistsError(f"project '{proj.slug}' already exists (use --force)")
    proj.ensure_dirs()
    if video.resolve() != proj.source.resolve():
        shutil.copy2(video, proj.source)
    meta = probe(proj.source)
    proj.save_timeline(default_timeline(meta, meta["duration"], kind=kind))
    return proj


def extract_audio(proj: Project) -> Path:
    """16 kHz mono wav for whisper."""
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(proj.source),
         "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(proj.audio)],
        check=True,
    )
    return proj.audio
