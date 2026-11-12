// Site-wide strip announcing the main token, with a tap-to-copy contract address.
(()=>{
 const mint='8DmkXH1gastCcnwQJZah67s3mHqN7AXf4YxeG264pump';
 const bar=document.createElement('div');bar.className='live-banner';
 const en=()=>{try{return localStorage.getItem('fafa-lang')==='en'}catch{return false}};
 const draw=()=>{bar.innerHTML=`<span class="live-dot"></span><b>$暴富</b><span>${en()?'is live':'已上线'}</span><button type="button" title="${mint}">CA: <code>${mint}</code> <i>⧉</i></button><a href="/token/${mint}">${en()?'[trade]':'[交易]'}</a>`};
 draw();document.body.prepend(bar);
 window.addEventListener('fafa-state',draw);document.addEventListener('click',e=>{if(e.target.closest('#lang'))setTimeout(draw,60)});
 bar.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;try{await navigator.clipboard.writeText(mint);const i=b.querySelector('i');i.textContent='✓';b.classList.add('copied');setTimeout(()=>{i.textContent='⧉';b.classList.remove('copied')},1400)}catch{}});
})();
