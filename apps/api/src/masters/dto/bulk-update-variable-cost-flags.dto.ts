import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsString,
  ValidateNested,
} from 'class-validator';

export class VariableCostFlagUpdateDto {
  @IsString()
  name!: string;

  @IsBoolean()
  isVariableCost!: boolean;
}

export class BulkUpdateVariableCostFlagsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => VariableCostFlagUpdateDto)
  updates!: VariableCostFlagUpdateDto[];
}
