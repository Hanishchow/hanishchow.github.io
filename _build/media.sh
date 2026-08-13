#!/usr/bin/env bash
# ============================================================
#   MEDIA PIPELINE — source footage in, site assets out.
#
#   clip <src> <id> <start> [seconds]
#        A muted loop for the console screen, plus the poster
#        pulled from the clip itself so still and motion match.
#
#   still <src> <id>
#        A poster-only entry. No video; the slot shows the frame.
#
#   fetch <url> <id> <start> [seconds]
#        Same as `clip`, but pulls the source with yt-dlp first.
#
#   Every output is written under assets/. Sources are never
#   modified and never leave _incoming/.
# ============================================================
set -euo pipefail

FF="$LOCALAPPDATA/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0-full_build/bin"
[ -d "$FF" ] && PATH="$FF:$PATH"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REELS="$ROOT/assets/reels"
WORKS="$ROOT/assets/works"
TMP="$ROOT/_build/.tmp"
mkdir -p "$REELS" "$WORKS" "$TMP"

DUR=6          # loop length, seconds
LONG=1080      # long-edge ceiling; sources smaller than this are never upscaled
PQ=3           # poster JPEG quality (2 = best)
MAXKB=1500    # per-clip budget; the encoder steps quality down to meet it

# scale filter that clamps the long edge without upscaling and keeps
# dimensions even (H.264 requires it)
SCALE="scale='if(gt(iw,ih),min(iw,$LONG),-2)':'if(gt(iw,ih),-2,min(ih,$LONG))':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2"

_encode() {  # <src> <id> <start> <seconds>
  local src="$1" id="$2" ss="$3" t="$4"

  # iPhone footage is HLG HDR (arib-std-b67 / bt2020 / 10-bit). Handing that
  # straight to an SDR H.264 encoder does not fail — it silently produces flat,
  # washed-out, desaturated video, because the encoder reinterprets HLG code
  # values as if they were Rec.709. So: linearise, tone-map to SDR with Hable,
  # then land in bt709. Detected rather than assumed, so ordinary SDR sources
  # skip the whole chain and are untouched.
  local transfer tonemap=""
  transfer="$(ffprobe -v error -select_streams v:0 -show_entries stream=color_transfer \
              -of default=nw=1:nk=1 "$src" 2>/dev/null)"
  case "$transfer" in
    arib-std-b67|smpte2084)
      tonemap="zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,\
tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv," ;;
  esac

  # Encode to a budget rather than to a fixed quality. A bright, high-motion
  # clip needs far more bits than a static one for the same CRF, so a single
  # setting either bloats the busy clips or wastes quality on the calm ones.
  # Step the quality down only as far as the budget actually requires.
  local crf
  for crf in 26 29 32 35; do
    ffmpeg -y -v error -ss "$ss" -t "$t" -i "$src" \
      -an -sn -dn \
      -vf "${tonemap}${SCALE}" \
      -c:v libx264 -profile:v high -pix_fmt yuv420p \
      -crf "$crf" -preset slow -g 48 \
      -movflags +faststart \
      "$REELS/$id.mp4"
    [ "$(du -k "$REELS/$id.mp4" | cut -f1)" -le "$MAXKB" ] && break
  done
  # poster from the clip's own first usable frame, not from the source
  ffmpeg -y -v error -ss 0.5 -i "$REELS/$id.mp4" -frames:v 1 -q:v "$PQ" "$WORKS/$id.jpg"
}

clip() {  # <src> <id> <start> [seconds]
  local src="$1" id="$2" ss="$3" t="${4:-$DUR}"
  [ -f "$src" ] || { echo "  ! missing source: $src" >&2; return 1; }
  _encode "$src" "$id" "$ss" "$t"
  _report "$id" video
}

still() {  # <src> <id>
  local src="$1" id="$2"
  [ -f "$src" ] || { echo "  ! missing source: $src" >&2; return 1; }

  # HEIC/HEIF decode through an internal complex filtergraph, and ffmpeg refuses
  # to hang a simple -vf off one. Decode to a lossless intermediate first, then
  # scale that. iPhone stills arrive this way, so this is the common path.
  case "${src,,}" in
    *.heic|*.heif)
      local raw="$TMP/$id.decoded.png"
      ffmpeg -y -v error -i "$src" "$raw"
      src="$raw" ;;
  esac

  ffmpeg -y -v error -i "$src" -vf "$SCALE" -frames:v 1 -q:v "$PQ" "$WORKS/$id.jpg"
  _report "$id" still
}

fetch() {  # <url> <id> <start> [seconds]
  local url="$1" id="$2" ss="$3" t="${4:-$DUR}"
  local dl="$TMP/$id.src.mp4"
  yt-dlp -q --no-warnings -f "bv*+ba/b" --merge-output-format mp4 -o "$dl" "$url"
  _encode "$dl" "$id" "$ss" "$t"
  _report "$id" video
}

_report() {  # <id> <kind>
  local id="$1" kind="$2" v="" p=""
  p="$(du -k "$WORKS/$id.jpg" | cut -f1)"
  if [ "$kind" = video ]; then
    v="$(du -k "$REELS/$id.mp4" | cut -f1)"
    local dim
    dim="$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height \
           -of csv=p=0:s=x "$REELS/$id.mp4" | tr -d "
" | sed "s/x$//")"
    printf '  %-12s %-10s mp4 %5s KB   poster %4s KB\n' "$id" "$dim" "$v" "$p"
    if [ "$v" -gt "$MAXKB" ]; then echo "     ! still over budget at the lowest quality step" >&2; fi
  else
    printf '  %-12s %-10s              poster %4s KB\n' "$id" "still" "$p"
  fi
}

# ------------------------------------------------------------
#  BUILD — edit below to add works. Windows chosen by measuring
#  per-second luminance, not by eye (see git history).
# ------------------------------------------------------------
if [ "${1:-}" = "--run" ]; then
  SRC="${2:-$ROOT/_incoming}"
  echo "sources: $SRC"

  clip  "$SRC/VID-20250810-WA0031~2.mp4" artemis 14.0
  clip  "$SRC/VID-20250810-WA0049.mp4"   frontrow 9.0
  still "$SRC/IMG_5404.HEIC"             stands
  still "$SRC/IMG-20251003-WA0156.jpg"   coast
  still "$SRC/IMG_20240831_092155.jpg"   circle

  # Concert night. Windows chosen by scoring every 6s span on mean luminance
  # with a penalty for dipping to black, not by scrubbing. All portrait except
  # c-wide, which is the only landscape (and 4K) source.
  CON="${CONCERT:-C:/Users/yakka/Downloads/@2026/conecert}"
  clip "$CON/IMG_4381.MOV" c-lights   10.0
  clip "$CON/IMG_4347.MOV" c-stage   211.0
  clip "$CON/IMG_4367.MOV" c-hands    11.0
  clip "$CON/IMG_4349.MOV" c-pit      23.0
  clip "$CON/IMG_4351.MOV" c-wide      0.0
  clip "$CON/IMG_4354.MOV" c-encore   66.0
  clip "$CON/IMG_4382.MOV" c-flare     0.0
  clip "$CON/IMG_4326.MOV" c-crowd     0.0

  rm -rf "$TMP"
  echo "done."
fi
