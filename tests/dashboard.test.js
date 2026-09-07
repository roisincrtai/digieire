/* Integration and allocation invariants for the static dashboard. */
const { JSDOM, VirtualConsole } = require('jsdom');
const assert = require('node:assert/strict');
const base = process.env.BASE || 'http://127.0.0.1:8765';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const errors = [], vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e.message));
  // Follow the actual website links rather than assuming an app URL.
  const entries = ['index.html','pages/introduction.html','pages/project.html',
    'pages/data-source.html','pages/irish-floods.html','pages/climate-change.html','pages/about.html'];
  let dashboardURL;
  for (const page of entries) {
    const site = await JSDOM.fromURL(base + '/' + page);
    const link = site.window.document.querySelector('a.nav-cta');
    const url = new URL(link.href);
    assert.equal(url.searchParams.get('view'),'dashboard',page);
    assert.equal(url.pathname,'/apps/analysis/index.html',page);
    dashboardURL = url.href;
    site.window.close();
  }
  const dom = await JSDOM.fromURL(dashboardURL, {
    resources:'usable',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc
  });
  const w=dom.window,d=w.document;
  await new Promise((resolve,reject) => {
    if(d.readyState==='complete') return resolve();
    w.addEventListener('load',resolve,{once:true});
    w.addEventListener('error',e=>reject(e.error),{once:true});
  });
  await sleep(100);
  assert.equal(w.VIEWS.current(),'dashboard');
  assert.equal(d.querySelectorAll('.db-map-svg').length,2);
  assert.equal(d.querySelectorAll('.db-county-shape').length,52);
  assert.equal(d.querySelector('#db-year').textContent,'2015');
  assert.equal(d.querySelectorAll('.db-flood-dot').length,349);
  const D=w.STORE.data(), F=w.DIGIEIRE_FLOODS, P=w.DIGIEIRE_POPULATION;
  const series=w.COMPUTE.buildSeries(D,{period:'1y',window:'0',mode:'double',location:'all',weight_reactions:false,sensitivity:5});
  const m=w.DASHBOARD.makeModel(F,P,series);
  assert.equal(m.names.length,26);
  assert.equal(Object.values(P.population).reduce((a,b)=>a+b,0),5149139);
  const colMax=d.querySelector('#db-scale-max').textContent;
  for(const y of m.keys) {
    const row=m.years[y];
    assert.equal(row.total,F.points.filter(p=>p[2]===y).length);
    if(row.available) {
      assert.ok(Math.abs(Object.values(row.weights).reduce((a,b)=>a+b,0)-1)<1e-12);
      assert.ok(Math.abs(Object.values(row.allocation).reduce((a,b)=>a+b,0)-row.wellbeing)<1e-10);
      for(const b of Object.values(row.allocation)) assert.ok(b>=0 && b<=1 && b<=m.max);
    }
    d.querySelector('#db-slider').value=y;
    d.querySelector('#db-slider').dispatchEvent(new w.Event('input'));
    assert.equal(d.querySelector('#db-year').textContent,String(y));
    assert.equal(d.querySelectorAll('.db-flood-dot').length,row.total);
    assert.equal(d.querySelector('#db-scale-max').textContent,colMax);
    assert.ok([...d.querySelectorAll('.db-county-shape')].every(p=>p.getAttribute('aria-label').includes(String(y))));
  }
  // Missing data must not become a perfect wellbeing or zero-allocation observation.
  const emptyF={...F,points:[]};
  const empty=w.DASHBOARD.makeModel(emptyF,P,series);
  assert.ok(Object.values(empty.years).every(r=>!r.available && Object.values(r.allocation).every(b=>b===null)));
  const missingSeries=structuredClone(series);missingSeries.wellbeing.mean[0]=null;missingSeries.wellbeing.n[0]=0;
  const missing=w.DASHBOARD.makeModel(F,P,missingSeries);
  assert.equal(missing.years[m.keys[0]].available,false);
  // County selection mirrors across maps and survives timeline updates.
  const picker=d.querySelector('#db-county');picker.value='Cork';picker.dispatchEvent(new w.Event('change'));
  assert.equal(d.querySelectorAll('.db-county-shape[aria-pressed="true"]').length,2);
  d.querySelector('#db-prev').click();
  assert.equal(picker.value,'Cork');
  assert.ok(d.querySelector('#db-county-detail').textContent.includes('Cork'));
  d.querySelector('#db-reset').click();
  assert.equal(d.querySelectorAll('.db-county-shape[aria-pressed="true"]').length,0);
  const cork=d.querySelector('#db-flood-map [data-county="Cork"]');
  cork.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  assert.equal(picker.value,'Cork');
  // Existing views remain functional; each retains independent controls.
  d.querySelector('[data-db-open="overall"]').click();await sleep(200);
  assert.equal(w.VIEWS.current(),'overall');
  assert.ok(d.querySelector('#panel-overall-wellbeing .chart path'));
  const nationalStart=d.querySelector('#overall__start_date').value;
  w.VIEWS.show('stats');await sleep(200);
  assert.ok(d.querySelector('#stats-body').textContent.trim().length>0);
  w.VIEWS.show('event');await sleep(200);
  assert.ok(d.querySelector('#event-horizon svg'));
  assert.equal(d.querySelector('#status').textContent,'');
  assert.equal(d.querySelector('#overall__start_date').value,nationalStart);
  w.VIEWS.show('dashboard');
  d.querySelector('#db-play').click();assert.match(d.querySelector('#db-play').textContent,/Pause/);
  await sleep(1300);assert.equal(d.querySelector('#db-year').textContent,'2023');
  assert.match(d.querySelector('#db-play').textContent,/Play/);
  d.querySelector('#db-play').click();w.VIEWS.show('overall');
  const last=d.querySelector('#db-year').textContent;await sleep(1300);
  assert.equal(d.querySelector('#db-year').textContent,last);
  assert.match(d.querySelector('#db-play').textContent,/Play/);
  assert.deepEqual(errors,[]);
  dom.window.close();
  console.log('PASS: dashboard boot, 14 years, allocation conservation, missing data, linked maps, keyboard selection, timeline playback, existing views and no runtime errors.');
})().catch(e=>{console.error(e);process.exit(1);});
