import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { ExamTargetsService } from './exam-targets.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@lms/shared';

class CreateExamTargetDto {
  @IsString()
  @Length(1, 80)
  name!: string;
}

@ApiTags('exam-targets')
@ApiBearerAuth()
@Controller('exam-targets')
@Roles(UserRole.STAFF)
export class ExamTargetsController {
  constructor(private readonly service: ExamTargetsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Roles(UserRole.STAFF)
  @Post()
  create(@Body() dto: CreateExamTargetDto) {
    return this.service.create(dto.name);
  }
}
