import { JwtService } from '@nestjs/jwt';

const jwt = new JwtService({ secret: 'onx-jwt-dev-secret-change-in-production' });

const token = jwt.sign({
  sub: 'user_test_onx',
  workspaceId: 'ws_test_onx',
  email: 'test@onx.sa',
  role: 'ADMIN',
});

console.log('TEST_JWT:', token);
