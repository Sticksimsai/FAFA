export function rewardCountdown(data,now=Date.now()){
 if(data.rounds?.some(r=>!r.paid))return {phase:'paying',text:'—'};
 if(!Number.isFinite(Number(data.nextDue))||Number(data.nextDue)<=0)return {phase:'waiting',text:'—'};
 const seconds=Math.max(0,Math.ceil(Number(data.nextDue)-now/1000));
 return {phase:seconds?'countdown':'due',text:[Math.floor(seconds/3600),Math.floor(seconds%3600/60),seconds%60].map(n=>String(n).padStart(2,'0')).join(':')};
}
export function rewardPanelHtml(data,{en=false,quote='SOL',symbol='TOKEN',multiplier=1,esc,now=Date.now(),stale=false}){
 const t=(zh,english)=>en?english:zh,number=(raw,decimals=6,m=1)=>new Intl.NumberFormat(en?'en':'zh-CN',{maximumFractionDigits:6}).format(Number(raw)/10**decimals*m);
 if(!data?.enabled)return '';
 const custodial=data.architecture==='custodial-v1',rounds=data.rounds||[],pending=rounds.find(r=>!r.paid),clock=rewardCountdown(data,now);
 const short=s=>s.slice(0,6)+'…'+s.slice(-4),account=s=>`https://solscan.io/account/${encodeURIComponent(s)}`,tx=s=>`https://solscan.io/tx/${encodeURIComponent(s)}`;
 const label=phase=>phase==='paying'?t('获奖者已记录 · 等待付款确认','Winner recorded · Awaiting payment confirmation'):phase==='due'?t('周期已到 · 等待足够费用及合格持币者','Cycle due · Waiting for sufficient fees and eligible holders'):phase==='waiting'?t('等待周期开始','Waiting for cycle to start'):t('距离下一次开奖检查','Next draw eligibility check');
 const amount=r=>`${number(r.reward,quote==='SOL'?9:6,multiplier)} ${esc(quote)}${BigInt(r.baseReward||0)>0n?' + '+number(r.baseReward)+' '+esc(symbol):''}`;
 return `<div class="reward-heading"><h2>🧧 ${t('持币红包','Holder red envelopes')}</h2><span>${data.cycleSeconds<3600?data.cycleSeconds/60+'m':data.cycleSeconds/3600+'h'} ${t('周期','cycle')}</span></div>
 <div class="reward-clock"><span data-reward-clock-label>${label(clock.phase)}</span><strong data-reward-countdown aria-label="${t('倒计时','Countdown')}">${clock.text}</strong><small>${t('达到奖励门槛且有合格持币者才开奖，付款可能延后。','A draw requires sufficient rewards and eligible holders. Payment may occur later.')}</small></div>
 <p class="reward-stale" data-reward-stale ${stale?'':'hidden'} role="status">${t('状态更新失败，显示上次获取的数据；请勿将倒计时视为付款确认。','Updates unavailable; showing last known data. The countdown is not payment confirmation.')}</p>
 <div class="reward-draw ${pending?'is-pending':''}"><span class="reward-draw-mark" aria-hidden="true">🧧</span><div><small>${t('本轮抽取状态','Current draw status')}</small><strong>${pending?.winner?`<a href="${account(pending.winner)}" target="_blank" rel="noopener" title="${esc(pending.winner)}">${esc(short(pending.winner))}</a>`:t('等待下一轮','Waiting for the next round')}</strong><span>${pending?`${amount(pending)} · ${pending.count} ${t('个合格钱包','eligible wallets')}`:t('获奖钱包由服务器抽取并记录后显示。','The winner appears after the server records the draw.')}</span></div></div>
 <p>${custodial?t('服务器随机抽取 · 运行方托管。没有独立的链上随机数交易；下方 Tx 是实际付款交易。','Server-generated randomness · Operator custody. There is no separate onchain randomness transaction; Tx links show actual payments.'):t('链上随机数及结算','Onchain randomness and settlement')}</p>
 <div class="reward-links"><a href="${account(data.vault)}" target="_blank" rel="noopener">${t('奖励钱包','Reward wallet')}</a><a href="/red-envelopes.html">${t('规则与抽取方式','Rules & draw method')}</a></div>
 <h3>${t('每轮获奖记录','Round-by-round winners')} <small>${t('最近 20 轮','Latest 20 rounds')}</small></h3>
 ${rounds.length?`<div class="reward-rounds">${rounds.map(r=>`<article class="reward-round ${r.paid?'is-paid':'is-pending'}"><div class="reward-round-title"><strong>#${esc(String(BigInt(r.sequence)+1n))}</strong><span>${r.paid?t('付款已确认','Payment confirmed'):r.payoutSignature?t('付款待确认','Payment pending'):t('获奖者已记录','Winner recorded')}</span></div><a class="reward-winner" href="${account(r.winner)}" title="${esc(r.winner)}" target="_blank" rel="noopener">${esc(short(r.winner))}</a><strong>${amount(r)}</strong><small>${r.count} ${t('个合格钱包','eligible wallets')}</small><div class="reward-links"><a href="${esc(r.snapshotUrl)}" target="_blank" rel="noopener">${t('抽取记录 / 持币快照','Draw record / snapshot')}</a>${r.payoutSignature?`<a href="${tx(r.payoutSignature)}" target="_blank" rel="noopener">${r.paid?t('付款交易','Payout Tx'):t('待确认交易','Pending Tx')} ↗</a>`:`<span>${t('付款交易尚未提交','Payout transaction not yet submitted')}</span>`}</div></article>`).join('')}</div>`:`<p>${t('尚无已记录的获奖轮次。','No recorded winners yet.')}</p>`}
 ${data.collections?.length?`<details><summary>${t('费用收集交易','Fee collection transactions')}</summary><div class="reward-links">${data.collections.map((c,i)=>`<a href="${tx(c.signature)}" target="_blank" rel="noopener">${i+1} ↗</a>`).join('')}</div></details>`:''}`;
}
export function updateRewardCountdown(element,data,{en=false,now=Date.now(),stale=false}={}){
 if(!element||!data?.enabled)return;const c=rewardCountdown(data,now),label=element.querySelector('[data-reward-clock-label]'),value=element.querySelector('[data-reward-countdown]');
 if(value)value.textContent=c.text;
 const labels=en?{paying:'Winner recorded · Awaiting payment confirmation',due:'Cycle due · Waiting for sufficient fees and eligible holders',waiting:'Waiting for cycle to start',countdown:'Next draw eligibility check'}:{paying:'获奖者已记录 · 等待付款确认',due:'周期已到 · 等待足够费用及合格持币者',waiting:'等待周期开始',countdown:'距离下一次开奖检查'};
 if(label)label.textContent=labels[c.phase];const warning=element.querySelector('[data-reward-stale]');if(warning)warning.hidden=!stale;
}
