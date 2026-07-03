import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import { Permission } from '../../rbac/permissions.enum';
import { RbacGuard, RequirePermissions } from '../../rbac/rbac.guard';
import {
  ProcessPaymentDto,
  RefundPaymentDto,
  SquarePaymentDto,
  StripePaymentDto,
} from './payment-processor.dto';
import { PaymentProcessorService } from './payment-processor.service';

@ApiTags('Financial')
@Controller('financial/payments')
@UseGuards(JwtAuthGuard, RbacGuard)
export class PaymentProcessorController {
  constructor(private readonly service: PaymentProcessorService) {}

  @Post()
  @RequirePermissions(Permission.BILLING_CREATE)
  process(@Req() req: { user: { workspaceId: string } }, @Body() dto: ProcessPaymentDto) {
    return this.service.process(req.user.workspaceId, dto);
  }

  @Post('stripe')
  @RequirePermissions(Permission.BILLING_CREATE)
  processStripe(@Req() req: { user: { workspaceId: string } }, @Body() dto: StripePaymentDto) {
    return this.service.processStripe(req.user.workspaceId, dto);
  }

  @Post('square')
  @RequirePermissions(Permission.BILLING_CREATE)
  processSquare(@Req() req: { user: { workspaceId: string } }, @Body() dto: SquarePaymentDto) {
    return this.service.processSquare(req.user.workspaceId, dto);
  }

  @Post(':id/refund')
  @RequirePermissions(Permission.BILLING_REFUND)
  refund(
    @Req() req: { user: { workspaceId: string } },
    @Param('id') id: string,
    @Body() dto: RefundPaymentDto,
  ) {
    return this.service.refund(req.user.workspaceId, id, dto);
  }
}
