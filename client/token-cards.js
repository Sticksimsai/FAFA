import {CandleChart} from './chart.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short=m=>m.slice(0,5)+'…'+m.slice(-5),cache=new Map();
let context,observer,queue=[],running=0,dialog,chart,selected,entered=false;
const t=(cn,en)=>context?.en?en:cn;
const money=v=>Number.isFinite(v)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:2}).format(v):'—';
const count=v=>v==null?'—':new Intl.NumberFormat(context?.en?'en':'zh-CN',{notation:'compact',maximumFractionDigits:1}).format(v);
const still=()=>document.documentElement.classList.contains('motion-off')||matchMedia('(prefers-reduced-motion: reduce)').matches;

// Curve stage shown on cards and the token page. Unknown stays a dash.
export function curveLabel(progress,graduated,en){return graduated?(en?'Graduated':'已毕业'):Number.isFinite(progress)?(progress*100).toFixed(progress>=.995?0:1)+'%':'—'}
function curveBar(stats,en){const p=stats?.graduated?1:Number.isFinite(stats?.progress)?stats.progress:null;return `<div class="curve-bar${stats?.graduated?' is-done':''}" data-curve><span>${en?'Bonding curve':'毕业进度'}</span><b data-progress>${curveLabel(stats?.progress,stats?.graduated,en)}</b><i><em style="width:${p==null?0:(p*100).toFixed(1)}%"></em></i></div>`}
const age=(at,en)=>{const s=Math.max(0,(Date.now()-new Date(at))/1000);return s<60?Math.floor(s)+(en?'s':'秒'):s<3600?Math.floor(s/60)+(en?'m':'分'):s<86400?Math.floor(s/3600)+(en?'h':'时'):Math.floor(s/86400)+(en?'d':'天')};
export function tokenCard(x,saved,en,index=0){
 const txt=(cn,eng)=>en?eng:cn,venue=x.metadata?.engine==='meteora-dbc'?'Meteora':x.metadata?.engine==='raydium-cpmm'?'Raydium':'Pump.fun';
 return `<article class="card market-card is-loading" data-market-card="${esc(x.mint)}"><span class="mini-chart" data-spark aria-hidden="true"></span><div class="market-card-head"><a class="market-identity" href="/token/${esc(x.mint)}"><span class="market-avatar">${x.image?`<img src="${esc(x.image)}" loading="lazy" alt="">`:'富'}</span><span><strong>${esc(x.name)}</strong><small><b>${esc(x.symbol)}</b><span>${venue}</span>${x.created_at?`<time data-age="${esc(x.created_at)}">${age(x.created_at,en)}</time>`:''}</small></span></a><button class="save ${saved?'saved':''}" data-save="${esc(x.mint)}" aria-label="${txt('加入自选','Watchlist')}" aria-pressed="${saved}">${saved?'★':'☆'}</button></div><div class="market-figures"><small>${txt('市值','MC')}</small><strong data-cap>—</strong><span class="preview-change" data-change></span></div><div class="market-card-metrics"><span>${txt('持币','Holders')}<strong data-holders>—</strong></span><span>${txt('成交','Vol')}<strong data-volume>—</strong></span><span>${txt('进度','Curve')}<strong data-progress>${curveLabel(x.stats?.progress,x.stats?.graduated,en)}</strong></span></div><div class="flow is-empty" data-flow title="${txt('买入 / 卖出笔数','Buys / sells')}"><b data-buys>—</b><i><em></em></i><b data-sells>—</b></div><div class="market-card-footer"><button class="copy-ca" data-copy-ca="${esc(x.mint)}" title="${esc(x.mint)}" aria-label="${txt('复制合约地址','Copy contract address')}"><code>${esc(short(x.mint))}</code><span aria-hidden="true" data-copy-mark>⧉</span></button><button class="card-chart" data-chart="${esc(x.mint)}">${txt('图表','Chart')}</button><a href="/token/${esc(x.mint)}">${txt('交易','Trade')}</a></div>${curveBar(x.stats,en)}</article>`;
}

