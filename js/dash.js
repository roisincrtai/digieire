/* A very small SVG chart kit for the homepage dashboards.

   Separate from the analysis app's chart.js on purpose. That renderer carries a
   shared x domain, linked hover across a panel stack, confidence bands and a
   print stylesheet, because it draws one coherent stack of time series. These
   dashboards want a scatter map, a bar timeline and a couple of lines, and
   bending the other renderer to cover both would leave a module where half the
   options are ignored depending on the other half.

   Everything is drawn from data already in memory -- the page loads its figures
   as script assignments, never with fetch -- so `file://` works exactly like a
   web server, and there is no loading state anywhere on the page.

   Charts are responsive by viewBox rather than by re-measuring: one attribute,
   no resize listener, and they stay sharp at any width. */
var DASH = (function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, text) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) {
      if (attrs[k] !== null && attrs[k] !== undefined) {
        n.setAttribute(k, attrs[k]);
      }
    }
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function svg(host, w, h, cls) {
    var s = el('svg', {
      viewBox: '0 0 ' + w + ' ' + h,
      class: 'dash-svg' + (cls ? ' ' + cls : ''),
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img'
    });
    host.appendChild(s);
    return s;
  }

  function fmt(v, dp) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return Number(v).toFixed(dp === undefined ? 0 : dp);
  }

  /* Rounded tick values across [lo, hi]. Small and predictable beats clever. */
  function ticks(lo, hi, n) {
    if (!(hi > lo)) return [lo];
    var raw = (hi - lo) / (n || 4);
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var step = mag;
    [1, 2, 2.5, 5, 10].some(function (m) {
      if (mag * m >= raw) { step = mag * m; return true; }
      return false;
    });
    var out = [], v = Math.ceil(lo / step) * step;
    for (; v <= hi + step * 1e-6; v += step) out.push(+v.toFixed(6));
    return out;
  }

  /* A monotone cubic: smooth, and it cannot overshoot into a value the record
     does not contain. The same reasoning as the offline figures. */
  function smooth(pts) {
    var n = pts.length, i;
    if (n < 2) return '';
    if (n === 2) return 'M' + pts[0][0] + ',' + pts[0][1] + 'L' + pts[1][0] + ',' + pts[1][1];
    var dx = [], dy = [], sl = [];
    for (i = 0; i < n - 1; i++) {
      dx.push(pts[i + 1][0] - pts[i][0]);
      dy.push(pts[i + 1][1] - pts[i][1]);
      sl.push(dx[i] ? dy[i] / dx[i] : 0);
    }
    var m = [sl[0]];
    for (i = 1; i < n - 1; i++) {
      m.push(sl[i - 1] * sl[i] <= 0 ? 0 : (sl[i - 1] + sl[i]) / 2);
    }
    m.push(sl[n - 2]);
    for (i = 0; i < n - 1; i++) {
      if (sl[i] === 0) { m[i] = m[i + 1] = 0; continue; }
      var a = m[i] / sl[i], b = m[i + 1] / sl[i], s = a * a + b * b;
      if (s > 9) {
        var k = 3 / Math.sqrt(s);
        m[i] = k * a * sl[i];
        m[i + 1] = k * b * sl[i];
      }
    }
    var d = 'M' + pts[0][0].toFixed(2) + ',' + pts[0][1].toFixed(2);
    for (i = 0; i < n - 1; i++) {
      var h = dx[i];
      d += 'C' + (pts[i][0] + h / 3).toFixed(2) + ',' + (pts[i][1] + m[i] * h / 3).toFixed(2)
         + ' ' + (pts[i + 1][0] - h / 3).toFixed(2) + ',' + (pts[i + 1][1] - m[i + 1] * h / 3).toFixed(2)
         + ' ' + pts[i + 1][0].toFixed(2) + ',' + pts[i + 1][1].toFixed(2);
    }
    return d;
  }

  var UID = 0;

  /* ---- line / area chart ------------------------------------------------
     spec = { rows:[[x,y],...], colour, yLabel, xLabel, dp, baseline,
              trend:bool, fill:bool, marks:[x,...] }                       */
  function line(host, spec) {
    var W = 720, H = spec.height || 260;
    var pad = { l: 54, r: 18, t: 16, b: 34 };
    var s = svg(host, W, H);
    var rows = (spec.rows || []).filter(function (r) {
      return r[1] !== null && r[1] !== undefined && isFinite(r[1]);
    });
    if (!rows.length) return s;
    var xs = rows.map(function (r) { return r[0]; });
    var ys = rows.map(function (r) { return r[1]; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
    if (spec.baseline !== undefined) { lo = Math.min(lo, spec.baseline); hi = Math.max(hi, spec.baseline); }
    var pd = (hi - lo) * 0.12 || 1;
    lo -= pd; hi += pd;
    var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    var X = function (v) { return pad.l + iw * (v - x0) / ((x1 - x0) || 1); };
    var Y = function (v) { return pad.t + ih - ih * (v - lo) / ((hi - lo) || 1); };

    ticks(lo, hi, 4).forEach(function (t) {
      var y = Y(t);
      if (y < pad.t - 1 || y > pad.t + ih + 1) return;
      s.appendChild(el('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, class: 'dg' }));
      s.appendChild(el('text', { x: pad.l - 8, y: y + 3.5, class: 'dt', 'text-anchor': 'end' },
                       fmt(t, spec.dp)));
    });
    (spec.marks || []).forEach(function (mx) {
      if (mx < x0 || mx > x1) return;
      s.appendChild(el('line', { x1: X(mx), x2: X(mx), y1: pad.t, y2: pad.t + ih,
                                 class: 'dmark' }));
    });
    if (spec.baseline !== undefined) {
      s.appendChild(el('line', { x1: pad.l, x2: W - pad.r, y1: Y(spec.baseline),
                                 y2: Y(spec.baseline), class: 'dbase' }));
      if (spec.baselineLabel) {
        s.appendChild(el('text', { x: W - pad.r, y: Y(spec.baseline) - 5,
                                   class: 'dt', 'text-anchor': 'end' },
                         spec.baselineLabel));
      }
    }

    var pts = rows.map(function (r) { return [X(r[0]), Y(r[1])]; });
    var d = smooth(pts);
    if (spec.fill !== false) {
      var gid = 'dg' + (UID++);
      var defs = el('defs', {});
      var g = el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
      g.appendChild(el('stop', { offset: '0%', 'stop-color': spec.colour, 'stop-opacity': '.30' }));
      g.appendChild(el('stop', { offset: '100%', 'stop-color': spec.colour, 'stop-opacity': '0' }));
      defs.appendChild(g);
      s.appendChild(defs);
      s.appendChild(el('path', {
        d: d + 'L' + pts[pts.length - 1][0].toFixed(2) + ',' + (pad.t + ih)
           + 'L' + pts[0][0].toFixed(2) + ',' + (pad.t + ih) + 'Z',
        fill: 'url(#' + gid + ')'
      }));
    }
    s.appendChild(el('path', { d: d, fill: 'none', stroke: spec.colour,
                               'stroke-width': 2, 'stroke-linejoin': 'round' }));

    /* An ordinary least-squares line, drawn dashed and labelled as a trend so
       it can never be mistaken for the record itself. */
    if (spec.trend && rows.length > 4) {
      var n = rows.length, sx = 0, sy = 0, sxy = 0, sxx = 0;
      rows.forEach(function (r) { sx += r[0]; sy += r[1]; sxy += r[0] * r[1]; sxx += r[0] * r[0]; });
      var b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
      var a = (sy - b * sx) / n;
      s.appendChild(el('line', {
        x1: X(x0), y1: Y(a + b * x0), x2: X(x1), y2: Y(a + b * x1),
        stroke: spec.colour, 'stroke-width': 1.4, 'stroke-dasharray': '6 4',
        'stroke-opacity': '.75'
      }));
      s.appendChild(el('text', { x: W - pad.r, y: pad.t + 12, class: 'dtrend',
                                 'text-anchor': 'end', fill: spec.colour },
                       'trend ' + (b >= 0 ? '+' : '') + fmt(b * 10, spec.dp === 0 ? 1 : 2) +
                       ' / decade'));
    }

    [x0, Math.round((x0 + x1) / 2), x1].forEach(function (v, i) {
      s.appendChild(el('text', { x: X(v), y: H - 10, class: 'dt',
                                 'text-anchor': i === 0 ? 'start' : (i === 2 ? 'end' : 'middle') },
                       String(v)));
    });
    if (spec.yLabel) {
      s.appendChild(el('text', { x: pad.l, y: 11, class: 'dax' }, spec.yLabel));
    }
    return s;
  }

  /* ---- bars -------------------------------------------------------------
     spec = { rows:[[label, value],...], colour, dp, every }               */
  function bars(host, spec) {
    var W = 720, H = spec.height || 240;
    var pad = { l: 54, r: 18, t: 16, b: 34 };
    var s = svg(host, W, H);
    var rows = spec.rows || [];
    if (!rows.length) return s;
    var vals = rows.map(function (r) { return r[1]; });
    var hi = Math.max.apply(null, vals) * 1.12 || 1;
    var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    var bw = iw / rows.length;
    var Y = function (v) { return pad.t + ih - ih * (v / hi); };

    ticks(0, hi, 4).forEach(function (t) {
      s.appendChild(el('line', { x1: pad.l, x2: W - pad.r, y1: Y(t), y2: Y(t), class: 'dg' }));
      s.appendChild(el('text', { x: pad.l - 8, y: Y(t) + 3.5, class: 'dt', 'text-anchor': 'end' },
                       fmt(t, spec.dp)));
    });
    rows.forEach(function (r, i) {
      var x = pad.l + bw * i;
      s.appendChild(el('rect', {
        x: x + bw * 0.12, y: Y(r[1]), width: Math.max(1, bw * 0.76),
        height: Math.max(0, pad.t + ih - Y(r[1])), fill: spec.colour,
        'fill-opacity': '.85', class: 'dbar'
      })).appendChild(el('title', {}, r[0] + ': ' + fmt(r[1], spec.dp)));
    });
    var every = spec.every || Math.max(1, Math.ceil(rows.length / 8));
    rows.forEach(function (r, i) {
      if (i % every && i !== rows.length - 1) return;
      s.appendChild(el('text', { x: pad.l + bw * (i + 0.5), y: H - 10, class: 'dt',
                                 'text-anchor': 'middle' }, String(r[0])));
    });
    if (spec.yLabel) {
      s.appendChild(el('text', { x: pad.l, y: 11, class: 'dax' }, spec.yLabel));
    }
    return s;
  }

  /* ---- a scatter map on the Irish National Grid --------------------------
     Points are plotted in grid kilometres directly. No basemap and no
     projection library: the grid IS a metric projection of Ireland, so the
     scatter draws the island's shape by itself once there are a few thousand
     points, and the county boundaries are supplied in the same grid.

     spec = { points:[[x_km,y_km,...],...], colourOf, r, opacity, height,
              outlines:[{name,rings}], tip:function(p){return [[k,v],...]},
              onArea:function(name|null) }

     HOVER IS ONE LISTENER, NOT 6,494. The obvious implementation puts a
     pointer handler on every dot; at this density that is thousands of hit
     regions of about two pixels each, which is both expensive and unusable --
     you have to hit the dot exactly, and where dots overlap the browser picks
     whichever was drawn last. Instead the map indexes the points into a coarse
     bucket grid once and answers "what is nearest the cursor?" on each move.
     The reader can point at a cluster rather than at a pixel, and the answer is
     deterministic: the closest point, ties broken by draw order.               */
  function map(host, spec) {
    var W = 520, H = spec.height || 640;
    var pad = 18;
    var wrap = document.createElement('div');
    wrap.className = 'dash-maprap';
    host.appendChild(wrap);
    var s = svg(wrap, W, H, 'dash-map');
    var pts = spec.points || [];
    if (!pts.length) return s;
    // The Irish National Grid covers 0-400 km east, 0-500 km north.
    var GX = [20, 350], GY = [10, 470];
    var iw = W - pad * 2, ih = H - pad * 2;
    var k = Math.min(iw / (GX[1] - GX[0]), ih / (GY[1] - GY[0]));
    var ox = pad + (iw - k * (GX[1] - GX[0])) / 2;
    var oy = pad + (ih - k * (GY[1] - GY[0])) / 2;
    var X = function (v) { return ox + (v - GX[0]) * k; };
    // north is up: the grid's y grows north, the screen's grows down
    var Y = function (v) { return oy + ih - (v - GY[0]) * k - (ih - k * (GY[1] - GY[0])); };

    /* Boundaries first, so they sit UNDER the data. They are context, and a
       county line drawn over the points would compete with them. */
    var areaPath = {};
    if (spec.outlines && spec.outlines.length) {
      var gb = el('g', { class: 'dash-cty' });
      spec.outlines.forEach(function (a) {
        var d = '';
        (a.rings || []).forEach(function (ring) {
          ring.forEach(function (pt, i) {
            d += (i ? 'L' : 'M') + X(pt[0]).toFixed(1) + ',' + Y(pt[1]).toFixed(1);
          });
          d += 'Z';
        });
        var p = el('path', { d: d, class: 'cty', 'fill-rule': 'evenodd' });
        p.appendChild(el('title', {}, a.name));
        gb.appendChild(p);
        areaPath[a.name] = p;
      });
      s.appendChild(gb);
    }

    var g = el('g', {});
    var sx = [], sy = [];
    pts.forEach(function (p) {
      var cx = X(p[0]), cy = Y(p[1]);
      sx.push(cx); sy.push(cy);
      g.appendChild(el('circle', {
        cx: cx.toFixed(1), cy: cy.toFixed(1),
        r: spec.r || 2.1,
        fill: spec.colourOf ? spec.colourOf(p) : '#2874a6',
        'fill-opacity': spec.opacity || 0.5
      }));
    });
    s.appendChild(g);

    if (!spec.tip) return s;

    /* ---- the bucket index ---- */
    var CELL = 8;                                   // viewBox units
    var cols = Math.ceil(W / CELL) + 1;
    var buckets = {};
    for (var i = 0; i < pts.length; i++) {
      var key = (Math.floor(sy[i] / CELL) * cols + Math.floor(sx[i] / CELL));
      (buckets[key] || (buckets[key] = [])).push(i);
    }
    var REACH = 10;                                 // max hover distance, units

    function nearest(px, py) {
      var cxi = Math.floor(px / CELL), cyi = Math.floor(py / CELL);
      var best = -1, bestD = REACH * REACH;
      for (var dy = -2; dy <= 2; dy++) {
        for (var dx = -2; dx <= 2; dx++) {
          var b = buckets[(cyi + dy) * cols + (cxi + dx)];
          if (!b) continue;
          for (var n = 0; n < b.length; n++) {
            var j = b[n];
            var d = (sx[j] - px) * (sx[j] - px) + (sy[j] - py) * (sy[j] - py);
            if (d < bestD) { bestD = d; best = j; }
          }
        }
      }
      return best;
    }

    /* The marker for whatever is under the cursor, and the highlight for the
       county it is in. Both are created once and moved, rather than added and
       removed on every mousemove. */
    var halo = el('circle', { class: 'dash-halo', r: 6, cx: -99, cy: -99 });
    s.appendChild(halo);

    var tip = document.createElement('div');
    tip.className = 'dash-tip';
    tip.hidden = true;
    wrap.appendChild(tip);

    var lastArea = null, lastIx = -1;

    /* Published on the element so the breakdown table beside the map can drive
       the same highlight: hovering a county in the list lights it on the map,
       and hovering the map lights it in the list. One piece of state, reached
       from both ends, rather than two that can disagree. */
    s.highlightArea = function (name) { setArea(name); };

    function setArea(name) {
      if (name === lastArea) return;
      if (lastArea && areaPath[lastArea]) areaPath[lastArea].classList.remove('on');
      if (name && areaPath[name]) areaPath[name].classList.add('on');
      lastArea = name;
      if (spec.onArea) spec.onArea(name);
    }

    function hide() {
      tip.hidden = true;
      halo.setAttribute('cx', -99);
      halo.setAttribute('cy', -99);
      lastIx = -1;
      setArea(null);
    }

    /* Client pixels -> viewBox units. Computed from the rendered box rather
       than read from getScreenCTM: the viewBox is letterboxed by
       preserveAspectRatio, and doing the arithmetic here keeps the map working
       in any container and in environments with no CTM implementation. */
    function toView(ev) {
      var r = s.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      var sc = Math.min(r.width / W, r.height / H);
      return [(ev.clientX - r.left - (r.width - W * sc) / 2) / sc,
              (ev.clientY - r.top - (r.height - H * sc) / 2) / sc];
    }

    function move(ev) {
      var v = toView(ev);
      if (!v) return;
      var ix = nearest(v[0], v[1]);
      if (ix < 0) { hide(); return; }
      if (ix !== lastIx) {
        lastIx = ix;
        var rows = spec.tip(pts[ix]) || [];
        tip.textContent = '';
        rows.forEach(function (r, i) {
          var line = document.createElement('div');
          line.className = i === 0 ? 'tip-h' : 'tip-r';
          if (i === 0) {
            line.textContent = r[1] === undefined ? r[0] : r[1];
          } else {
            var kEl = document.createElement('span');
            kEl.className = 'tip-k';
            kEl.textContent = r[0];
            var vEl = document.createElement('span');
            vEl.className = 'tip-v';
            vEl.textContent = r[1];
            line.appendChild(kEl);
            line.appendChild(vEl);
          }
          tip.appendChild(line);
        });
        halo.setAttribute('cx', sx[ix].toFixed(1));
        halo.setAttribute('cy', sy[ix].toFixed(1));
        setArea(spec.areaOf ? spec.areaOf(pts[ix]) : null);
      }
      tip.hidden = false;
      // Keep the box inside the figure: flip it to the left of the cursor once
      // it would otherwise run past the right edge.
      var r = s.getBoundingClientRect();
      var lx = ev.clientX - r.left + 14, ly = ev.clientY - r.top + 14;
      if (lx > r.width - 190) lx = Math.max(4, lx - 208);
      if (ly > r.height - 120) ly = Math.max(4, ly - 130);
      tip.style.left = lx + 'px';
      tip.style.top = ly + 'px';
    }

    s.addEventListener('mousemove', move);
    s.addEventListener('mouseleave', hide);
    // Touch has no hover: a tap is the same question, asked once.
    s.addEventListener('click', move);
    return s;
  }

  return { svg: svg, el: el, line: line, bars: bars, map: map,
           ticks: ticks, fmt: fmt };
})();
