// Imported, onchain-existing FAFA mint. This is not a receipt for a site-created launch.
export const FAFA_MINT='CcSRXUReR3VVG92C4rE8FqsLomzwmH6Dn1WhTGebpump';
export const PUMP_BABA_MINT='BABANGA4JE7Kkam4nTrALAwAVgsNJUuFJnnkF7S16BZp';
export const featuredToken={
 mint:FAFA_MINT,name:'FĀFĀ',symbol:'发发',
 description:'华语交易者，在 Solana 有家了。',image:'/favicon.png',
 wallet:'DKaU5iV6SC353mSWTTDvjMJNdpSiVcL4outG27NbauMG',
 uri:'https://ipfs.io/ipfs/bafkreigufmv2dn4hkp34gdd7ycgen6aahjkp5q2lq4vpzcoulennul6ab4',
 created_at:null,signature:null,
 metadata:{engine:'pump.fun',quoteMint:PUMP_BABA_MINT,quoteAsset:'BABA',imported:true,featured:true}
};
export function featuredRecord(mint){return mint===FAFA_MINT?featuredToken:null}
export function withFeaturedToken(rows){return [rows.find(x=>x.mint===FAFA_MINT)||featuredToken,...rows.filter(x=>x.mint!==FAFA_MINT)]}
