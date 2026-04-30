"""One-shot: extract secret env vars from running Cloud Run revision and
upload them to Google Secret Manager. Uses stdin pipe so values never appear
on the shell command line. Run once then delete this file (or .gitignore it).
"""
import json
import subprocess
import sys

data = json.load(open("scripts/cr.json", encoding="utf-8"))
# revision describe は spec.containers[0].env、 service describe は spec.template.spec.containers[0].env
spec = data.get("spec", {})
if "template" in spec:
    env = spec["template"]["spec"]["containers"][0]["env"]
else:
    env = spec["containers"][0]["env"]

mapping = {
    "DATABASE_URL": "sevenboard-prod-database-url",
    "DIRECT_URL": "sevenboard-prod-direct-url",
    "JWT_SECRET": "sevenboard-prod-jwt-secret",
    "MF_CLIENT_SECRET": "sevenboard-prod-mf-client-secret",
    "GOOGLE_AI_API_KEY": "sevenboard-prod-google-ai-api-key",
    "KINTONE_USERNAME": "sevenboard-prod-kintone-username",
    "KINTONE_PASSWORD": "sevenboard-prod-kintone-password",
    "SUPABASE_URL": "sevenboard-prod-supabase-url",
    "SUPABASE_SERVICE_ROLE_KEY": "sevenboard-prod-supabase-service-role-key",
}

for e in env:
    name = e.get("name")
    value = e.get("value")
    if name not in mapping or value is None:
        continue
    secret_name = mapping[name]
    sys.stdout.write("creating " + secret_name + " ... ")
    sys.stdout.flush()
    # versions add: 既存 secret に新 version を追加 (v1 が cp932 で壊れてたため UTF-8 で v2 を投入)
    # input は bytes で渡して encoding 事故を避ける
    p = subprocess.run(
        [
            "gcloud", "secrets", "versions", "add", secret_name,
            "--project", "sevenboard",
            "--data-file", "-",
        ],
        input=value.encode("utf-8"),
        capture_output=True,
        shell=True,
    )
    if p.returncode == 0:
        print("OK")
    else:
        print("FAILED")
        err = p.stderr.decode("utf-8", errors="replace") if isinstance(p.stderr, bytes) else (p.stderr or "")
        print("  stderr:", err.strip()[:200])
