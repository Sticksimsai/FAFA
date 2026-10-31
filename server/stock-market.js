import {createHash} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import bs58 from 'bs58';
import {BABAX,STOCK_PROGRAM,rawToUi} from './stocks.js';
const disc=createHash('sha256').update('event:SwapEvent').digest().subarray(0,8);
const swapDiscs=['swap_base_input','swap_base_output'].map(n=>createHash('sha256').update('global:'+n).digest().subarray(0,8));
export function decodeStockTrades(tx,{mint,pool,decimals,quoteMultiplier,signature,transactionOrder=0}){
 if(!tx?.meta||tx.meta.err||!tx.blockTime)return [];
 const keys=tx.transaction.message.getAccountKeys({accountKeysFromLookups:tx.meta.loadedAddresses});
 const instructions=[...(tx.transaction.message.compiledInstructions||[]),...(tx.meta.innerInstructions||[]).flatMap(g=>g.instructions)];
 const swaps=instructions.filter(ix=>{if(keys.get(ix.programIdIndex)?.toBase58()!==STOCK_PROGRAM)return false;const data=typeof ix.data==='string'?Buffer.from(bs58.decode(ix.data)):Buffer.from(ix.data);return swapDiscs.some(d=>data.subarray(0,8).equals(d))&&keys.get((ix.accountKeyIndexes||ix.accounts)[3])?.toBase58()===pool});
 const stack=[],trades=[];let i=0;
 for(const line of tx.meta.logMessages||[]){const invoke=line.match(/^Program (\w+) invoke \[\d+\]/);if(invoke){stack.push(invoke[1]);continue}if(/^Program \w+ (success|failed:)/.test(line)){stack.pop();continue}if(stack.at(-1)!==STOCK_PROGRAM||!line.startsWith('Program data: '))continue;
  const b=Buffer.from(line.slice(14),'base64');if(b.length<153||!b.subarray(0,8).equals(disc)||new PublicKey(b.subarray(8,40)).toBase58()!==pool)continue;
  const input=new PublicKey(b.subarray(89,121)).toBase58(),output=new PublicKey(b.subarray(121,153)).toBase58();const buy=input===BABAX&&output===mint;if(!buy&&!(input===mint&&output===BABAX))continue;
  const ix=swaps[i++];if(!ix)continue;const accounts=ix.accountKeyIndexes||ix.accounts;const wallet=keys.get(accounts[0])?.toBase58();if(!wallet)continue;
  const inputAmount=b.readBigUInt64LE(56),outputAmount=b.readBigUInt64LE(64);const tokenRaw=buy?outputAmount:inputAmount,quoteRaw=buy?inputAmount:outputAmount;if(!tokenRaw||!quoteRaw)continue;
  const tokenAmount=rawToUi(tokenRaw,decimals),quoteAmount=rawToUi(quoteRaw,8,quoteMultiplier);trades.push({id:signature+':'+i,signature,slot:tx.slot,time:tx.blockTime,transactionOrder,eventIndex:i,wallet,side:buy?'buy':'sell',tokenRaw:tokenRaw.toString(),quoteRaw:quoteRaw.toString(),tokenAmount,solAmount:quoteAmount,quoteAmount,price:quoteAmount/tokenAmount,venue:'pool'});
 }
 return trades;
}
export function stockMarketService(pump,stocks){
 const cache=new Map(),inflight=new Map();
 async function load(mint,{before}={}){const key=mint+':'+(before||'');const old=cache.get(key);if(old&&Date.now()-old.at<15000)return old.data;if(inflight.has(key))return inflight.get(key);if(inflight.size>=4)throw Object.assign(new Error('Market data busy'),{status:503});
 const work=(async()=>{try{const {keys,poolState,ready,...info}=await stocks.inspect(mint);const signatures=await pump.connection.getSignaturesForAddress(new PublicKey(info.pool),{limit:25,...(before?{before}:{})},'confirmed');let missing=0,pos=0;const trades=[];await Promise.all(Array.from({length:3},async()=>{while(pos<signatures.length){const transactionOrder=pos,s=signatures[pos++];if(s.err)continue;try{const tx=await pump.connection.getTransaction(s.signature,{commitment:'confirmed',maxSupportedTransactionVersion:0});if(!tx){missing++;continue}trades.push(...decodeStockTrades(tx,{...info,signature:s.signature,transactionOrder}))}catch{missing++}}}));trades.sort((a,b)=>a.transactionOrder-b.transactionOrder||b.eventIndex-a.eventIndex);const data={info,trades,supported:true,venue:'pool',account:info.pool,priceUnit:'BABAx',nextCursor:signatures.length===25?signatures.at(-1).signature:null,scannedTransactions:signatures.length,missingTransactions:missing,partial:missing>0,updatedAt:new Date().toISOString(),refreshSeconds:15,coverage:'Loaded confirmed trades only; BABAx values use the current issuer multiplier'};cache.set(key,{at:Date.now(),data});while(cache.size>100)cache.delete(cache.keys().next().value);return data}finally{inflight.delete(key)}})();inflight.set(key,work);return work;
 }
 return {load};
}
