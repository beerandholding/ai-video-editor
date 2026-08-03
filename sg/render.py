"""Deterministic render: Playwright screenshots the top half, ffmpeg stacks it on the source."""
from __future__ import annotations

import asyncio
import hashlib
import math
import shutil
import subprocess
from pathlib import Path
from typing import Callable

from . import clips as clips_mod
from . import grade as grade_mod
from .project import BOTTOM_H, HEIGHT, TOP_H, WEB, WIDTH, Project

Progress = Callable[[str, float], None]


def stage_height(tl: dict) -> int:
    """compare: as cenas cobrem o frame inteiro (overlay); split: só o topo."""
    return HEIGHT if tl.get("type") == "compare" else TOP_H


def _noop(stage: str, pct: float) -> None:
    print(f"[{stage}] {pct * 100:5.1f}%", end="\r", flush=True)


# ---------------------------------------------------------------- top frames


async def _render_range(browser, url: str, out_dir: Path, fps: int,
                        lo: int, hi: int, on_frame, height: int,
                        alpha: bool) -> None:
    page = await browser.new_page(
        viewport={"width": WIDTH, "height": height}, device_scale_factor=1
    )
    await page.goto(url, wait_until="networkidle")
    await page.wait_for_function("window.SG && window.SG.ready === true", timeout=30_000)
    for i in range(lo, hi):
        await page.evaluate("t => window.SG.seek(t)", i / fps)
        # compare: PNG com canal alpha — o ffmpeg faz overlay em cima do vídeo
        await page.screenshot(path=str(out_dir / f"{i:06d}.png"),
                              animations="disabled", omit_background=alpha)
        on_frame()
    await page.close()


async def _render_frames_async(proj: Project, port: int, total: int, fps: int,
                               workers: int, progress: Progress,
                               height: int, alpha: bool) -> None:
    from playwright.async_api import async_playwright

    url = f"http://127.0.0.1:{port}/host.html?project={proj.slug}&mode=render"
    done = 0

    def tick() -> None:
        nonlocal done
        done += 1
        if done % 10 == 0 or done == total:
            progress("frames", done / total)

    chunk = math.ceil(total / workers)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            channel="chrome",
            args=["--force-device-scale-factor=1", "--hide-scrollbars",
                  "--disable-lcd-text", "--font-render-hinting=none"],
        )
        await asyncio.gather(*[
            _render_range(browser, url, proj.frames, fps,
                          w * chunk, min(total, (w + 1) * chunk), tick,
                          height, alpha)
            for w in range(workers) if w * chunk < total
        ])
        await browser.close()


def _fingerprint(proj: Project) -> str:
    """Everything the scene host loads over HTTP, plus the timeline."""
    parts = []
    for f in sorted(WEB.rglob("*")):
        if f.is_file() and f.suffix in (".html", ".js", ".css"):
            st = f.stat()
            parts.append(f"{f}:{st.st_mtime_ns}:{st.st_size}")
    if proj.timeline_path.exists():
        st = proj.timeline_path.stat()
        parts.append(f"tl:{st.st_mtime_ns}:{st.st_size}")
    return hashlib.sha1("|".join(parts).encode()).hexdigest()


def render_frames(proj: Project, port: int, workers: int = 4,
                  progress: Progress = _noop) -> int:
    tl = proj.load_timeline()
    fps = int(tl.get("fps", 25))
    total = max(1, round(float(tl["duration"]) * fps))
    if proj.frames.exists():
        shutil.rmtree(proj.frames)
    proj.frames.mkdir(parents=True, exist_ok=True)

    # The N workers each fetch host.html at a different instant. If a scene file
    # or the timeline is saved mid-render they end up on different versions and
    # the frames silently disagree with each other — a broken video with no error.
    before = _fingerprint(proj)
    asyncio.run(_render_frames_async(proj, port, total, fps, max(1, workers), progress,
                                     stage_height(tl), tl.get("type") == "compare"))
    if _fingerprint(proj) != before:
        raise RuntimeError(
            "web/ ou timeline.json mudou durante o render — os workers pegaram "
            "versões diferentes do código e os frames não batem entre si. "
            "Renderize de novo com os arquivos parados."
        )
    return total


# ---------------------------------------------------------------- compositing


def bottom_filter(tl: dict, box_h: int = BOTTOM_H) -> str:
    """Cover-scale + anchored crop of the source into a WIDTH×box_h box."""
    crop = (tl.get("source") or {}).get("crop") or {}
    zoom = float(crop.get("zoom", 1.0)) or 1.0
    ax = min(max(float(crop.get("x", 0.5)), 0.0), 1.0)
    ay = min(max(float(crop.get("y", 0.5)), 0.0), 1.0)
    sw, sh = int(WIDTH * zoom), int(box_h * zoom)
    chain = (
        f"scale={sw}:{sh}:force_original_aspect_ratio=increase,"
        f"crop={WIDTH}:{box_h}:(iw-{WIDTH})*{ax:.4f}:(ih-{box_h})*{ay:.4f},"
        f"setsar=1"
    )
    # tratamento de cor depois do crop: menos pixels e o mesmo resultado
    tone = grade_mod.ffmpeg_filter(grade_mod.resolve(tl.get("source")))
    return f"{chain},{tone}" if tone else chain


