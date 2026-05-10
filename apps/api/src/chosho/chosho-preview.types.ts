/**
 * 残高調書 preview の data shape。
 *
 * Unit 2A スコープ: MF 推移表 (BS) を 3 階層 row 配列に flatten したものを返すだけで、
 * DB 保存は一切行わない。返却 shape は後続の保存 Unit (chosho_rows insert) でも
 * そのまま流用できるよう、column 名は chosho_rows と揃えている。
 */

/**
 * 期待残高ルール。
 *   1. ruleOverrides で渡された値 (DB から供給)
 *   2. ヒューリスティック (祖先勘定名に「売掛金/未収金/前払金/仮払金/立替金」が含まれ、
 *      かつ level >= 2 の行は agingCheckEnabled = true デフォルト)
 *   3. それ以外は NONE
 *
 * EXPECTED_VALUE は自動推論しない (常に外部入力でのみ ON、 expected_value とセット)。
 */
export type ChoshoExpectedRuleValue = 'NONE' | 'EXPECTED_VALUE' | 'AGING_3M';

/**
 * 1 行で発火した異常 1 件。Unit 2B-1 時点では選択月のみ判定。
 */
export interface ChoshoAnomaly {
  /** 異常種別。DB 側 enum (ChoshoAnomalyType) と整合させる。 */
  type: 'EXPECTED_VALUE_VIOLATION' | 'AGING_3M';
  /** 異常を検出したカレンダー月 (1-12)。selectedMonth と同じになる。 */
  month: number;
  /** UI tooltip / バナー表示用の人間可読メッセージ。 */
  message: string;
  /** 追加コンテキスト (滞留判定の比較月配列、期待残高違反の実残高 + 期待値 等)。 */
  detail?: Record<string, unknown>;
}

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
  /** 期待残高ルール。Unit 2B-1: ヒューリスティック or ruleOverrides で決定。 */
  expectedRule: ChoshoExpectedRuleValue;
  /** EXPECTED_VALUE ルールのときの期待残高。NULL = 未設定 or 他ルール。 */
  expectedValue: number | null;
  /** 滞留チェック有効フラグ。回転性勘定の子孫はデフォルト true。 */
  agingCheckEnabled: boolean;
  /** 検知された異常。空配列 = 異常なし。 */
  anomalies: ChoshoAnomaly[];
  /**
   * 滞留判定が「同額条件は満たしたが debit/credit activity ありで抑制された」場合に
   * UI の tooltip 等で理由を示すための情報。null = 抑制発火なし (= aging 検知発火 or
   * そもそも同額条件未達)。Phase 1 Unit 2B-5c の補助情報。
   */
  agingSuppressedBy: { debit: number; credit: number } | null;
}

/**
 * 行ごとのルール上書き。Unit 2B-2 以降で DB の chosho_rows から渡す。
 * key は ChoshoPreviewRow.rowKey と一致させる。
 */
export interface ChoshoRuleOverride {
  expectedRule?: ChoshoExpectedRuleValue;
  /** EXPECTED_VALUE ルールのときに比較する数値。null = 未設定 (= 異常検知スキップ)。 */
  expectedValue?: number | null;
  agingCheckEnabled?: boolean;
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
