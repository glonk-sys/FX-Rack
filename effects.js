/* ============================================
   FX Rack — Mega Effects Library (63 effects)
   Only this file is needed. Framework stays the same.
   ============================================ */

const FX = [];
function register(fx){ FX.push(fx); refreshPicker(); }
function refreshPicker(){
  const sel = document.getElementById('fxPicker');
  if (!sel) return;
  sel.innerHTML = FX.map((f,i)=>`<option value="${i}">${f.name}</option>`).join('');
}

/* ---------- Helpers ---------- */
const clamp = (v,a,b)=>Math.min(b,Math.max(a,v));
const dbToGain = db => Math.pow(10, db/20);

function makeDryWet(ctx, wetNode){
  const input=ctx.createGain(), split=ctx.createGain(), dry=ctx.createGain(), wet=ctx.createGain(), out=ctx.createGain();
  input.connect(split);
  split.connect(dry); dry.connect(out);
  split.connect(wetNode); wetNode.connect(wet); wet.connect(out);
  // caller sets wet/dry gains
  return { input, output:out, dry, wet };
}

function makeStereoPannerSafe(ctx){
  if (ctx.createStereoPanner) return ctx.createStereoPanner();
  // Fallback: L/R gains with equal-power law
  const splitter=ctx.createChannelSplitter(2);
  const gL=ctx.createGain(), gR=ctx.createGain();
  const merger=ctx.createChannelMerger(2);
  splitter.connect(gL,0); splitter.connect(gR,1);
  gL.connect(merger,0,0); gR.connect(merger,0,1);
  const node = {
    input: splitter, output: merger,
    _pan: 0,
    setPan(v){
      this._pan = clamp(v,-1,1);
      const l = Math.cos((this._pan + 1) * Math.PI / 4);
      const r = Math.cos((1 - this._pan) * Math.PI / 4);
      gL.gain.value = l; gR.gain.value = r;
    }
  };
  node.setPan(0);
  return node;
}

function waveshaperCurve(amount){
  const k=Number(amount), n=2048, c=new Float32Array(n);
  for(let i=0;i<n;i++){ const x=(i*2)/n-1; c[i]=(1+k)*x/(1+k*Math.abs(x)); }
  return c;
}
function waveCurve(fn){
  const n=2048, c=new Float32Array(n);
  for(let i=0;i<n;i++){ const x=(i*2)/n-1; c[i]=fn(x); }
  return c;
}

/* ---------- DRIVES / DISTORTIONS (10) ---------- */

// 1) Gain (utility)
register({
  id:'gain', name:'Gain',
  params:[{key:'gain',label:'Gain',min:0,max:4,step:0.01,default:1}],
  create(ctx){ const g=ctx.createGain(); return { input:g, output:g, set:(k,v)=>{ if(k==='gain') g.gain.value=v; } }; }
});

// 2) Pan / Balance
register({
  id:'pan', name:'Pan (Stereo Balance)',
  params:[{key:'pan',label:'Pan',min:-1,max:1,step:0.01,default:0}],
  create(ctx){
    const p = makeStereoPannerSafe(ctx);
    return { input:p.input||p, output:p.output||p, set:(k,v)=>{ if (p.pan && p.pan.value!=null) p.pan.value=v; else p.setPan?.(v); } };
  }
});

// 3) Overdrive
register({
  id:'overdrive', name:'Overdrive',
  params:[{key:'amount',label:'Amount',min:0,max:4000,step:1,default:600},{key:'mix',label:'Mix',min:0,max:1,step:0.001,default:1}],
  create(ctx){
    const sh=ctx.createWaveShaper(), d=makeDryWet(ctx, sh); sh.curve=waveshaperCurve(600);
    return { input:d.input, output:d.output, set:(k,v)=>{ if(k==='amount') sh.curve=waveshaperCurve(v); if(k==='mix'){ d.wet.gain.value=v; d.dry.gain.value=1-v; } } };
  }
});

// 4) Saturation (softer)
register({
  id:'saturation', name:'Saturation',
  params:[{key:'amount',label:'Amount',min:0,max:4000,step:1,default:400},{key:'mix',label:'Mix',min:0,max:1,step:0.001,default:0.9}],
  create(ctx){
    const sh=ctx.createWaveShaper(), d=makeDryWet(ctx, sh); sh.curve=waveshaperCurve(400*0.6);
    return { input:d.input, output:d.output, set:(k,v)=>{ if(k==='amount') sh.curve=waveshaperCurve(v*0.6); if(k==='mix'){ d.wet.gain.value=v; d.dry.gain.value=1-v; } } };
  }
});

// 5) Tube Drive (tanh)
register({
  id:'tube', name:'Tube Drive',
  params:[{key:'drive',label:'Drive',min:0,max:40,step:0.1,default:8},{key:'mix',label:'Mix',min:0,max:1,step:0.001,default:0.9}],
  create(ctx){
    const sh=ctx.createWaveShaper(), d=makeDryWet(ctx, sh);
    const curve=(a)=>waveCurve(x=>Math.tanh(a*x));
    sh.curve=curve(8);
    return { input:d.input, output:d.output, set:(k,v)=>{ if(k==='drive') sh.curve=curve(v); if(k==='mix'){ d.wet.gain.value=v; d.dry.gain.value=1-v; } } };
  }
});

// 6) Fuzz
register({
  id:'fuzz', name:'Fuzz',
  params:[{key:'drive',label:'Drive',min:0,max:300,step:1,default:80},{key:'mix',label:'Mix',min:0,max:1,step:0.001,default:1}],
  create(ctx){
    const sh=ctx.createWaveShaper(), d=makeDryWet(ctx, sh);
    const curve=(a)=>waveCurve(x=>Math.tanh(x*(1+a)));
    sh.curve=curve(80);
    return { input:d.input, output:d.output, set:(k,v)=>{ if(k==='drive') sh.curve=curve(v); if(k==='mix'){ d.wet.gain.value=v; d.dry.gain.value=1-v; } } };
  }
});

// 7) Soft Clip
register({
  id:'softclip', name:'Soft Clip',
  params:[{key:'amount',label:'Amount',min:0,max:4000,step:1,default:600},{key:'mix',label:'Mix',min:0,max:1,step:0.001,default:1}],
  create(ctx){
    const sh=ctx.createWaveShaper(), d=makeDryWet(ctx, sh);
    const curve=(a)=>waveCurve(x=> (Math.abs(x)<0.5)?2*x:(Math.sign(x)*(3-(2-2*Math.abs(x))**2))/2 );
    sh.curve=curve(600);
    return { input:d.input, output:d.output, set:(k,v)=>{ if(k==='amount') sh.curve=curve(v); if(k==='mix'){ d.wet.gain.value=v; d.dry.gain.value=1-v; } } };
  }
});

