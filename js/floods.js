/* The Irish Floods dashboard.

   Draws window.DIGIEIRE_FLOODS -- 6,494 recorded OPW flood events, written by
   tools/homepage/extract_irish_floods.py. The data arrives as a script
   assignment, so there is nothing to fetch and the section works from `file://`
   as well as from a web server.

   TWO HONESTY CONSTRAINTS run through this file, because the catalogue invites
   two specific misreadings:

   * It is a record of REPORTED events. Only 2,796 of the 6,494 carry a date, so
     the timeline is explicitly labelled as the dated subset rather than being
     drawn as if it were the whole catalogue.
   * Reporting density rises steeply with time. The timeline says so in its own
     caption, next to the bars, not in a footnote three screens away.

   The map plots Irish National Grid coordinates directly. No basemap and no
   projection: the grid is already a metric projection of Ireland, and six
   thousand flood points draw the island's rivers and coast by themselves. */
(function () {
  'use strict';

  var D = window.DIGIEIRE_FLOODS;
  var host = document.getElementById('floods-dash');
  if (!D || !host) return;

  var SRC_COLOUR = {
    'River': '#2874a6',
    'Coastal/Estuarine Waters': '#0f4c3a',
    'Low lying land': '#6cbfa2',
    'Runoff': '#c8791f',
    'Turlough': '#7a5ea8',
    'Lake': '#17456b',
    'Other': '#94a3b8',
    '—': '#cbd5e1'
  };

  /* Every string in the bundle is interned: a point carries indices, not text.
     These four readers are the only place that is unpacked. */
  function look(list, i) { return (D.lookups[list] || [])[i] || '—'; }
  function srcName(i) { return look('source_type', i); }
  function colourOf(p) { return SRC_COLOUR[srcName(p[3])] || '#94a3b8'; }

  function elt(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function figure(parent, title, note) {
    var f = elt('figure', 'dash-fig');
    f.appendChild(elt('figcaption', 'dash-title', title));
    if (note) f.appendChild(elt('p', 'dash-note', note));
    var body = elt('div', 'dash-body');
    f.appendChild(body);
    parent.appendChild(f);
    return body;
  }

  // ---- headline numbers --------------------------------------------------
  var s = D.stats;
  var kpis = elt('div', 'kpis');
  [
    [s.n_total.toLocaleString(), 'recorded flood events', 'OPW floodinfo.ie'],
    [s.n_dated.toLocaleString(), 'carry a date', s.year_min + '–' + s.year_max],
    [s.n_since_2000.toLocaleString(), 'dated since 2000', 'of ' + s.n_dated.toLocaleString() + ' dated'],
    [String((D.stats.top_catchments[0] || ['—'])[0]), 'busiest catchment',
     ((D.stats.top_catchments[0] || ['', 0])[1]) + ' events']
  ].forEach(function (k) {
    var c = elt('div', 'kpi');
    c.appendChild(elt('b', null, k[0]));
    c.appendChild(elt('span', 'kpi-l', k[1]));
    c.appendChild(elt('span', 'kpi-s', k[2]));
    kpis.appendChild(c);
  });
  host.appendChild(kpis);

  // ---- map + side panels -------------------------------------------------
  var split = elt('div', 'dash-split');
  host.appendChild(split);

  var left = elt('div', 'dash-left');
  var right = elt('div', 'dash-right');
  split.appendChild(left);
  split.appendChild(right);

  var mapBody = figure(left, 'Where Ireland floods',
    'Every recorded event, plotted on the Irish National Grid and coloured by '
    + 'flood source, with the local-authority boundaries beneath. Point at the '
    + 'map to read a record; the rivers and the coastline are drawn by the '
    + 'events themselves, not by a basemap.');

  /* The tooltip answers "what is this dot?" in the order a reader asks it:
     what happened, then when, then the three classifications. Blank fields are
     dropped rather than shown as em-dashes — a row that says nothing is worse
     than no row. */
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];
  function tipRows(p) {
    var rows = [[null, look('name', p[7])]];
    rows.push(['When', p[2] ? String(p[2]) : 'undated / recurring']);
    rows.push(['Source', srcName(p[3])]);
    var rec = look('record_type', p[4]);
    if (rec !== '—') rows.push(['Record', rec]);
    var cat = look('catchment', p[5]);
    if (cat !== '—') rows.push(['Catchment', cat]);
    var cty = look('county', p[6]);
    if (cty !== '—') rows.push(['County', cty]);
    return rows;
  }
  function areaOf(p) {
    var n = look('county', p[6]);
    return n === '—' ? null : n;
  }

  var mapSvg = DASH.map(mapBody, {
    points: D.points, colourOf: colourOf, r: 2.0, opacity: 0.55,
    outlines: D.counties || [], tip: tipRows, areaOf: areaOf,
    onArea: function (name) { markRow(name); }
  });

  var legend = elt('div', 'legend');
  (D.stats.by_source || []).forEach(function (row) {
    var i = elt('span', 'legend-item');
    var sw = elt('span', 'sw');
    sw.style.background = SRC_COLOUR[row[0]] || '#94a3b8';
    i.appendChild(sw);
    i.appendChild(elt('span', null, row[0] + ' · ' + row[1].toLocaleString()));
    legend.appendChild(i);
  });
  mapBody.appendChild(legend);

  // by year
  var yrBody = figure(right, 'Recorded events per year, 1950 onwards',
    'The DATED subset only — ' + s.n_dated.toLocaleString() + ' of '
    + s.n_total.toLocaleString() + ' records. Read the rise with care: '
    + 'record-keeping improved sharply over this period, so part of it is '
    + 'better reporting rather than more flooding.');
  var byYear = (D.by_year || []).filter(function (r) { return r[0] >= 1950; });
  DASH.bars(yrBody, { rows: byYear, colour: '#2874a6', height: 250,
                      yLabel: 'events' });

  var moBody = figure(right, 'And when in the year',
    'Month of every dated record. Irish flooding is a winter story: the '
    + 'Atlantic storm track, saturated ground and the highest tides arrive '
    + 'together.');
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  DASH.bars(moBody, {
    rows: (D.by_month || []).map(function (r) { return [MON[r[0] - 1], r[1]]; }),
    colour: '#0f4c3a', height: 210, every: 1, yLabel: 'events'
  });

  // ---- two ways of dividing the same 6,494 records -----------------------
  // A CATCHMENT is where water collects; a COUNTY is who has to deal with it.
  // The catalogue publishes the first and not the second, which is the wrong
  // way round for anyone deciding where to spend an adaptation budget — so the
  // county is derived here and the two are shown side by side rather than one
  // being treated as the real answer.
  function rankTable(parent, head, rows, opts) {
    var tbl = elt('table', 'dash-table');
    var thead = elt('thead');
    var htr = elt('tr');
    head.forEach(function (h) { htr.appendChild(elt('th', null, h)); });
    thead.appendChild(htr);
    tbl.appendChild(thead);
    var tb = elt('tbody');
    var max = rows.length ? Math.max.apply(null, rows.map(function (r) { return r[1]; })) : 1;
    var index = {};
    rows.forEach(function (row) {
      var tr = elt('tr');
      tr.appendChild(elt('td', null, row[0]));
      tr.appendChild(elt('td', 'num', row[1].toLocaleString()));
      var bar = elt('td', 'barcell');
      var b = elt('span', 'minibar');
      b.style.width = (100 * row[1] / max) + '%';
      bar.appendChild(b);
      tr.appendChild(bar);
      if (opts && opts.link) {
        index[row[0]] = tr;
        tr.className = 'linkable';
        tr.addEventListener('mouseenter', function () {
          if (mapSvg && mapSvg.highlightArea) mapSvg.highlightArea(row[0]);
        });
        tr.addEventListener('mouseleave', function () {
          if (mapSvg && mapSvg.highlightArea) mapSvg.highlightArea(null);
        });
      }
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    parent.appendChild(tbl);
    return index;
  }

  var pair = elt('div', 'dash-pair');
  host.appendChild(pair);

  var byCounty = D.stats.by_county || [];
  var countyRows = {};
  if (byCounty.length) {
    var pct = D.stats.county_snapped
      ? Math.round(1000 * D.stats.county_snapped / s.n_total) / 10 : 0;
    var ctyBody = figure(pair, 'Every county and city, by recorded events',
      'Derived here, not published: each event\'s grid position tested against '
      + 'the 34 local-authority boundaries. ' + D.stats.county_inside.toLocaleString()
      + ' fell inside one; ' + D.stats.county_snapped.toLocaleString() + ' (' + pct
      + '%) sat just offshore and were snapped to the coast within 3 km. Point '
      + 'at a row to find it on the map.');
    countyRows = rankTable(ctyBody, ['County or city', 'Recorded events', ''],
                           byCounty, { link: true });
  }

  var catBody = figure(pair, 'The catchments that flood most',
    'The publisher\'s own division, by river basin. Named catchments only; a '
    + 'third of records carry no catchment, which is the reason the county view '
    + 'exists beside it.');
  rankTable(catBody, ['Catchment', 'Recorded events', ''],
            D.stats.top_catchments || []);

  /* Hoisted: the map is built above and calls this on every hover. */
  var markedRow = null;
  function markRow(name) {
    if (markedRow) markedRow.classList.remove('on');
    markedRow = (name && countyRows[name]) || null;
    if (markedRow) markedRow.classList.add('on');
  }

  // ---- the caveats, in the figure and not in a footnote ------------------
  var cav = elt('ul', 'caveat-list');
  (D.caveats || []).forEach(function (c) { cav.appendChild(elt('li', null, c)); });
  host.appendChild(cav);
})();
