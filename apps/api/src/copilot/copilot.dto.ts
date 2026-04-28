import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export type CopilotAgentKey = 'brief' | 'sentinel' | 'drafter' | 'auditor';
export type CopilotMode = 'observe' | 'dialog' | 'execute';

export class CopilotMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(4000)
  content!: string;
}

export class CopilotChatDto {
  @IsIn(['brief', 'sentinel', 'drafter', 'auditor'])
  agentKey!: CopilotAgentKey;

  @IsIn(['observe', 'dialog', 'execute'])
  mode!: CopilotMode;

  @IsString()
  @MaxLength(200)
  pathname!: string;

  @IsOptional()
  @IsInt()
  fiscalYear?: number;

  @IsOptional()
  @IsInt()
  endMonth?: number;

  @IsOptional()
  @IsIn(['worstCase', 'netBurn', 'actual'])
  runwayMode?: 'worstCase' | 'netBurn' | 'actual';

  /**
   * 業種別経営知識（フロント側で getKnowledgeForAI(code) により生成）。
   * Getsuji 由来の業界平均/特性/ヒアリング項目/失敗パターン等。
   * system prompt に注入され、回答に反映される。
   */
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  industryContext?: string;

  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => CopilotMessageDto)
  messages!: CopilotMessageDto[];
}
