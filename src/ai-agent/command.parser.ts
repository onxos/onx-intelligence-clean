import { Injectable } from '@nestjs/common';

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
  entities: Record<string, unknown>;
  originalText: string;
}

@Injectable()
export class CommandParser {
  async parse(text: string, _ws: string): Promise<ParsedCommand> {
    const l = text.toLowerCase();

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
