"""Overenie, že Python priestor funguje.

Spustenie:  python python/scripts/hello.py
"""

import platform
import sys


def main() -> None:
    print(f"Python {platform.python_version()} ({sys.executable})")

    for modul in ("requests", "pandas"):
        try:
            __import__(modul)
        except ImportError:
            print(f"  {modul}: chýba (pip install -r python/requirements.txt)")
        else:
            print(f"  {modul}: OK")


if __name__ == "__main__":
    main()
