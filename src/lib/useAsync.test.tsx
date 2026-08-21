import { act, renderHook, waitFor } from "@testing-library/react";
import { useCallback } from "react";
import { describe, expect, it, vi } from "vitest";
import { useAsync } from "./useAsync";

describe("useAsync", () => {
  it("hides stale-key data, aborts the old request, and ignores its late result", async () => {
    const requests: Array<{
      deferred: ReturnType<typeof deferred<string>>;
      key: string;
      signal: AbortSignal;
    }> = [];
    const loader = vi.fn((key: string, signal: AbortSignal) => {
      const request = { deferred: deferred<string>(), key, signal };
      requests.push(request);
      return request.deferred.promise;
    });

    const { result, rerender } = renderHook(
      ({ requestKey }) => {
        const load = useCallback((signal: AbortSignal) => loader(requestKey, signal), [requestKey]);
        return useAsync(load, requestKey);
      },
      { initialProps: { requestKey: "jh" } },
    );

    await waitFor(() => expect(requests).toHaveLength(1));
    act(() => requests[0]?.deferred.resolve("JumpersHeaven maps"));
    await waitFor(() => expect(result.current.data).toBe("JumpersHeaven maps"));

    rerender({ requestKey: "j4l" });
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[0]?.signal.aborted).toBe(true);

    act(() => requests[1]?.deferred.resolve("Jump4Life maps"));
    await waitFor(() => expect(result.current.data).toBe("Jump4Life maps"));
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}
