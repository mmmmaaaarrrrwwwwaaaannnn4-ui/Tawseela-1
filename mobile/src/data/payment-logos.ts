/** Optional payment brand image URIs. Empty values use the local vector/text fallbacks. */
export const NETWORK_LOGOS: Record<'visa' | 'mastercard' | 'meeza' | 'amex', string> = {
  visa: '',
  mastercard: '',
  meeza: '',
  amex: '',
};

export const WALLET_LOGOS: { match: RegExp; uri: string }[] = [];
