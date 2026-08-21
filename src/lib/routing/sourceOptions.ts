import { defineQuerySchema, enumQueryParam } from "./queryState";

export const sourceOptions = [
  { label: "JumpersHeaven", shortLabel: "JH", value: "jh" },
  { label: "Jump4Life", shortLabel: "J4L", value: "j4l" },
] as const;

export type SourceId = (typeof sourceOptions)[number]["value"];

export const sourceQuerySchema = defineQuerySchema({
  source: enumQueryParam(
    sourceOptions.map(({ value }) => value),
    "jh",
  ),
});
