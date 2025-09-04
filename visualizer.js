/* ========= Visualizer Suite =========
   Modes: bars, radial, wave, spec, vu
   Uses a single AnalyserNode fed by masterGain in main.js
===================================== */

function startVisualizer(analyser, viz){
  const canvas = document.getElementById('vizCanvas');
  const ctx2d = canvas.getContext('2d', { alpha: true });

  /* ---- DPI & resize ---- */
  function resize(){
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  /* ---- Buffers ---- */
  const freqBins = () => analyser.frequencyBinCount;
  const freqData = new Uint8Array(analyser.frequencyBinCount);
  const timeData = new Uint8Array(analyser.fftSize);
  // For spectrogram
  const specStrip = document.createElement('canvas');
  const specCtx = specStrip.getContext('2d');
  specStrip.width = 1;
  specStrip.height = 256;

  /* ---- Helpers ---- */
  function bassEnergy(){
    // Sum bins up to ~200 Hz
    analyser.getByteFrequencyData(freqData);
    const nyquist = analyser.context.sampleRate / 2;
    const cutoff = 200;
    const idxMax = Math.max(1, Math.min(freqData.length-1, Math.round(cutoff / nyquist * freqData.length)));
    let s = 0;
    for (let i=0; i<idxMax; i++) s += freqData[i];
    return s / (idxMax * 255); // 0..1
  }

  function bandsEnergy(){
    analyser.getByteFrequencyData(freqData);
    const nyq = analyser.context.sampleRate / 2;
    function bandSum(lo, hi){
      const i0 = Math.max(0, Math.floor(lo / nyq * freqData.length));
      const i1 = Math.min(freqData.length-1, Math.ceil(hi / nyq * freqData.length));
      let s=0; let n=0;
      for (let i=i0;i<=i1;i++){ s += freqData[i]; n++; }
      return n? (s/(n*255)) : 0;
    }
    return {
      bass: bandSum(20, 200),
      mid:  bandSum(200, 2000),
      tre:  bandSum(4000, 16000)
    };
  }

  /* ---- Drawing ---- */
  function drawBars(){
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx2d.clearRect(0,0,w,h);
    analyser.getByteFrequencyData(freqData);

    const bars = Math.min(96, freqBins());
    const step = Math.max(1, Math.floor(freqData.length / bars));
    const gap = 2;
    const barW = (w / bars) - gap;

    // subtle grid
    ctx2d.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx2d.lineWidth = 1;
    for (let gx=0; gx<w; gx+=Math.max(24, w/24)) { ctx2d.beginPath(); ctx2d.moveTo(gx, 0); ctx2d.lineTo(gx, h); ctx2d.stroke(); }
    for (let gy=h; gy>0; gy-=Math.max(16, h/16)) { ctx2d.beginPath(); ctx2d.moveTo(0, gy); ctx2d.lineTo(w, gy); ctx2d.stroke(); }

    ctx2d.shadowColor = 'rgba(229,9,20,0.35)';
    ctx2d.shadowBlur = 10;

    for (let i=0;i<bars;i++){
      const v = freqData[i*step] / 255;
      const bh = Math.pow(v, 0.85) * (h-8);
      const x = i * (barW + gap);
      const y = h - bh;
      // gradient
      const g = ctx2d.createLinearGradient(0, y, 0, h);
      g.addColorStop(0.0, '#ffffff');
      g.addColorStop(0.2, '#ff4d59');
      g.addColorStop(1.0, '#e50914');
      ctx2d.fillStyle = g;
      ctx2d.fillRect(x, y, barW, bh);
    }
    ctx2d.shadowBlur = 0;
  }

  function drawRadial(){
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx2d.clearRect(0,0,w,h);
    analyser.getByteFrequencyData(freqData);

    const cx = w/2, cy = h/2;
    const radius = Math.min(w, h) * 0.36;
    const bins = 180, step = Math.max(1, Math.floor(freqData.length / bins));
    const grad = ctx2d.createRadialGradient(cx, cy, radius*0.1, cx, cy, radius);
    grad.addColorStop(0.0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.4, 'rgba(255,77,89,0.85)');
    grad.addColorStop(1.0, 'rgba(229,9,20,0.15)');

    // ring
    ctx2d.beginPath();
    ctx2d.arc(cx, cy, radius, 0, Math.PI*2);
    ctx2d.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx2d.lineWidth = 2;
    ctx2d.stroke();

    // spokes
    ctx2d.save();
    ctx2d.translate(cx, cy);
    ctx2d.strokeStyle = grad;
    ctx2d.lineCap = 'round';
    ctx2d.shadowColor = 'rgba(229,9,20,0.35)';
    ctx2d.shadowBlur = 8;
    for (let i=0; i<bins; i++){
      const v = freqData[i*step] / 255;
      const len = radius * (0.25 + Math.pow(v, 0.9) * 0.9);
      const a = (i / bins) * Math.PI * 2;
      const x1 = Math.cos(a) * (radius * 0.72);
      const y1 = Math.sin(a) * (radius * 0.72);
      const x2 = Math.cos(a) * (radius * 0.72 + len);
      const y2 = Math.sin(a) * (radius * 0.72 + len);
      ctx2d.lineWidth = 2.2;
      ctx2d.beginPath();
      ctx2d.moveTo(x1, y1);
      ctx2d.lineTo(x2, y2);
      ctx2d.stroke();
    }
    ctx2d.restore();
    ctx2d.shadowBlur = 0;

    // center cap
    ctx2d.beginPath();
    ctx2d.arc(cx, cy, radius*0.16, 0, Math.PI*2);
    ctx2d.fillStyle = 'rgba(255,255,255,0.12)';
    ctx2d.fill();
  }

  function drawWave(){
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx2d.clearRect(0,0,w,h);
    analyser.getByteTimeDomainData(timeData);

    ctx2d.strokeStyle = '#e50914';
    ctx2d.lineWidth = 2;
    ctx2d.beginPath();
    for (let i=0; i<timeData.length; i++){
      const v = (timeData[i]-128)/128; // -1..1
      const x = i / (timeData.length-1) * w;
      const y = h/2 + v * (h*0.42);
      i ? ctx2d.lineTo(x,y) : ctx2d.moveTo(x,y);
    }
    ctx2d.stroke();

    // center line
    ctx2d.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    ctx2d.moveTo(0, h/2);
    ctx2d.lineTo(w, h/2);
    ctx2d.stroke();
  }

  function drawSpec(){
    const w = canvas.clientWidth, h = canvas.clientHeight;
    // Prepare a 1px vertical strip from current spectrum
    analyser.getByteFrequencyData(freqData);
    specStrip.height = 256;
    const rowH = specStrip.height;
    const strip = specCtx.createImageData(1, rowH);
    for (let y=0; y<rowH; y++){
      // map low->bottom
      const srcIdx = Math.min(freqData.length-1, Math.floor((1 - y/rowH) * (freqData.length-1)));
      const v = freqData[srcIdx] / 255; // 0..1
      // red colormap
      const r = Math.min(255, Math.floor(80 + v*255));
      const g = Math.floor(v*80);
      const b = Math.floor(v*60);
      const a = 255;
      const p = y*4;
      strip.data[p] = r; strip.data[p+1] = g; strip.data[p+2] = b; strip.data[p+3] = a;
    }
    specCtx.putImageData(strip, 0, 0);

    // Scroll canvas left by 1px and draw new strip at right
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const stepX = 1; // CSS pixels
    ctx2d.drawImage(canvas, -stepX, 0); // shift left
    // draw strip stretched to canvas height
    ctx2d.drawImage(specStrip, 0, 0, 1, rowH, w - stepX, 0, stepX, h);
  }

  // simple peak-hold helper
  const peaks = { bass: 0, mid: 0, tre: 0, t: 0 };
  function drawVU(){
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx2d.clearRect(0,0,w,h);
    const { bass, mid, tre } = bandsEnergy();

    // peak decay
    peaks.bass = Math.max(bass, peaks.bass - 0.008);
    peaks.mid  = Math.max(mid,  peaks.mid  - 0.008);
    peaks.tre  = Math.max(tre,  peaks.tre  - 0.008);

    const names = ['Bass', 'Mid', 'Treble'];
    const vals  = [bass, mid, tre];
    const pks   = [peaks.bass, peaks.mid, peaks.tre];

    const barW = Math.min(160, (w - 60) / 3);
    const gap = (w - barW*3) / 4;
    const baseY = h - 20;
    const maxH = h - 60;

    names.forEach((label, i)=>{
      const x = gap + i*(barW + gap);
      const v = vals[i];
      const pk = pks[i];

      // back rail
      ctx2d.fillStyle = '#151515';
      ctx2d.fillRect(x, baseY - maxH, barW, maxH);

      // bar
      const bh = Math.max(2, Math.pow(v, 0.85) * maxH);
      const y = baseY - bh;
      const g = ctx2d.createLinearGradient(0, y, 0, baseY);
      g.addColorStop(0.0, '#ffffff');
      g.addColorStop(0.2, '#ff4d59');
      g.addColorStop(1.0, '#e50914');
      ctx2d.fillStyle = g;
      ctx2d.shadowColor = 'rgba(229,9,20,0.35)';
      ctx2d.shadowBlur = 10;
      ctx2d.fillRect(x, y, barW, bh);
      ctx2d.shadowBlur = 0;

      // peak marker
      const ph = Math.max(2, Math.pow(pk, 0.85) * maxH);
      const py = baseY - ph;
      ctx2d.fillStyle = '#fff';
      ctx2d.fillRect(x, py-2, barW, 2);

      // label
      ctx2d.fillStyle = '#bbb';
      ctx2d.font = '12px system-ui, sans-serif';
      ctx2d.textAlign = 'center';
      ctx2d.fillText(label, x + barW/2, baseY + 14);
    });
  }

  /* ---- Main loop + mode switch ---- */
  function loop(){
    // bass-reactive glow class toggle
    const bass = bassEnergy();
    if (bass > 0.35) canvas.classList.add('bass-hot'); else canvas.classList.remove('bass-hot');

    switch(viz.mode){
      case 'radial': drawRadial(); break;
      case 'wave':   drawWave();   break;
      case 'spec':   drawSpec();   break;
      case 'vu':     drawVU();     break;
      default:       drawBars();   break;
    }
    requestAnimationFrame(loop);
  }
  loop();

  document.querySelectorAll('input[name="vizMode"]').forEach(r=>{
    r.addEventListener('change',()=>{ viz.mode = r.value; });
  });
}
