/* Does the map actually answer a hover? jsdom reports a zero-sized box for
   every element, so the harness supplies the rect the browser would: a 520x640
   figure at the origin, i.e. exactly the viewBox, which makes screen
   coordinates and viewBox units the same thing and the expected answer
   computable by hand. */
const { JSDOM, VirtualConsole } = require('jsdom');
const B = process.env.BASE || 'http://127.0.0.1:8000';
let pass=0,fail=0;
const ok=(c,w,x)=>{c?pass++:fail++;console.log((c?'  PASS  ':'  FAIL  ')+w+(x!==undefined&&!c?'  ['+x+']':''));};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const vc=new VirtualConsole(); const errs=[];
  vc.on('jsdomError',e=>errs.push(String(e.message).slice(0,200)));
  const dom=await JSDOM.fromURL(B+'/pages/irish-floods.html',
    {runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc});
  const w=dom.window,d=w.document;
  await sleep(2400);
  const svg=d.querySelector('#floods-dash svg.dash-map');
  const W=520,H=640;
  svg.getBoundingClientRect=()=>({left:0,top:0,width:W,height:H,right:W,bottom:H});

  // Reproduce the projection the map uses, so the expected point is derived
  // independently of the code under test.
  const pad=18,GX=[20,350],GY=[10,470];
  const iw=W-pad*2, ih=H-pad*2;
  const k=Math.min(iw/(GX[1]-GX[0]), ih/(GY[1]-GY[0]));
  const ox=pad+(iw-k*(GX[1]-GX[0]))/2, oy=pad+(ih-k*(GY[1]-GY[0]))/2;
  const X=v=>ox+(v-GX[0])*k;
  const Y=v=>oy+ih-(v-GY[0])*k-(ih-k*(GY[1]-GY[0]));

  const D=w.DIGIEIRE_FLOODS, P=D.points, L=D.lookups;
  const target=P[1234];
  const px=X(target[0]), py=Y(target[1]);
  // Whatever the map SHOULD report at that pixel: the nearest point, which may
  // not be `target` itself where records overlap.
  let bi=-1,bd=1e9;
  P.forEach((p,i)=>{const dx=X(p[0])-px,dy=Y(p[1])-py,dd=dx*dx+dy*dy;if(dd<bd){bd=dd;bi=i;}});
  const want=P[bi];

  const fire=(type,x,y)=>svg.dispatchEvent(new w.MouseEvent(type,
    {clientX:x,clientY:y,bubbles:true,cancelable:true}));

  fire('mousemove',px,py);
  const tip=d.querySelector('#floods-dash .dash-tip');
  ok(!tip.hidden,'tooltip appears on hover');
  ok(tip.querySelector('.tip-h').textContent===L.name[want[7]],
     'tooltip names the nearest record',tip.querySelector('.tip-h').textContent+' != '+L.name[want[7]]);
  const body=tip.textContent;
  ok(body.includes(L.source_type[want[3]]),'tooltip gives the flood source',body);
  ok(want[2]?body.includes(String(want[2])):/undated/.test(body),'tooltip gives the date',body);
  const cty=L.county[want[6]];
  ok(cty==='—'||body.includes(cty),'tooltip gives the county',body);

  const halo=d.querySelector('#floods-dash circle.dash-halo');
  ok(Math.abs(+halo.getAttribute('cx')-X(want[0]))<0.1 &&
     Math.abs(+halo.getAttribute('cy')-Y(want[1]))<0.1,'halo sits on that point',
     halo.getAttribute('cx')+','+halo.getAttribute('cy'));

  const lit=[...d.querySelectorAll('#floods-dash .dash-cty path.cty.on')];
  ok(lit.length===1 && lit[0].querySelector('title').textContent===cty,
     'its county is highlighted on the map',lit.map(p=>p.querySelector('title').textContent).join(','));
  const litRow=[...d.querySelectorAll('#floods-dash .dash-pair tbody tr.on')];
  ok(litRow.length===1 && litRow[0].textContent.indexOf(cty)===0,
     'and highlighted in the table',litRow.map(r=>r.textContent).join(','));

  // far from any record: nothing claimed
  fire('mousemove',5,5);
  ok(tip.hidden,'tooltip hides in empty sea');
  ok(d.querySelectorAll('#floods-dash .dash-cty path.cty.on').length===0,'highlight cleared');

  // the table drives the map in the other direction
  const rows=[...d.querySelectorAll('#floods-dash .dash-pair tbody tr.linkable')];
  const galway=rows.find(r=>r.textContent.indexOf('Galway County')===0);
  galway.dispatchEvent(new w.MouseEvent('mouseenter',{bubbles:false}));
  const lit2=[...d.querySelectorAll('#floods-dash .dash-cty path.cty.on')]
    .map(p=>p.querySelector('title').textContent);
  ok(lit2.length===1 && lit2[0]==='Galway County','hovering the table lights the map',lit2.join(','));
  galway.dispatchEvent(new w.MouseEvent('mouseleave',{bubbles:false}));
  ok(d.querySelectorAll('#floods-dash .dash-cty path.cty.on').length===0,'and releases it');

  ok(errs.length===0,'no JS errors',errs.join(' / '));
  console.log('\n  '+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})().catch(e=>{console.error('HARNESS',e);process.exit(2);});
