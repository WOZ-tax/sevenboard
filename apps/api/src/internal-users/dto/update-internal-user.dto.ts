import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { TENANT_STAFF_ROLES, TenantStaffRole } from './create-internal-user.dto';

export class UpdateInternalUserDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  name?: string;

  /** Tenant staff role. Client-side org roles are managed from masters/users. */
  @IsIn(TENANT_STAFF_ROLES)
  @IsOptional()
  role?: TenantStaffRole;

  @IsString()
  @MinLength(8)
  @IsOptional()
  password?: string;
}
