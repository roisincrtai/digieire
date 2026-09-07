/* GENERATED COPY -- do not edit.
   Source: apps/analysis/js/event.js
   Rebuild: python tools/homepage/build_homepage_app.py
   The static homepage build shares every view module with the server app;
   the only file that differs is the data layer (api-static.js). */
/* Event Analysis: a window picked off the rainfall record.

   The window is CHOSEN, not selected from a list. The frame opens with the
   full-horizon monthly precipitation record; clicking it centres a +/-N day
   window on that date, and everything below re-renders for that window. This is
   the right way round for a flood study -- the wet periods are visible in the
   record, and a dropdown of named storms would have decided in advance which
   dates are worth looking at. A month with no named storm can still be the month
   a town flooded.

   The catalogue is still fetched, but only as MARKERS on the horizon plot and as
   a label when the chosen day lands inside a known event. A click near a marker
   snaps to it, because hitting an exact anchor with a mouse across sixteen years
   of x-axis is not a reasonable thing to ask.

   What the frame draws, in order:
     * the horizon picker (the control),
     * the climate reference over the window, as a compact row of three -- it is
       monthly, so it is context rather than a trace, and it is sized like it,
     * the wellbeing index over the window, day by day,
     * the three constructs (z-normalised) over the same days,
     * posts per day, because a two-point spike over the storm usually turns out
       to be two posts and the reader should be able to see that at a glance,
     * the before/after comparison table, when the window is double-sided.

   Every window chart carries a rule on day 0, plus a band over the impact days
   when the chosen date belongs to a catalogue event. The two differ for any
   multi-day event, and showing only the rule would imply a precision the
   catalogue does not have. */
