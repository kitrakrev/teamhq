"""TeamHQ agent package.

Layers (each call hits a real sponsor API — no mocks):
    insforge   InsForge: app DB + auth + S3 + realtime
    hyperspell Hyperspell: per-team brain via memories.search(answer=True)
    nia        Nia: world context via REST search (Oracle gated to MCP today)
    sandbox    Tensorlake: per-repo persistent VM
    executor   GitHubAPIExecutor / DevinExecutor (V2)
    loop       Orchestrates the run; emits cards as state evolves
"""
from pathlib import Path
import os

# Auto-load .env so callers of `python -m agent.loop` get the same env as scripts/.
_env = Path(__file__).resolve().parent.parent / ".env"
if _env.exists():
    for _line in _env.read_text().splitlines():
        _line = _line.strip()
        if not _line or _line.startswith("#") or "=" not in _line:
            continue
        _k, _v = _line.split("=", 1)
        os.environ.setdefault(_k.strip(), _v.strip())
