import { Module } from '@nestjs/common';
import { CorpusIngestionController } from './corpus-ingestion.controller';
import { CorpusIngestionService } from './corpus-ingestion.service';

@Module({
  controllers: [CorpusIngestionController],
  providers: [CorpusIngestionService],
  exports: [CorpusIngestionService],
})
export class CorpusIngestionModule {}
