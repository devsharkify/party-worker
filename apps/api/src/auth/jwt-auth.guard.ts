import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { APP_ENV, type Env } from "../config/env";
import type { AccessTokenPayload } from "./auth.types";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    @Inject(APP_ENV) private readonly env: Env,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.["authorization"];
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing access token");
    }
    const token = header.slice(7);
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.env.JWT_ACCESS_SECRET,
      });
      if (payload.typ !== "access") throw new Error("wrong token type");
      req.user = { id: payload.sub, role: payload.role };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired access token");
    }
  }
}
