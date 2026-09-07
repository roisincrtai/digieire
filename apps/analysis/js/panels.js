/* GENERATED COPY -- do not edit.
   Source: apps/analysis/js/panels.js
   Rebuild: python tools/homepage/build_homepage_app.py
   The static homepage build shares every view module with the server app;
   the only file that differs is the data layer (api-static.js). */
/* Builds the panel stacks once from /api/config, then re-renders the SVGs
   whenever a new /api/series payload (or a view toggle) arrives.

   TWO stacks share this module, because two frames plot the same series:

     Overall    wellbeing index, the three constructs, the climate reference
     Fit Model  wellbeing index, the Fit subplot under it, the climate reference

   The wellbeing panel is built TWICE, once per frame, rather than moved between
   them. Two reasons. A DOM node cannot be in two places, so "moving" it would
   mean re-parenting on every tab switch and re-registering the linked hover
   each time. And the Fit frame genuinely needs its own copy: the Fit subplot is
   pinned to the wellbeing panel's resolved y domain, and that pinning only
   works if the panel it copies is rendered in the same pass, immediately above
   it. Each frame therefore owns a complete, self-sufficient stack. */
var PANELS = (function () {

  /* Wellbeing trace colours when "two colors" is on: above the mean reads as
     better wellbeing (teal), below as worse (amber-red). */
  var WB_ABOVE = '#16a085';
  var WB_BELOW = '#d35400';
  /* Model fits are NOT overlaid here. They live in the separate "Fit" panel
     on the Fit Model frame, so the wellbeing panel stays the measurement. */

  /* Lazily created container under the Fit chart, holding one report block per
     model. Created on first use so the panel builder needs no special case. */
  function fitReportHost(panel) {
    var host = panel.el.querySelector('.fit-reports');
    if (!host) {
      host = document.createElement('div');
      host.className = 'fit-reports';
      panel.el.appendChild(host);
    }
    return host;
  }


  /* Container for the rolling-origin table, below the fit reports. */
  function evalReportHost(panel) {
    var host = panel.el.querySelector('.eval-reports');
    if (!host) {
      host = document.createElement('div');
      host.className = 'eval-reports';
      panel.el.appendChild(host);
    }
    return host;
  }


  /* The host for one frame's stack, or null when that frame is not in this
     build. The static homepage build ships without the Fit frame, and building
     its panels into a host that does not exist threw during boot -- which the
     view then reported as "config failed", three steps from the cause. */
  function hostFor(tab) { return $('panels-' + tab); }

  function makePanel(tab, id, kind, title, color, isRef) {
    var host = hostFor(tab);
    if (!host) return null;
    var fig = document.createElement('figure');
    fig.className = 'panel' + (isRef ? ' is-reference' : '');
    fig.id = 'panel-' + tab + '-' + id;

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
    CH.register(svg);        // join the linked-hover group
    return { tab: tab, id: id, kind: kind, title: title, color: color,
             el: fig, svg: svg, meta: m };
  }

  function build(cfg) {
    APP.panels.forEach(function (p) { CH.forget(p.svg); });
    ['overall', 'fit'].forEach(function (t) {
      var host = hostFor(t);
      if (host) host.innerHTML = '';
    });
    APP.panels = [];
    /* Only frames this build actually has. `add` drops a panel whose frame is
       absent, so a build without the Fit frame simply has no Fit panels rather
       than failing halfway through the stack. */
    function add(p) { if (p) APP.panels.push(p); }

    // --- Overall: the measurement and its context ---
    add(makePanel('overall', 'wellbeing', 'wellbeing',
                              cfg.wellbeing.label, cfg.wellbeing.color, false));
    (cfg.constructs || []).forEach(function (c) {
      add(makePanel('overall', c.id, 'construct',
                                c.short + ' ' + c.label, c.color, false));
    });
    (cfg.reference || []).forEach(function (r) {
      add(makePanel('overall', r.id, 'reference', r.label,
                                r.color, true));
    });

    /* --- Fit Model: the same index, every fitted model under it, then the
       climate reference. The reference is not decoration here: these models are
       fitted FROM flood and rain, so the drivers have to be readable directly
       under the curve they are supposed to explain. A fit that tracks a spike
       nothing in the reference accounts for is the thing you most want to
       notice, and you cannot notice it on another tab. --- */
    add(makePanel('fit', 'wellbeing', 'wellbeing',
                              cfg.wellbeing.label, cfg.wellbeing.color, false));
    add(makePanel('fit', 'fit', 'fit', 'Fit', '#334155', false));
    (cfg.reference || []).forEach(function (r) {
      add(makePanel('fit', r.id, 'reference', r.label,
                                r.color, true));
    });

    ['overall', 'fit'].forEach(function (t) {
      var host = hostFor(t);
      if (!host) return;
      var em = document.createElement('div');
      em.className = 'empty';
      em.id = 'empty-' + t;
      em.hidden = true;
      em.textContent = 'No discourses match the current filters.';
      host.appendChild(em);
    });
  }

  /* Pull one panel's plotting spec out of the series payload.

     `ctl` is the panel's OWN frame's controls. It is passed in rather than
     looked up, because Overall and Fit Model draw the same kinds of panel from
     independent settings -- reading a module-level singleton here is precisely
     the bug the per-frame configuration exists to remove. */
  function specFor(p, s, ctl) {
    var band = ctl.showBand();
    if (p.kind === 'wellbeing') {
      var w = s.wellbeing || {};
      var vals = (w.mean || []).filter(function (v) {
        return v !== null && v !== undefined && isFinite(v);
      });
      var avg = vals.length
        ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length
        : NaN;
      var ser = { mean: w.mean || [], lo: w.lo, hi: w.hi,
                  color: p.color, fill: band, label: 'index' };
      var spec = { x: w.x || [], yLabel: p.title, series: [ser] };
      if (ctl.showMean() && isFinite(avg)) {
        spec.meanLine = { value: avg, label: 'mean ' + avg.toFixed(3),
                          color: '#64748b' };
        // two colours only make sense against a mean, so they are paired
        if (ctl.twoColors()) {
          ser.split = { at: avg, above: WB_ABOVE, below: WB_BELOW };
        }
      }
      return spec;
    }
    /* The Fit panel is fed by the FIT module, not by /api/series: it shows the
       result of the last completed fit JOB, which the user triggers explicitly. */
    if (p.kind === 'fit') {
      return FIT.spec(s);
    }
    if (p.kind === 'construct') {
      var c = (s.constructs || {})[p.id];
      if (!c) return null;
      var d = c[ctl.scale()] || c.raw;
      return { x: (ctl.scale() === 'znorm' ? s.x_z : s.x) || s.x || [],
               yLabel: p.title,
               series: [{ mean: d.mean, lo: d.lo, hi: d.hi, color: p.color,
                          fill: band, label: 'mean' }] };
    }
    var r = s.reference || {};
    var spec = { x: r.x || [], yLabel: p.title,
                 series: [{ mean: r[p.id] || [], color: p.color, fill: false,
                            label: p.id }] };
    if (p.id === 'rain' && r.lta !== null && r.lta !== undefined) {
      spec.hline = { value: r.lta,
                     label: '1991-2020 LTA (' + Math.round(r.lta) + ' mm)' };
    }
    if (p.id === 'floods' || p.id === 'storms') spec.integerY = true;
    return spec;
  }

  /* One x domain for the WHOLE stack (union of every panel's dates). */
  function domainOf(s) {
    var all = [].concat(s.x || [], s.x_z || [], (s.wellbeing || {}).x || [],
                        (s.reference || {}).x || []).filter(Boolean).sort();
    return all.length ? [all[0], all[all.length - 1]] : null;
  }

  /* Draw ONE frame from ITS OWN payload and ITS OWN controls.

     Called as render(tab, series). Only the frame on screen is drawn: the other
     stack keeps its last SVGs and is redrawn the moment it is shown, so nothing
     is lost by skipping it. */
  function render(tab, s) {
    if (!tab || (tab !== 'overall' && tab !== 'fit')) return;
    if (!s) return;
    if (VIEWS.current() !== tab) return;
    var ctl = CTL.of(tab);
    if (!ctl) return;
    APP.series[tab] = s;

    var empty = !s.meta || s.meta.empty || !(s.x || []).length;
    var em = $('empty-' + tab);
    if (em) em.hidden = !empty;
    var dom = domainOf(s);
    var withConstructs = ctl.showConstructs();
    // Card badges and the folded box's summary must stay current even when the
    // Fit panel is hidden -- otherwise the collapsed box says nothing.
    if (tab === 'fit') FIT.paintCards();
    /* The Fit panel must share the wellbeing panel's y scale, so wellbeing is
       drawn first and its resolved domain is handed to the Fit panel. Panel
       order already puts wellbeing before fit, so one pass is enough. */
    var wbYDomain = null;
    APP.panels.forEach(function (p) {
      if (p.tab !== tab) return;
      // per-construct panels can be switched off, leaving the wellbeing index
      // and the climate reference
      if (p.kind === 'construct' && !withConstructs) { p.el.hidden = true; return; }
      // "Show result" alone decides whether the Fit subplot exists. Ticking it
      // with no fit yet shows an EMPTY plot under wellbeing, which is what the
      // checkbox promises.
      if (p.kind === 'fit' && !FIT.showResult()) { p.el.hidden = true; return; }
      p.el.hidden = empty;
      if (empty) return;
      var spec = specFor(p, s, ctl);
      if (!spec) { p.el.hidden = true; return; }
      spec.domain = dom;
      // Pin the Fit panel to the wellbeing panel's vertical scale.
      if (p.kind === 'fit' && wbYDomain) spec.yDomain = wbYDomain;
      var pts = (spec.x || []).length;
      var extra = '';
      if (p.kind === 'fit') {
        var hasRef = spec.series.some(function (sr) {
          return sr.label === 'reference (observed)';
        });
        var nm = spec.series.length - (hasRef ? 1 : 0);
        extra = nm
          ? ('  ·  ' + nm + ' model' + (nm === 1 ? '' : 's') +
             (hasRef ? '  ·  + reference' : '') +
             (spec.nStale ? '  ·  ' + spec.nStale + ' stale' : ''))
          : '  ·  no fit yet — press Fit on a model' +
            (hasRef ? '  ·  reference only' : '');
        FIT.report(fitReportHost(p));
        if (FIT.hasEval()) FIT.evalReport(evalReportHost(p));
      } else if (p.kind === 'construct') {
        extra = '  ·  ' + ctl.scale();
      } else if (p.kind === 'wellbeing') {
        // the mean and the sensitivity that produced it, so a change is visible
        if (spec.meanLine) extra += '  ·  mean ' + spec.meanLine.value.toFixed(3);
        if (s.meta && s.meta.sensitivity !== undefined) {
          extra += '  ·  sensitivity ' + s.meta.sensitivity;
        }
      }
      p.meta.textContent = pts + ' pts' + extra;
      CH.draw(p.svg, spec);
      p._spec = spec;              // kept for tests + the resize redraw
      if (p.kind === 'wellbeing') wbYDomain = spec.yDomainUsed || null;
    });
  }

  return { build: build, render: render };
})();
