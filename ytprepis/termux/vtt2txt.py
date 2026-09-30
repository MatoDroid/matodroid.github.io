#!/usr/bin/env python3
"""Premeni titulky WebVTT z YouTube na cisty text.

Pouzitie: vtt2txt.py subor.vtt  > vystup.txt
"""
import html
import re
import sys

TIME = re.compile(r"^\d{1,2}:\d{2}(:\d{2})?\.\d{3}\s+-->")
TAGS = re.compile(r"<[^>]+>")


def lines_of(path):
    with open(path, encoding="utf-8") as f:
        for raw in f:
            s = raw.strip()
            if not s or s == "WEBVTT" or TIME.match(s):
                continue
            if s.startswith(("Kind:", "Language:", "NOTE", "STYLE")) or s.isdigit():
                continue
            s = html.unescape(TAGS.sub("", s)).strip()
            s = re.sub(r"\s+", " ", s)
            if s:
                yield s


def main():
    out, last = [], ""
    for s in lines_of(sys.argv[1]):
        # Automaticke titulky opakuju predchadzajuci riadok v kazdej replike.
        if s == last:
            continue
        out.append(s)
        last = s
    # Odsek po par riadkoch, nech sa to da citat.
    para = [" ".join(out[i:i + 8]) for i in range(0, len(out), 8)]
    sys.stdout.write("\n\n".join(para) + "\n")


if __name__ == "__main__":
    main()
