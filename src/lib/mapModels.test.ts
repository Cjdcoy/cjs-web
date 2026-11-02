import { afterEach, describe, expect, it, vi } from "vitest";
import { getMapModelUrl } from "./mapModels";

describe("getMapModelUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("adds the revision of a re-uploaded map and leaves other maps unchanged", () => {
    vi.stubEnv("VITE_MAP_MODEL_BASE_URL", "https://models.example.test/v2/");

    expect(getMapModelUrl("mp_12")).toBe("https://models.example.test/v2/mp_12.glb?rev=1");
    expect(getMapModelUrl("bhop_delicesine")).toBe(
      "https://models.example.test/v2/bhop_delicesine.glb?rev=1",
    );
    expect(getMapModelUrl("jm_pier_250")).toBe("https://models.example.test/v2/jm_pier_250.glb");
  });
});
