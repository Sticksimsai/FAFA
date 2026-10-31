export const RED_ENVELOPE_CYCLES=[3600,21600,86400];
export const RED_ENVELOPE_VERSION=1;
export function validateRedEnvelope(value){
 if(value==null)return null;
 if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['enabled','cycleSeconds'].includes(k)))throw new Error('Invalid red envelope configuration');
 if(value.enabled===false)return null;
 if(value.enabled!==true||!RED_ENVELOPE_CYCLES.includes(value.cycleSeconds))throw new Error('Choose a 1, 6 or 24 hour red envelope cycle');
 return {enabled:true,cycleSeconds:value.cycleSeconds};
}
export function redEnvelopeRules(value){const config=validateRedEnvelope(value);return config?{...config,version:RED_ENVELOPE_VERSION,feeShareBps:10000,selection:'one-wallet-one-entry',minimumTokenBalanceRaw:'1000000',creatorExcluded:true,randomness:'orao-vrf',snapshot:'keeper-attested',immutable:true}:null}
