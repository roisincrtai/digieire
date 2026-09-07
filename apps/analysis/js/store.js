/* Holds the corpus in typed arrays. No loading, no fetching, no waiting.

   The data arrives as a SCRIPT TAG -- `data/bundle.js`, written by
   tools/extract_homepage_data.py, which assigns `window.DIGIEIRE_BUNDLE`. By the
   time any of this runs the rows are already in memory, so there is nothing to
   await and no progress to report.

   WHY A SCRIPT AND NOT fetch(). Two reasons, and the second is the deciding one:

   * `file://` works. Browsers refuse fetch() on file:// URLs, so a page opened by
     double-clicking could show the app but never read its data. A <script> tag is
     not subject to that rule. The homepage has to work from a local folder and
     from a web server alike, and this is the only loading mechanism that does
     both without a protocol check.
   * There is no loading state to design, get wrong, or explain. The app either
     has its data or the page did not load.

   The JSON shards in data/discourses/ are still the published dataset -- small,
   readable, reusable, and what anyone wanting the numbers should take. bundle.js
   is the same rows in the one encoding a browser can read from anywhere.

   Rows are positional and SCORES ONLY, `[day, I1, I2, I3, location]`, in time
   order -- which every computation relies on, since binning binary-searches a
   sorted day array rather than scanning.

   NO REACTION COUNTS ARE PUBLISHED, so there is no reaction weighting. That is a
   GDPR decision taken in the exporter: an exact reaction count fingerprints a
   specific public post and would give anyone holding the source corpus a join key
   back to it. `weight` is 1 for every discourse, kept as an array so the shared
   computation code needs no special case, and the app greys its "weight by
   reactions" control.

   Nothing here writes. There is nowhere to write to. */
var STORE = (function () {

  var D = null;

  function bundle() {
    var b = (typeof window !== 'undefined') ? window.DIGIEIRE_BUNDLE : null;
    if (!b) {
      throw new Error('data/bundle.js did not load — check that the data ' +
                      'directory sits beside this app');
    }
    return b;
  }

  /* Unpack once, on first use. Synchronous by construction. */
  function data() {
    if (!D) D = unpack(bundle());
    return D;
  }

  function unpack(b) {
    var mf = b.manifest, rows = b.rows;
    COMPUTE.setEpoch(mf.epoch);

    var n = rows.length, i;
    var day = new Int32Array(n);
    var weight = new Float64Array(n).fill(1.0);   // unweighted: see the header
    var loc = new Int8Array(n);
    var nInd = mf.indicators.length;
    var score = [];
    for (i = 0; i < nInd; i++) score.push(new Float64Array(n));

    for (i = 0; i < n; i++) {
      var r = rows[i];
      day[i] = r[0];
      for (var c = 0; c < nInd; c++) score[c][i] = r[1 + c];
      loc[i] = r[1 + nInd];
    }
    if (n !== mf.n_discourses) {
      throw new Error('bundle holds ' + n + ' rows, manifest says ' +
                      mf.n_discourses);
    }
    /* Sorted-by-day is a PRECONDITION, not a hope: every bin is taken as a
       contiguous slice found by binary search, so an out-of-order row would
       land silently in the wrong period. Cheap once, undiagnosable later. */
    for (i = 1; i < n; i++) {
      if (day[i] < day[i - 1]) {
        throw new Error('bundle rows are not in time order at row ' + i);
      }
    }

    var locNames = mf.locations.filter(function (x) { return x !== 'all'; });
    var cache = {};

    function indexFor(name) {
      name = (name || 'all').toLowerCase();
      if (cache[name]) return cache[name];
      var out;
      if (name === 'all') {
        out = new Int32Array(n);
        for (var q = 0; q < n; q++) out[q] = q;
      } else {
        var want = locNames.indexOf(name);
        var tmp = [];
        for (var p = 0; p < n; p++) if (loc[p] === want) tmp.push(p);
        out = Int32Array.from(tmp);
      }
      cache[name] = out;
      return out;
    }

    return {
      n: n, day: day, score: score, weight: weight, loc: loc,
      weighted_available: false,
      indicators: mf.indicators, locations: mf.locations, locNames: locNames,
      climate: b.climate, events: (b.events || []),
      manifest: mf, indexFor: indexFor
    };
  }

  function meta() { return bundle().manifest; }

  return { data: data, meta: meta };
})();
