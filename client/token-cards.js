import {CandleChart} from './chart.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short=m=>m.slice(0,5)+'…'+m.slice(-5),cache=new Map();
let context,observer,queue=[],running=0,dialog,chart,selected,justSaved=null,entered=false;
const t=(cn,en)=>context?.en?en:cn;
const money=v=>Number.isFinite(v)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:2}).format(v):'—';
const count=v=>v==null?'—':new Intl.NumberFormat(context?.en?'en':'zh-CN',{notation:'compact',maximumFractionDigits:1}).format(v);
const still=()=>document.documentElement.classList.contains('motion-off')||matchMedia('(prefers-reduced-motion: reduce)').matches;

export function tokenCard(x,saved,en,index=0){
 const txt=(cn,eng)=>en?eng:cn,quote=x.metadata?.quoteAsset||(x.metadata?.engine==='meteora-dbc'?'BABA':x.metadata?.engine==='raydium-cpmm'?'BABAx':'SOL'),venue=x.metadata?.engine==='meteora-dbc'?'Meteora':x.metadata?.engine==='raydium-cpmm'?'Raydium':'Pump.fun';
 const featured=!!x.metadata?.featured,stamp=saved&&x.mint===justSaved;
 return `<article class="card market-card is-loading${featured?' is-featured':''}" data-market-card="${esc(x.mint)}" data-tilt style="--i:${Math.min(index,8)}"><div class="market-card-head"><a class="market-identity" href="/token/${esc(x.mint)}"><span class="market-avatar">${x.image?`<img src="${esc(x.image)}" loading="lazy" alt="">`:'富'}</span><span><strong>${esc(x.name)}</strong><small>${esc(x.symbol)}</small></span></a><button class="save ${saved?'saved':''}${stamp?' stamp':''}" data-save="${esc(x.mint)}" aria-label="${txt('加入自选','Watchlist')}" aria-pressed="${saved}">${saved?'★':'☆'}</button></div><div class="market-pair"><span class="pair-dot"></span><b>${esc(x.symbol||'TOKEN')} / <span data-pair-quote>${esc(quote)}</span></b><span>${venue}</span>${featured?'<em>BAOFU</em>':''}</div><button class="market-preview" data-chart="${esc(x.mint)}" aria-label="${txt('展开行情图表','Expand market chart')} ${esc(x.name)}"><span class="preview-values"><span><small>${txt('市值 · 美元','MARKET CAP · USD')}</small><strong data-cap>—</strong></span><span class="preview-change" data-change>—</span></span><span class="mini-chart" data-spark>${waiting(txt('行情加载中','Loading market'),true)}</span><span class="preview-foot"><span data-window>${txt('已加载成交窗口','Loaded trade window')}</span><span>↗ ${txt('展开图表','Expand chart')}</span></span></button><div class="market-card-metrics"><span><small>${txt('持币地址','Holders')}</small><strong data-holders title="${txt('非零余额独立地址，含协议金库','Unique nonzero-balance owners, including protocol vaults')}">—</strong></span><span><small>${txt('窗口成交额','Window volume')}</small><strong data-volume>—</strong></span><span><small>${txt('买入 / 卖出','Buys / Sells')}</small><strong data-count>—</strong></span></div><p class="market-description">${esc(x.description||txt('社区的新故事，从这里开始。','A new community story starts here.'))}</p><div class="market-card-footer"><button class="copy-ca" data-copy-ca="${esc(x.mint)}" title="${esc(x.mint)}" aria-label="${txt('复制合约地址','Copy contract address')}"><span>CA</span><code>${esc(short(x.mint))}</code><span aria-hidden="true" data-copy-mark>⧉</span></button><a href="/token/${esc(x.mint)}">${txt('交易终端','Trade')} ↗</a></div><span class="market-card-status" data-card-status></span></article>`;
}

// Placeholder shown while a chart is loading or has nothing to draw.
function waiting(label,busy=false){return `<span class="chart-wait${busy?' is-busy':''}"><svg viewBox="0 0 400 110" preserveAspectRatio="none" aria-hidden="true"><path d="M0 78 C50 60 80 88 130 70 S210 40 260 58 S340 80 400 46" pathLength="1"/></svg><span>${label}</span></span>`}

