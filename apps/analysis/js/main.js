/* GENERATED COPY -- do not edit.
   Source: apps/analysis/js/main.js
   Rebuild: python tools/homepage/build_homepage_app.py
   The static homepage build shares every view module with the server app;
   the only file that differs is the data layer (api-static.js). */
/* Boot: load config, build the four frames, fetch the first series.

   Each frame owns its configuration and fetches for itself, so `fetchSeries`
   takes the frame it is fetching FOR. Two frames therefore hold two independent
   answers -- Overall at a 7-day resolution and Fit Model at 30 days is a normal
   state, not a race between them. */
var MAIN = (function () {

  /* Debounced PER FRAME so dragging a slider streams smoothly instead of firing
     a request per pixel; the per-frame reqSeq guard drops out-of-order replies
     without letting one frame's slow reply cancel another's. */
  var pending = {};
  function fetchSeries(tab) {
    tab = tab || VIEWS.current();
    clearTimeout(pending[tab]);
    pending[tab] = setTimeout(function () { doFetch(tab); }, 120);
  }

  function setText(id, s) {
    var e = $(id);
    if (e) e.textContent = s;
  }

  function doFetch(tab) {
    var ctl = CTL.of(tab);
    if (!ctl) return;
    var seq = (APP.reqSeq[tab] = (APP.reqSeq[tab] || 0) + 1);
    setStatus('updating…', 'busy');
    API.get('series', ctl.query())
      .then(function (s) {
        if (seq !== APP.reqSeq[tab]) return;   // a newer request for THIS frame won
        APP.series[tab] = s;
        PANELS.render(tab, s);
        if (VIEWS.current() !== tab) return;
        /* Cleared, not filled in. The binning is stated in the configuration
           box and each panel prints its own point count, so an idle status line
           would be a third copy of what is already on screen twice. */
        setStatus('', '');
      })
      .catch(function (e) {
        if (seq !== APP.reqSeq[tab]) return;
        setStatus(e.message || 'failed', 'error');
      });
  }

  function boot() {
    setStatus('loading…', 'busy');
    API.get('config')
      .then(function (cfg) {
        APP.cfg = cfg;
        /* Every header field is optional. The chrome is shared with the static
           build and has been trimmed more than once; a missing element should
           mean "not shown", not a TypeError that takes the whole app down. */
        setText('hdr-range', (cfg.date_min || '?') + ' … ' + (cfg.date_max || '?'));
        setText('foot-source', cfg.source);
        /* VIEWS.build creates one controls instance per frame and binds each to
           its own frame, so it must run before anything reads a frame's box. */
        VIEWS.build(cfg);
        PANELS.build(cfg);
        EVENT.build(cfg);
        /* The Fit frame is OPTIONAL. The static build has no server to run MCMC
           on, so it ships without fit.js and without the frame; guarding here
           rather than shipping a dead tab means the absence is a configuration,
           not a broken button. */
        if (window.FIT && API.has('fit')) {
          FIT.build(cfg);
          // Toggling a model on/off only needs a redraw of the Fit frame.
          FIT.bind(function () { PANELS.render('fit', APP.series.fit); });
        }
        if (window.DASHBOARD) DASHBOARD.build(cfg);
        VIEWS.show(window.DASHBOARD ? 'dashboard' : 'overall');
        if (window.DASHBOARD) setStatus('', '');
      })
      .catch(function (e) { setStatus('config failed: ' + e.message, 'error'); });
  }

  // Re-draw on resize (the SVGs are width-responsive). Only the visible frame
  // has anything on screen to re-draw.
  var rt = null;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { VIEWS.redraw(); }, 150);
  });

  document.addEventListener('DOMContentLoaded', boot);

  return { fetchSeries: fetchSeries };
})();
