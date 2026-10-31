import {PublicKey} from '@solana/web3.js';
import {BorshEventCoder} from '@coral-xyz/anchor';
import {DynamicBondingCurveIdl,DYNAMIC_BONDING_CURVE_PROGRAM_ID} from '@meteora-ag/dynamic-bonding-curve-sdk';
import {CpAmmIdl,CP_AMM_PROGRAM_ID} from '@meteora-ag/cp-amm-sdk';
import bs58 from 'bs58';
const eventPrefix=Buffer.from('e445a52e51cb9a1d','hex');
const adapters=[{idl:DynamicBondingCurveIdl,program:DYNAMIC_BONDING_CURVE_PROGRAM_ID,venue:'curve'},{idl:CpAmmIdl,program:CP_AMM_PROGRAM_ID,venue:'pool'}].map(a=>({...a,coder:new BorshEventCoder(a.idl),authority:PublicKey.findProgramAddressSync([Buffer.from('__event_authority')],a.program)[0].toBase58()}));

export function decodeBabaTrades(tx,{pool,multiplier='1',signature,venue='curve',transactionOrder=0}){
 if(!tx?.meta||tx.meta.err||!tx.blockTime)return [];
 const a=adapters.find(a=>a.venue===venue),program=a.program.toBase58(),keys=tx.transaction.message.getAccountKeys({accountKeysFromLookups:tx.meta.loadedAddresses});
 const instructions=[...(tx.transaction.message.compiledInstructions||[]),...(tx.meta.innerInstructions||[]).flatMap(x=>x.instructions)];
 const swaps=[],events=[];
 for(const ix of instructions){
  if(keys.get(ix.programIdIndex)?.toBase58()!==program)continue;
  const data=typeof ix.data==='string'?Buffer.from(bs58.decode(ix.data)):Buffer.from(ix.data),accounts=ix.accountKeyIndexes||ix.accounts;
  const spec=a.idl.instructions.find(x=>x.name.startsWith('swap')&&data.subarray(0,8).equals(Buffer.from(x.discriminator)));
  if(spec&&keys.get(accounts[spec.accounts.findIndex(x=>x.name==='pool')])?.toBase58()===pool)swaps.push(keys.get(accounts[spec.accounts.findIndex(x=>x.name==='payer')])?.toBase58());
  if(data.subarray(0,8).equals(eventPrefix)&&keys.get(accounts[0])?.toBase58()===a.authority)events.push(data.subarray(8).toString('base64'));
 }
 if(!events.length){const stack=[];for(const line of tx.meta.logMessages||[]){const invoke=line.match(/^Program (\w+) invoke \[\d+\]/);if(invoke)stack.push(invoke[1]);else if(/^Program \w+ (success|failed:)/.test(line))stack.pop();else if(stack.at(-1)===program&&line.startsWith('Program data: '))events.push(line.slice(14))}}
 const trades=[];let i=0;
 for(const encoded of events){let e;try{e=a.coder.decode(encoded)}catch{continue}if(!e||!/^EvtSwap/.test(e.name)||e.data.pool?.toBase58()!==pool)continue;
  const d=e.data,r=d.swap_result||{},wallet=swaps[i++];if(!wallet)continue;
  const input=d.included_transfer_fee_amount_in??r.included_fee_input_amount??r.actual_input_amount;
  const output=d.excluded_transfer_fee_amount_out??r.output_amount;if(!input||!output||input.isZero()||output.isZero())continue;
  const buy=d.trade_direction===1,tokenRaw=(buy?output:input).toString(),quoteRaw=(buy?input:output).toString(),tokenAmount=Number(tokenRaw)/1e6,quoteAmount=Number(quoteRaw)/1e6*Number(multiplier);
  trades.push({id:signature+':'+i,signature,slot:tx.slot,time:tx.blockTime,transactionOrder,eventIndex:i,wallet,side:buy?'buy':'sell',tokenRaw,quoteRaw,tokenAmount,quoteAmount,solAmount:quoteAmount,price:quoteAmount/tokenAmount,venue});
 }
 return trades;
}

export function babaMarketService(pump,baba){
 const cache=new Map(),inflight=new Map();
 async function load(mint,metadata,{before,venue:requested}={}){
  const key=[mint,before||'',requested||''].join(':');if(cache.has(key)&&Date.now()-cache.get(key).at<15000)return cache.get(key).data;if(inflight.has(key))return inflight.get(key);
  if(inflight.size>=4)throw Object.assign(new Error('Market data busy'),{status:503});
  const work=(async()=>{
   const {virtualPool,config,ready,...info}=await baba.inspect(mint,metadata),venue=info.migrated&&requested!=='curve'?'pool':'curve',account=venue==='pool'?info.graduatedPool:info.pool;
   const signatures=await pump.connection.getSignaturesForAddress(new PublicKey(account),{limit:25,...(before?{before}:{})},'confirmed');let missing=0,pos=0;const trades=[];
   await Promise.all(Array.from({length:3},async()=>{while(pos<signatures.length){const transactionOrder=pos,s=signatures[pos++];if(s.err)continue;try{const tx=await pump.connection.getTransaction(s.signature,{commitment:'confirmed',maxSupportedTransactionVersion:0});if(!tx){missing++;continue}trades.push(...decodeBabaTrades(tx,{pool:account,multiplier:info.quoteMultiplier,signature:s.signature,venue,transactionOrder}))}catch{missing++}}}));
   trades.sort((a,b)=>a.transactionOrder-b.transactionOrder||b.eventIndex-a.eventIndex);
   const data={info,trades,supported:true,venue,account,priceUnit:info.quoteSymbol,nextCursor:signatures.length===25?signatures.at(-1).signature:null,missingTransactions:missing,partial:missing>0,updatedAt:new Date().toISOString(),refreshSeconds:15};
   cache.set(key,{at:Date.now(),data});while(cache.size>100)cache.delete(cache.keys().next().value);return data;
  })().finally(()=>inflight.delete(key));inflight.set(key,work);return work;
 }
 return {load};
}
