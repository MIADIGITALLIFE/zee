#!/usr/bin/env python3
"""Validate the ZEE admin console's embedded JavaScript and ontology context UI."""
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "admin.html"
source = HTML.read_text(encoding="utf-8")

required = [
    'id="ontology-json"',
    'ontologyPayload.ontology_records=parsed',
    'ontologyPayload.ontology_record=parsed',
    'ontology_context_count',
]
missing = [item for item in required if item not in source]
if missing:
    raise SystemExit("Missing admin ontology integration markers: " + ", ".join(missing))

scripts = re.findall(r'<script\s+type="module">([\s\S]*?)</script>', source)
if len(scripts) != 1:
    raise SystemExit(f"Expected exactly one module script, found {len(scripts)}")

with tempfile.NamedTemporaryFile("w", suffix=".mjs", encoding="utf-8") as handle:
    handle.write(scripts[0])
    handle.flush()
    result = subprocess.run(
        ["node", "--check", handle.name],
        text=True,
        capture_output=True,
        check=False,
    )
if result.returncode:
    raise SystemExit(result.stderr or result.stdout or "Node syntax check failed")

print("Admin HTML integration markers and embedded module syntax: OK")
