import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RequirePermissions } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';
import { CorpusIngestionService, IngestDocumentInput } from './corpus-ingestion.service';

@ApiTags('Atlas V7 — Corpus Ingestion')
@Controller('corpus-ingestion')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CorpusIngestionController {
  constructor(private readonly svc: CorpusIngestionService) {}

  @Post('bulk-ingest')
  @RequirePermissions(Permission.ATLAS_CORPUS_INGEST)
  @ApiOperation({ summary: 'Bulk ingest corpus documents from an external source' })
  bulkIngest(
    @Body() body: { workspaceId: string; source: string; documents: IngestDocumentInput[] },
  ) {
    return this.svc.bulkIngest(body.workspaceId, body.source, body.documents);
  }

  @Get('status/:jobId')
  @RequirePermissions(Permission.ATLAS_CORPUS_INGEST)
  @ApiOperation({ summary: 'Get bulk ingestion job status' })
  getStatus(@Param('jobId') jobId: string, @Query('workspaceId') workspaceId: string) {
    return this.svc.getIngestionStatus(workspaceId, jobId);
  }
}