function spark(data,mint){
 const points=[...data.trades].reverse();
 if(points.length<2)return waiting(data.marketAvailable?t('成交不足，等待图表','Awaiting more trades'):t('行情暂不可用','Market unavailable'));
 const lo=Math.min(...points.map(x=>x.price)),hi=Math.max(...points.map(x=>x.price)),span=hi-lo||hi*.1||1,start=points[0].time,end=points.at(-1).time;
 const xy=points.map((p,i)=>[(end>start?(p.time-start)/(end-start):i/(points.length-1))*384,92-(p.price-lo)/span*64]);
 const path=xy.map(([x,y],i)=>(i?'L':'M')+x.toFixed(2)+','+y.toFixed(2)).join(' '),id='fill-'+mint,[lx,ly]=xy.at(-1);
 const tone=data.changePercent==null?'':data.changePercent<0?'negative':'positive';
 return `<svg viewBox="0 0 400 110" preserveAspectRatio="none" aria-hidden="true" class="${tone}"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="currentColor" stop-opacity=".22"/><stop offset="100%" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><path class="spark-grid" d="M0 35 H400 M0 70 H400 M0 105 H400"/><path class="spark-wash" d="${path} L${lx.toFixed(2)} 110 L0 110 Z" fill="url(#${id})"/><path class="spark-bleed" d="${path}" vector-effect="non-scaling-stroke"/><path class="spark-line" d="${path}" vector-effect="non-scaling-stroke"/></svg><i class="spark-dot ${tone}" style="left:${(lx/4).toFixed(2)}%;top:${(ly/1.1).toFixed(2)}%"></i>`;
}

// Roll a currency figure up to its value the first time a card receives data.
function rollUp(node,value){
 if(!Number.isFinite(value)||still()){node.textContent=money(value);return}
 const began=performance.now(),length=750;
 const step=now=>{if(!node.isConnected)return;const p=Math.min(1,(now-began)/length),eased=1-Math.pow(1-p,4);node.textContent=money(value*eased);if(p<1)requestAnimationFrame(step);else node.textContent=money(value)};
 requestAnimationFrame(step);
}

function populate(node,data,fresh=false){
 node.classList.remove('is-loading');node.classList.toggle('is-fresh',fresh);
 if(fresh)rollUp(node.querySelector('[data-cap]'),data.marketCapUsd);else node.querySelector('[data-cap]').textContent=money(data.marketCapUsd);
 const change=node.querySelector('[data-change]'),down=data.changePercent<0;
 change.textContent=data.changePercent==null?'—':(down?'▼ ':'▲ ')+(down?'':'+')+data.changePercent.toFixed(2)+'%';
 change.classList.toggle('negative',down);change.classList.toggle('positive',data.changePercent!=null&&!down);
 node.querySelector('[data-holders]').textContent=count(data.holders);
 node.querySelector('[data-volume]').textContent=money(data.volumeUsd);
 node.querySelector('[data-count]').textContent=data.marketAvailable?data.buys+' / '+data.sells:'—';
 node.querySelector('[data-spark]').innerHTML=spark(data,node.dataset.marketCard);
 if(data.quoteSymbol)node.querySelector('[data-pair-quote]').textContent=data.quoteSymbol;
 node.querySelector('[data-window]').textContent=(data.chartUnit==='USD MCAP'?t('美元市值','USD MCAP'):data.chartUnit+' '+t('价格','price'))+' · '+t('已加载窗口','loaded window');
 node.querySelector('[data-card-status]').textContent=(data.partial?t('部分成交 · ','Partial trades · '):'')+(data.updatedAt?t('更新于 ','Updated ')+new Date(data.updatedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):t('数据暂不可用','Data unavailable'));
}

async function load(mint){const hit=cache.get(mint);if(hit&&Date.now()-hit.at<60000)return hit.data;const r=await fetch('/api/token/'+encodeURIComponent(mint)+'/summary',{signal:AbortSignal.timeout(25000)});if(!r.ok)throw new Error('Market unavailable');const data=await r.json();cache.set(mint,{at:Date.now(),data});while(cache.size>150)cache.delete(cache.keys().next().value);return data;}
async function drain(){while(running<2&&queue.length){const node=queue.shift();if(!node.isConnected)continue;running++;load(node.dataset.marketCard).then(d=>{if(node.isConnected)populate(node,d,true)}).catch(()=>{if(node.isConnected){node.classList.remove('is-loading');node.querySelector('[data-spark]').innerHTML=waiting(t('行情暂不可用 · 点击重试','Market unavailable · Click to retry'));node.querySelector('[data-card-status]').textContent=t('无法读取最新数据','Latest data unavailable')}}).finally(()=>{running--;drain()});}}

export function mountTokenCards(ctx){
 context=ctx;observer?.disconnect();queue=[];justSaved=null;
 observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){observer.unobserve(e.target);queue.push(e.target)}drain()},{rootMargin:'80px'});
 const nodes=document.querySelectorAll('[data-market-card]');
 nodes.forEach(node=>{const hit=cache.get(node.dataset.marketCard);if(hit&&Date.now()-hit.at<60000)populate(node,hit.data);else observer.observe(node)});
 // The grid re-renders on every keystroke and language switch; only the first arrival is choreographed.
 if(!entered&&nodes.length){entered=true;const grid=nodes[0].parentElement;grid.classList.add('is-entering');setTimeout(()=>grid.classList.remove('is-entering'),1600)}
}

