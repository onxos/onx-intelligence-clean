import { Module } from '@nestjs/common';
import { ClinicalDocumentController } from './clinical-document.controller';
import { ClinicalDocumentService } from './clinical-document.service';

@Module({
  controllers: [ClinicalDocumentController],
  providers: [ClinicalDocumentService],
  exports: [ClinicalDocumentService],
})
export class ClinicalDocumentModule {}
