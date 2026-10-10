set +x
atlas_script_dir=${0:A:h}
set -a
source "$atlas_script_dir/../../.env" >/dev/null 2>&1
atlas_source_status=$?
set +x
set +a
if (( atlas_source_status != 0 )); then
  print -ru2 -- 'Unable to load the shared Atlas environment.'
  exit "$atlas_source_status"
fi
python3 - <<'PY'
import json, os, sys

key = os.environ.get("ATLAS_API_KEY")
if not key:
    print("ATLAS_API_KEY is missing from the shared environment.", file=sys.stderr)
    raise SystemExit(1)
print(json.dumps({"Authorization": "Bearer " + key}))
PY
