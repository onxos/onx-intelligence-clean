import { Injectable } from '@nestjs/common';

export type IntentType =
  | 'REPORT_CREATE'
  | 'REMINDER_SEND'
  | 'RBAC_CHECK'
  | 'RBAC_ASSIGN'
  | 'ANALYTICS_QUERY'
  | 'DIAGNOSIS_ASSIST'
  | 'TREATMENT_RECOMMEND'
  | 'DRUG_INTERACTION'
  | 'IMAGE_ANALYSIS'
  | 'SCHEDULING_OPTIMIZE'
  | 'VOICE_TO_SOAP'
  | 'CLIENT_COMMUNICATION'
  | 'REVENUE_OPTIMIZE'
  | 'INVENTORY_PREDICT'
  | 'CHURN_PREDICT'
  | 'QUALITY_AUDIT'
  | 'KNOWLEDGE_QUERY'
  | 'UNKNOWN';

export interface ParsedCommand {
  intent: IntentType;
  confidence: number;
  entities: Record<string, unknown>;
  originalText: string;
}

@Injectable()
export class CommandParser {
  async parse(text: string, _ws: string): Promise<ParsedCommand> {
    const l = text.toLowerCase();

    if (l.includes('diagnosis') || l.includes('تشخيص') || l.includes('symptoms') || l.includes('أعراض')) {
      return { intent: 'DIAGNOSIS_ASSIST', confidence: 0.9, entities: {}, originalText: text };
    }

    if (l.includes('treatment') || l.includes('علاج') || l.includes('dosage') || l.includes('جرعة')) {
      return { intent: 'TREATMENT_RECOMMEND', confidence: 0.9, entities: {}, originalText: text };
    }

    if (l.includes('drug interaction') || l.includes('تفاعل دوائي') || l.includes('interaction')) {
      return { intent: 'DRUG_INTERACTION', confidence: 0.9, entities: {}, originalText: text };
    }

    if (l.includes('voice') || l.includes('صوت') || l.includes(' dictate') || l.includes('soap')) {
      return { intent: 'VOICE_TO_SOAP', confidence: 0.9, entities: {}, originalText: text };
    }

    if (l.includes('schedule') || l.includes('موعد') || l.includes('calendar') || l.includes('optimize')) {
      return { intent: 'SCHEDULING_OPTIMIZE', confidence: 0.9, entities: {}, originalText: text };
    }

    if (l.includes('communication') || l.includes('message') || l.includes('remind') || l.includes('تذكير') || l.includes('أرسل')) {
      return { intent: 'CLIENT_COMMUNICATION', confidence: 0.9, entities: { type: 'reminder' }, originalText: text };
    }

    if (l.includes('revenue') || l.includes('billing') || l.includes('فاتورة') || l.includes('charge')) {
      return { intent: 'REVENUE_OPTIMIZE', confidence: 0.9, entities: {}, originalText: text };
    }

    if (l.includes('inventory') || l.includes('stock') || l.includes('مخزون')) {
      return { intent: 'INVENTORY_PREDICT', confidence: 0.9, entities: {}, originalText: text };
    }

    if (l.includes('churn') || l.includes('retention') || l.includes('loyalty')) {
      return { intent: 'CHURN_PREDICT', confidence: 0.9, entities: {}, originalText: text };
    }

    if (l.includes('quality') || l.includes('audit') || l.includes('compliance')) {
      return { intent: 'QUALITY_AUDIT', confidence: 0.9, entities: {}, originalText: text };
    }

    if (l.includes('knowledge') || l.includes('sop') || l.includes('procedure') || l.includes('بروتوكول')) {
      return { intent: 'KNOWLEDGE_QUERY', confidence: 0.9, entities: {}, originalText: text };
    }

    if (l.includes('report') || l.includes('تقرير')) {
      return {
        intent: 'REPORT_CREATE',
        confidence: 0.9,
        entities: { type: 'summary' },
        originalText: text,
      };
    }

    if (l.includes('remind') || l.includes('تذكير') || l.includes('أرسل')) {
      return {
        intent: 'REMINDER_SEND',
        confidence: 0.9,
        entities: { type: 'appointment' },
        originalText: text,
      };
    }

    if (l.includes('صلاحية') || l.includes('دكتور') || l.includes('permission')) {
      return {
        intent: 'RBAC_CHECK',
        confidence: 0.8,
        entities: {
          target: l.match(/(?:دكتور|د\.|dr\.?\s*)(\w+)/i)?.[1] || 'unknown',
        },
        originalText: text,
      };
    }

    if (l.includes('كم') || l.includes('عدد') || l.includes('how many')) {
      return {
        intent: 'ANALYTICS_QUERY',
        confidence: 0.8,
        entities: { metric: 'count' },
        originalText: text,
      };
    }

    return { intent: 'UNKNOWN', confidence: 0, entities: {}, originalText: text };
  }
}
