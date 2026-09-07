/* GENERATED COPY -- do not edit.
   Source: apps/analysis/js/views.js
   Rebuild: python tools/homepage/build_homepage_app.py
   The static homepage build shares every view module with the server app;
   the only file that differs is the data layer (api-static.js). */
/* The four frames: Overall | Fit Model | Event Analysis | Statistics.

   The tab bar is built from /api/config's `tabs`, so a frame is declared once
   in apps/analysis/config.py and appears here without a JS change.

   Three rules make the tabs work:

   * Every frame is SELF-CONTAINED. It owns its configuration box (its own
     dates, resolution, location, view toggles) and its own panel stack. Nothing
     crosses between frames: narrowing the date range on Statistics leaves
     Overall exactly as it was. Frames answer different questions and want
     different settings for them, and with a shared box, configuring one frame
     silently reconfigured the others -- at worst invalidating a fit that had
     just cost two minutes of MCMC.

   * Nothing is torn down. Each frame's DOM lives in the document at all times
     and is only shown or hidden, so a completed fit is still on screen after a
     trip to Statistics and back, and the linked-hover registration survives
     with it.

   * A frame fetches only when it is shown and its OWN data is stale. Because
     the configurations are separate, a control change marks only its own frame
     stale -- the others were never described by it. Nothing spends time
     computing a panel nobody is reading. */
var VIEWS = (function () {

  var active = 'overall';
  var stale = {};                 // tab id -> needs a fetch before it is shown

  function tabs() { return (APP.cfg && APP.cfg.tabs) || []; }
  function def(id) {
    var t = tabs();
    for (var i = 0; i < t.length; i++) if (t[i].id === id) return t[i];
    return null;
  }

  /* Build the tab bar and give every frame its own controls instance. */
  function build(cfg) {
    var nav = $('tabs');
    if (!nav) return;
    nav.innerHTML = '';
    (cfg.tabs || []).forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab';
      b.id = 'tab-' + t.id;
      b.textContent = t.label;
      b.title = t.hint || '';
      b.setAttribute('role', 'tab');
      b.addEventListener('click', function () { show(t.id); });
      nav.appendChild(b);

      var opts = { hint: t.hint, disabled: t.disabled || [] };
      Object.keys(t.defaults || {}).forEach(function (k) {
        opts[k] = t.defaults[k];
      });
      var ctl = CTL.create(t.id, cfg, t.controls || [], opts);
      if (!ctl) return;
      ctl.init();
      /* Each frame's controls drive that frame and nothing else. `onFetch`
         re-queries the server for this frame; `onView` only redraws what it
         already holds. */
      ctl.bind(
        (function (id) {
          return function () { markStale(id); refresh(); };
        })(t.id),
        (function (id) {
          return function () { redraw(id); };
        })(t.id));
      stale[t.id] = true;         // nothing has been fetched yet
    });
  }

  function show(id) {
    if (!def(id)) id = 'overall';
    active = id;
    tabs().forEach(function (d) {
      var btn = $('tab-' + d.id);
      if (btn) btn.classList.toggle('on', d.id === id);
      var frame = $('frame-' + d.id);
      if (frame) frame.hidden = (d.id !== id);
    });
    // "Save as PDF" prints the visible frame, so the filename should say which.
    document.body.setAttribute('data-tab', id);
    refresh();
  }

  /* Mark ONE frame as needing a refetch (default: the active one). A frame's
     own controls describe only its own panels, so a change on Statistics has no
     bearing on what Overall is showing. */
  function markStale(id) {
    id = id || active;
    stale[id] = true;
    // A stored fit was estimated on the OLD binning of its own frame, so it no
    // longer describes what that frame is about to draw.
    if (id === 'fit' && window.FIT) FIT.markStale();
  }

  /* Redraw a frame from data it already holds -- a view toggle, or a resize. */
  function redraw(id) {
    id = id || active;
    if (id === 'event') EVENT.render();
    else if (id === 'stats') STATS.render();
    else PANELS.render(id, APP.series[id]);
  }

  /* Fetch the active frame if it is stale. Frames that are not on screen wait
     their turn -- an unread Statistics payload is a scan of 90k posts for
     nobody. */
  function refresh(force) {
    if (!stale[active] && !force) { redraw(active); return; }
    stale[active] = false;
    if (active === 'event') { EVENT.fetch(); return; }
    if (active === 'stats') { STATS.fetch(); return; }
    MAIN.fetchSeries(active);       // overall and fit each fetch their own
  }

  function current() { return active; }
  function shows(id) { return active === id; }
  /* The active frame's controls (or a named frame's). */
  function ctl(id) { return CTL.of(id || active); }

  return { build: build, show: show, markStale: markStale, refresh: refresh,
           redraw: redraw, current: current, shows: shows, ctl: ctl };
})();
