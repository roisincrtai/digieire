const { JSDOM, VirtualConsole } = require('jsdom');
const B = process.env.BASE || 'http://127.0.0.1:8000';
let pass=0,fail=0;
const ok=(c,w,x)=>{c?pass++:fail++;console.log((c?'  PASS  ':'  FAIL  ')+w+(x!==undefined&&!c?'  ['+x+']':''));};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const PAGES=[['index.html','Project DigiÉire'],
             ['pages/introduction.html','Mission'],
             ['pages/project.html','DigiÉire'],
             ['pages/data-source.html','Data'],
             ['pages/irish-floods.html','Irish Floods'],
             ['pages/climate-change.html','Climate Change'],
             ['pages/about.html','About us']];
(async()=>{
  for (const [p, label] of PAGES) {
    const errs=[]; const vc=new VirtualConsole();
    vc.on('jsdomError',e=>errs.push(String(e.message).slice(0,160)));
    const dom=await JSDOM.fromURL(B+'/'+p,{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc});
    const d=dom.window.document, w=dom.window;
    await sleep(p.includes('floods')||p.includes('climate')?2200:500);
    console.log('\n— '+p);
    ok(!!d.querySelector('h1'),'has an h1');
    const nav=[...d.querySelectorAll('.nav a')].map(a=>a.textContent.trim());
    ok(JSON.stringify(nav.slice(0,6))===JSON.stringify(['Mission','DigiÉire','Data','Irish Floods','Climate Change','About us']),
       'nav complete and in order',nav.join(' | '));
    if (label!=='Project DigiÉire' || p!=='index.html') {
      const cur=[...d.querySelectorAll('.nav a.is-current')].map(a=>a.textContent.trim());
      if (p!=='index.html') ok(cur.length===1 && cur[0]===label,'current page marked in nav',cur.join(','));
    }
    // every local link resolves
    const links=[...d.querySelectorAll('a[href]')].map(a=>a.getAttribute('href'))
      .filter(h=>h && !/^https?:|^#|^mailto:/.test(h));
    let bad=[];
    for (const h of [...new Set(links)]) {
      const base=p.includes('/')?p.replace(/[^/]+$/,''):'';
      const r=await fetch(B+'/'+new URL(h,'http://x/'+base).pathname.slice(1));
      if(!r.ok) bad.push(h+' ('+r.status+')');
    }
    ok(bad.length===0,links.length+' internal links resolve',bad.join(', '));
    const assets=[...d.querySelectorAll('link[href],script[src],img[src]')]
      .map(e=>e.getAttribute('href')||e.getAttribute('src'));
    ok(assets.every(s=>!/^https?:|^\/\//.test(s)),'all assets relative');
    // Every stylesheet and script carries a content hash, so a new script can
    // never be served beside a stale stylesheet. The query is all that is
    // added — the path stays relative, so file:// is unaffected.
    const stamped=assets.filter(x=>/\.(css|js)$/.test(x.split('?')[0]));
    ok(stamped.length>0 && stamped.every(x=>/\?v=[0-9a-f]{12}$/.test(x)),
       stamped.length+' css/js assets are content-stamped',
       stamped.filter(x=>!/\?v=/.test(x)).join(', '));
    let abad=[];
    for (const a of [...new Set(assets)]) {
      const base=p.includes('/')?p.replace(/[^/]+$/,''):'';
      const r=await fetch(B+'/'+new URL(a,'http://x/'+base).pathname.slice(1));
      if(!r.ok) abad.push(a+' ('+r.status+')');
    }
    ok(abad.length===0,assets.length+' assets resolve',abad.join(', '));
    ok(!/loading/i.test(d.body.textContent),'no loading text');
    const brand=d.querySelector('.brand .brand-text i');
    ok(brand && brand.textContent.trim()==='Irish Digital Twin',
       'logo uses the short form',brand&&brand.textContent.trim());
    const fb=d.querySelector('.foot-brand');
    ok(fb && /Irish Digital Twin/.test(fb.textContent),
       'footer brand matches the logo',fb&&fb.textContent.replace(/\s+/g,' ').trim());
    ok(!/What is published, and what is not/.test(d.body.textContent),
       'publication notice dropped');
    ok(!/Figures are generated from the project's own analysis code/.test(d.body.textContent),
       'footer disclaimer dropped');
    const cta=d.querySelector('.nav a.nav-cta');
    ok(cta && cta.getAttribute('target')==='_blank' && /noopener/.test(cta.getAttribute('rel')||''),
       'the Analysis app link opens a new page');
    ok(cta && cta.textContent.trim()==='Analysis app','nav CTA reads "Analysis app"',
       cta&&cta.textContent.trim());
    if (p==='index.html') {
      ok(d.querySelectorAll('.cards .card').length===0,'section cards dropped');
      const h1=d.querySelector('.hero h1');
      ok(h1 && h1.firstChild.textContent.trim()==='DigiÉire Research Lab',
         'hero names the research lab',h1&&h1.firstChild.textContent.trim());
      ok(/A digital twin of Ireland/i.test(d.querySelector('.hero .eyebrow').textContent),
         'eyebrow unchanged');
      ok(!/Start anywhere|The project, in five parts/.test(d.body.textContent),'"start anywhere" block dropped');
      const ack=[...d.querySelectorAll('.ack')].pop();
      ok(!!ack,'acknowledgements section present');
      ok(ack && /Meta/.test(ack.textContent) && /Office of Public Works/.test(ack.textContent),
         'acknowledges Meta and the OPW');
      ok(ack && /Meta Content Library/.test(ack.textContent),
         'names what Meta supported',ack&&ack.textContent.replace(/\s+/g,' ').slice(0,160));
      ok(ack && !/measurable at national scale/.test(ack.textContent),
         'no editorialising in the acknowledgement');
      const secs=[...d.querySelectorAll('.ack')];
      ok(secs.length===2,'a collaboration section and an acknowledgements one',secs.length);
      const collab=secs[0];
      ok(/Collaboration/.test(collab.textContent)&&/GLOWB Project/.test(collab.textContent)
         &&/Insight SFI/.test(collab.textContent),'names the collaborators',
         collab.textContent.replace(/\s+/g,' ').trim().slice(0,140));
      ok(collab.querySelectorAll('.ack-item').length===2,'two collaborators',
         collab.querySelectorAll('.ack-item').length);
      ok(!collab.querySelector('h2'),'no heading above the collaborators');
      ok(!/Working with/.test(d.body.textContent),'"Working with" dropped');
      // ---- the landing page's flood-burden figure ----
      const B=w.DIGIEIRE_BURDEN;
      ok(!!B,'burden bundle loaded');
      ok(B && B.back.length>6000,'whole catalogue carried for shape',B&&B.back.length);
      ok(B && B.evt.length>1000 && B.evt.every(e=>e[2]>=2012 && e[3]>=1 && e[3]<=12),
         'animated subset is dated 2012+ and carries a month',B&&B.evt.length);
      ok(B && B.rings.length===34,'34 county outlines in the bundle',B&&B.rings.length);
      ok(d.querySelectorAll('#burden-map .back circle').length===(B?B.back.length:0),
         'backdrop drawn once per record');
      ok(d.querySelectorAll('#burden-map .cty path').length===34,'counties drawn');
      ok(d.querySelectorAll('#burden-bars rect.bar').length===12,'twelve month bars');
      ok(d.querySelectorAll('#burden-bars defs linearGradient').length===12,
         'each month has its own season gradient');
      ok(d.querySelectorAll('#burden-key .k-ramp i').length===5,'sparkle key has five steps');
      ok(d.querySelector('#burden-when').textContent==='2012','starts at 2012',
         d.querySelector('#burden-when').textContent);
      const brows=[...d.querySelectorAll('#burden-list li')].filter(l=>!l.hidden);
      ok(brows.length>0 && brows.length<=6,'ranking populated',brows.length);
      ok(brows.every(l=>l.querySelector('.track .bar')),'ranking rows are bars on a track');
      ok(d.querySelectorAll('#burden-list .rk, #burden-list .fill').length===0,
         'no button chrome in the ranking');
      ok(!d.querySelector('#burden-play') && !d.querySelector('#burden-scrub'),
         'no transport controls');
      ok(d.querySelectorAll('.burden-sliders input[type=range]').length===2,
         'speed and sparkle sliders');

      ok(secs[1].querySelectorAll('.ack-item').length===4,'four acknowledgements',
         secs[1].querySelectorAll('.ack-item').length);
      ok(ack && /Luxembourg MeluXina/.test(ack.textContent) && /High-End Computing/.test(ack.textContent)
         && /School of Computer Science/.test(ack.textContent),
         'acknowledges the compute providers');
      const mx=[...d.querySelectorAll('.ack-item a')].find(a=>/MeluXina/.test(a.textContent));
      ok(mx && mx.textContent.trim()==='Luxembourg MeluXina','link text is the full name',
         mx&&mx.textContent.trim());
      ok(mx && mx.getAttribute('href')==='https://www.luxprovide.lu/meluxina/'
         && mx.getAttribute('target')==='_blank','MeluXina links out in a new page',
         mx&&mx.getAttribute('href'));
    }
    if (p.includes('irish-floods')) {
      ok(d.querySelectorAll('#floods-dash svg.dash-map circle').length>6000,'flood map drawn');
      ok(d.querySelectorAll('#floods-dash .kpi').length===5,'flood KPIs');
      ok(d.querySelectorAll('#floods-dash svg.dash-map .dash-cty path.cty').length===34,
         'all 34 county outlines drawn',d.querySelectorAll('#floods-dash .dash-cty path.cty').length);
      const tables=[...d.querySelectorAll('#floods-dash .dash-pair table.dash-table')];
      ok(tables.length===2,'county and catchment tables side by side',tables.length);
      const ctyRows=tables[0]?[...tables[0].querySelectorAll('tbody tr')]:[];
      ok(ctyRows.length===34,'county table lists every area',ctyRows.length);
      ok(ctyRows.every(r=>r.classList.contains('linkable')),'county rows link to the map');
      const first=ctyRows[0]?ctyRows[0].textContent:'';
      ok(/Cork County/.test(first),'busiest county first',first);
      // the tooltip machinery exists and answers
      ok(!!d.querySelector('#floods-dash .dash-tip'),'tooltip element present');
      ok(!!d.querySelector('#floods-dash circle.dash-halo'),'hover halo present');
      const pt=w.DIGIEIRE_FLOODS.points[0], lk=w.DIGIEIRE_FLOODS.lookups;
      ok(pt.length===8,'points carry the tooltip fields',pt.length);
      ok(typeof lk.name[pt[7]]==='string' && lk.name[pt[7]].length>0,'point resolves a name',lk.name[pt[7]]);
      ok(typeof lk.county[pt[6]]==='string','point resolves a county',lk.county[pt[6]]);
      const cs=w.DIGIEIRE_FLOODS.stats;
      ok(cs.by_county.reduce((a,b)=>a+b[1],0)===cs.n_total,'county counts sum to the catalogue');
      ok(cs.n_county_unassigned===0,'no event left unassigned',cs.n_county_unassigned);
      ok(!d.querySelector('main.page > .wrap > p.small.muted.narrow'),'floods page-bottom source note dropped');
    }
    if (p.includes('climate-change')) {
      ok(d.querySelectorAll('#climate-dash svg').length>=6,'climate charts drawn');
      ok(d.querySelectorAll('#climate-dash .kpi').length===4,'climate KPIs');
      ok(!d.querySelector('main.page > .wrap > p.small.muted.narrow'),'climate page-bottom source note dropped');
    }
    if (p.includes('about')) {
      ok(d.querySelectorAll('.avatar').length===0,'no team photos');
      ok(!/Get in touch/.test(d.body.textContent),'"Get in touch" aside dropped');
      ok(!/TO BE COMPLETED/.test(d.body.textContent),'no unfilled placeholders left');
      const mem=[...d.querySelectorAll('.team-rows .member')];
      ok(mem.length===2,'one row per member',mem.length);
      ok(mem.every(m=>m.querySelector('.m-name')&&m.querySelector('.m-role')&&m.querySelector('.m-affil')),
         'each row carries name, role and affiliation');
      ok(/Karyn Morrissey/.test(mem[0].textContent)&&/Principal Investigator/.test(mem[0].textContent),
         'PI first',mem[0].textContent.replace(/\s+/g,' ').trim());
      ok(d.querySelectorAll('.card.person').length===0,'team cards replaced by rows');
    }
    // prose pages must not pull the dashboard payloads
    if (!p.includes('floods')&&!p.includes('climate'))
      ok(!w.DIGIEIRE_FLOODS && !w.DIGIEIRE_CLIMATE,'prose page loads no dashboard data');
    ok(errs.length===0,'no JS errors',errs.join(' / '));
    dom.window.close();
  }
  console.log('\n  '+pass+' passed, '+fail+' failed');
  process.exit(fail?1:0);
})().catch(e=>{console.error('HARNESS',e);process.exit(2);});
