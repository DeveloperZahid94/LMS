import { PartialType } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { CreateStudentDto } from './create-student.dto';

/** What to do with the student's frozen leaving balance on reactivation. */
export type BalanceAction = 'CARRY' | 'CLEAR';

/**
 * Reactivating a left student. All personal fields are optional (only changed ones
 * are sent); `balanceAction` decides whether the old outstanding due is carried
 * forward (default) or cleared to zero.
 */
export class ReactivateStudentDto extends PartialType(CreateStudentDto) {
  @IsOptional()
  @IsIn(['CARRY', 'CLEAR'])
  balanceAction?: BalanceAction;
}
