/* Statistics and Event Analysis in the browser: the port of stats.py and events.py.

   Split from compute.js only for size; the same rule applies -- every function
   mirrors a named Python one and is checked against it by
   tools/verify_homepage_parity.py.

   Two numerical details worth stating, because a plausible-looking alternative
   gives different numbers:

   * PERCENTILES ARE numpy's LINEAR interpolation, not "the nearest element".
     For n = 4 the median is the mean of the middle two, and q1 sits a quarter of
     the way between the first and second. The textbook alternatives disagree by
     enough to change a reported quartile.

   * THE SUMMARY SD IS THE SAMPLE SD (ddof = 1), while the SD inside a period bin
     and inside z-normalisation is the POPULATION one (ddof = 0). That is not an
     inconsistency to be tidied: the bin's SD describes the posts in that bin,
     which are all of them, whereas the summary describes a sample. The server
     makes the same distinction and the two are kept apart here deliberately. */
var COMPUTE_STATS = (function () {

  var C = COMPUTE;

  function pct(sorted, q) {
    var n = sorted.length;
    if (!n) return NaN;
    if (n === 1) return sorted[0];
    var pos = (q / 100) * (n - 1);
    var lo = Math.floor(pos), hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  /* stats._summary. `w` is optional and only adds the weighted mean. */
  function summary(vals, weights) {
    var v = [];
    for (var i = 0; i < vals.length; i++) if (isFinite(vals[i])) v.push(vals[i]);
    if (!v.length) return { n: 0 };
    var n = v.length, s = 0, i2;
    for (i2 = 0; i2 < n; i2++) s += v[i2];
    var mean = s / n, acc = 0;
    for (i2 = 0; i2 < n; i2++) acc += (v[i2] - mean) * (v[i2] - mean);
    var sorted = v.slice().sort(function (a, b) { return a - b; });
    var out = {
      n: n, mean: C.clean(mean),
      sd: n > 1 ? C.clean(Math.sqrt(acc / (n - 1))) : null,   // ddof = 1
      median: C.clean(pct(sorted, 50)),
      q1: C.clean(pct(sorted, 25)), q3: C.clean(pct(sorted, 75)),
      min: C.clean(sorted[0]), max: C.clean(sorted[n - 1])
    };
    if (weights) {
      var sw = 0, sv = 0;
      for (i2 = 0; i2 < n; i2++) { sw += weights[i2]; sv += weights[i2] * v[i2]; }
      out.weighted_mean = sw > 0 ? C.clean(sv / sw) : null;
    }
    return out;
  }

  /* stats._ordinal -- exact per-level bars for a discrete 0-3 score. */
  function ordinal(vals, weights, label, id, color) {
    var seen = {}, i;
    for (i = 0; i < vals.length; i++) if (isFinite(vals[i])) seen[vals[i]] = 1;
    var levels = Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
    var counts = levels.map(function () { return 0; });
    var wc = weights ? levels.map(function () { return 0; }) : null;
    var at = {};
    levels.forEach(function (lv, k) { at[lv] = k; });
    for (i = 0; i < vals.length; i++) {
      var k2 = at[vals[i]];
      if (k2 === undefined) continue;
      counts[k2]++;
      if (wc) wc[k2] += weights[i];
    }
    var total = counts.reduce(function (a, b) { return a + b; }, 0) || 1;
    return { id: id, label: label, color: color, kind: 'ordinal',
             levels: levels, counts: counts,
             pct: counts.map(function (c) { return 100.0 * c / total; }),
             weighted: wc, summary: summary(vals, weights) };
  }

  /* stats._hist. Edges are linspace(a, b, bins+1); the LAST bin is closed, which
     is np.histogram's rule and the reason a value exactly at the maximum is
     counted rather than dropped. */
  function hist(vals, weights, label, id, color, bins, lo, hi, transform) {
    var v = [], w = weights ? [] : null, i;
    for (i = 0; i < vals.length; i++) {
      if (!isFinite(vals[i])) continue;
      v.push(vals[i]);
      if (w) w.push(weights[i]);
    }
    if (!v.length) {
      return { id: id, label: label, color: color, kind: 'hist',
               edges: [], counts: [], summary: { n: 0 } };
    }
    var a = (lo === null || lo === undefined) ? Math.min.apply(null, v) : lo;
    var b = (hi === null || hi === undefined) ? Math.max.apply(null, v) : hi;
    if (b <= a) b = a + 1e-9;
    var edges = [], k;
    for (k = 0; k <= bins; k++) edges.push(a + (b - a) * k / bins);
    var counts = new Array(bins).fill(0);
    var wcounts = w ? new Array(bins).fill(0) : null;
    var step = (b - a) / bins;
    for (i = 0; i < v.length; i++) {
      if (v[i] < a || v[i] > b) continue;
      var ix = Math.floor((v[i] - a) / step);
      if (ix >= bins) ix = bins - 1;             // the closed last bin
      if (ix < 0) ix = 0;
      counts[ix]++;
      if (wcounts) wcounts[ix] += w[i];
    }
    var out = { id: id, label: label, color: color, kind: 'hist',
                edges: edges.map(C.clean), counts: counts,
                summary: summary(v, w) };
    if (wcounts) out.weighted = wcounts.map(C.clean);
    if (transform) out.transform = transform;
    return out;
  }

  var WB_BINS = 40, ORDINAL_MAX = 12;

  /* stats.build.

     NOTE the date filter here is on the DATE STRING and INCLUSIVE of the end
     day, unlike build_series which filters on a timestamp and therefore excludes
     it. That difference is the server's; it is reproduced, not corrected. */
  function buildStats(D, opts) {
    var loc = (opts.location || 'all').toLowerCase();
    var sd = C.isoToDay(opts.start_date), ed = C.isoToDay(opts.end_date);
    var base = D.indexFor(loc);
    var sel = [];
    for (var q = 0; q < base.length; q++) {
      var j = base[q], d = D.day[j];
      if (sd !== null && d < sd) continue;
      if (ed !== null && d > ed) continue;       // inclusive: date-string filter
      sel.push(j);
    }
    if (!sel.length) {
      return { empty: true, meta: { location: loc, n_posts: 0 } };
    }
    var cfg = D.manifest, inds = D.indicators;
    var useW = !!opts.weight_reactions;

    // z over THIS selection (date filter included) -- stats.build's own choice
    var zcols = [], zsum = new Float64Array(sel.length), i, k;
    for (i = 0; i < inds.length; i++) {
      var st = C.znormOver(D.score[i], sel);
      var col = new Float64Array(sel.length);
      for (k = 0; k < sel.length; k++) {
        col[k] = (D.score[i][sel[k]] - st.mu) / st.sd;
        zsum[k] += col[k];
      }
      zcols.push(col);
    }
    var wb = new Float64Array(sel.length);
    var w = useW ? new Float64Array(sel.length) : null;
    for (k = 0; k < sel.length; k++) {
      wb[k] = C.wellbeingOf(zsum[k], opts.sensitivity);
      if (w) w[k] = D.weight[sel[k]];
    }

    // --- distributions ---------------------------------------------------
    var dists = [hist(wb, w, cfg.wellbeing.label, 'wellbeing',
                      cfg.wellbeing.color, WB_BINS, 0.0, 1.0, null)];
    cfg.constructs.forEach(function (c, m) {
      var v = new Float64Array(sel.length);
      var seen = {};
      for (var p = 0; p < sel.length; p++) { v[p] = D.score[m][sel[p]]; seen[v[p]] = 1; }
      var label = c.short + ' ' + c.label;
      dists.push(Object.keys(seen).length <= ORDINAL_MAX
        ? ordinal(v, w, label, c.id, c.color)
        : hist(v, w, label, c.id, c.color, WB_BINS, null, null, null));
    });

    /* NO reaction distribution. The server draws one; the static build cannot,
       because reaction counts are not published (they fingerprint a specific
       public post -- see tools/extract_homepage_data.py). The frame omits the
       panel rather than drawing an empty one, and stats.js copes with the key
       being absent. */

    // --- coverage ---------------------------------------------------------
    var pspec = C.parsePeriod(opts.period);
    var starts = C.binStarts(D.day[sel[0]], D.day[sel[sel.length - 1]], pspec);
    var cx = [], cn = [], empty = 0;
    for (var b = 0; b < starts.length; b++) {
      var r = C.binRange(starts[b], { windowed: false, spec: pspec });
      var cnt = 0;
      for (k = 0; k < sel.length; k++) {
        var dd = D.day[sel[k]];
        if (dd >= r[0] && dd < r[1]) cnt++;
      }
      cx.push(C.dayToISO(starts[b]));
      cn.push(cnt);
      if (cnt === 0) empty++;
    }
    var sortedN = cn.slice().sort(function (a, b2) { return a - b2; });
    var coverage = {
      period: pspec.raw, period_label: pspec.label, x: cx, n: cn,
      empty_periods: empty,
      median_per_period: cn.length ? C.clean(pct(sortedN, 50)) : null
    };
    var byLoc = {};
    for (k = 0; k < sel.length; k++) {
      var nm = D.locNames[D.loc[sel[k]]] || '(unknown)';
      byLoc[nm] = (byLoc[nm] || 0) + 1;
    }
    coverage.by_location = Object.keys(byLoc)
      .sort(function (a, b2) { return byLoc[b2] - byLoc[a]; })
      .map(function (nm) {
        return { location: nm, n: byLoc[nm],
                 pct: 100.0 * byLoc[nm] / sel.length };
      });

    // --- breakdowns -------------------------------------------------------
    function group(keys) {
      var buckets = {};
      for (var p = 0; p < keys.length; p++) {
        (buckets[keys[p]] = buckets[keys[p]] || []).push(p);
      }
      return Object.keys(buckets).sort().map(function (key) {
        var ix = buckets[key];
        var pick = function (src) {
          var o = new Float64Array(ix.length);
          for (var q2 = 0; q2 < ix.length; q2++) o[q2] = src[ix[q2]];
          return o;
        };
        var ww = w ? pick(w) : null;
        var row = { key: key, n: ix.length, wellbeing: summary(pick(wb), ww) };
        cfg.constructs.forEach(function (c, m) {
          row[c.id] = summary(pick(zcols[m]), ww);
        });
        return row;
      });
    }
    var locKeys = [], yrKeys = [];
    for (k = 0; k < sel.length; k++) {
      locKeys.push(D.locNames[D.loc[sel[k]]] || '(unknown)');
      yrKeys.push(C.dayToISO(D.day[sel[k]]).slice(0, 4));
    }

    return {
      empty: false,
      distributions: dists,
      coverage: coverage,
      breakdown: {
        by_location: group(locKeys),
        by_year: group(yrKeys),
        scale: 'constructs are z-normalised over the current selection'
      },
      meta: { location: loc, n_posts: sel.length,
              sensitivity: opts.sensitivity,
              weight_reactions: useW,
              start_date: sd === null ? null : C.dayToISO(sd),
              end_date: ed === null ? null : C.dayToISO(ed),
              period: pspec.raw }
    };
  }

  return { summary: summary, ordinal: ordinal, hist: hist, pct: pct,
           buildStats: buildStats };
})();