// 8) Hard Clip
register({
  id:'hardclip', name:'Hard Clip',
  params:[{key:'th',label:'Threshold',min:0.1,max:1,step:0.001,default:0.8},{key:'mix',label:'Mix',min:0,max:1,step:0.001,default:1}],
  create(ctx){
    const sh=ctx.createWaveShaper(), d=makeDryWet(ctx, sh);
    const curve=(t)=>waveCurve(x=>clamp(x,-t,t)/t);
    sh.curve=curve(0.8);
    return { input:d.input, output:d.output, set:(k,v)=>{ if(k==='th') sh.curve=curve(v); if(k==='mix'){ d.wet.gain.value=v; d.dry.gain.value=1-v; } } };
  }
});

// 9) Foldback
register({
  id:'foldback', name:'Foldback',
  params:[{key:'amt',label:'Amount',min:0,max:2,step:0.001,default:0.9},{key:'mix',label:'Mix',min:0,max:1,step:0.001,default:1}],
  create(ctx){
    const sh=ctx.createWaveShaper(), d=makeDryWet(ctx, sh);
    const curve=(a)=>waveCurve(x=>{ const t=a; let y=Math.abs(((x + t) % (2*t)) - t) - t/2; return y*2; });
    sh.curve=curve(0.9);
    return { input:d.input, output:d.output, set:(k,v)=>{ if(k==='amt') sh.curve=curve(v); if(k==='mix'){ d.wet.gain.value=v; d.dry.gain.value=1-v; } } };
  }
});

// 10) Diode Clip (approx)
register({
  id:'diode', name:'Diode Clip',
  params:[{key:'drive',label:'Drive',min:0,max:100,step:1,default:20},{key:'mix',label:'Mix',min:0,max:1,step:0.001,default:0.9}],
  create(ctx){
    const sh=ctx.createWaveShaper(), d=makeDryWet(ctx, sh);
    const curve=(a)=>waveCurve(x=> x<0? -Math.log1p(-a*x)/Math.log1p(a) : Math.log1p(a*x)/Math.log1p(a) );
    sh.curve=curve(20);
    return { input:d.input, output:d.output, set:(k,v)=>{ if(k==='drive') sh.curve=curve(Math.max(0.001,v)); if(k==='mix'){ d.wet.gain.value=v; d.dry.gain.value=1-v; } } };
  }
});

// 11) Octaver (rectifier)
register({
  id:'octaver', name:'Octaver (Rectifier)',
  params:[{key:'mix',label:'Mix',min:0,max:1,step:0.001,default:0.7}],
  create(ctx){
    const sh=ctx.createWaveShaper(), d=makeDryWet(ctx, sh);
    sh.curve = waveCurve(x=>Math.abs(x)*2-1);
    return { input:d.input, output:d.output, set:(k,v)=>{ if(k==='mix'){ d.wet.gain.value=v; d.dry.gain.value=1-v; } } };
  }
});

/* ---------- CRUSHERS / LO-FI (3) ---------- */

// 12) Bitcrusher
register({
  id:'bitcrusher', name:'Bitcrusher',
  params:[{key:'bits',label:'Bits',min:1,max:24,step:1,default:8},{key:'mix',label:'Mix',min:0,max:1,step:0.001,default:1}],
  create(ctx){
    const proc = ctx.createScriptProcessor(512, 2, 2);
    const d = makeDryWet(ctx, proc);
    let bits=8, step=0, holdL=0, holdR=0;
    proc.onaudioprocess = (e)=>{
      const n=e.inputBuffer.length;
      const xL=e.inputBuffer.getChannelData(0), yL=e.outputBuffer.getChannelData(0);
      const xR=e.inputBuffer.numberOfChannels>1?e.inputBuffer.getChannelData(1):xL;
      const yR=e.outputBuffer.numberOfChannels>1?e.outputBuffer.getChannelData(1):yL;
      const levels=(1<<bits), inv=1/(levels-1);
      for(let i=0;i<n;i++){
        if(step===0){
          holdL=((Math.round((xL[i]*0.5+0.5)*(levels-1))*inv)-0.5)*2;
          holdR=((Math.round((xR[i]*0.5+0.5)*(levels-1))*inv)-0.5)*2;
          step=1;
        }
        yL[i]=holdL; yR[i]=holdR; step--;
      }
    };
    return { input:d.input, output:d.output, set:(k,v)=>{ if(k==='bits') bits=v|0; if(k==='mix'){ d.wet.gain.value=v; d.dry.gain.value=1-v; } } };
  }
});

// 13) Downsampler
register({
  id:'downsampler', name:'Downsampler',
  params:[{key:'factor',label:'Factor',min:1,max:100,step:1,default:8},{key:'mix',label:'Mix',min:0,max:1,step:0.001,default:1}],
  create(ctx){
    const proc = ctx.createScriptProcessor(256, 2, 2);
    const d = makeDryWet(ctx, proc);
    let step=8, holdL=0, holdR=0, c=0;
    proc.onaudioprocess = (e)=>{
      const n=e.inputBuffer.length;
      const xL=e.inputBuffer.getChannelData(0), yL=e.outputBuffer.getChannelData(0);
      const xR=e.inputBuffer.numberOfChannels>1?e.inputBuffer.getChannelData(1):xL;
      const yR=e.outputBuffer.numberOfChannels>1?e.outputBuffer.getChannelData(1):yL;
      for(let i=0;i<n;i++){
        if(c===0){ holdL = xL[i]; holdR = xR[i]; }
        yL[i]=holdL; yR[i]=holdR; c=(c+1)%step;
      }
    };
    return { input:d.input, output:d.output, set:(k,v)=>{ if(k==='factor') step=Math.max(1, v|0); if(k==='mix'){ d.wet.gain.value=v; d.dry.gain.value=1-v; } } };
  }
});

// 14) Lo-Fi (Bit depth + SR downsample)
register({
  id:'lofi', name:'Lo-Fi',
  params:[{key:'bits',label:'Bits',min:2,max:12,step:1,default:8},{key:'factor',label:'SR Factor',min:1,max:40,step:1,default:6},{key:'mix',label:'Mix',min:0,max:1,step:0.001,default:1}],
  create(ctx){
    // cascade downsampler then bitcrusher for extra nastiness
    const proc = ctx.createScriptProcessor(512, 2, 2);
    const d = makeDryWet(ctx, proc);
    let bits=8, fac=6, holdL=0, holdR=0, c=0;
    proc.onaudioprocess = (e)=>{
      const n=e.inputBuffer.length;
      const xL=e.inputBuffer.getChannelData(0), yL=e.outputBuffer.getChannelData(0);
      const xR=e.inputBuffer.numberOfChannels>1?e.inputBuffer.getChannelData(1):xL;
      const yR=e.outputBuffer.numberOfChannels>1?e.outputBuffer.getChannelData(1):yL;
      const levels=(1<<bits), inv=1/(levels-1);
      for(let i=0;i<n;i++){
        if(c===0){ holdL=xL[i]; holdR=xR[i]; }
        let l=holdL, r=holdR;
        // quantize
        l=((Math.round((l*0.5+0.5)*(levels-1))*inv)-0.5)*2;
        r=((Math.round((r*0.5+0.5)*(levels-1))*inv)-0.5)*2;
        yL[i]=l; yR[i]=r; c=(c+1)%fac;
      }
    };
    return { input:d.input, output:d.output, set:(k,v)=>{ if(k==='bits') bits=v|0; if(k==='factor') fac=Math.max(1,v|0); if(k==='mix'){ d.wet.gain.value=v; d.dry.gain.value=1-v; } } };
  }
});

