"""TeamHQ MCP server.

Exposes the org's decision surface to any MCP-compatible coding agent
(Claude Code, Cursor, Codex). Lets a developer plugged into the org pick up
where prior runs left off — list pending cards, approve, trigger scenarios,
and read the full project history (chat continuity).

Install in Claude Code:
    claude mcp add teamhq \
      --env TEAMHQ_BASE=https://web-nine-lemon-57.vercel.app \
      --env TEAMHQ_PERSONA=sarah \
      -- python /path/to/teamhq_mcp.py

The persona cookie is how the demo identifies a viewer. In production we'd
exchange a TEAMHQ_TOKEN for the real session.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


BASE = os.environ.get("TEAMHQ_BASE", "https://web-nine-lemon-57.vercel.app")
PERSONA = os.environ.get("TEAMHQ_PERSONA", "sarah")


def _http(method: str, path: str, body: dict | None = None) -> dict | list:
    headers = {
        "Cookie": f"teamhq_demo_persona={PERSONA}",
        "Content-Type": "application/json",
    }
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            payload = resp.read().decode()
            return json.loads(payload) if payload else {}
    except urllib.error.HTTPError as e:
        return {"error": e.code, "body": e.read().decode()[:400]}


# ---- MCP protocol ----

def list_tools() -> list[dict]:
    return [
        {
            "name": "teamhq_list_runs",
            "description": "List recent agent runs (chats) in TeamHQ for the current org. Each run has a feed of cards (decisions, citations, PRs).",
            "inputSchema": {"type": "object", "properties": {"limit": {"type": "integer", "default": 10}}},
        },
        {
            "name": "teamhq_get_run",
            "description": "Fetch all cards for a specific run by id — gives you the full decision history so you can resume work where the agent left off.",
            "inputSchema": {
                "type": "object",
                "properties": {"run_id": {"type": "string"}},
                "required": ["run_id"],
            },
        },
        {
            "name": "teamhq_trigger_scenario",
            "description": "Kick off a new TeamHQ scenario run — fastapi-go, openai-bump, or react-nextjs. Returns the run_id you can poll via teamhq_get_run.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "scenario": {"type": "string", "enum": ["fastapi-go", "openai-bump", "react-nextjs"]},
                    "project_id": {"type": "string", "description": "Optional project to attach the run to"},
                },
                "required": ["scenario"],
            },
        },
        {
            "name": "teamhq_approve_card",
            "description": "Approve a pending decision card. Writes an audit_log row and unblocks downstream agent steps. Persona role-gated.",
            "inputSchema": {
                "type": "object",
                "properties": {"card_id": {"type": "string"}, "reason": {"type": "string"}},
                "required": ["card_id"],
            },
        },
        {
            "name": "teamhq_reject_card",
            "description": "Reject a pending decision card with a reason.",
            "inputSchema": {
                "type": "object",
                "properties": {"card_id": {"type": "string"}, "reason": {"type": "string"}},
                "required": ["card_id", "reason"],
            },
        },
        {
            "name": "teamhq_comment_card",
            "description": "Add a comment to any card — visible to the whole org. No role gate.",
            "inputSchema": {
                "type": "object",
                "properties": {"card_id": {"type": "string"}, "text": {"type": "string"}},
                "required": ["card_id", "text"],
            },
        },
        {
            "name": "teamhq_answer_question",
            "description": "Answer a question card the agent posted to your role. Either pick an option or supply free text. Required: card_id. One of: choice OR answer.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "card_id": {"type": "string"},
                    "choice": {"type": "string"},
                    "answer": {"type": "string"},
                },
                "required": ["card_id"],
            },
        },
    ]


def call_tool(name: str, args: dict) -> dict:
    if name == "teamhq_list_runs":
        limit = int(args.get("limit", 10))
        d = _http("GET", "/api/runs")
        runs = (d.get("runs") if isinstance(d, dict) else []) or []
        return {"runs": runs[:limit]}

    if name == "teamhq_get_run":
        rid = args["run_id"]
        d = _http("GET", f"/api/runs/{rid}/cards")
        cards = (d.get("cards") if isinstance(d, dict) else []) or []
        # Strip large blobs for token economy.
        slim = []
        for c in cards:
            slim.append({
                "id": c.get("id"),
                "card_type": c.get("card_type"),
                "team_id": c.get("team_id"),
                "title": c.get("title"),
                "status": c.get("status"),
                "created_at": c.get("created_at"),
                "answer": (c.get("body") or {}).get("answer"),
                "documents": [
                    {"kind": d.get("kind"), "title": d.get("title"), "url": d.get("url")}
                    for d in ((c.get("body") or {}).get("documents") or [])
                ],
            })
        return {"cards": slim}

    if name == "teamhq_trigger_scenario":
        body = {
            "scenario": args["scenario"],
            "project_id": args.get("project_id"),
        }
        d = _http("POST", "/api/run-scenario", body)
        return d if isinstance(d, dict) else {"result": d}

    if name == "teamhq_approve_card":
        cid = args["card_id"]
        body = {"reason": args.get("reason")}
        d = _http("POST", f"/api/cards/{cid}/approve", body)
        return d if isinstance(d, dict) else {"result": d}

    if name == "teamhq_reject_card":
        cid = args["card_id"]
        body = {"reason": args["reason"]}
        d = _http("POST", f"/api/cards/{cid}/reject", body)
        return d if isinstance(d, dict) else {"result": d}

    if name == "teamhq_comment_card":
        cid = args["card_id"]
        body = {"text": args["text"]}
        d = _http("POST", f"/api/cards/{cid}/comment", body)
        return d if isinstance(d, dict) else {"result": d}

    if name == "teamhq_answer_question":
        cid = args["card_id"]
        payload: dict = {}
        if args.get("choice"):
            payload["choice"] = args["choice"]
        if args.get("answer"):
            payload["answer"] = args["answer"]
        if not payload:
            return {"error": "choice or answer required"}
        d = _http("POST", f"/api/cards/{cid}/answer", payload)
        return d if isinstance(d, dict) else {"result": d}

    return {"error": f"unknown tool {name}"}


# ---- JSON-RPC over stdio ----

def respond(rid: Any, result: Any | None = None, error: dict | None = None) -> None:
    msg: dict[str, Any] = {"jsonrpc": "2.0", "id": rid}
    if error is not None:
        msg["error"] = error
    else:
        msg["result"] = result
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


def main() -> int:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            continue
        rid = req.get("id")
        method = req.get("method")
        params = req.get("params") or {}

        try:
            if method == "initialize":
                respond(rid, {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "teamhq", "version": "0.1.0"},
                })
            elif method == "notifications/initialized":
                # no response for notifications
                continue
            elif method == "tools/list":
                respond(rid, {"tools": list_tools()})
            elif method == "tools/call":
                tool = params.get("name", "")
                args = params.get("arguments") or {}
                out = call_tool(tool, args)
                respond(rid, {
                    "content": [{"type": "text", "text": json.dumps(out, indent=2)}],
                    "isError": "error" in out,
                })
            else:
                respond(rid, error={"code": -32601, "message": f"unknown method {method}"})
        except Exception as e:
            respond(rid, error={"code": -32603, "message": f"{type(e).__name__}: {e}"})
    return 0


if __name__ == "__main__":
    sys.exit(main())
