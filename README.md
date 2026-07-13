# Weight Tracker

A personal weight-tracking dashboard fed by Apple Health (where OMRON Connect writes its
readings) via an iOS Shortcuts automation — no app store submission, no OMRON developer
account needed. Also tracks Tirzepatide injection dates, logged manually from the
**Tirzepatide** tab on the site itself.

**Live site:** https://omron-weight-tracker.vercel.app

## How it works

**Weight** (automated):
1. An iOS Shortcuts automation reads your latest weight from Apple Health on a schedule
   and POSTs it to `/api/log-weight` on this site.
2. That serverless function (`api/log-weight.js`) verifies a shared secret, then commits
   the new reading into `data/weight-history.json` in this GitHub repo via the GitHub API —
   the same "GitHub file as database" pattern used by the `ph-typhoon-watch` project.
3. `index.html` fetches `data/weight-history.json` straight from
   `raw.githubusercontent.com` and renders the trend chart + stat tiles, refreshing every
   5 minutes and whenever the tab regains focus.

**Tirzepatide injections** (manual):
1. On the **Tirzepatide** tab, pick a date and click "Log injection" — POSTs straight to
   `/api/log-injection`, no auth (this endpoint is intentionally open, unlike
   `/api/log-weight` — it's a personal single-user tracker with no Basic Auth on the
   site at all, so gating just this one write path added friction without real security).
2. That function commits the entry into `data/injections.json`, same GitHub-as-database
   pattern as weight. Entries can be removed from the same tab (`DELETE /api/log-injection`).
3. The tab shows the last injection date, days since, and the next expected date
   (assuming a 7-day interval).

## Why this exists instead of a "real" OMRON integration

OMRON does have a data API (Omron Wellness API / OMRON Connect Create), but it's a
B2B partner program requiring an approved developer/organization account — not a
self-serve personal API key. Since OMRON Connect on iPhone syncs into Apple Health,
and Apple Health has no server-side API at all (HealthKit is on-device only), the
practical path to automation is an on-device Shortcuts automation pushing to a webhook,
which is what this repo implements.

## Environment variables (set in Vercel)

| Variable | Purpose |
|---|---|
| `GH_TOKEN` | GitHub token with contents write access to this repo, used by the serverless function to commit new readings |
| `GH_REPO` | `monalizabonita/omron-weight-tracker` |
| `WEBHOOK_SECRET` | Shared secret the Shortcut must send as `Authorization: Bearer <secret>` (not required by the Tirzepatide tab's manual entry — that endpoint is unauthenticated) |

## Request format

```
POST /api/log-weight
Authorization: Bearer <WEBHOOK_SECRET>
Content-Type: application/json

{ "weight": 61.4, "unit": "kg", "date": "2026-07-04" }
```

`unit` is `"kg"` or `"lb"` (converted to kg for the chart). One entry per `date` —
logging the same date again overwrites that day's value rather than duplicating it.

```
POST /api/log-injection
DELETE /api/log-injection
Content-Type: application/json

{ "date": "2026-07-13" }
```

One entry per `date` for `POST` (logging the same date again overwrites it); `DELETE`
removes that date's entry.
