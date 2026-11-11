// Generative porcelain ornaments. Each token's mint address seeds one of five
// traditional patterns, so a card keeps the same decoration every time it is drawn.
function seeded(text){let h=1779033703^text.length;for(let i=0;i<text.length;i++){h=Math.imul(h^text.charCodeAt(i),3432918353);h=h<<13|h>>>19}let a=h>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const n=v=>Number(v.toFixed(1));

// 海水纹 · overlapping wave scallops
function waves(r){const R=15+Math.floor(r()*5);let d='';for(let row=0;row<8;row++){const y=24+row*R*.92,off=row%2?R:0;for(let x=-R+off;x<190;x+=R*2)for(const k of [1,.64,.3])d+=`M${n(x-R*k)} ${n(y)}A${n(R*k)} ${n(R*k)} 0 0 1 ${n(x+R*k)} ${n(y)}`}return d}
// 铜钱纹 · interlocking coins
function coins(r){const R=17+Math.floor(r()*5);let d='';for(let j=0;j<=Math.ceil(180/R);j++)for(let i=0;i<=Math.ceil(180/R);i++){if((i+j)%2)continue;const x=i*R,y=j*R;d+=`M${n(x-R)} ${n(y)}A${R} ${R} 0 1 0 ${n(x+R)} ${n(y)}A${R} ${R} 0 1 0 ${n(x-R)} ${n(y)}`}return d}
// 回纹 · key fret
function fret(r){const s=20+Math.floor(r()*6);let d='';for(let j=0;j<Math.ceil(180/s);j++)for(let i=0;i<Math.ceil(180/s);i++){const x=i*s+(j%2?s/2:0),y=j*s,u=s/10;d+=`M${n(x)} ${n(y+8*u)}H${n(x+8*u)}V${n(y)}H${n(x+2*u)}V${n(y+6*u)}H${n(x+6*u)}V${n(y+2.6*u)}H${n(x+4*u)}`}return d}
// 祥云 · cloud scrolls
function clouds(r){let d='';for(let c=0;c<7;c++){const cx=20+r()*150,cy=20+r()*150,a=2.6+r()*1.6,turn=r()*6.28,dir=r()<.5?1:-1;for(let i=0;i<=34;i++){const th=i/34*4.6*Math.PI,rad=a*th*.72;d+=(i?'L':'M')+n(cx+Math.cos(th*dir+turn)*rad)+' '+n(cy+Math.sin(th*dir+turn)*rad*.82)}const tail=turn+4.6*Math.PI*dir;d+=`q${n(Math.cos(tail+1.2*dir)*26)} ${n(Math.sin(tail+1.2*dir)*14)} ${n(Math.cos(tail+1.9*dir)*46)} ${n(Math.sin(tail+1.9*dir)*10)}`}return d}
// 莲瓣纹 · lotus-petal rim, as on the edge of a plate
function petals(r){const cx=128,cy=52,count=14+Math.floor(r()*6),r0=30,r1=58,r2=74;let d=`M${cx-r0} ${cy}a${r0} ${r0} 0 1 0 ${r0*2} 0a${r0} ${r0} 0 1 0 ${-r0*2} 0M${cx-r2-8} ${cy}a${r2+8} ${r2+8} 0 1 0 ${(r2+8)*2} 0a${r2+8} ${r2+8} 0 1 0 ${-(r2+8)*2} 0`;for(let i=0;i<count;i++){const a=i/count*Math.PI*2,b=(i+1)/count*Math.PI*2,m=(a+b)/2,P=(ang,rad)=>n(cx+Math.cos(ang)*rad)+' '+n(cy+Math.sin(ang)*rad);d+=`M${P(a,r0+5)}Q${P(a,r1)} ${P(m,r2)}Q${P(b,r1)} ${P(b,r0+5)}`}for(let i=0;i<count;i++){const m=(i+.5)/count*Math.PI*2;d+=`M${n(cx+Math.cos(m)*(r0+12))} ${n(cy+Math.sin(m)*(r0+12))}L${n(cx+Math.cos(m)*(r1-4))} ${n(cy+Math.sin(m)*(r1-4))}`}return d}

const kinds=[['waves',waves],['coins',coins],['fret',fret],['clouds',clouds],['petals',petals]];
export function motif(mint){
 const random=seeded(String(mint||'fafa')),[name,draw]=kinds[Math.floor(random()*kinds.length)];
 return `<svg class="motif-${name}" viewBox="0 0 180 180" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"><path d="${draw(random)}" pathLength="1"/></svg>`;
}
