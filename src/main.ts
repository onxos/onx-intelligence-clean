import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { execSync } from 'node:child_process';
import { AppModule } from './app.module';
import { buildCorsOptions } from './security/cors.config';
import { securityHeadersMiddleware } from './security/helmet.config';

function bootstrapDatabaseSchema() {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  console.log('Bootstrapping Prisma schema for production startup');
  execSync('npx prisma generate', { stdio: 'inherit' });
  execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
}

async function bootstrap() {
  try {
    bootstrapDatabaseSchema();
    const app = await NestFactory.create(AppModule, { rawBody: true });
    app.enableShutdownHooks();

    app.use(securityHeadersMiddleware);

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.enableCors(buildCorsOptions());

    const config = new DocumentBuilder()
      .setTitle('ONX Intelligence API')
      .setDescription('Sovereign Operational Intelligence System')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);

    const port = Number(process.env.PORT || 3000);
    await app.listen(port, '0.0.0.0');

    console.log(`ONX Intelligence running on port ${port}`);
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}
bootstrap();
