#!/usr/bin/env python3
"""Lightweight static checks for the offline ZEE model.html prototype."""
from html.parser import HTMLParser
from pathlib import Path
import re
import json
import subprocess
import sys
import tempfile

PAGE = Path("model.html")
REQUIRED_IDS = [
    "ontology-suite", "onto-id", "onto-type", "onto-label", "onto-epistemic",
    "onto-generate", "onto-download", "onto-copy", "onto-reset",
    "cognition-loop", "loop-hypothesis", "loop-observation", "loop-verdict",
    "loop-evaluate", "loop-rollback", "loop-reset", "loop-status", "loop-output",
]

class StructureParser(HTMLParser):
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
        if tag not in {"area", "base", "br", "col", "embed", "hr", "img", "input",
                       "link", "meta", "param", "source", "track", "wbr"}:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag == "script":
            self.script_depth -= 1
            if self.script_depth < 0:
                self.errors.append("Unexpected closing script tag")
                self.script_depth = 0
        if tag in self.stack:
            while self.stack:
                popped = self.stack.pop()
                if popped == tag:
                    break
        else:
            self.errors.append(f"Unexpected closing tag: </{tag}>")

def fail(message):
    print(f"FAIL: {message}")
    sys.exit(1)

if not PAGE.exists():
    fail("model.html not found at repository root")

if not SCHEMA.exists():
    fail("Canonical ontology JSON Schema not found")
try:
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
except json.JSONDecodeError as exc:
    fail(f"Canonical ontology JSON Schema is invalid JSON: {exc}")
if schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
    fail("Ontology JSON Schema must declare JSON Schema draft 2020-12")
if "id" not in schema.get("properties", {}) or "ontology_type" not in schema.get("properties", {}):
    fail("Ontology JSON Schema is missing core record fields")

html = PAGE.read_text(encoding="utf-8")
parser = StructureParser()
parser.feed(html)
parser.close()

if parser.errors:
    fail("; ".join(parser.errors))
if parser.stack:
    fail("Unclosed HTML tags: " + ", ".join(parser.stack[-10:]))
if parser.script_depth != 0:
    fail("Script tags are not balanced")

missing = sorted(set(REQUIRED_IDS) - parser.ids)
if missing:
    fail("Required controls missing: " + ", ".join(missing))

scripts = re.findall(r"<script\b[^>]*>(.*?)</script\s*>", html, flags=re.I | re.S)
if len(scripts) != parser.script_count:
    fail(f"Could not extract all script blocks: parsed {parser.script_count}, extracted {len(scripts)}")

node = subprocess.run(["node", "--version"], capture_output=True, text=True)
if node.returncode != 0:
    fail("Node.js is required for JavaScript syntax validation")

for index, source in enumerate(scripts, start=1):
    with tempfile.NamedTemporaryFile("w", suffix=".js", encoding="utf-8", delete=False) as temp:
        temp.write(source)
        temp_path = temp.name
    result = subprocess.run(["node", "--check", temp_path], capture_output=True, text=True)
    Path(temp_path).unlink(missing_ok=True)
    if result.returncode != 0:
        fail(f"JavaScript block {index} has a syntax error:\\n{result.stderr.strip()}")

print(f"PASS: HTML structure; {len(parser.ids)} unique IDs; {len(scripts)} JavaScript blocks parsed.")
print(f"PASS: {len(REQUIRED_IDS)} required UI IDs are present.")
print("PASS: all embedded JavaScript blocks pass node --check.")
print("PASS: canonical ontology JSON Schema is valid JSON and declares required core fields.")
print("NOTE: these are static checks, not real browser interaction or visual regression tests.")
