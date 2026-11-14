#!/usr/bin/env python3
"""Validate the new ZEE evolution dashboard and the preserved v4.1 studio."""
from html.parser import HTMLParser
from pathlib import Path
import json
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "model.html"
LEGACY = ROOT / "legacy" / "model-v4.1.html"
SCHEMA = ROOT / "schemas" / "zhi-ontology-draft-v1.schema.json"

DASHBOARD_MARKERS = [
    "数字生命演化实验室",
    "01 / IDENTITY", "02 / COGNITION", "03 / MEMORY",
    "04 / EVOLUTION", "05 / AGENCY",
    "./legacy/model-v4.1.html", "./admin.html", "./sip-engine/index.html",
]
LEGACY_REQUIRED_IDS = [
    "ontology-suite", "onto-id", "onto-type", "onto-label", "onto-epistemic",
    "onto-generate", "onto-download", "onto-copy", "onto-reset",
    "cognition-loop", "loop-hypothesis", "loop-observation", "loop-verdict",
    "loop-evaluate", "loop-rollback", "loop-reset", "loop-status", "loop-output",
]

class StructureParser(HTMLParser):
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input",
            "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.errors = []
        self.ids = set()
        self.script_count = 0
        self.script_depth = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            if attrs["id"] in self.ids:
                self.errors.append(f"Duplicate id: {attrs['id']}")
            self.ids.add(attrs["id"])
        if tag == "script":
            self.script_count += 1
            self.script_depth += 1
        if tag not in self.VOID:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag == "script":
            self.script_depth -= 1
            if self.script_depth < 0:
                self.errors.append("Unexpected closing script tag")
                self.script_depth = 0
        if tag in self.stack:
            while self.stack:
                if self.stack.pop() == tag:
                    break
        else:
            self.errors.append(f"Unexpected closing tag: </{tag}>")

def fail(message):
    print(f"FAIL: {message}")
    sys.exit(1)

def validate_html(path, required_ids=None):
    if not path.exists():
        fail(f"Required HTML file not found: {path.relative_to(ROOT)}")
    html = path.read_text(encoding="utf-8")
    parser = StructureParser()
    parser.feed(html)
    parser.close()
    if parser.errors:
        fail(f"{path.name}: " + "; ".join(parser.errors))
    if parser.stack:
        fail(f"{path.name}: unclosed HTML tags: " + ", ".join(parser.stack[-10:]))
    if parser.script_depth != 0:
        fail(f"{path.name}: script tags are not balanced")
    if required_ids:
        missing = sorted(set(required_ids) - parser.ids)
        if missing:
            fail(f"{path.name}: required controls missing: " + ", ".join(missing))
    scripts = re.findall(r"<script\\b[^>]*>(.*?)</script\\s*>", html, flags=re.I | re.S)
    if len(scripts) != parser.script_count:
        fail(f"{path.name}: extracted {len(scripts)} of {parser.script_count} script blocks")
    for index, source in enumerate(scripts, start=1):
        with tempfile.NamedTemporaryFile("w", suffix=".js", encoding="utf-8", delete=False) as temp:
            temp.write(source)
            temp_path = temp.name
        result = subprocess.run(["node", "--check", temp_path], capture_output=True, text=True)
        Path(temp_path).unlink(missing_ok=True)
        if result.returncode:
            fail(f"{path.name}: JavaScript block {index} failed node --check:\\n{result.stderr.strip()}")
    print(f"PASS: {path.relative_to(ROOT)} HTML structure; {len(parser.ids)} unique IDs; {len(scripts)} JS blocks.")

if not PAGE.exists() or not LEGACY.exists():
    fail("Both the new dashboard and archived v4.1 studio must exist.")
dashboard = PAGE.read_text(encoding="utf-8")
missing_markers = [marker for marker in DASHBOARD_MARKERS if marker not in dashboard]
if missing_markers:
    fail("Dashboard is missing required system/navigation markers: " + ", ".join(missing_markers))

node = subprocess.run(["node", "--version"], capture_output=True, text=True)
if node.returncode != 0:
    fail("Node.js is required for JavaScript syntax validation")

validate_html(PAGE)
validate_html(LEGACY, LEGACY_REQUIRED_IDS)

try:
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
except (OSError, json.JSONDecodeError) as exc:
    fail(f"Canonical ontology JSON Schema is invalid or missing: {exc}")
if schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
    fail("Ontology JSON Schema must declare JSON Schema draft 2020-12")
if "id" not in schema.get("properties", {}) or "ontology_type" not in schema.get("properties", {}):
    fail("Ontology JSON Schema is missing core record fields")

print("PASS: five-system dashboard markers and navigation links.")
print(f"PASS: {len(LEGACY_REQUIRED_IDS)} legacy studio controls remain available for regression and migration.")
print("PASS: canonical ontology JSON Schema is valid.")
