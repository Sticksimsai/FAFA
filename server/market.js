import {PUMP_BABA_MINT} from './featured-token.js';
import {createHash} from 'node:crypto';
import bs58 from 'bs58';
import {PublicKey} from '@solana/web3.js';
import {PUMP_SDK,PUMP_PROGRAM_ID,PUMP_AMM_PROGRAM_ID,bondingCurvePda,canonicalPumpPoolPda,canonicalPumpPoolPdaWithQuote,isSolLikeQuoteMint} from '@pump-fun/pump-sdk';
const BC=PUMP_PROGRAM_ID.toBase58(),AMM=PUMP_AMM_PROGRAM_ID.toBase58();
const discriminator=name=>createHash('sha256').update('event:'+name).digest().subarray(0,8);
const kinds=[{program:BC,disc:discriminator('TradeEvent'),decode:b=>PUMP_SDK.decodeTradeEventBc(b),kind:'curve'},{program:AMM,disc:discriminator('BuyEvent'),decode:b=>PUMP_SDK.decodeBuyEventAmm(b),kind:'buy'},{program:AMM,disc:discriminator('SellEvent'),decode:b=>PUMP_SDK.decodeSellEventAmm(b),kind:'sell'}];
const CPI=Buffer.from('e445a52e51cb9a1d','hex');
export function normalizeTrade(event,kind,{mint,pool,decimals,signature,slot,index,transactionOrder=0,quoteMint,quoteDecimals=9,quoteMultiplier=1}){
 if(kind==='curve'&&(!event.mint.equals(new PublicKey(mint))||!(quoteMint===PUMP_BABA_MINT?event.quoteMint?.toBase58()===quoteMint:isSolLikeQuoteMint(event.quoteMint))))return null;
 if(kind!=='curve'&&!event.pool.equals(new PublicKey(pool)))return null;
 const buy=kind==='curve'?event.isBuy:kind==='buy';
 const tokenRaw=kind==='curve'?event.tokenAmount:buy?event.baseAmountOut:event.baseAmountIn;
 const quoteRaw=kind==='curve'?(quoteMint===PUMP_BABA_MINT?event.quoteAmount:event.quoteAmount?.gtn(0)?event.quoteAmount:event.solAmount):buy?event.quoteAmountIn:event.quoteAmountOut;
 if(!tokenRaw?.gtn(0)||!quoteRaw?.gtn(0))return null;
 const tokenAmount=Number(tokenRaw.toString())/10**decimals,solAmount=Number(quoteRaw.toString())/10**quoteDecimals*quoteMultiplier,price=solAmount/tokenAmount;
 const time=Number(event.timestamp.toString());if(!Number.isFinite(price)||price<=0||!Number.isSafeInteger(time)||time<=0)return null;
 return {id:`${signature}:${index}`,signature,slot,transactionOrder,eventIndex:index,time,side:buy?'buy':'sell',wallet:event.user.toBase58(),tokenRaw:tokenRaw.toString(),quoteRaw:quoteRaw.toString(),tokenAmount,solAmount,price,venue:kind==='curve'?'curve':'pool'};
}
export function decodeTrades(tx,context){
 if(!tx||!tx.meta||tx.meta.err)return {trades:[],decodeErrors:0};
 const message=tx.transaction.message;const keys=message.getAccountKeys({accountKeysFromLookups:tx.meta.loadedAddresses});
 const cpi=[];for(const group of tx.meta.innerInstructions||[])for(const ix of group.instructions){const program=keys.get(ix.programIdIndex)?.toBase58();if(program!==BC&&program!==AMM)continue;const data=typeof ix.data==='string'?Buffer.from(bs58.decode(ix.data)):Buffer.from(ix.data);if(data.subarray(0,8).equals(CPI))cpi.push({program,data:data.subarray(8)})}
 const logs=[],stack=[];for(const line of tx.meta.logMessages||[]){const invoke=line.match(/^Program (\w+) invoke \[\d+\]/);if(invoke){stack.push(invoke[1]);continue}if(/^Program \w+ (success|failed:)/.test(line)){stack.pop();continue}if(line.startsWith('Program data: ')&&[BC,AMM].includes(stack.at(-1)))logs.push({program:stack.at(-1),data:Buffer.from(line.slice(14),'base64')})}
 // emit_cpi can also appear in logs; prefer inner instructions per program, retaining repeated trades.
 const candidates=[...cpi,...logs.filter(l=>!cpi.some(c=>c.program===l.program))];let decodeErrors=0;const trades=[];
 candidates.forEach(({program,data},index)=>{const spec=kinds.find(k=>k.program===program&&data.subarray(0,8).equals(k.disc));if(!spec)return;try{const trade=normalizeTrade(spec.decode(data.subarray(8)),spec.kind,{...context,slot:tx.slot,index});if(trade)trades.push(trade)}catch{decodeErrors++}});
 return {trades,decodeErrors};
}
const put=(map,key,value,limit)=>{map.set(key,value);while(map.size>limit)map.delete(map.keys().next().value)};
export function marketService(pump){
 const pages=new Map(),transactions=new Map(),states=new Map(),inflight=new Map();let running=0;
 async function state(mint){const old=states.get(mint);if(old&&Date.now()-old.at<15000)return old.value;const value=await pump.inspect(mint);put(states,mint,{at:Date.now(),value},100);return value}
 async function load(mint,{before,venue}={}){const key=[mint,before||'',venue||'auto'].join(':');const cached=pages.get(key);if(cached&&Date.now()-cached.at<15000)return {...cached.value,cached:true};if(inflight.has(key))return inflight.get(key);if(running>=6)throw Object.assign(new Error('Market data busy; retry shortly'),{status:503});
 const work=(async()=>{running++;try{const info=await state(mint);if(!info.solQuoted&&info.quoteMint!==PUMP_BABA_MINT)return {info,trades:[],supported:false,reason:'This Pump quote asset is not supported',updatedAt:new Date().toISOString()};const pool=info.solQuoted?canonicalPumpPoolPda(new PublicKey(mint)):canonicalPumpPoolPdaWithQuote(new PublicKey(mint),new PublicKey(info.quoteMint));const selected=venue||(info.complete?'pool':'curve');const account=selected==='curve'?bondingCurvePda(new PublicKey(mint)):pool;const signatures=await pump.connection.getSignaturesForAddress(account,{limit:25,...(before?{before}:{})},'confirmed');const successful=signatures.filter(s=>!s.err);let missing=0,decodeErrors=0;const trades=[];let position=0;await Promise.all(Array.from({length:Math.min(3,successful.length)},async()=>{while(position<successful.length){const transactionOrder=position;const s=successful[position++];let tx=transactions.get(s.signature);if(!tx){try{tx=await pump.connection.getTransaction(s.signature,{commitment:'confirmed',maxSupportedTransactionVersion:0});if(tx)put(transactions,s.signature,tx,500)}catch{missing++;continue}}if(!tx){missing++;continue}const result=decodeTrades(tx,{mint,pool:pool.toBase58(),quoteMint:info.quoteMint,quoteDecimals:info.quoteDecimals??9,quoteMultiplier:info.quoteMultiplier??1,decimals:info.decimals,signature:s.signature,transactionOrder});trades.push(...result.trades.filter(t=>t.venue===selected));decodeErrors+=result.decodeErrors}}));trades.sort((a,b)=>a.transactionOrder-b.transactionOrder||b.eventIndex-a.eventIndex);const value={info,trades,supported:true,venue:selected,account:account.toBase58(),nextCursor:signatures.length===25?signatures.at(-1).signature:null,scannedTransactions:signatures.length,missingTransactions:missing,decodeErrors,partial:missing>0||decodeErrors>0,updatedAt:new Date().toISOString(),refreshSeconds:15,priceUnit:info.quoteSymbol||'SOL',coverage:'Loaded confirmed trades only; not full market history',cached:false};put(pages,key,{at:Date.now(),value},150);return value}finally{running--;inflight.delete(key)}})();inflight.set(key,work);return work}
 return {load};
}
