# TeamHQ

> The engineering org's command center for autonomous code change.

Built for the **[Nozomio Hackathon](https://luma.com/rshibq6i)** — Track 4: 🧠 The Company Brain.

| Surface | Link |
| --- | --- |
| Live demo | https://web-nine-lemon-57.vercel.app |
| Pitch deck | [`deck/index.html`](./deck/index.html) — open locally · keyboard `←`/`→`, `n` = speaker notes, `p` = print to PDF |
| Target repo (PRs land here) | https://github.com/kitrakrev/teamhq-hero |
| Example PR (opened by the agent) | https://github.com/kitrakrev/teamhq-hero/pull/4 |

## What it is

Coding agents (Devin, Codex, Claude Code, Cursor) work for **one** developer. **TeamHQ is where the whole engineering org converges to decide what code change ships next.**

When upstream releases break, when product proposes features, when teams disagree on conventions — every change starts as a card in TeamHQ. Visible to everyone. Actionable by the right roles. Synthesised from each team's brain. Verified in sandbox. Shipped by the agent of your choice.

## The loop

```
Trigger → Acceptance Criteria → Per-role Questions → Per-team Plans → Sandbox → Quorum gate → Real PR
```

Each step emits a card to InsForge. The web UI streams them every 2 s. The quorum gate is **default ON** — the agent's PR cannot ship until every team-lead approves their plan card.

## Stack

| Layer | Service |
| --- | --- |
| Team brain (per-team Slack/Notion/GitHub/Linear synthesis) | [Hyperspell](https://hyperspell.com) (`gpt-oss-120b` open-weights) |
| World context (changelogs, public repos, dependency graphs) | [Nia](https://trynia.ai) |
| Stateful agent runtime + sandbox | [Tensorlake](https://tensorlake.ai) (firecracker microVM + Applications) |
| App backend (Postgres, auth, AI gateway) | [InsForge](https://insforge.dev) |
| Web frontend | [Vercel](https://vercel.com) (Next.js 16 App Router + Tailwind 4) |
| Coding executor (pluggable) | Claude Code · Codex · Devin · Cursor (via the bundled MCP server) |

## Track 4 judging — how this maps

| Criterion (weight) | Where it lands |
| --- | --- |
| **Cross-source synthesis (30%)** | Per-team plans fuse Hyperspell (Slack + Notion + GitHub + Linear) + Nia + repo state. Each team plan synthesises its OWN brain — not a global prompt. 19 cited brain artifacts on the demo run. |
| **Real work (25%)** | Agent opens real PRs on real GitHub repos via OAuth-scoped `gh`. 4 PRs landed on `kitrakrev/teamhq-hero` today. |
| **Hyperspell integration depth (25%)** | Hyperspell answers per-role questions, grounds the per-team plans, and stores the team-brain itself. Disconnect Hyperspell → demo visibly degrades (no questions, no citations, quorum can't form). |
| **Demo & presentation (10%)** | Editorial UI carries the narrative. Slide deck is checked in (`deck/index.html`). MCP server lets a judge install TeamHQ in their own Claude Code in 30 seconds. |
| **Judge's personal rating (10%)** | If you've ever rubber-stamped a 691-file PR, this is the surface you wish existed. |

## Demo

```bash
# Local — runs the full agent loop end-to-end against InsForge + Tensorlake.
python -m agent feature-streaming   # PM-style feature with 9 acceptance criteria
python -m agent fastapi-go          # multi-team migration proposal
python -m agent openai-bump         # SDK upgrade
```

The web app polls `/api/runs/:id/cards` every 2 s and renders cards into the editorial feed.

### Running from the UI

`POST /api/run-scenario` with `{ projectId, scenario }` inserts a `runs` row **and** spawns the Python agent process detached. The UI redirects to the run-detail view immediately; cards stream in as the agent emits them. (On Vercel the same call invokes the Tensorlake-hosted variant — same code, different runtime.)

## Repos

- **`kitrakrev/teamhq` (this repo)** — agent loop (`agent/`), Tensorlake app (`tl_app/`), web frontend (`web/`), MCP server (`mcp/`), seed scripts (`scripts/`), tests (`tests/`), deck (`deck/`).
- **`kitrakrev/teamhq-hero`** — the **target** repo the agent ships PRs into. Pinned at `openai==0.28.1` so the agent can demonstrate a real upgrade while preserving the team's `retry_wrapper` convention.

## Pluggable agent executor

TeamHQ ships an **MCP server** (`mcp/teamhq_mcp.py`) that exposes 7 tools to any MCP-compatible client (Claude Code, Cursor, Codex):

```bash
claude mcp add teamhq \
  --env TEAMHQ_BASE=https://web-nine-lemon-57.vercel.app \
  --env TEAMHQ_PERSONA=sarah \
  -- python /path/to/teamhq_mcp.py
```

Tools: `teamhq_list_runs`, `teamhq_get_run`, `teamhq_trigger_scenario`, `teamhq_approve_card`, `teamhq_reject_card`, `teamhq_comment_card`, `teamhq_answer_question`.

Decision history is durable in InsForge — switch agent providers mid-stream and the next agent picks up where the last left off.

## GitHub write scopes (real PR opener)

The InsForge shared GitHub OAuth grants `read:user user:email` only. To let TeamHQ's agent open + push real PRs as a logged-in user, register a separate GitHub OAuth App and set:

```
GITHUB_OAUTH_CLIENT_ID=<your app's client id>
GITHUB_OAUTH_CLIENT_SECRET=<your app's client secret>
```

Authorization callback URL on the GitHub App: `<origin>/api/oauth/github-write/callback`. Required scopes: `repo workflow read:org`.

The onboarding wizard surfaces an "Upgrade to write scopes" link once configured. The granted token is persisted in `oauth_tokens` w/ `provider=github_write` and the agent loop uses it via `GH_TOKEN` for `git push` and `gh pr create`.

## Status

Built during the May 9, 2026 Nozomio hackathon (Track 4: Company Brain).
