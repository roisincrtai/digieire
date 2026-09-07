const { JSDOM, VirtualConsole } = require('jsdom');
const B = (process.env.BASE || 'http://127.0.0.1:8000') + '/apps/analysis/index.html';
let pass=0, fail=0;
const ok=(c,w,x)=>{c?pass++:fail++;console.log((c?'  PASS  ':'  FAIL  ')+w+(x!==undefined&&!c?'  ['+JSON.stringify(x)+']':''));};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const errs=[]; const vc=new VirtualConsole();
  vc.on('jsdomError',e=>errs.push(String(e.message).slice(0,200)));
  vc.on('error',(...a)=>errs.push('console.error: '+a.map(String).join(' ').slice(0,200)));
  const dom=await JSDOM.fromURL(B,{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc,
    beforeParse(w){ w.fetch=(...a)=>fetch(...a); }});
  const w=dom.window,d=w.document;
  await sleep(2500);
  const tabs=[...d.querySelectorAll('#tabs .tab')].map(t=>t.textContent.trim());
  ok(tabs.length>=3,'tabs built',tabs);
  ok(!/Wellbeing analysis/.test(d.body.textContent),'old header title gone');
  ok(/Flood-Wellbeing Analysis/.test(d.querySelector('h1').textContent),'header is Flood-Wellbeing Analysis');
  var m=d.body.textContent.match(/.{0,60}mcl.{0,60}/);ok(!m,'dataset key dropped',m&&m[0]);
  ok(!/relevant posts/.test(d.body.textContent),'post count dropped');
  ok(!/Save as PDF|save as pdf/i.test(d.body.textContent),'PDF button dropped');
  ok(d.querySelector('#hdr-range') && d.querySelector('#hdr-range').textContent.trim().length>0,'date range shown',
     d.querySelector('#hdr-range')&&d.querySelector('#hdr-range').textContent);
  const st=d.querySelector('#status').textContent.trim();
  ok(st==='','status is clear at rest',st);
  ok(w.VIEWS.current()==='dashboard','dashboard is the landing view');
  d.querySelector('#tab-overall').click();
  await sleep(300);
  const svgs=d.querySelectorAll('svg.chart');
  ok(svgs.length>0,'charts drawn',svgs.length);
  const paths=d.querySelectorAll('svg.chart path');
  ok(paths.length>0,'chart paths present',paths.length);
  ok(!d.querySelector('#panels-fit'),'no fit frame in the static build');
  ok(w.getComputedStyle(d.querySelector('.tab')).whiteSpace==='nowrap','tabs are one line');
  ok(errs.length===0,'no JS errors',errs);
  console.log('\n  '+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})();
