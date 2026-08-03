#!/usr/bin/env bash
# Entry point — creates the venv on first run, then forwards to sg.cli.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$ROOT/.venv"

if [ ! -x "$VENV/bin/python" ]; then
  echo "[sg] criando venv em $VENV"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q --upgrade pip
  "$VENV/bin/pip" install -q -r "$ROOT/requirements.txt"
  "$VENV/bin/python" -m playwright install-deps chromium 2>/dev/null || true
fi

# ctranslate2 (faster-whisper) loads cuBLAS/cuDNN from the nvidia pip wheels,
# which sit outside the default loader path.
NVLIB="$(ls -d "$VENV"/lib/python*/site-packages/nvidia/*/lib 2>/dev/null | tr '\n' ':')"
export LD_LIBRARY_PATH="${NVLIB}${LD_LIBRARY_PATH:-}"

exec "$VENV/bin/python" -m sg.cli "$@"
