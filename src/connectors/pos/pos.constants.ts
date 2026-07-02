/** POS connector constants. */
export const POS_PROVIDERS = ['square', 'stripe'] as const;
export type PosProvider = (typeof POS_PROVIDERS)[number];

export const POS_DOMAIN = 'commercial';
export const POS_TIER = 1;
