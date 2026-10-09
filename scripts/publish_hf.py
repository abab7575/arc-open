#!/usr/bin/env python3
"""Mirror ARC's open dataset (https://www.arcreport.ai/data) to a Hugging Face dataset repo.

Default target: ArcReport/arc-agent-commerce (CC-BY-4.0).

  python3 scripts/publish_hf.py --dry-run --out ./hf-staging   # build the files only, no upload
  HF_TOKEN=hf_xxx python3 scripts/publish_hf.py                  # build + upload (needs: pip install huggingface_hub)

Layout on the Hub:
  README.md                      dataset card (YAML metadata + schema, method, versioning, citation)
  latest/<table>.csv|.parquet    newest snapshot (what `load_dataset` reads)
  versions/<version>/...         every immutable snapshot ARC has published, byte for byte
  versions.json                  index of versions (from arcreport.ai)
Each upload also tags the Hub repo with the snapshot version (e.g. v2026-10-07.r5) so exact numbers stay citable.

Building the files uses only the Python standard library. Uploading imports huggingface_hub lazily.
"""
import argparse, json, os, re, shutil, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = "https://www.arcreport.ai"
DEFAULT_REPO = "ArcReport/arc-agent-commerce"
CARD = ROOT / "docs" / "dataset-card.md"
UA = "arc-open-publish-hf/0.1 (+https://github.com/abab7575/arc-open)"

TABLE_DESC = {
    "stores": "Latest completed ARC Index result per store (browser cart test: score, personas that carted, failure label).",
    "rails_checks": "Latest HTTP agent check per store domain (UCP profile, WebMCP, storefront MCP, catalog tool, cart link, checkout WebMCP).",
    "adoption_history": "Weekly aggregate counts by source and metric (long format).",
    "personas": "The five ARC browser shopper personas (A to E) with legacy alias ids.",
    "protocol_matrix": "Declared / Valid / Usable / Transacts counts per protocol with evidence labels.",
}