function spark(data){
 const points=[...data.trades].reverse();if(points.length<2)return '';
 const lo=Math.min(...points.map(x=>x.price)),hi=Math.max(...points.map(x=>x.price)),span=hi-lo||hi*.1||1,start=points[0].time,end=points.at(-1).time;
 const xy=points.map((p,i)=>[(end>start?(p.time-start)/(end-start):i/(points.length-1))*392,76-(p.price-lo)/span*68]);
 const path=xy.map(([x,y],i)=>(i?'L':'M')+x.toFixed(1)+','+y.toFixed(1)).join(' '),[lx,ly]=xy.at(-1);
 return `<svg viewBox="0 0 400 84" preserveAspectRatio="none"><path class="spark-line" d="${path}" vector-effect="non-scaling-stroke"/></svg><i class="spark-dot" style="left:${(lx/4).toFixed(2)}%;top:${(ly/.84).toFixed(2)}%"></i>`;
}

// Move a figure from its last value to the new one, flashing green or red.
function setFigure(node,value){
 const from=node._value;node._value=value;
 if(!Number.isFinite(value)){node.textContent='—';return}
 if(!Number.isFinite(from)||from===value||still()){node.textContent=money(value);return}
 node.classList.remove('tick-up','tick-down');void node.offsetWidth;node.classList.add(value>from?'tick-up':'tick-down');
 const began=performance.now();
 const step=now=>{if(!node.isConnected||node._value!==value)return;const p=Math.min(1,(now-began)/500);node.textContent=money(from+(value-from)*(1-Math.pow(1-p,3)));if(p<1)requestAnimationFrame(step)};
 requestAnimationFrame(step);
}

function populate(node,data,fresh=false){
 node.classList.remove('is-loading');node.classList.toggle('is-fresh',fresh);
 const down=data.changePercent<0;node.classList.toggle('down',down);node.classList.toggle('up',data.changePercent>0);
 if(data.marketAvailable){const bar=node.querySelector('[data-curve]');bar.classList.toggle('is-done',!!data.graduated);bar.querySelector('em').style.width=(data.graduated?100:Number.isFinite(data.progress)?data.progress*100:0).toFixed(1)+'%';node.querySelector('.market-card-metrics [data-progress]').textContent=curveLabel(data.progress,data.graduated,context?.en);const item=context?.items?.find(x=>x.mint===node.dataset.marketCard);if(item)item.stats={...item.stats,progress:data.progress,graduated:data.graduated,marketCapUsd:data.marketCapUsd,volumeUsd:data.volumeUsd,holders:data.holders}}
 setFigure(node.querySelector('[data-cap]'),data.marketCapUsd);
 const change=node.querySelector('[data-change]');change.textContent=data.changePercent==null?'':(down?'':'+')+data.changePercent.toFixed(2)+'%';change.classList.toggle('negative',down);change.classList.toggle('positive',data.changePercent>0);
 node.querySelector('[data-holders]').textContent=count(data.holders);node.querySelector('[data-volume]').textContent=money(data.volumeUsd);
 const flow=node.querySelector('[data-flow]'),total=data.marketAvailable?data.buys+data.sells:0;flow.classList.toggle('is-empty',!total);flow.querySelector('[data-buys]').textContent=total?data.buys:'—';flow.querySelector('[data-sells]').textContent=total?data.sells:'—';flow.querySelector('em').style.width=(total?data.buys/total*100:50).toFixed(1)+'%';
 node.querySelector('[data-spark]').innerHTML=spark(data);
}

async function load(mint,force=false){const hit=cache.get(mint);if(!force&&hit&&Date.now()-hit.at<60000)return hit.data;const r=await fetch('/api/token/'+encodeURIComponent(mint)+'/summary',{signal:AbortSignal.timeout(25000)});if(!r.ok)throw new Error('Market unavailable');const data=await r.json();cache.set(mint,{at:Date.now(),data});while(cache.size>150)cache.delete(cache.keys().next().value);return data;}
async function drain(){while(running<2&&queue.length){const node=queue.shift();if(!node.isConnected)continue;running++;load(node.dataset.marketCard).then(d=>{if(node.isConnected)populate(node,d,true)}).catch(()=>{if(node.isConnected)node.classList.remove('is-loading')}).finally(()=>{running--;drain()});}}

// Cards on screen re-read their market every 25 seconds, a few at a time; ages tick in between.
let seen=new Set();
const watcher=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{for(const e of entries)e.isIntersecting?seen.add(e.target):seen.delete(e.target)});
if(typeof document!=='undefined'){setInterval(()=>{if(document.hidden)return;[...seen].filter(n=>n.isConnected&&!n.classList.contains('is-loading')).slice(0,12).forEach((node,i)=>setTimeout(()=>load(node.dataset.marketCard,true).then(d=>{if(node.isConnected)populate(node,d)}).catch(()=>{}),i*400))},25000);setInterval(()=>document.querySelectorAll('[data-age]').forEach(n=>n.textContent=age(n.dataset.age,context?.en)),1000)}

