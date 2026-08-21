export type CodColorCode = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

export interface CodNameSegment {
  readonly color: CodColorCode | null;
  readonly text: string;
}

export interface ParsedCodName {
  readonly plainText: string;
  readonly segments: readonly CodNameSegment[];
}

const codColorPattern = /^[0-9]$/;

export function normalizeCodColorCodes(value: string): string {
  return value.replace(/\^\^([0-9])\1/g, "^$1").replace(/\^\^([0-9])/g, "^$1");
}

export function parseCodName(value: string): ParsedCodName {
  const segments: CodNameSegment[] = [];
  const normalizedValue = normalizeCodColorCodes(value);
  let color: CodColorCode | null = null;
  let text = "";

  const flush = () => {
    if (!text) return;
    segments.push({ color, text });
    text = "";
  };

  for (let index = 0; index < normalizedValue.length; index += 1) {
    const character = normalizedValue[index];
    const possibleColor = normalizedValue[index + 1];

    if (character === "^" && possibleColor !== undefined && codColorPattern.test(possibleColor)) {
      flush();
      color = possibleColor as CodColorCode;
      index += 1;
      continue;
    }

    text += character;
  }

  flush();
  const plainText = segments
    .map((segment) => segment.text)
    .join("")
    .trim();

  if (plainText) return { plainText, segments };

  return {
    plainText: "Unknown player",
    segments: [{ color: null, text: "Unknown player" }],
  };
}

export function stripCodColorCodes(value: string): string {
  return parseCodName(value).plainText;
}
