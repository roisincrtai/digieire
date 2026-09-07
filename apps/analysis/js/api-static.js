/* The STATIC backend: the same payloads as the Flask server, computed here.

   This file replaces apps/analysis/js/api.js and nothing else. Every view module
   above it -- chart.js, controls.js, panels.js, event.js, stats.js, views.js,
   main.js -- is byte-identical to the server app's, copied in by
   tools/build_homepage_app.py. The whole difference between "runs on a laptop
   with Flask" and "runs on GitHub Pages" is which of these two files is loaded.

   THREE FRAMES, NOT FOUR. The Fit Model frame is absent, and that is a
   capability, not a bug: ARMA, the Gibbs-sampled state-space model, the GP and
   the neural window models are SciPy and Torch, and no honest amount of
   JavaScript makes them run in a browser tab. `has('fit')` returns false, the
   config omits the tab, and main.js skips fit.js entirely -- so the reader is
   never shown a button that cannot work. The modelling lives in the desktop app.

   NO REACTION WEIGHTING, for a different reason: reaction counts are not
   published at all (they fingerprint a specific public post -- see
   tools/extract_homepage_data.py). Every frame therefore declares `weight` as a
   disabled control, which the existing greying convention already handles, and
   every figure here is the unweighted one. tools/verify_homepage_parity.py
   compares these payloads against the server run with `weight=0`, so "the
   homepage shows the same numbers as the paper" stays a checked claim.

   THERE IS NO LOADING. The corpus arrives as a script tag before any of this
   runs (see store.js), so every request is answered from memory on a microtask.
   The answers are still Promises: the view modules are written against an
   asynchronous API, and making this the one place with different timing would
   be a trap for whoever changes them next. */
var API = (function () {

  function parse(query) {
    var out = {};
    new URLSearchParams(query || '').forEach(function (v, k) { out[k] = v; });
    return out;
  }

  function num(q, k, d) {
    var v = parseFloat(q[k]);
    return isFinite(v) ? v : d;
  }

  function flag(q, k, d) {
    if (q[k] === undefined) return d;
    return ['1', 'true', 'yes', 'on'].indexOf(String(q[k]).toLowerCase()) !== -1;
  }

  function spec(n, unit) {
    var v = parseInt(n, 10);
    return (isFinite(v) && v > 0) ? (v + unit) : '0';
  }

  /* The controls each frame exposes, mirroring apps/analysis/config.TABS with
     two static-build differences: no Fit frame, and `weight` disabled
     everywhere because reaction counts are not published. */
  function tabs() {
    var W = ['weight'];
    return [
      { id: 'dashboard', label: 'Dashboard', hint: 'Linked maps of recorded floods and allocated wellbeing', controls: [] },
      { id: 'overall', label: 'National Analysis',
        hint: 'the wellbeing index, the three constructs, and the climate ' +
              'reference',
        controls: ['dates', 'period', 'window', 'location', 'view'],
        disabled: W, defaults: {} },
      { id: 'event', label: 'Event Analysis',
        hint: 'a window picked off the rainfall record: the climate reference, ' +
              'the index and the constructs inside it, before vs after',
        controls: ['location', 'view'],
        disabled: W.concat(['show_mean', 'two_colors']), defaults: {} },
      { id: 'stats', label: 'Statistics',
        hint: 'distributions, coverage and breakdowns of the scores themselves',
        controls: ['dates', 'period', 'location', 'view'],
        disabled: W.concat(['show_band', 'show_mean', 'two_colors',
                            'scale_raw', 'scale_znorm']),
        defaults: { period_n: 1, period_unit: 'm' } }
    ];
  }

  function config(D) {
    var mf = D.manifest;
    return {
      version: '1.0-static',
      dataset: mf.dataset,
      constructs: mf.constructs,
      wellbeing: mf.wellbeing,
      reference: mf.reference,
      units: ['d', 'm', 'y'],
      unit_label: { d: 'days', m: 'months', y: 'years' },
      unit_max: { d: 365, m: 36, y: 10 },
      defaults: {
        period_n: 7, period_unit: 'd', window_n: 10, window_unit: 'd',
        mode: 'double', location: 'all',
        // Off, and greyed: the counts it would weight by are not published.
        weight_reactions: false,
        scale: 'znorm', sensitivity: 5.0
      },
      locations: mf.locations,
      date_min: mf.date_min,
      date_max: mf.date_max,
      n_posts: mf.n_discourses,
      // The internal dataset key was dropped: it names a directory on our
      // machines and tells a reader nothing. What is left is what provenance is
      // actually for -- how much was scored, what was published, and when.
      source: mf.n_discourses.toLocaleString() +
              ' scored discourses · scores only, no text or identifiers · ' +
              'built ' + (mf.generated || '').slice(0, 10),
      tabs: tabs(),
      event_defaults: { days: 15, mode: 'double', kind: 'all' },
      privacy: mf.privacy,
      static: true
    };
  }

  function answer(name, query) {
    var D = STORE.data();      // synchronous: the bundle is already in memory
    var q = parse(query);
    var sens = num(q, 'sensitivity', 5.0);
    // Always false: see the header. Read from the query anyway so that a URL
    // asking for weighting gets the honest answer rather than a silent one.
    var weighted = false;

    if (name === 'config') return config(D);

    if (name === 'series') {
      return COMPUTE.buildSeries(D, {
        period: spec(q.period_n, q.period_unit || 'd'),
        window: spec(q.window_n, q.window_unit || q.period_unit || 'd'),
        mode: q.mode || 'double',
        start_date: q.start_date || null,
        end_date: q.end_date || null,
        location: q.location || 'all',
        weight_reactions: weighted,
        sensitivity: sens
      });
    }

    if (name === 'stats') {
      return COMPUTE_STATS.buildStats(D, {
        period: spec(q.period_n, q.period_unit || 'm'),
        start_date: q.start_date || null,
        end_date: q.end_date || null,
        location: q.location || 'all',
        weight_reactions: weighted,
        sensitivity: sens
      });
    }

    if (name === 'horizon') return COMPUTE_EVENT.horizon(D, q.kind || 'all');

    if (name === 'event') {
      var date = q.date;
      if (!date && q.event) {
        var hit = D.events.filter(function (e) { return e.id === q.event; })[0];
        if (!hit) throw new Error('unknown event ' + q.event);
        date = hit.anchor;
      }
      if (!date) throw new Error('pass date=YYYY-MM-DD');
      return COMPUTE_EVENT.analyse(D, {
        date: date, days: q.days, mode: q.mode || 'double',
        location: q.location || 'all',
        weight_reactions: weighted, sensitivity: sens
      });
    }

    throw new Error('this build has no ' + name + ' endpoint');
  }

  /* Wrapped in a Promise deliberately: a throw inside `answer` becomes a
     rejection, so the view modules' existing .catch handlers put the message on
     screen instead of the page dying silently. */
  function get(name, query) {
    return new Promise(function (resolve) { resolve(answer(name, query)); });
  }

  function post(name) {
    return Promise.reject(new Error('this build is read-only and has no ' +
                                    name + ' endpoint'));
  }

  /* The Fit frame needs a server. This build has none, and says so rather than
     shipping a tab whose only button 404s. */
  function has(feature) { return feature !== 'fit'; }

  return { get: get, post: post, has: has, mode: 'static' };
})();
