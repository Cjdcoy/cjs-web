# Leaderboards feature

The supported contract is the live [CJ Stats API documentation](https://api.jump4life.org/docs),
with its machine-readable OpenAPI document at
[`/openapi.yaml`](https://api.jump4life.org/openapi.yaml).

Contract decisions for CJS-008:

- Skill boards accept `source` and `fps`; map completions accept only `source`.
- `top_list` is board-specific: jump-skill returns points per map difficulty band
  (`floor(difficulty)`, 0–9, summing to `score`); speed, defrag, and surf return top-place counts
  (1–10). The jump board is the default.
- J4L rank XP uses `/api/v1/leaderboard/rank-xp`, requires `source=j4l`, and accepts an
  optional server-side `limit` but no offset.
- The API does not expose region, last-seen, sort, or general leaderboard offset controls.
  Region and time controls from the prototype are therefore omitted.
- Search, sorting, page size, and pagination operate on the returned result set. Their state is
  represented in the page URL. Rank XP is never requested for JumpersHeaven.

This keeps the UI capability-gated without implying parameters the public API does not publish.
