"""sg — command line entry point."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from .project import Project, extract_audio, import_source, list_projects


def cmd_new(args: argparse.Namespace) -> int:
    proj = import_source(Path(args.video), args.slug, force=args.force, kind=args.type)
    tl = proj.load_timeline()
    print(f"project: {proj.slug}  [{args.type}]")
    print(f"  source: {proj.source}  {tl['source']['meta']}")
    print(f"  timeline: {proj.timeline_path}")
    if args.type == "compare" and not args.no_transcribe:
        # timelapse não tem fala — whisper em cima de música/silêncio só gera lixo
        print("  transcrição pulada (type=compare; rode `sg.sh transcribe` se precisar)")
    elif not args.no_transcribe:
        from .transcribe import transcribe

        extract_audio(proj)
        transcribe(proj, model_size=args.model, language=args.lang, device=args.device)
        print(f"  transcript: {proj.transcript_path}")
    return 0


def cmd_transcribe(args: argparse.Namespace) -> int:
    from .transcribe import transcribe

    proj = Project(args.slug)
    extract_audio(proj)
    transcribe(proj, model_size=args.model, language=args.lang, device=args.device)
    return 0


def cmd_serve(args: argparse.Namespace) -> int:
    from .server import serve

    print(f"preview: http://127.0.0.1:{args.port}/player.html")
    serve(port=args.port, host=args.host)
    return 0


def cmd_render(args: argparse.Namespace) -> int:
    """Render standalone: boots a throwaway server so the scene host is reachable."""
    import threading
    import time

    from . import server as srv
    from .render import render

    proj = Project(args.slug)
    if not proj.exists():
        print(f"unknown project '{args.slug}'", file=sys.stderr)
        return 1

    threading.Thread(target=lambda: srv.serve(port=args.port), daemon=True).start()
    time.sleep(1.5)
    out = render(proj, args.port, workers=args.workers, nvenc=not args.x264, crf=args.crf)
    print(out)
    sys.stdout.flush()
    os._exit(0)  # the throwaway uvicorn thread has no clean shutdown path


def cmd_clips(args: argparse.Namespace) -> int:
    """Cut ranges out of the source. Segments follow automatically."""
    from . import clips as C

    proj = Project(args.slug)
    if not proj.exists():
        print(f"unknown project '{args.slug}'", file=sys.stderr)
        return 1
    tl = proj.load_timeline()
    src = tl.setdefault("source", {})
    meta = src.get("meta") or {}
    src_dur = float(meta.get("duration") or 0.0)
    src_fps = float(meta.get("fps") or 0.0)
    fps = int(tl.get("fps", 25))
    old = C.resolve(src, src_dur)

    def show(ranges: list) -> None:
        off = C.offsets(ranges)
        for i, (a, b) in enumerate(ranges):
            print(f"  {i}  fonte {a:8.3f}–{b:8.3f}   "
                  f"timeline {off[i]:8.3f}–{off[i] + (b - a):8.3f}   ({b - a:.3f}s)")
        print(f"  total {C.total(ranges):.3f}s de {src_dur:.3f}s "
              f"(cortado {src_dur - C.total(ranges):.3f}s)")

    if not (args.cut or args.keep or args.reset):
        print(f"{args.slug}: {len(old)} clipe(s)")
        show(old)
        return 0

    new = [[0.0, src_dur]] if args.reset else list(old)
    if args.keep:
        new = C.keep(new, [C.parse_range(r) for r in args.keep])
    if args.cut:
        new = C.cut(new, [C.parse_range(r) for r in args.cut])
    new = C.snap(new, src_fps)
    if not new:
        print("isso corta o vídeo inteiro — abortado", file=sys.stderr)
        return 1

    kept, dropped, shortened = C.remap_segments(
        tl.get("segments", []), old, new, fps=None if args.no_remap else fps
    )
    if not args.no_remap:
        tl["segments"] = kept
    src["clips"] = new
    src["trim"] = None
    tl["duration"] = C.total(new)
    proj.save_timeline(tl)

    print(f"{args.slug}: {len(old)} → {len(new)} clipe(s)")
    show(new)
    if args.no_remap:
        print("  --no-remap: segmentos NÃO foram remapeados")
        return 0
    if dropped:
        print(f"  removidos {len(dropped)} segmento(s) que caíram dentro do corte: "
              + ", ".join(str(s.get("id")) for s in dropped))
    if shortened:
        print("  CONFERIR — mudaram de duração, os delays internos podem não caber:")
        for s in shortened:
            print(f"    {s['id']}: {s['was']:.2f}s → {s['now']:.2f}s")
    return 0


def cmd_publish(args: argparse.Namespace) -> int:
    from .publish import publish

    proj = Project(args.slug)
    if not proj.exists():
        print(f"unknown project '{args.slug}'", file=sys.stderr)
        return 1
    platforms = [p.strip() for p in args.to.split(",") if p.strip()]
    return publish(proj, platforms, dry_run=args.dry_run, force=args.force)


def cmd_captions(args: argparse.Namespace) -> int:
    from .publish import load_spec, save_spec
    from .social.captions import generate, to_publish_spec

    proj = Project(args.slug)
    if not proj.exists():
        print(f"unknown project '{args.slug}'", file=sys.stderr)
        return 1
    data = load_spec(proj)
    if (data["title"] or data["caption"]) and not args.force:
        print("publish.json já tem texto — use --force pra regenerar")
        return 1

    tr = json.loads(proj.transcript_path.read_text(encoding="utf-8"))
    segs = tr.get("segments") or []
    text = "\n".join(s.get("text", "").strip() for s in segs) or tr.get("text", "")
    dur = float(proj.load_timeline().get("duration", 0))

    keywords = None
    if args.keywords:
        from .social.keywords import suggest
        keywords = suggest(args.keywords)
        print(f"  {len(keywords)} palavras-chave do DataForSEO no prompt")

    gen = generate(text, dur, keywords=keywords, model=args.model)
    data.update(to_publish_spec(gen))
    if args.print_only:
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return 0
    save_spec(proj, data)
    print(f"descrições geradas em {proj.dir / 'publish.json'} — revise antes de publicar")
    return 0


def cmd_keywords(args: argparse.Namespace) -> int:
    from .social.keywords import suggest

    for kw in suggest(args.seed, limit=args.limit, min_volume=args.min_volume):
        diff = f"{kw['difficulty']:>3}" if kw["difficulty"] is not None else "  ?"
        print(f"{kw['volume'] or 0:>8}  dif {diff}  {kw['keyword']}")
    return 0


def cmd_ls(args: argparse.Namespace) -> int:
    for slug in list_projects():
        tl = Project(slug).load_timeline()
        print(f"{slug:28s} {tl.get('duration', 0):7.2f}s  {len(tl.get('segments', []))} segs")
    return 0


def cmd_timeline(args: argparse.Namespace) -> int:
    print(json.dumps(Project(args.slug).load_timeline(), indent=2, ensure_ascii=False))
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser("sg", description="Instagram split-screen video generator")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("new", help="import a video and start a project")
    p.add_argument("video")
    p.add_argument("--type", default="split", choices=["split", "compare"],
                   help="split = topo gerado/baixo vídeo; compare = vídeo "
                        "fullscreen com cenas overlay (pula a transcrição)")
    p.add_argument("--slug")
    p.add_argument("--force", action="store_true")
    p.add_argument("--no-transcribe", action="store_true")
    p.add_argument("--model", default="large-v3")
    p.add_argument("--lang", default=None)
    p.add_argument("--device", default="auto", choices=["auto", "cuda", "cpu"])
    p.set_defaults(func=cmd_new)

    p = sub.add_parser("transcribe", help="(re)transcribe a project")
    p.add_argument("slug")
    p.add_argument("--model", default="large-v3")
    p.add_argument("--lang", default=None)
    p.add_argument("--device", default="auto", choices=["auto", "cuda", "cpu"])
    p.set_defaults(func=cmd_transcribe)

    p = sub.add_parser("serve", help="run the preview UI")
    p.add_argument("--port", type=int, default=8420)
    p.add_argument("--host", default="127.0.0.1")
    p.set_defaults(func=cmd_serve)

    p = sub.add_parser("render", help="render the final mp4")
    p.add_argument("slug")
    p.add_argument("--port", type=int, default=8421)
    p.add_argument("--workers", type=int, default=4)
    p.add_argument("--crf", type=int, default=20)
    p.add_argument("--x264", action="store_true", help="use libx264 instead of nvenc")
    p.set_defaults(func=cmd_render)

    p = sub.add_parser("clips", help="cut ranges out of the source (source seconds)")
    p.add_argument("slug")
    p.add_argument("--cut", action="append", metavar="A-B",
                   help="remove this source range; repeatable")
    p.add_argument("--keep", action="append", metavar="A-B",
                   help="keep only this source range; repeatable")
    p.add_argument("--reset", action="store_true", help="back to the whole source")
    p.add_argument("--no-remap", action="store_true",
                   help="leave segment times alone (they will be wrong)")
    p.set_defaults(func=cmd_clips)

    p = sub.add_parser("publish", help="publish the rendered mp4 to social platforms")
    p.add_argument("slug")
    p.add_argument("--to", default="youtube,instagram,tiktok",
                   help="comma list: youtube,instagram,tiktok")
    p.add_argument("--dry-run", action="store_true",
                   help="validate video + credentials without posting")
    p.add_argument("--force", action="store_true", help="repost even if already published")
    p.set_defaults(func=cmd_publish)

    p = sub.add_parser("captions", help="generate per-platform descriptions into publish.json")
    p.add_argument("slug")
    p.add_argument("--model", default="claude-opus-5")
    p.add_argument("--keywords", metavar="SEED",
                   help="also feed DataForSEO volumes for this seed into the prompt")
    p.add_argument("--force", action="store_true", help="overwrite existing text")
    p.add_argument("--print-only", action="store_true", help="print instead of writing")
    p.set_defaults(func=cmd_captions)

    p = sub.add_parser("keywords", help="keyword volumes via DataForSEO (caption/hashtag research)")
    p.add_argument("seed")
    p.add_argument("--limit", type=int, default=25)
    p.add_argument("--min-volume", type=int, default=30)
    p.set_defaults(func=cmd_keywords)

    p = sub.add_parser("ls", help="list projects")
    p.set_defaults(func=cmd_ls)

    p = sub.add_parser("timeline", help="dump a project timeline")
    p.add_argument("slug")
    p.set_defaults(func=cmd_timeline)

    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
