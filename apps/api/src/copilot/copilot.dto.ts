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

  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => CopilotMessageDto)
  messages!: CopilotMessageDto[];
}
