/* Event Analysis in the browser: the port of events.py.

   The horizon record, the window around a chosen day, and the before/after
   comparison with its Welch interval and Mann-Whitney rank test. As elsewhere,
   this mirrors the Python and is checked against it by
   tools/verify_homepage_parity.py.

   THE TWO DISTRIBUTIONS ARE COMPUTED WITHOUT SciPy, which the browser does not
   have, so the two functions it supplied are implemented here:

   * Student's t survival function, via the regularised incomplete beta with a
     continued fraction (Lentz). Accurate to ~1e-14 over the range that matters,
     which is well past the precision anyone reads off a p-value, and checked
     against SciPy in the parity tool rather than assumed.

   * The normal tail for Mann-Whitney, with the TIE CORRECTION. The tie term is
     not optional here: the constructs are 0-3 ordinals, so a window of a few
     hundred posts has hundreds of ties, and the uncorrected variance would
     inflate every z and report significance that is not there. SciPy applies it
     by default and so does this.

   Mann-Whitney is the NORMAL APPROXIMATION with continuity correction, which is
   what SciPy uses above its exact-test threshold; below about 8 posts a side it
   would differ from SciPy's exact p-value, and MIN_SIDE_POSTS already suppresses
   the test at 3. The parity tool checks the agreement on real windows. */
