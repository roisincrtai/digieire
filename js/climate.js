/* The Climate Change dashboard.

   Draws window.DIGIEIRE_CLIMATE: Ireland's own record from E-OBS v32.0e
   (tools/homepage/extract_eobs_ireland.py) alongside the global series
   (tools/homepage/fetch_climate_context.py). Loaded as a script assignment, so
   there is nothing to fetch and the section works from `file://`.

   THE ORDER IS DELIBERATE: Ireland first, the globe second. A visitor to an
   Irish project page has already seen the global curves elsewhere; what they
   cannot get elsewhere is the same story measured over this island. The global
   panels then explain what is driving it.

   TWO LABELS DO REAL WORK and are not decoration:

   * The wet-day counts are thresholds on the ISLAND-MEAN daily rainfall, not on
     a station. Averaging over Ireland flattens the local downpours that cause
     pluvial flooding, so these numbers are not comparable with the published
     ETCCDI station indices of the same name, and the caption says so.
   * El Niño is drawn as a marker on the global temperature panel rather than as
     a cause. It modulates the signal; it does not produce the trend. */
(function () {
  'use strict';

  var C = window.DIGIEIRE_CLIMATE;
  var host = document.getElementById('climate-dash');
  if (!C || !host) return;

  var IE = C.ireland || {};
  var G = C.global || {};
  var A = IE.annual || [];
  var col = {};
  (IE.columns || []).forEach(function (name, i) { col[name] = i; });

  function series(key) {
    var i = col[key];
    if (i === undefined) return [];
    return A.map(function (r) { return [r[0], r[i]]; })
            .filter(function (r) { return r[1] !== null && r[1] !== undefined; });
  }

  function elt(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function figure(parent, title, note, cite) {
    var f = elt('figure', 'dash-fig');
    f.appendChild(elt('figcaption', 'dash-title', title));
    if (note) f.appendChild(elt('p', 'dash-note', note));
    var body = elt('div', 'dash-body');
    f.appendChild(body);
    if (cite) f.appendChild(elt('p', 'dash-cite', cite));
    parent.appendChild(f);
    return body;
  }

  /* The mean of a series over a year range -- used for the "then vs now"
     numbers, so that every headline figure on this page is computed from the
     data on the page rather than typed in. */
  function meanOver(rows, a, b) {
    var v = rows.filter(function (r) { return r[0] >= a && r[0] <= b; })
                .map(function (r) { return r[1]; });
    if (!v.length) return null;
    return v.reduce(function (x, y) { return x + y; }, 0) / v.length;
  }

  var temp = series('tg_mean_C');
  var rain = series('rr_total_mm');
  var djf = series('rr_djf_mm');
  var wet10 = series('wet_days_ge_10mm');
  var rx5 = series('rx5day_mm');

  /* THE PERIODS COME FROM THE BUNDLE, not from this file. The extractor
     computes the baseline against them, so a label typed here would be a second
     copy able to drift away from the number it describes. */
  var base = IE.baseline_period || [1961, 1990];
  var now = IE.recent_period || [1995, 2024];
  var BASE = base[0] + '–' + String(base[1]).slice(-2);
  var NOW = now[0] + '–' + now[1];
  function delta(rows, dp, unit) {
    var a = meanOver(rows, base[0], base[1]), b = meanOver(rows, now[0], now[1]);
    if (a === null || b === null) return '—';
    var d = b - a;
    return (d >= 0 ? '+' : '') + d.toFixed(dp) + (unit || '');
  }

  // ---- headline numbers, all computed from the plotted data --------------
  var kpis = elt('div', 'kpis');
  [
    [delta(temp, 2, ' °C'), 'warmer', 'mean temperature, ' + NOW + ' vs ' + BASE],
    [delta(rain, 0, ' mm'), 'more rain a year', 'annual total, same comparison'],
    [delta(wet10, 1, ' days'), 'more very wet days', 'island-mean ≥ 10 mm'],
    [delta(rx5, 1, ' mm'), 'bigger 5-day maximum', 'the wettest run of each year']
  ].forEach(function (k) {
    var c = elt('div', 'kpi');
    c.appendChild(elt('b', null, k[0]));
    c.appendChild(elt('span', 'kpi-l', k[1]));
    c.appendChild(elt('span', 'kpi-s', k[2]));
    kpis.appendChild(c);
  });
  host.appendChild(kpis);

  // ---- Ireland -----------------------------------------------------------
  host.appendChild(elt('h3', 'dash-h', 'Ireland, measured'));

  var grid = elt('div', 'dash-grid');
  host.appendChild(grid);

  var cite = 'E-OBS v32.0e (ECA&D / Copernicus C3S), 0.25° daily grid, averaged '
           + 'over the island of Ireland';

  var b1 = figure(grid, 'Annual mean temperature',
    'Dashed line: the ' + base[0] + '–' + base[1] + ' normal. Ireland has warmed with the world, and '
    + 'a warmer atmosphere carries more water vapour — about 7% more per degree.',
    cite);
  DASH.line(b1, { rows: temp, colour: '#b03a2e', dp: 1, trend: true,
                  yLabel: '°C', baseline: (IE.baseline || {}).tg_mean_C,
                  baselineLabel: BASE + ' normal' });

  var b2 = figure(grid, 'Annual rainfall total',
    'Wetter, but noisily so: year-to-year variability in Irish rainfall is large '
    + 'enough that the trend matters more than any single year.', cite);
  DASH.line(b2, { rows: rain, colour: '#2874a6', dp: 0, trend: true,
                  yLabel: 'mm', baseline: (IE.baseline || {}).rr_total_mm,
                  baselineLabel: BASE + ' normal' });

  var b3 = figure(grid, 'Winter rainfall (December–February)',
    'The season that floods. Winter rain falls on ground that is already '
    + 'saturated, into rivers that are already high, often alongside the '
    + 'highest tides of the year.', cite);
  DASH.line(b3, { rows: djf, colour: '#17456b', dp: 0, trend: true,
                  yLabel: 'mm' });

  var b4 = figure(grid, 'Very wet days, and the wettest 5-day run',
    'Days when the average rainfall ACROSS THE WHOLE ISLAND reached 10 mm — a '
    + 'much wetter day than 10 mm at one station, because averaging over Ireland '
    + 'flattens local downpours. Not comparable with station indices of the same '
    + 'name.', cite);
  DASH.line(b4, { rows: wet10, colour: '#0f4c3a', dp: 0, trend: true,
                  yLabel: 'days ≥ 10 mm (island mean)' });

  // ---- the world ---------------------------------------------------------
  host.appendChild(elt('h3', 'dash-h', 'And the world it sits in'));

  var g2 = elt('div', 'dash-grid');
  host.appendChild(g2);

  function globalRows(key, valIndex) {
    var s = G[key];
    if (!s) return null;
    return s.rows.map(function (r) { return [r[0], r[valIndex === undefined ? 1 : valIndex]]; });
  }

  // strong El Niño years, to mark on the global temperature panel
  var nino = [];
  if (G.oni) {
    G.oni.rows.forEach(function (r) { if (r[2] >= 1.5) nino.push(r[0]); });
  }

  var gt = globalRows('temperature');
  if (gt) {
    var t1 = figure(g2, 'Global mean temperature anomaly',
      'Dashed vertical rules mark strong El Niño years (peak Niño 3.4 ≥ +1.5 °C). '
      + 'El Niño rides on top of the trend and redistributes heat and rainfall — '
      + 'it does not produce the rise.',
      (G.temperature.meta || {}).source || '');
    DASH.line(t1, { rows: gt.filter(function (r) { return r[0] >= 1880; }),
                    colour: '#b03a2e', dp: 1, baseline: 0, yLabel: '°C anomaly',
                    marks: nino });
  }

  var ge = globalRows('emissions');
  if (ge) {
    var t2 = figure(g2, 'Global fossil CO₂ emissions',
      'The driver. Still rising, which is why every projection to 2100 has to be '
      + 'run under more than one pathway.',
      (G.emissions.meta || {}).source || '');
    DASH.line(t2, { rows: ge.filter(function (r) { return r[0] >= 1880; }),
                    colour: '#5d6d7e', dp: 0, yLabel: 'Gt CO₂ / year' });
  }

  var gs = globalRows('sea_level');
  if (gs) {
    var t3 = figure(g2, 'Global mean sea level',
      'Thermal expansion plus the loss of glaciers and ice sheets. For a coastal '
      + 'country this is the slow variable that makes every storm surge start '
      + 'from a higher mark.',
      (G.sea_level.meta || {}).source || '');
    DASH.line(t3, { rows: gs, colour: '#2874a6', dp: 0, yLabel: 'mm' });
  }

  var gf = globalRows('floods');
  if (gf) {
    var t4 = figure(g2, 'Recorded flood disasters worldwide',
      '“Recorded” is doing real work: reporting improved through the twentieth '
      + 'century, so part of this rise is better record-keeping rather than more '
      + 'water.',
      (G.floods.meta || {}).source || '');
    DASH.line(t4, { rows: gf, colour: '#1a7a5e', dp: 0,
                    yLabel: 'events / year' });
  }

})();
