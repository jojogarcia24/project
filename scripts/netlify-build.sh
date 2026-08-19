#!/usr/bin/env bash
#
# Netlify build — an ALLOW-LIST of what this site serves.
#
# netlify.toml previously used `publish = "."`, which serves the repository
# itself, so the serverless function source was downloadable as a static file:
#
#   /netlify/functions/project.js
#   /README.md
#
# NOTE FOR ANYONE EDITING THIS: `netlify/` is excluded from the static copy ON
# PURPOSE, and the build fails if it reappears. Those files are .js, so a plain
# extension filter would republish the very thing this script exists to stop.
# Netlify still deploys them as functions — `functions = "netlify/functions"`
# resolves against the repo root, not the publish directory.
#
# Note the name collision: the site's own client-side /project.js and the
# function netlify/functions/project.js are different files. The root one is
# published; the function one is not.

set -euo pipefail

OUT="${1:-dist}"
rm -rf "$OUT"
mkdir -p "$OUT"

find . -path ./.git -prune -o -path ./netlify -prune -o -path ./node_modules -prune \
  -o -path "./$OUT" -prune -o -type f \
  \( -name '*.html' -o -name '*.css' -o -name '*.js' -o -name '*.mjs' \
     -o -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' -o -name '*.gif' \
     -o -name '*.webp' -o -name '*.svg' -o -name '*.ico' \
     -o -name '*.woff' -o -name '*.woff2' -o -name '*.ttf' \
     -o -name '*.xml' -o -name '*.txt' -o -name '*.webmanifest' -o -name '*.pdf' \) \
  -print0 |
while IFS= read -r -d '' f; do
  rel="${f#./}"
  mkdir -p "$OUT/$(dirname "$rel")"
  cp "$f" "$OUT/$rel"
done

rm -f "$OUT/package.json" "$OUT/package-lock.json"

LEAKED="$(find "$OUT" -type f \( -name '*.sql' -o -name '*.ts' -o -name '*.md' -o -name '*.sh' -o -name '.env*' \) -print)"
if [ -n "$LEAKED" ]; then
  echo "BUILD FAILED — these must not be published:" >&2
  echo "$LEAKED" >&2
  exit 1
fi
if [ -d "$OUT/netlify" ]; then
  echo "BUILD FAILED — serverless function sources must not be published" >&2
  exit 1
fi

echo "Published $(find "$OUT" -type f | wc -l | tr -d ' ') files to $OUT"
