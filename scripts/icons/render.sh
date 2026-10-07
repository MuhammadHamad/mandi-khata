#!/bin/sh
# Renders the app icons in public/icons from public/favicon.svg and scripts/icons/full.svg
# with headless Chrome. Run from the project root: sh scripts/icons/render.sh
set -e
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TMP=$(mktemp -d)
render() { # svg size out
  printf '<html><body style="margin:0;background:transparent"><img src="file://%s" width="%s" height="%s"></body></html>' "$PWD/$1" "$2" "$2" > "$TMP/page.html"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 \
    --user-data-dir="$TMP/profile" --window-size="$2,$2" --screenshot="$PWD/$3" "file://$TMP/page.html" >/dev/null 2>&1
}
render public/favicon.svg 192 public/icons/icon-192.png
render public/favicon.svg 512 public/icons/icon-512.png
render scripts/icons/full.svg 512 public/icons/maskable-512.png
render scripts/icons/full.svg 180 public/icons/apple-touch-icon.png
rm -rf "$TMP"
