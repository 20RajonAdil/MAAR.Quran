#!/usr/bin/env bash
# Runs the instrumented tests and, if anything fails, prints the reason as a visible annotation
# (so the failure can be read without downloading logs).
cd "$(dirname "$0")/.." || exit 1
set -o pipefail
./gradlew connectedDebugAndroidTest --stacktrace 2>&1 | tee /tmp/gradle.log
code=${PIPESTATUS[0]}
if [ "$code" -ne 0 ]; then
  {
    grep -nE "error:|^e: |What went wrong|Execution failed|Could not|Manifest merger|AAPT|INSTALL_FAILED|No connected devices" /tmp/gradle.log | head -25 | cut -c1-300
    python3 - <<'PY'
import glob, xml.etree.ElementTree as ET
n = 0
for f in glob.glob('app/build/outputs/androidTest-results/connected/**/*.xml', recursive=True):
    try:
        root = ET.parse(f).getroot()
    except Exception:
        continue
    for tc in root.iter('testcase'):
        bad = tc.find('failure')
        if bad is None:
            bad = tc.find('error')
        if bad is not None and n < 20:
            n += 1
            print('FAILED ' + tc.get('name') + ': ' + (bad.get('message') or (bad.text or ''))[:350].replace('\n', ' '))
PY
  } | sed ':a;N;$!ba;s/%/%25/g;s/\r//g;s/\n/%0A/g' > /tmp/why.txt
  echo "::error title=Emulator tests failed::$(cat /tmp/why.txt)"
fi
exit "$code"
