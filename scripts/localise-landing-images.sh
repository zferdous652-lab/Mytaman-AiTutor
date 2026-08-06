#!/usr/bin/env bash
# Download the four landing-page photos and rewrite Landing.jsx to point at local copies.
#
# Why this is a script rather than a commit: the build environment has no route to
# images.unsplash.com or images.pexels.com, so the files could not be fetched there. Run
# this once from a machine that can reach them (the VM can) and commit the result.
#
#   bash scripts/localise-landing-images.sh
#   git add frontend/src/assets/landing frontend/src/pages/Landing.jsx && git commit
#
# Licensing: both the Unsplash and Pexels licences permit commercial use without
# attribution. Self-hosting removes the third-party request, the tracking that comes with
# it, and the chance of a homepage image 404-ing because someone else's CDN changed.
set -euo pipefail

cd "$(dirname "$0")/.."
OUT=frontend/src/assets/landing
mkdir -p "$OUT"

# name|url  -- resized server-side where the CDN supports it, so we store ~1200px, not 4000px
IMAGES=(
  "role-admin|https://images.pexels.com/photos/14314636/pexels-photo-14314636.jpeg?auto=compress&cs=tinysrgb&w=1200"
  "role-parent|https://images.unsplash.com/photo-1758525861536-15fb8a3ee629?fm=jpg&q=72&w=1200"
  "role-student|https://images.unsplash.com/photo-1760260627301-c92d64cb2a67?fm=jpg&q=72&w=1200"
  "about-circuits|https://images.pexels.com/photos/30547577/pexels-photo-30547577.jpeg?auto=compress&cs=tinysrgb&w=1200"
)

for entry in "${IMAGES[@]}"; do
  name="${entry%%|*}"; url="${entry#*|}"
  echo "fetching $name"
  curl -fsSL --max-time 60 "$url" -o "$OUT/$name.jpg"
  printf '  %s  %s\n' "$name.jpg" "$(du -h "$OUT/$name.jpg" | cut -f1)"
done

echo
echo "Rewriting Landing.jsx to import the local copies…"
python3 - <<'PY'
import re, pathlib
p = pathlib.Path("frontend/src/pages/Landing.jsx")
s = p.read_text()

mapping = {
    "images.pexels.com/photos/14314636": "roleAdminImg",
    "photo-1758525861536-15fb8a3ee629": "roleParentImg",
    "photo-1760260627301-c92d64cb2a67": "roleStudentImg",
    "images.pexels.com/photos/30547577": "aboutImg",
}
files = {
    "roleAdminImg": "role-admin",
    "roleParentImg": "role-parent",
    "roleStudentImg": "role-student",
    "aboutImg": "about-circuits",
}

for marker, var in mapping.items():
    # image="https://…"  ->  image={var}
    s = re.sub(r'image="[^"]*%s[^"]*"' % re.escape(marker), "image={%s}" % var, s)
    # src="https://…"    ->  src={var}
    s = re.sub(r'src="[^"]*%s[^"]*"' % re.escape(marker), "src={%s}" % var, s)

imports = "".join(
    f'import {v} from "@/assets/landing/{f}.jpg";\n' for v, f in files.items()
)
anchor = 'import { useLang } from "@/context/LangContext";\n'
if "assets/landing/" not in s:
    s = s.replace(anchor, anchor + imports, 1)

p.write_text(s)
print("  Landing.jsx updated")
PY

echo
echo "Done. Review with: git diff frontend/src/pages/Landing.jsx"
