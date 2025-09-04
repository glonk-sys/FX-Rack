/* ====== Visualizer ====== */
function startVisualizer(analyser, viz){
  const canvas=document.getElementById('vizCanvas');
  const ctx2d=canvas.getContext('2d');
  function resize(){
    const dpr=window.devicePixelRatio||1;
    canvas.width=canvas.clientWidth*dpr;
    canvas.height=canvas.clientHeight*dpr;
    ctx2d.setTransform(dpr,0,0,dpr,0,0);
  }
  resize();window.addEventListener('resize',resize);
  const freqData=new Uint8Array(analyser.frequencyBinCount);

  function drawBars(){
    const w=canvas.clientWidth,h=canvas.clientHeight;
    ctx2d.clearRect(0,0,w,h);
    analyser.getByteFrequencyData(freqData);
    const bars=96,step=Math.floor(freqData.length/bars),gap=2,barW=(w/bars)-gap;
    ctx2d.fillStyle='#e50914';
    for(let i=0;i<bars;i++){
      const v=freqData[i*step]/255;
      const bh=Math.pow(v,0.8)*h;
      ctx2d.fillRect(i*(barW+gap),h-bh,barW,bh);
    }
  }
  function drawRadial(){
    const w=canvas.clientWidth,h=canvas.clientHeight,cx=w/2,cy=h/2;
    ctx2d.clearRect(0,0,w,h);
    analyser.getByteFrequencyData(freqData);
    const bins=180,step=Math.floor(freqData.length/bins),r=Math.min(w,h)/3;
    ctx2d.save();ctx2d.translate(cx,cy);
    ctx2d.strokeStyle='#e50914';ctx2d.lineCap='round';
    for(let i=0;i<bins;i++){
      const v=freqData[i*step]/255;
      const len=r*(0.25+v*0.75);
      const a=(i/bins)*Math.PI*2;
      ctx2d.beginPath();
      ctx2d.moveTo(Math.cos(a)*r*0.6,Math.sin(a)*r*0.6);
      ctx2d.lineTo(Math.cos(a)*(r*0.6+len),Math.sin(a)*(r*0.6+len));
      ctx2d.stroke();
    }
    ctx2d.restore();
  }
  function loop(){
    if(viz.mode==='radial')drawRadial();else drawBars();
    requestAnimationFrame(loop);
  }
  loop();
  document.querySelectorAll('input[name="vizMode"]').forEach(r=>{
    r.addEventListener('change',()=>{viz.mode=r.value;});
  });
}
