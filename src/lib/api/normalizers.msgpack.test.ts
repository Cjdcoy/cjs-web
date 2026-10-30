import { decode } from "@msgpack/msgpack";
import { describe, expect, it } from "vitest";

import {
  normalizeLeaderboard,
  normalizeMaps,
  normalizePlayerEvents,
  normalizePlayerJumpScores,
  normalizePlayerPerformance,
  normalizePlayerSkins,
  normalizePlayers,
  normalizeRankLeaderboard,
  normalizeRecentRunsPage,
  normalizeReplayViewCounts,
  normalizeReplayWatchRankings,
  normalizeReplayWebViewAggregate,
  normalizeReplayWebViewSummary,
  normalizeTopRuns,
} from "./normalizers";

const fixtures = {
  leaderboard: {
    json: '[{"player_id":7,"player_name":"jumper","rank":1,"rating":99.5,"country":"Hong Kong","country_code":"HK","region":"Asia","last_seen":"2026-09-05T01:02:03Z","score":100,"top_list":{"1":2},"map_scores":[{"map_id":9,"map_name":"mp_jump","score":100,"difficulty":4.5,"rank":1}]}]',
    msgpack:
      "kZsHpmp1bXBlcgHLQFjgAAAAAACpSG9uZyBLb25nokhLpEFzaWG0MjAyNi0wOS0wNVQwMTowMjowM1pkgQECkZUJp21wX2p1bXBky0ASAAAAAAAAAQ==",
    normalize: normalizeLeaderboard,
  },
  maps: {
    json: '[{"mapid":4,"mapname":"mp_jump","cp_id":9,"ender":"1","author":"mapper","type":"jump","nb_checkpoints":8,"difficulty":{"125":{"cp_id":9,"difficulty":4.5,"top10_avg_delta_time":0,"avg_delta_time":0,"top10_avg_load_save_ratio":0,"avg_load_save_ratio":0,"top10_avg_time":0,"avg_time":0,"nb_tops":10}},"individual_finish_count":27,"players_playtime":{"125":{"7":{"playerid":"7","playername":"jumper","playtime":60000}}}}]',
    msgpack:
      "kZwEp21wX2p1bXAJoTGmbWFwcGVywACkanVtcAiBozEyNZsJy0ASAAAAAAAAywAAAAAAAAAAywAAAAAAAAAAywAAAAAAAAAAywAAAAAAAAAAywAAAAAAAAAAywAAAAAAAAAAywAAAAAAAAAAywAAAAAAAAAAChuBozEyNYEHk6E3pmp1bXBlcs3qYA==",
    normalize: normalizeMaps,
  },
  players: {
    json: '[{"player_id":7,"playername":"jumper","last_seen":"2026-09-05T01:02:03Z","banned":0,"admin":0,"admin_speedrun":0,"admin_emelie":0,"xp":1234,"xp_speedrun":0,"donated":0,"country":"HK","activity_summary":{"player_id":7,"run_attempt_ms":9001,"load_count":3,"save_count":0,"jump_count":0,"nadethrows":0,"nadejumps":0,"distance_travelled":0,"runtime_ms":12000,"playing_ms":10000,"spectating_ms":0,"afk_ms":0,"playing_afk_ms":0,"spectating_afk_ms":0,"last_activity_at":"2026-09-05T01:02:03Z","updated_at":"2026-09-05T01:02:03Z"}}]',
    msgpack:
      "kdwAFQemanVtcGVytDIwMjYtMDktMDVUMDE6MDI6MDNaAAAAAM0E0gDAwMDAwMDAAMCiSEvA3AARB80jKQMAAAAAAM0u4M0nEAAAAADAtDIwMjYtMDktMDVUMDE6MDI6MDNatDIwMjYtMDktMDVUMDE6MDI6MDNa",
    normalize: normalizePlayers,
  },
} as const;