/* ---------- FILTERS & EQ (18) ---------- */

function biquadEffect(name,type,defaults){
  register({
    id:`${type}_${name}`.replace(/\s+/g,'').toLowerCase(),
    name,
    params:[
      {key:'freq',label:'Freq (Hz)',min:20,max:20000,step:1,default:defaults.freq},
      {key:'Q',label:'Q',min:0.0001,max:40,step:0.0001,default:defaults.Q},
      ...(type==='lowshelf'||type==='highshelf'||type==='peaking' ? [{key:'gain',label:'Gain (dB)',min:-36,max:36,step:0.1,default:defaults.gain}] : []),
    ],
    create(ctx){
      const biq=ctx.createBiquadFilter(); biq.type=type;
      return { input:biq, output:biq, set:(k,v)=>{ if(k==='freq') biq.frequency.value=v; if(k==='Q') biq.Q.value=v; if(k==='gain' && biq.gain) biq.gain.value=v; } };
    }
  });
}
biquadEffect('Low-Pass','lowpass',{freq:18000,Q:0.707});
biquadEffect('High-Pass','highpass',{freq:40,Q:0.707});
biquadEffect('Band-Pass','bandpass',{freq:1000,Q:1});
biquadEffect('Notch','notch',{freq:1000,Q:1});
biquadEffect('Peaking EQ','peaking',{freq:1000,Q:1,gain:0});
biquadEffect('Low Shelf','lowshelf',{freq:120,Q:0.707,gain:6});
biquadEffect('High Shelf','highshelf',{freq:6000,Q:0.707,gain:6});

// Tilt EQ
register({
  id:'tilt', name:'Tilt EQ',
  params:[{key:'pivot',label:'Pivot (Hz)',min:100,max:8000,step:1,default:1000},{key:'tilt',label:'Tilt (dB)',min:-24,max:24,step:0.1,default:0}],
  create(ctx){
    const low=ctx.createBiquadFilter(); low.type='lowshelf';
    const high=ctx.createBiquadFilter(); high.type='highshelf';
    low.connect(high);
    return { input:low, output:high, set:(k,v)=>{ if(k==='pivot'){ low.frequency.value=v; high.frequency.value=v; } if(k==='tilt'){ low.gain.value=v; high.gain.value=-v; } } };
  }
});

// Graphic EQ (10-band)
register({
  id:'eq10', name:'Graphic EQ (10-band)',
  params:[
    {key:'b31',label:'31Hz',min:-24,max:24,step:0.1,default:0},
    {key:'b62',label:'62Hz',min:-24,max:24,step:0.1,default:0},
    {key:'b125',label:'125Hz',min:-24,max:24,step:0.1,default:0},
    {key:'b250',label:'250Hz',min:-24,max:24,step:0.1,default:0},
    {key:'b500',label:'500Hz',min:-24,max:24,step:0.1,default:0},
    {key:'b1k',label:'1k',min:-24,max:24,step:0.1,default:0},
    {key:'b2k',label:'2k',min:-24,max:24,step:0.1,default:0},
    {key:'b4k',label:'4k',min:-24,max:24,step:0.1,default:0},
    {key:'b8k',label:'8k',min:-24,max:24,step:0.1,default:0},
    {key:'b16k',label:'16k',min:-24,max:24,step:0.1,default:0},
  ],
  create(ctx){
    const freqs=[31,62,125,250,500,1000,2000,4000,8000,16000];
    const filters=freqs.map(f=>{const biq=ctx.createBiquadFilter(); biq.type='peaking'; biq.frequency.value=f; biq.Q.value=1; return biq;});
    for(let i=0;i<filters.length-1;i++) filters[i].connect(filters[i+1]);
    const keys=['b31','b62','b125','b250','b500','b1k','b2k','b4k','b8k','b16k'];
    return { input:filters[0], output:filters[filters.length-1], set:(k,v)=>{ const idx=keys.indexOf(k); if(idx>=0) filters[idx].gain.value=v; } };
  }
});

// 24 dB/Oct LPF and HPF (cascade)
register({
  id:'lp24', name:'Low-Pass 24dB',
  params:[{key:'freq',label:'Cutoff (Hz)',min:40,max:20000,step:1,default:8000}],
  create(ctx){
    const a=ctx.createBiquadFilter(), b=ctx.createBiquadFilter(); a.type='lowpass'; b.type='lowpass'; a.connect(b);
    return { input:a, output:b, set:(k,v)=>{ if(k==='freq'){ a.frequency.value=v; b.frequency.value=v; } } };
  }
});
register({
  id:'hp24', name:'High-Pass 24dB',
  params:[{key:'freq',label:'Cutoff (Hz)',min:20,max:2000,step:1,default:120}],
  create(ctx){
    const a=ctx.createBiquadFilter(), b=ctx.createBiquadFilter(); a.type='highpass'; b.type='highpass'; a.connect(b);
    return { input:a, output:b, set:(k,v)=>{ if(k==='freq'){ a.frequency.value=v; b.frequency.value=v; } } };
  }
});

// Comb filter (delay feedback)
register({
  id:'comb', name:'Comb Filter',
  params:[{key:'time',label:'Time (ms)',min:1,max:50,step:0.1,default:12},{key:'fb',label:'Feedback',min:0,max:0.98,step:0.001,default:0.5}],
  create(ctx){
    const d=ctx.createDelay(0.1), fb=ctx.createGain(); d.connect(fb); fb.connect(d);
    return { input:d, output:d, set:(k,v)=>{ if(k==='time') d.delayTime.value=v/1000; if(k==='fb') fb.gain.value=v; } };
  }
});