var EVENT = (function () {

  var horizon = null;       // the full-range rainfall record + event markers
  var current = null;       // the last /api/event payload
  var picked = null;        // the chosen day, 'YYYY-MM-DD'
  var seq = 0;

  function defs() { return (APP.cfg && APP.cfg.event_defaults) || {}; }

  /* The EVENT FRAME's own configuration box (location, weighting, sensitivity
     and the view toggles). Named explicitly: every frame has its own, and this
     one must never read whichever box happens to be on screen. */
  function ctl() { return CTL.of('event'); }

  function build(cfg) {
    var d = defs();
    if ($('event_days')) $('event_days').value = d.days || 15;
    if ($('event_mode')) $('event_mode').value = d.mode || 'double';
    bind();
    loadHorizon();
  }

  /* The record the window is chosen from. Fetched once -- it is the whole
     rainfall series and does not depend on any control on this frame. */
  function loadHorizon() {
    API.get('horizon', 'kind=all')
      .then(function (j) {
        horizon = j;
        /* Open on the wettest month on record rather than on nothing. An empty
           frame asking to be clicked teaches nobody what a click does, and the
           wettest month is the most likely thing a reader came to look at. */
        if (!picked) picked = wettest(j) || (j.events || [{}])[0].anchor || null;
        paintHorizon();
        paintWhen();
        if (VIEWS.shows('event')) fetchWindow();
      })
      .catch(function (e) {
        setStatus('rainfall record failed: ' + e.message, 'error');
      });
  }

  function wettest(j) {
    var best = null, bv = -Infinity;
    (j.x || []).forEach(function (d, i) {
      var v = (j.rain || [])[i];
      if (v !== null && v !== undefined && isFinite(v) && v > bv) {
        bv = v; best = d;
      }
    });
    if (!best) return null;
    // mid-month: the reference is monthly, so the 1st is not more true than
    // any other day in it, and the middle keeps the window inside the month.
    return best.slice(0, 8) + '15';
  }

  /* The catalogue event covering the chosen day, if any. Labelling only. */
  function eventAt(day) {
    var hit = null;
    ((horizon || {}).events || []).forEach(function (e) {
      if (e.start <= day && day <= e.end) {
        if (!hit || e.kind === 'storm') hit = e;
      }
    });
    return hit;
  }

  function paintHorizon() {
    var host = $('event-horizon');
    if (!host || !horizon) return;
    host.innerHTML = '';
    var p = panel(host, 'Precipitation record — click to choose a window',
                  '#2874a6');
    p.svg.classList.add('is-picker');
    if (horizon.empty) {
      p.meta.textContent = 'no reference data';
      return;
    }
    p.meta.textContent = horizon.x.length + ' months  ·  ' +
      (horizon.events || []).length + ' marked events  ·  monthly (CSO MTM01)';
    CH.horizon(p.svg, {
      x: horizon.x, rain: horizon.rain, lta: horizon.lta,
      events: horizon.events, selected: picked, days: days(), mode: mode(),
      onPick: function (date) {
        picked = date;
        if ($('event_date')) $('event_date').value = date.replace(/-/g, '/');
        paintHorizon();
        paintWhen();
        fetchWindow();
      }
    });
  }

  function paintWhen() {
    var el = $('event_when');
    if (!el) return;
    if (!picked) { el.textContent = 'click the record above'; return; }
    if ($('event_date') && !$('event_date').value) {
      $('event_date').value = picked.replace(/-/g, '/');
    }
    var e = eventAt(picked);
    if (!e) {
      el.textContent = 'day 0 = ' + picked + '  ·  no catalogued event on this date';
      el.classList.remove('warn');
      return;
    }
    var span = (e.start === e.end) ? e.start : (e.start + ' → ' + e.end);
    el.textContent = e.label + '  ·  ' + span + '  ·  day 0 = ' + picked +
      (e.precision === 'month'
        ? '  ·  DATE APPROXIMATE (source gives the month only)' : '') +
      (e.note ? '  ·  ' + e.note : '');
    el.classList.toggle('warn', e.precision === 'month');
  }

  function days() {
    var v = parseInt(($('event_days') || {}).value, 10);
    return (isNaN(v) || v < 1) ? 15 : Math.min(v, 180);
  }
  function mode() { return ($('event_mode') || {}).value || 'double'; }

  function paintHint() {
    var el = $('event_window_hint');
    if (!el) return;
    var n = days();
    el.textContent = (mode() === 'single')
      ? '[day −' + n + ', day 0]  ·  no before/after comparison'
      : '[day −' + n + ', day +' + n + ']  ·  ' + (2 * n + 1) + ' days';
  }

  function bind() {
    ['event_days', 'event_mode'].forEach(function (id) {
      if (!$(id)) return;
      function go() { paintHint(); paintHorizon(); fetchWindow(); }
      $(id).addEventListener('input', go);
      $(id).addEventListener('change', go);
    });
    /* The date field is a second way in, for a date that is awkward to hit with
       a mouse. It accepts a complete date only, so partial typing is not
       fought. */
    var df = $('event_date');
    if (df) {
      df.addEventListener('change', function () {
        var ms = CTL.parseYMD(df.value);
        if (isNaN(ms)) { df.classList.add('bad'); return; }
        df.classList.remove('bad');
        picked = CTL.fmtYMD(ms).replace(/\//g, '-');
        paintHorizon(); paintWhen(); fetchWindow();
      });
    }
    paintHint();
  }

  /* This frame's OWN configuration travels with the request: location, reaction
     weighting and sensitivity all change the index. Read from the event frame's
     box, never from another frame's. */
  function query() {
    if (!picked) return null;
    var c = ctl();
    var p = new URLSearchParams({
      date: picked, days: days(), mode: mode(),
      location: c.location(),
      sensitivity: c.sensitivity(),
      weight: c.weight() ? '1' : '0'
    });
    return p.toString();
  }

  var pending = null;
  function fetchWindow() {
    clearTimeout(pending);
    pending = setTimeout(doFetch, 100);
  }

  function doFetch() {
    var q = query();
    if (!q) { render(null); return; }
    var mine = ++seq;
    setStatus('event…', 'busy');
    API.get('event', q)
      .then(function (j) {
        if (mine !== seq) return;          // a newer request won
        current = j;
        render(j);
        setStatus(j.empty ? 'no posts in this window'
                          : (j.meta.n_posts.toLocaleString() + ' posts · ' +
                             j.meta.n_days + ' days'), j.empty ? 'error' : '');
      })
      .catch(function (e) {
        if (mine !== seq) return;
        setStatus(e.message || 'event failed', 'error');
      });
  }

  // ---- rendering --------------------------------------------------------
  function panel(host, title, color) {
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
    head.appendChild(t); head.appendChild(m);
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'chart');
    fig.appendChild(head); fig.appendChild(svg);
    host.appendChild(fig);
    return { el: fig, svg: svg, meta: m };
  }

  /* Day 0 always; the impact band only when the chosen day belongs to a
     catalogued event, because there is nothing to shade otherwise. */
  function marks(j) {
    var e = j.event;
    var m = { vline: { date: j.anchor, label: 'day 0', color: '#8e44ad' } };
    if (e) m.vband = { from: e.start, to: e.end, color: '#8e44ad' };
    return m;
  }

  function render(j) {
    var charts = $('event-charts'), cmp = $('event-compare'),
        em = $('event-empty');
    if (!charts) return;
    charts.innerHTML = '';
    cmp.innerHTML = '';
    if (!j) {
      em.hidden = false;
      em.textContent = 'Click the precipitation record above to choose a window.';
      return;
    }
    if (j.empty) {
      em.hidden = false;
      em.textContent = (j.reason || 'no posts in this window') +
        ' — ' + (j.event ? j.event.label : ('day 0 = ' + (j.anchor || '?'))) +
        (j.window ? ' (' + j.window.start + ' … ' + j.window.end + ')' : '');
      return;
    }
    em.hidden = true;

    var mk = marks(j);
    var dom = [j.x[0], j.x[j.x.length - 1]];
    var cfg = APP.cfg || {};

    function draw(p, spec) {
      spec.domain = dom;
      spec.vband = mk.vband;
      spec.vline = mk.vline;
      CH.draw(p.svg, spec);
    }

    /* 1. the CLIMATE REFERENCE over the window, as a COMPACT ROW of three.

       The reference is monthly, so inside a 31-day window each series is one or
       two points and each panel is close to a flat line. Given a full-height
       panel apiece that reads as three panels of nothing, and it pushes the
       index and the constructs below the fold -- which is how the first attempt
       looked and why it came out again. Side by side at half height they cost
       one panel of space between them, keep the shared x domain so day 0 lines
       up with the panels below, and answer the question they are there for:
       what was the weather doing around this window.

       Drawn as STEPS: a monthly total held across its month, not a trend
       sloping through it. Labelled "(monthly)" so the coarseness is stated
       rather than inferred. */
    var ref = j.reference || {};
    if (!ref.empty && (ref.x || []).length) {
      var row = document.createElement('div');
      row.className = 'panel-row';
      row.style.setProperty('--cols', (cfg.reference || []).length || 3);
      charts.appendChild(row);
      (cfg.reference || []).forEach(function (r) {
        var vals = ref[r.id];
        if (!vals) return;
        var pr = panel(row, r.label + ' (monthly)', r.color);
        pr.el.classList.add('is-reference');
        var spec = { x: ref.x, yLabel: r.label, step: true, height: 96,
                     series: [{ mean: vals, color: r.color, fill: false,
                                label: r.id }] };
        if (r.id === 'floods' || r.id === 'storms') spec.integerY = true;
        if (r.id === 'rain' && ref.lta !== null && ref.lta !== undefined) {
          spec.hline = { value: ref.lta, label: 'LTA ' + Math.round(ref.lta) };
        }
        draw(pr, spec);
        pr.meta.textContent = ref.x.length + ' mo';
      });
    }

    // 2. the index
    var wb = j.wellbeing;
    var pw = panel(charts, (cfg.wellbeing || {}).label || 'Wellbeing index',
                   (cfg.wellbeing || {}).color || '#16a085');
    draw(pw, { x: j.x, yLabel: 'Wellbeing index',
               series: [{ mean: wb.mean, lo: wb.lo, hi: wb.hi,
                          color: (cfg.wellbeing || {}).color || '#16a085',
                          fill: ctl().showBand(), label: 'index' }] });
    pw.meta.textContent = j.x.length + ' days  ·  ' +
      j.meta.n_posts.toLocaleString() + ' posts';

    // 3. the constructs, z-normalised over the whole corpus
    (ctl().showConstructs() ? (cfg.constructs || []) : []).forEach(function (c) {
      var d = (j.constructs || {})[c.id];
      if (!d) return;
      var p = panel(charts, c.short + ' ' + c.label + ' (z)', c.color);
      draw(p, { x: j.x, yLabel: c.short,
                series: [{ mean: d.mean, lo: d.lo, hi: d.hi, color: c.color,
                           fill: ctl().showBand(), label: 'mean' }] });
      p.meta.textContent = 'z-normalised over the whole corpus';
    });

    // 4. posts per day -- the support behind every point above
    var pp = panel(charts, 'Posts per day', '#64748b');
    draw(pp, { x: j.x, yLabel: 'posts', integerY: true,
               series: [{ mean: j.n_posts, color: '#64748b', fill: false,
                          label: 'posts' }] });
    pp.meta.textContent = 'the support behind each point above';

    renderComparison(cmp, j);
  }

  function stars(p) {
    if (p === null || p === undefined || !isFinite(p)) return '';
    if (p < 0.001) return '***';
    if (p < 0.01) return '**';
    if (p < 0.05) return '*';
    return '';
  }
  function fmtP(p) {
    if (p === null || p === undefined || !isFinite(p)) return '—';
    return p < 0.001 ? 'p < 0.001' : 'p = ' + p.toFixed(3);
  }

  function renderComparison(host, j) {
    var c = j.comparison;
    if (!c) {
      if (j.comparison_note) {
        var n = document.createElement('p');
        n.className = 'box-note';
        n.textContent = j.comparison_note;
        host.appendChild(n);
      }
      return;
    }
    var box = document.createElement('details');
    // --content: this is the result, not a control, so it prints.
    box.className = 'panel-box panel-box--fold panel-box--content';
    box.open = true;
    var sum = document.createElement('summary');
    sum.className = 'box-summary';
    sum.innerHTML = '<h2 class="box-title">Before vs after</h2>' +
      '<span class="box-summary-hint">' + c.n_before.toLocaleString() +
      ' posts before  ·  ' + c.n_after.toLocaleString() +
      ' posts on/after day 0</span>';
    box.appendChild(sum);

    var tbl = document.createElement('table');
    tbl.className = 'cmp-table';
    tbl.innerHTML =
      '<thead><tr>' +
      '<th>metric</th><th>before</th><th>after</th><th>difference</th>' +
      '<th>95% CI</th><th>Welch</th><th>rank test</th>' +
      '</tr></thead>';
    var tb = document.createElement('tbody');
    (c.rows || []).forEach(function (r) {
      var w = r.welch, m = r.mannwhitney;
      var tr = document.createElement('tr');
      function td(html, cls) {
        var d = document.createElement('td');
        if (cls) d.className = cls;
        d.innerHTML = html;
        tr.appendChild(d);
      }
      td('<b>' + r.label + '</b>');
      td(fmtNum(r.before.mean, 3) + '<span class="sub"> ±' +
         fmtNum(r.before.sd, 2) + ' · n ' + r.before.n.toLocaleString() + '</span>');
      td(fmtNum(r.after.mean, 3) + '<span class="sub"> ±' +
         fmtNum(r.after.sd, 2) + ' · n ' + r.after.n.toLocaleString() + '</span>');
      td(w ? '<b>' + (w.diff >= 0 ? '+' : '') + fmtNum(w.diff, 3) + '</b>' : '—',
         w && w.p < 0.05 ? 'sig' : '');
      td(w ? '[' + fmtNum(w.ci[0], 3) + ', ' + fmtNum(w.ci[1], 3) + ']' : '—');
      td(w ? fmtP(w.p) + ' ' + stars(w.p) +
             '<span class="sub">t ' + fmtNum(w.t, 2) + ' · df ' +
             fmtNum(w.df, 0) + '</span>' : '—');
      td(m ? fmtP(m.p) + ' ' + stars(m.p) +
             '<span class="sub">rank-biserial ' +
             (m.rank_biserial >= 0 ? '+' : '') +
             fmtNum(m.rank_biserial, 3) + '</span>' : '—');
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    box.appendChild(tbl);

    var ul = document.createElement('ul');
    ul.className = 'caveats';
    (c.caveats || []).forEach(function (t) {
      var li = document.createElement('li');
      li.textContent = t;
      ul.appendChild(li);
    });
    box.appendChild(ul);
    host.appendChild(box);
  }

  return { build: build, fetch: fetchWindow, render: function () {
    render(current);
  }, current: function () { return current; } };
})();
