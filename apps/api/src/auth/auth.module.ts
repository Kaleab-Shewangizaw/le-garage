import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { TokenService } from "./token.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, TokenService],
  // JwtModule is re-exported so JwtService is resolvable by JwtAuthGuard,
  // which is registered as a global APP_GUARD in AppModule (docs/AUTH.md §4).
  exports: [TokenService, JwtModule],
})
export class AuthModule {}
