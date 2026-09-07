/* The maths, in the browser: what series.py, stats.py and events.py do server-side.

   The homepage has no server, so the binning, standardisation, windowing and the
   before/after test all have to happen here. This file is a PORT, not a
   reimplementation: every function below mirrors a named Python function, and
   the pair is checked numerically by tools/verify_homepage_parity.py, which runs
   the same settings through both and compares every number. When the two
   disagree, the Python is right and this file is wrong.

   Four details are easy to get subtly wrong and are called out where they occur,
   because each one silently changes published numbers rather than throwing:

   * THE DATE FILTERS ARE NOT THE SAME in the three entry points. `build_series`
     filters on a TIMESTAMP with `<= end`, and since no post in this corpus sits
     at midnight that excludes the end day entirely. `stats.build` and
     `events.analyse` filter on a DATE STRING with `<= end`, which includes it.
     That is the server's behaviour and it is reproduced exactly, difference and
     all -- a tidier rule here would mean the homepage and the paper disagreed.

   * STANDARDISATION IS OVER THE LOCATION-FILTERED SET, BEFORE the date filter,
     for the series view. Narrowing the dates must not re-centre the index, or a
     corpus-wide dip inside the window would centre itself away to nothing. In
     the Statistics view the server standardises over the WHOLE selection,
     including its date filter, and that difference is likewise reproduced.

   * skip_zero IS TRUE FOR THE RAW CONSTRUCT PANELS and false everywhere else. A
     raw panel averages only posts that scored above zero; the z-normalised one
     averages all of them. Applying skip_zero to a z-score would drop every
     below-average post, which is not a filter anyone intended.

   * BIN ORIGIN IS THE FIRST SURVIVING POST, not the calendar. pandas' Grouper
     starts `7D` bins at the day-floor of the earliest timestamp *after*
     filtering, and steps from there; month and year periods start at the
     month/year containing it. Anchoring to the calendar instead shifts every
     point by up to a period.

   Days are integer indices from the manifest epoch throughout -- comparing ints
   rather than parsing dates in the inner loop is what keeps a 90k-post rebin
   inside a frame. */
