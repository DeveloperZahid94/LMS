import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '@lms/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'dev-secret-change-me',
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // Single-session enforcement. Only tokens minted under a single-session
    // tenant carry `sid`; everything else (students, superadmin, multi-session
    // tenants) skips the DB check entirely. If the user's current sessionId no
    // longer matches, this token belongs to a superseded login — reject it.
    if (payload.sid && payload.sub) {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { sessionId: true },
      });
      if (user?.sessionId && user.sessionId !== payload.sid) {
        throw new UnauthorizedException('Session ended — you signed in on another device.');
      }
    }
    return payload;
  }
}
