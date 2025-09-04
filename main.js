/* ====== Main Framework (unchanged chain; adds startup) ====== */
let actx, masterGain, analyser;
let currentBuffer, currentSource;
const rack = [];
const viz = { mode: 'bars' };

async function ensureCtx(){
  if (actx) return actx;
  actx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint:'interactive' });

  masterGain = actx.createGain();
  masterGain.gain.value = 1;

  analyser = actx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.85;

  masterGain.connect(analyser);
  analyser.connect(actx.destination);

  startVisualizer(analyser, viz); // from visualizer.js

  return actx;
}
async function decodeFile(file){
  const arr=await file.arrayBuffer();
  return actx.decodeAudioData(arr);
}
function stopSource(){
  if(currentSource){ try{currentSource.stop()}catch{} currentSource.disconnect(); currentSource=null; }
}
function wireChain(){
  if (!currentSource) return;
  try{ currentSource.disconnect(); }catch{}
  const active = rack.filter(fx=>!fx.bypass);
  if (active.length){
    currentSource.connect(active[0].input);
    for (let i=0;i<active.length-1;i++) active[i].output.connect(active[i+1].input);
    active[active.length-1].output.connect(masterGain);
  } else currentSource.connect(masterGain);
}

/* ====== UI ====== */
document.getElementById('fileInput').addEventListener('change', async e=>{
  await ensureCtx();
  const f=e.target.files[0]; if(!f) return;
  currentBuffer = await decodeFile(f);
});
document.getElementById('btnPlay').addEventListener('click', async ()=>{
  await ensureCtx();
  if(!currentBuffer) return alert('Load audio first!');
  await actx.resume();
  stopSource();
  currentSource = actx.createBufferSource();
  currentSource.buffer = currentBuffer;
  wireChain();
  currentSource.start();
});
document.getElementById('btnStop').addEventListener('click', ()=> stopSource());

document.getElementById('btnAdd').addEventListener('click', ()=>{
  const sel=document.getElementById('fxPicker');
  const idx=Number(sel.value);
  const fxMeta=FX[idx]; if(!fxMeta) return;
  const node=fxMeta.create(actx);
  const inst={meta:fxMeta,input:node.input,output:node.output,set:node.set,bypass:false};
  rack.push(inst);

  const card=document.createElement('div');
  card.className='fx';
  card.innerHTML=`<header><h3>${fxMeta.name}</h3><button>Remove</button></header><div class="controls"></div>`;
  const ctrls=card.querySelector('.controls');
  fxMeta.params.forEach(p=>{
    const row=document.createElement('div');
    row.className='row';
    row.innerHTML=`${p.label}: <input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${p.default}">`;
    const rng=row.querySelector('input');
    rng.addEventListener('input',()=>inst.set(p.key,Number(rng.value)));
    inst.set(p.key,p.default);
    ctrls.appendChild(row);
  });
  card.querySelector('button').addEventListener('click',()=>{
    const i=rack.indexOf(inst); if(i>=0) rack.splice(i,1);
    card.remove(); wireChain();
  });
  document.getElementById('rack').appendChild(card);
  wireChain();
});

/* ===== Export WAV (dry buffer) ===== */
document.getElementById('btnExport').addEventListener('click', ()=>{
  if(!currentBuffer) return alert('Nothing to export');
  const wav = bufferToWav(currentBuffer);
  const blob=new Blob([wav],{type:'audio/wav'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download='fxrack.wav';a.click();
  document.getElementById('exportStatus').textContent="Exported!";
});
function bufferToWav(buffer){
  const numCh=buffer.numberOfChannels,length=buffer.length* numCh*2+44;
  const ab=new ArrayBuffer(length), view=new DataView(ab);
  let pos=0;
  function writeStr(s){for(let i=0;i<s.length;i++)view.setUint8(pos++,s.charCodeAt(i));}
  function write16(v){view.setInt16(pos,v,true);pos+=2;}
  function write32(v){view.setUint32(pos,v,true);pos+=4;}
  writeStr('RIFF');write32(length-8);writeStr('WAVE');writeStr('fmt ');write32(16);
  write16(1);write16(numCh);write32(buffer.sampleRate);write32(buffer.sampleRate*numCh*2);
  write16(numCh*2);write16(16);writeStr('data');write32(buffer.length*numCh*2);
  const chans=[];for(let i=0;i<numCh;i++)chans.push(buffer.getChannelData(i));
  for(let i=0;i<buffer.length;i++)for(let ch=0;ch<numCh;ch++){let s=Math.max(-1,Math.min(1,chans[ch][i]));view.setInt16(pos,s<0?s*0x8000:s*0x7FFF,true);pos+=2;}
  return ab;
}

/* ====== Start-Up Sequence (splash + audio unlock) ====== */
(function startup(){
  const splash = document.getElementById('splash');
  const enter  = document.getElementById('enterBtn');
  if (!splash || !enter) return;
  let unlocked = false;

  async function unlock(){
    if (unlocked) return;
    await ensureCtx();
    await actx.resume(); // required by autoplay policies
    unlocked = true;
    splash.style.opacity = '0';
    splash.style.pointerEvents = 'none';
    setTimeout(()=> splash.remove(), 400);
  }

  enter.addEventListener('click', unlock);
  // also allow any key/gesture
  window.addEventListener('keydown', unlock, { once:true });
  window.addEventListener('pointerdown', unlock, { once:true });
})();
