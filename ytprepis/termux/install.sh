#!/data/data/com.termux/files/usr/bin/bash
# Instalacia YT prepisov v Termuxe. Spustite raz:
#   curl -fsSL https://matodroid.github.io/ytprepis/termux/install.sh | bash
set -e
BASE="https://matodroid.github.io/ytprepis/termux"

pkg update -y
pkg install -y python termux-api nodejs
# yt-dlp-ejs + JS runtime (Node >= 22): YouTube vyzaduje riesenie JS vyziev, pozri
# https://github.com/yt-dlp/yt-dlp/wiki/EJS
pip install -U yt-dlp yt-dlp-ejs
node --version

mkdir -p "$HOME/bin"
curl -fsSL "$BASE/termux-url-opener" -o "$HOME/bin/termux-url-opener"
curl -fsSL "$BASE/vtt2txt.py" -o "$HOME/bin/vtt2txt.py"
chmod +x "$HOME/bin/termux-url-opener" "$HOME/bin/vtt2txt.py"

[ -d "$HOME/storage" ] || termux-setup-storage

echo
echo "Hotovo. V appke YouTube dajte Zdielat -> Termux."
