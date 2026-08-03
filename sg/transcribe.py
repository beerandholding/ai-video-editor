"""Word-level transcription with faster-whisper (GPU when available)."""
from __future__ import annotations

import json

from .project import Project, extract_audio


def _pick_device(prefer: str = "auto") -> tuple[str, str]:
    """Return (device, compute_type). Falls back to CPU int8 if CUDA is unusable."""
    if prefer in ("cpu",):
        return "cpu", "int8"
    if prefer in ("cuda",):
        return "cuda", "float16"
    try:
        import ctranslate2

        if ctranslate2.get_cuda_device_count() > 0:
            return "cuda", "float16"
    except Exception:
        pass
    return "cpu", "int8"


def transcribe(
    proj: Project,
    model_size: str = "large-v3",
    language: str | None = None,
    device: str = "auto",
) -> dict:
    from faster_whisper import WhisperModel

    if not proj.audio.exists():
        extract_audio(proj)

    dev, ctype = _pick_device(device)

    def run(dev: str, ctype: str, size: str):
        if dev == "cpu" and size in ("large-v3", "large-v2", "large"):
            size = "medium"  # large on CPU is unbearably slow for an interactive loop
        print(f"[transcribe] model={size} device={dev} compute={ctype}")
        model = WhisperModel(size, device=dev, compute_type=ctype)
        segments, info = model.transcribe(
            str(proj.audio),
            language=language,
            word_timestamps=True,
            vad_filter=True,
            beam_size=5,
        )
        words: list[dict] = []
        segs: list[dict] = []
        for s in segments:  # generator — CUDA errors surface here, not at construction
            segs.append({"start": round(s.start, 3), "end": round(s.end, 3),
                         "text": s.text.strip()})
            for w in s.words or []:
                words.append({"start": round(w.start, 3), "end": round(w.end, 3),
                              "word": w.word.strip(), "prob": round(w.probability, 3)})
            print(f"[{s.start:7.2f} -> {s.end:7.2f}] {s.text.strip()}")
        return words, segs, info

    try:
        words, segs, info = run(dev, ctype, model_size)
    except RuntimeError as exc:
        if dev != "cuda" or device == "cuda":
            raise
        print(f"[transcribe] CUDA indisponível ({exc}) — refazendo na CPU")
        words, segs, info = run("cpu", "int8", model_size)

    out = {
        "language": info.language,
        "language_prob": round(info.language_probability, 3),
        "duration": round(info.duration, 3),
        "text": " ".join(s["text"] for s in segs).strip(),
        "segments": segs,
        "words": words,
    }
    proj.transcript_path.write_text(
        json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return out
