#!/bin/bash
# Resizes a reel thumbnail into public/photos/<id>.jpg (480 px wide).
# Usage: scripts/add-photo.sh <thumbnail.jpg> <recipe-id>
set -euo pipefail
sips -s format jpeg -s formatOptions 70 --resampleWidth 480 "$1" --out "public/photos/$2.jpg" >/dev/null
