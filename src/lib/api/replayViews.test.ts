import { describe, expect, it, vi } from "vitest";
import { sendReplayView } from "./replayViews";

describe("sendReplayView", () => {
  it("sends a text/plain beacon to the views endpoint", async () => {
    const sendBeacon = vi.fn<Navigator["sendBeacon"]>(() => true);
    const fetchMock = vi.fn<typeof fetch>();
    sendReplayView("https://api.example.test/", '{"v":1}', { sendBeacon }, fetchMock);

    const [url, blob] = sendBeacon.mock.calls[0];
    expect(url).toBe("https://api.example.test/api/v1/replay/views");
    expect(blob).toBeInstanceOf(Blob);
    expect((blob as Blob).type).toBe("text/plain");
    expect(await (blob as Blob).text()).toBe('{"v":1}');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to a keepalive no-cors fetch when the beacon is refused or missing", () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.reject(new Error("offline")));
    sendReplayView("https://api.example.test", "{}", { sendBeacon: () => false }, fetchMock);
    sendReplayView("https://api.example.test", "{}", {}, fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.test/api/v1/replay/views", {
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "text/plain" },
      keepalive: true,
      mode: "no-cors",
    });
  });
});
