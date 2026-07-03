import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class ThrottlerGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    return true; // Phase R1: Allow all
  }
}
