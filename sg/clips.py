"""Multi-clip source cutting — the map between timeline time and source time.

`source.clips` is a list of `[start, end]` keep-ranges in SOURCE seconds. Timeline
time is their concatenation: cut 2s out of the middle and everything after it slides
2s earlier. Segments are always authored in TIMELINE time, so a cut has to remap them.

The player mirrors these functions in JS (`web/player.js`). If you change the mapping
here, change it there — a divergence breaks "what you see is what you get".
"""
from __future__ import annotations

EPS = 1e-6
MIN_SEG = 0.2  # a segment shorter than this after a cut isn't worth keeping


Range = list[float]


def normalize(ranges, duration: float | None = None) -> list[Range]:
    """Clamp, drop empties, sort, merge overlaps."""
    out: list[Range] = []
    for r in ranges or []:
        a, b = float(r[0]), float(r[1])
        if duration:
            a, b = min(max(a, 0.0), duration), min(max(b, 0.0), duration)
        if b - a > EPS:
            out.append([round(a, 4), round(b, 4)])
    out.sort()
    merged: list[Range] = []
    for a, b in out:
        if merged and a <= merged[-1][1] + EPS:
            merged[-1][1] = max(merged[-1][1], b)
        else:
            merged.append([a, b])
    return merged


def resolve(source: dict, duration: float | None = None) -> list[Range]:
    """Effective keep-ranges for a timeline's `source` block. Never empty."""
    dur = duration or float((source.get("meta") or {}).get("duration") or 0.0)
    raw = source.get("clips")
    if not raw:
        trim = source.get("trim")
        raw = [trim] if trim else None
    full = [[0.0, round(dur, 4)]]
    if not raw:
        return full
    return normalize(raw, dur) or full


def total(clips: list[Range]) -> float:
    return round(sum(b - a for a, b in clips), 4)


def offsets(clips: list[Range]) -> list[float]:
    """Timeline-time start of each clip."""
    off, acc = [], 0.0
    for a, b in clips:
        off.append(round(acc, 6))
        acc += b - a
    return off


def to_source(clips: list[Range], t: float, left: bool = False) -> float:
    """Timeline second -> source second. `left=True` for exclusive endpoints,
    so a value sitting exactly on a clip boundary resolves to the clip that ends
    there rather than the one that starts there."""
    off = offsets(clips)
    for i, (a, b) in enumerate(clips):
        ln = b - a
        inside = (off[i] - EPS < t <= off[i] + ln + EPS) if left \
            else (off[i] - EPS <= t < off[i] + ln - EPS)
        if inside:
            return round(a + min(max(t - off[i], 0.0), ln), 6)
    return clips[-1][1] if t >= total(clips) else clips[0][0]


def to_timeline(clips: list[Range], s: float) -> float:
    """Source second -> timeline second. A second that was cut away maps to the
    instant it was cut at, i.e. the start of the next surviving clip."""
    off = offsets(clips)
    for i, (a, b) in enumerate(clips):
        if s < a - EPS:
            return off[i]
        if s < b:
            return round(off[i] + (s - a), 6)
    return total(clips)


def index_at_source(clips: list[Range], s: float) -> int:
    """Which clip contains this source second, or -1 if it was cut away."""
    for i, (a, b) in enumerate(clips):
        if a - EPS <= s < b:
            return i
    return -1


def cut(clips: list[Range], ranges) -> list[Range]:
    """Remove source-time ranges from the keep set."""
    out = [list(c) for c in clips]
    for ca, cb in normalize(ranges):
        nxt: list[Range] = []
        for a, b in out:
            if cb <= a + EPS or ca >= b - EPS:
                nxt.append([a, b])
                continue
            if a < ca - EPS:
                nxt.append([a, min(b, ca)])
            if b > cb + EPS:
                nxt.append([max(a, cb), b])
        out = nxt
    return normalize(out)


