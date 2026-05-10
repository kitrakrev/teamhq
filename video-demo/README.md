# video-demo

Drop the recorded TeamHQ demo video here.

## Conventions

- Filename: `teamhq-demo-<date>.mp4` (e.g. `teamhq-demo-2026-05-09.mp4`)
- Format: MP4 (H.264 / AAC) for max GitHub preview compatibility
- Recommended length: 90 s — 3 min
- Resolution: 1440×900 minimum (matches deck export)

## Suggested cuts

1. Open `web-nine-lemon-57.vercel.app` — show feed
2. Click **view-as** toggle through all 4 personas
3. Switch run picker to the streaming-feature run (1f408ef9)
4. Scroll: trigger → acceptance criteria → question card → team plan w/ citations
5. Open `github.com/kitrakrev/teamhq-hero/pull/4` in new tab
6. Show MCP install line in terminal: `claude mcp add teamhq …`
7. In Claude Code: invoke `teamhq_list_runs`, then `teamhq_get_run`, then `teamhq_approve_card`
8. Cut back to TeamHQ feed — card status flips to `approved`

## Linking from the deck

Once the video is committed, embed in slide 06 (or add slide 06.5):

```html
<video controls preload="metadata" style="width:100%;border:1px solid var(--ink-4)">
  <source src="../video-demo/teamhq-demo-2026-05-09.mp4" type="video/mp4">
</video>
```

Or add a top-right `live-link` to the GitHub blob URL:
`https://github.com/kitrakrev/teamhq/blob/main/video-demo/teamhq-demo-2026-05-09.mp4`
