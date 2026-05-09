# TeamHQ

> The engineering org's command center for autonomous code change.

Built for the [Nozomio Hackathon](https://luma.com/rshibq6i) — Track 4: 🧠 The Company Brain.

## What it is

Coding agents (Devin, Codex, Claude Code, Cursor) work for one developer. **TeamHQ is where the whole engineering org converges to decide what code change ships next.**

When upstream releases break, when product proposes features, when teams disagree on conventions — every change starts as a card in TeamHQ. Visible to everyone. Actionable by the right roles. Synthesized from each team's brain. Verified in sandbox. Shipped by the agent of your choice.

## Stack

| Layer | Service |
| --- | --- |
| Team brain (per-team Slack/Notion/GitHub/Linear synthesis) | [Hyperspell](https://hyperspell.com) |
| World context (changelogs, public repos, CVEs) | [Nia](https://trynia.ai) |
| Stateful agent runtime + sandbox | [Tensorlake](https://tensorlake.ai) |
| App backend (Postgres, auth, realtime, storage, edge fns) | [InsForge](https://insforge.dev) |
| Frontend deploy | [Vercel](https://vercel.com) |
| Coding executor (pluggable) | [Devin](https://devin.ai) / OpenAI Codex / GitHub API |

## Track 4 pillars

1. **Cross-source synthesis** — per-team Hyperspell collections + Nia + repo state, fused into per-team plans.
2. **Real work** — opens real PRs on real repos.
3. **Hyperspell load-bearing** — kill-switch demo: disconnect Hyperspell, agent loses team context, demo visibly degrades.

## Status

Built during May 9, 2026 hackathon. See `scripts/` for service smoke tests.
