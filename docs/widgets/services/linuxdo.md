---
title: Linux.do
description: Linux.do Widget Configuration
---

Linux.do widget for Discourse RSS feeds such as the latest topics feed and tag feeds.

Allowed fields:

- `type: linuxdo`
- `feeds?: Array<{ id: string; label: string; url: string }>`
- `defaultFeed?: string`
- `limit?: number`
- `refreshInterval?: number`

If `feeds` is omitted, the widget falls back to:

- `latest`: `https://linux.do/latest.rss`
- `ai`: `https://linux.do/tag/444.rss`

```yaml
widget:
  type: linuxdo
  limit: 10
  refreshInterval: 900000
  defaultFeed: latest
  feeds:
    - id: latest
      label: 最新
      url: https://linux.do/latest.rss
    - id: ai
      label: AI
      url: https://linux.do/tag/444.rss
```
