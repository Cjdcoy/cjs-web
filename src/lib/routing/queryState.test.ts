import { describe, expect, it } from "vitest";
import {
  booleanQueryParam,
  defineQuerySchema,
  enumQueryParam,
  integerQueryParam,
  readQueryState,
  stringQueryParam,
  updateQuerySearch,
} from "./queryState";

const filters = defineQuerySchema({
  populated: booleanQueryParam(false),
  query: stringQueryParam({ maxLength: 40, trim: true }),
  sort: enumQueryParam(["recent", "name", "completions"] as const, "recent"),
  page: integerQueryParam({ defaultValue: 1, min: 1, max: 100 }),
});

describe("query state", () => {
  it("reads typed filter values from an encoded query string", () => {
    expect(readQueryState("?query=mp%20caf%C3%A9&sort=name&populated=1&page=4", filters)).toEqual({
      populated: true,
      query: "mp café",
      sort: "name",
      page: 4,
    });
  });

  it("recovers defaults from malformed or unsupported values", () => {
    expect(readQueryState("?sort=fastest&populated=maybe&page=-2", filters)).toEqual({
      populated: false,
      query: "",
      sort: "recent",
      page: 1,
    });
  });

  it("round-trips encoded filters while preserving unrelated parameters", () => {
    const search = updateQuerySearch("?source=j4l&campaign=summer", filters, {
      populated: true,
      query: "  mp café & surf  ",
      sort: "completions",
    });

    expect(search).toContain("source=j4l");
    expect(search).toContain("campaign=summer");
    expect(readQueryState(search, filters)).toMatchObject({
      populated: true,
      query: "mp café & surf",
      sort: "completions",
    });
  });

  it("removes defaults and supports functional updates", () => {
    const search = updateQuerySearch("?query=jump&page=3&source=jh", filters, (current) => ({
      page: current.page + 1,
      query: "",
    }));

    expect(search).toBe("?page=4&source=jh");
  });
});
