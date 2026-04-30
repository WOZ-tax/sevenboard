import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Tenant-scoped accounting firm staff invite DTO.
 *
 * Existing users can be invited by email without a password. New users need a
 * name and initial password because email delivery is not implemented yet.
 */
export const TENANT_STAFF_ROLES = [
  'firm_owner',
  'firm_admin',
  'firm_manager',
  'firm_advisor',
  'firm_viewer',
] as const;

export type TenantStaffRole = (typeof TENANT_STAFF_ROLES)[number];

export class CreateInternalUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsOptional()
  @MinLength(1)
  name?: string;

  @IsString()
  @IsOptional()
  @MinLength(8)
  password?: string;

  @IsIn(TENANT_STAFF_ROLES)
  role!: TenantStaffRole;
}
