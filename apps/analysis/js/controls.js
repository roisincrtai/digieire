/* GENERATED COPY -- do not edit.
   Source: apps/analysis/js/controls.js
   Rebuild: python tools/homepage/build_homepage_app.py
   The static homepage build shares every view module with the server app;
   the only file that differs is the data layer (api-static.js). */
/* One independent Analysis Configuration box PER FRAME.

   This module used to be a singleton reading fixed element ids, with a single
   box whose groups were hidden per tab. It is now a factory: `CTL.create` clones
   the `#tpl-controls` template into a frame's host, prefixes every id with the
   frame's own name, and returns an instance that only ever touches its own
   inputs. Four frames therefore hold four independent settings.

   Why independent rather than shared. The frames answer different questions and
   want different settings for them: Statistics is readable at a monthly
   resolution that would flatten the Overall trace to nothing, and the Event
   frame's date range is dictated by whichever storm is selected. With one shared
   box, setting up one frame silently rewrote the others and re-triggered their
   fetches -- including, at its worst, invalidating a fit that had just cost two
   minutes of MCMC. Independence costs a little duplication on screen and removes
   a whole class of surprise.

   Two details the prefixing exists for:

     * `for=` on labels is rewritten too, so clicking a label still focuses the
       right input rather than a namesake on another frame.
     * the radio `name` is rewritten. Two frames sharing name="scale" would form
       ONE radio group, and choosing z-normalised on Overall would clear it on
       Fit Model -- across a hidden tab, with no visible cause.

   Design rules inside a box are unchanged:
     * ONE shared time unit for the resolution and the window, so the two are
       always comparable (the server rejects window < period).
     * Changing the resolution snaps the window DOWN to its minimum, which IS the
       resolution -- a window smaller than the step would leave gaps.
     * Numbers are typed or stepped (no sliders). */
