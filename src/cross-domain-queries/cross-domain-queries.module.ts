import { Module } from '@nestjs/common';
import { CrossDomainQueriesController } from './cross-domain-queries.controller';
import { CrossDomainQueriesService } from './cross-domain-queries.service';

@Module({
  controllers: [CrossDomainQueriesController],
  providers: [CrossDomainQueriesService],
  exports: [CrossDomainQueriesService],
})
export class CrossDomainQueriesModule {}
