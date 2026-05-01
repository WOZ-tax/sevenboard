import { IsIn, IsInt, Max, Min } from 'class-validator';

export class RunRiskScanDto {
  @IsInt()
  fiscalYear!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  /**
   * 'L1' = 決定的ルール (毎月の自動実行が原則だが、手動で再実行する場合も有り)
   * 'L3' = LLM 摘要異常検知 (「AI詳細チェック」ボタン押下時のみ)
   */
  @IsIn(['L1', 'L3'])
  layer!: 'L1' | 'L3';
}
