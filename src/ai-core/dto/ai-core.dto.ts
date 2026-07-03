export class AiQueryDto {
  query: string;
  domain?: string;
  providerId?: string;
  signals?: Record<string, boolean | number>;
  context?: Record<string, unknown>;
}

export class AiConsensusDto {
  query: string;
  domain?: string;
  signals?: Record<string, boolean | number>;
}

export class AiChatDto {
  messages: Array<{ role: string; content: string }>;
  domain?: string;
  signals?: Record<string, boolean | number>;
}

export class ClinicalDiagnosisDto {
  symptoms: string[];
  history?: string;
  signals?: Record<string, boolean | number>;
}

export class ClinicalProtocolDto {
  condition: string;
  context?: string;
  signals?: Record<string, boolean | number>;
}

export class AiQueryLogListDto {
  page?: number;
  pageSize?: number;
  domain?: string;
  ficStatus?: string;
}
