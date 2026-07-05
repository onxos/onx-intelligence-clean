/**
 * Atlas V7 — Corpus Ingestion Engine
 * Bulk ingestion of intelligence documents from external sources
 * (EMR, lab systems, financial exports, manual uploads) into the
 * corpus_documents table, in batches.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { IntelligenceDomain } from '@prisma/client';

const BATCH_SIZE = 100;

export interface IngestDocumentInput {
  title: string;
  content: string;
  metadata?: Record<string, any>;
  domain: string;
}

@Injectable()
export class CorpusIngestionService {
  constructor(private readonly prisma: PrismaService) {}

  async bulkIngest(workspaceId: string, source: string, documents: IngestDocumentInput[]) {
    const batches: IngestDocumentInput[][] = [];
    for (let i = 0; i < documents.length; i += BATCH_SIZE) {
      batches.push(documents.slice(i, i + BATCH_SIZE));
    }

    const jobId = `bulk_${Date.now()}`;
    const stages: string[] = [];

    // Stage 1: INTAKE — normalize/validate documents before persistence
    stages.push(
      `INTAKE: received ${documents.length} document(s) across ${batches.length} batch(es)`,
    );
    const invalid = documents.filter((d) => !d.title?.trim() || !d.content?.trim());
    if (invalid.length > 0) {
      stages.push(`VALIDATION: rejected ${invalid.length} document(s) missing title/content`);
    }

    let totalIngested = 0;
    const errors: string[] = [];

    for (const [index, batch] of batches.entries()) {
      try {
        const values = batch
          .filter((d) => d.title?.trim() && d.content?.trim())
          .map((d, docIndex) => ({
            title: d.title,
            content: d.content,
            source,
            sourceId: `${jobId}_${index}_${docIndex}`,
            domain: this.normalizeDomain(d.domain),
            workspaceId,
            metadata: d.metadata ?? {},
          }));

        // Stage 2: CLASSIFICATION already applied via normalizeDomain() above
        if (values.length > 0) {
          await this.prisma.corpusDocument.createMany({ data: values });
          totalIngested += values.length;
        }
      } catch (err: any) {
        errors.push(`Batch ${index} failed: ${err.message}`);
      }
    }
    stages.push(`CLASSIFICATION: domain-normalized ${totalIngested} document(s)`);
    stages.push(`INGESTION: persisted ${totalIngested}/${documents.length} document(s)`);

    // Stage 8: INTEGRATION — surface ingestion outcome for downstream consumers
    stages.push(
      errors.length === 0
        ? 'INTEGRATION: job complete, no errors'
        : `INTEGRATION: job complete with ${errors.length} batch error(s)`,
    );

    return {
      jobId,
      totalIngested,
      totalBatches: batches.length,
      errors: errors.length > 0 ? errors : undefined,
      status: errors.length === 0 ? 'COMPLETE' : 'PARTIAL',
      stages,
    };
  }

  async getIngestionStatus(workspaceId: string, jobId: string) {
    const corpusSize = await this.prisma.corpusDocument.count({
      where: { workspaceId, sourceId: { startsWith: jobId } },
    });

    return {
      jobId,
      corpusSize,
      status: corpusSize > 0 ? 'COMPLETE' : 'PROCESSING',
    };
  }

  private normalizeDomain(domain: string): IntelligenceDomain {
    const normalized = domain?.toUpperCase().replace(/[\s-]/g, '_');
    const valid = Object.values(IntelligenceDomain) as string[];
    return (valid.includes(normalized) ? normalized : 'OPERATIONAL') as IntelligenceDomain;
  }
}
