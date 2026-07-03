import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class WebhookEmitter {
  constructor(private readonly emitter: EventEmitter2) {}

  emitCapabilityEvent(capability: string, action: string, data: unknown) {
    this.emitter.emit(`capability.${capability}`, {
      action,
      data,
      timestamp: new Date().toISOString(),
    });
  }
}