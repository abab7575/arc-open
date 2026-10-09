#!/usr/bin/env python3
"""Vendor the published UCP business-profile schemas (transitive $ref closure).

Usage: python3 packages/ucp-validator/vendor-ucp-schemas.py 2026-08-25
Writes src/schema/<release>/... Then update src/schemas.ts.
"""
import json, os, sys, urllib.request

release = sys.argv[1] if len(sys.argv) > 1 else "2026-08-25"
base = f"https://ucp.dev/{release}/schemas/"
out = os.path.join(os.path.dirname(__file__), "src", "schema", release)

def refs(node):
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "$ref" and isinstance(v, str):
                yield v
            else:
                yield from refs(v)
    elif isinstance(node, list):
        for v in node:
            yield from refs(v)

seen, todo = {}, ["profile.json"]
while todo:
    rel = todo.pop()
    if rel in seen:
        continue
    seen[rel] = json.loads(urllib.request.urlopen(base + rel).read())
    for ref in refs(seen[rel]):
        url = ref.split("#")[0]
        if url.startswith(base):
            todo.append(url[len(base):])
        elif url:
            print("external $ref left unresolved:", rel, ref)

for rel, doc in seen.items():
    path = os.path.join(out, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as fh:
        json.dump(doc, fh, indent=1)
        fh.write("\n")
print(f"{len(seen)} schemas -> {out}")