var COMPUTE = (function () {

  var MS_DAY = 86400000;
  var EPOCH_MS = Date.UTC(2000, 0, 1);      // overridden from the manifest

  function setEpoch(iso) {
    var p = String(iso).split('-');
    EPOCH_MS = Date.UTC(+p[0], +p[1] - 1, +p[2]);
  }

  function dayToMs(d) { return EPOCH_MS + d * MS_DAY; }
  function dayToISO(d) { return new Date(dayToMs(d)).toISOString().slice(0, 10); }
  function isoToDay(s) {
    if (!s) return null;
    var t = String(s).trim().replace(/\//g, '-');
    if (/^\d{8}$/.test(t)) t = t.slice(0, 4) + '-' + t.slice(4, 6) + '-' + t.slice(6);
    var p = t.slice(0, 10).split('-');
    if (p.length !== 3) return null;
    var ms = Date.UTC(+p[0], +p[1] - 1, +p[2]);
    return isFinite(ms) ? Math.round((ms - EPOCH_MS) / MS_DAY) : null;
  }

  // ---------------------------------------------------------------------
  // period / window  (analysis_helpers.parse_period_freq, parse_window)
  // ---------------------------------------------------------------------
  function parsePeriod(period) {
    var m = String(period || '1y').toLowerCase().trim().match(/^(\d*)\s*([ymd])$/);
    if (!m) throw new Error("period must be Ny/Nm/Nd, got '" + period + "'");
    var n = m[1] ? parseInt(m[1], 10) : 1;
    if (n < 1) throw new Error('period N must be >= 1');
    var unit = m[2];
    var base = { y: 'year', m: 'month', d: 'day' }[unit];
    var days = { y: 365.2425, m: 30.436875, d: 1.0 }[unit] * n;
    return { unit: unit, n: n, raw: n + unit, days: days,
             label: n === 1 ? base : (n + ' ' + base + 's') };
  }

  function parseWindow(period, window, mode) {
    var spec = parsePeriod(period);
    mode = (mode || 'double').toLowerCase().trim();
    if (mode !== 'single' && mode !== 'double') {
      throw new Error("mode must be single|double, got '" + mode + "'");
    }
    var w = String(window === null || window === undefined ? '0' : window)
              .toLowerCase().trim();
    if (w === '' || w === '0' || w === '0d' || w === '0m' || w === '0y' ||
        w === 'none') {
      return { spec: spec, windowed: false, mode: mode, windowRaw: '0',
               windowDays: spec.days, back: 0, fwd: null };  // fwd: one period
    }
    var ws = parsePeriod(w);
    if (ws.days < spec.days - 1e-9) {
      throw new Error('window (' + w + ') must be >= period (' + spec.raw + ')');
    }
    return { spec: spec, windowed: true, mode: mode, windowRaw: ws.raw,
             windowDays: ws.days, back: ws.days,
             fwd: mode === 'double' ? ws.days : 0 };
  }

  /* Bin starts as DAY INDICES, matching pandas' Grouper.

     Day periods step by `n` days from the day-floor of the first surviving post.
     Month and year periods step calendar-wise from the month/year containing it,
     which is why they are built through Date.UTC rather than by adding days --
     "one month later" is not a fixed number of days and treating it as one
     drifts by three days a year. */
  function binStarts(firstDay, lastDay, spec) {
    var out = [];
    if (spec.unit === 'd') {
      for (var d = firstDay; d <= lastDay; d += spec.n) out.push(d);
      return out;
    }
    var f = new Date(dayToMs(firstDay));
    var y = f.getUTCFullYear(), mo = f.getUTCMonth();
    if (spec.unit === 'y') mo = 0;
    var lastMs = dayToMs(lastDay);
    for (;;) {
      var ms = Date.UTC(y, mo, 1);
      if (ms > lastMs) break;
      out.push(Math.round((ms - EPOCH_MS) / MS_DAY));
      if (spec.unit === 'y') y += spec.n;
      else { mo += spec.n; y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12; }
    }
    return out;
  }

  /* The half-open day range [lo, hi) a bin covers. */
  function binRange(start, win) {
    if (win.windowed) {
      return [start - win.back, start + win.fwd];
    }
    var spec = win.spec;
    if (spec.unit === 'd') return [start, start + spec.n];
    var d = new Date(dayToMs(start));
    var y = d.getUTCFullYear(), mo = d.getUTCMonth();
    if (spec.unit === 'y') {
      return [start, Math.round((Date.UTC(y + spec.n, mo, 1) - EPOCH_MS) / MS_DAY)];
    }
    var m2 = mo + spec.n;
    var y2 = y + Math.floor(m2 / 12);
    m2 = ((m2 % 12) + 12) % 12;
    return [start, Math.round((Date.UTC(y2, m2, 1) - EPOCH_MS) / MS_DAY)];
  }

  /* First index with day >= target, over a sorted day array (np.searchsorted).

     The window edges are FRACTIONAL days for month and year windows -- 30.436875
     days back, say -- so the comparison is against a real number and the day
     array is integer. `d >= target` with a fractional target is the same
     half-open selection the server makes against a Timedelta. */
  function lowerBound(days, idx, target) {
    var lo = 0, hi = idx.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (days[idx[mid]] < target) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  // ---------------------------------------------------------------------
  // weighted statistics  (period_stats_constructs' inner reduction)
  // ---------------------------------------------------------------------
  /* mean and POPULATION variance over a slice, with optional frequency weights
     and the skip_zero rule. Mirrors the numpy block exactly, including
     `var = NaN when n <= 1`, which is what leaves a single-post bin without a
     band rather than with a band of zero. */
  function reduce(values, weights, idx, a, b, skipZero, useW) {
    var n = 0, sw = 0, sum = 0;
    var i, v, w;
    for (i = a; i < b; i++) {
      v = values[idx[i]];
      if (!isFinite(v)) continue;
      if (skipZero && !(v > 0)) continue;
      w = useW ? weights[idx[i]] : 1;
      if (useW) { if (!(w > 0)) { continue; } } // n counts w > 0, as the server does
      n++; sw += w; sum += w * v;
    }
    if (!n || sw <= 0) return { n: n, mean: NaN, var: NaN };
    var mean = sum / sw, acc = 0;
    for (i = a; i < b; i++) {
      v = values[idx[i]];
      if (!isFinite(v)) continue;
      if (skipZero && !(v > 0)) continue;
      w = useW ? weights[idx[i]] : 1;
      if (useW && !(w > 0)) continue;
      acc += w * (v - mean) * (v - mean);
    }
    return { n: n, mean: mean, var: n > 1 ? acc / sw : NaN };
  }

  function clean(v) { return (v === null || !isFinite(v)) ? null : v; }

  // ---------------------------------------------------------------------
  // z-normalisation and the index  (_znorm, the sigmoid)
  // ---------------------------------------------------------------------
  /* Population SD (ddof=0), as _znorm uses. A zero SD becomes 1 so a constant
     construct maps to zeros rather than to NaN. */
  function znormOver(values, idx) {
    var n = idx.length, i, s = 0;
    for (i = 0; i < n; i++) s += values[idx[i]];
    var mu = n ? s / n : 0, acc = 0;
    for (i = 0; i < n; i++) { var d = values[idx[i]] - mu; acc += d * d; }
    var sd = n ? Math.sqrt(acc / n) : 0;
    return { mu: mu, sd: sd > 0 ? sd : 1.0 };
  }

  /* index = sigmoid(-sensitivity * sum of z) -- HIGHER IS BETTER, because the
     three constructs are all negative-pole. Written as 1/(1+exp(+s*z)) exactly
     as the server does, so the two round identically. */
  function wellbeingOf(zsum, sensitivity) {
    return 1.0 / (1.0 + Math.exp(sensitivity * zsum));
  }

  // ---------------------------------------------------------------------
  // the climate reference  (get_reference + rebin_reference)
  // ---------------------------------------------------------------------
  /* Rebin the shipped MONTHLY reference to the requested period.

     Day periods keep the monthly resolution -- there is no daily climate
     reference and inventing one by interpolation would invent floods. Month
     periods take the MEAN rainfall and the SUM of counts; year periods take the
     SUM of rainfall, and NaN if the year is incomplete, because a part-year
     total compared against an annual average reads as a drought that did not
     happen. */
  function rebinReference(monthly, period) {
    var spec = parsePeriod(period);
    var ltaMon = monthly.lta_monthly, ltaAnn = monthly.lta_annual;
    if (ltaAnn === null || ltaAnn === undefined) {
      ltaAnn = (ltaMon === null || ltaMon === undefined) ? null : ltaMon * 12;
    }
    if (spec.unit === 'd') {
      return { x: monthly.x.slice(), rain: monthly.rain.slice(),
               floods: monthly.floods.slice(), storms: monthly.storms.slice(),
               rain_unit: 'monthly', lta: ltaMon,
               lta_monthly: ltaMon, lta_annual: ltaAnn };
    }
    var days = monthly.x.map(isoToDay);
    var starts = binStarts(days[0], days[days.length - 1], spec);
    var x = [], rain = [], floods = [], storms = [];
    for (var b = 0; b < starts.length; b++) {
      var lo = starts[b];
      var hi = (b + 1 < starts.length) ? starts[b + 1]
                                       : binRange(lo, { windowed: false, spec: spec })[1];
      var rs = 0, rn = 0, fs = 0, ss = 0, any = false;
      for (var i = 0; i < days.length; i++) {
        if (days[i] < lo || days[i] >= hi) continue;
        any = true;
        if (monthly.rain[i] !== null && isFinite(monthly.rain[i])) {
          rs += monthly.rain[i]; rn++;
        }
        fs += monthly.floods[i] || 0;
        ss += monthly.storms[i] || 0;
      }
      if (!any) continue;
      var r;
      if (spec.unit === 'y') {
        r = rn ? rs : NaN;
        if (rn < 12 * spec.n) r = NaN;           // incomplete year -> NaN
      } else {
        r = rn ? rs / rn : NaN;
      }
      x.push(dayToISO(lo)); rain.push(clean(r));
      floods.push(fs); storms.push(ss);
    }
    var unit = spec.unit === 'y' ? 'annual' : 'monthly';
    return { x: x, rain: rain, floods: floods, storms: storms,
             rain_unit: unit,
             lta: unit === 'annual'
               ? (ltaAnn === null ? null : ltaAnn * spec.n) : ltaMon,
             lta_monthly: ltaMon,
             lta_annual: ltaAnn === null ? null : ltaAnn * spec.n };
  }

  // ---------------------------------------------------------------------
  // SERIES  (apps/analysis/series.build_series)
  // ---------------------------------------------------------------------
  function band(stats, key) {
    var mean = [], lo = [], hi = [], n = [];
    for (var i = 0; i < stats.length; i++) {
      var r = stats[i][key];
      var sd = Math.sqrt(r.var);
      mean.push(clean(r.mean));
      lo.push(clean(r.mean - sd));
      hi.push(clean(r.mean + sd));
      n.push(r.n);
    }
    return { mean: mean, lo: lo, hi: hi, n: n };
  }

  /* One pass of the binner over a set of columns. `cols` maps an output key to
     the array it reads. Returns one record per non-empty bin. */
  function binAll(D, idx, cols, win, startDay, endDay, skipZero, useW) {
    var keep = idx;
    if (startDay !== null || endDay !== null) {
      keep = [];
      for (var k = 0; k < idx.length; k++) {
        var d = D.day[idx[k]];
        if (startDay !== null && d < startDay) continue;
        // `<= end` on a TIMESTAMP: no post sits at midnight, so the end day
        // itself falls outside. See the header note.
        if (endDay !== null && d >= endDay) continue;
        keep.push(idx[k]);
      }
    }
    if (!keep.length) return [];
    var first = D.day[keep[0]], last = D.day[keep[keep.length - 1]];
    var starts = binStarts(first, last, win.spec);
    var names = Object.keys(cols);
    var out = [];
    for (var b = 0; b < starts.length; b++) {
      var r = binRange(starts[b], win);
      var a = lowerBound(D.day, keep, r[0]);
      var e = lowerBound(D.day, keep, r[1]);
      if (e <= a) continue;
      var rec = { ts: dayToISO(starts[b]), n_posts: e - a };
      for (var c = 0; c < names.length; c++) {
        rec[names[c]] = reduce(cols[names[c]], D.weight, keep, a, e,
                               skipZero, useW);
      }
      out.push(rec);
    }
    return out;
  }

  function buildSeries(D, opts) {
    var period = opts.period, window = opts.window, mode = opts.mode;
    var win = parseWindow(period, window, mode);
    var startDay = isoToDay(opts.start_date), endDay = isoToDay(opts.end_date);
    if (startDay !== null && endDay !== null && startDay > endDay) {
      throw new Error('start_date is after end_date');
    }
    var loc = (opts.location || 'all').toLowerCase();
    var idx = D.indexFor(loc);
    if (!idx.length) {
      return { x: [], constructs: {}, wellbeing: {}, reference: {},
               meta: { n_posts: 0, location: loc, empty: true } };
    }
    var useW = !!opts.weight_reactions;
    var inds = D.indicators;

    /* Standardise over the LOCATION-filtered rows, before any date filter --
       see the header. */
    var zcols = {}, zsum = new Float64Array(D.n);
    for (var i = 0; i < inds.length; i++) {
      var st = znormOver(D.score[i], idx);
      var col = new Float64Array(D.n);
      for (var k = 0; k < idx.length; k++) {
        var j = idx[k];
        col[j] = (D.score[i][j] - st.mu) / st.sd;
        zsum[j] += col[j];
      }
      zcols[inds[i]] = col;
    }
    var wb = new Float64Array(D.n);
    for (var k2 = 0; k2 < idx.length; k2++) {
      wb[idx[k2]] = wellbeingOf(zsum[idx[k2]], opts.sensitivity);
    }

    var rawCols = {}, zNormCols = {};
    inds.forEach(function (id, m) { rawCols[id] = D.score[m]; zNormCols[id] = zcols[id]; });

    // raw panels skip zeros; z-normalised and the index do not
    var statsRaw = binAll(D, idx, rawCols, win, startDay, endDay, true, useW);
    var statsZ = binAll(D, idx, zNormCols, win, startDay, endDay, false, useW);
    var statsW = binAll(D, idx, { wellbeing: wb }, win, startDay, endDay,
                        false, useW);

    var xs = statsRaw.map(function (r) { return r.ts; });
    var xz = statsZ.map(function (r) { return r.ts; });
    var xw = statsW.map(function (r) { return r.ts; });

    // --- climate reference, clipped to the same span ---------------------
    var ref = rebinReference(D.climate, period);
    var loS = opts.start_date ? dayToISO(startDay) : (xs.length ? xs[0] : '0000-00-00');
    var hiS = opts.end_date ? dayToISO(endDay) : (xs.length ? xs[xs.length - 1] : '9999-99-99');
    var rx = [], rrain = [], rfl = [], rst = [];
    for (var q = 0; q < ref.x.length; q++) {
      if (ref.x[q] < loS || ref.x[q] > hiS) continue;
      rx.push(ref.x[q]); rrain.push(ref.rain[q]);
      rfl.push(ref.floods[q]); rst.push(ref.storms[q]);
    }
    var reference = { x: rx, rain: rrain, floods: rfl, storms: rst,
                      lta: ref.lta, rain_unit: ref.rain_unit };

    var constructs = {};
    inds.forEach(function (id) {
      constructs[id] = {
        raw: band(statsRaw, id),
        znorm: band(statsZ, id)
      };
    });

    var interval = !win.windowed
      ? '[t, t+' + win.spec.raw + ')'
      : (win.mode === 'single'
          ? '[t-' + win.windowRaw + ', t)'
          : '[t-' + win.windowRaw + ', t+' + win.windowRaw + ')');

    return {
      x: xs, x_z: xz,
      constructs: constructs,
      wellbeing: Object.assign({ x: xw }, band(statsW, 'wellbeing')),
      reference: reference,
      meta: {
        n_posts: idx.length,
        n_points: statsRaw.length,
        location: loc,
        period: win.spec.raw,
        window: win.windowRaw,
        mode: win.mode,
        windowed: win.windowed,
        interval: interval,
        start_date: startDay === null ? null : dayToISO(startDay),
        end_date: endDay === null ? null : dayToISO(endDay),
        weight_reactions: useW,
        sensitivity: opts.sensitivity
      }
    };
  }

  return {
    setEpoch: setEpoch, dayToISO: dayToISO, isoToDay: isoToDay,
    parsePeriod: parsePeriod, parseWindow: parseWindow,
    binStarts: binStarts, binRange: binRange, reduce: reduce,
    znormOver: znormOver, wellbeingOf: wellbeingOf,
    rebinReference: rebinReference, binAll: binAll, band: band,
    clean: clean, buildSeries: buildSeries
  };
})();
