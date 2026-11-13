# Renders docs/diagrams/NAME.html to src/pic/NAME.png with headless Chrome.
#   bash docs/diagrams/render.sh 07 1800 1060   (08: 1800 1010, 09: 1800 1060, 10: 1800 1040)
D="$(cd "$(dirname "$0")" && pwd -W 2>/dev/null || pwd)"
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=$2,$3 --screenshot="$D/../../src/pic/$1.png" "file:///$D/$1.html" 2>/dev/null
