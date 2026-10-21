#!/bin/bash
# Lance les tests UN PAR UN (ports fixes : jamais en parallèle). Usage : bash tests/run-tests.sh [fichier.mjs …]  (sans argument : tout ; --node : sans navigateur)
# Résumé dans tests/run-tests.out, log de chaque test dans tests/logs/<test>.txt. Code retour 1 si un test échoue.
# Lancé depuis n'importe où : se place à la racine du dépôt. Un nouveau test s'ajoute ici : la CI lance ces listes.
# Navigateur des tests (playwright-core) : CHROMIUM, sinon Chrome de Windows s'il existe, sinon /opt/pw-browsers/chromium.
cd "$(dirname "$0")/.." || exit 1
if [ -z "$CHROMIUM" ]; then
  if [ -x "C:/Program Files/Google/Chrome/Application/chrome.exe" ] || [ -f "C:/Program Files/Google/Chrome/Application/chrome.exe" ]; then CHROMIUM="C:/Program Files/Google/Chrome/Application/chrome.exe"; else CHROMIUM=/opt/pw-browsers/chromium; fi
fi
export CHROMIUM
mkdir -p tests/logs; : > tests/run-tests.out
NODE=(test-gen.mjs test-qr.mjs test-core.mjs test-decks.mjs test-games.mjs test-scan.mjs test-progress.mjs test-i18n.mjs)
BROWSER=(app-e2e.mjs back-e2e.mjs pwa-e2e.mjs scan-e2e.mjs rules-test.mjs sync-e2e.mjs)
T=("$@")
if [ ${#T[@]} -eq 0 ]; then T=("${NODE[@]}" "${BROWSER[@]}"); elif [ "$1" = --node ]; then T=("${NODE[@]}"); fi
fail=0
for t in "${T[@]}"; do
  f=(); grep -q "from 'node:test'" "tests/$t" && f=(--test-force-exit)      # node:test : sortie dès le dernier test fini (même code retour)
  s=$(date +%s); timeout 420 node "${f[@]}" "tests/$t" > "tests/logs/$t.txt" 2>&1; rc=$?
  echo "$t rc=$rc $(( $(date +%s)-s ))s" | tee -a tests/run-tests.out
  if [ $rc -ne 0 ]; then fail=$((fail+1)); tail -n 30 "tests/logs/$t.txt" | sed 's/^/    │ /'; fi      # fin du log lisible dans le journal de la CI
done
echo "FIN (échecs : $fail)" | tee -a tests/run-tests.out
[ $fail -eq 0 ]
