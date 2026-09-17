import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from "class-validator";
import {
  TENANT_STAFF_ROLES,
  TenantStaffRole,
} from "./create-internal-user.dto";

class BulkStaffRowDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsString()
  @MaxLength(254)
  email!: string;
}

export class BulkStaffDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BulkStaffRowDto)
  rows!: BulkStaffRowDto[];

  @IsIn(TENANT_STAFF_ROLES)
  role!: TenantStaffRole;
}

export class BulkAssignmentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  orgIds!: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  userIds!: string[];
}