// Formant (vowel morph)
register({
  id:'formant', name:'Formant (Vowel)',
  params:[{key:'vowel',label:'Vowel (0=A 1=E 2=I 3=O 4=U)',min:0,max:4,step:1,default:0},{key:'Q',label:'Q',min:1,max:20,step:0.1,default:8},{key:'mix',label:'Mix',min:0,max:1,step:0.001,default:1}],
  create(ctx){
    const sets=[ // F1,F2,F3 approx
      [800,1150,2900], // A
      [400,1600,2700], // E
      [350,1700,2700], // I
      [450, 800,2830], // O
      [325, 700,2530]  // U
    ];
    const b1=ctx.createBiquadFilter(), b2=ctx.createBiquadFilter(), b3=ctx.createBiquadFilter();
    [b1,b2,b3].forEach(b=>{b.type='bandpass'; b.Q.value=8;});
    const sum=ctx.createGain(); b1.connect(sum); b2.connect(sum); b3.connect(sum);
    const d=makeDryWet(ctx, sum);
    function setVowel(i){ const s=sets[i|0]; b1.frequency.value=s[0]; b2.frequency.value=s[1]; b3.frequency.value=s[2]; }
    setVowel(0);
    return { input:d.input, output:d.output, set:(k,v)=>{ if(k==='vowel') setVowel(v); if(k==='Q'){ b1.Q.value=v; b2.Q.value=v; b3.Q.value=v; } if(k==='mix'){ d.wet.gain.value=v; d.dry.gain.value=1-v; } } };
  }
});

// DC Cut
register({
  id:'dccut', name:'DC Cut',
  params:[{key:'freq',label:'HPF (Hz)',min:5,max:60,step:1,default:20}],
  create(ctx){ const f=ctx.createBiquadFilter(); f.type='highpass'; f.frequency.value=20; return { input:f, output:f, set:(k,v)=>{ if(k==='freq') f.frequency.value=v; } }; }
});

// Presence
register({
  id:'presence', name:'Presence Boost',
  params:[{key:'gain',label:'Gain (dB)',min:-24,max:24,step:0.1,default:4}],
  create(ctx){ const p=ctx.createBiquadFilter(); p.type='peaking'; p.frequency.value=3000; p.Q.value=1; return { input:p, output:p, set:(k,v)=>{ if(k==='gain') p.gain.value=v; } }; }
});

// Sub Boost
register({
  id:'subboost', name:'Sub Boost',
  params:[{key:'gain',label:'Gain (dB)',min:-24,max:24,step:0.1,default:6}],
  create(ctx){ const s=ctx.createBiquadFilter(); s.type='lowshelf'; s.frequency.value=60; return { input:s, output:s, set:(k,v)=>{ if(k==='gain') s.gain.value=v; } }; }
});

// Air Boost
register({
  id:'air', name:'Air Boost',
  params:[{key:'gain',label:'Gain (dB)',min:-24,max:24,step:0.1,default:6}],
  create(ctx){ const h=ctx.createBiquadFilter(); h.type='highshelf'; h.frequency.value=12000; return { input:h, output:h, set:(k,v)=>{ if(k==='gain') h.gain.value=v; } }; }
});

// Telephone
register({
  id:'telephone', name:'Telephone',
  params:[{key:'mix',label:'Mix',min:0,max:1,step:0.001,default:1}],
  create(ctx){
    const hp=ctx.createBiquadFilter(), lp=ctx.createBiquadFilter(); hp.type='highpass'; lp.type='lowpass';
    hp.frequency.value=800; lp.frequency.value=3500; hp.connect(lp);
    const d=makeDryWet(ctx, lp);
    return { input:d.input, output:d.output, set:(k,v)=>{ if(k==='mix'){ d.wet.gain.value=v; d.dry.gain.value=1-v; } } };
  }
});

/* ---------- DYNAMICS (5) ---------- */

// Compressor
register({
  id:'compressor', name:'Compressor',
  params:[{key:'th',label:'Threshold (dB)',min:-100,max:0,step:0.1,default:-24},{key:'ratio',label:'Ratio',min:1,max:20,step:0.1,default:4},{key:'atk',label:'Attack (s)',min:0.001,max:1,step:0.001,default:0.01},{key:'rel',label:'Release (s)',min:0.005,max:2,step:0.001,default:0.2},{key:'knee',label:'Knee',min:0,max:40,step:0.1,default:30}],
  create(ctx){
    const n=ctx.createDynamicsCompressor();
    return { input:n, output:n, set:(k,v)=>{ if(k==='th') n.threshold.value=v; if(k==='ratio') n.ratio.value=v; if(k==='atk') n.attack.value=v; if(k==='rel') n.release.value=v; if(k==='knee') n.knee.value=v; } };
  }
});

// Limiter
register({
  id:'limiter', name:'Limiter',
  params:[{key:'th',label:'Threshold (dB)',min:-60,max:-1,step:0.1,default:-6}],
  create(ctx){ const n=ctx.createDynamicsCompressor(); n.knee.value=0; n.ratio.value=20; n.attack.value=0.003; n.release.value=0.05; n.threshold.value=-6; return { input:n, output:n, set:(k,v)=>{ if(k==='th') n.threshold.value=v; } }; }
});

// Noise Gate (simplified)
register({
  id:'gate', name:'Noise Gate',
  params:[{key:'th',label:'Threshold (dB)',min:-100,max:0,step:1,default:-50}],
  create(ctx){
    const inp=ctx.createGain(), out=ctx.createGain(), ana=ctx.createAnalyser(); ana.fftSize=1024;
    inp.connect(ana); inp.connect(out);
    let th=-50;
    (function tick(){
      const data=new Uint8Array(ana.fftSize/2); ana.getByteTimeDomainData(data);
      let rms=0; for(let i=0;i<data.length;i++){ const v=(data[i]-128)/128; rms+=v*v; }
      rms=Math.sqrt(rms/data.length); const db=20*Math.log10(rms+1e-6);
      out.gain.value = db < th ? 0 : 1;
      requestAnimationFrame(tick);
    })();
    return { input:inp, output:out, set:(k,v)=>{ if(k==='th') th=v; } };
  }
});

// Parallel Compressor (NY)
register({
  id:'paracomp', name:'Parallel Compressor',
  params:[{key:'mix',label:'Mix',min:0,max:1,step:0.001,default:0.5},{key:'th',label:'Threshold',min:-80,max:-10,step:1,default:-35}],
  create(ctx){
    const comp=ctx.createDynamicsCompressor(); comp.ratio.value=6; comp.attack.value=0.005; comp.release.value=0.1; comp.threshold.value=-35;
    const d=makeDryWet(ctx, comp);
    return { input:d.input, output:d.output, set:(k,v)=>{ if(k==='mix'){ d.wet.gain.value=v; d.dry.gain.value=1-v; } if(k==='th') comp.threshold.value=v; } };
  }
});

