/* The Publications page.

   Reads homepage/publications/bibliograph.txt at load, parses it, and renders
   the list. NOTHING ABOUT A PUBLICATION IS WRITTEN IN THIS FILE: no title, no
   year, no count, no author, no section that exists because a paper happens to
   exist today. Add a block to the text file and it appears here; delete one and
   it goes. The headings, the counts, the year range and the filter buttons are
   all derived from whatever the file turned out to contain.

   WHY fetch() AND NOT A SCRIPT ASSIGNMENT. Every other dataset on this site
   arrives as `window.X = ...` inside a <script>, so the pages work from a
   double-clicked file:// folder. This page is the deliberate exception: the
   bibliography is the one file the author edits often, possibly through the
   GitHub web UI or from a clone of the homepage repo alone, which has no build
   tooling in it. Keeping it as plain .txt that the page reads directly means
   editing it is the whole workflow. The price is that fetch() is refused on a
   file:// origin, so this page -- and only this page -- needs HTTP. Run
   tools/homepage/start_httpd.py for that, which is what the message below
   says when it happens.

   FAILURE IS LOUD. A publication list that silently renders empty is the worst
   outcome available: it looks like a lab with no output, and nothing anywhere
   says otherwise. Every failure path here -- no file, bad response, zero
   records, a record missing a required key -- paints a visible panel naming the
   problem. */
