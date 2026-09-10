# Worker pre YT prepisy

Malá služba pre [YT prepisy](https://matodroid.github.io/ytprepis/), ktorá beží
na Cloudflare Workers. Aplikácia v prehliadači nesmie volať YouTube priamo
(YouTube neposiela hlavičky CORS), preto sa spýta tohto workera a ten jej vráti
hotové titulky.

Bez workera aplikácia funguje tiež, ale spolieha sa na verejné zrkadlá Invidious
a Piped, ktoré bývajú preťažené alebo blokované. S vlastným workerom nezávisí od
nikoho cudzieho.

## Nasadenie cez webové rozhranie (netreba nič inštalovať)

1. Prihláste sa na [workers.cloudflare.com](https://workers.cloudflare.com/).
   Stačí bezplatný účet, kartu nepýta.
2. **Create** → **Start with Hello World** → **Deploy**.
3. **Edit code**, obsah súboru nahraďte obsahom [`worker.js`](worker.js) a dajte **Deploy**.
4. Skopírujte adresu workera, napríklad `https://ytprepis-worker.vasemeno.workers.dev`.
5. Otvorte ju v prehliadači. Ak vidíte `{"ok":true,"service":"ytprepis-worker"}`,
   worker beží.
6. Adresu vložte v aplikácii do poľa **Adresa vlastného workera** a dajte **Otestovať**.

## Nasadenie z príkazového riadka

```bash
cd ytprepis/worker
npx wrangler deploy
```

Pri prvom spustení si `wrangler` vyžiada prihlásenie do Cloudflare.

## Endpointy

| Adresa | Čo vráti |
| --- | --- |
| `/` | `{"ok":true,...}` – na overenie, že worker beží |
| `/api/video?v=ID` | prepis videa ako JSON: `title`, `author`, `lang`, `cues[]` |
| `/api/playlist?list=ID` | zoznam videí v playliste |
| `/api/proxy?url=ADRESA` | obyčajné preposlanie s hlavičkou CORS |

Nepovinné parametre pre `/api/video`:

- `langs=sk,cs,en` – poradie preferovaných jazykov
- `asr=0` – nepoužiť automatické titulky
- `tlang=en` – nechať YouTube titulky preložiť

Príklad odpovede:

```json
{
  "id": "dQw4w9WgXcQ",
  "title": "Názov videa",
  "author": "Názov kanála",
  "lang": "sk",
  "kind": "manual",
  "cues": [{ "start": 0, "dur": 1.5, "text": "Prvá veta." }]
}
```

Keď sa titulky nepodarí získať, odpoveď obsahuje pole `error` s dôvodom.

## Ako to funguje

1. Stiahne stránku videa a vytiahne z nej `ytInitialPlayerResponse`.
2. Ak stránka údaje nedá (napríklad kvôli kontrole robotov), skúsi rozhranie
   prehrávača `youtubei/v1/player` s klientom pre Android.
3. Zo zoznamu titulkových stôp vyberie tú, ktorá najlepšie sedí na požadované
   jazyky, a stiahne ju vo formáte `json3`; pri neúspechu skúsi XML.

## Limity a poznámky

- Bezplatná úroveň Cloudflare zvláda 100 000 požiadaviek denne. Jedno video
  spotrebuje dve až tri.
- Worker nemá žiadny stav ani úložisko a nič si nezapisuje.
- Adresa je verejná, takže ju môže použiť ktokoľvek, kto ju pozná. Ak vám to
  prekáža, obmedzte prístup v Cloudflare (napríklad pravidlom podľa hlavičky
  `Origin`).
- Ak YouTube blokuje dátové centrum, cez ktoré Cloudflare požiadavku posiela,
  ani worker nepomôže. Vtedy zostáva nástroj bežiaci na vlastnom počítači,
  napríklad `yt-dlp --write-auto-subs --skip-download`.
