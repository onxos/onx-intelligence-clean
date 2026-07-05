import { Injectable } from '@nestjs/common';
import { ConnectorService } from './connector.service';

export interface PaymentPayload {
  amount: number;
  currency?: string;
  sourceId?: string;     // Square/Stripe token
  customerId?: string;
  description?: string;
  metadata?: Record<string, string>;
}

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  status?: string;
  error?: string;
}

@Injectable()
export class PaymentService {
  constructor(private readonly connectorService: ConnectorService) {}

  async processPayment(workspaceId: string, provider: 'SQUARE' | 'STRIPE', payload: PaymentPayload): Promise<PaymentResult> {
    const start = Date.now();
    const connector = await this.connectorService.getActiveConnector(workspaceId, 'PAYMENT', provider);
    if (!connector) return { success: false, error: `No active ${provider} connector configured` };

    try {
      // TODO: Integrate Square/Stripe SDK
      // Square: const client = new Square.Client({ accessToken: connector.credentials.accessToken, environment: connector.credentials.environment });
      // Stripe: const stripe = require('stripe')(connector.credentials.secretKey);
      const result = { id: `mock-payment-${Date.now()}`, status: 'COMPLETED' };

      await this.connectorService.logEvent(workspaceId, connector.id, 'OUTBOUND', `process_payment_${provider.toLowerCase()}`, 'SUCCESS', { amount: payload.amount }, null, Date.now() - start);
      return { success: true, transactionId: result.id, status: result.status };
    } catch (err) {
      await this.connectorService.logEvent(workspaceId, connector.id, 'OUTBOUND', `process_payment_${provider.toLowerCase()}`, 'FAILED', { amount: payload.amount }, err.message, Date.now() - start);
      return { success: false, error: err.message };
    }
  }

  async refund(workspaceId: string, provider: 'SQUARE' | 'STRIPE', transactionId: string, amount?: number): Promise<PaymentResult> {
    const start = Date.now();
    const connector = await this.connectorService.getActiveConnector(workspaceId, 'PAYMENT', provider);
    if (!connector) return { success: false, error: `No active ${provider} connector configured` };

    try {
      // TODO: Integrate Square/Stripe refund API
      const result = { id: `mock-refund-${Date.now()}`, status: 'COMPLETED' };
      await this.connectorService.logEvent(workspaceId, connector.id, 'OUTBOUND', `refund_${provider.toLowerCase()}`, 'SUCCESS', { transactionId, amount }, null, Date.now() - start);
      return { success: true, transactionId: result.id, status: result.status };
    } catch (err) {
      await this.connectorService.logEvent(workspaceId, connector.id, 'OUTBOUND', `refund_${provider.toLowerCase()}`, 'FAILED', { transactionId }, err.message, Date.now() - start);
      return { success: false, error: err.message };
    }
  }

  async createCustomer(workspaceId: string, provider: 'SQUARE' | 'STRIPE', name: string, email: string, phone?: string): Promise<{ success: boolean; customerId?: string; error?: string }> {
    const connector = await this.connectorService.getActiveConnector(workspaceId, 'PAYMENT', provider);
    if (!connector) return { success: false, error: `No active ${provider} connector configured` };
    // TODO: Integrate Square/Stripe customer creation
    return { success: true, customerId: `mock-customer-${Date.now()}` };
  }
}
