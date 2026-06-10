import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, IsUUID, Length, MinLength } from 'class-validator';
import { UserRole } from '@lms/shared';

/**
 * Roles a tenant admin is allowed to assign to staff they create. Deliberately
 * excludes CLIENT_ADMIN (tenant owner) and the platform-level SUPER_ADMIN /
 * STUDENT roles — those aren't provisioned from the staff screen.
 */
export const ASSIGNABLE_STAFF_ROLES = [UserRole.BRANCH_ADMIN, UserRole.STAFF] as const;

export class CreateStaffDto {
  @IsString() @Length(2, 120)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString() @MinLength(8)
  password!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  @IsOptional() @IsString()
  phone?: string;

  /** Optional branch the staff member belongs to. */
  @IsOptional() @IsUUID()
  branchId?: string;
}

export class UpdateStaffDto {
  @IsOptional() @IsString() @Length(2, 120)
  fullName?: string;

  @IsOptional() @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsString()
  phone?: string;

  @IsOptional() @IsUUID()
  branchId?: string;

  /** When present, resets the staff member's password. */
  @IsOptional() @IsString() @MinLength(8)
  password?: string;
}
