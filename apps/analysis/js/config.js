/* GENERATED COPY -- do not edit.
   Source: apps/analysis/js/config.js
   Rebuild: python tools/homepage/build_homepage_app.py
   The static homepage build shares every view module with the server app;
   the only file that differs is the data layer (api-static.js). */
/* Shared globals, populated at runtime from /api/config.
   Classic scripts share one global scope; this file declares the contract. */
var APP = {
  cfg: null,        // /api/config payload
  /* Latest /api/series payload PER FRAME, keyed by tab id. Each frame has its
     own configuration, so each has its own answer -- one shared payload would
     mean the last frame to fetch decided what every other frame displayed. */
  series: {},
  panels: [],       // [{tab, id, kind, title, el, svg}]
  /* One request sequence per frame, so a slow Overall reply cannot be mistaken
     for a stale Fit reply (or overwrite it). */
  reqSeq: {}
};

/* Tiny helpers used across the modules. */
function $(id) { return document.getElementById(id); }

function setStatus(msg, cls) {
  var el = $('status');
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'status' + (cls ? ' ' + cls : '');
}

/* 'YYYY-MM-DD' -> 'YYYYMMDD' (the API's date format); '' -> ''. */
function compactDate(v) { return v ? String(v).replace(/-/g, '') : ''; }

function fmtNum(v, dp) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return Number(v).toFixed(dp === undefined ? 2 : dp);
}
