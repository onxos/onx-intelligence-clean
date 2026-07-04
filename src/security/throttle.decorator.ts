import { SetMetadata } from '@nestjs/common';

export const THROTTLE_KEY = 'throttle';

interface ThrottleOptions {
  limit: number;
  ttl: number;
}

export const Throttle = (limitOrOptions: number | ThrottleOptions, ttl?: number) => {
  if (typeof limitOrOptions === 'object') {
    return SetMetadata(THROTTLE_KEY, limitOrOptions);
  }
  return SetMetadata(THROTTLE_KEY, { limit: limitOrOptions, ttl: ttl ?? 60 });
};
