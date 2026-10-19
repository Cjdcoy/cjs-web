import { describe, expect, it, vi } from "vitest";
import { replayMetaFixture, replaySamplesFixture } from "./__fixtures__/responses";
import { ApiError, UnsupportedCapabilityError } from "./errors";
import { createCjsApiForBases } from "./index";
import { normalizeReplayMeta, normalizeReplaySamples } from "./normalizers";

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

describe("replay meta and frames boundary", () => {
  function replayApi(respond: (url: string) => Response) {
    const requests: Array<{ accept: string | null; url: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ accept: new Headers(init?.headers).get("Accept"), url: String(input) });
      return respond(String(input));
    });
    const api = createCjsApiForBases({
      apiBase: "https://api.example.test",
      fetch: fetchMock as typeof fetch,
      format: "msgpack",
      replayApiBase: "https://replay.example.test",
    });
    return { api, requests };
  }

  it("requests meta as v2 JSON and the raw frames as bytes from the replay base", async () => {
    const bytes = new Uint8Array([0x4a, 0x34, 0x4c, 0x42, 12, 0, 50, 0]);
    const { api, requests } = replayApi((url) =>
      url.includes("/meta")
        ? Response.json(replayMetaFixture)
        : new Response(bytes, { headers: { "Content-Type": "application/octet-stream" } }),
    );

    await expect(api.replayMeta({ source: "j4l", runId: 7001 })).resolves.toEqual(
      replayMetaFixture,
    );
    const frames = await api.replayFrames({ source: "j4l", runId: 7001 });
    expect(new Uint8Array(frames)).toEqual(bytes);
    expect(requests).toEqual([
      {
        accept: "application/json",
        url: "https://replay.example.test/api/v2/replay/meta?run_id=7001&source=j4l",
      },
      {
        accept: "application/octet-stream",
        url: "https://replay.example.test/api/v2/replay/frames?run_id=7001&source=j4l",
      },
    ]);
  });

  it("rejects JumpersHeaven runs, invalid ids, and another run's meta", async () => {
    const { api, requests } = replayApi(() =>
      Response.json({ ...replayMetaFixture, run_id: 7002 }),
    );

    await expect(api.replayMeta({ source: "jh", runId: 1 })).rejects.toBeInstanceOf(
      UnsupportedCapabilityError,
    );
    await expect(api.replayFrames({ source: "jh", runId: 1 })).rejects.toBeInstanceOf(
      UnsupportedCapabilityError,
    );
    await expect(api.replayFrames({ source: "j4l", runId: -1 })).rejects.toMatchObject({
      kind: "invalid-argument",
    });
    expect(requests).toEqual([]);
    await expect(api.replayMeta({ source: "j4l", runId: 7001 })).rejects.toMatchObject({
      kind: "invalid-response",
      message: expect.stringMatching(/run_id\.scope/),
    });
  });

  it("exposes non-2xx statuses for frames", async () => {
    const { api } = replayApi(() => new Response("not format 12", { status: 422 }));

    await expect(api.replayFrames({ source: "j4l", runId: 9 })).rejects.toMatchObject({
      kind: "http",
      status: 422,
    });
  });

  it("reads meta objects and MessagePack tuples, and rejects malformed meta", () => {
    const path = "/api/v1/replay/meta";
    const tuple = [7001, "mp_cjs_training", 501, "^2Runner", 12, false, 250];
    expect(normalizeReplayMeta(tuple, path)).toEqual(replayMetaFixture);
    expect(() => normalizeReplayMeta({ ...replayMetaFixture, finished: 1 }, path)).toThrow(
      /\$response\.finished/,
    );
    expect(() => normalizeReplayMeta({ ...replayMetaFixture, format_version: "12" }, path)).toThrow(
      /\$response\.format_version/,
    );
    expect(() => normalizeReplayMeta(tuple.slice(0, 6), path)).toThrow(/\$response/);
  });
});
