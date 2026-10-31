(()=>{
 const track=document.querySelector('#deck-track');if(!track)return;
 const slides=[...track.children],dots=[...document.querySelectorAll('[data-slide]')];let current=0;
 const reduced=()=>document.body.classList.contains('motion-off')||matchMedia('(prefers-reduced-motion: reduce)').matches;
 function move(index){current=(index+slides.length)%slides.length;track.scrollTo({left:slides[current].offsetLeft-slides[0].offsetLeft,behavior:reduced()?'instant':'smooth'})}
 document.querySelector('#deck-prev').onclick=()=>move(current-1);document.querySelector('#deck-next').onclick=()=>move(current+1);dots.forEach(b=>b.onclick=()=>move(Number(b.dataset.slide)));
 track.addEventListener('keydown',e=>{if(e.target!==track)return;if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();move(current+(e.key==='ArrowRight'?1:-1))}});
 let frame;track.addEventListener('scroll',()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=null;current=slides.reduce((best,s,i)=>Math.abs(s.offsetLeft-slides[0].offsetLeft-track.scrollLeft)<Math.abs(slides[best].offsetLeft-slides[0].offsetLeft-track.scrollLeft)?i:best,0);dots.forEach((b,i)=>b.setAttribute('aria-current',String(i===current)));document.querySelector('#deck-count').textContent=`0${current+1} / 03`})},{passive:true});
 new ResizeObserver(()=>track.scrollTo({left:slides[current].offsetLeft-slides[0].offsetLeft,behavior:'instant'})).observe(track);
 const reveal=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('revealed');reveal.unobserve(e.target)}}),{threshold:.08});document.querySelectorAll('.discover-deck,.home-faq').forEach(el=>{el.classList.add('reveal');reveal.observe(el)});
 const hero=document.querySelector('.hero');let pending=false;hero?.addEventListener('pointermove',e=>{if(reduced()||e.pointerType!=='mouse'||pending)return;pending=true;requestAnimationFrame(()=>{pending=false;const r=hero.getBoundingClientRect();hero.style.setProperty('--pointer-x',`${e.clientX-r.left}px`);hero.style.setProperty('--pointer-y',`${e.clientY-r.top}px`)})});
})();