// De-esser (band compressor)
register({
  id:'deesser', name:'De-Esser',
  params:[{key:'freq',label:'Center (Hz)',min:2000,max:12000,step:1,default:6000},{key:'Q',label:'Q',min:0.1,max:10,step:0.01,default:4},{key:'th',label:'Thresh (dB)',min:-80,max:0,step:0.1,default:-30}],
  create(ctx){
    const band=ctx.createBiquadFilter(); band.type='bandpass'; band.frequency.value=6000; band.Q.value=4;
    const comp=ctx.createDynamicsCompressor(); comp.ratio.value=8; comp.knee.value=0; comp.attack.value=0.002; comp.release.value=0.08; comp.threshold.value=-30;
    const wet=ctx.createGain(), out=ctx.createGain(), tap=ctx.createGain();
    band.connect(comp); comp.connect(wet);
    wet.connect(out); tap.connect(out);
    return { input:(function(){ tap.connect(band); return tap; })(), output:out, set:(k,v)=>{ if(k==='freq') band.frequency.value=v; if(k==='Q') band.Q.value=v; if(k==='th') comp.threshold.value=v; } };
  }
});

/* ---------- TIME / SPACE (9) ---------- */

// Delay
register({
  id:'delay', name:'Delay',
  params:[{key:'time',label:'Time (s)',min:0,max:3,step:0.001,default:0.35},{key:'fb',label:'Feedback',min:0,max:0.99,step:0.001,default:0.35},{key:'mix',label:'Mix',min:0,max:1,step:0.001,default:0.35}],
  create(ctx){
    const d=ctx.createDelay(5), fb=ctx.createGain(); d.connect(fb); fb.connect(d);
    const m=makeDryWet(ctx, d);
    return { input:m.input, output:m.output, set:(k,v)=>{ if(k==='time') d.delayTime.value=v; if(k==='fb') fb.gain.value=v; if(k==='mix'){ m.wet.gain.value=v; m.dry.gain.value=1-v; } } };
  }
});

// Ping-Pong Delay
register({
  id:'pingpong', name:'Ping-Pong Delay',
  params:[{key:'time',label:'Time (s)',min:0,max:2,step:0.001,default:0.28},{key:'fb',label:'Feedback',min:0,max:0.98,step:0.001,default:0.5},{key:'mix',label:'Mix',min:0,max:1,step:0.001,default:0.4}],
  create(ctx){
    const dl=ctx.createDelay(3), dr=ctx.createDelay(3), fb=ctx.createGain(), cs=ctx.createChannelSplitter(2), m=ctx.createChannelMerger(2);
    const x=makeDryWet(ctx, m);
    x.input.connect(cs);
    cs.connect(dl,0); cs.connect(dr,1);
    dl.connect(m,0,1); dr.connect(m,0,0);
    m.connect(fb); fb.connect(m);
    return { input:x.input, output:x.output, set:(k,v)=>{ if(k==='time'){ dl.delayTime.value=v; dr.delayTime.value=v; } if(k==='fb') fb.gain.value=v; if(k==='mix'){ x.wet.gain.value=v; x.dry.gain.value=1-v; } } };
  }
});

// Tape Delay (Wow/Flutter)
register({
  id:'tape', name:'Tape Delay',
  params:[{key:'time',label:'Time (s)',min:0,max:2,step:0.001,default:0.45},{key:'wow',label:'Wow',min:0,max:0.02,step:0.0001,default:0.002},{key:'flutter',label:'Flutter',min:0,max:0.01,step:0.0001,default:0.001},{key:'fb',label:'Feedback',min:0,max:0.98,step:0.001,default:0.4},{key:'mix',label:'Mix',min:0,max:1,step:0.001,default:0.35}],
  create(ctx){
    const d=ctx.createDelay(5), fb=ctx.createGain(); d.connect(fb); fb.connect(d);
    const m=makeDryWet(ctx, d);
    const lfo1=ctx.createOscillator(), lfo2=ctx.createOscillator(), g1=ctx.createGain(), g2=ctx.createGain();
    lfo1.frequency.value=0.3; lfo2.frequency.value=6; g1.gain.value=0.002; g2.gain.value=0.001;
    lfo1.connect(g1); lfo2.connect(g2); g1.connect(d.delayTime); g2.connect(d.delayTime); lfo1.start(); lfo2.start();
    return { input:m.input, output:m.output, set:(k,v)=>{ if(k==='time') d.delayTime.value=v; if(k==='wow') g1.gain.value=v; if(k==='flutter') g2.gain.value=v; if(k==='fb') fb.gain.value=v; if(k==='mix'){ m.wet.gain.value=v; m.dry.gain.value=1-v; } } };
  }
});

// Multi-Tap Delay (2 taps)
register({
  id:'multitap', name:'Multi-Tap Delay',
  params:[{key:'t1',label:'Tap1 (ms)',min:10,max:800,step:1,default:220},{key:'t2',label:'Tap2 (ms)',min:10,max:800,step:1,default:440},{key:'mix',label:'Mix',min:0,max:1,step:0.001,default:0.4}],
  create(ctx){
    const d1=ctx.createDelay(1), d2=ctx.createDelay(1), mix=ctx.createGain();
    d1.delayTime.value=0.22; d2.delayTime.value=0.44;
    const input=ctx.createGain(), out=ctx.createGain(); input.connect(d1); input.connect(d2); d1.connect(mix); d2.connect(mix); mix.connect(out); input.connect(out);
    return { input, output:out, set:(k,v)=>{ if(k==='t1') d1.delayTime.value=v/1000; if(k==='t2') d2.delayTime.value=v/1000; if(k==='mix') mix.gain.value=v; } };
  }
});

// Reverb (generated IR)
register({
  id:'reverb', name:'Reverb (Generated IR)',
  params:[{key:'time',label:'Length (s)',min:0.1,max:20,step:0.1,default:3},{key:'decay',label:'Decay',min:0.1,max:10,step:0.1,default:2},{key:'mix',label:'Mix',min:0,max:1,step:0.001,default:0.35}],
  create(ctx){
    const conv=ctx.createConvolver(), m=makeDryWet(ctx, conv);
    function buildIR(len=3,dec=2){
      const sr=ctx.sampleRate, L=Math.max(1, (sr*len)|0), b=ctx.createBuffer(2,L,sr);
      for(let c=0;c<2;c++){ const d=b.getChannelData(c); for(let i=0;i<L;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/L,dec); }
      conv.buffer=b;
    }
    buildIR(3,2);
    return { input:m.input, output:m.output, set:(k,v)=>{ if(k==='time'||k==='decay') buildIR(k==='time'?v:undefined, k==='decay'?v:undefined); if(k==='mix'){ m.wet.gain.value=v; m.dry.gain.value=1-v; } } };
  }
});

