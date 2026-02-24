#!/usr/bin/env bash
# Render a 15-second gource visualization of protoMaker
# Starting from the fork date (2026-02-04) through present
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

OUTPUT="${1:-gource.mp4}"
AVATAR_DIR=".gource/avatars"
FORK_DATE="2026-02-04"
TARGET_DURATION=30

# Calculate seconds-per-day for target duration
days_since_fork=$(python3 -c "
from datetime import date
d = (date.today() - date.fromisoformat('$FORK_DATE')).days
print(d)
")
spd=$(python3 -c "print(round($TARGET_DURATION / $days_since_fork, 2))")

echo "=== protoMaker Gource Render ==="
echo "Fork date:    $FORK_DATE"
echo "Days elapsed: $days_since_fork"
echo "Target:       ${TARGET_DURATION}s video"
echo "Speed:        ${spd}s per day"
echo "Output:       $OUTPUT"
echo ""

# Fetch avatars if directory is empty or missing
if [[ ! -d "$AVATAR_DIR" ]] || [[ -z "$(ls -A "$AVATAR_DIR" 2>/dev/null)" ]]; then
  echo "Fetching GitHub avatars..."
  bash scripts/fetch-gource-avatars.sh "$AVATAR_DIR"
  echo ""
fi

avatar_count=$(ls -1 "$AVATAR_DIR"/*.png 2>/dev/null | wc -l | tr -d ' ')
echo "Using $avatar_count avatars from $AVATAR_DIR"
echo "Rendering..."
echo ""

gource \
  --start-date "$FORK_DATE" \
  --seconds-per-day "$spd" \
  --auto-skip-seconds 0.5 \
  --stop-at-end \
  --disable-input \
  --disable-auto-rotate \
  --max-file-lag 0.8 \
  --elasticity 0.01 \
  --time-scale 0.5 \
  --max-user-speed 200 \
  --user-friction 1.0 \
  --title "protoMaker — 1,000 PRs in $days_since_fork Days" \
  --key \
  --multi-sampling \
  --bloom-multiplier 1.2 \
  --bloom-intensity 0.4 \
  --camera-mode overview \
  --padding 1.15 \
  --user-scale 1.5 \
  --user-image-dir "$AVATAR_DIR" \
  --highlight-users \
  --highlight-colour 7C3AED \
  --font-colour FFFFFF \
  --date-format "%b %d" \
  --hide mouse,filenames \
  --dir-name-depth 2 \
  --file-idle-time 3 \
  --max-files 0 \
  --background-colour 111111 \
  --font-size 18 \
  --file-filter "package-lock|\.automaker/memory" \
  --output-ppm-stream - \
  --output-framerate 60 \
  -1920x1080 \
  | ffmpeg -y -r 60 -f image2pipe -vcodec ppm -i - \
  -vcodec libx264 -preset medium -pix_fmt yuv420p \
  -crf 18 -movflags +faststart \
  "$OUTPUT"

echo ""
echo "Done! Output: $OUTPUT"
ls -lh "$OUTPUT"
