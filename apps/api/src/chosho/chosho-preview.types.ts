/**
 * 残高調書 preview の data shape。
 *
 * Unit 2A スコープ: MF 推移表 (BS) を 3 階層 row 配列に flatten したものを返すだけで、
 * DB 保存は一切行わない。返却 shape は後続の保存 Unit (chosho_rows insert) でも
 * そのまま流用できるよう、column 名は chosho_rows と揃えている。
 */

export interface ChoshoPreviewRow {
  /** 階層上の一意キー (path-like)。parentRowKey で親子関係を辿る。 */
  rowKey: string;
  /** ルート行は null。 */
  parentRowKey: string | null;
  /** ネスト深度 (0=最上位、深くなるほど大きい)。 */
  level: number;
  /** flatten 後の表示順 (描画順そのまま)。 */
  displayOrder: number;
  /** 表示名 (MF row.name) */
  name: string;
  /** MF row.type の素値 (例: 'assets', 'financial_statement_item', 'account') */
  mfType: string;
  /** 月別残高 {1-12: 残高}。MF が値を返さなかった月はキー欠落。 */
  monthlyBalances: Record<number, number>;
  /** 決算整理列 (settlement_balance) の値。 */
  settlementBalance: number | null;
  /** 合計列 (total) の値。 */
  total: number | null;
  /** 子行を持つか (UI の expand トグル判定用)。 */
  hasChildren: boolean;
}

export interface ChoshoPreviewResult {
  fiscalYear: number;
  /** クライアントが指定した「最新月」(1-12 のカレンダー月)。 */
  selectedMonth: number;
  /** 会計年度の期首月 (1-12)。Organization.fiscalMonthEnd から導出。 */
  fyStartMonth: number;
  /** MF が返した column 順の月配列。例: 期首4月なら [4,5,6,...,3]。 */
  monthOrder: number[];
  rows: ChoshoPreviewRow[];
}