// Shimmer Reverb (simple)
register({
  id:'shimmer', name:'Shimmer Reverb',
  params:[{key:'fb',label:'Feedback',min:0,max:0.98,step:0.001,default:0.6},{key:'mix',label:'Mix',min:0,max:1,step:0.001,default:0.5}],
  create(ctx){
    const conv=ctx.createConvolver(), d=ctx.createDelay(1), fb=ctx.createGain(), m=makeDryWet(ctx, d);
    const sr=ctx.sampleRate, L=sr*2|0, b=ctx.createBuffer(2,L,sr);
    for(let c=0;c<2;c++){ const data=b.getChannelData(c); for(let i=0;i<L;i++) data[i]=(Math.random()*2-1)*Math.pow(1-i/L,3); }
    conv.buffer=b; d.delayTime.value=0.03; d.connect(conv); conv.connect(fb); fb.connect(d);
    return { input:m.input, output:m.output, set:(k,v)=>{ if(k==='fb') fb.gain.value=v; if(k==='mix'){ m.wet.gain.value=v; m.dry.gain.value=1-v; } } };
  }
});

// Gated Reverb
register({
  id:'gatedrev', name:'Gated Reverb',
  params:[{key:'gate',label:'Gate (0..1)',min:0,max:1,step:0.001,default:0.5},{key:'mix',label:'Mix',min:0,max:1,step:0.001,default:0.5}],
  create(ctx){
    const conv=ctx.createConvolver(), g=ctx.createGain(), m=makeDryWet(ctx, g);
    // short IR
    const sr=ctx.sampleRate, L=sr*1|0, b=ctx.createBuffer(2,L,sr);
    for(let c=0;c<2;c++){ const data=b.getChannelData(c); for(let i=0;i<L;i++) data[i]=(Math.random()*2-1)*Math.pow(1-i/L,2.5); }
    conv.buffer=b; conv.connect(g);
    return { input:m.input, output:m.output, set:(k,v)=>{ if(k==='gate') g.gain.value=v; if(k==='mix'){ m.wet.gain.value=v; m.dry.gain.value=1-v; } } };
  }
});

// Freeze (near-infinite delay)
register({
  id:'freeze', name:'Freeze',
  params:[{key:'hold',label:'Hold (0..1)',min:0,max:1,step:0.001,default:0.95},{key:'mix',label:'Mix',min:0,max:1,step:0.001,default:0.5}],
  create(ctx){
    const d=ctx.createDelay(5), fb=ctx.createGain(), m=makeDryWet(ctx, d); d.connect(fb); fb.connect(d);
    fb.gain.value=0.95;
    return { input:m.input, output:m.output, set:(k,v)=>{ if(k==='hold') fb.gain.value=v; if(k==='mix'){ m.wet.gain.value=v; m.dry.gain.value=1-v; } } };
  }
});

// Slapback
register({
  id:'slap', name:'Slapback Delay',
  params:[{key:'time',label:'Time (ms)',min:40,max:200,step:1,default:110},{key:'mix',label:'Mix',min:0,max:1,step:0.001,default:0.35}],
  create(ctx){
    const d=ctx.createDelay(0.5), m=makeDryWet(ctx, d); d.delayTime.value=0.11;
    return { input:m.input, output:m.output, set:(k,v)=>{ if(k==='time') d.delayTime.value=v/1000; if(k==='mix'){ m.wet.gain.value=v; m.dry.gain.value=1-v; } } };
  }
});

/* ---------- MODULATION (10) ---------- */

// Tremolo
register({
  id:'trem', name:'Tremolo',
  params:[{key:'rate',label:'Rate (Hz)',min:0.1,max:40,step:0.1,default:5},{key:'depth',label:'Depth',min:0,max:1,step:0.001,default:0.7}],
  create(ctx){ const g=ctx.createGain(), lfo=ctx.createOscillator(), d=ctx.createGain(); d.gain.value=0.7; lfo.frequency.value=5; lfo.connect(d); d.connect(g.gain); lfo.start(); return {input:g,output:g,set:(k,v)=>{ if(k==='rate') lfo.frequency.value=v; if(k==='depth') d.gain.value=v; }}; }
});

// Square Tremolo
register({
  id:'tremSquare', name:'Tremolo (Square)',
  params:[{key:'rate',label:'Rate (Hz)',min:0.1,max:40,step:0.1,default:6},{key:'depth',label:'Depth',min:0,max:1,step:0.001,default:1}],
  create(ctx){ const g=ctx.createGain(), lfo=ctx.createOscillator(), sh=ctx.createWaveShaper(); lfo.type='sine'; sh.curve=waveCurve(x=>x<0?-1:1); const d=ctx.createGain(); d.gain.value=1; lfo.connect(sh); sh.connect(d); d.connect(g.gain); lfo.start(); return {input:g,output:g,set:(k,v)=>{ if(k==='rate') lfo.frequency.value=v; if(k==='depth') d.gain.value=v; }}; }
});

// Auto-Pan
register({
  id:'autopan', name:'Auto-Pan',
  params:[{key:'rate',label:'Rate (Hz)',min:0.01,max:10,step:0.01,default:0.5},{key:'depth',label:'Depth',min:0,max:1,step:0.001,default:1}],
  create(ctx){
    const p = makeStereoPannerSafe(ctx);
    const lfo=ctx.createOscillator(), g=ctx.createGain(); g.gain.value=1; lfo.frequency.value=0.5; lfo.connect(g);
    if (p.pan && p.pan instanceof AudioParam) { g.connect(p.pan); }
    else { // fallback update loop
      const tmp=ctx.createGain(); g.connect(tmp.gain);
      (function tick(){ const v=tmp.gain.value*2-1; p.setPan?.(clamp(v,-1,1)); requestAnimationFrame(tick); })();
    }
    lfo.start();
    return { input:p.input||p, output:p.output||p, set:(k,v)=>{ if(k==='rate') lfo.frequency.value=v; if(k==='depth') g.gain.value=v; } };
  }
});

// Vibrato
register({
  id:'vibrato', name:'Vibrato',
  params:[{key:'rate',label:'Rate (Hz)',min:0.1,max:12,step:0.1,default:5},{key:'depth',label:'Depth (ms)',min:0,max:30,step:0.1,default:6}],
  create(ctx){ const d=ctx.createDelay(0.05), lfo=ctx.createOscillator(), g=ctx.createGain(); g.gain.value=0.006; lfo.frequency.value=5; lfo.connect(g); g.connect(d.delayTime); lfo.start(); return { input:d, output:d, set:(k,v)=>{ if(k==='rate') lfo.frequency.value=v; if(k==='depth') g.gain.value=v/1000; } }; }
});

