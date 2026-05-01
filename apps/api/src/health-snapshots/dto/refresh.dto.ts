import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class RefreshHealthSnapshotDto {
  @IsInt()
  fiscalYear!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  /**
   * AI 質問生成も実行するか。LLM トークン消費するため明示指定で。
   * 未指定 = false (スコアと指標だけ更新)
   */
  @IsOptional()
  @IsBoolean()
  generateAiQuestions?: boolean;
}
