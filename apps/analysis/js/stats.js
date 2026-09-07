/* GENERATED COPY -- do not edit.
   Source: apps/analysis/js/stats.js
   Rebuild: python tools/homepage/build_homepage_app.py
   The static homepage build shares every view module with the server app;
   the only file that differs is the data layer (api-static.js). */
/* Statistics: what the scores ARE, rather than how they move.

   Three blocks, in the order a reader needs them:

     1. Distributions -- the wellbeing index as a histogram, each construct as
        an exact four-bar ordinal. The server decides which is which and says so
        in `kind`; this module never guesses, because drawing a 40-bin histogram
        of a 0-3 score produces a comb of empty bins that looks like data.
     2. Coverage -- posts per period, posts per location, and the reaction
        distribution on a log scale. This is where a trend built on nine posts
        becomes visible.
     3. Breakdowns -- mean index and construct z-scores by location and by year.

   The three construct distributions share ONE ROW. Each is four bars; stretched
   across the full page they read as a poster rather than a distribution, and
   side by side they are directly comparable, which is the only reason to look
   at all three at once. */
var STATS = (function () {

  var current = null;
  var seq = 0;

  /* The STATISTICS FRAME's own configuration box. Statistics defaults to a
     MONTHLY resolution -- a 7-day bin across a decade gives 500 bars nobody can
     read -- which is possible only because this frame's settings are its own. */
  function ctl() { return CTL.of('stats'); }

  function query() {
    var c = ctl();
    var p = new URLSearchParams({
      period_n: c.period(),
      period_unit: c.unit(),
      location: c.location(),
      sensitivity: c.sensitivity(),
      weight: c.weight() ? '1' : '0'
    });
    // this frame's own date range
    new URLSearchParams(c.query()).forEach(function (v, k) {
      if (k === 'start_date' || k === 'end_date') p.set(k, v);
    });
    return p.toString();
  }

  var pending = null;
  function fetchStats() {
    clearTimeout(pending);
    pending = setTimeout(doFetch, 100);
  }

  function doFetch() {
    var mine = ++seq;
    setStatus('statistics…', 'busy');
    API.get('stats', query())
      .then(function (j) {
        if (mine !== seq) return;
        current = j;
        render(j);
        setStatus(j.empty ? 'no posts match the current filters'
                          : j.meta.n_posts.toLocaleString() + ' posts',
                  j.empty ? 'error' : '');
      })
      .catch(function (e) {
        if (mine !== seq) return;
        setStatus(e.message || 'statistics failed', 'error');
      });
  }

  // ---- small builders ---------------------------------------------------
  function section(host, title) {
    var s = document.createElement('section');
    // --content marks it as OUTPUT rather than chrome, so the print
    // stylesheet keeps it: a printed Statistics tab with the tables
    // stripped out would be four empty headings.
    s.className = 'panel-box panel-box--content';
    var h = document.createElement('h2');
    h.className = 'box-title';
    h.textContent = title;
    s.appendChild(h);
    host.appendChild(s);
    return s;
  }

  function note(host, text) {
    var p = document.createElement('p');
    p.className = 'box-note';
    p.textContent = text;
    host.appendChild(p);
    return p;
  }

  function barPanel(host, title, color, meta) {
    var fig = document.createElement('figure');
    fig.className = 'panel';
    var head = document.createElement('figcaption');
    head.className = 'panel-head';
    var t = document.createElement('span');
    t.className = 'panel-title';
    t.textContent = title;
    t.style.color = color;
    var m = document.createElement('span');
    m.className = 'panel-meta';
    m.textContent = meta || '';
    head.appendChild(t); head.appendChild(m);
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'chart');
    fig.appendChild(head); fig.appendChild(svg);
    host.appendChild(fig);
    return svg;
  }

  function summaryLine(s) {
    if (!s || !s.n) return 'no data';
    var bits = ['n ' + s.n.toLocaleString(),
                'mean ' + fmtNum(s.mean, 3),
                'sd ' + fmtNum(s.sd, 3),
                'median ' + fmtNum(s.median, 3),
                'IQR ' + fmtNum(s.q1, 2) + '–' + fmtNum(s.q3, 2)];
    if (s.weighted_mean !== undefined && s.weighted_mean !== null) {
      bits.push('weighted mean ' + fmtNum(s.weighted_mean, 3));
    }
    return bits.join('  ·  ');
  }

  /* Histogram edges -> one label per bar (the bin's left edge). */
  function edgeLabels(edges) {
    var out = [];
    for (var i = 0; i < edges.length - 1; i++) {
      out.push(fmtNum(edges[i], 2));
    }
    return out;
  }

  /* A horizontal strip of equal-width panels. */
  function panelRow(host, n) {
    var row = document.createElement('div');
    row.className = 'panel-row';
    row.style.setProperty('--cols', n);
    host.appendChild(row);
    return row;
  }

  // ---- the blocks --------------------------------------------------------
  function renderDistributions(host, j) {
    var s = section(host, 'Distributions');
    note(s, 'Post-level distributions over the current selection. The three ' +
            'constructs are scored 0–3, so each level is shown exactly; the ' +
            'index is continuous in (0, 1) and is binned.');
    var all = j.distributions || [];
    var constructs = all.filter(function (d) { return d.kind === 'ordinal'; });
    var others = all.filter(function (d) { return d.kind !== 'ordinal'; });

    // The index is continuous and gets 40 bins, so it needs the full width.
    others.forEach(function (d) {
      var svg = barPanel(s, d.label, d.color, summaryLine(d.summary));
      CH.bars(svg, { labels: edgeLabels(d.edges), values: d.counts,
                     color: d.color, yLabel: d.label + ' — posts per bin',
                     xLabel: d.transform || d.label });
    });

    /* The three constructs go SIDE BY SIDE in one row. Each is four bars, and
       four bars stretched across the full page reads as a poster rather than a
       distribution; in a row they are also directly comparable, which is the
       only reason to look at all three at once. */
    if (constructs.length) {
      var row = panelRow(s, constructs.length);
      constructs.forEach(function (d) {
        var svg = barPanel(row, d.label, d.color, summaryLine(d.summary));
        CH.bars(svg, { labels: d.levels, values: d.counts, pct: d.pct,
                       color: d.color, yLabel: d.label + ' — posts per level',
                       xLabel: 'score (0–3)' });
      });
    }
  }

  function renderCoverage(host, j) {
    var s = section(host, 'Coverage');
    var c = j.coverage || {};
    note(s, 'How many posts each number rests on. Thin periods are where a ' +
            'striking movement in the series panels usually turns out to be a ' +
            'handful of posts.');

    var svg = barPanel(s, 'Posts per ' + (c.period_label || 'period'), '#334155',
                       c.x.length + ' periods  ·  median ' +
                       fmtNum(c.median_per_period, 0) + ' posts/period' +
                       (c.empty_periods ? '  ·  ' + c.empty_periods +
                        ' empty' : ''));
    CH.bars(svg, { labels: c.x, values: c.n, color: '#334155',
                   yLabel: 'posts per ' + (c.period_label || 'period'),
                   xLabel: 'period start' });

    /* The reaction distribution is OPTIONAL. The server publishes reaction
       counts and draws it; the static homepage build does not publish them at
       all (they fingerprint a specific public post), so the panel is absent
       rather than empty. */
    var r = j.reactions;
    if (!r) return;
    var rs = barPanel(s, r.label || 'Reactions per post', r.color || '#8e44ad',
                      summaryLine(r.summary) +
                      (r.zero_pct !== null && r.zero_pct !== undefined
                        ? '  ·  ' + fmtNum(r.zero_pct, 1) + '% have none' : ''));
    CH.bars(rs, { labels: edgeLabels(r.edges || []), values: r.counts || [],
                  color: r.color || '#8e44ad',
                  yLabel: 'posts', xLabel: r.transform || 'reactions' });
    note(s, 'Reactions are binned on log10(1 + reactions): they run from zero ' +
            'to the millions here, so linear bins put nearly every post in the ' +
            'first one. Reaction weighting is on by default, which makes the ' +
            'right-hand tail of this distribution the set of posts that ' +
            'dominates every weighted mean in the app.');

    var t = document.createElement('table');
    t.className = 'cmp-table';
    t.innerHTML = '<thead><tr><th>location</th><th>posts</th><th>share</th>' +
                  '</tr></thead>';
    var tb = document.createElement('tbody');
    (c.by_location || []).forEach(function (row) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td><b>' + row.location + '</b></td><td>' +
                     row.n.toLocaleString() + '</td><td>' +
                     fmtNum(row.pct, 1) + '%</td>';
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    s.appendChild(t);
  }

  function breakdownTable(host, title, rows, cfg, keyLabel) {
    var h = document.createElement('h3');
    h.className = 'sub-title';
    h.textContent = title;
    host.appendChild(h);
    var t = document.createElement('table');
    t.className = 'cmp-table';
    var head = '<tr><th>' + keyLabel + '</th><th>posts</th><th>index</th>';
    (cfg.constructs || []).forEach(function (c) {
      head += '<th>' + c.short + ' (z)</th>';
    });
    t.innerHTML = '<thead>' + head + '</tr></thead>';
    var tb = document.createElement('tbody');
    (rows || []).forEach(function (r) {
      var tr = document.createElement('tr');
      var html = '<td><b>' + r.key + '</b></td><td>' + r.n.toLocaleString() +
                 '</td><td>' + fmtNum(r.wellbeing.mean, 3) +
                 '<span class="sub"> ±' + fmtNum(r.wellbeing.sd, 2) + '</span></td>';
      (cfg.constructs || []).forEach(function (c) {
        var s = r[c.id];
        html += '<td>' + (s ? fmtNum(s.mean, 3) : '—') + '</td>';
      });
      tr.innerHTML = html;
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    host.appendChild(t);
  }

  function renderBreakdown(host, j) {
    var s = section(host, 'Breakdown');
    var b = j.breakdown || {};
    note(s, 'Mean wellbeing index and construct z-scores. ' +
            (b.scale || '') + '.');
    var cfg = APP.cfg || {};
    breakdownTable(s, 'By location', b.by_location, cfg, 'location');
    breakdownTable(s, 'By year', b.by_year, cfg, 'year');
  }

  /* Blue for positive, red for negative, opacity by |rho|. */
  function render(j) {
    var host = $('stats-body'), em = $('stats-empty');
    if (!host) return;
    host.innerHTML = '';
    if (!j || j.empty) {
      em.hidden = false;
      em.textContent = 'No posts match the current filters.';
      return;
    }
    em.hidden = true;
    renderDistributions(host, j);
    renderCoverage(host, j);
    renderBreakdown(host, j);
  }

  return { fetch: fetchStats, render: function () { render(current); } };
})();