describe("Go positional MessagePack normalization", () => {
  it.each(["maps", "leaderboard", "players"] as const)("matches normalized %s JSON", (name) => {
    const fixture = fixtures[name];
    expect(fixture.normalize(decodeBase64(fixture.msgpack), `/api/v2/${name}`)).toEqual(
      fixture.normalize(JSON.parse(fixture.json), `/api/v2/${name}`),
    );
  });

  it.each([
    [
      normalizeRankLeaderboard,
      "kZIBnwemanVtcGVyzQTSAhGiMTemUnVubmVyImRCwqlIb25nIEtvbmeiSEukQXNpYbQyMDI2LTA5LTA1VDAxOjAyOjAzWg==",
      '[{"rank":1,"player_id":7,"player_name":"jumper","total_xp":1234,"prestige":2,"level":17,"level_display":"17","title":"Runner","xp_into_level":34,"xp_for_level":100,"xp_to_next":66,"maxed":false,"country":"Hong Kong","country_code":"HK","region":"Asia","last_seen":"2026-09-05T01:02:03Z"}]',
    ],
    [
      normalizeReplayWatchRankings,
      "kZYBozEyNadtcF9qdW1wpmp1bXBlcqJIS5kLCQcIBs3UMbQyMDI2LTA5LTA1VDAxOjAyOjAzWrQyMDI2LTA5LTA1VDAxOjAyOjAzWrQyMDI2LTA5LTA1VDAxOjAyOjAzWg==",
      '[{"rank":1,"fps":"125","mapname":"mp_jump","owner_playername":"jumper","country":"HK","run_id":11,"mapid":9,"owner_player_id":7,"watch_count":8,"unique_viewer_count":6,"total_watch_ms":54321,"first_watched_at":"2026-09-05T01:02:03Z","last_watched_at":"2026-09-05T01:02:03Z","updated_at":"2026-09-05T01:02:03Z"}]',
    ],
    [
      normalizeReplayWebViewAggregate,
      "ncDAFBYHzgArcNO0MjAyNi0xMC0xN1QwNTo1NzowN1q0MjAyNi0xMC0xN1QxNjoyNjoyNlq0MjAyNi0xMC0xN1QxNjoyNjoyNloBzgBQYsLLP8F7nsTvm4+ZFoWlb3RoZXIAo21hcAimcmVjZW50AKZwbGF5ZXILpmRpcmVjdAOCpm1vYmlsZQinZGVza3RvcA6VkqJQTAySokNaBpKiREUCkqJGUgGSolNLAZXLP6MZa/jo1jLLAAAAAAAAAADLP+7HlfN2bkLLAAAAAAAAAADLP0tNM+wRagfLP/AAAAAAAADLP8F0XRdF0XTLP9F0XRdF0XTLQCUXRdF0XRc=",
      '{"replay_count":20,"watch_count":22,"unique_viewer_count":7,"total_watch_ms":2846931,"first_watched_at":"2026-10-17T05:57:07Z","last_watched_at":"2026-10-17T16:26:26Z","updated_at":"2026-10-17T16:26:26Z","completed_count":1,"total_covered_ms":5268162,"avg_completion":0.1365850888825801}',
    ],
    [
      normalizeReplayWebViewSummary,
      "nwsJBwIBzR9AtDIwMjYtMDktMDVUMDE6MDI6MDNatDIwMjYtMDktMDVUMDE6MDI6MDNatDIwMjYtMDktMDVUMDE6MDI6MDNazScQAc0fQMs/4AAAAAAAAMCTzROIkgIBks0TiM0LuA==",
      '{"run_id":11,"heat":{"bucket_ms":5000,"view_count":[2,1],"watch_ms":[5000,3000]}}',
    ],
    [
      (value: unknown, path: string) => normalizeReplayViewCounts(value, [7001], path),
      "gaQ3MDAxks0E0s0BVA==",
      '{"7001":{"web":1234,"in_game":340}}',
    ],
    [
      normalizeTopRuns,
      "kdwAE6NqNGwBKgemanVtcGVyp21wX2p1bXAJwAKpMDA6MTIuMzQ1zTA5AwQFtDIwMjYtMDktMDVUMDE6MDI6MDNaC6MxMjWkanVtcGQ=",
      '[{"source":"j4l","rank":1,"totalNr":42,"player_id":7,"playername":"jumper","mapname":"mp_jump","cpid":9,"ender":null,"nadejumps":2,"time_played_string":"00:12.345","time_played":12345,"load_count":3,"save_count":4,"nade_throws":5,"time_created":"2026-09-05T01:02:03Z","run_id":11,"fps":"125","type":"jump","score":100}]',
    ],
    [
      normalizeRecentRunsPage,
      "kpHcABOjajRsASoHpmp1bXBlcqdtcF9qdW1wCcACqTAwOjEyLjM0Nc0wOQMEBbQyMDI2LTA5LTA1VDAxOjAyOjAzWgujMTI1pGp1bXBkqGN1cnNvci0y",
      '{"runs":[{"source":"j4l","rank":1,"totalNr":42,"player_id":7,"playername":"jumper","mapname":"mp_jump","cpid":9,"ender":null,"nadejumps":2,"time_played_string":"00:12.345","time_played":12345,"load_count":3,"save_count":4,"nade_throws":5,"time_created":"2026-09-05T01:02:03Z","run_id":11,"fps":"125","type":"jump","score":100}],"next_cursor":"cursor-2"}',
    ],
    [
      normalizePlayerPerformance,
      "3AAQCss/4AAAAAAAAAEIAstACgAAAAAAAJGWp21wX2p1bXCjMTI1AbQyMDI2LTA5LTA1VDAxOjAyOjAzWgsJlqdtcF9qdW1wozEyNQG0MjAyNi0wOS0wNVQwMTowMjowM1oLCQGmQWN0aXZlw8IBgaMxMjUIozEyNZ8Hpmp1bXBlcs0E0gARoKAAAADCoKCgoA==",
      '{"total_maps_completed":10,"maps_completed_ratio":0.5,"best_rank":1,"top10_count":8,"top1_count":2,"average_rank":3.25,"recent_tops":[{"map_name":"mp_jump","fps":"125","rank":1,"finish_date":"2026-09-05T01:02:03Z","runid":11,"cpid":9}],"oldest_top":{"map_name":"mp_jump","fps":"125","rank":1,"finish_date":"2026-09-05T01:02:03Z","runid":11,"cpid":9},"days_since_last_seen":1,"activity_level":"Active","is_donator":true,"is_banned":false,"admin_level":1,"nb_tops_per_fps":{"125":8},"best_fps":"125","rank":{"player_id":7,"player_name":"jumper","total_xp":1234,"prestige":0,"level":17,"level_display":"","title":"","xp_into_level":0,"xp_for_level":0,"xp_to_next":0,"maxed":false}}',
    ],
    [
      normalizePlayerJumpScores,
      "mwemanVtcGVyAcsAAAAAAAAAAKCgoKBkgQECkZUJp21wX2p1bXBky0ASAAAAAAAAAQ==",
      '{"player_id":7,"player_name":"jumper","rank":1,"rating":0,"country":"","country_code":"","region":"","last_seen":"","score":100,"top_list":{"1":2},"map_scores":[{"map_id":9,"map_name":"mp_jump","score":100,"difficulty":4.5,"rank":1}]}',
    ],
    [
      normalizePlayerEvents,
      "k80B9ZGZHwIHtDIwMjYtMTEtMDJUMDE6MDA6MDBafQTNAa8FDpGXBqZhY3RpdmXM+gjNBLAJFA==",
      '{"player_id":501,"weeks":[{"event_id":31,"season_id":2,"week_no":7,"ends_at":"2026-11-02T01:00:00Z","fps":125,"rank":4,"points":431,"maps_finished":5,"participants":14}],"seasons":[{"season_id":6,"status":"active","fps":250,"rank":8,"points":1200,"weekly_wins":9,"participants":20}]}',
    ],
    [
      normalizePlayerSkins,
      "kZkEo2hhdKh0ZXN0X2hhdKhUZXN0IGhhdKNidXm8aHR0cHM6Ly9leGFtcGxlLnRlc3QvaGF0LnBuZ6ZtZW1iZXK0MjAyNi0xMC0yN1QxODowMzoxMVrD",
      '[{"skin_id":4,"category":"hat","item":"test_hat","display_name":"Test hat","unlock_type":"buy","image":"https://example.test/hat.png","source":"member","unlocked_at":"2026-10-27T18:03:11Z","active":true}]',
    ],
  ] as const)("matches another supplied endpoint fixture", (normalize, msgpack, json) => {
    expect(normalize(decodeBase64(msgpack), "/api/v2/fixture")).toEqual(
      normalize(JSON.parse(json), "/api/v2/fixture"),
    );
  });

  it("treats an empty positional cursor as the last page", () => {
    const page = normalizeRecentRunsPage(
      decodeBase64(
        "kpHcABOjajRsASoHpmp1bXBlcqdtcF9qdW1wCcACqTAwOjEyLjM0Nc0wOQMEBbQyMDI2LTA5LTA1VDAxOjAyOjAzWgujMTI1pGp1bXBkoA==",
      ),
      "/api/v2/runs/recent",
    );
    expect(page.nextCursor).toBeNull();
    expect(page.runs).toHaveLength(1);
  });

  it("rejects truncated positional structs", () => {
    expect(() => normalizeMaps([[4, "mp_jump"]], "/api/v2/maps")).toThrow();
    expect(() => normalizePlayerEvents([501, [[3, 1, 3]], []], "/api/v2/player/events")).toThrow();
    expect(() => normalizePlayerSkins([[4, "hat", "test_hat"]], "/api/v2/player/skins")).toThrow();
  });
});

function decodeBase64(value: string): unknown {
  return decode(Uint8Array.from(atob(value), (character) => character.charCodeAt(0)));
}
