import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private connected = false;

  isConnected() {
    return this.connected;
  }

  async onModuleInit() {
    if (this.connected) {
      return;
    }

    if (!process.env.DATABASE_URL) {
      console.warn(
        'Prisma startup skipped because DATABASE_URL is not set; running in degraded mode.',
      );
      return;
    }

    try {
      await this.$connect();
      this.connected = true;
    } catch (error) {
      console.error(
        'Prisma connection failed during startup; continuing without a database connection.',
        error,
      );
    }
  }

  async onModuleDestroy() {
    if (this.connected) {
      await this.$disconnect();
    }
  }
}
