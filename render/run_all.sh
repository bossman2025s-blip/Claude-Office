#!/usr/bin/env bash
set -euo pipefail

UP="/root/.claude/uploads/ee168523-08ee-5ae2-bccc-77cb5f985153"
DIR="/home/user/Claude-Office/render"
FRAMES="$DIR/frames"
export NODE_PATH=/opt/node22/lib/node_modules

# label  input-file
JOBS=(
  "v1|$UP/03cb4e0b-adv1statementdark.html"
  "v2|$UP/cef6e476-adv2statementlight.html"
  "v3|$UP/959b9f17-adv3questiondark.html"
  "v4|$UP/57afb3b0-adv4questionlight_copy.html"
)

for job in "${JOBS[@]}"; do
  label="${job%%|*}"
  input="${job##*|}"
  out="$DIR/ad-${label}.mp4"
  echo "=================== $label ==================="
  echo "input: $input"

  node "$DIR/render.cjs" "$input" "$label" "$FRAMES"

  count=$(ls "$FRAMES"/frame_*.png | wc -l)
  echo "[$label] frame count: $count"
  if [ "$count" -ne 600 ]; then
    echo "[$label] ERROR: expected 600 frames, got $count" >&2
    exit 1
  fi

  ffmpeg -y -framerate 30 -i "$FRAMES/frame_%04d.png" \
    -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -movflags +faststart \
    "$out" -loglevel error
  echo "[$label] encoded -> $out"
  ffprobe -v error -select_streams v:0 \
    -show_entries stream=codec_name,width,height,pix_fmt,r_frame_rate,nb_frames,duration \
    -of default=noprint_wrappers=1 "$out"

  # Free disk before the next ad.
  rm -f "$FRAMES"/frame_*.png
  echo "[$label] cleaned frames"
done

echo "ALL DONE"
ls -la "$DIR"/ad-*.mp4
