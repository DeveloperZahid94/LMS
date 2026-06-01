import {
  IsEmail, IsEnum, IsISO8601, IsOptional, IsString, IsUUID, Length, Matches, MaxLength,
} from 'class-validator';
import { Gender } from '@lms/shared';

export class CreateStudentDto {
  @IsUUID()
  branchId!: string;

  @IsString()
  @Length(2, 120)
  fullName!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @Matches(/^\+?\d{8,15}$/, { message: 'phone must be 8–15 digits with optional + prefix' })
  phone!: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsISO8601()
  dateOfBirth?: string;

  // ---- KYC ----
  @IsOptional()
  @Matches(/^\d{12}$/, { message: 'aadhaarNumber must be exactly 12 digits' })
  aadhaarNumber?: string;

  @IsOptional()
  @IsString()
  @Length(6, 20)
  voterId?: string;

  // ---- Family / emergency ----
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fatherName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  motherName?: string;

  @IsOptional()
  @Matches(/^\+?\d{8,15}$/, { message: 'emergencyContact must be a valid phone number' })
  emergencyContact?: string;

  // ---- Addresses ----
  @IsOptional()
  @IsString()
  @MaxLength(500)
  permanentAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  temporaryAddress?: string;

  // ---- Academic ----
  @IsOptional()
  @IsString()
  @MaxLength(80)
  examTarget?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsString()
  idProofUrl?: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
