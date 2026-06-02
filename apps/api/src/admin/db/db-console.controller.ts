import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { DbConsoleService } from './db-console.service';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtPayload, UserRole } from '@lms/shared';

class RunQueryDto {
  @IsString() sql!: string;
  @IsOptional() @IsBoolean() confirmWrite?: boolean;
}

@ApiTags('admin/db')
@ApiBearerAuth()
@Controller('admin/db')
@Roles(UserRole.SUPER_ADMIN)
export class DbConsoleController {
  constructor(private readonly service: DbConsoleService) {}

  @Post('query')
  query(@Body() dto: RunQueryDto, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.service.run(dto, {
      userId: user?.sub ?? null,
      ip: (req.headers['x-forwarded-for'] as string) || req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
  }

  @Get('stats')
  stats() {
    return this.service.stats();
  }
}
