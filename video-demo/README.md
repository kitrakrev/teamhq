# video-demo

## Watch / download

| Surface | Link |
| --- | --- |
| **Direct download / stream** | https://github.com/kitrakrev/teamhq/releases/download/v1.0-demo/teamhq-demo-2026-05-09.mov |
| Release page | https://github.com/kitrakrev/teamhq/releases/tag/v1.0-demo |

The recording is 134 MB — too big for a git blob (GitHub's 100 MB
hard limit), so it lives as a GitHub Release asset instead of inline
in the tree. The download URL above is a direct, public link.

## Why a Release asset, not inline

- GitHub blocks blobs > 100 MB on push.
- Git LFS would work but adds repo setup + a 1 GB free quota per account.
- Releases accept up to 2 GB per asset, count against a separate quota,
  and surface a clean public download URL — best fit for a demo video.

## Conventions for new recordings

- Filename: `teamhq-demo-<date>.<ext>` (e.g. `teamhq-demo-2026-05-09.mov`)
- Format: MP4 (H.264 / AAC) preferred for max browser-inline compat.
  `.mov` works too — judges download + play locally.
- Recommended length: 90 s — 3 min
- Resolution: 1440×900 minimum (matches deck export)

To add a new recording, attach it to the same Release:
```bash
gh release upload v1.0-demo path/to/teamhq-demo-2026-05-10.mp4
```

## Suggested cut list

1. Open `web-nine-lemon-57.vercel.app` — show feed
2. Click **view-as** toggle through all 4 personas
3. Switch run picker to the streaming-feature run (`1f408ef9-…`)
4. Scroll: trigger → acceptance criteria → question card → team plan w/ citations
5. Open `github.com/kitrakrev/teamhq-hero/pull/4` in a new tab
6. Show MCP install line in terminal: `claude mcp add teamhq …`
7. In Claude Code: invoke `teamhq_list_runs`, then `teamhq_get_run`, then `teamhq_approve_card`
8. Cut back to TeamHQ feed — card status flips to `approved`