// Chorus
register({
  id:'chorus', name:'Chorus',
  params:[{key:'rate',label:'Rate (Hz)',min:0.1,max:8,step:0.1,default:1.6},{key:'depth',label:'Depth (ms)',min:0,max:25,step:0.1,default:8},{key:'mix',label:'Mix',min:0,max:1,step:0.001,default:0.5}],
  create(ctx){ const d=ctx.createDelay(0.05), m=makeDryWet(ctx, d), lfo=ctx.createOscillator(), g=ctx.createGain(); g.gain.value=0.008; lfo.frequency.value=1.6; lfo.connect(g); g.connect(d.delayTime); lfo.start(); return {input:m.input, output:m.output, set:(k,v)=>{ if(k==='rate') lfo.frequency.value=v; if(k==='depth') g.gain.value=v/1000; if(k==='mix'){ m.wet.gain.value=v; m.dry.gain.value=1-v; } }}; }
});

// Flanger
register({
  id:'flanger', name:'Flanger',
  params:[{key:'rate',label:'Rate (Hz)',min:0.01,max:8,step:0.01,default:0.25},{key:'depth',label:'Depth (ms)',min:0,max:5,step:0.01,default:1.2},{key:'fb',label:'Feedback',min:-0.99,max:0.99,step:0.001,default:0.5},{key:'mix',label:'Mix',min:0,max:1,step:0.001,default:0.5}],
  create(ctx){ const d=ctx.createDelay(0.03), fb=ctx.createGain(); d.connect(fb); fb.connect(d); const m=makeDryWet(ctx, d), lfo=ctx.createOscillator(), g=ctx.createGain(); g.gain.value=0.0012; lfo.frequency.value=0.25; lfo.connect(g); g.connect(d.delayTime); lfo.start(); return { input:m.input, output:m.output, set:(k,v)=>{ if(k==='rate') lfo.frequency.value=v; if(k==='depth') g.gain.value=v/1000; if(k==='fb') fb.gain.value=v; if(k==='mix'){ m.wet.gain.value=v; m.dry.gain.value=1-v; } } }; }
});

// Phaser (3-stage)
register({
  id:'phaser', name:'Phaser',
  params:[{key:'rate',label:'Rate (Hz)',min:0.01,max:4,step:0.01,default:0.3},{key:'depth',label:'Depth',min:0,max:1,step:0.001,default:0.7},{key:'mix',label:'Mix',min:0,max:1,step:0.001,default:0.5}],
  create(ctx){
    const ap1=ctx.createBiquadFilter(), ap2=ctx.createBiquadFilter(), ap3=ctx.createBiquadFilter(); [ap1,ap2,ap3].forEach(a=>{a.type='allpass'; a.frequency.value=500; a.Q.value=0.7;});
    ap1.connect(ap2); ap2.connect(ap3);
    const m=makeDryWet(ctx, ap1); ap3.connect(m.wet);
    const lfo=ctx.createOscillator(), g=ctx.createGain(); lfo.frequency.value=0.3; g.gain.value=500; lfo.connect(g); [ap1,ap2,ap3].forEach(a=>g.connect(a.frequency)); lfo.start();
    return { input:m.input, output:m.output, set:(k,v)=>{ if(k==='rate') lfo.frequency.value=v; if(k==='depth') g.gain.value=200+v*1000; if(k==='mix'){ m.wet.gain.value=v; m.dry.gain.value=1-v; } } };
  }
});

// Auto-Wah (BP center mod)
register({
  id:'autowah', name:'Auto-Wah',
  params:[{key:'rate',label:'Rate (Hz)',min:0.1,max:6,step:0.1,default:1.2},{key:'depth',label:'Depth (Hz)',min:100,max:3000,step:1,default:1200},{key:'base',label:'Base (Hz)',min:100,max:2000,step:1,default:400}],
  create(ctx){ const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.Q.value=6; const lfo=ctx.createOscillator(), g=ctx.createGain(); g.gain.value=1200; lfo.frequency.value=1.2; lfo.connect(g); g.connect(bp.frequency); return { input:bp, output:bp, set:(k,v)=>{ if(k==='rate') lfo.frequency.value=v, lfo.start?.(); if(k==='depth') g.gain.value=v; if(k==='base') bp.frequency.value=v; } }; }
});

// LFO Filter (LPF mod)
register({
  id:'lfoLP', name:'LFO Low-Pass',
  params:[{key:'rate',label:'Rate (Hz)',min:0.1,max:8,step:0.1,default:1},{key:'depth',label:'Depth (Hz)',min:100,max:8000,step:1,default:3000},{key:'base',label:'Base (Hz)',min:100,max:8000,step:1,default:800}],
  create(ctx){ const lp=ctx.createBiquadFilter(); lp.type='lowpass'; const lfo=ctx.createOscillator(), g=ctx.createGain(); lfo.frequency.value=1; g.gain.value=3000; lfo.connect(g); g.connect(lp.frequency); lfo.start(); lp.frequency.value=800; return { input:lp, output:lp, set:(k,v)=>{ if(k==='rate') lfo.frequency.value=v; if(k==='depth') g.gain.value=v; if(k==='base') lp.frequency.value=v; } }; }
});

// Rotary (pseudo Leslie)
register({
  id:'rotary', name:'Rotary Speaker (Pseudo)',
  params:[{key:'rate',label:'Rate (Hz)',min:0.1,max:8,step:0.1,default:1.2},{key:'depth',label:'Depth',min:0,max:1,step:0.001,default:0.8}],
  create(ctx){
    const p = makeStereoPannerSafe(ctx), d=ctx.createDelay(0.02), lfo=ctx.createOscillator(), g=ctx.createGain(), gd=ctx.createGain();
    g.gain.value=1; gd.gain.value=0.003; lfo.frequency.value=1.2; lfo.connect(g); g.connect(p.pan||gd.gain); gd.connect(d.delayTime); lfo.connect(gd);
    return { input:p.input||p, output:(function(){ (p.output||p).connect(d); d.connect(p.output||p); return p.output||p; })(), set:(k,v)=>{ if(k==='rate') lfo.frequency.value=v; if(k==='depth'){ g.gain.value=v; gd.gain.value=v*0.004; } } };
  }
});

/* ---------- STEREO / SPATIAL (6) ---------- */

// Stereo Widener (Mid/Side)
register({
  id:'widener', name:'Stereo Widener (M/S)',
  params:[{key:'width',label:'Width',min:0,max:2,step:0.001,default:1.3}],
  create(ctx){
    const split=ctx.createChannelSplitter(2), sum=ctx.createGain(), dif=ctx.createGain(), inv=ctx.createGain(); inv.gain.value=-1;
    split.connect(sum,0); split.connect(sum,1); sum.gain.value=0.5;
    split.connect(dif,0); split.connect(inv,1); inv.connect(dif); dif.gain.value=0.5;
    const outL=ctx.createGain(), outR=ctx.createGain(), invS=ctx.createGain(); invS.gain.value=-1;
    sum.connect(outL); dif.connect(outL);
    sum.connect(outR); dif.connect(invS); invS.connect(outR);
    const merge=ctx.createChannelMerger(2); outL.connect(merge,0,0); outR.connect(merge,0,1);
    return { input:split, output:merge, set:(k,v)=>{ if(k==='width') dif.gain.value=v; } };
  }
});