def get(url: str) -> bytes:
    if not url.startswith(("http://", "https://")):
        return Path(url).read_bytes()  # local --source (e.g. a checkout's public/ folder)
    req = urllib.request.Request(url, headers={"user-agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def get_json(url: str):
    return json.loads(get(url))


def size_category(rows: int) -> str:
    return "n<1K" if rows < 1_000 else "1K<n<10K" if rows < 10_000 else "10K<n<100K" if rows < 100_000 else "100K<n<1M"


def build_card(manifest: dict, versions: list, repo: str) -> str:
    tables = [f["name"] for f in manifest["files"]]
    biggest = max(f["rows"] for f in manifest["files"])
    version = manifest.get("snapshot_version") or manifest["snapshot_date"]
    year = manifest["snapshot_date"][:4]
    yaml = ["---", "license: cc-by-4.0", "pretty_name: ARC Agent Commerce Index", "language:", "- en",
            "tags:", *[f"- {t}" for t in ["agentic-commerce", "ai-agents", "e-commerce", "benchmark", "ucp", "mcp", "webmcp", "tabular"]],
            "size_categories:", f"- {size_category(biggest)}", "configs:"]
    for i, t in enumerate(tables):
        yaml += [f"- config_name: {t}", f"  data_files: latest/{t}.parquet"]
        if t == "rails_checks":
            yaml.append("  default: true")
    yaml.append("---")

    body = Path(CARD).read_text()
    body = re.sub(r"\A---\n.*?\n---\n", "", body, flags=re.S).lstrip()
    rows = "\n".join(f"| `{f['name']}` | {f['rows']:,} | {TABLE_DESC.get(f['name'], '')} |" for f in manifest["files"])
    vlist = "\n".join(f"- `{v['snapshot_version']}` (generated {v['generated_at'][:16].replace('T', ' ')} UTC, method {v['method_version']})" for v in versions)
    hub = f"""## This Hugging Face mirror

Mirror of the official ARC open dataset at [arcreport.ai/data](https://www.arcreport.ai/data). It is updated after each weekly snapshot (Mondays). The files are byte-for-byte copies of ARC's published CSV and Parquet.

**Current snapshot:** `{version}` (snapshot date {manifest['snapshot_date']}, generated {manifest.get('generated_at', '')[:16].replace('T', ' ')} UTC, method `{manifest['method_version']}`{f", {manifest['stores_checked']:,} stores with a completed HTTP check" if manifest.get('stores_checked') else ''}).

| Config / table | Rows | What it holds |
|---|---|---|
{rows}

```python
from datasets import load_dataset
rails = load_dataset("{repo}", "rails_checks", split="train")
stores = load_dataset("{repo}", "stores", split="train")
```

### Versions on the Hub
- `latest/` is the newest snapshot. **To cite exact numbers, cite a version folder** under `versions/` or the Hub tag `v<version>` (e.g. `v{version}`), not `latest/`.
- Version folders never change once published. A second export on the same date is `YYYY-MM-DD.r2`, `.r3` and so on.
- `versions.json` lists every version with row counts and method version.

{vlist}

### Methodology
How every field is measured, and what ARC cannot see: [arcreport.ai/methodology](https://www.arcreport.ai/methodology) and its [changelog](https://www.arcreport.ai/methodology/changelog). Code and docs: [github.com/abab7575/arc-open](https://github.com/abab7575/arc-open). Every row is labelled `measured` or `inferred`; an empty value means not measured, never zero or "no".

### Citation

```bibtex
@misc{{arc_agent_commerce_index_{year},
  title  = {{ARC Agent Commerce Index: open dataset}},
  author = {{{{ARC}}}},
  year   = {{{year}}},
  note   = {{Snapshot {version}, method {manifest['method_version']}}},
  howpublished = {{\\url{{https://huggingface.co/datasets/{repo}}}}},
  url    = {{https://www.arcreport.ai/data}},
  license = {{CC-BY-4.0}}
}}
```
"""
    title, _, rest = body.partition("\n")
    return "\n".join(yaml) + "\n\n" + title + "\n" + rest.split("\n## ", 1)[0].rstrip() + "\n\n" + hub + "\n## " + rest.split("\n## ", 1)[1]


def stage(source: str, out: Path, repo: str, all_versions: bool) -> dict:
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    vjson = get_json(f"{source}/data/versions.json")
    versions = vjson["versions"]
    manifest = get_json(f"{source}/data/latest/manifest.json")
    latest = manifest.get("snapshot_version") or manifest["snapshot_date"]
    (out / "versions.json").write_text(json.dumps(vjson, indent=2) + "\n")
    wanted = [v["snapshot_version"] for v in versions] if all_versions else [latest]
    files = 0
    for ver in wanted:
        m = get_json(f"{source}/data/{ver}/manifest.json")
        d = out / "versions" / ver
        d.mkdir(parents=True)
        (d / "manifest.json").write_text(json.dumps(m, indent=2) + "\n")
        for f in m["files"]:
            for kind in ("csv", "parquet"):
                (d / f"{f['name']}.{kind}").write_bytes(get(f"{source}{f[kind]}"))
                files += 1
    shutil.copytree(out / "versions" / latest, out / "latest")
    (out / "README.md").write_text(build_card(manifest, versions, repo))
    return {"version": latest, "versions": wanted, "files": files, "manifest": manifest}


def scan_clean(out: Path):
    """Refuse to publish anything that looks like an email, token or key."""
    bad = re.compile(rb"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}|hf_[A-Za-z0-9]{20,}|sk_live_|ghp_|github_pat_|-----BEGIN [A-Z ]*PRIVATE KEY")
    for p in out.rglob("*"):
        if p.is_file() and p.suffix in (".csv", ".json", ".md"):
            for m in bad.finditer(p.read_bytes()):
                hit = m.group(0)
                # bibtex/@misc and url-encoded '@' in product URLs are fine
                if hit.startswith(b"@") or b"%40" in hit:
                    continue
                raise SystemExit(f"Refusing to publish: {p} contains {hit[:40]!r}")


def upload(out: Path, repo: str, version: str, token: str):
    try:
        from huggingface_hub import HfApi
    except ImportError:
        raise SystemExit("pip install huggingface_hub  (needed only for uploading)")
    api = HfApi(token=token)
    api.create_repo(repo, repo_type="dataset", exist_ok=True, private=False)
    info = api.upload_folder(folder_path=str(out), repo_id=repo, repo_type="dataset",
                             commit_message=f"ARC snapshot {version}", delete_patterns=["latest/*"])
    tag = f"v{version}"
    existing = {t.name for t in api.list_repo_refs(repo, repo_type="dataset").tags}
    if tag not in existing:
        api.create_tag(repo, repo_type="dataset", tag=tag, tag_message=f"ARC snapshot {version}")
    print(f"uploaded: https://huggingface.co/datasets/{repo} ({info.commit_url if hasattr(info, 'commit_url') else 'ok'}), tag {tag}")


def main():
    global CARD
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="build the files only; never upload")
    ap.add_argument("--out", default=str(ROOT / "hf-staging"))
    ap.add_argument("--repo", default=DEFAULT_REPO)
    ap.add_argument("--source", default=DEFAULT_SOURCE, help="ARC origin serving /data, or a local folder containing data/ (default %(default)s)")
    ap.add_argument("--card", default=str(CARD), help="dataset card body (markdown; YAML is generated)")
    ap.add_argument("--latest-only", action="store_true", help="stage only the newest version, not the full history")
    a = ap.parse_args()
    CARD = Path(a.card)
    out = Path(a.out).resolve()
    r = stage(a.source.rstrip("/") if a.source.startswith("http") else str(Path(a.source).resolve()), out, a.repo, not a.latest_only)
    scan_clean(out)
    print(f"staged {r['files']} data files for {len(r['versions'])} version(s), latest {r['version']}, in {out}")
    if a.dry_run:
        print("dry run: nothing uploaded")
        return
    token = os.environ.get("HF_TOKEN")
    if not token:
        raise SystemExit("HF_TOKEN is not set. Use --dry-run to build files without uploading.")
    upload(out, a.repo, r["version"], token)


if __name__ == "__main__":
    main()
