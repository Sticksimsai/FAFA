// Pump create_v2 documents a 13-character symbol limit. Count Unicode code points, not UTF-8 bytes.
export function validChineseTicker(value){return typeof value==='string'&&/^\p{Script=Han}{1,13}$/u.test(value)}
export function canonicalTokenUrl(origin,mint){return new URL('/token/'+mint,origin).href}
export function buildTokenMetadata(data,origin,mint){const website=canonicalTokenUrl(origin,mint);return {name:data.name,symbol:data.symbol,description:data.description,image:data.image,showName:true,createdOn:new URL(origin).origin,website,external_url:website,...(data.twitter?{twitter:data.twitter}:{}),...(data.telegram?{telegram:data.telegram}:{})}}
