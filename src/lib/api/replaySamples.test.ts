import { describe, expect, it, vi } from "vitest";
import { replaySamplesFixture } from "./__fixtures__/responses";
import { ApiError, UnsupportedCapabilityError } from "./errors";
import { createCjsApiForBases } from "./index";
import { normalizeReplaySamples } from "./normalizers";

const path = "/api/v1/replay/samples";

describe("replay samples boundary", () => {
  it("always requests v2 JSON from the replay base, even for a MessagePack build", async () => {
    const requests: Array<{ accept: string | null; url: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ accept: new Headers(init?.headers).get("Accept"), url: String(input) });
      return Response.json(replaySamplesFixture);
    });
    const api = createCjsApiForBases({
      apiBase: "https://api.example.test",
      fetch: fetchMock as typeof fetch,
      format: "msgpack",
      replayApiBase: "https://replay.example.test",
    });

    const samples = await api.replaySamples({ source: "j4l", runId: 7001 });

    expect(requests).toEqual([
      {
        accept: "application/json",
        url: "https://replay.example.test/api/v2/replay/samples?run_id=7001&source=j4l",
      },
    ]);
    expect(samples.markers).toEqual([
      { t: 0, kind: "checkpoint", cp_id: 3 },
      { t: 50, kind: "save" },
      { t: 100, kind: "finish" },
    ]);
    expect(samples.stance).toEqual([0, 0, 1]);
  });

  it("rejects JumpersHeaven runs and invalid run ids without a request", async () => {
    const fetchMock = vi.fn();
    const api = createCjsApiForBases({
      apiBase: "https://x.test",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(api.replaySamples({ source: "jh", runId: 1 })).rejects.toBeInstanceOf(
      UnsupportedCapabilityError,
    );
    await expect(api.replaySamples({ source: "j4l", runId: 0 })).rejects.toMatchObject({
      kind: "invalid-argument",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exposes the HTTP status for unavailable and unsupported replays", async () => {
    const api = createCjsApiForBases({
      apiBase: "https://x.test",
      fetch: async () => new Response("replay not archived", { status: 404 }),
    });

    const error = await api.replaySamples({ source: "j4l", runId: 9 }).catch((cause) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: "http", status: 404 });
  });

  it("rejects mismatched, misaligned, and unordered payloads", () => {
    expect(() => normalizeReplaySamples({ ...replaySamplesFixture, pos: [0, 0, 0] }, path)).toThrow(
      /\$response\.pos/,
    );
    expect(() =>
      normalizeReplaySamples({ ...replaySamplesFixture, t: [0, 100, 50] }, path),
    ).toThrow(/\$response\.t\[2\]/);
    expect(() =>
      normalizeReplaySamples(
        { ...replaySamplesFixture, vel: [...replaySamplesFixture.vel.slice(1), "x"] },
        path,
      ),
    ).toThrow(/\$response\.vel\[8\]/);
    expect(() => normalizeReplaySamples([], path)).toThrow(/\$response/);
  });

  it("reads the optional HUD and auto-skip fields and keeps older payloads valid", () => {
    const samples = normalizeReplaySamples(
      {
        ...replaySamplesFixture,
        flags: [0, 4, 4],
        input: [0, 288, 32800],
        aux: [0, 6, 7],
        run_fps: 250,
        skips: [{ start_t: 0, target_t: 50, fails: 1 }],
        markers: [
          { t: 0, kind: "fps", fps: 250 },
          { t: 50, kind: "fps" },
        ],
      },
      path,
    );

    expect(samples).toMatchObject({
      flags: [0, 4, 4],
      input: [0, 288, 32800],
      aux: [0, 6, 7],
      run_fps: 250,
      skips: [{ start_t: 0, target_t: 50, fails: 1 }],
      markers: [
        { t: 0, kind: "fps", fps: 250 },
        { t: 50, kind: "fps" },
      ],
    });
    const older = normalizeReplaySamples(replaySamplesFixture, path);
    expect(older).not.toHaveProperty("flags");
    expect(older).not.toHaveProperty("skips");
    expect(() => normalizeReplaySamples({ ...replaySamplesFixture, flags: [0, 4] }, path)).toThrow(
      /\$response\.flags/,
    );
    expect(() =>
      normalizeReplaySamples({ ...replaySamplesFixture, skips: [{ start_t: 0 }] }, path),
    ).toThrow(/\$response\.skips\[0\]\.target_t/);
  });
});
