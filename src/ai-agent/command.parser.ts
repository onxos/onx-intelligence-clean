/**
 * ONX AI Agent — Command Parser
 * Uses AI to convert natural language → structured intent + parameters
 */

import { Injectable } from '@nestjs/common';
import { AiRouterService } from '../ai-core/ai-router.service';

export type IntentType =
  | 'REPORT_CREATE'
  | 'REMINDER_SEND'
  | 'RBAC_CHECK'
  | 'RBAC_ASSIGN'
  | 'ANALYTICS_QUERY'
  | 'UNKNOWN';

export interface ParsedCommand {
  intent: IntentType;
  confidence: number;
  entities: Record<string, any>;
  originalText: string;
}

@Injectable()
export class CommandParser {
  constructor(private readonly aiRouter: AiRouterService) {}

  async parse(text: string, workspaceId: string): Promise<ParsedCommand> {
    // Use AI to classify intent
    const prompt = `
You are a command parser for a veterinary clinic system. Parse the user's command into structured intent and entities.

User command: "${text}"

Available intents:
- REPORT_CREATE: Generate reports (patients, appointments, billing, clinical)
- REMINDER_SEND: Send reminders via WhatsApp/SMS (appointments, vaccinations, follow-ups)
- RBAC_CHECK: Check user permissions or roles
- RBAC_ASSIGN: Assign roles to users
- ANALYTICS_QUERY: Query clinic analytics and statistics
- UNKNOWN: Cannot determine intent

Respond ONLY with valid JSON in this exact format:
{
  "intent": "REPORT_CREATE|REMINDER_SEND|RBAC_CHECK|RBAC_ASSIGN|ANALYTICS_QUERY|UNKNOWN",
  "confidence": 0.0-1.0,
  "entities": {
    "reportType": "patients|appointments|billing|clinical|summary",
    "dateRange": "today|this_week|this_month|last_month|custom",
    "recipientFilter": "all|specific_doctor|specific_patient",
    "reminderType": "appointment|vaccination|followup|custom",
    "targetUser": "user_id_or_name",
    "role": "ADMIN|VETERINARIAN|TECHNICIAN|RECEPTIONIST|VIEWER",
    "metric": "patient_count|appointment_count|revenue|utilization",
    "any_other_extracted_parameter": "value"
  }
}`;

    try {
      const response = await this.aiRouter.route({
        message: prompt,
        workspaceId,
        context: { type: 'intent_parsing', skipGuardrails: true },
      });

      const parsed = JSON.parse(this.extractJson(response.content));
      return {
        intent: parsed.intent as IntentType,
        confidence: parsed.confidence ?? 0.5,
        entities: parsed.entities ?? {},
        originalText: text,
      };
    } catch {
      // Fallback: keyword matching
      return this.fallbackParse(text);
    }
  }

  private fallbackParse(text: string): ParsedCommand {
    const lower = text.toLowerCase();
    let intent: IntentType = 'UNKNOWN';
    const entities: Record<string, any> = {};

    if (lower.includes('report') || lower.includes('تقرير')) {
      intent = 'REPORT_CREATE';
      if (lower.includes('patient') || lower.includes('مريض')) entities.reportType = 'patients';
      else if (lower.includes('appointment') || lower.includes('موعد')) entities.reportType = 'appointments';
      else if (lower.includes('bill') || lower.includes('فاتورة')) entities.reportType = 'billing';
      else entities.reportType = 'summary';
    } else if (lower.includes('remind') || lower.includes('تذكير') || lower.includes('send')) {
      intent = 'REMINDER_SEND';
      if (lower.includes('appointment') || lower.includes('موعد')) entities.reminderType = 'appointment';
      else if (lower.includes('vaccin') || lower.includes('تطعيم')) entities.reminderType = 'vaccination';
    } else if (lower.includes('permission') || lower.includes('role') || lower.includes('صلاحية')) {
      intent = lower.includes('assign') || lower.includes('give') ? 'RBAC_ASSIGN' : 'RBAC_CHECK';
    } else if (lower.includes('analytic') || lower.includes('stat') || lower.includes('إحصاء')) {
      intent = 'ANALYTICS_QUERY';
    }

    // Extract date ranges
    if (lower.includes('today') || lower.includes('اليوم')) entities.dateRange = 'today';
    else if (lower.includes('week') || lower.includes('أسبوع')) entities.dateRange = 'this_week';
    else if (lower.includes('month') || lower.includes('شهر')) entities.dateRange = 'this_month';

    return { intent, confidence: 0.6, entities, originalText: text };
  }

  private extractJson(text: string): string {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? match[0] : '{}';
  }
}
