import { SetMetadata } from '@nestjs/common';
import type { ThrottleOptions } from './throttler.config';

export const THROTTLE_METADATA = 'onx:throttle';

/** Attach a rate-limit policy to a controller or route handler. */
export const Throttle = (options: ThrottleOptions) => SetMetadata(THROTTLE_METADATA, options);