def source_chain(tl: dict, has_audio: bool) -> tuple[list[str], str, str, str]:
    """How to get the kept parts of the source into one continuous stream.

    Returns (input args, filter graph prefix, video label, audio label). A single
    full-length clip needs nothing; a single sub-range is a cheap input seek; two
    or more become trim/atrim pairs glued by the concat filter, which is frame
    accurate and keeps A/V locked (see clips.snap for why boundaries are aligned).
    """
    src = tl.get("source") or {}
    src_dur = float((src.get("meta") or {}).get("duration") or 0.0)
    ranges = clips_mod.resolve(src, src_dur)

    if clips_mod.is_full(ranges, src_dur):
        return [], "", "1:v", "1:a"

    if len(ranges) == 1:
        a, b = ranges[0]
        return ["-ss", f"{a:.4f}", "-t", f"{b - a:.4f}"], "", "1:v", "1:a"

    parts = []
    for i, (a, b) in enumerate(ranges):
        parts.append(f"[1:v]trim=start={a:.4f}:end={b:.4f},setpts=PTS-STARTPTS[cv{i}];")
        if has_audio:
            parts.append(f"[1:a]atrim=start={a:.4f}:end={b:.4f},asetpts=PTS-STARTPTS[ca{i}];")
    pads = "".join(f"[cv{i}][ca{i}]" if has_audio else f"[cv{i}]"
                   for i in range(len(ranges)))
    if has_audio:
        parts.append(f"{pads}concat=n={len(ranges)}:v=1:a=1[jv][ja];")
        return [], "".join(parts), "jv", "ja"
    parts.append(f"{pads}concat=n={len(ranges)}:v=1:a=0[jv];")
    return [], "".join(parts), "jv", "1:a"


def compose(proj: Project, nvenc: bool = True, crf: int = 20,
            out_name: str = "final.mp4") -> Path:
    tl = proj.load_timeline()
    fps = int(tl.get("fps", 25))
    duration = float(tl["duration"])
    has_audio = ((tl.get("source") or {}).get("meta") or {}).get("has_audio", True)
    music = tl.get("music") or None
    use_src_audio = has_audio and not music
    out = proj.out / out_name
    out.parent.mkdir(parents=True, exist_ok=True)

    seek, pre, vlab, alab = source_chain(tl, use_src_audio)
    src_in = [*seek, "-i", str(proj.source)]

    if tl.get("type") == "compare":
        # vídeo fullscreen embaixo, frames RGBA (fundo transparente) por cima
        fc = (
            pre
            + f"[{vlab}]{bottom_filter(tl, HEIGHT)},fps={fps}[base];"
            f"[0:v]setsar=1[ov];"
            f"[base][ov]overlay=0:0,format=yuv420p[v]"
        )
    else:
        fc = (
            pre
            + f"[{vlab}]{bottom_filter(tl)},fps={fps}[bot];"
            f"[0:v]setsar=1[top];"
            f"[top][bot]vstack=inputs=2,format=yuv420p[v]"
        )

    music_in: list[str] = []
    if music:
        mfile = proj.assets / music["file"]
        if not mfile.exists():
            raise FileNotFoundError(f"música não encontrada: {mfile}")
        # -stream_loop -1: trilha mais curta que o vídeo repete; o -t corta no fim
        music_in = ["-stream_loop", "-1", "-i", str(mfile)]
        af = f"volume={float(music.get('gain_db', 0)):.2f}dB"
        fade = float(music.get("fade", 0) or 0)
        if fade > 0:
            af += f",afade=t=out:st={max(0.0, duration - fade):.3f}:d={fade:.3f}"
        fc += f";[2:a]{af}[ma]"

    if nvenc:
        venc = ["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr",
                "-cq", str(crf), "-b:v", "0", "-profile:v", "high"]
    else:
        venc = ["-c:v", "libx264", "-preset", "slow", "-crf", str(crf),
                "-profile:v", "high"]

    cmd = [
        "ffmpeg", "-y", "-v", "error", "-stats",
        "-framerate", str(fps), "-i", str(proj.frames / "%06d.png"),
        *src_in, *music_in,
        "-filter_complex", fc,
        "-map", "[v]",
    ]
    if music:
        cmd += ["-map", "[ma]", "-c:a", "aac", "-b:a", "192k"]
    elif has_audio:
        cmd += ["-map", f"[{alab}]" if alab.isalpha() else alab,
                "-c:a", "aac", "-b:a", "192k"]
    cmd += [*venc, "-r", str(fps), "-t", f"{duration:.3f}",
            "-movflags", "+faststart", str(out)]

    subprocess.run(cmd, check=True)
    return out


def render(proj: Project, port: int, workers: int = 4, nvenc: bool = True,
           crf: int = 20, progress: Progress = _noop) -> Path:
    n = render_frames(proj, port, workers, progress)
    progress("encode", 0.0)
    out = compose(proj, nvenc=nvenc, crf=crf)
    progress("done", 1.0)
    print(f"\n[render] {n} frames -> {out}")
    return out