var CTL = (function () {

  var DAY = 86400000;
  var instances = {};          // frame id -> instance

  function unitName(u, n) {
    var name = (APP.cfg && APP.cfg.unit_label && APP.cfg.unit_label[u]) ||
               ({ d: 'days', m: 'months', y: 'years' }[u]);
    return (n === 1) ? name.replace(/s$/, '') : name;
  }

  function unitMax(u) {
    var m = APP.cfg && APP.cfg.unit_max;
    return (m && m[u]) || (u === 'd' ? 3650 : u === 'm' ? 120 : 20);
  }

  /* 'YYYY/MM/DD' (also YYYY-MM-DD / YYYYMMDD) -> ms, or NaN. */
  function parseYMD(s) {
    var m = String(s || '').trim().match(/^(\d{4})\D?(\d{1,2})\D?(\d{1,2})$/);
    if (!m) return NaN;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return NaN;
    var ms = Date.UTC(y, mo - 1, d);
    var back = new Date(ms);
    if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return NaN;
    return ms;
  }

  function fmtYMD(ms) {
    var d = new Date(ms);
    function p2(n) { return (n < 10 ? '0' : '') + n; }
    return d.getUTCFullYear() + '/' + p2(d.getUTCMonth() + 1) + '/' +
           p2(d.getUTCDate());
  }

  /* Clone the template into `host`, prefixing every id / for / name with the
     frame's own key and GREYING OUT whatever does not apply to it.

     Greyed and present, not removed. A box that changes shape from tab to tab
     leaves the reader wondering whether a setting still exists somewhere;
     showing it disabled answers that -- it exists, it does not apply here. The
     inputs are genuinely `disabled`, so they cannot be typed into, cannot be
     tabbed to and cannot fire a change event, and the readers below fall back
     to the configured default rather than reading a greyed field. */
  function mount(host, tab, groups, off) {
    var tpl = $('tpl-controls');
    var frag = tpl.content.cloneNode(true);
    var pre = tab + '__';

    var marked = frag.querySelectorAll('[data-group]');
    each(marked, function (node) {
      var g = node.getAttribute('data-group');
      if (groups.indexOf(g) === -1) disableSubtree(node);
    });
    // Individual controls disabled inside an otherwise live group.
    (off || []).forEach(function (name) {
      var el = frag.querySelector('#' + name);
      if (el) disableControl(el);
    });
    each(frag.querySelectorAll('[id]'), function (el) { el.id = pre + el.id; });
    each(frag.querySelectorAll('[for]'), function (el) {
      el.setAttribute('for', pre + el.getAttribute('for'));
    });
    each(frag.querySelectorAll('input[name]'), function (el) {
      el.name = pre + el.name;
    });
    host.innerHTML = '';
    host.appendChild(frag);
  }

  function each(list, fn) {
    for (var i = 0; i < list.length; i++) fn(list[i]);
  }

  /* Grey a whole group: every field in it, and the group itself for the label
     and note text that would otherwise still read as live. */
  function disableSubtree(node) {
    node.classList.add('is-off');
    each(node.querySelectorAll('input, select, button, output'), function (el) {
      el.disabled = true;
    });
  }

  /* Grey ONE control, and the label wrapping it so its text greys too. */
  function disableControl(el) {
    el.disabled = true;
    var lab = el.closest ? el.closest('label') : null;
    (lab || el).classList.add('is-off');
  }

  /* ---------------------------------------------------------------------
     One frame's controls. Every lookup goes through `el`, so an instance can
     only ever see its own inputs. `el` returns null for a group this frame
     dropped, and every reader below copes with that by falling back to the
     configured default -- which is what "this frame does not expose that
     setting" should mean to the server.
     ------------------------------------------------------------------ */
  function create(tab, cfg, groups, opts) {
    opts = opts || {};
    var host = $('config-' + tab);
    if (!host) return null;
    groups = groups || [];
    var off = opts.disabled || [];
    mount(host, tab, groups, off);

    var pre = tab + '__';
    var onChange = null;
    var self = {};

    /* A DISABLED control reads as absent. It is on screen so the reader can see
       the setting exists, but it does not apply to this frame, so letting its
       greyed value into a query would be worse than not showing it at all. */
    function el(name) {
      var e = document.getElementById(pre + name);
      return (e && e.disabled) ? null : e;
    }
    function raw(name) { return document.getElementById(pre + name); }
    function has(g) { return groups.indexOf(g) !== -1; }

    function val(name, fallback) {
      var e = el(name);
      return e ? e.value : fallback;
    }
    function checked(name, fallback) {
      var e = el(name);
      return e ? e.checked : fallback;
    }
    function num(name, fallback) {
      var e = el(name);
      if (!e) return fallback;
      var v = parseInt(e.value, 10);
      return (isNaN(v) || v < 1) ? fallback : v;
    }

    var D = cfg.defaults || {};
    function period() { return num('period_n', D.period_n || 1); }
    function windowN() { return num('window_n', period()); }
    function unit() { return val('unit', D.period_unit || 'd'); }

    /* Re-cap both fields for the current unit and enforce window >= period. */
    function clamp() {
      var u = unit(), mx = unitMax(u), p = Math.min(period(), mx);
      if (el('period_n')) { el('period_n').max = mx; el('period_n').value = p; }
      var w = p;
      if (el('window_n')) {
        el('window_n').max = mx;
        el('window_n').min = p;                 // the window's floor is the period
        w = Math.min(Math.max(windowN(), p), mx);
        el('window_n').value = w;
      }
      return { p: p, w: w, u: u };
    }

    /* Unit tags, the sensitivity read-out and the window interval hint. */
    function refresh() {
      var c = clamp();
      if (raw('period_unit_tag')) {
        raw('period_unit_tag').textContent = unitName(c.u, c.p);
      }
      if (raw('window_unit_tag')) {
        raw('window_unit_tag').textContent = unitName(c.u, c.w);
      }
      if (raw('sensitivity_out')) {
        raw('sensitivity_out').textContent = sensitivity().toFixed(1);
      }
      if (raw('window_hint')) {
        var tag = c.w + c.u, mode = val('mode', 'double');
        raw('window_hint').textContent = (c.w === c.p)
          ? '[t, t + ' + c.p + c.u + ')'
          : (mode === 'single' ? '[t − ' + tag + ', t)'
                               : '[t − ' + tag + ', t + ' + tag + ')');
        raw('window_n').classList.remove('bad');
      }
      return true;
    }

    // ---- dates ---------------------------------------------------------
    function dmin() { return Date.parse((cfg.date_min || '1970-01-01')); }
    function dmax() { return Date.parse((cfg.date_max || '1970-01-01')); }
    function spanDays() { return Math.max(1, Math.round((dmax() - dmin()) / DAY)); }
    function clampMs(ms) { return Math.min(Math.max(ms, dmin()), dmax()); }
    function toSlider(ms) { return Math.round((clampMs(ms) - dmin()) / DAY); }
    function fromSlider(v) { return dmin() + (+v) * DAY; }

    /* Current [startMs, endMs], guaranteeing end > start. */
    function dates() {
      if (!has('dates')) return [dmin(), dmax()];
      var a = parseYMD(val('start_date', '')), b = parseYMD(val('end_date', ''));
      if (isNaN(a)) a = dmin();
      if (isNaN(b)) b = dmax();
      a = clampMs(a); b = clampMs(b);
      if (b <= a) b = Math.min(dmax(), a + DAY);   // end must stay after start
      return [a, b];
    }

    /* Push [a,b] into BOTH the text fields and the two slider handles. */
    function setDates(a, b, o) {
      o = o || {};
      // `force` paints the greyed date group once at init so it is not blank.
      if (!has('dates') && !o.force) return;
      a = clampMs(a); b = clampMs(b);
      if (b <= a) {
        if (o.moved === 'start') a = Math.max(dmin(), Math.min(a, b - DAY));
        else b = Math.min(dmax(), a + DAY);
        if (b <= a) b = Math.min(dmax(), a + DAY);
      }
      if (!o.keepText) {
        raw('start_date').value = fmtYMD(a);
        raw('end_date').value = fmtYMD(b);
      }
      raw('start_slider').value = toSlider(a);
      raw('end_slider').value = toSlider(b);
      paintRange(a, b);
      markValid();
    }

    function paintRange(a, b) {
      var s = spanDays();
      var l = 100 * toSlider(a) / s, r = 100 * toSlider(b) / s;
      var fill = raw('range2_fill');
      if (!fill) return;
      fill.style.left = l + '%';
      fill.style.width = Math.max(0, r - l) + '%';
    }

    function markValid() {
      ['start_date', 'end_date'].forEach(function (id) {
        var e = raw(id);
        if (!e) return;
        // NB: not named `raw` -- that is the element accessor above, and a
        // `var` of the same name hoists over it and breaks this whole function.
        var typed = e.value.trim();
        e.classList.toggle('bad', typed !== '' && isNaN(parseYMD(typed)));
      });
    }

    function fullRange(force) { setDates(dmin(), dmax(), { force: force }); }

    // ---- readers -------------------------------------------------------
    function sensitivity() {
      var e = el('sensitivity');
      var v = e ? parseFloat(e.value) : NaN;
      return isFinite(v) && v > 0 ? v : (D.sensitivity || 5);
    }
    function scale() {
      var e = el('scale_znorm');
      return e ? (e.checked ? 'znorm' : 'raw') : (D.scale || 'znorm');
    }
    function location() { return val('location', D.location || 'all'); }
    function weight() { return checked('weight', !!D.weight_reactions); }
    function mode() { return val('mode', D.mode || 'double'); }
    function showBand() { return checked('show_band', true); }
    /* When off, the three construct panels are hidden and only the wellbeing
       index (plus the climate reference) is shown. */
    function showConstructs() { return checked('show_constructs', true); }
    /* Wellbeing panel extras: a horizontal mean line, and colouring the trace by
       whether it sits above or below that mean. */
    function showMean() { return checked('show_mean', true); }
    function twoColors() { return checked('two_colors', true); }

    /* The /api/series query string for THIS frame's controls. */
    function query() {
      var c = clamp();
      var p = new URLSearchParams({
        period_n: c.p,
        period_unit: c.u,
        window_n: c.w,
        window_unit: c.u,           // shared unit
        mode: mode(),
        location: location(),
        sensitivity: sensitivity(),
        weight: weight() ? '1' : '0'
      });
      var d = dates();
      p.set('start_date', fmtYMD(d[0]).replace(/\//g, ''));   // -> YYYYMMDD
      p.set('end_date', fmtYMD(d[1]).replace(/\//g, ''));
      return p.toString();
    }

    // ---- initial values -------------------------------------------------
    function init() {
      /* DISPLAY uses raw(), not el(). A greyed control still shows the value it
         would have had -- an empty greyed box looks broken, and the point of
         showing it at all is to say "this setting exists, it just does not apply
         here". Only the READERS treat a disabled control as absent. */
      var sel = raw('location');
      if (sel) {
        sel.innerHTML = '';
        (cfg.locations || ['all']).forEach(function (loc) {
          var o = document.createElement('option');
          o.value = loc; o.textContent = loc;
          sel.appendChild(o);
        });
        sel.value = D.location;
      }
      if (raw('start_slider')) {
        var s = spanDays();
        raw('start_slider').max = s;
        raw('end_slider').max = s;
        fullRange(true);
      }
      if (raw('unit')) raw('unit').value = opts.period_unit || D.period_unit;
      if (raw('period_n')) raw('period_n').value = opts.period_n || D.period_n;
      if (raw('window_n')) {
        // the window starts at its configured default, clamped to >= resolution
        raw('window_n').value = Math.max(D.window_n || D.period_n, D.period_n);
      }
      if (raw('mode')) raw('mode').value = D.mode;
      if (raw('weight')) raw('weight').checked = !!D.weight_reactions;
      if (raw('sensitivity')) raw('sensitivity').value = D.sensitivity;
      if (raw('scale_znorm')) {                 // constructs default to z-normed
        var wantZ = (D.scale || 'znorm') === 'znorm';
        raw('scale_znorm').checked = wantZ;
        raw('scale_raw').checked = !wantZ;
      }
      var scope = host.querySelector('[data-c="scope"]');
      if (scope) scope.textContent = opts.hint || '';
      refresh();
    }

    /* Wire every control this frame actually has. `onFetch` re-queries the
       server; `onView` only re-draws what is already held. */
    function bind(onFetch, onView) {
      onChange = onFetch;
      function handler() { if (refresh()) onFetch(); }
      function on(id, ev, fn) {
        var e = el(id);
        if (e) e.addEventListener(ev, fn);
      }

      // Changing the RESOLUTION resets the window to its minimum (= resolution).
      on('period_n', 'input', function () {
        if (el('window_n')) el('window_n').value = Math.max(1, period());
        handler();
      });
      // Changing the UNIT keeps the numbers but re-snaps the window floor.
      on('unit', 'change', function () {
        if (el('window_n')) el('window_n').value = Math.max(period(), windowN());
        handler();
      });
      on('window_n', 'input', handler);
      on('sensitivity', 'input', handler);

      // dragging either handle: keep end > start, mirror into the text fields
      on('start_slider', 'input', function () {
        var a = fromSlider(el('start_slider').value), b = dates()[1];
        if (a >= b) b = Math.min(dmax(), a + DAY);
        setDates(a, b, { moved: 'end' });
        handler();
      });
      on('end_slider', 'input', function () {
        var b = fromSlider(el('end_slider').value), a = dates()[0];
        if (b <= a) b = Math.min(dmax(), a + DAY);
        setDates(a, b, { moved: 'end' });
        handler();
      });
      // typing: only act on a COMPLETE valid date, so partial input is not fought
      ['start_date', 'end_date'].forEach(function (id) {
        on(id, 'input', function () {
          markValid();
          if (isNaN(parseYMD(el(id).value))) return;
          var d = dates();
          setDates(d[0], d[1], { keepText: true,
                                 moved: id === 'start_date' ? 'end' : 'start' });
          handler();
        });
        // on blur, normalise whatever is there back to YYYY/MM/DD
        on(id, 'change', function () {
          var d = dates();
          setDates(d[0], d[1]);
          handler();
        });
      });
      ['mode', 'location', 'weight'].forEach(function (id) {
        on(id, 'change', handler);
      });
      // view-only toggles: re-render from the data already held, no refetch
      ['scale_raw', 'scale_znorm', 'show_band', 'show_constructs',
       'show_mean', 'two_colors'].forEach(function (id) {
        on(id, 'change', function () { if (onView) onView(); });
      });
      on('btn-range-reset', 'click', function () { fullRange(); handler(); });
    }

    self.tab = tab;
    self.init = init;
    self.bind = bind;
    self.query = query;
    self.refresh = refresh;
    self.has = has;
    self.dates = dates;
    self.setDates = setDates;
    self.fullRange = fullRange;
    self.scale = scale;
    self.mode = mode;
    self.location = location;
    self.weight = weight;
    self.sensitivity = sensitivity;
    self.period = period;
    self.unit = unit;
    self.showBand = showBand;
    self.showConstructs = showConstructs;
    self.showMean = showMean;
    self.twoColors = twoColors;

    instances[tab] = self;
    return self;
  }

  /* The instance for one frame. Never falls back to another frame's box: a
     silent cross-frame read is exactly what this module exists to prevent. */
  function of(tab) { return instances[tab] || null; }

  return { create: create, of: of, parseYMD: parseYMD, fmtYMD: fmtYMD };
})();