(function () {
  'use strict';

  var host = document.getElementById('pubs');
  if (!host) return;

  /* Resolved against this page's URL, so it is correct from /pages/ and would
     stay correct if the page moved. No leading slash: the site is served from a
     subpath on GitHub Pages and an absolute path would point at the domain
     root. */
  var SRC = '../publications/bibliograph.txt';
  var PDF_DIR = '../publications/pdfs/';

  /* The display ORDER of the kinds of work, which is an editorial judgement and
     the one thing here that cannot be derived: sorting the type names
     alphabetically would open the page with "Book, Chapter, Conference" and
     bury the journal articles. Types are listed here with their headings; a
     type that appears in the file but not in this list is still shown, under
     its own name, at the end. Nothing is ever dropped for being unrecognised.
     The singular/plural pair is so a section with one entry does not say
     "1 Journal articles". */
  var KINDS = [
    ['journal',    'Journal article',     'Journal articles'],
    ['preprint',   'Preprint',            'Preprints'],
    ['conference', 'Conference paper',    'Conference papers'],
    ['workshop',   'Workshop paper',      'Workshop papers'],
    ['chapter',    'Book chapter',        'Book chapters'],
    ['book',       'Book',                'Books'],
    ['talk',       'Talk',                'Talks and presentations'],
    ['poster',     'Poster',              'Posters'],
    ['dataset',    'Dataset',             'Datasets'],
    ['software',   'Software and models', 'Software and models'],
    ['report',     'Report',              'Reports']
  ];
  var REQUIRED = ['id', 'type', 'title', 'authors', 'year'];

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  /* Everything from the text file goes in through textContent or setAttribute,
     never innerHTML. The file is trusted, but a stray < in a title should show
     as a < rather than start an element. */
  function fail(title, detail, hint) {
    host.textContent = '';
    var box = el('div', 'pub-error');
    box.appendChild(el('p', 'pub-error-t', title));
    if (detail) box.appendChild(el('p', 'pub-error-d', detail));
    if (hint) box.appendChild(el('p', 'pub-error-h', hint));
    host.appendChild(box);
  }

  // ---- the parser ---------------------------------------------------------
  /* The format: blank-line-separated blocks of `key: value`, # comments
     anywhere, and a value continued by indenting the next line. Deliberately
     not YAML, not JSON, not BibTeX -- it is edited by hand in a browser text
     box as often as in an editor, so a missing bracket must not be able to
     destroy the file, and every line stands alone. */
  function parse(text) {
    var recs = [], cur = null, key = null, errors = [];
    var lines = text.split(/\r\n|\r|\n/);

    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      if (/^\s*#/.test(raw)) continue;            // comment, anywhere
      if (!raw.trim()) { if (cur) { recs.push(cur); cur = null; } key = null; continue; }

      // A continuation line: indented, and we are already inside a key.
      if (/^[ \t]{2,}\S/.test(raw) && cur && key) {
        cur[key] = (cur[key] + ' ' + raw.trim()).trim();
        continue;
      }
      var m = raw.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([\s\S]*)$/);
      if (!m) {
        errors.push('line ' + (i + 1) + ': not `key: value` and not an '
                    + 'indented continuation — ' + raw.trim());
        continue;
      }
      if (!cur) cur = {};
      key = m[1].toLowerCase();
      cur[key] = m[2].trim();
    }
    if (cur) recs.push(cur);

    // Validate here rather than letting a half-formed record render as a
    // mystery. Report every bad record, not just the first.
    var seen = {};
    recs.forEach(function (r, n) {
      var where = r.id ? '"' + r.id + '"' : 'record ' + (n + 1);
      REQUIRED.forEach(function (k) {
        if (!r[k]) errors.push(where + ': missing required key `' + k + '`');
      });
      if (r.year && !/^\d{4}$/.test(r.year)) {
        errors.push(where + ': year should be four digits, got "' + r.year + '"');
      }
      if (r.pdf && r.pdf.indexOf('/') >= 0) {
        errors.push(where + ': pdf must be a bare filename, not a path');
      }
      if (r.id) {
        if (seen[r.id]) errors.push('duplicate id "' + r.id + '"');
        seen[r.id] = true;
      }
    });
    return { records: recs, errors: errors };
  }

  function splitList(v) {
    if (!v) return [];
    return v.split(';').map(function (s) { return s.trim(); })
            .filter(function (s) { return s; });
  }

  /* "Róisín Luo; Karyn Morrissey" -> "Róisín Luo and Karyn Morrissey", and with
     three or more, the serial comma. Derived, so adding an author to the text
     file never leaves a stale "and" behind. */
  function authorLine(v) {
    var a = splitList(v);
    if (a.length <= 1) return a[0] || '';
    if (a.length === 2) return a[0] + ' and ' + a[1];
    return a.slice(0, -1).join(', ') + ', and ' + a[a.length - 1];
  }

  // ---- rendering ----------------------------------------------------------
  function entry(r) {
    var li = el('li', 'pub');
    li.id = 'pub-' + r.id;

    var head = el('div', 'pub-head');
    head.appendChild(el('h3', 'pub-t', r.title));
    head.appendChild(el('p', 'pub-a', authorLine(r.authors)));
    li.appendChild(head);

    var meta = el('p', 'pub-m');
    if (r.venue) meta.appendChild(el('span', 'pub-v', r.venue));
    meta.appendChild(el('span', 'pub-y', r.year));
    if (r.status) meta.appendChild(el('span', 'pub-s', r.status));
    li.appendChild(meta);

    if (r.note) li.appendChild(el('p', 'pub-n', r.note));

    /* The links a given entry has, and no placeholders for the ones it does
       not: a greyed-out "PDF" on a talk is a dead control that teaches the
       reader to distrust the live ones. */
    var links = el('p', 'pub-l');
    if (r.pdf) {
      var a = el('a', 'pub-link', 'PDF');
      a.href = PDF_DIR + r.pdf;
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
      links.appendChild(a);
    }
    if (r.doi) {
      var d = el('a', 'pub-link', 'DOI');
      d.href = 'https://doi.org/' + r.doi;
      d.setAttribute('target', '_blank');
      d.setAttribute('rel', 'noopener');
      links.appendChild(d);
    }
    if (r.url) {
      var u = el('a', 'pub-link', 'Link');
      u.href = r.url;
      u.setAttribute('target', '_blank');
      u.setAttribute('rel', 'noopener');
      links.appendChild(u);
    }
    if (links.childNodes.length) li.appendChild(links);

    var tags = splitList(r.tags);
    if (tags.length) {
      var tl = el('ul', 'pub-tags');
      tags.forEach(function (t) { tl.appendChild(el('li', null, t)); });
      li.appendChild(tl);
    }
    return li;
  }

  function render(recs) {
    host.textContent = '';

    // Group by type, in KINDS order, then anything unrecognised, in the order
    // it first appeared. Newest first inside each group.
    var order = KINDS.map(function (k) { return k[0]; });
    var label = {};
    KINDS.forEach(function (k) { label[k[0]] = [k[1], k[2]]; });

    var groups = {}, extras = [];
    recs.forEach(function (r) {
      var t = (r.type || '').toLowerCase();
      if (!groups[t]) {
        groups[t] = [];
        if (order.indexOf(t) < 0) extras.push(t);
      }
      groups[t].push(r);
    });

    var seq = order.filter(function (t) { return groups[t]; }).concat(extras);

    // The summary line is counted, never typed.
    var years = recs.map(function (r) { return +r.year; })
                    .filter(function (y) { return y; });
    var sum = el('p', 'pub-sum');
    sum.appendChild(el('b', null, String(recs.length)));
    sum.appendChild(document.createTextNode(
      ' ' + (recs.length === 1 ? 'output' : 'outputs')
      + (years.length
          ? (Math.min.apply(null, years) === Math.max.apply(null, years)
              ? ', ' + Math.min.apply(null, years)
              : ', ' + Math.min.apply(null, years) + '–' + Math.max.apply(null, years))
          : '')));
    host.appendChild(sum);

    seq.forEach(function (t) {
      var list = groups[t].slice().sort(function (a, b) {
        return (+b.year || 0) - (+a.year || 0);
      });
      var pair = label[t];
      var name = pair ? (list.length === 1 ? pair[0] : pair[1])
                      : t.charAt(0).toUpperCase() + t.slice(1);

      var sec = el('section', 'pub-group');
      var h = el('h2', 'pub-gh', name);
      h.appendChild(el('span', 'pub-gn', String(list.length)));
      sec.appendChild(h);

      var ul = el('ul', 'pub-list');
      list.forEach(function (r) { ul.appendChild(entry(r)); });
      sec.appendChild(ul);
      host.appendChild(sec);
    });

    /* If the reader arrived on a #pub-<id> link, the entry was not in the
       document when the browser tried to scroll to it. Do it now. */
    var want = (location.hash || '').replace('#', '');
    if (want) {
      var target = document.getElementById(want);
      if (target) {
        target.scrollIntoView();
        target.classList.add('pub-jumped');
      }
    }
  }

  // ---- load ---------------------------------------------------------------
  /* fetch() where it exists, XMLHttpRequest where it does not. Not defensive
     programming for its own sake: the jsdom harness that tests this page has no
     window.fetch, so without the second path the only thing the tests could
     ever assert is the error panel. XHR is also the older and more widely
     implemented of the two, and both fail identically on a file:// origin,
     which is the case that actually matters here. */
  function load(url, ok, err) {
    if (window.fetch) {
      window.fetch(url, { cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + res.statusText);
          return res.text();
        })
        .then(ok)
        .catch(function (e) { err(e && e.message ? e.message : String(e)); });
      return;
    }
    try {
      var x = new XMLHttpRequest();
      x.open('GET', url, true);
      x.onload = function () {
        // A file:// read that is allowed at all reports status 0, not 200.
        if (x.status === 200 || (x.status === 0 && x.responseText)) ok(x.responseText);
        else err('HTTP ' + x.status + ' ' + (x.statusText || ''));
      };
      x.onerror = function () { err('the request failed'); };
      x.send();
    } catch (e) {
      err(e && e.message ? e.message : String(e));
    }
  }

  host.appendChild(el('p', 'pub-loading', 'Loading publications…'));

  if (location.protocol === 'file:') {
    fail('This page needs a web server.',
         'The publication list is read from publications/bibliograph.txt, and a '
         + 'browser will not let a page opened from a folder read a file beside '
         + 'it. Every other page on this site works from a folder; this one '
         + 'does not.',
         'From the project root: python tools/homepage/start_httpd.py');
    return;
  }

  load(SRC, function (text) {
    var out = parse(text);
    if (out.errors.length) {
      fail('The bibliography could not be read.',
           out.errors.join('  ·  '),
           'Fix publications/bibliograph.txt and reload.');
      return;
    }
    if (!out.records.length) {
      fail('The bibliography is empty.',
           'publications/bibliograph.txt loaded, but contains no records.',
           'Each record is a block of `key: value` lines separated by a blank '
           + 'line.');
      return;
    }
    render(out.records);
  }, function (msg) {
    fail('The publication list could not be loaded.',
         SRC + ' — ' + msg,
         'Check the file exists and that the page is being served over HTTP.');
  });

})();
