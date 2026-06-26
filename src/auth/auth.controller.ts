import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt.guard';

class RegisterDto {
  email: string;
  password: string;
  name: string;
  roleId?: string;
  workspaceId?: string;
  tenantId?: string;
}

class LoginDto {
  email: string;
  password: string;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly svc: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register new user' })
  async register(@Body() body: RegisterDto) {
    try {
      return await this.svc.register(body);
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        { error: 'REGISTER_FAILED', message: err?.message || 'Unknown error' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login and get JWT' })
  async login(@Body() body: LoginDto) {
    return this.svc.login(body.email, body.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  async me(@Req() req: any) {
    return this.svc.validateUser(req.user.userId);
  }

  @Post('revoke')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke current session' })
  async revoke(@Req() req: any) {
    return this.svc.revokeUserSessions(req.user.userId);
  }

  @Get('devices')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List user devices' })
  async devices(@Req() req: any) {
    return this.svc.getUserDevices(req.user.userId);
  }
}
