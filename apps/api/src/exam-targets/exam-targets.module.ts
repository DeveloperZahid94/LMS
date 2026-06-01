import { Module } from '@nestjs/common';
import { ExamTargetsService } from './exam-targets.service';
import { ExamTargetsController } from './exam-targets.controller';

@Module({
  controllers: [ExamTargetsController],
  providers: [ExamTargetsService],
  exports: [ExamTargetsService],
})
export class ExamTargetsModule {}