export function mountTokenCards(ctx){
 context=ctx;observer?.disconnect();queue=[];
 observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){observer.unobserve(e.target);queue.push(e.target)}drain()},{rootMargin:'80px'});
 const nodes=document.querySelectorAll('[data-market-card]');
 seen=new Set();watcher?.disconnect();nodes.forEach(node=>{watcher?.observe(node);const hit=cache.get(node.dataset.marketCard);if(hit&&Date.now()-hit.at<60000)populate(node,hit.data);else observer.observe(node)});
 // The grid re-renders on every keystroke and language switch; only the first arrival is choreographed.
 if(!entered&&nodes.length){entered=true;const grid=nodes[0].parentElement;grid.classList.add('is-entering');setTimeout(()=>grid.classList.remove('is-entering'),1600)}
}

async function overlay(mint){selected=mint;if(!dialog){dialog=document.createElement('dialog');dialog.className='market-chart-dialog';document.body.append(dialog);dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});}const item=context.items.find(x=>x.mint===mint);dialog.innerHTML=`<header><div><small>${t('行情预览','MARKET PREVIEW')}</small><h2>${esc(item?.name||short(mint))} <span>${esc(item?.symbol||'')}</span></h2></div><button data-close-chart aria-label="${t('关闭','Close')}">×</button></header><div class="overlay-metrics" data-overlay-metrics>${t('正在读取行情…','Loading market…')}</div><div class="overlay-chart"><canvas aria-label="Token chart"></canvas><p class="overlay-tooltip" hidden></p><span data-overlay-empty></span></div><footer><small>${t('已加载成交 · 市值按总供应量及当前报价汇率换算','Loaded trades · Market cap uses total supply and current quote FX')}</small><a href="/token/${esc(mint)}">${t('打开完整交易终端','Open full terminal')} ↗</a></footer>`;chart?.resize.disconnect();chart=new CandleChart(dialog.querySelector('canvas'),dialog.querySelector('.overlay-tooltip'));dialog.querySelector('[data-close-chart]').onclick=()=>dialog.close();if(!dialog.open)dialog.showModal();try{const d=await load(mint);if(selected!==mint||!dialog.open)return;const pair=d.quoteSymbol||item?.metadata?.quoteAsset||'—';dialog.querySelector('[data-overlay-metrics]').innerHTML=`<span>${t('市值','Market cap')}<strong>${money(d.marketCapUsd)}</strong></span><span>${t('持币地址','Holders')}<strong>${count(d.holders)}</strong></span><span>${t('配对','Quote pair')}<strong>${esc(pair)}</strong></span><button class="copy-ca" data-copy-ca="${esc(mint)}" title="${esc(mint)}">CA ${esc(short(mint))} <span aria-hidden="true" data-copy-mark>⧉</span></button>`;chart.quoteUnit=d.chartUnit;chart.volumeUnit=pair;chart.set(d.trades,60);dialog.querySelector('[data-overlay-empty]').textContent=d.trades.length?'':t('暂无可用成交图表','No available trades to chart');}catch{dialog.querySelector('[data-overlay-metrics]').textContent=t('行情读取失败，请关闭后重试。','Market unavailable. Close and retry.');}}

function confirmCopy(button){const mark=button.querySelector('[data-copy-mark]');if(!mark)return;clearTimeout(button._copied);mark.textContent='✓';button.classList.add('copied');button._copied=setTimeout(()=>{mark.textContent='⧉';button.classList.remove('copied')},1400)}

document.addEventListener('click',async e=>{
 const copy=e.target.closest('[data-copy-ca]');
 if(copy){try{await navigator.clipboard.writeText(copy.dataset.copyCa);confirmCopy(copy);context?.toast(t('合约地址已复制','Contract address copied'));}catch{context?.toast(t('无法复制，请在交易终端查看完整地址','Copy unavailable. Open the terminal for the full address.'));}return;}
 const button=e.target.closest('[data-chart]');if(button)overlay(button.dataset.chart);
});

