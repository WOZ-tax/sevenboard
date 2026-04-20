import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
  IsObject,
  IsUUID,
  IsUrl,
} from 'class-validator';
import {
  ActionSeverity,
  ActionOwnerRole,
  ActionSourceScreen,
} from '@prisma/client';

export class CreateActionDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(ActionSourceScreen)
  sourceScreen: ActionSourceScreen;

  @IsOptional()
  @IsObject()
  sourceRef?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(ActionSeverity)
  severity?: ActionSeverity;

  @IsOptional()
  @IsEnum(ActionOwnerRole)
  ownerRole?: ActionOwnerRole;

  @IsOptional()
  @IsUUID()
  ownerUserId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsUrl()
  linkedSlackThreadUrl?: string;
}
