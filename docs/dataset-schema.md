# Dataset schema

The full field reference is the dataset card: [`dataset-card.md`](dataset-card.md) (the same file published at <https://www.arcreport.ai/data/README.md> and used as the Hugging Face dataset card).

- Download: <https://www.arcreport.ai/data> (CSV and Parquet, weekly snapshots, CC-BY-4.0)
- Machine-readable: `https://www.arcreport.ai/data/latest/manifest.json` (tables, columns, row counts) and `https://www.arcreport.ai/data/versions.json` (every version)
- Hugging Face mirror: [`ArcReport/arc-agent-commerce`](https://huggingface.co/datasets/ArcReport/arc-agent-commerce), built by [`scripts/publish_hf.py`](../scripts/publish_hf.py)

Every row carries `snapshot_date`, `method_version` and `evidence` (`measured` or `inferred`). Empty means not measured, never zero.
