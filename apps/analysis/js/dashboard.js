/* Historical dashboard. The spatial layer is an explicit allocation scenario,
   never a replacement for the measured national discourse index. */
var DASHBOARD = (function () {
  'use strict';
  var model, year, selected = '', hover = '', timer = null, paths = {}, dots;
  var NS = 'http://www.w3.org/2000/svg';
  function el(id) { return document.getElementById(id); }
  function county(name) {
    if (/Dublin|Fingal|Laoghaire/.test(name)) return 'Dublin';
    if (/Tipperary/.test(name)) return 'Tipperary';
    return name.replace(/ (County|City)$/, '');
  }
  function ringArea(r) {
    var s = 0;
    for (var i = 0; i < r.length; i++) {
      var a = r[i], b = r[(i + 1) % r.length];
      s += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(s / 2);
  }
  function makeModel(floods, population, series) {
    var areas = {}, years = {}, names;
    floods.counties.forEach(function (shape) {
      var name = county(shape.name);
      if (!areas[name]) areas[name] = { name: name, rings: [], area: 0, population: population.population[name] };
      shape.rings.forEach(function (r) { areas[name].rings.push(r); areas[name].area += ringArea(r); });
    });
    names = Object.keys(areas).sort();
    names.forEach(function (name) {
      var a = areas[name];
      if (!(a.population > 0 && a.area > 0)) throw new Error('Missing population or area for ' + name);
      a.density = a.population / a.area;
    });
    series.wellbeing.x.forEach(function (date, i) {
      var y = +date.slice(0, 4);
      if (y > floods.stats.year_max || y < floods.stats.year_min) return;
      var counts = {};
      names.forEach(function (n) { counts[n] = 0; });
      years[y] = { year: y, wellbeing: series.wellbeing.mean[i], discourses: series.wellbeing.n[i], counts: counts, points: [], allocation: {}, weights: {}, total: 0, affected: 0 };
    });
    floods.points.forEach(function (p) {
      var row = years[p[2]], name = county(floods.lookups.county[p[6]] || '');
      if (!row || !areas[name]) return;
      row.counts[name]++; row.total++; row.points.push({ x: p[0], y: p[1], county: name, name: floods.lookups.name[p[7]] });
    });
    var maximum = 0, initial, most = -1;
    Object.keys(years).forEach(function (key) {
      var row = years[key], totalWeight = 0;
      names.forEach(function (n) { totalWeight += row.counts[n] * areas[n].density; if (row.counts[n]) row.affected++; });
      row.available = totalWeight > 0 && row.discourses > 0 && Number.isFinite(row.wellbeing);
      names.forEach(function (n) {
        row.weights[n] = totalWeight > 0 ? row.counts[n] * areas[n].density / totalWeight : null;
        row.allocation[n] = row.available ? (1 - row.wellbeing) * row.weights[n] : null;
        if (row.allocation[n] !== null) maximum = Math.max(maximum, row.allocation[n]);
      });
      if (row.total > most) { initial = +key; most = row.total; }
    });
    var keys = Object.keys(years).map(Number).sort(function (a,b) { return a-b; });
    if (!keys.length) throw new Error('No overlapping flood and wellbeing years');
    return { areas: areas, names: names, years: years, keys: keys, initial: initial, max: Math.max(0.05, Math.ceil(maximum * 20) / 20), census: population.year };
  }
  function svgNode(tag, attrs, text) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function colour(v) {
    if (v === null) return 'url(#db-no-data)';
    var colours = [[230,238,229],[214,199,137],[189,112,46],[115,61,39]];
    var x = Math.max(0,Math.min(1,v/model.max))*3, a = Math.min(2,Math.floor(x)), t = x-a;
    return 'rgb(' + colours[a].map(function (c,i) { return Math.round(c+(colours[a+1][i]-c)*t); }).join(',') + ')';
  }
  function makeMaps() {
    var coords = [];
    model.names.forEach(function (n) { model.areas[n].rings.forEach(function (r) { coords = coords.concat(r); }); });
    var xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
    coords.forEach(function(p){ xmin=Math.min(xmin,p[0]);xmax=Math.max(xmax,p[0]);ymin=Math.min(ymin,p[1]);ymax=Math.max(ymax,p[1]); });
    var scale = Math.min(370/(xmax-xmin),380/(ymax-ymin));
    function x(v) { return 240+(v-(xmin+xmax)/2)*scale; }
    function y(v) { return 210-(v-(ymin+ymax)/2)*scale; }
    ['flood','wellbeing'].forEach(function (kind) {
      var svg = svgNode('svg', {viewBox:'0 0 480 420',class:'db-map-svg','aria-label':kind === 'flood' ? 'Interactive map of recorded floods by county' : 'Interactive county allocation of wellbeing burden'});
      if (kind === 'wellbeing') {
        var defs=svgNode('defs'),pat=svgNode('pattern',{id:'db-no-data',width:6,height:6,patternUnits:'userSpaceOnUse'});
        pat.appendChild(svgNode('rect',{width:6,height:6,fill:'#eef0eb'}));
        pat.appendChild(svgNode('path',{d:'M0 6L6 0',stroke:'#c9d2cc','stroke-width':1}));
        defs.appendChild(pat);svg.appendChild(defs);
      }
      svg.appendChild(svgNode('text',{x:33,y:245,class:'db-map-water',transform:'rotate(-90 33 245)'},'ATLANTIC OCEAN'));
      svg.appendChild(svgNode('text',{x:338,y:99,class:'db-map-label','text-anchor':'middle'},'Northern Ireland'));
      svg.appendChild(svgNode('text',{x:338,y:112,class:'db-map-label','text-anchor':'middle'},'outside this dataset'));
      svg.appendChild(svgNode('text',{x:431,y:33,class:'db-map-label'},'N'));
      svg.appendChild(svgNode('path',{d:'M434 56V39M430 44L434 39L438 44',fill:'none',stroke:'#829d91','stroke-width':1}));
      paths[kind] = {};
      model.names.forEach(function (name) {
        var d = model.areas[name].rings.map(function (ring) {
          return ring.map(function(p,i){return (i?'L':'M')+x(p[0]).toFixed(2)+','+y(p[1]).toFixed(2);}).join('')+'Z';
        }).join('');
        var p = svgNode('path',{d:d,class:'db-county-shape',fill:'#dce7df',tabindex:0,role:'button','data-county':name,'aria-pressed':'false'});
        p.appendChild(svgNode('title',{},name));
        p.addEventListener('mouseenter',function(){hover=name;highlight();});
        p.addEventListener('mouseleave',function(){hover='';highlight();});
        p.addEventListener('focus',function(){hover=name;highlight();});
        p.addEventListener('blur',function(){hover='';highlight();});
        p.addEventListener('click',function(){choose(selected===name?'':name);});
        p.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(selected===name?'':name);}if(e.key==='Escape'){choose('');}});
        paths[kind][name]=p;svg.appendChild(p);
      });
      if(kind==='flood') { dots=svgNode('g',{'aria-hidden':'true'});svg.appendChild(dots); }
      el('db-'+kind+'-map').appendChild(svg);
    });
    return {x:x,y:y};
  }
  var project;
  function choose(name) { selected=name;hover='';el('db-county').value=name;highlight(); }
  function highlight() {
    var name=hover||selected,row=model.years[year];
    ['flood','wellbeing'].forEach(function(kind){model.names.forEach(function(n){paths[kind][n].classList.toggle('is-active',n===name);paths[kind][n].setAttribute('aria-pressed',String(n===selected));});});
    var host=el('db-county-detail');host.replaceChildren();
    if(!name) { host.textContent='Hover or select a county on either map to compare the two views.';return; }
    var a=model.areas[name],b=row.allocation[name];
    [[name,'Selected county'],[String(row.counts[name]),'recorded floods'],[b===null?'Unavailable':b.toFixed(3),'allocated wellbeing burden'],[a.density.toFixed(1),'people / km² · '+model.census]].forEach(function(v){var item=node('span');item.appendChild(node('strong','',v[0]));item.appendChild(node('small','',v[1]));host.appendChild(item);});
  }
  function setYear(value) {
    var y=Math.max(model.keys[0],Math.min(model.keys[model.keys.length-1],Number(value)));
    if(!model.years[y]) return;
    year=y;render();
  }
  function render() {
    if(!model) return;
    var row=model.years[year];
    el('db-year').textContent=year;
    el('db-slider').value=year;el('db-slider').setAttribute('aria-valuetext',String(year));
    el('db-prev').disabled=year===model.keys[0];el('db-next').disabled=year===model.keys[model.keys.length-1];
    var host=el('db-kpis');host.replaceChildren();
    [[row.total.toLocaleString(),'Recorded floods','OPW · selected year'],[row.discourses&&Number.isFinite(row.wellbeing)?row.wellbeing.toFixed(3):'—','National wellbeing','0–1 index · higher is better'],[row.affected+' / '+model.names.length,'Counties with records','Dated flood records only']].forEach(function(k){var c=node('div','db-kpi');c.appendChild(node('span','db-eyebrow',k[1]));c.appendChild(node('strong','',k[0]));c.appendChild(node('small','',k[2]));host.appendChild(c);});
    dots.replaceChildren();
    row.points.forEach(function(p){dots.appendChild(svgNode('circle',{cx:project.x(p.x),cy:project.y(p.y),r:2.6,class:'db-flood-dot'}));});
    model.names.forEach(function(n){
      var b=row.allocation[n],description=n+', '+year+': '+row.counts[n]+' recorded floods; '+(b===null?'allocation unavailable':b.toFixed(3)+' allocated wellbeing burden');
      paths.wellbeing[n].setAttribute('fill',colour(b));
      ['flood','wellbeing'].forEach(function(kind){paths[kind][n].setAttribute('aria-label',description);paths[kind][n].querySelector('title').textContent=description;});
    });
    document.querySelectorAll('.db-legend-year').forEach(function(n){n.textContent=year;});
    el('db-history').querySelectorAll('rect').forEach(function(r){r.setAttribute('fill',+r.dataset.year===year?'#0f4c3a':'#aecabc');});
    highlight();
  }
  function pause() { clearInterval(timer);timer=null;var b=el('db-play');if(b){b.innerHTML='▶ <span>Play</span>';b.setAttribute('aria-label','Play timeline');} }
  function build(cfg) {
    if(!el('frame-dashboard')) return;
    var host=el('frame-dashboard');
    try {
      var F=window.DIGIEIRE_FLOODS,P=window.DIGIEIRE_POPULATION;
      if(!F||!P) throw new Error('Dashboard map data did not load. Reload the page to try again.');
      var series=COMPUTE.buildSeries(STORE.data(),{period:'1y',window:'0',mode:'double',location:'all',weight_reactions:false,sensitivity:5});
      model=makeModel(F,P,series);year=model.initial;
      var first=model.keys[0],last=model.keys[model.keys.length-1];
      el('db-coverage').textContent='Shared record · '+first+'–'+last+'\n26 counties';
      el('db-slider').min=first;el('db-slider').max=last;
      el('db-scale-max').textContent=model.max;
      var maxFloods=Math.max.apply(null,model.keys.map(function(y){return model.years[y].total;}));
      model.keys.forEach(function(y,i){
        var h=maxFloods?model.years[y].total/maxFloods*44:0;
        el('db-history').appendChild(svgNode('rect',{x:10+i*980/(model.keys.length-1)-10,y:48-h,width:20,height:h,rx:2,'data-year':y,fill:'#aecabc'}));
        var tick=node('span','',y);tick.style.left=(i*100/(model.keys.length-1))+'%';el('db-years').appendChild(tick);
      });
      model.names.forEach(function(n){var o=node('option','',n);o.value=n;el('db-county').appendChild(o);});
      project=makeMaps();
      el('db-slider').addEventListener('input',function(){pause();setYear(this.value);});
      el('db-prev').addEventListener('click',function(){pause();setYear(year-1);});
      el('db-next').addEventListener('click',function(){pause();setYear(year+1);});
      el('db-play').addEventListener('click',function(){
        if(timer){pause();return;}
        if(year===last)setYear(first);
        this.innerHTML='Ⅱ <span>Pause</span>';this.setAttribute('aria-label','Pause timeline');
        timer=setInterval(function(){if(year>=last){pause();return;}setYear(year+1);if(year===last)pause();},1200);
      });
      el('db-county').addEventListener('change',function(){choose(this.value);});
      el('db-reset').addEventListener('click',function(){choose('');});
      document.querySelectorAll('[data-db-open]').forEach(function(b){b.addEventListener('click',function(){VIEWS.show(b.dataset.dbOpen);});});
      document.addEventListener('visibilitychange',function(){if(document.hidden)pause();});
      render();
    } catch(e) {
      host.replaceChildren(node('p','empty','The dashboard is unavailable: '+e.message+' National Analysis, Event Analysis and Statistics remain available above.'));
      model=null;
    }
  }
  return { build:build, render:render, pause:pause, makeModel:makeModel };
})();
