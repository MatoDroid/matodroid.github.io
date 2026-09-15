"""Šablóna pre nový skript: prečíta CSV z python/data/ a zapíše výsledok vedľa.

Spustenie:
    python python/scripts/sablona.py vstup.csv --vystup vysledok.csv
"""

import argparse
import csv
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"


def spracuj(riadok: dict[str, str]) -> dict[str, str]:
    """Tu uprav logiku pre vlastné spracovanie jedného riadku."""
    return riadok


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("vstup", help="názov CSV súboru v python/data/")
    parser.add_argument(
        "--vystup", default="vystup.csv", help="názov výstupného CSV v python/data/"
    )
    parser.add_argument("--oddelovac", default=",", help="oddeľovač v CSV")
    args = parser.parse_args()

    cesta_vstup = DATA / args.vstup
    cesta_vystup = DATA / args.vystup

    if not cesta_vstup.exists():
        raise SystemExit(f"Súbor {cesta_vstup} neexistuje. Nakopíruj ho do python/data/.")

    with cesta_vstup.open(newline="", encoding="utf-8-sig") as f:
        citac = csv.DictReader(f, delimiter=args.oddelovac)
        riadky = [spracuj(riadok) for riadok in citac]

    if not riadky:
        raise SystemExit("Vstup neobsahuje žiadne riadky.")

    with cesta_vystup.open("w", newline="", encoding="utf-8") as f:
        zapisovac = csv.DictWriter(f, fieldnames=list(riadky[0]), delimiter=args.oddelovac)
        zapisovac.writeheader()
        zapisovac.writerows(riadky)

    print(f"Zapísaných {len(riadky)} riadkov do {cesta_vystup}")


if __name__ == "__main__":
    main()
