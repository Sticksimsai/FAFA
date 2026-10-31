import {PublicKey} from '@solana/web3.js';
const SOL='So11111111111111111111111111111111111111112';
export function selectUsdPrice(pairs,mint){
 const pair=pairs.filter(p=>p.chainId==='solana'&&p.baseToken?.address===mint&&Number(p.priceUsd)>0&&Number(p.liquidity?.usd)>0).sort((a,b)=>Number(b.liquidity.usd)-Number(a.liquidity.usd))[0];
 return pair?{usd:Number(pair.priceUsd),source:'DexScreener',pair:pair.pairAddress}:null;
}
export async function countHolders(rpc,mint,{limit=1000,maxPages=10}={}){
 const owners=new Set(),seen=new Set();
 for(let page=1;page<=maxPages;page++){
  const result=await rpc('getTokenAccounts',{mint,page,limit,options:{showZeroBalance:false}});
  if(!Array.isArray(result?.token_accounts))throw new Error('Holder indexer unavailable');
  let added=0;
  for(const a of result.token_accounts){if(!a.address||seen.has(a.address))continue;seen.add(a.address);added++;if(Number(a.amount)>0&&a.owner)owners.add(a.owner)}
  if(result.token_accounts.length<limit)return {count:owners.size,complete:true,source:'Helius DAS',definition:'Unique owners of nonzero token accounts, including protocol vault owners'};
  if(!added)break;
 }
 return {count:null,complete:false,reason:'Holder scan exceeded the page limit; no partial count displayed'};
}
export function tokenMetricsService(pump,{fetcher=fetch,rpcUrl=process.env.SOLANA_RPC_URL}={}){
 const prices=new Map(),holders=new Map(),pending=new Map();
 async function cached(map,key,ttl,work){if(map.has(key)&&Date.now()-map.get(key).at<ttl)return map.get(key).data;const id=(map===prices?'price:':'holders:')+key;if(pending.has(id))return pending.get(id);const promise=work().catch(()=>null).then(data=>{map.set(key,{at:Date.now(),data});while(map.size>200)map.delete(map.keys().next().value);return data}).finally(()=>pending.delete(id));pending.set(id,promise);return promise}
 async function price(mint){return cached(prices,mint,30000,async()=>{const r=await fetcher('https://api.dexscreener.com/tokens/v1/solana/'+mint,{signal:AbortSignal.timeout(8000)});if(!r.ok)throw new Error('USD price unavailable');const data=await r.json();if(!Array.isArray(data))throw new Error('Invalid USD response');return {...selectUsdPrice(data,mint),fetchedAt:new Date().toISOString()}})}
 async function holderCount(mint){return cached(holders,mint,120000,async()=>{
  if(!rpcUrl||!/(^|\.)helius(-rpc)?\.(com|xyz)$/.test(new URL(rpcUrl).hostname))return {count:null,complete:false,reason:'Helius DAS RPC required for holder counts'};
  const signal=AbortSignal.timeout(15000);
  const result=await countHolders(async(method,params)=>{const r=await fetcher(rpcUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal});if(!r.ok)throw new Error('Holder indexer unavailable');const json=await r.json();if(json.error)throw new Error('Holder indexer unavailable');return json.result},mint);
  return {...result,fetchedAt:new Date().toISOString()};
 })}
 async function load(mint,quoteMint=SOL){
  const [usd,holder,supply]=await Promise.all([price(quoteMint),holderCount(mint),pump.connection.getTokenSupply(new PublicKey(mint),'confirmed').then(r=>r.value).catch(()=>null)]);
  return {mint,quoteMint,quoteUsd:usd?.usd??null,priceSource:usd?.source??null,priceFetchedAt:usd?.fetchedAt??null,holders:holder||{count:null,complete:false,reason:'Holder indexer unavailable'},supply:supply?{amount:supply.amount,decimals:supply.decimals}:null,valuationBasis:'total-supply',updatedAt:new Date().toISOString()};
 }
 return {load};
}
