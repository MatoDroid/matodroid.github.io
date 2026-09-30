# YT prepisy v Termuxe (Android)

Cloudflare Worker z dátového centra YouTube blokuje ako robota. Termux beží na
telefóne, takže požiadavka ide z vašej mobilnej IP a `yt-dlp` prepis získa.

## Inštalácia

1. Nainštalujte **Termux** a **Termux:API** z [F-Droid](https://f-droid.org/packages/com.termux/)
   (verzia z Google Play je zastaraná).
2. V Termuxe spustite:
   ```bash
   curl -fsSL https://matodroid.github.io/ytprepis/termux/install.sh | bash
   ```
   Povoľte prístup k súborom, keď ho Android vypýta.

## Použitie

V appke YouTube pri videu dajte **Zdieľať → Termux**. Prepis sa uloží do
`Stiahnuté/YT-prepisy/<názov videa>.txt` a hneď sa otvorí menu Zdieľať, kde
vyberiete Claude.

## Nastavenia

Premenné prostredia (napríklad v `~/.bashrc`):

- `YTPREPIS_LANGS=sk,cs,en` – poradie jazykov titulkov
- `YTPREPIS_DIR=/cesta/k/priecinku` – kam sa ukladá

## Keď to nejde

- „Video nemá dostupné titulky“ – autor ich vypol.
- Chyba yt-dlp – skript sa sám pokúsi o `pip install -U yt-dlp`; YouTube ho
  mení často, takže aktualizácia býva riešením.