async function overlay(mint){selected=mint;if(!dialog){dialog=document.createElement('dialog');dialog.className='market-chart-dialog';document.body.append(dialog);dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});}const item=context.items.find(x=>x.mint===mint);dialog.innerHTML=`<header><div><small>${t('行情预览','MARKET PREVIEW')}</small><h2>${esc(item?.name||short(mint))} <span>${esc(item?.symbol||'')}</span></h2></div><button data-close-chart aria-label="${t('关闭','Close')}">×</button></header><div class="overlay-metrics" data-overlay-metrics>${t('正在读取行情…','Loading market…')}</div><div class="overlay-chart"><canvas aria-label="Token chart"></canvas><p class="overlay-tooltip" hidden></p><span data-overlay-empty></span></div><footer><small>${t('已加载成交 · 市值按总供应量及当前报价汇率换算','Loaded trades · Market cap uses total supply and current quote FX')}</small><a href="/token/${esc(mint)}">${t('打开完整交易终端','Open full terminal')} ↗</a></footer>`;chart?.resize.disconnect();chart=new CandleChart(dialog.querySelector('canvas'),dialog.querySelector('.overlay-tooltip'));dialog.querySelector('[data-close-chart]').onclick=()=>dialog.close();if(!dialog.open)dialog.showModal();try{const d=await load(mint);if(selected!==mint||!dialog.open)return;const pair=d.quoteSymbol||item?.metadata?.quoteAsset||'—';dialog.querySelector('[data-overlay-metrics]').innerHTML=`<span>${t('市值','Market cap')}<strong>${money(d.marketCapUsd)}</strong></span><span>${t('持币地址','Holders')}<strong>${count(d.holders)}</strong></span><span>${t('配对','Quote pair')}<strong>${esc(pair)}</strong></span><button class="copy-ca" data-copy-ca="${esc(mint)}" title="${esc(mint)}">CA ${esc(short(mint))} <span aria-hidden="true" data-copy-mark>⧉</span></button>`;chart.quoteUnit=d.chartUnit;chart.volumeUnit=pair;chart.set(d.trades,60);dialog.querySelector('[data-overlay-empty]').textContent=d.trades.length?'':t('暂无可用成交图表','No available trades to chart');}catch{dialog.querySelector('[data-overlay-metrics]').textContent=t('行情读取失败，请关闭后重试。','Market unavailable. Close and retry.');}}

function confirmCopy(button){const mark=button.querySelector('[data-copy-mark]');if(!mark)return;clearTimeout(button._copied);mark.textContent='✓';button.classList.add('copied');button._copied=setTimeout(()=>{mark.textContent='⧉';button.classList.remove('copied')},1400)}

document.addEventListener('click',async e=>{
 const save=e.target.closest('[data-save]');if(save&&save.getAttribute('aria-pressed')!=='true')justSaved=save.dataset.save;
 const copy=e.target.closest('[data-copy-ca]');
 if(copy){try{await navigator.clipboard.writeText(copy.dataset.copyCa);confirmCopy(copy);context?.toast(t('合约地址已复制','Contract address copied'));}catch{context?.toast(t('无法复制，请在交易终端查看完整地址','Copy unavailable. Open the terminal for the full address.'));}return;}
 const button=e.target.closest('[data-chart]');if(button)overlay(button.dataset.chart);
});

// Pointer position for the gold edge on anything marked data-tilt.
if(typeof document!=='undefined'){
 let active=null,frame=0,point=null;
 const release=()=>{if(!active)return;active.classList.remove('is-tilting');for(const p of ['--mx','--my'])active.style.removeProperty(p);active=null};
 const apply=()=>{frame=0;if(!active||!point)return;const r=active.getBoundingClientRect(),px=Math.min(1,Math.max(0,(point.x-r.left)/r.width)),py=Math.min(1,Math.max(0,(point.y-r.top)/r.height));active.style.setProperty('--mx',(px*100).toFixed(1)+'%');active.style.setProperty('--my',(py*100).toFixed(1)+'%')};
 document.addEventListener('pointermove',e=>{if(e.pointerType!=='mouse'||still()){release();return}const card=e.target.closest?.('[data-tilt]');if(card!==active){release();active=card;active?.classList.add('is-tilting')}if(!active)return;point={x:e.clientX,y:e.clientY};if(!frame)frame=requestAnimationFrame(apply)},{passive:true});
 document.documentElement.addEventListener('pointerleave',release);window.addEventListener('blur',release);window.addEventListener('scroll',release,{passive:true});
}
