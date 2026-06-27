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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt.guard';

class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8, example: 'StrongPass123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ minLength: 2, example: 'ONX User' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ required: false, example: 'role_cuid' })
  @IsOptional()
  @IsString()
  roleId?: string;

  @ApiProperty({ required: false, example: 'workspace_cuid' })
  @IsOptional()
  @IsString()
  workspaceId?: string;

  @ApiProperty({ required: false, example: 'tenant_cuid' })
  @IsOptional()
  @IsString()
  tenantId?: string;
}

class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8, example: 'StrongPass123!' })
  @IsString()
  @MinLength(8)
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
