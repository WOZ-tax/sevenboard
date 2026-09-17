export interface StaffInput {
  name: string;
  email: string;
}
export interface StaffPreviewRow extends StaffInput {
  row: number;
  status: "new" | "existing" | "skip" | "error";
  message: string;
  initialPassword?: string;
}
export interface StaffPreview {
  rows: StaffPreviewRow[];
  newCount: number;
  existingCount: number;
  skippedCount: number;
  errorCount: number;
}
export interface AssignmentInput {
  orgIds: string[];
  userIds: string[];
}
export interface AssignmentPreview {
  companies: {
    orgId: string;
    orgName: string;
    addCount: number;
    skippedCount: number;
  }[];
  staff: { id: string; name: string; email: string }[];
  addCount: number;
  skippedCount: number;
}
export interface AssignmentResult {
  addedCount: number;
  skippedCount: number;
  companyCount: number;
  staffCount: number;
}

/** Two columns copied from a spreadsheet, or RFC-style quoted CSV. Never silently drop a malformed row. */
export function parseStaffPaste(input: string): StaffInput[] {
  const text = input.replace(/^\uFEFF/, "").trim();
  if (!text) throw new Error("名前とメールアドレスを貼り付けてください");
  const delimiter = text.includes("\t") ? "\t" : ",";
  const records: string[][] = [];
  let record: string[] = [],
    field = "",
    quoted = false,
    closed = false;
  const finishField = () => {
    record.push(field.trim());
    field = "";
    closed = false;
  };
  const finishRecord = () => {
    finishField();
    if (record.some(Boolean)) records.push(record);
    record = [];
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else field += char;
    } else if (char === delimiter) finishField();
    else if (char === "\r" || char === "\n") {
      finishRecord();
      if (char === "\r" && text[i + 1] === "\n") i++;
    } else if (char === '"' && !field && !closed) quoted = true;
    else if (char === '"' || (closed && char.trim()))
      throw new Error(
        "引用符の位置を確認してください。名前・メールアドレスの2列で貼り付けてください",
      );
    else field += char;
  }
  if (quoted) throw new Error("閉じられていない引用符があります");
  finishRecord();
  if (
    /^(名前|氏名|name)$/i.test(records[0]?.[0] ?? "") &&
    /^(メールアドレス|メール|email|e-mail)$/i.test(records[0]?.[1] ?? "")
  )
    records.shift();
  if (!records.length || records.length > 100)
    throw new Error("1回に1〜100名を登録できます");
  return records.map((row, index) => {
    if (row.length !== 2)
      throw new Error(
        `${index + 1}行目は${row.length}列あります。名前・メールアドレスの2列にしてください`,
      );
    if (row[0].length > 100 || row[1].length > 254)
      throw new Error(`${index + 1}行目の名前またはメールアドレスが長すぎます`);
    return { name: row[0], email: row[1] };
  });
}

export function staffCredentialsCsv(rows: StaffPreviewRow[]): string {
  const cell = (value: string) =>
    '"' +
    (/^[=+@\-\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""') +
    '"';
  return (
    "\uFEFF" +
    [
      ["名前", "メールアドレス", "初期パスワード"],
      ...rows
        .filter((r) => r.initialPassword)
        .map((r) => [r.name, r.email, r.initialPassword!]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n")
  );
}
