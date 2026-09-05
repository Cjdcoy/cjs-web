import { decode } from "@msgpack/msgpack";
import { describe, expect, it } from "vitest";

import {
  normalizeLeaderboard,
  normalizeMaps,
  normalizePlayerJumpScores,
  normalizePlayerPerformance,
  normalizePlayers,
  normalizeRankLeaderboard,
  normalizeReplayWatchRankings,
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
      normalizeTopRuns,
      "kdwAE6NqNGwBKgemanVtcGVyp21wX2p1bXAJwAKpMDA6MTIuMzQ1zTA5AwQFtDIwMjYtMDktMDVUMDE6MDI6MDNaC6MxMjWkanVtcGQ=",
      '[{"source":"j4l","rank":1,"totalNr":42,"player_id":7,"playername":"jumper","mapname":"mp_jump","cpid":9,"ender":null,"nadejumps":2,"time_played_string":"00:12.345","time_played":12345,"load_count":3,"save_count":4,"nade_throws":5,"time_created":"2026-09-05T01:02:03Z","run_id":11,"fps":"125","type":"jump","score":100}]',
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
  ] as const)("matches another supplied endpoint fixture", (normalize, msgpack, json) => {
    expect(normalize(decodeBase64(msgpack), "/api/v2/fixture")).toEqual(
      normalize(JSON.parse(json), "/api/v2/fixture"),
    );
  });

  it("rejects truncated positional structs", () => {
    expect(() => normalizeMaps([[4, "mp_jump"]], "/api/v2/maps")).toThrow();
  });
});

function decodeBase64(value: string): unknown {
  return decode(Uint8Array.from(atob(value), (character) => character.charCodeAt(0)));
}
