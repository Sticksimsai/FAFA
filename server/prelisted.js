// Tokens announced before they exist onchain. Until the mint appears, the site serves an
// empty market for them; once it does, the name, ticker and picture are read from the mint.
import {Connection,PublicKey} from '@solana/web3.js';
import {PUMP_BABA_MINT} from './featured-token.js';

const METAPLEX=new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
export const prelisted=new Map([['GMHhtMQQJRsowoj4iKVe1AgXiEkZQMHheeys4f4kpump',{
 mint:'GMHhtMQQJRsowoj4iKVe1AgXiEkZQMHheeys4f4kpump',name:'TaoBao',symbol:'淘宝',
 description:'与 BABA 股票配对的 Pump.fun 代币。',image:'/favicon.png',
 wallet:'',uri:'',created_at:null,signature:null,
 metadata:{engine:'pump.fun',quoteMint:PUMP_BABA_MINT,quoteAsset:'BABA',imported:true,featured:true,prelisted:true,pending:true}
}]]);
export const prelistedRecord=mint=>prelisted.get(mint)||null;

const clean=s=>String(s||'').replace(/\0/g,'').trim();
function metaplex(data){ // key(1) update authority(32) mint(32) then three length-prefixed strings
 let o=65;const read=()=>{const n=data.readUInt32LE(o);o+=4;const s=data.subarray(o,o+n).toString('utf8');o+=n;return clean(s)};
 return {name:read(),symbol:read(),uri:read()};
}
const web=u=>{u=clean(u);return u.startsWith('ipfs://')?'https://ipfs.io/ipfs/'+u.slice(7).replace(/^ipfs\//,''):u};
// The token's own picture, fetched once and served from this site (pages only load images from here).
async function picture(uri){
 const meta=await fetch(web(uri),{signal:AbortSignal.timeout(8000),redirect:'follow'});if(!meta.ok)throw new Error('metadata '+meta.status);
 const json=await meta.json(),src=web(json.image);if(!/^https:\/\//.test(src))throw new Error('no image in metadata');
 const r=await fetch(src,{signal:AbortSignal.timeout(12000),redirect:'follow'});if(!r.ok)throw new Error('image '+r.status);
 const type=(r.headers.get('content-type')||'').split(';')[0].trim();if(!/^image\/(png|jpeg|gif|webp|avif)$/.test(type))throw new Error('image type '+type);
 const bytes=Buffer.from(await r.arrayBuffer());if(!bytes.length||bytes.length>4e6)throw new Error('image size '+bytes.length);
 return {bytes,type,description:clean(json.description).slice(0,500)};
}

export function prelistService(rpcUrl,{creator}={}){
 const connection=new Connection(rpcUrl,'confirmed'),checked=new Map(),pictures=new Map(),tried=new Map();
 // True once the mint exists. A miss is remembered for ten seconds, a hit for good.
 async function live(mint){
  const record=prelisted.get(mint);if(!record)return true;
  if(!record.metadata.pending){if(!record.described&&Date.now()-(tried.get(mint)||0)>30000)describe(mint,record);return true}
  if(Date.now()-(checked.get(mint)||0)<10000)return false;checked.set(mint,Date.now());
  let info;try{info=await connection.getAccountInfo(new PublicKey(mint),'confirmed')}catch{return false}
  if(!info)return false;
  record.metadata.pending=false;record.created_at=new Date().toISOString();
  describe(mint,record);
  return true;
 }
 // Name, ticker, picture and creator come from the token itself. Retried until all are read.
 async function describe(mint,record){
  tried.set(mint,Date.now());
  try{
   if(!record.wallet&&creator)record.wallet=await creator(mint).catch(e=>{console.error('prelisted creator',mint,e.message);return ''})||'';
   const account=(await connection.getParsedAccountInfo(new PublicKey(mint),'confirmed')).value;
   let meta=account?.data?.parsed?.info?.extensions?.find(x=>x.extension==='tokenMetadata')?.state;
   if(!meta){const [pda]=PublicKey.findProgramAddressSync([Buffer.from('metadata'),METAPLEX.toBuffer(),new PublicKey(mint).toBuffer()],METAPLEX);const raw=await connection.getAccountInfo(pda,'confirmed');if(raw)meta=metaplex(raw.data)}
   if(!meta)throw new Error('no token metadata found');
   if(clean(meta.name))record.name=clean(meta.name).slice(0,64);if(clean(meta.symbol))record.symbol=clean(meta.symbol).slice(0,24);
   record.uri=web(meta.uri);
   const pic=await picture(record.uri);pictures.set(mint,pic);record.image='/prelisted/'+mint+'/image';record.description=pic.description;
   record.described=!!record.wallet||!creator;
  }catch(e){console.error('prelisted describe',mint,e.message)}
 }
 return {live,picture:mint=>pictures.get(mint)||null};
}

export const pendingInfo=mint=>({mint,pending:true,quoteSymbol:'BABA',quoteDecimals:6,quoteMultiplier:1,solQuoted:false,decimals:6,supply:'0',complete:false,progress:0,quoteMint:PUMP_BABA_MINT,realTokenReserves:'0',realQuoteReserves:'0',creator:null,tokenProgram:null});
export const pendingSummary=()=>({updatedAt:Date.now(),pending:true,partial:false,marketAvailable:false,quoteSymbol:'BABA',marketCapUsd:null,priceUsd:null,changePercent:null,volumeUsd:null,holders:null,chartUnit:null,progress:null,graduated:false,trades:[],buys:0,sells:0});
