#!/usr/bin/env bash
# Pripraví Python prostredie pre priestor v adresári python/.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
VENV="$ROOT/python/.venv"

if [ ! -x "$VENV/bin/python" ]; then
  python3 -m venv "$VENV"
fi

"$VENV/bin/python" -m pip install --upgrade pip
"$VENV/bin/pip" install -r "$ROOT/python/requirements.txt"

# Nový terminál nech má virtuálne prostredie už aktívne.
ACTIVATE="source $VENV/bin/activate"
if ! grep -qF "$ACTIVATE" "$HOME/.bashrc" 2>/dev/null; then
  printf '\n# venv pre Python skripty v tomto repozitári\n%s\n' "$ACTIVATE" >> "$HOME/.bashrc"
fi

echo "Hotovo. Python: $("$VENV/bin/python" --version)"
