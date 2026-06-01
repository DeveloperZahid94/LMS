import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateStudentDto } from './create-student.dto';
import { StudentStatus } from '@lms/shared';

export class UpdateStudentDto extends PartialType(CreateStudentDto) {
  @IsOptional()
  @IsEnum(StudentStatus)
  status?: StudentStatus;
}
