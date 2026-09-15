# Python priestor

Miesto na spúšťanie Python skriptov v tomto repozitári (Codespace alebo lokálne).
Zvyšok repozitára je statická stránka pre GitHub Pages — tá sa týmto nijako nemení.

## Štruktúra

```
python/
├── requirements.txt   # knižnice
├── scripts/           # tu píš svoje skripty
│   ├── hello.py       # overenie, že prostredie funguje
│   └── sablona.py     # šablóna: CSV dovnútra → CSV von
└── data/              # vstupy a výstupy (obsah je mimo gitu)
```

## V Codespace

Devcontainer (`.devcontainer/`) po vytvorení Codespace sám pripraví virtuálne
prostredie `python/.venv` a nainštaluje `requirements.txt`. Nový terminál ho má
už aktívne, takže stačí:

```bash
python python/scripts/hello.py
```

Ak Codespace bežal ešte pred pridaním devcontaineru, spusti raz
**Codespaces: Rebuild Container** (Ctrl+Shift+P), alebo ručne:

```bash
bash .devcontainer/setup.sh
source python/.venv/bin/activate
```

## Lokálne

```bash
python3 -m venv python/.venv
source python/.venv/bin/activate
pip install -r python/requirements.txt
```

## Nový skript

```bash
cp python/scripts/sablona.py python/scripts/moj_skript.py
python python/scripts/moj_skript.py vstup.csv --vystup vysledok.csv
```

Pridanie knižnice: dopíš ju do `python/requirements.txt` a spusti
`pip install -r python/requirements.txt`.

## Tajné údaje

API kľúče drž v `python/.env` (je v `.gitignore`) a čítaj ich cez
`python-dotenv`:

```python
from dotenv import load_dotenv
import os

load_dotenv()
kluc = os.environ["MOJ_API_KLUC"]
```
