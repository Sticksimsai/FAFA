// Compact, bounded summaries for visible launch cards; unknown values remain null.
// Bonding-curve stage. Unknown stays null; it is never guessed.
function stage(info){if(!info)return {progress:null,graduated:null};const graduated=info.engine==='raydium-cpmm'?true:info.engine==='meteora-dbc'?!!info.migrated:!!info.complete;const raw=graduated?1:Number(info.progress);return {progress:Number.isFinite(raw)&&info.progress!=null?Math.min(1,Math.max(0,raw)):graduated?1:null,graduated}}
export function summarizeCardMarket(market,valuation){
 const trades=(market?.trades||[]).filter(x=>Number.isFinite(x.price)&&x.price>0&&Number.isFinite(x.time)).slice(0,100);
 const latest=trades[0],first=trades.at(-1),rawSupply=valuation?.supply;
 const supply=rawSupply?Number(rawSupply.amount)/10**rawSupply.decimals:null;
 const quoteUsd=Number(valuation?.quoteUsd)>0?Number(valuation.quoteUsd):null;
 const factor=quoteUsd&&supply>0?quoteUsd*supply:null;
 const volume=trades.reduce((sum,x)=>sum+(Number.isFinite(x.quoteAmount??x.solAmount)?(x.quoteAmount??x.solAmount):0),0);
 return {updatedAt:market?.updatedAt||valuation?.updatedAt||null,partial:!!market?.partial,marketAvailable:!!market,quoteSymbol:market?.info?.quoteSymbol||market?.priceUnit||null,marketCapUsd:latest&&factor?latest.price*factor:null,priceUsd:latest&&quoteUsd?latest.price*quoteUsd:null,changePercent:trades.length>1?(latest.price/first.price-1)*100:null,volumeUsd:trades.length&&quoteUsd?volume*quoteUsd:null,holders:valuation?.holders?.complete?valuation.holders.count:null,holderDefinition:'Unique nonzero-balance owners, including protocol vaults',chartUnit:factor?'USD MCAP':market?.info?.quoteSymbol||market?.priceUnit||'QUOTE',trades:trades.map(x=>({time:x.time,price:x.price*(factor||1),solAmount:x.quoteAmount??x.solAmount??0,side:x.side})),buys:trades.filter(x=>x.side==='buy').length,sells:trades.filter(x=>x.side==='sell').length,progress:stage(market?.info).progress,graduated:stage(market?.info).graduated};
}
export function cardMarketService({loadMarket,loadMetrics}){
 const cache=new Map(),pending=new Map();
 return async(mint,record)=>{
  const found=cache.get(mint);if(found&&Date.now()-found.at<60000)return found.data;
  if(pending.has(mint))return pending.get(mint);
  if(pending.size>=4)throw Object.assign(new Error('Market previews busy. Retry shortly.'),{status:503});
  const work=Promise.allSettled([loadMarket(mint,record),loadMetrics(mint,record)]).then(([m,v])=>{const data=summarizeCardMarket(m.status==='fulfilled'?m.value:null,v.status==='fulfilled'?v.value:null);cache.set(mint,{at:Date.now(),data});while(cache.size>200)cache.delete(cache.keys().next().value);return data}).finally(()=>pending.delete(mint));pending.set(mint,work);return work;
 };
}
