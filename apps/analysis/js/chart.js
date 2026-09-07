/* GENERATED COPY -- do not edit.
   Source: apps/analysis/js/chart.js
   Rebuild: python tools/homepage/build_homepage_app.py
   The static homepage build shares every view module with the server app;
   the only file that differs is the data layer (api-static.js). */
/* Dependency-free SVG chart renderer (no CDN, works fully offline).

   drawChart(svg, spec) where spec = {
     x:      ['YYYY-MM-DD', ...],
     series: [{mean:[], lo:[], hi:[], color, fill(bool), label}],
     yLabel, hline: {value, label}, integerY(bool)
   } */
var CH = (function () {
  var NS = 'http://www.w3.org/2000/svg';
  var gradSeq = 0;          // unique ids for the two-colour gradients
  var PAD = { l: 58, r: 14, t: 10, b: 26 };
  var H_DEFAULT = 148;

  function el(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) {
      n.setAttribute(k, attrs[k]);
    }
    return n;
  }

  /* JavaScript's isFinite COERCES, and `isFinite(null) === true` because null
     becomes 0. Every gap in these series is a JSON null, so a bare isFinite()
     silently turns "no data" into "the value zero" -- which is how the ±SD band
     came to be filled down to the zero line wherever a day was missing. Use this
     everywhere a value might be absent. */
  function isNum(v) {
    return v !== null && v !== undefined && v !== '' && isFinite(v);
  }

  function finite(a) {
    var out = [];
    for (var i = 0; i < a.length; i++) {
      var v = a[i];
      if (v !== null && v !== undefined && isFinite(v)) out.push(v);
    }
    return out;
  }

  /* "nice" y bounds with a little headroom.
     A caller can pin them with spec.yDomain -- the Fit panel does exactly that,
     so its curves sit on the SAME vertical scale as the wellbeing panel and the
     two can be read against each other instead of each auto-scaling. */
  function bounds(spec) {
    if (spec.yDomain && isFinite(spec.yDomain[0]) && isFinite(spec.yDomain[1])
        && spec.yDomain[1] > spec.yDomain[0]) {
      return [spec.yDomain[0], spec.yDomain[1]];
    }
    var all = [];
    spec.series.forEach(function (s) {
      all = all.concat(finite(s.mean));
      if (s.lo) all = all.concat(finite(s.lo));
      if (s.hi) all = all.concat(finite(s.hi));
    });
    if (spec.hline && isFinite(spec.hline.value)) all.push(spec.hline.value);
    if (!all.length) return [0, 1];
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    if (lo === hi) { lo -= 0.5; hi += 0.5; }
    var pad = (hi - lo) * 0.10;
    lo -= pad; hi += pad;
    if (spec.integerY) { lo = Math.min(0, Math.floor(lo)); hi = Math.ceil(hi); }
    return [lo, hi];
  }

  function ticksY(lo, hi, n, integer) {
    var out = [], step = (hi - lo) / n, i;
    for (i = 0; i <= n; i++) {
      var v = lo + step * i;
      if (integer) v = Math.round(v);
      if (out.indexOf(v) === -1) out.push(v);
    }
    return out;
  }

  function drawChart(svg, spec) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var W = svg.clientWidth || svg.parentNode.clientWidth || 900;
    /* `spec.height` lets a CONTEXT panel be shorter than a primary one. The
       monthly climate reference inside a day-level window is one or two points;
       giving it the same height as the index it sits beside would spend a third
       of the screen on a flat line and push the reading below the fold. */
    var H = spec.height || H_DEFAULT;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('height', H);

    var n = spec.x.length;
    if (!n) return;
    /* A compact panel in a three-across row is about a third the width, where a
       58px gutter would swallow a fifth of the plot. */
    var pad = spec.height
      ? { l: (W < 420 ? 38 : PAD.l), r: PAD.r, t: PAD.t, b: PAD.b }
      : PAD;
    var iw = Math.max(10, W - pad.l - pad.r), ih = H - pad.t - pad.b;
    var b = bounds(spec), lo = b[0], hi = b[1];
    // Publish it so another panel can pin itself to this one's scale.
    spec.yDomainUsed = [lo, hi];

    /* X is positioned by DATE over a SHARED domain (spec.domain), so panels
       with different sampling -- e.g. daily constructs vs the monthly climate
       reference -- still line up column-for-column. */
    var ts = spec.x.map(function (d) { return Date.parse(d); });
    var d0 = spec.domain ? Date.parse(spec.domain[0]) : ts[0];
    var d1 = spec.domain ? Date.parse(spec.domain[1]) : ts[n - 1];
    var span = (d1 - d0) || 1;
    var X = function (i) {
      if (n === 1 && !spec.domain) return pad.l + iw / 2;
      return pad.l + iw * (ts[i] - d0) / span;
    };
    var Y = function (v) { return pad.t + ih - ih * (v - lo) / (hi - lo); };

    // --- y grid + labels ---
    ticksY(lo, hi, 3, !!spec.integerY).forEach(function (v) {
      var y = Y(v);
      if (y < pad.t - 1 || y > pad.t + ih + 1) return;
      svg.appendChild(el('line', { class: 'grid', x1: pad.l, x2: W - pad.r, y1: y, y2: y }));
      var t = el('text', { class: 'tick', x: pad.l - 6, y: y + 3, 'text-anchor': 'end' });
      t.textContent = spec.integerY ? String(v) : (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2));
      svg.appendChild(t);
    });

    // --- x ticks + VERTICAL grid lines (about 6, always the first) ---
    var step = Math.max(1, Math.round(n / 6));
    for (var i = 0; i < n; i += step) {
      var gx = X(i);
      svg.appendChild(el('line', { class: 'grid', x1: gx, x2: gx,
                                   y1: pad.t, y2: pad.t + ih }));
      var t2 = el('text', { class: 'tick', x: gx, y: H - 8, 'text-anchor': 'middle' });
      t2.textContent = spec.x[i].slice(0, n > 24 ? 7 : 10);
      svg.appendChild(t2);
    }
    svg.appendChild(el('line', { class: 'axis', x1: pad.l, x2: W - pad.r,
                                 y1: pad.t + ih, y2: pad.t + ih }));

    // --- mean line (drawn under the series, above the grid) ---
    if (spec.meanLine && isFinite(spec.meanLine.value)) {
      var my = Y(spec.meanLine.value);
      svg.appendChild(el('line', { class: 'mean-line', x1: pad.l, x2: W - pad.r,
                                   y1: my, y2: my,
                                   stroke: spec.meanLine.color || '#64748b' }));
      var mt = el('text', { class: 'mean-label', x: W - pad.r, y: my - 3,
                            'text-anchor': 'end',
                            fill: spec.meanLine.color || '#64748b' });
      mt.textContent = spec.meanLine.label || '';
      svg.appendChild(mt);
    }

    // --- long-term-average reference line ---
    if (spec.hline && isFinite(spec.hline.value)) {
      var hy = Y(spec.hline.value);
      svg.appendChild(el('line', { class: 'lta', x1: pad.l, x2: W - pad.r, y1: hy, y2: hy }));
      var lt = el('text', { class: 'lta-label', x: W - pad.r, y: hy - 3, 'text-anchor': 'end' });
      lt.textContent = spec.hline.label || '';
      svg.appendChild(lt);
    }

    /* --- event marking: the impact days as a band, day 0 as a rule ---
       Drawn UNDER the series so it never hides a value. The band is the days
       the storm or flood actually ran; the rule is the anchor the before/after
       split uses, and the two differ for any multi-day event -- showing only
       the rule would imply a precision the event does not have. */
    if (spec.vband && spec.vband.from && spec.vband.to) {
      var bx1 = pad.l + iw * (Date.parse(spec.vband.from) - d0) / span;
      var bx2 = pad.l + iw * (Date.parse(spec.vband.to) - d0) / span;
      if (isFinite(bx1) && isFinite(bx2)) {
        svg.appendChild(el('rect', {
          x: Math.min(bx1, bx2), y: pad.t,
          width: Math.max(2, Math.abs(bx2 - bx1)), height: ih,
          fill: spec.vband.color || '#8e44ad', 'fill-opacity': 0.10 }));
      }
    }
    if (spec.vline && spec.vline.date) {
      var vx = pad.l + iw * (Date.parse(spec.vline.date) - d0) / span;
      if (isFinite(vx)) {
        svg.appendChild(el('line', { class: 'event-line', x1: vx, x2: vx,
                                     y1: pad.t, y2: pad.t + ih,
                                     stroke: spec.vline.color || '#8e44ad' }));
        if (spec.vline.label) {
          var vt = el('text', { class: 'event-label', x: vx + 4, y: pad.t + 10,
                                fill: spec.vline.color || '#8e44ad' });
          vt.textContent = spec.vline.label;
          svg.appendChild(vt);
        }
      }
    }

    // --- each series: band then line ---
    spec.series.forEach(function (s) {
      /* The band is drawn as ONE POLYGON PER CONTIGUOUS RUN, not one polygon
         for the whole series. A single polygon spanning a gap closes straight
         across it and paints a band over days that have no data -- exactly the
         stretch where the reader most needs to see that there is nothing. A run
         also requires a numeric MEAN, so the band never appears where the line
         does not. */
      if (s.fill && s.lo && s.hi) {
        var up = [], dn = [];
        var flush = function () {
          if (up.length) {
            svg.appendChild(el('polygon', { points: up.concat(dn).join(' '),
                                            fill: s.color,
                                            'fill-opacity': 0.16 }));
          }
          up = []; dn = [];
        };
        for (var i2 = 0; i2 < n; i2++) {
          if (isNum(s.mean[i2]) && isNum(s.hi[i2]) && isNum(s.lo[i2])) {
            up.push(X(i2) + ',' + Y(s.hi[i2]));
            dn.unshift(X(i2) + ',' + Y(s.lo[i2]));
          } else {
            flush();
          }
        }
        flush();
      }
      /* `spec.step` draws a staircase rather than a sloped join, for series
         that are PIECEWISE CONSTANT over their bin. The climate reference is
         monthly: a step says "this value held across the month", which is what
         a monthly total means, whereas a sloped line would draw a within-month
         trend the data cannot support. */
      var d = '', pen = false, prevY = null;
      for (var j = 0; j < n; j++) {
        var v = s.mean[j];
        if (!isNum(v)) { pen = false; prevY = null; continue; }
        if (pen && spec.step && prevY !== null) {
          d += ' L' + X(j) + ',' + prevY;          // hold, then step
        }
        d += (pen ? ' L' : ' M') + X(j) + ',' + Y(v);
        prevY = Y(v);
        pen = true;
      }
      if (d) {
        /* TWO COLOURS: a vertical linearGradient whose hard stop sits exactly on
           the mean, so the stroke reads one colour above it and another below --
           a single path, so the line stays continuous. */
        var strokePaint = s.color;
        if (s.split && isNum(s.split.at)) {
          var gid = 'g' + (gradSeq++);
          var frac = (Y(s.split.at) - pad.t) / (ih || 1);   // 0=top .. 1=bottom
          frac = Math.max(0, Math.min(1, frac));
          var lg = el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
          [[0, s.split.above], [frac, s.split.above],
           [frac, s.split.below], [1, s.split.below]].forEach(function (st) {
            lg.appendChild(el('stop', { offset: (st[0] * 100) + '%',
                                        'stop-color': st[1] }));
          });
          var defs = el('defs', {});
          defs.appendChild(lg);
          svg.appendChild(defs);
          strokePaint = 'url(#' + gid + ')';
        }
        var pathAttrs = { d: d.trim(), fill: 'none', stroke: strokePaint,
                          'stroke-width': s.width || 1.8,
                          'stroke-linejoin': 'round' };
        /* Overlay series (e.g. the ARMA fit) draw dashed so the observed
           trace stays the primary reading. */
        if (s.dash) { pathAttrs['stroke-dasharray'] = s.dash; }
        svg.appendChild(el('path', pathAttrs));
      }
      if (n <= 60 && !s.noDots) {
        for (var k = 0; k < n; k++) {
          if (isNum(s.mean[k])) {
            var dc = s.color;
            if (s.split && isNum(s.split.at)) {
              dc = (s.mean[k] >= s.split.at) ? s.split.above : s.split.below;
            }
            svg.appendChild(el('circle', { class: 'dot', cx: X(k), cy: Y(s.mean[k]),
                                           r: 2.4, fill: dc }));
          }
        }
      }
    });

    // --- hover: vertical guide + tooltip, LINKED across every panel ---
    var guide = el('line', { class: 'hover-line', y1: pad.t, y2: pad.t + ih,
                             x1: -10, x2: -10 });
    svg.appendChild(guide);
    var hit = el('rect', { x: pad.l, y: pad.t, width: iw, height: ih,
                           fill: 'transparent' });
    svg.appendChild(hit);

    /* Place this chart's guide at a TIME (not an index), so panels sampled
       differently -- e.g. daily constructs vs the monthly climate reference --
       line up on the same instant. Returns the nearest point for the tooltip. */
    svg._setGuide = function (tms) {
      if (tms === null || tms === undefined) {
        guide.setAttribute('x1', -10); guide.setAttribute('x2', -10);
        return null;
      }
      var px = pad.l + iw * (tms - d0) / span;
      guide.setAttribute('x1', px); guide.setAttribute('x2', px);
      var best = 0, bd = Infinity;
      for (var i = 0; i < n; i++) {
        var d = Math.abs(ts[i] - tms);
        if (d < bd) { bd = d; best = i; }
      }
      return { idx: best, label: spec.x[best], series: spec.series,
               integerY: !!spec.integerY, title: spec.yLabel };
    };

    hit.addEventListener('mousemove', function (ev) {
      var r = svg.getBoundingClientRect();
      var rel = (ev.clientX - r.left - pad.l) / (iw || 1);
      rel = Math.max(0, Math.min(1, rel));
      CH.broadcast(d0 + span * rel, ev.clientX, ev.clientY);
    });
    hit.addEventListener('mouseleave', function () { CH.broadcast(null); });
  }

  /* ---- categorical bars: histograms and ordinal distributions ---------
     A separate renderer rather than a mode of drawChart, because the two share
     almost nothing: this one has no dates, no shared x domain, no linked hover
     and no bands. Forcing them together would mean a chart function where half
     the parameters are ignored depending on the other half.

     spec = { labels: [...], values: [...], color, yLabel, xLabel,
              note: '', marks: [{at: index, label}] }                        */
  function drawBars(svg, spec) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var vals = (spec.values || []).map(function (v) {
      return (v === null || v === undefined || !isFinite(v)) ? 0 : +v;
    });
    var n = vals.length;
    var W = svg.clientWidth || svg.parentNode.clientWidth || 900;
    var HB = spec.height || 160;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + HB);
    svg.setAttribute('height', HB);
    if (!n) return;

    /* The left gutter holds the y tick labels, so it can shrink when the panel
       does. Three construct distributions sit side by side in one row and are
       roughly a third the width of a full-width panel; a fixed 58px gutter
       would there eat a fifth of the plot. */
    var pad = { l: W < 420 ? 38 : 58, r: 14, t: 10, b: 30 };
    var iw = Math.max(10, W - pad.l - pad.r), ih = HB - pad.t - pad.b;
    var hi = Math.max.apply(null, vals) || 1;
    var Y = function (v) { return pad.t + ih - ih * (v / hi); };

    [0, 0.5, 1].forEach(function (f) {
      var y = pad.t + ih - ih * f;
      svg.appendChild(el('line', { class: 'grid', x1: pad.l, x2: W - pad.r,
                                   y1: y, y2: y }));
      var t = el('text', { class: 'tick', x: pad.l - 6, y: y + 3,
                           'text-anchor': 'end' });
      var v = hi * f;
      t.textContent = v >= 1000 ? Math.round(v / 1000) + 'k'
                                : (v >= 10 ? Math.round(v) : v.toFixed(1));
      svg.appendChild(t);
    });

    var bw = iw / n;
    for (var i = 0; i < n; i++) {
      var x = pad.l + bw * i;
      var y = Y(vals[i]);
      svg.appendChild(el('rect', {
        class: 'bar', x: x + bw * 0.10, y: y,
        width: Math.max(1, bw * 0.80), height: Math.max(0, pad.t + ih - y),
        fill: spec.color || '#334155', 'fill-opacity': 0.85 }));
    }
    svg.appendChild(el('line', { class: 'axis', x1: pad.l, x2: W - pad.r,
                                 y1: pad.t + ih, y2: pad.t + ih }));

    // Label about eight bars, always the first and last, so a 40-bin histogram
    // gets a readable axis instead of forty overlapping numbers.
    var every = Math.max(1, Math.ceil(n / 8));
    for (var k = 0; k < n; k++) {
      if (k % every && k !== n - 1) continue;
      var lt = el('text', { class: 'tick', x: pad.l + bw * (k + 0.5),
                            y: HB - 12, 'text-anchor': 'middle' });
      lt.textContent = (spec.labels || [])[k] !== undefined
        ? String(spec.labels[k]) : String(k);
      svg.appendChild(lt);
    }
    if (spec.xLabel) {
      var xl = el('text', { class: 'axis-label', x: pad.l + iw / 2, y: HB - 1,
                            'text-anchor': 'middle' });
      xl.textContent = spec.xLabel;
      svg.appendChild(xl);
    }

    // Hover reads the exact bar, which an 8-label axis otherwise hides.
    var hit = el('rect', { x: pad.l, y: pad.t, width: iw, height: ih,
                           fill: 'transparent' });
    svg.appendChild(hit);
    hit.addEventListener('mousemove', function (ev) {
      var r = svg.getBoundingClientRect();
      var idx = Math.floor((ev.clientX - r.left - pad.l) / (bw || 1));
      if (idx < 0 || idx >= n) { tip(null); return; }
      var lab = (spec.labels || [])[idx];
      tip(ev.clientX, ev.clientY,
          (spec.yLabel ? spec.yLabel + '\n' : '') +
          (lab === undefined ? '' : lab + ': ') +
          vals[idx].toLocaleString() +
          (spec.pct ? '  (' + fmtNum(spec.pct[idx], 1) + '%)' : ''));
    });
    hit.addEventListener('mouseleave', function () { tip(null); });
  }


  /* ---- the horizon picker ----------------------------------------------
     A full-range rainfall record that the reader CLICKS to choose a window.
     It is a control, not a read-out, which is why it is a renderer of its own
     rather than a flag on drawChart: it owns a hover rule that tracks the
     cursor by date, a shaded preview of the window a click would open, event
     markers along the top, and a click handler. None of that belongs on the
     panels, and bolting it on as options would leave drawChart with a set of
     parameters that only ever apply to one caller.

     spec = { x, rain, floods, storms, lta, events, selected, days, mode,
              onPick(dateString), height }                                  */
  function drawHorizon(svg, spec) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var xs = spec.x || [];
    var n = xs.length;
    var W = svg.clientWidth || svg.parentNode.clientWidth || 900;
    var HH = spec.height || 190;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + HH);
    svg.setAttribute('height', HH);
    if (!n) return;

    var pad = { l: 52, r: 14, t: 20, b: 26 };
    var iw = Math.max(10, W - pad.l - pad.r), ih = HH - pad.t - pad.b;
    var vals = (spec.rain || []).map(function (v) {
      return (v === null || v === undefined || !isFinite(v)) ? 0 : +v;
    });
    var hi = Math.max.apply(null, vals.concat([spec.lta || 0])) || 1;
    hi *= 1.08;

    /* Positioned by DATE, not by index, so a click maps back to a real day
       rather than to "the i-th month". */
    var ts = xs.map(function (d) { return Date.parse(d); });
    var d0 = ts[0], d1 = ts[n - 1] || (d0 + 1);
    // the last bin covers its own month, so extend the domain to its end
    var dEnd = d1 + 30.44 * 86400000;
    var span = (dEnd - d0) || 1;
    var X = function (ms) { return pad.l + iw * (ms - d0) / span; };
    var Y = function (v) { return pad.t + ih - ih * (v / hi); };
    var atX = function (px) {
      var f = Math.min(1, Math.max(0, (px - pad.l) / iw));
      return new Date(d0 + f * span);
    };

    [0, 0.5, 1].forEach(function (f) {
      var y = pad.t + ih - ih * f;
      svg.appendChild(el('line', { class: 'grid', x1: pad.l, x2: W - pad.r,
                                   y1: y, y2: y }));
      var tk = el('text', { class: 'tick', x: pad.l - 6, y: y + 3,
                            'text-anchor': 'end' });
      tk.textContent = Math.round(hi * f);
      svg.appendChild(tk);
    });

    // --- the window a click would open, drawn UNDER the data --------------
    var band = el('rect', { class: 'pick-band', x: pad.l, y: pad.t,
                            width: 0, height: ih, fill: '#2874a6',
                            'fill-opacity': 0.10 });
    svg.appendChild(band);

    // --- rainfall as an area, so a wet month reads as bulk ----------------
    var d = 'M ' + X(ts[0]) + ' ' + Y(0);
    for (var i = 0; i < n; i++) {
      d += ' L ' + X(ts[i]) + ' ' + Y(vals[i]);
    }
    d += ' L ' + X(dEnd) + ' ' + Y(vals[n - 1]) + ' L ' + X(dEnd) + ' ' + Y(0) + ' Z';
    svg.appendChild(el('path', { d: d, fill: '#2874a6', 'fill-opacity': 0.18,
                                 stroke: '#2874a6', 'stroke-width': 1.2 }));

    if (spec.lta !== null && spec.lta !== undefined && isFinite(spec.lta)) {
      svg.appendChild(el('line', { class: 'lta', x1: pad.l, x2: W - pad.r,
                                   y1: Y(spec.lta), y2: Y(spec.lta) }));
      var ll = el('text', { class: 'lta-label', x: W - pad.r,
                            y: Y(spec.lta) - 3, 'text-anchor': 'end' });
      ll.textContent = 'LTA ' + Math.round(spec.lta) + ' mm';
      svg.appendChild(ll);
    }

    /* --- event markers along the top ---------------------------------------
       Ticks, not labels: about a hundred events over sixteen years cannot be
       named on one axis without becoming a smear. The name arrives on hover,
       where there is room for exactly one. */
    (spec.events || []).forEach(function (e) {
      var ms = Date.parse(e.anchor);
      if (!isFinite(ms) || ms < d0 || ms > dEnd) return;
      svg.appendChild(el('line', {
        class: 'ev-tick ev-' + e.kind, x1: X(ms), x2: X(ms),
        y1: pad.t - 8, y2: pad.t - 1,
        stroke: e.kind === 'flood' ? '#5d6d7e' : '#8e44ad',
        'stroke-width': 1.4 }));
    });

    // --- year ticks --------------------------------------------------------
    var y0 = new Date(d0).getUTCFullYear(), y1 = new Date(dEnd).getUTCFullYear();
    var step = Math.max(1, Math.ceil((y1 - y0 + 1) / 10));
    for (var yy = y0; yy <= y1; yy += step) {
      var ms2 = Date.UTC(yy, 0, 1);
      if (ms2 < d0 || ms2 > dEnd) continue;
      var tx = el('text', { class: 'tick', x: X(ms2), y: HH - 8,
                            'text-anchor': 'middle' });
      tx.textContent = yy;
      svg.appendChild(tx);
    }
    svg.appendChild(el('line', { class: 'axis', x1: pad.l, x2: W - pad.r,
                                 y1: pad.t + ih, y2: pad.t + ih }));

    // --- the chosen day ----------------------------------------------------
    var sel = el('line', { class: 'event-line pick-line', x1: 0, x2: 0,
                           y1: pad.t, y2: pad.t + ih, stroke: '#c0392b' });
    sel.setAttribute('visibility', 'hidden');
    svg.appendChild(sel);
    if (spec.selected) {
      var sms = Date.parse(spec.selected);
      if (isFinite(sms)) {
        sel.setAttribute('visibility', 'visible');
        sel.setAttribute('x1', X(sms)); sel.setAttribute('x2', X(sms));
        var w0 = spec.days * 86400000;
        var a = X(sms - w0);
        var bx = X(sms + (spec.mode === 'single' ? 0 : w0));
        band.setAttribute('x', Math.max(pad.l, a));
        band.setAttribute('width', Math.max(1, Math.min(W - pad.r, bx) -
                                               Math.max(pad.l, a)));
      }
    }

    // --- hover + click -----------------------------------------------------
    var hover = el('line', { class: 'hover-line', x1: 0, x2: 0, y1: pad.t,
                             y2: pad.t + ih });
    hover.setAttribute('visibility', 'hidden');
    svg.appendChild(hover);

    var hit = el('rect', { x: pad.l, y: pad.t, width: iw, height: ih,
                           fill: 'transparent', class: 'pick-hit' });
    svg.appendChild(hit);

    function iso(dte) {
      function p2(k) { return (k < 10 ? '0' : '') + k; }
      return dte.getUTCFullYear() + '-' + p2(dte.getUTCMonth() + 1) + '-' +
             p2(dte.getUTCDate());
    }
    function nearestEvent(ms) {
      var best = null, bd = 1e18;
      (spec.events || []).forEach(function (e) {
        var dd = Math.abs(Date.parse(e.anchor) - ms);
        if (dd < bd) { bd = dd; best = e; }
      });
      return (bd <= 20 * 86400000) ? best : null;
    }

    hit.addEventListener('mousemove', function (ev) {
      var r = svg.getBoundingClientRect();
      var px = (ev.clientX - r.left) * (W / r.width);
      var dte = atX(px);
      hover.setAttribute('visibility', 'visible');
      hover.setAttribute('x1', X(dte.getTime()));
      hover.setAttribute('x2', X(dte.getTime()));
      var near = nearestEvent(dte.getTime());
      tip(ev.clientX, ev.clientY,
          iso(dte) + '\nclick to centre the window here' +
          (near ? '\nnear: ' + near.label + ' (' + near.anchor + ')' : ''));
    });
    hit.addEventListener('mouseleave', function () {
      hover.setAttribute('visibility', 'hidden');
      tip(null);
    });
    hit.addEventListener('click', function (ev) {
      if (typeof spec.onPick !== 'function') return;
      var r = svg.getBoundingClientRect();
      var px = (ev.clientX - r.left) * (W / r.width);
      var dte = atX(px);
      /* Snap to a nearby event when the click is close to one: the ticks are
         there to be aimed at, and hitting an exact anchor with a mouse over
         sixteen years of x-axis is not a reasonable thing to ask. */
      var near = nearestEvent(dte.getTime());
      spec.onPick(near ? near.anchor : iso(dte), near || null);
    });
  }

  /* ---- linked hover across all charts -------------------------------- */
  var charts = [];
  function register(svg) { if (charts.indexOf(svg) === -1) charts.push(svg); }
  function forget(svg) {
    var i = charts.indexOf(svg);
    if (i !== -1) charts.splice(i, 1);
  }

  function broadcast(tms, cx, cy) {
    var lines = [], stamp = null;
    charts.forEach(function (s) {
      if (typeof s._setGuide !== 'function') return;
      var hit = s._setGuide(tms);
      if (!hit || tms === null) return;
      if (!stamp) { stamp = hit.label; lines.push(hit.label); }
      var multi = hit.series.length > 1;
      hit.series.forEach(function (ser) {
        var v = ser.mean[hit.idx];
        // With an overlay present, a gap in one series should not add a noisy
        // "n/a" row -- the other series still reads cleanly.
        if (multi && (v === null || v === undefined || !isFinite(v))) return;
        // One series -> the panel title identifies it; several -> name each.
        var name = multi ? ((hit.title || '') + ' · ' + (ser.label || ''))
                         : (hit.title || ser.label || '');
        lines.push(name + ': ' + fmtNum(v, hit.integerY ? 0 : 2));
      });
    });
    if (tms === null) { tip(null); return; }
    tip(cx, cy, lines.join('\n'));
  }

  /* Singleton tooltip shared by every chart. */
  var tipEl = null;
  function tip(x, y, text) {
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.className = 'tooltip';
      document.body.appendChild(tipEl);
    }
    if (x === null) { tipEl.className = 'tooltip'; return; }
    tipEl.textContent = text;
    tipEl.style.left = (x + 14) + 'px';
    tipEl.style.top = (y + 12) + 'px';
    tipEl.className = 'tooltip on';
  }

  return { draw: drawChart, bars: drawBars, horizon: drawHorizon,
           tip: tip, register: register,
           forget: forget, broadcast: broadcast };
})();
