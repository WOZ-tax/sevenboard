import type { CertaintyLevel } from "./api-types";

export type { CertaintyLevel } from "./api-types";

export const CERTAINTY_LEVELS: CertaintyLevel[] = [
  "CONFIRMED",
  "PLANNED",
  "ESTIMATED",
];

export const CERTAINTY_LABEL: Record<CertaintyLevel, string> = {
  CONFIRMED: "確定",
  PLANNED: "予定",
  ESTIMATED: "概算",
};

export const CERTAINTY_OPACITY: Record<CertaintyLevel, string> = {
  CONFIRMED: "opacity-100",
  PLANNED: "opacity-70",
  ESTIMATED: "opacity-40",
};

export const CERTAINTY_LEGEND: {
  level: CertaintyLevel;
  label: string;
  color: string;
}[] = [
  { level: "CONFIRMED", label: "確定", color: "bg-blue-500" },
  { level: "PLANNED", label: "予定", color: "bg-amber-500" },
  { level: "ESTIMATED", label: "概算", color: "bg-gray-400" },
];

// Seed rules applied when an org has not yet configured its own.
// Users can override all of these from the settings page.
export const DEFAULT_CERTAINTY_RULES: Record<string, CertaintyLevel> = {
  売上回収: "CONFIRMED",
  売上入金: "CONFIRMED",
  人件費: "PLANNED",
  家賃: "PLANNED",
  借入返済: "PLANNED",
  その他経費: "ESTIMATED",
  その他支出: "ESTIMATED",
  設備投資: "ESTIMATED",
  法人税等: "ESTIMATED",
};
