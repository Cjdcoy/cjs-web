import { describe, expect, it } from "vitest";
import { normalizeCodColorCodes, parseCodName, stripCodColorCodes } from "./codName";

describe("COD2 player names", () => {
  it("splits every supported caret color into safe text segments", () => {
    expect(parseCodName("^0Zero^1One^2Two^3Three^4Four^5Five^6Six^7Seven^8Eight^9Nine")).toEqual({
      plainText: "ZeroOneTwoThreeFourFiveSixSevenEightNine",
      segments: [
        { color: "0", text: "Zero" },
        { color: "1", text: "One" },
        { color: "2", text: "Two" },
        { color: "3", text: "Three" },
        { color: "4", text: "Four" },
        { color: "5", text: "Five" },
        { color: "6", text: "Six" },
        { color: "7", text: "Seven" },
        { color: "8", text: "Eight" },
        { color: "9", text: "Nine" },
      ],
    });
  });

  it("normalizes duplicated feed encodings like the J4L renderer", () => {
    expect(normalizeCodColorCodes("^^22Runner ^^7One")).toBe("^2Runner ^7One");
    expect(stripCodColorCodes("^^22Runner ^^7One")).toBe("Runner One");
  });

  it("keeps unsupported controls and markup-like text literal", () => {
    expect(stripCodColorCodes("^x<script>alert(1)</script>")).toBe("^x<script>alert(1)</script>");
  });
});
