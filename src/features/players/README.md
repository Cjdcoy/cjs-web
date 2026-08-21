# Players feature

The supported contract is the live [CJ Stats API documentation](https://api.jump4life.org/docs),
with its machine-readable OpenAPI document at
[`/openapi.yaml`](https://api.jump4life.org/openapi.yaml). The profile contract below was checked
on 2026-08-22.

## Player profile contract

| Profile section      | Endpoint                               | Published parameters                       | Sources    |
| -------------------- | -------------------------------------- | ------------------------------------------ | ---------- |
| Performance          | `/api/v1/player/performance-stats`     | `source`, `playerid`                       | JH and J4L |
| Leaderboard position | `/api/v1/player/leaderboard-positions` | `source`, `playerid`, `fps`, `leaderboard` | JH and J4L |
| Best jump-skill runs | `/api/v1/player/jump-scores`           | `source`, `playerid`, `fps`                | JH and J4L |
| Route completion     | `/api/v1/player/routes-completion`     | `source`, `playerid`                       | JH and J4L |
| XP rank              | `/api/v1/player/rank`                  | `source`, `playerid`                       | J4L only   |
| Lifetime activity    | `/api/v1/player/activity-summary`      | `source`, `playerid`                       | J4L only   |

The `leaderboard` parameter accepts `speed`, `jump`, `defrag`, `surf`, or `howmany`. The profile
keeps `source`, `fps`, `board`, and profile `view` in the URL and never requests J4L-only endpoints
for JH. Best runs use the jump-skill response's per-map score, difficulty, and rank, linking its
normal map IDs to map details. Route completion uses the same normal map-detail lookup.

Each section owns its loading, empty, error, success, and stale-refresh presentation. A source,
player, FPS, or board change cancels superseded requests. Endpoint failures settle independently so
successful sections remain usable; a performance `404` with no identity-bearing response produces
the unavailable/deleted-player state.
