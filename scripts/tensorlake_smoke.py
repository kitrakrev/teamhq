"""Tensorlake smoke test. Verifies SDK + auth + basic sandbox lifecycle."""
import os
import sys
from pathlib import Path

# Load .env
env = Path(__file__).resolve().parent.parent / ".env"
if env.exists():
    for line in env.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

if not os.environ.get("TENSORLAKE_API_KEY"):
    print("ERROR: TENSORLAKE_API_KEY missing", file=sys.stderr)
    sys.exit(1)

from tensorlake.sandbox import Sandbox

print("Creating ephemeral sandbox...")
sb = Sandbox.create()
print(f"  sandbox_id: {getattr(sb, 'id', 'n/a')}")

print("Running python --version...")
r = sb.run("python", ["--version"])
print(f"  stdout: {r.stdout.strip()!r}")
print(f"  stderr: {r.stderr.strip()!r}")
print(f"  exit:   {getattr(r, 'exit_code', getattr(r, 'returncode', '?'))}")

print("Running echo...")
r = sb.run("echo", ["hello-from-tensorlake"])
print(f"  stdout: {r.stdout.strip()!r}")

print("Terminating...")
sb.terminate()
print("OK")
