import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtPayload } from '@lms/shared';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return user;
  }

  @ApiBearerAuth()
  @Get('profile')
  profile(@CurrentUser() user: JwtPayload) {
    return this.auth.getProfile(user.sub);
  }

  @ApiBearerAuth()
  @Patch('profile')
  updateProfile(@CurrentUser() user: JwtPayload, @Body() dto: { fullName?: string; email?: string; phone?: string }) {
    return this.auth.updateProfile(user.sub, dto);
  }

  @ApiBearerAuth()
  @Post('change-password')
  changePassword(@CurrentUser() user: JwtPayload, @Body() dto: { currentPassword: string; newPassword: string }) {
    return this.auth.changePassword(user.sub, dto);
  }
}