var COMPUTE_EVENT = (function () {

  var C = COMPUTE;
  var DEFAULT_DAYS = 15, MAX_DAYS = 180, MIN_SIDE_POSTS = 3;

  // ---- special functions ------------------------------------------------
  function logGamma(x) {
    var g = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    var xx = x, y = x, tmp = xx + 5.5;
    tmp -= (xx + 0.5) * Math.log(tmp);
    var ser = 1.000000000190015;
    for (var j = 0; j < 6; j++) ser += g[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / xx);
  }

  /* Regularised incomplete beta I_x(a,b), by continued fraction (Lentz). */
  function betacf(a, b, x) {
    var MAXIT = 300, EPS = 3e-16, FPMIN = 1e-300;
    var qab = a + b, qap = a + 1, qam = a - 1;
    var c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    var h = d, m, m2, aa, del;
    for (m = 1; m <= MAXIT; m++) {
      m2 = 2 * m;
      aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; del = d * c; h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }

  function betainc(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    var bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) +
                      a * Math.log(x) + b * Math.log(1 - x));
    return (x < (a + 1) / (a + b + 2))
      ? bt * betacf(a, b, x) / a
      : 1 - bt * betacf(b, a, 1 - x) / b;
  }

  /* P(T > |t|) for Student's t with `df` degrees of freedom (one tail). */
  function tSF(t, df) {
    var x = df / (df + t * t);
    return 0.5 * betainc(df / 2, 0.5, x);
  }

  /* The two-sided critical value at 95%, by bisection on tSF. Bisection rather
     than a closed form because tSF is already here, is monotone, and 60
     iterations cost nothing once per comparison row. */
  function tPPF975(df) {
    var lo = 0, hi = 1000;
    for (var i = 0; i < 200; i++) {
      var mid = (lo + hi) / 2;
      if (tSF(mid, df) > 0.025) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  function normSF(z) {                       // P(Z > z), via erfc
    return 0.5 * erfc(z / Math.SQRT2);
  }

  function erfc(x) {                          // Numerical Recipes erfcc, ~1.2e-7
    var z = Math.abs(x), t = 2 / (2 + z);
    var ty = 4 * t - 2;
    var cof = [-1.3026537197817094, 6.4196979235649026e-1, 1.9476473204185836e-2,
               -9.561514786808631e-3, -9.46595344482036e-4, 3.66839497852761e-4,
               4.2523324806907e-5, -2.0278578112534e-5, -1.624290004647e-6,
               1.303655835580e-6, 1.5626441722e-8, -8.5238095915e-8,
               6.529054439e-9, 5.059343495e-9, -9.91364156e-10,
               -2.27365122e-10, 9.6467911e-11, 2.394038e-12, -6.886027e-12,
               8.94487e-13, 3.13092e-13, -1.12708e-13, 3.81e-16, 7.106e-15];
    var d = 0, dd = 0, tmp, j;
    for (j = cof.length - 1; j > 0; j--) {
      tmp = d; d = ty * d - dd + cof[j]; dd = tmp;
    }
    var ans = t * Math.exp(-z * z + 0.5 * (cof[0] + ty * d) - dd);
    return x >= 0 ? ans : 2 - ans;
  }

  // ---- weighted stats ---------------------------------------------------
  /* events._wstats: (n, n_eff, mean, sd) with Kish's effective sample size.
     n_eff is what the interval uses -- with one dominant post it collapses
     towards 1, which is the honest answer about how much that sample says. */
  function wstats(vals, weights) {
    var v = [], w = [], i;
    for (i = 0; i < vals.length; i++) {
      if (isFinite(vals[i]) && isFinite(weights[i]) && weights[i] > 0) {
        v.push(vals[i]); w.push(weights[i]);
      }
    }
    var n = v.length;
    if (!n) return [0, 0, NaN, NaN];
    var sw = 0, sw2 = 0, sv = 0;
    for (i = 0; i < n; i++) { sw += w[i]; sw2 += w[i] * w[i]; sv += w[i] * v[i]; }
    var nEff = sw > 0 ? (sw * sw) / sw2 : 0;
    var mean = sv / sw, acc = 0;
    for (i = 0; i < n; i++) acc += w[i] * (v[i] - mean) * (v[i] - mean);
    var vr = acc / sw;
    if (nEff > 1) vr *= nEff / (nEff - 1.0);
    return [n, nEff, mean, Math.sqrt(Math.max(vr, 0))];
  }

  /* events._welch -- difference b - a, Welch interval and p. */
  function welch(a, b) {
    var na = a[0], ea = a[1], ma = a[2], sa = a[3];
    var nb = b[0], eb = b[1], mb = b[2], sb = b[3];
    if (ea < 2 || eb < 2 || !isFinite(ma) || !isFinite(mb)) return null;
    var va = sa * sa / ea, vb = sb * sb / eb;
    var se = Math.sqrt(va + vb);
    if (!isFinite(se) || se <= 0) return null;
    var diff = mb - ma;
    var denom = (va * va / Math.max(ea - 1, 1)) + (vb * vb / Math.max(eb - 1, 1));
    var df = denom > 0 ? Math.pow(va + vb, 2) / denom : (ea + eb - 2);
    var t = diff / se;
    var p = 2.0 * tSF(Math.abs(t), df);
    var crit = tPPF975(df);
    return { diff: diff, se: se, t: t, df: df, p: p,
             ci: [diff - crit * se, diff + crit * se] };
  }

  /* events._mannwhitney -- unweighted, normal approximation with tie
     correction and continuity correction, matching scipy's default for
     samples this size. U is computed for `b` against `a`, as the server does. */
  function mannwhitney(aVals, bVals) {
    var a = [], b = [], i;
    for (i = 0; i < aVals.length; i++) if (isFinite(aVals[i])) a.push(aVals[i]);
    for (i = 0; i < bVals.length; i++) if (isFinite(bVals[i])) b.push(bVals[i]);
    var n1 = b.length, n2 = a.length;           // U is for b vs a
    if (n2 < MIN_SIDE_POSTS || n1 < MIN_SIDE_POSTS) return null;

    var all = [];
    for (i = 0; i < b.length; i++) all.push({ v: b[i], g: 1 });
    for (i = 0; i < a.length; i++) all.push({ v: a[i], g: 0 });
    all.sort(function (x, y) { return x.v - y.v; });

    // midranks, and the tie term sum(t^3 - t) over tied groups
    var ranks = new Float64Array(all.length), tieSum = 0, k = 0;
    while (k < all.length) {
      var j = k;
      while (j + 1 < all.length && all[j + 1].v === all[k].v) j++;
      var mid = (k + j + 2) / 2;                // ranks are 1-based
      for (var q = k; q <= j; q++) ranks[q] = mid;
      var t = j - k + 1;
      if (t > 1) tieSum += t * t * t - t;
      k = j + 1;
    }
    var r1 = 0;
    for (i = 0; i < all.length; i++) if (all[i].g === 1) r1 += ranks[i];
    var u = r1 - n1 * (n1 + 1) / 2;

    var n = n1 + n2;
    var mu = n1 * n2 / 2;
    var sigma2 = (n1 * n2 / 12.0) * ((n + 1) - tieSum / (n * (n - 1.0)));
    if (!(sigma2 > 0)) return null;
    var z = (Math.abs(u - mu) - 0.5) / Math.sqrt(sigma2);   // continuity
    var p = 2.0 * normSF(Math.max(z, 0));
    if (p > 1) p = 1;
    return { u: u, p: p, rank_biserial: 2.0 * u / (n1 * n2) - 1.0,
             n_before: n2, n_after: n1 };
  }

  // ---- the frame's payloads --------------------------------------------
  function atDate(D, day) {
    var hit = null;
    D.events.forEach(function (e) {
      if (e.start <= day && day <= e.end) {
        if (!hit || e.kind === 'storm') hit = e;
      }
    });
    return hit;
  }

  /* events.horizon -- the full monthly rainfall record plus every marker. */
  function horizon(D, kind) {
    var m = D.climate;
    if (!m || m.empty) {
      return { empty: true, x: [], rain: [], floods: [], storms: [],
               events: [], resolution: '1m' };
    }
    var lo = D.manifest.date_min, hi = D.manifest.date_max;
    var x = [], rain = [], fl = [], st = [];
    for (var i = 0; i < m.x.length; i++) {
      if (m.x[i] < lo || m.x[i] > hi) continue;
      x.push(m.x[i]); rain.push(m.rain[i]);
      fl.push(m.floods[i]); st.push(m.storms[i]);
    }
    var ev = D.events.filter(function (e) {
      if (kind && kind !== 'all' && e.kind !== kind) return false;
      return !(e.end < lo || e.start > hi);
    });
    return { empty: !x.length, x: x, rain: rain, floods: fl, storms: st,
             lta: m.lta, rain_unit: m.rain_unit, resolution: '1m',
             date_min: lo, date_max: hi, events: ev };
  }

  /* events.window_reference -- the reference clipped to one window, with a
     month of padding either side so a window inside one calendar month still
     has a neighbour to be read against. */
  function windowReference(D, start, end) {
    var m = D.climate;
    if (!m || m.empty) {
      return { empty: true, x: [], rain: [], floods: [], storms: [],
               resolution: '1m' };
    }
    var lo = C.dayToISO(C.isoToDay(start) - 31);
    var hi = C.dayToISO(C.isoToDay(end) + 31);
    var x = [], rain = [], fl = [], st = [];
    for (var i = 0; i < m.x.length; i++) {
      if (m.x[i] < lo || m.x[i] > hi) continue;
      x.push(m.x[i]); rain.push(m.rain[i]);
      fl.push(m.floods[i]); st.push(m.storms[i]);
    }
    return { empty: !x.length, x: x, rain: rain, floods: fl, storms: st,
             lta: m.lta, resolution: '1m',
             note: 'the climate reference is monthly; a day-level window shows ' +
                   'the month(s) it falls in, not a daily trace' };
  }

  function label(D, id) {
    var c = D.manifest.constructs.filter(function (x) { return x.id === id; })[0];
    return c ? (c.short + ' ' + c.label + ' (z)') : 'Wellbeing index';
  }

  /* events.analyse -- the window around one chosen day. */
  function analyse(D, opts) {
    var days = Math.max(1, Math.min(parseInt(opts.days, 10) || DEFAULT_DAYS,
                                    MAX_DAYS));
    var mode = String(opts.mode || 'double').toLowerCase().charAt(0) === 's'
      ? 'single' : 'double';
    var anchor = C.isoToDay(opts.date);
    if (anchor === null) throw new Error('date must be YYYY-MM-DD');
    var anchorISO = C.dayToISO(anchor);
    var event = atDate(D, anchorISO);
    var loD = anchor - days;
    var hiD = anchor + (mode === 'single' ? 0 : days);
    var loS = C.dayToISO(loD), hiS = C.dayToISO(hiD);

    var loc = (opts.location || 'all').toLowerCase();
    var base = D.indexFor(loc);
    if (!base.length) {
      return { empty: true, event: event, anchor: anchorISO,
               reason: 'no posts at this location' };
    }

    // Standardise over the WHOLE location-filtered corpus, then slice.
    var inds = D.indicators, i, k;
    var zcols = [], zsum = new Float64Array(D.n);
    for (i = 0; i < inds.length; i++) {
      var stz = C.znormOver(D.score[i], base);
      var col = new Float64Array(D.n);
      for (k = 0; k < base.length; k++) {
        col[base[k]] = (D.score[i][base[k]] - stz.mu) / stz.sd;
        zsum[base[k]] += col[base[k]];
      }
      zcols.push(col);
    }
    var wb = new Float64Array(D.n);
    for (k = 0; k < base.length; k++) {
      wb[base[k]] = C.wellbeingOf(zsum[base[k]], opts.sensitivity);
    }

    var sel = [];
    for (k = 0; k < base.length; k++) {
      var d = D.day[base[k]];
      if (d >= loD && d <= hiD) sel.push(base[k]);   // date-string filter: inclusive
    }
    var wref = windowReference(D, loS, hiS);
    if (!sel.length) {
      return { empty: true, event: event, anchor: anchorISO,
               window: { start: loS, end: hiS, anchor: anchorISO,
                         days: days, mode: mode },
               reference: wref, reason: 'no posts in this window' };
    }

    var weighted = !!opts.weight_reactions;
    // group by day
    var byDay = {}, xs = [];
    for (k = 0; k < sel.length; k++) {
      var key = D.day[sel[k]];
      if (!byDay[key]) { byDay[key] = []; xs.push(key); }
      byDay[key].push(sel[k]);
    }
    xs.sort(function (a, b) { return a - b; });

    function daily(values) {
      var mean = [], lo = [], hi = [], n = [];
      xs.forEach(function (dd) {
        var ix = byDay[dd];
        var v = [], w = [];
        for (var q = 0; q < ix.length; q++) {
          v.push(values[ix[q]]);
          w.push(weighted ? D.weight[ix[q]] : 1);
        }
        var s = wstats(v, w);
        mean.push(C.clean(s[2]));
        lo.push(C.clean(s[2] - s[3]));
        hi.push(C.clean(s[2] + s[3]));
        n.push(s[0]);
      });
      return { mean: mean, lo: lo, hi: hi, n: n };
    }

    var constructs = {};
    inds.forEach(function (id, m) { constructs[id] = daily(zcols[m]); });

    var out = {
      empty: false,
      event: event,
      anchor: anchorISO,
      window: { start: loS, end: hiS, anchor: anchorISO, days: days, mode: mode },
      reference: wref,
      x: xs.map(C.dayToISO),
      rel: xs.map(function (d) { return d - anchor; }),
      n_posts: xs.map(function (d) { return byDay[d].length; }),
      wellbeing: daily(wb),
      constructs: constructs,
      comparison: null,
      meta: { location: loc, sensitivity: opts.sensitivity,
              weight_reactions: weighted, n_posts: sel.length,
              n_days: xs.length, scale: 'znorm' }
    };

    if (mode === 'double') {
      out.comparison = compare(D, sel, anchor, wb, zcols, weighted);
    } else {
      out.comparison_note = 'before/after needs the double-sided window: the ' +
                            'single-sided window stops at day 0.';
    }
    return out;
  }

  /* events._compare -- strictly before day 0 against on-or-after day 0. Day 0
     itself counts as "after": the event is happening on it, so it belongs with
     the response rather than the baseline. */
  function compare(D, sel, anchor, wb, zcols, weighted) {
    var before = [], after = [], k;
    for (k = 0; k < sel.length; k++) {
      (D.day[sel[k]] < anchor ? before : after).push(sel[k]);
    }
    var cols = [{ id: 'wellbeing', src: wb }];
    D.indicators.forEach(function (id, m) { cols.push({ id: id, src: zcols[m] }); });

    var rows = cols.map(function (c) {
      function pull(ix) {
        var v = [], w = [];
        for (var q = 0; q < ix.length; q++) {
          v.push(c.src[ix[q]]);
          w.push(weighted ? D.weight[ix[q]] : 1);
        }
        return [v, w];
      }
      var pb = pull(before), pa = pull(after);
      var sb = wstats(pb[0], pb[1]), sa = wstats(pa[0], pa[1]);
      var test = (sb[0] >= MIN_SIDE_POSTS && sa[0] >= MIN_SIDE_POSTS)
        ? welch(sb, sa) : null;
      var mw = mannwhitney(pb[0], pa[0]);
      return {
        metric: c.id,
        label: c.id === 'wellbeing' ? 'Wellbeing index' : label(D, c.id),
        before: { n: sb[0], n_eff: sb[1], mean: C.clean(sb[2]), sd: C.clean(sb[3]) },
        after: { n: sa[0], n_eff: sa[1], mean: C.clean(sa[2]), sd: C.clean(sa[3]) },
        welch: test, mannwhitney: mw
      };
    });

    return {
      split: C.dayToISO(anchor),
      n_before: before.length, n_after: after.length,
      rows: rows, weighted: weighted,
      caveats: [
        'Association, not effect: the two sides differ in every way a ' +
        'fortnight can differ, and these events were selected because they ' +
        'were notable.',
        'Posts are not independent -- a single thread can supply many -- so ' +
        'the p-values are optimistic.',
        weighted
          ? "Intervals use Kish's effective sample size, not the post count, " +
            'because reaction weighting is on.'
          : 'Unweighted: every post counts once.',
        'The rank test is unweighted; there is no honest weighted form of it.'
      ]
    };
  }

  return { horizon: horizon, analyse: analyse, atDate: atDate,
           wstats: wstats, welch: welch, mannwhitney: mannwhitney,
           tSF: tSF, tPPF975: tPPF975, normSF: normSF };
})();
