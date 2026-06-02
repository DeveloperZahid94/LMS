import { PartialType } from '@nestjs/swagger';
import { CreateStudentDto } from './create-student.dto';

// All CreateStudentDto fields (incl. the optional `status`) become optional here.
export class UpdateStudentDto extends PartialType(CreateStudentDto) {}
