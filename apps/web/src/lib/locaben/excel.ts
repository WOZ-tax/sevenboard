/**
 * ロカベン Excel 出力。
 *
 * 公式 METI ロカベンシートを参考にした 3 シート構成:
 *   1. 財務分析: 6 指標 + 業種平均比較
 *   2. 非財務シート: 経営者 / 関係者 / 事業 / 内部管理体制
 *   3. 業種・期間情報
 *
 * 完全な公式フォーマット互換ではなく、内容を保持した実用フォーマット。
 */

import * as XLSX from "xlsx";
import {
  LOCABEN_METRICS,
  LOCABEN_METRIC_KEYS,
  NON_FINANCIAL_SECTIONS,
  type LocabenMetricKey,
} from "./constants";
import type { IndustryCode } from "../industries";

export interface LocabenExportInput {
  organizationName: string;
  industry: IndustryCode | null;
  periodLabel: string;
  values: Record<LocabenMetricKey, number | null>;
  benchmarks: Record<LocabenMetricKey, number>;
  nonFinancial: Record<string, Record<string, string>>;
  exportedAt: Date;
}

function fmt(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "";
  return v.toFixed(1);
}

function diff(value: number | null, benchmark: number): string {
  if (value === null || !Number.isFinite(value)) return "";
  return (value - benchmark).toFixed(1);
}

export function buildLocabenWorkbook(input: LocabenExportInput): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const headerRows: (string | number)[][] = [
    ["ローカルベンチマーク (ロカベン)"],
    [],
    ["事業者名", input.organizationName],
    ["業種", input.industry ?? "(未設定)"],
    ["対象期間", input.periodLabel],
    ["出力日時", input.exportedAt.toLocaleString("ja-JP")],
    [],
  ];

  const financeRows: (string | number)[][] = [
    ["指標", "単位", "実績値", "業種平均", "差分", "計算式", "意味"],
    ...LOCABEN_METRIC_KEYS.map((key) => {
      const def = LOCABEN_METRICS[key];
      return [
        def.label,
        def.unit,
        fmt(input.values[key]),
        input.benchmarks[key].toFixed(1),
        diff(input.values[key], input.benchmarks[key]),
        def.formula,
        def.meaning,
      ];
    }),
  ];

  const financeSheet = XLSX.utils.aoa_to_sheet([...headerRows, ...financeRows]);
  financeSheet["!cols"] = [
    { wch: 24 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 40 },
    { wch: 50 },
  ];
  XLSX.utils.book_append_sheet(wb, financeSheet, "財務分析");

  for (const section of NON_FINANCIAL_SECTIONS) {
    const sectionData = input.nonFinancial[section.key] ?? {};
    const rows: (string | number)[][] = [
      [section.label],
      [],
      ["項目", "記載内容"],
      ...section.fields.map((field) => [field.label, sectionData[field.key] ?? ""]),
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = [{ wch: 28 }, { wch: 70 }];
    XLSX.utils.book_append_sheet(wb, sheet, section.label);
  }

  return wb;
}

export function downloadLocabenExcel(input: LocabenExportInput) {
  const wb = buildLocabenWorkbook(input);
  const safe = input.organizationName.replace(/[\\/:*?"<>|]/g, "_");
  const stamp = input.exportedAt
    .toISOString()
    .replace(/[-:T]/g, "")
    .slice(0, 14);
  const filename = `locaben_${safe}_${stamp}.xlsx`;
  XLSX.writeFile(wb, filename);
}