def keep(clips: list[Range], ranges) -> list[Range]:
    """Intersect the keep set with source-time ranges."""
    out: list[Range] = []
    for ka, kb in normalize(ranges):
        for a, b in clips:
            lo, hi = max(a, ka), min(b, kb)
            if hi - lo > EPS:
                out.append([lo, hi])
    return normalize(out)


def snap(clips: list[Range], fps: float | None) -> list[Range]:
    """Land every boundary on the source's frame grid, so ffmpeg's `trim` (frame
    accurate) and `atrim` (sample accurate) cut at the same instant. Without this
    the pieces drift apart by up to a frame each and concat desyncs A/V."""
    if not fps or fps <= 0:
        return clips
    step = 1.0 / fps
    return normalize([[round(round(a / step) * step, 6),
                       round(round(b / step) * step, 6)] for a, b in clips])


# ------------------------------------------------------------------ remapping


def remap_segments(segments, old: list[Range], new: list[Range],
                   fps: int | None = None) -> tuple[list[dict], list[dict], list[dict]]:
    """Move segments from the old timeline onto the new one.

    Returns (kept, dropped, shortened). `shortened` is what you have to eyeball:
    a segment whose duration changed no longer fits its own `delay`/`dur`/`cps`
    props, and the typewriter/counter scenes will run past their own end.
    """
    tot = total(new)
    kept: list[dict] = []
    dropped: list[dict] = []
    shortened: list[dict] = []

    for seg in segments:
        was = float(seg["end"]) - float(seg["start"])
        s0 = to_source(old, float(seg["start"]))
        s1 = to_source(old, float(seg["end"]), left=True)
        a, b = to_timeline(new, s0), to_timeline(new, s1)
        if fps:
            a, b = round(a * fps) / fps, round(b * fps) / fps
        a, b = min(max(a, 0.0), tot), min(max(b, 0.0), tot)
        if b - a < MIN_SEG:
            dropped.append(seg)
            continue
        out = dict(seg)
        out["start"], out["end"] = round(a, 3), round(b, 3)
        kept.append(out)
        if abs((b - a) - was) > 0.05:
            shortened.append({"id": seg.get("id"), "was": round(was, 3),
                              "now": round(b - a, 3)})

    # rounding can leave hairline gaps or overlaps between neighbours
    for i in range(len(kept) - 1):
        if abs(kept[i + 1]["start"] - kept[i]["end"]) < 0.06:
            kept[i]["end"] = kept[i + 1]["start"]
    if kept:
        kept[0]["start"] = 0.0 if kept[0]["start"] < 0.06 else kept[0]["start"]
        if tot - kept[-1]["end"] < 0.15:
            kept[-1]["end"] = round(tot, 3)
    return kept, dropped, shortened


def remap_words(words, clips: list[Range]) -> list[dict]:
    """Transcript words in timeline time. Cut-away words are kept with `cut: true`
    so you can still read the flow and see what disappeared."""
    out = []
    for w in words or []:
        s = float(w["start"])
        i = index_at_source(clips, s)
        if i < 0:
            t = to_timeline(clips, s)
            out.append({**w, "start": t, "end": t, "cut": True})
        else:
            a = to_timeline(clips, s)
            b = to_timeline(clips, min(float(w["end"]), clips[i][1] - EPS))
            out.append({**w, "start": a, "end": max(b, a + 0.01), "cut": False})
    return out


# ------------------------------------------------------------------ ffmpeg


def parse_range(text: str) -> Range:
    """'44.0-44.74' or '44.0:44.74' -> [44.0, 44.74]."""
    raw = text.replace(":", "-", 1) if ":" in text and "-" not in text else text
    a, _, b = raw.partition("-")
    if not b:
        raise ValueError(f"range precisa de dois tempos: {text!r} (ex: 44.0-44.74)")
    return [float(a), float(b)]


def is_full(clips: list[Range], duration: float) -> bool:
    return (len(clips) == 1 and clips[0][0] <= EPS
            and clips[0][1] >= duration - 0.02)
