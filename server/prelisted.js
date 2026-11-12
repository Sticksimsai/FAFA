// Tokens announced before they exist onchain. Until the mint appears, the site serves an
// empty market for them; once it does, the name, ticker and picture are read from the mint.
import {Connection,PublicKey} from '@solana/web3.js';
import {PUMP_BABA_MINT} from './featured-token.js';

const METAPLEX=new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
export const prelisted=new Map([['GMHhtMQQJRsowoj4iKVe1AgXiEkZQMHheeys4f4kpump',{
 mint:'GMHhtMQQJRsowoj4iKVe1AgXiEkZQMHheeys4f4kpump',name:'GMHh…kpump',symbol:'BABA 配对',
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
async function image(uri){
 if(!/^https:\/\//.test(uri))return null;
 const r=await fetch(uri,{signal:AbortSignal.timeout(6000),redirect:'follow'});if(!r.ok)return null;
 const json=await r.json();return typeof json.image==='string'&&/^https:\/\//.test(json.image)?{image:json.image,description:clean(json.description).slice(0,500)}:null;
}

export function prelistService(rpcUrl){
 const connection=new Connection(rpcUrl,'confirmed'),checked=new Map();
 // True once the mint exists. A miss is remembered for ten seconds, a hit for good.
 async function live(mint){
  const record=prelisted.get(mint);if(!record)return true;if(!record.metadata.pending)return true;
  if(Date.now()-(checked.get(mint)||0)<10000)return false;checked.set(mint,Date.now());
  let info;try{info=await connection.getParsedAccountInfo(new PublicKey(mint),'confirmed')}catch{return false}
  if(!info.value)return false;
  record.metadata.pending=false;record.created_at=new Date().toISOString();
  describe(mint,record,info.value).catch(()=>{});
  return true;
 }
 async function describe(mint,record,account){
  let meta=account.data?.parsed?.info?.extensions?.find(x=>x.extension==='tokenMetadata')?.state;
  if(!meta){const [pda]=PublicKey.findProgramAddressSync([Buffer.from('metadata'),METAPLEX.toBuffer(),new PublicKey(mint).toBuffer()],METAPLEX);const raw=await connection.getAccountInfo(pda,'confirmed');if(raw)meta=metaplex(raw.data)}
  if(!meta)return;
  if(clean(meta.name))record.name=clean(meta.name).slice(0,64);if(clean(meta.symbol))record.symbol=clean(meta.symbol).slice(0,24);
  record.uri=clean(meta.uri);record.description='';
  const extra=await image(record.uri).catch(()=>null);if(extra){record.image=extra.image;record.description=extra.description}
 }
 return {live};
}

export const pendingInfo=mint=>({mint,pending:true,quoteSymbol:'BABA',quoteDecimals:6,quoteMultiplier:1,solQuoted:false,decimals:6,supply:'0',complete:false,progress:0,quoteMint:PUMP_BABA_MINT,realTokenReserves:'0',realQuoteReserves:'0',creator:null,tokenProgram:null});
export const pendingSummary=()=>({updatedAt:Date.now(),pending:true,partial:false,marketAvailable:false,quoteSymbol:'BABA',marketCapUsd:null,priceUsd:null,changePercent:null,volumeUsd:null,holders:null,chartUnit:null,progress:null,graduated:false,trades:[],buys:0,sells:0});
