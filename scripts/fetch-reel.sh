#!/bin/bash
# Fetches a public reel while logged out and prepares material for recipe extraction:
# thumbnail, metadata (<id>.info.json, includes the caption), audio transcript and a strip
# of frames. The video itself is deleted afterwards.
# Usage: scripts/fetch-reel.sh <reel-url> <work-dir>
# Needs: yt-dlp, ffmpeg, whisper-cli (brew install yt-dlp ffmpeg whisper-cpp)
#        WHISPER_MODEL pointing to a ggml model, e.g. ggml-base.bin
set -euo pipefail
url=$1; work=$2
id=$(echo "$url" | sed -E 's#.*/(reels?|p)/([^/?]+).*#\2#')
mkdir -p "$work"
cd "$work"

# --ignore-config/--no-cookies*: never use a logged-in session
yt-dlp --ignore-config --no-cookies --no-cookies-from-browser --quiet --no-warnings \
  --write-thumbnail --convert-thumbnails jpg --write-info-json -o "$id.%(ext)s" "$url" < /dev/null \
  || echo "download failed: $id" >&2

video=$(ls "$id".mp4 2>/dev/null || true)
if [ -n "$video" ]; then
  if ffmpeg -nostdin -loglevel error -y -i "$video" -ar 16000 -ac 1 "$id.wav" 2>/dev/null; then
    whisper-cli -m "$WHISPER_MODEL" -l auto -nt -np -otxt -of "$id" "$id.wav" >/dev/null 2>&1
    rm -f "$id.wav"
  fi
  duration=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$video")
  ffmpeg -nostdin -loglevel error -y -i "$video" -vf "fps=8/$duration,scale=200:-1,tile=4x2" -frames:v 1 "$id.frames.jpg"
  rm -f "$video"
fi
ls "$id".* 2>/dev/null
