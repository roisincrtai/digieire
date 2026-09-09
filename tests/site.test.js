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
    ok(JSON.stringify(nav.slice(0,7))===JSON.stringify(['Home','Mission','DigiÉire','Data','Irish Floods','Climate Change','About us']),
       'nav complete and in order',nav.join(' | '));
    const home=[...d.querySelectorAll('.nav a')].find(a=>a.textContent.trim()==='Home');
    const brandA=d.querySelector('a.brand');
    ok(home && brandA && home.getAttribute('href')===brandA.getAttribute('href'),
       'Home and the wordmark point to the same place',
       (home&&home.getAttribute('href'))+' vs '+(brandA&&brandA.getAttribute('href')));
    {
      const cur=[...d.querySelectorAll('.nav a.is-current')].map(a=>a.textContent.trim());
      const want=p==='index.html'?'Home':label;
      ok(cur.length===1 && cur[0]===want,'current page marked in nav',cur.join(','));
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
    // NOTHING THE PAGE STATES MAY BE TYPED IN. Every figure comes from a
    // published manifest at build time, so an unresolved placeholder or a
    // stale hand-written count is a failure, not a cosmetic slip.
    const desc=(d.querySelector('meta[name=description]')||{}).content||'';
    ok(!/[{}]/.test(desc),'no unresolved placeholder in the description',desc);
    const brand=d.querySelector('.brand .brand-text i');
    ok(brand && brand.textContent.trim()==='Research Lab',
       'logo uses the short form',brand&&brand.textContent.trim());
    const fb=d.querySelector('.foot-brand');
    ok(fb && fb.textContent.trim()==='DigiÉire Research Lab',
       'the footer names the lab in one line',fb&&fb.textContent.trim());
    ok(fb && !/Project/.test(fb.textContent),'and does not call it a project');
    ok(fb && /Research Lab/.test(fb.textContent),
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
      const sub=d.querySelector('.hero .h1-sub').textContent.replace(/\s+/g,' ').trim();
      ok(sub==='Wellbeing research · AI for climate adaptation',
         'sub-line names the two research fields',sub);
      ok(!/\|/.test(sub),'no pipe in the hero');
      const lede=d.querySelector('.hero .lede').textContent.replace(/\s+/g,' ').trim();
      ok(/DigiÉire aims to develop a digital twin of Ireland, underpinned by AI/.test(lede),
         'lede frames AI as the approach',lede.slice(0,200));
      ok(/puts AI to work on a public good/.test(lede),'lede ties AI to its purpose');
      ok(!/agent-based/.test(lede),'no method name in the hero');
      ok(!/flooding due to climate change/.test(lede),'no repeated "climate change"');
      ok(/coastal and inland flooding/.test(lede),'both flood mechanisms named');
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
      // fill:none paths are only hoverable on their stroke unless this is set,
      // which is what made hovering appear not to work at all
      const c0=d.querySelector('#burden-map .cty path.c');
      ok(w.getComputedStyle(c0).pointerEvents==='all','county outlines are hittable',
         w.getComputedStyle(c0).pointerEvents);
      ['.back circle','.live circle'].forEach(sel=>{
        const n=d.querySelector('#burden-map '+sel);
        ok(n && w.getComputedStyle(n).pointerEvents==='none',
           sel+' does not intercept the cursor',n&&w.getComputedStyle(n).pointerEvents);
      });

      // the year timeline, built like the dashboard's
      ok(d.querySelectorAll('#burden-history rect').length===B.year_max-B.year_min+1,
         'a bar per year',d.querySelectorAll('#burden-history rect').length);
      ok(d.querySelectorAll('#burden-years span').length===B.year_max-B.year_min+1,
         'a label per year');
      ok(d.querySelector('#burden-years span').textContent===String(B.year_min),
         'labels start at the first year');
      const darkNow=[...d.querySelectorAll('#burden-history rect')]
        .filter(r=>r.getAttribute('fill')==='#0f4c3a').length;
      ok(darkNow===1,'exactly one bar marks the current year',darkNow);
      ok(!!d.querySelector('.burden-track-note'),'the track is captioned');
      ok(d.querySelectorAll('#burden-bars rect.bar').length===12,'twelve month bars');
      ok(d.querySelectorAll('#burden-bars defs linearGradient').length===12,
         'each month has its own season gradient');
      ok(d.querySelectorAll('#burden-key .k-ramp i').length===5,'sparkle key has five steps');
      const shownYear=+d.querySelector('#burden-when').textContent;
      ok(shownYear>=B.year_min && shownYear<=B.year_max,'a year in range is shown',shownYear);
      ok(+d.querySelector('#burden-year-range').value===shownYear,
         'the year track follows the figure',d.querySelector('#burden-year-range').value);
      const brows=[...d.querySelectorAll('#burden-list li')].filter(l=>!l.hidden);
      ok(brows.length>0 && brows.length<=6,'ranking populated',brows.length);
      ok(brows.every(l=>l.querySelector('.track .bar')),'ranking rows are bars on a track');
      ok(d.querySelectorAll('#burden-list .rk, #burden-list .fill').length===0,
         'no button chrome in the ranking');
      ok(!d.querySelector('#burden-play') && !d.querySelector('#burden-scrub'),
         'no transport controls');
      ok(d.querySelectorAll('.burden-sliders input[type=range]').length===2,
         'speed and sparkle sliders');
      ok(d.querySelector('#burden-speed').value==='200','speed defaults to 2x',
         d.querySelector('#burden-speed').value);
      ok(d.querySelector('#burden-speed-out').textContent.trim()==='2.0×',
         'and says so',d.querySelector('#burden-speed-out').textContent);
      const yr=d.querySelector('#burden-year-range');
      ok(yr && +yr.min===B.year_min && +yr.max===B.year_max,'year track spans the record',
         yr&&(yr.min+'-'+yr.max));

      // dragging the year takes the figure with it
      yr.value=String(B.year_max);
      yr.dispatchEvent(new w.Event('input'));
      ok(d.querySelector('#burden-when').textContent===String(B.year_max),
         'dragging the year moves the figure',d.querySelector('#burden-when').textContent);

      // hovering a county reads out that county for the year on screen,
      // and does NOT stop the clock
      const cty=d.querySelector('#burden-map .cty path.c');
      cty.dispatchEvent(new w.MouseEvent('mouseenter',{bubbles:false}));
      const tip=d.querySelector('#burden-tip');
      const name=cty.querySelector('title').textContent;
      ok(!tip.hidden,'hovering a county opens a read-out');
      ok(tip.querySelector('.tip-h').textContent===name,'named correctly',
         tip.querySelector('.tip-h').textContent+' vs '+name);
      const want=(B.evt.filter(e=>e[2]===B.year_max && B.counties[e[4]]===name)).length;
      const said=tip.querySelector('.tip-r').textContent;
      ok(want? said.indexOf(String(want))===0 : /^no records/.test(said),
         'and counted correctly for the year on screen',said+' (expected '+want+')');
      // the cursor over the map holds the year, so the read-out can be read
      const mapBox=d.querySelector('.burden-maprap');
      mapBox.dispatchEvent(new w.MouseEvent('mouseenter',{bubbles:false}));
      const held=d.querySelector('#burden-when').textContent;
      await sleep(1100);          // longer than one 2x step
      ok(d.querySelector('#burden-when').textContent===held,
         'the cursor over the map holds the year',
         'moved from '+held+' to '+d.querySelector('#burden-when').textContent);
      // and leaving lets it go again
      cty.dispatchEvent(new w.MouseEvent('mouseleave',{bubbles:false}));
      mapBox.dispatchEvent(new w.MouseEvent('mouseleave',{bubbles:false}));
      ok(tip.hidden,'leaving the map closes the read-out');
      await sleep(1100);
      ok(d.querySelector('#burden-when').textContent!==held,
         'and playback resumes on leave','still on '+held);

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
      ok(pt.length===w.DIGIEIRE_FLOODS.point_format.length,
         'points match their declared format',
         pt.length+' vs '+w.DIGIEIRE_FLOODS.point_format.length);
      ok(w.DIGIEIRE_FLOODS.point_format.indexOf('dataset')>=0,
         'points name their source dataset');
      ok(typeof lk.name[pt[7]]==='string' && lk.name[pt[7]].length>0,'point resolves a name',lk.name[pt[7]]);
      ok(typeof lk.county[pt[6]]==='string','point resolves a county',lk.county[pt[6]]);
      const cs=w.DIGIEIRE_FLOODS.stats;
      ok(cs.by_county.reduce((a,b)=>a+b[1],0)===cs.n_total,'county counts sum to the catalogue');
      ok(cs.n_county_unassigned===0,'no event left unassigned',cs.n_county_unassigned);

      // THE CURATED SUPPLEMENT. Two sources, one figure, and the split stated:
      // the totals must add up, the OPW record must stop where it says it
      // stops, and every curated row must be reachable back to a citation.
      const ds=Object.fromEntries(cs.by_dataset);
      ok(ds.opw>0 && ds.curated>0,'both datasets present',JSON.stringify(cs.by_dataset));
      ok(ds.opw+ds.curated===cs.n_total,'the two sources sum to the total',
         ds.opw+'+'+ds.curated+' vs '+cs.n_total);
      ok(cs.opw_year_max<cs.year_max,'the curated rows extend past the OPW record',
         cs.opw_year_max+' -> '+cs.year_max);
      const cur=cs.curated;
      ok(cur && cur.n===ds.curated,'the provenance block counts what was merged');
      ok(cur.places.every(p=>/^https:\/\//.test(p.url)),'every curated event cites a source');
      ok(cur.places.every(p=>p.opw_records_matched>0),
         'every curated point was located from OPW records');
      const dsIx=w.DIGIEIRE_FLOODS.lookups.dataset.indexOf('curated');
      const curPts=w.DIGIEIRE_FLOODS.points.filter(p=>p[8]===dsIx);
      ok(curPts.length===ds.curated,'the map carries every curated point',curPts.length);
      ok(curPts.every(p=>p[2]>cs.opw_year_max),'and all of them post-date the OPW record');
      ok(!d.querySelector('main.page > .wrap > p.small.muted.narrow'),'floods page-bottom source note dropped');
      const F=w.DIGIEIRE_FLOODS, fdesc=d.querySelector('meta[name=description]').content;
      ok(fdesc.indexOf(F.stats.n_total.toLocaleString())===0,
         'the description quotes the published count',fdesc.slice(0,40));
      ok(!/\b(1950|2000)\b/.test(d.querySelector('#floods-dash').textContent)
         || (F.stats.chart_year_from===1950 && F.stats.since_year===2000),
         'year windows on the page come from the bundle');
      const yrTitle=[...d.querySelectorAll('.dash-title')]
        .find(t=>/Recorded events per year/.test(t.textContent));
      ok(yrTitle && yrTitle.textContent.indexOf(String(F.stats.chart_year_from))>=0,
         'the per-year chart names the bundle\'s window',yrTitle&&yrTitle.textContent);
    }
    if (p.includes('climate-change')) {
      ok(d.querySelectorAll('#climate-dash svg').length>=6,'climate charts drawn');
      ok(d.querySelectorAll('#climate-dash .kpi').length===4,'climate KPIs');
      ok(!d.querySelector('main.page > .wrap > p.small.muted.narrow'),'climate page-bottom source note dropped');
      const C=w.DIGIEIRE_CLIMATE.ireland;
      ok(Array.isArray(C.baseline_period) && Array.isArray(C.recent_period),
         'the climate bundle publishes its periods',JSON.stringify(C.baseline_period));
      const kpi=[...d.querySelectorAll('#climate-dash .kpi-s')].map(n=>n.textContent).join(' | ');
      ok(kpi.indexOf(C.recent_period[0]+'–'+C.recent_period[1])>=0,
         'the KPI names the bundle\'s recent period',kpi.slice(0,90));
    }
    if (p.includes('about')) {
      ok(d.querySelector('h1').textContent.trim()==='Research','About page is titled Research',
         d.querySelector('h1').textContent);
      const pi=d.querySelectorAll('.team-rows .member')[0];
      const flat=n=>n.textContent.replace(/\s+/g,' ').trim();
      ok(/Prof\. Karyn Morrissey/.test(flat(pi)),'the PI is Prof.',flat(pi).slice(0,50));
      const piLink=pi.querySelector('.m-name a');
      ok(piLink && /karyn-marie-morrissey/.test(piLink.getAttribute('href')),
         'and links to her profile',piLink&&piLink.getAttribute('href'));
      ok(/Ryan Institute/.test(flat(pi)),'her affiliations include the Ryan Institute');
      const pd=d.querySelectorAll('.team-rows .member')[1];
      ok(pd.querySelector('.m-research'),'the postdoc row states a research focus');
      ok(/large language models/i.test(flat(pd.querySelector('.m-research'))),
         'and names it',flat(pd.querySelector('.m-research')));
      const lede=d.querySelector('.lede').textContent.replace(/\s+/g,' ');
      ok(!/^Project DigiÉire/.test(lede.trim()),'the lede does not say "Project"',lede.slice(0,40));
      ok(/large language models \(LLMs\)/.test(lede),'and names the lab\'s methods');
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
