/* The landing page's flood-burden figure: one YEAR at a time, 2012 onwards.

   Three views of the same year, updated together on every step:

     the map      where the year's events were, lit and sparkling over the
                  faint whole catalogue, with counties washed by their count
     the bars     the year's records by month, January to December
     the ranking  the year's busiest counties and cities

   WHY THE FAINT BACKDROP. The whole recorded catalogue is drawn once, at low
   opacity. It is what makes the shape on screen recognisably Ireland — 77
   events in 2012 is an unreadable smear of dots on white, not a map. Lit points
   are the year; faint points are context. The caption says so, because a reader
   who took the backdrop for the year would read every frame as a catastrophe.

   THE BAR SCALE IS SHARED ACROSS YEARS, NOT RESCALED PER YEAR. December 2015
   alone holds 294 records; a typical month holds four. Re-fitting the axis to
   each year would draw that four-record month exactly as tall as December 2015
   and quietly turn an animation about magnitude into an animation about shape.
   The cost is that quiet years look quiet, which is the point. The axis maximum
   is printed so the comparison is checkable.

   IT PLAYS ITSELF. No play button and no scrubber: this sits under the hero as
   an illustration, and a transport bar there would ask the reader to operate
   something before they have been told what it is. The two sliders are the
   exception — they change how it FEELS, never which year is shown or what it
   counts. Hovering pauses so the ranking can be read; leaving resumes; it does
   not run off screen or under prefers-reduced-motion. */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var D = window.DIGIEIRE_BURDEN;
  var svg = document.getElementById('burden-map');
  if (!D || !svg) return;

  function el(t, a, txt) {
    var n = document.createElementNS(NS, t);
    for (var kk in a) if (a[kk] != null) n.setAttribute(kk, a[kk]);
    if (txt !== undefined) n.textContent = txt;
    return n;
  }

  // ---- map projection: Irish National Grid, plotted directly --------------
  var W = 460, H = 570, pad = 12;
  var GX = [20, 350], GY = [10, 470];
  var iw = W - pad * 2, ih = H - pad * 2;
  var k = Math.min(iw / (GX[1] - GX[0]), ih / (GY[1] - GY[0]));
  var ox = pad + (iw - k * (GX[1] - GX[0])) / 2;
  var oy = pad + (ih - k * (GY[1] - GY[0])) / 2;
  function X(v) { return ox + (v - GX[0]) * k; }
  function Y(v) { return oy + ih - (v - GY[0]) * k - (ih - k * (GY[1] - GY[0])); }

  var MI = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  var MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
            'August', 'September', 'October', 'November', 'December'];

  // ---- index the record ---------------------------------------------------
  var Y0 = D.year_min, Y1 = D.year_max;
  var years = [];
  for (var y = Y0; y <= Y1; y++) years.push(y);

  var perYear = {};        // year -> [index into D.evt]
  var byCounty = {};       // year -> {county: n}
  var byMonth = {};        // year -> [12 counts]
  years.forEach(function (yy) {
    perYear[yy] = []; byCounty[yy] = {}; byMonth[yy] = new Array(12).fill(0);
  });

  // Screen positions, computed once. px/py index D.evt (the animated subset);
  // the faint backdrop is drawn straight from D.back and never looked up again.
  var px = [], py = [];
  D.evt.forEach(function (p, i) {
    px.push(X(p[0]));
    py.push(Y(p[1]));
    var yr = p[2];
    if (!yr || yr < Y0 || yr > Y1) return;
    perYear[yr].push(i);
    var c = D.counties[p[4]];
    byCounty[yr][c] = (byCounty[yr][c] || 0) + 1;
    if (p[3] >= 1 && p[3] <= 12) byMonth[yr][p[3] - 1] += 1;
  });

  var washMax = 0, barMax = 0;
  years.forEach(function (yy) {
    for (var c in byCounty[yy]) if (byCounty[yy][c] > washMax) washMax = byCounty[yy][c];
    byMonth[yy].forEach(function (n) { if (n > barMax) barMax = n; });
  });

  // ---- map layers ---------------------------------------------------------
  var gWash = el('g', { class: 'wash' });
  var gCty  = el('g', { class: 'cty' });
  var gBack = el('g', { class: 'back' });
  var gLive = el('g', { class: 'live' });
  var gSpk  = el('g', { class: 'spk' });
  [gWash, gCty, gBack, gLive, gSpk].forEach(function (g) { svg.appendChild(g); });

  var washOf = {}, pathOf = {};
  D.rings.forEach(function (a) {
    var d = '';
    a.r.forEach(function (ring) {
      ring.forEach(function (p, i) {
        d += (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1);
      });
      d += 'Z';
    });
    var w = el('path', { d: d, class: 'w', 'fill-rule': 'evenodd' });
    gWash.appendChild(w);
    washOf[a.n] = w;

    var c = el('path', { d: d, class: 'c', 'fill-rule': 'evenodd',
                         tabindex: 0, role: 'img' });
    c.appendChild(el('title', {}, a.n));
    c.addEventListener('mouseenter', function () { hover(a.n); });
    c.addEventListener('focus', function () { hover(a.n); });
    c.addEventListener('mouseleave', function () { hover(null); });
    c.addEventListener('blur', function () { hover(null); });
    gCty.appendChild(c);
    pathOf[a.n] = c;
  });

  D.back.forEach(function (p) {               // the whole record, once
    gBack.appendChild(el('circle', {
      cx: X(p[0]).toFixed(1), cy: Y(p[1]).toFixed(1), r: 1.3, class: 'b'
    }));
  });

  // Recycled node pools, sized once to the busiest year.
  var LIVE = 0;
  years.forEach(function (yy) { LIVE = Math.max(LIVE, perYear[yy].length); });
  var liveNodes = [];
  for (var i = 0; i < LIVE; i++) {
    var n = el('circle', { r: 0, cx: -9, cy: -9, class: 'l' });
    gLive.appendChild(n);
    liveNodes.push(n);
  }
  /* SPARKLE COLOUR CARRIES THE COUNTY'S BURDEN. A twinkle over a county with
     two records for the year is a pale gold; one over a county with two hundred
     is a deep ember. Five steps, not a continuous ramp — the eye cannot rank a
     hundred shades of orange on moving three-pixel dots, and five it can. The
     scale is the square root of the county's share of the busiest county-year,
     the same compression the county wash uses, so the two agree. A key sits
     under the map, because a colour that means something needs a legend and a
     colour that does not should not be there. */
  var EMBER = ['#ffe9a8', '#f7c96e', '#ef9f45', '#df6f2e', '#c8451f'];

  var POOL = 90, spark = [], slot = [];
  for (i = 0; i < POOL; i++) {
    var s = el('circle', { r: 0, cx: -9, cy: -9, class: 's' });
    gSpk.appendChild(s);
    spark.push(s);
    slot.push(null);
  }

  // ---- the month bars -----------------------------------------------------
  var bw = 336, bh = 104, bpad = { l: 26, r: 4, t: 8, b: 15 };
  var bars = document.getElementById('burden-bars');
  bars.setAttribute('viewBox', '0 0 ' + bw + ' ' + bh);
  var bIW = bw - bpad.l - bpad.r, bIH = bh - bpad.t - bpad.b;
  var slotW = bIW / 12;

  bars.appendChild(el('line', {
    x1: bpad.l, x2: bw - bpad.r, y1: bpad.t + bIH, y2: bpad.t + bIH, class: 'ax'
  }));
  bars.appendChild(el('text', { x: bpad.l - 6, y: bpad.t + 7, class: 'bt',
                                'text-anchor': 'end' }, String(barMax)));
  bars.appendChild(el('text', { x: bpad.l - 6, y: bpad.t + bIH, class: 'bt',
                                'text-anchor': 'end' }, '0'));

  /* THE MONTH BARS ARE COLOURED BY SEASON, not by value. Irish flooding is a
     winter story — the Atlantic storm track, saturated ground and the highest
     tides arrive together — so the twelve bars run through a cool winter blue,
     out to a pale green summer, and back. That is an ordinal wheel over a fact
     the calendar already fixes; it cannot mislead, because the x position said
     the same thing first. Colouring by HEIGHT would have been the tempting
     alternative and the wrong one: it would encode the number twice and leave
     a reader hunting for a legend that does not exist. */
  var SEASON = [
    ['#17456b', '#2874a6'],   // Jan  deep winter
    ['#1b5478', '#3585b4'],   // Feb
    ['#22705f', '#3f9fb0'],   // Mar
    ['#2a8168', '#57b394'],   // Apr
    ['#3f9a70', '#7cc7a3'],   // May
    ['#5aa878', '#96d3ae'],   // Jun  high summer
    ['#6cae72', '#a6d7a8'],   // Jul
    ['#7ba85f', '#b9d18a'],   // Aug
    ['#a08a3a', '#d6bb63'],   // Sep  turning
    ['#b1762c', '#e0a95a'],   // Oct
    ['#7d5f96', '#a98cc0'],   // Nov
    ['#1d3f6e', '#3a6ea8']    // Dec  the flood month
  ];

  var defs = el('defs', {});
  bars.appendChild(defs);
  for (i = 0; i < 12; i++) {
    var g = el('linearGradient', { id: 'bg' + i, x1: 0, y1: 0, x2: 0, y2: 1 });
    g.appendChild(el('stop', { offset: '0%',   'stop-color': SEASON[i][1] }));
    g.appendChild(el('stop', { offset: '100%', 'stop-color': SEASON[i][0] }));
    defs.appendChild(g);
  }

  var barEls = [], barTitle = [];
  for (i = 0; i < 12; i++) {
    var r = el('rect', {
      x: (bpad.l + slotW * i + slotW * 0.16).toFixed(1),
      width: (slotW * 0.68).toFixed(1),
      y: bpad.t + bIH, height: 0, class: 'bar', rx: 2,
      fill: 'url(#bg' + i + ')'
    });
    var ti = el('title', {}, MN[i]);
    r.appendChild(ti);
    bars.appendChild(r);
    barEls.push(r);
    barTitle.push(ti);
    bars.appendChild(el('text', {
      x: (bpad.l + slotW * (i + 0.5)).toFixed(1), y: bh - 4,
      class: 'bm', 'text-anchor': 'middle'
    }, MI[i]));
  }

  // The key for that ramp, built once from the same array the sparkles use, so
  // the legend cannot drift away from the thing it explains.
  var keyEl = document.getElementById('burden-key');
  if (keyEl) {
    var lo = document.createElement('span');
    lo.className = 'k-lab';
    lo.textContent = 'fewer records in this county';
    keyEl.appendChild(lo);
    var sw = document.createElement('span');
    sw.className = 'k-ramp';
    EMBER.forEach(function (c) {
      var b = document.createElement('i');
      b.style.background = c;
      sw.appendChild(b);
    });
    keyEl.appendChild(sw);
    var hiL = document.createElement('span');
    hiL.className = 'k-lab';
    hiL.textContent = 'more';
    keyEl.appendChild(hiL);
  }

  // ---- the panel ----------------------------------------------------------
  var listEl = document.getElementById('burden-list');
  var whenEl = document.getElementById('burden-when');
  var recEl  = document.getElementById('burden-records');
  var capEl  = document.getElementById('burden-cap');

  /* THE SLIDERS CHANGE FEEL, NOT CONTENT. Speed sets how long a year holds;
     sparkle sets how much of it twinkles, down to none. Neither can change
     which year is shown or what it counts — which is why they are allowed on a
     page that otherwise has no controls. */
  var speedEl = document.getElementById('burden-speed');
  var sparkEl = document.getElementById('burden-spark');
  var speedOut = document.getElementById('burden-speed-out');
  var sparkOut = document.getElementById('burden-spark-out');
  var speed = 1, sparkGain = 1;

  /* THE RANKING IS A CHART, so it is drawn like one. Each row carries a
     proportional gradient fill behind the text and a saturated rule beneath it,
     both keyed to a colour ramp that runs by RANK — deep bog green at the top,
     through teal and Atlantic blue, to a warm ochre at sixth. The ramp is
     ordinal decoration, not a second variable: the length of the fill is the
     number, and the colour only says "first" or "fourth", which the position
     already said. Anything else would be a colour scale nobody was given a
     legend for. */
  /* THE RANKING IS A CHART, NOT A CONTROL. The previous version gave each row a
     tinted rounded rectangle and a numbered medallion, and the result read as a
     stack of buttons — six things that looked clickable and were not. This is
     the same data with the chrome taken away: a name, a number, and a bar on a
     hairline track. Nothing is boxed, nothing is raised, and the only colour is
     in the bar itself, which is the part that carries the value.

     --c1/--c2 shade the bar by RANK, deep bog green at the top through to a
     lighter Atlantic blue at sixth. Ordinal decoration only: the LENGTH is the
     number, and the colour repeats an ordering the position already gave. */
  var RAMP = [
    ['#0f4c3a', '#2f8f6b'],
    ['#17614a', '#3f9d78'],
    ['#1c6b5e', '#46a494'],
    ['#1d6285', '#3f92c0'],
    ['#2f7396', '#6bb0d2'],
    ['#4a7f96', '#8fc0d2']
  ];

  var rows = [];                 // reused, so the list morphs rather than blinks
  for (i = 0; i < 6; i++) {
    var li = document.createElement('li');
    li.style.setProperty('--c1', RAMP[i][0]);
    li.style.setProperty('--c2', RAMP[i][1]);

    var nm = document.createElement('span'); nm.className = 'nm';
    var nb = document.createElement('b');
    var track = document.createElement('span'); track.className = 'track';
    var bar = document.createElement('span'); bar.className = 'bar';
    track.appendChild(bar);
    li.appendChild(nm); li.appendChild(nb); li.appendChild(track);
    li.addEventListener('mouseenter', function () { hover(this.dataset.c || null); });
    li.addEventListener('mouseleave', function () { hover(null); });
    listEl.appendChild(li);
    rows.push({ li: li, nm: nm, nb: nb, bar: bar });
  }

  var lit = null;
  function hover(name) {
    if (lit && pathOf[lit]) pathOf[lit].classList.remove('on');
    rows.forEach(function (r) { r.li.classList.remove('on'); });
    lit = name;
    if (name && pathOf[name]) pathOf[name].classList.add('on');
    if (name) {
      rows.forEach(function (r) {
        if (r.li.dataset.c !== name) return;
        r.li.classList.add('on');
        // Borrow the row's own colour for the map outline, so the two views
        // read as one object rather than two that happen to agree.
        pathOf[name] && pathOf[name].style.setProperty(
          'stroke', getComputedStyle(r.li).getPropertyValue('--c1').trim());
      });
    } else {
      for (var nm2 in pathOf) pathOf[nm2].style.removeProperty('stroke');
    }
  }

  // ---- rendering one year -------------------------------------------------
  var at = 0, ids = [], curCounts = {}, curMax = 1;

  function show(k) {
    at = k;
    var yr = years[k];
    ids = perYear[yr];
    var cs = byCounty[yr], ms = byMonth[yr];
    curCounts = cs;
    curMax = washMax;              // shared across years, so colour is comparable

    whenEl.textContent = yr;
    recEl.textContent = ids.length === 1 ? '1 record' : ids.length + ' records';

    // map: lit events
    for (var i = 0; i < LIVE; i++) {
      if (i < ids.length) {
        liveNodes[i].setAttribute('cx', px[ids[i]].toFixed(1));
        liveNodes[i].setAttribute('cy', py[ids[i]].toFixed(1));
        liveNodes[i].setAttribute('r', 2.6);
      } else {
        liveNodes[i].setAttribute('r', 0);
        liveNodes[i].setAttribute('cx', -9);
      }
    }

    // map: county wash. Square root, because Cork's 265 against Leitrim's 2
    // would otherwise leave thirty counties at an opacity indistinguishable
    // from zero. Compressing it is a choice, so the caption states it.
    for (var name in washOf) {
      var n = cs[name] || 0;
      washOf[name].setAttribute('fill-opacity',
        n ? (0.12 + 0.40 * Math.sqrt(n / washMax)).toFixed(3) : 0);
    }

    // bars: January to December, on the shared axis
    for (i = 0; i < 12; i++) {
      var h = barMax ? (ms[i] / barMax) * bIH : 0;
      barEls[i].setAttribute('y', (bpad.t + bIH - h).toFixed(1));
      barEls[i].setAttribute('height', h.toFixed(1));
      barEls[i].classList.toggle('zero', ms[i] === 0);
      barTitle[i].textContent = MN[i] + ' ' + yr + ' — '
        + ms[i] + (ms[i] === 1 ? ' record' : ' records');
    }

    // ranking
    var top = Object.keys(cs).map(function (x) { return [x, cs[x]]; });
    top.sort(function (a, b) { return b[1] - a[1] || (a[0] < b[0] ? -1 : 1); });
    var hi = top.length ? top[0][1] : 1;
    rows.forEach(function (r, i) {
      var t = top[i];
      if (!t) { r.li.hidden = true; r.li.dataset.c = ''; return; }
      r.li.hidden = false;
      r.li.dataset.c = t[0];
      r.nm.textContent = t[0];
      r.nb.textContent = t[1];
      r.bar.style.width = (100 * t[1] / hi) + '%';
    });

    // caption: honest about the thin tail, rather than letting an empty map
    // assert that Ireland stopped flooding
    var thin = ids.length < 12;
    capEl.textContent = thin
      ? yr + ' carries only ' + ids.length + ' dated record'
        + (ids.length === 1 ? '' : 's') + '. The OPW catalogue thins towards '
        + 'the present — that is record-keeping catching up, not a year '
        + 'without floods.'
      : 'Lit points are events dated to ' + yr + '; the faint scatter behind '
        + 'them is the whole recorded catalogue, drawn for shape. County '
        + 'shading uses a square-root scale; the month bars share one axis '
        + 'across every year, so their heights are comparable.';
    capEl.classList.toggle('warn', thin);
  }

  // ---- the loop -----------------------------------------------------------
  var playing = false, timer = null, DWELL = 1500;   // 1.5 s a year
  var reduce = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function dwell() { return DWELL / speed; }
  function step() {
    show(at + 1 >= years.length ? 0 : at + 1);
    timer = setTimeout(step, dwell());
  }
  function play() {
    if (playing || reduce) return;
    playing = true;
    timer = setTimeout(step, dwell());
  }
  function stop() { playing = false; clearTimeout(timer); }

  speedEl.addEventListener('input', function () {
    speed = +speedEl.value / 100;
    speedOut.textContent = speed.toFixed(1) + '×';
    // Applied at once rather than at the end of the current year, or dragging
    // the slider appears to do nothing for two seconds.
    if (playing) { clearTimeout(timer); timer = setTimeout(step, dwell()); }
  });
  sparkEl.addEventListener('input', function () {
    sparkGain = +sparkEl.value / 100;
    sparkOut.textContent = sparkGain ? sparkGain.toFixed(1) + '×' : 'off';
    if (!sparkGain) clearSparks();
  });
  function clearSparks() {
    for (var i = 0; i < POOL; i++) {
      slot[i] = null;
      spark[i].setAttribute('r', 0);
      spark[i].setAttribute('cx', -9);
    }
  }

  /* HOVERING THE MAP HOLDS THE YEAR. The pause is scoped to the map and to the
     ranking, and not to the sliders: dragging Speed while the years froze would
     make the slider look broken. The ranking is included because linking a row
     to its county is pointless if the row is replaced mid-hover. */
  var host = document.getElementById('burden');
  var onScreen = false, held = false;
  function sync() { if (onScreen && !held) play(); else stop(); }
  function holdOn()  { held = true;  sync(); }
  function holdOff() { held = false; sync(); }
  [svg, listEl].forEach(function (n) {
    if (!n) return;
    n.addEventListener('mouseenter', holdOn);
    n.addEventListener('mouseleave', holdOff);
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) { onScreen = e.isIntersecting; });
      sync();
    }, { threshold: 0.2 }).observe(host);
  } else {
    onScreen = true;
    sync();
  }

  // ---- the sparkle --------------------------------------------------------
  var last = 0, debt = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    var dt = last ? Math.min(t - last, 60) : 16;
    last = t;
    if (reduce || !ids.length || !sparkGain) return;

    // Rate follows the year's own volume, so 2015 seethes and 2023 ticks over.
    // Floored so a quiet year still shows life, capped so a heavy one does not
    // strobe.
    debt += Math.max(6, Math.min(70, 5 + ids.length * 0.22))
            * sparkGain * dt / 1000;
    while (debt >= 1) {
      var free = -1;
      for (var i = 0; i < POOL; i++) if (!slot[i]) { free = i; break; }
      if (free < 0) break;
      var pick = ids[(Math.random() * ids.length) | 0];
      slot[free] = { i: pick, age: 0, life: 340 + Math.random() * 400 };
      var n = curCounts[D.counties[D.evt[pick][4]]] || 0;
      var band = Math.min(EMBER.length - 1,
                          Math.floor(Math.sqrt(n / curMax) * EMBER.length));
      spark[free].setAttribute('fill', EMBER[band]);
      spark[free].setAttribute('stroke', EMBER[Math.min(EMBER.length - 1, band + 1)]);
      debt -= 1;
    }
    for (i = 0; i < POOL; i++) {
      var s = slot[i];
      if (!s) continue;
      s.age += dt;
      var u = s.age / s.life;
      if (u >= 1) {
        slot[i] = null;
        spark[i].setAttribute('r', 0);
        spark[i].setAttribute('cx', -9);
        continue;
      }
      var a = Math.sin(Math.PI * u);
      spark[i].setAttribute('cx', px[s.i].toFixed(1));
      spark[i].setAttribute('cy', py[s.i].toFixed(1));
      spark[i].setAttribute('r', (1.8 + 4.0 * a).toFixed(2));
      spark[i].setAttribute('opacity', (0.9 * a).toFixed(3));
    }
  }
  requestAnimationFrame(frame);

  show(0);
  if (reduce) {
    speedEl.disabled = true;
    sparkEl.disabled = true;
    speedOut.textContent = sparkOut.textContent = 'off';
  }
})();