// Haas
register({
  id:'haas', name:'Haas (Stereo Offset)',
  params:[{key:'ms',label:'Offset (ms)',min:0,max:40,step:0.1,default:20}],
  create(ctx){ const split=ctx.createChannelSplitter(2), d=ctx.createDelay(0.05), merge=ctx.createChannelMerger(2); split.connect(merge,0,0); split.connect(d,1); d.connect(merge,0,1); return { input:split, output:merge, set:(k,v)=>{ if(k==='ms') d.delayTime.value=v/1000; } }; }
});

// Mono Maker (low-band mono)
register({
  id:'monomaker', name:'Mono Maker (Low band)',
  params:[{key:'cut',label:'Split Freq (Hz)',min:60,max:400,step:1,default:140}],
  create(ctx){
    const low=ctx.createBiquadFilter(); low.type='lowpass';
    const high=ctx.createBiquadFilter(); high.type='highpass';
    const splitter=ctx.createChannelSplitter(2), merge=ctx.createChannelMerger(2), mono=ctx.createGain();
    splitter.connect(low,0); splitter.connect(low,1);
    splitter.connect(high,0); splitter.connect(high,1);
    low.connect(mono); mono.connect(merge,0,0); mono.connect(merge,0,1);
    high.connect(merge,0,0); high.connect(merge,0,1);
    return { input:splitter, output:merge, set:(k,v)=>{ if(k==='cut'){ low.frequency.value=v; high.frequency.value=v; } } };
  }
});

// Stereo Imager (3-band)
register({
  id:'imager3', name:'Stereo Imager (3-band)',
  params:[{key:'lo',label:'Low Width',min:0,max:2,step:0.01,default:0.8},{key:'mid',label:'Mid Width',min:0,max:2,step:0.01,default:1.2},{key:'hi',label:'High Width',min:0,max:2,step:0.01,default:1.4}],
  create(ctx){
    function W(){ const s=ctx.createChannelSplitter(2), m=ctx.createGain(), sd=ctx.createGain(), merge=ctx.createChannelMerger(2), sum=ctx.createGain(), dif=ctx.createGain(), inv=ctx.createGain(); inv.gain.value=-1; s.connect(sum,0); s.connect(sum,1); sum.gain.value=0.5; s.connect(dif,0); s.connect(inv,1); inv.connect(dif); dif.gain.value=0.5; const outL=ctx.createGain(), outR=ctx.createGain(), invS=ctx.createGain(); invS.gain.value=-1; m.connect(outL); sd.connect(outL); m.connect(outR); sd.connect(invS); invS.connect(outR); outL.connect(merge,0,0); outR.connect(merge,0,1); return {input:s, output:merge, side:sd}; }
    const split=ctx.createBiquadFilter(); split.type='lowpass'; split.frequency.value=200;
    const hp=ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=200;
    const hp2=ctx.createBiquadFilter(); hp2.type='highpass'; hp2.frequency.value=2000;
    const LW=W(), MW=W(), HW=W();
    const sp=ctx.createChannelSplitter(2), merge=ctx.createChannelMerger(2);
    sp.connect(split,0); sp.connect(split,1); sp.connect(hp,0); sp.connect(hp,1); hp.connect(hp2);
    split.connect(LW.input);  LW.output.connect(merge,0,0); LW.output.connect(merge,0,1);
    hp.connect(MW.input);     MW.output.connect(merge,0,0); MW.output.connect(merge,0,1);
    hp2.connect(HW.input);    HW.output.connect(merge,0,0); HW.output.connect(merge,0,1);
    return { input:sp, output:merge, set:(k,v)=>{ if(k==='lo') LW.side.gain.value=v; if(k==='mid') MW.side.gain.value=v; if(k==='hi') HW.side.gain.value=v; } };
  }
});

// Stereo Flip (swap L/R)
register({
  id:'stereoflip', name:'Stereo Flip (Swap L/R)',
  params:[],
  create(ctx){ const s=ctx.createChannelSplitter(2), m=ctx.createChannelMerger(2); s.connect(m,0,1); s.connect(m,1,0); return { input:s, output:m, set:()=>{} }; }
});

// Channel Isolate
register({
  id:'channeliso', name:'Channel Isolate',
  params:[{key:'side',label:'-1=L 0=Mid 1=R',min:-1,max:1,step:1,default:0}],
  create(ctx){ const s=ctx.createChannelSplitter(2), gL=ctx.createGain(), gR=ctx.createGain(), m=ctx.createChannelMerger(2); s.connect(gL,0); s.connect(gR,1); function setSide(v){ if(v<0){ gR.gain.value=0; gL.connect(m,0,0); gL.connect(m,0,1); } else if(v>0){ gL.gain.value=0; gR.connect(m,0,0); gR.connect(m,0,1); } else { gL.connect(m,0,0); gR.connect(m,0,1); } } setSide(0); return { input:s, output:m, set:(k,v)=>{ if(k==='side'){ setSide(v|0); } } }; }
});

/* ---------- RING / AM (2) ---------- */

// Ring Mod
register({
  id:'ring', name:'Ring Modulator',
  params:[{key:'freq',label:'Freq (Hz)',min:0.1,max:2000,step:0.1,default:30},{key:'mix',label:'Mix',min:0,max:1,step:0.001,default:1}],
  create(ctx){ const g=ctx.createGain(), osc=ctx.createOscillator(), mod=ctx.createGain(); mod.gain.value=1; osc.connect(mod); mod.connect(g.gain); osc.frequency.value=30; osc.start(); const d=makeDryWet(ctx, g); return { input:d.input, output:d.output, set:(k,v)=>{ if(k==='freq') osc.frequency.value=v; if(k==='mix'){ d.wet.gain.value=v; d.dry.gain.value=1-v; } } }; }
});

// AM (audio-rate tremolo)
register({
  id:'am', name:'AM (Audio-rate Tremolo)',
  params:[{key:'freq',label:'Freq (Hz)',min:0.1,max:2000,step:0.1,default:440},{key:'depth',label:'Depth',min:0,max:1,step:0.001,default:0.7}],
  create(ctx){ const g=ctx.createGain(), osc=ctx.createOscillator(), depth=ctx.createGain(); depth.gain.value=0.7; osc.connect(depth); depth.connect(g.gain); osc.frequency.value=440; osc.start(); return { input:g, output:g, set:(k,v)=>{ if(k==='freq') osc.frequency.value=v; if(k==='depth') depth.gain.value=v; } }; }
});

/* ===== end of mega effects library ===== */
