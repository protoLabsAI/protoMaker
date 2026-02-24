#!/usr/bin/env bash
# Fetch GitHub avatars for gource visualization
# Uses git log emails to find GitHub usernames, then downloads profile pictures
set -eo pipefail

AVATAR_DIR="${1:-.gource/avatars}"
mkdir -p "$AVATAR_DIR"

echo "Fetching GitHub avatars into $AVATAR_DIR..."

# Tab-separated: "Git Name<TAB>GitHub username"
USERS="Josh Mabry	mabry1985
Kacper	kacperlachowiczwp
Shirone	kacperlachowiczwp
Cody Seibert	WebDevCody
Web Dev Cody	WebDevCody
webdevcody	WebDevCody
WebDevCody	WebDevCody
DhanushSantosh	DhanushSantosh
Dhanush Santosh	DhanushSantosh
SuperComboGamer	SuperComboGamer
Stefan de Vogelaere	stefandevogelaere
Ben	trueheads
trueheads	trueheads
GTheMachine	GTheMachine
RayFernando	RayFernando1337
Rik Smale	WikiRik
James Botwina	JBotwina
James	JBotwina
jbotwina	JBotwina
Stephan Cho	stephan271c
Waaiez Kinnear	Waaiez
antdev	yumesha
yumesha	yumesha
Alec Koifman	SuperComboGamer
Anand (Andy) Houston	andydataguy
Soham Dasgupta	thesobercoder
Leon van Zyl	leonvanzyl
Tobias Weber	comzine
Illia Filippov	illia-filippov
Stephan Rieche	stephanrieche
USerik	USerik
M Zubair	labim34
Ramiro Rivera	ramarivera
Jay Zhou	jzilla808
Scott	tfodotcom
Mohamad Yahia	xyzt70
Manuel Grillo	manuelgrillo
Seonfx	Seonfx
shevanio	shevanio
DenyCZ	DenyCZ
eclipxe	eclipxe
firstfloris	firstfloris
Tony Nekola	tonynekola"

downloaded=0
skipped=0
failed=0

while IFS=$'\t' read -r name username; do
  output="$AVATAR_DIR/${name}.png"

  if [[ -f "$output" ]]; then
    skipped=$((skipped + 1))
    continue
  fi

  url="https://github.com/${username}.png?size=256"
  http_code=$(curl -sL -o "$output" -w "%{http_code}" "$url")
  if [[ "$http_code" == "200" ]]; then
    downloaded=$((downloaded + 1))
    echo "  + $name ($username)"
  else
    rm -f "$output"
    failed=$((failed + 1))
    echo "  x $name ($username) — HTTP $http_code"
  fi

  sleep 0.2
done <<< "$USERS"

echo ""
echo "Done: $downloaded downloaded, $skipped cached, $failed failed"
echo "Avatars in: $AVATAR_DIR"
