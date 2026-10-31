export const FAFA_QUOTE_MINT='CcSRXUReR3VVG92C4rE8FqsLomzwmH6Dn1WhTGebpump';
export const BABA_QUOTE_MINT='BABANGA4JE7Kkam4nTrALAwAVgsNJUuFJnnkF7S16BZp';
export const CURVE_QUOTE_ASSETS=['BABA','FAFA'];
export function curveQuoteAsset(metadata){if(metadata?.quoteMint===FAFA_QUOTE_MINT)return 'FAFA';if(metadata?.quoteMint===BABA_QUOTE_MINT)return 'BABA';throw new Error('Unsupported curve quote mint')}
