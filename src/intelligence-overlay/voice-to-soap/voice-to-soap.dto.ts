import { IsArray, IsOptional, IsString } from 'class-validator';

export class VoiceToSoapDto {
  @IsString()
  audioBase64!: string;

  @IsOptional()
  @IsString()
  format?: string;

  @IsOptional()
  @IsString()
  transcriptHint?: string;
}

export class VoiceStreamDto {
  @IsArray()
  chunks!: string[];

  @IsOptional()
  @IsString()
  format?: string;
}
