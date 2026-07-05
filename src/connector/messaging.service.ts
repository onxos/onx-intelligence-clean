import { Injectable } from '@nestjs/common';
import { ConnectorService } from './connector.service';
import { AuditService } from '../common/audit.service';

export interface MessagePayload {
  to: string;
  body: string;
  mediaUrl?: string;
  templateName?: string;
  templateData?: Record<string, string>;
}

export interface MessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class MessagingService {
  constructor(private readonly connectorService: ConnectorService, private readonly auditService: AuditService) {}

  async sendSMS(workspaceId: string, payload: MessagePayload): Promise<MessageResult> {
    const start = Date.now();
    const connector = await this.connectorService.getActiveConnector(workspaceId, 'MESSAGING', 'TWILIO');
    if (!connector) return { success: false, error: 'No active SMS connector configured' };

    try {
      // TODO: Integrate Twilio SDK — credentials in connector.credentials
      // const twilio = require('twilio')(connector.credentials.accountSid, connector.credentials.authToken);
      // const result = await twilio.messages.create({ from: connector.credentials.fromNumber, to: payload.to, body: payload.body });
      const result = { sid: 'mock-sms-' + Date.now() }; // placeholder

      await this.connectorService.logEvent(workspaceId, connector.id, 'OUTBOUND', 'send_sms', 'SUCCESS', { to: payload.to }, null, Date.now() - start);
      return { success: true, messageId: result.sid };
    } catch (err) {
      await this.connectorService.logEvent(workspaceId, connector.id, 'OUTBOUND', 'send_sms', 'FAILED', { to: payload.to }, err.message, Date.now() - start);
      return { success: false, error: err.message };
    }
  }

  async sendWhatsApp(workspaceId: string, payload: MessagePayload): Promise<MessageResult> {
    const start = Date.now();
    const connector = await this.connectorService.getActiveConnector(workspaceId, 'MESSAGING', 'WHATSAPP');
    if (!connector) return { success: false, error: 'No active WhatsApp connector configured' };

    try {
      // TODO: Integrate Twilio WhatsApp API or Meta WhatsApp Business API
      // const result = await twilio.messages.create({ from: `whatsapp:${connector.credentials.whatsappNumber}`, to: `whatsapp:${payload.to}`, body: payload.body });
      const result = { sid: 'mock-wa-' + Date.now() };

      await this.connectorService.logEvent(workspaceId, connector.id, 'OUTBOUND', 'send_whatsapp', 'SUCCESS', { to: payload.to }, null, Date.now() - start);
      return { success: true, messageId: result.sid };
    } catch (err) {
      await this.connectorService.logEvent(workspaceId, connector.id, 'OUTBOUND', 'send_whatsapp', 'FAILED', { to: payload.to }, err.message, Date.now() - start);
      return { success: false, error: err.message };
    }
  }

  async sendTemplateMessage(workspaceId: string, templateName: string, to: string, data: Record<string, string>): Promise<MessageResult> {
    switch (templateName) {
      case 'appointment_reminder':
        return this.sendSMS(workspaceId, { to, body: `Reminder: Appointment scheduled. Patient: ${data.patientName}, Date: ${data.date}` });
      case 'vaccination_due':
        return this.sendWhatsApp(workspaceId, { to, body: `Vaccination due for ${data.patientName}. Vaccine: ${data.vaccineName}, Due: ${data.dueDate}` });
      case 'lab_result_ready':
        return this.sendSMS(workspaceId, { to, body: `Lab results for ${data.patientName} are ready. Please contact the clinic.` });
      case 'invoice_overdue':
        return this.sendWhatsApp(workspaceId, { to, body: `Invoice ${data.invoiceNumber} for ${data.patientName} is overdue. Amount: ${data.amount}` });
      default:
        return this.sendSMS(workspaceId, { to, body: data.body || 'Notification from clinic' });
    }
  }
}
