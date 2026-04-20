import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsUUID,
  IsUrl,
} from 'class-validator';
import {
  ActionSeverity,
  ActionOwnerRole,
  ActionStatus,
} from '@prisma/client';

export class UpdateActionDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ActionSeverity)
  severity?: ActionSeverity;

  @IsOptional()
  @IsEnum(ActionOwnerRole)
  ownerRole?: ActionOwnerRole;

  @IsOptional()
  @IsUUID()
  ownerUserId?: string | null;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsEnum(ActionStatus)
  status?: ActionStatus;

  @IsOptional()
  @IsUrl()
  linkedSlackThreadUrl?: string | null;

  @IsOptional()
  @IsString()
  note?: string;
}
