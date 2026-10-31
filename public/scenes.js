(()=>{
 const lime='#c8fa69',gold='#f4c56c',red='#fa8d83',muted='#82977a';let meme='dog',mode='candles',step=0,start=performance.now();
 const en=()=>document.documentElement.lang==='en',tr=(cn,eng)=>en()?eng:cn;
 const reduced=()=>document.documentElement.classList.contains('motion-off')||matchMedia('(prefers-reduced-motion: reduce)').matches;
 const scenes=[...document.querySelectorAll('.code-scene')].map(el=>({el,canvas:el.querySelector('canvas'),visible:false}));
 function round(c,x,y,w,h,r,fill,stroke){c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill()}if(stroke){c.strokeStyle=stroke;c.stroke()}}
 function text(c,str,x,y,size=12,color=muted,align='left'){c.fillStyle=color;c.font=`${size>=20?'700':'500'} ${size}px system-ui,"PingFang SC","Microsoft YaHei",sans-serif`;c.textAlign=align;c.fillText(str,x,y)}
 function line(c,x,y,X,Y,color,width=1){c.beginPath();c.strokeStyle=color;c.lineWidth=width;c.moveTo(x,y);c.lineTo(X,Y);c.stroke();c.lineWidth=1}
 function circle(c,x,y,r,color){c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=color;c.fill()}
 function mascot(c,x,y,type,scale=1){c.save();c.translate(x,y);c.scale(scale,scale);
 if(type==='dog'){c.fillStyle=gold;c.beginPath();c.moveTo(-39,-22);c.lineTo(-34,-64);c.lineTo(-9,-38);c.lineTo(14,-38);c.lineTo(37,-64);c.lineTo(42,-18);c.closePath();c.fill();round(c,-43,-36,86,78,33,gold);round(c,-28,-7,56,42,20,'#fff0bc');round(c,-40,-24,34,17,5,'#111a14');round(c,6,-24,34,17,5,'#111a14');line(c,-6,-17,6,-17,'#111a14',5);circle(c,0,6,6,'#182318');line(c,0,11,0,22,'#182318',2);line(c,0,22,10,18,'#182318',2)}
 else if(type==='panda'){circle(c,-31,-32,19,'#99ad9a');circle(c,31,-32,19,'#99ad9a');round(c,-44,-38,88,82,36,'#edf3df');circle(c,-20,-5,16,'#17271e');circle(c,20,-5,16,'#17271e');circle(c,-18,-9,4,'#edf3df');circle(c,18,-9,4,'#edf3df');circle(c,0,15,6,'#17271e');line(c,-8,29,8,29,'#17271e',2)}
 else{c.strokeStyle=gold;c.lineWidth=18;c.beginPath();c.moveTo(-40,36);c.bezierCurveTo(15,72,55,8,7,8);c.bezierCurveTo(-42,7,-32,-35,15,-32);c.stroke();c.lineWidth=1;round(c,-4,-49,56,38,14,gold);line(c,3,-44,-9,-65,gold,7);line(c,22,-45,23,-66,gold,7);circle(c,30,-34,5,'#17231a');line(c,47,-22,69,-32,gold,2);line(c,45,-18,66,-8,gold,2)}c.restore()}
 function mint(c,t){const name={dog:'金狗',dragon:'龙王',panda:'熊猫'}[meme];
 for(let i=0;i<16;i++){const a=i*2.4+t*.16,r=80+(i%4)*12;circle(c,175+Math.cos(a)*r,140+Math.sin(a)*r*.8,1.7,i%2?gold:lime)}
 c.save();c.translate(170,137+Math.sin(t*1.4)*5);c.rotate(Math.sin(t*.6)*.035);circle(c,0,0,86,'#233520');c.strokeStyle='#6f8a40';c.lineWidth=2;c.beginPath();c.arc(0,0,78,0,Math.PI*2);c.stroke();c.lineWidth=1;mascot(c,0,-5,meme,.95);text(c,name,0,64,18,lime,'center');c.restore();
 round(c,300,45,190,192,12,'#17241b','#3f563a');text(c,tr('灵感 → 中文代码','IDEA → CHINESE TICKER'),314,70,10);text(c,name,314,105,25,lime);text(c,tr('社区的梗，自己的币。','Your meme. Your community.'),314,131,11,'#d8e5cc');line(c,314,147,474,147,'#334d32');text(c,tr('名称已就位','Name ready'),314,169,12);text(c,'✓',470,169,14,lime,'right');text(c,tr('专属代币页面','Dedicated token page'),314,195,12);text(c,'✓',470,195,14,lime,'right');
 const p=(t*.25)%1;line(c,254,136,294,136,'#576c3a');circle(c,254+p*40,136,3,lime);text(c,tr('点击下方，切换你的中文梗','Choose a Chinese meme below'),260,268,11,muted,'center')}
 const values=Array.from({length:38},(_,i)=>95+Math.sin(i*.7)*17+Math.cos(i*.32)*23+i*.45);
 function chart(c,t){text(c,tr('金狗 / SOL · 示例','金狗 / SOL · EXAMPLE'),20,25,12,'#d7e7cd');text(c,tr('演示走势，不代表收益','Illustration, not returns'),500,25,10,muted,'right');
 for(let i=0;i<5;i++)line(c,20,48+i*35,368,48+i*35,'#263629');
 const count=reduced()?30:Math.min(38,8+Math.floor((t%18)*2));const X=i=>28+i*8.7,Y=v=>211-v;
 if(mode==='line'){c.beginPath();c.strokeStyle=lime;c.lineWidth=2;for(let i=0;i<count;i++){if(i===0)c.moveTo(X(i),Y(values[i]));else c.lineTo(X(i),Y(values[i]))}c.stroke();c.lineWidth=1}
 for(let i=0;i<count;i++){const open=values[Math.max(0,i-1)],close=values[i],color=close>=open?lime:red;if(mode==='candles'){line(c,X(i),Y(Math.max(open,close)+7),X(i),Y(Math.min(open,close)-7),color);round(c,X(i)-2.5,Math.min(Y(open),Y(close)),5,Math.max(2,Math.abs(close-open)),1,color)}round(c,X(i)-2.5,233-(i%7+2)*4,5,(i%7+2)*4,0,color+'55')}
 const last=values[count-1];c.setLineDash([3,4]);line(c,20,Y(last),366,Y(last),'#b6d87766');c.setLineDash([]);circle(c,X(count-1),Y(last),3,lime);
 round(c,382,45,124,195,8,'#15221b','#314533');text(c,tr('成交演示','DEMO TRADES'),394,67,11);for(let i=0;i<5;i++){const buy=(i+Math.floor(t*.5))%3!==0;const y=94+i*27;text(c,buy?tr('买入','BUY'):tr('卖出','SELL'),394,y,11,buy?lime:red);text(c,['0.12','0.08','0.31','0.05','0.24'][i],493,y,11,'#c3cfbb','right')};text(c,tr('数量为示例 · 不连接钱包','Sample amounts · No wallet connected'),20,267,11)}
 function flow(c,t){const labels=[tr('连接钱包','CONNECT'),tr('预览报价','REVIEW'),tr('钱包签名','SIGN'),tr('链上确认','CONFIRM')];
 for(let i=0;i<4;i++){const x=64+i*130;if(i<3){line(c,x+25,72,x+105,72,'#3e5134',2);if(i===step&&step<3){circle(c,x+25+(t%1.5)/1.5*80,72,4,lime)}}circle(c,x,72,23,i<=step?'#c8fa69':'#23331e');text(c,i<step?'✓':String(i+1),x,79,18,i<=step?'#17220e':'#8d9f7d','center');text(c,labels[i],x,115,11,i===step?lime:muted,'center')}
 round(c,50,148,420,88,12,'#17251b','#3e563a');const titles=[tr('你的资产，由你掌握','Your assets. Your wallet.'),tr('先看清，再决定','Review before you decide.'),tr('每次操作，单独批准','Approve each action.'),tr('以链上确认结果为准','Wait for onchain confirmation.')];const captions=[tr('连接不会发起转账','Connecting does not transfer funds'),tr('核对代币、金额与滑点','Check token, amount and slippage'),tr('只有钱包批准后才会提交','Submission follows wallet approval'),tr('遇到超时，先检查订单记录','On timeout, check your order history')];text(c,titles[step],72,180,18,lime);text(c,captions[step],72,208,12,'#bbcbb0');text(c,tr('点击步骤，了解交易流程 · 非真实订单','Explore the steps · No real order is placed'),260,269,11,muted,'center')}
 function draw(scene,time){const canvas=scene.canvas,r=canvas.getBoundingClientRect();if(!r.width)return;const d=Math.min(devicePixelRatio||1,2);if(canvas.width!==Math.round(r.width*d)||canvas.height!==Math.round(r.height*d)){canvas.width=Math.round(r.width*d);canvas.height=Math.round(r.height*d)}const c=canvas.getContext('2d');c.setTransform(d,0,0,d,0,0);c.clearRect(0,0,r.width,r.height);c.scale(r.width/520,r.height/285);({mint,chart,flow}[scene.el.dataset.scene])(c,time)}
 function redraw(){const time=reduced()?4:(performance.now()-start)/1000;scenes.forEach(s=>{if(s.visible)draw(s,time)})}
 let raf=0,last=0;function loop(now){raf=0;if(reduced()||document.hidden||!scenes.some(s=>s.visible))return;if(now-last>33){redraw();last=now}raf=requestAnimationFrame(loop)}
 function sync(){cancelAnimationFrame(raf);raf=0;redraw();if(!reduced()&&!document.hidden&&scenes.some(s=>s.visible))raf=requestAnimationFrame(loop)}

 const observer=new IntersectionObserver(entries=>{entries.forEach(e=>{scenes.find(s=>s.el===e.target).visible=e.isIntersecting});sync()},{threshold:.15});scenes.forEach(s=>{observer.observe(s.el);new ResizeObserver(()=>draw(s,reduced()?4:(performance.now()-start)/1000)).observe(s.canvas)});
 document.querySelectorAll('[data-meme]').forEach(b=>b.onclick=()=>{meme=b.dataset.meme;document.querySelectorAll('[data-meme]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));redraw()});
 document.querySelectorAll('[data-chart]').forEach(b=>b.onclick=()=>{mode=b.dataset.chart;document.querySelectorAll('[data-chart]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));redraw()});document.querySelector('[data-replay]').onclick=()=>{start=performance.now();redraw()};
 document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{step=Number(b.dataset.step);document.querySelectorAll('[data-step]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));redraw()});
 new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:['class','lang']});document.addEventListener('visibilitychange',sync);sync();
})();
