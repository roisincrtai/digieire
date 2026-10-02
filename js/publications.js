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

  /* THE SORT KEY. The page is one list, newest first, so ordering is the whole
     presentation and it has to be exact. `year` alone is not enough: four
     works published in the same year sort identically and then fall back to
     whatever order they happen to sit in the file, which is not an order at
     all. An optional `date:` — YYYY, YYYY-MM or YYYY-MM-DD — fixes that.

     A MISSING MONTH OR DAY IS FILLED WITH THE LATEST IT COULD BE, so an entry
     known only to the year sorts above one known to be from June of that year.
     That is the useful reading rather than an arbitrary one: a record left at
     year precision is usually the recent thing nobody has pinned down yet, and
     the alternative convention would quietly bury it at the bottom of the
     page. The file header states the rule, because a sort the author cannot
     predict is a sort they will fight. */
  function sortKey(r) {
    var d = (r.date || '').trim();
    var m = d.match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
    var y = m ? m[1] : (r.year || '0000');
    var mo = m && m[2] ? m[2] : '12';
    var da = m && m[3] ? m[3] : '31';
    return y + '-' + ('0' + mo).slice(-2) + '-' + ('0' + da).slice(-2);
  }

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
      if (r.date) {
        var dm = r.date.match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
        if (!dm) {
          errors.push(where + ': date should be YYYY, YYYY-MM or YYYY-MM-DD, '
                      + 'got "' + r.date + '"');
        } else {
          // A date that disagrees with the year is exactly the drift this
          // format exists to prevent, so it stops the page rather than
          // quietly sorting by one and printing the other.
          if (r.year && dm[1] !== r.year) {
            errors.push(where + ': date "' + r.date + '" and year "' + r.year
                        + '" disagree');
          }
          if (dm[2] && (+dm[2] < 1 || +dm[2] > 12)) {
            errors.push(where + ': month ' + dm[2] + ' is not a month');
          }
          if (dm[3] && (+dm[3] < 1 || +dm[3] > 31)) {
            errors.push(where + ': day ' + dm[3] + ' is not a day');
          }
        }
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

  // ---- citations ----------------------------------------------------------
  /* Every citation is DERIVED from the record, in whichever style the reader
     picks. Storing citations beside the record would mean each entry carried
     the same facts twice — six times, now — and the day someone fixed a year
     in one place the others would quietly disagree. A record may still
     override every style at once with a `cite:` line, for a work whose
     publisher issues an exact form of words.

     Volume, issue and page numbers are optional keys: present, they are used;
     absent, the citation stops earlier rather than printing empty brackets. */

  /* ONE NAME PARSER, SHARED. The styles disagree about how to present a name —
     initials or full, inverted or not, which authors get inverted — but they
     agree about what its PARTS are. Splitting once and letting each style
     arrange the pieces is what stops MLA and APA drifting apart on a name with
     a particle in it. */
  var PARTICLES = {
    van: 1, von: 1, de: 1, del: 1, della: 1, der: 1, den: 1, di: 1, da: 1,
    dos: 1, du: 1, la: 1, le: 1, ter: 1, bin: 1, ibn: 1, al: 1, 'af': 1
  };
  var SUFFIX = /^(jr\.?|sr\.?|i{2,3}|iv|v)$/i;

  function splitName(name) {
    name = (name || '').trim();
    if (!name) return null;
    // Already written "Family, Given"? Trust the comma.
    if (name.indexOf(',') >= 0) {
      var bits = name.split(',');
      return { family: bits[0].trim(),
               given: bits.slice(1).join(' ').trim(),
               suffix: '' };
    }
    var parts = name.split(/\s+/);
    if (parts.length === 1) return { family: parts[0], given: '', suffix: '' };

    var last = parts.length - 1, suffix = '';
    if (parts.length > 2 && SUFFIX.test(parts[last])) {
      suffix = parts[last];
      last -= 1;
    }
    var start = last;
    while (start - 1 >= 1 && PARTICLES[parts[start - 1].toLowerCase()]) start -= 1;
    return {
      family: parts.slice(start, last + 1).join(' '),
      given: parts.slice(0, start).join(' '),
      suffix: suffix
    };
  }

  /* "Róisín" -> "R."; "Jean-Luc" -> "J.-L." — a hyphenated given name keeps
     its hyphen and initialises both halves, in every style that uses
     initials. */
  function initials(given) {
    return (given || '').split(/\s+/).filter(Boolean).map(function (g) {
      return g.split('-').map(function (x) {
        return x ? x.charAt(0).toUpperCase() + '.' : '';
      }).join('-');
    }).join(' ');
  }

  // The four arrangements the styles below draw on.
  function nmInvertedInitials(n) {           // Luo, R.   (APA, Harvard)
    var s = n.given ? n.family + ', ' + initials(n.given) : n.family;
    return n.suffix ? s + ', ' + n.suffix : s;   // APA: suffix after initials
  }
  function nmInvertedFull(n) {               // Luo, Róisín   (MLA, Chicago)
    var s = n.given ? n.family + ', ' + n.given : n.family;
    return n.suffix ? s + ', ' + n.suffix : s;
  }
  function nmPlainFull(n) {                  // Róisín Luo   (MLA/Chicago 2nd+)
    var s = (n.given ? n.given + ' ' : '') + n.family;
    return n.suffix ? s + ' ' + n.suffix : s;
  }
  function nmInitialsFirst(n) {              // R. Luo   (IEEE)
    var s = (n.given ? initials(n.given) + ' ' : '') + n.family;
    return n.suffix ? s + ' ' + n.suffix : s;
  }

  function names(v) {
    return splitList(v).map(splitName).filter(Boolean);
  }

  /* Joining rules differ per style, so they are a parameter rather than a
     convention: `two` is what goes between exactly two names, `last` is what
     precedes the final name when there are three or more, and `serial` says
     whether a comma survives in front of it. */
  function joinNames(list, two, last, serial) {
    if (!list.length) return '';
    if (list.length === 1) return list[0];
    if (list.length === 2) return list[0] + two + list[1];
    return list.slice(0, -1).join(', ') + (serial ? ',' : '') + last
           + list[list.length - 1];
  }

  /* What APA puts in square brackets after the title, for work that is not a
     journal article or a book. A type with no entry here gets no bracket,
     which is the right answer for anything already described by its venue. */
  var BRACKET = {
    preprint: 'Preprint',
    conference: 'Paper presentation',
    workshop: 'Paper presentation',
    talk: 'Conference presentation',
    poster: 'Poster presentation',
    dataset: 'Data set',
    software: 'Computer software'
    // No entry for `report` or `book`: APA gives a report its publisher and,
    // where there is one, a report number — not a "[Report]" tag.
  };
  // Types whose TITLE is italicised, because the work stands alone. For a
  // journal article it is the journal that is italicised, not the title.
  var STANDALONE = {
    preprint: 1, conference: 1, workshop: 1, talk: 1, poster: 1, book: 1,
    dataset: 1, software: 1, report: 1
  };

  function noDot(s) { return (s || '').replace(/\s*\.\s*$/, ''); }
  function link(r) {
    // A DOI beats a bare URL wherever both exist: it is the identifier that
    // keeps working when the publisher reorganises their site.
    if (r.doi) return 'https://doi.org/' + r.doi;
    return r.url || '';
  }

  /* A builder that collects [{t: text, i: italic}] segments. Styles describe
     themselves by calling add(); the displayed citation and the COPIED one are
     then produced from the SAME list, so they cannot drift — which they did,
     once, by a trailing space. */
  function seg() {
    var out = [];
    return {
      add: function (t, i) { if (t) out.push({ t: t, i: !!i }); return this; },
      done: function () {
        out = out.filter(function (p) { return p.t; });
        for (var i = 0; i < out.length; i++) {
          out[i].t = out[i].t.replace(/[ \t]{2,}/g, ' ');
        }
        if (out.length) {
          out[0].t = out[0].t.replace(/^[ \t]+/, '');
          out[out.length - 1].t = out[out.length - 1].t.replace(/[ \t]+$/, '');
        }
        return out.filter(function (p) { return p.t; });
      }
    };
  }

  /* THE STYLES. Each returns segments for one record. They deliberately do not
     share a template: the differences between these styles are not decoration,
     they are where the year sits, what gets inverted, what is italicised and
     what is quoted, and a single parameterised template that tried to express
     all six would be harder to check against a style guide than six short
     functions are. */
  var STYLES = {

    /* APA 7th. Authors (Year). Title [Descriptor]. Venue, vol(issue), pages.
       DOI — with the title italicised for standalone work, and the journal
       italicised for an article. */
    apa: { label: 'APA', build: function (r) {
      var s = seg(), type = (r.type || '').toLowerCase();
      var who = joinNames(names(r.authors).map(nmInvertedInitials), ', & ', ' & ', true);
      s.add(who ? who + ' ' : '');
      s.add('(' + (r.year || 'n.d.') + '). ');
      s.add(noDot(r.title), STANDALONE[type]);

      /* The bracket is dropped when the venue already says the same word.
         "Preprint submitted to Elsevier" would otherwise read "... [Preprint].
         Preprint submitted to Elsevier." — a stutter a reader notices before
         they notice the paper. */
      var br = BRACKET[type];
      if (br && r.venue &&
          r.venue.toLowerCase().indexOf(br.split(' ')[0].toLowerCase()) >= 0) br = '';
      s.add(br ? ' [' + br + ']' : '');
      s.add('. ');

      if (r.venue) {
        if (type === 'journal') {
          s.add(noDot(r.venue), true);
          if (r.volume) {
            s.add(', ').add(r.volume, true);
            if (r.issue) s.add('(' + r.issue + ')');
          }
          if (r.pages) s.add(', ' + r.pages);
          s.add('. ');
        } else {
          s.add(noDot(r.venue) + '. ');
        }
      }
      s.add(link(r));              // APA puts no full stop after a URL
      return s.done();
    }},

    /* MLA 9th. First author inverted, the rest not; the title in quotation
       marks for a part of something, italicised for a standalone work; the
       container italicised. */
    mla: { label: 'MLA', build: function (r) {
      var s = seg(), type = (r.type || '').toLowerCase();
      var n = names(r.authors);
      // MLA stops at three: one author inverted, then "et al."
      var who = n.length > 2
        ? nmInvertedFull(n[0]) + ', et al'
        : joinNames(n.map(function (x, i) {
            return i === 0 ? nmInvertedFull(x) : nmPlainFull(x);
          }), ', and ', ' and ', true);
      // noDot first: a name ending "Jr." must not become "Jr.." here.
      s.add(who ? noDot(who) + '. ' : '');

      if (type === 'journal' || type === 'chapter') {
        s.add('“' + noDot(r.title) + '.” ');
      } else {
        s.add(noDot(r.title), true).add('. ');
      }
      if (r.venue) {
        s.add(noDot(r.venue), type === 'journal' || type === 'chapter');
        s.add(', ');
      }
      if (r.volume) s.add('vol. ' + r.volume + ', ');
      if (r.issue) s.add('no. ' + r.issue + ', ');
      s.add((r.year || 'n.d.'));
      if (r.pages) s.add(', pp. ' + r.pages);
      s.add('. ');
      s.add(link(r) ? link(r) + '.' : '');
      return s.done();
    }},

    /* Chicago 17th, author-date — the form a social-science reader expects,
       and the one that matches how these papers cite their own sources. */
    chicago: { label: 'Chicago', build: function (r) {
      var s = seg(), type = (r.type || '').toLowerCase();
      var n = names(r.authors);
      /* `serial` adds the comma, so `last` must NOT carry one too — passing
         both produced "Mary Anne Smith,, and Olu Ade". */
      var who = joinNames(n.map(function (x, i) {
        return i === 0 ? nmInvertedFull(x) : nmPlainFull(x);
      }), ', and ', ' and ', true);
      s.add(who ? noDot(who) + '. ' : '');
      s.add((r.year || 'n.d.') + '. ');

      if (type === 'journal' || type === 'chapter') {
        s.add('“' + noDot(r.title) + '.” ');
        if (r.venue) s.add(noDot(r.venue), true);
        if (r.volume) s.add(' ' + r.volume);
        if (r.issue) s.add(' (' + r.issue + ')');
        if (r.pages) s.add(': ' + r.pages);
        s.add('. ');
      } else {
        s.add(noDot(r.title), true).add('. ');
        if (r.venue) s.add(noDot(r.venue) + '. ');
      }
      s.add(link(r) ? link(r) + '.' : '');
      return s.done();
    }},

    /* Harvard. Close to APA but with single quotes round an article title,
       round brackets on the year, and "pp." before the pages. */
    harvard: { label: 'Harvard', build: function (r) {
      var s = seg(), type = (r.type || '').toLowerCase();
      var who = joinNames(names(r.authors).map(nmInvertedInitials), ' and ', ' and ', false);
      s.add(who ? who + ' ' : '');
      s.add('(' + (r.year || 'n.d.') + ') ');

      if (type === 'journal' || type === 'chapter') {
        s.add('‘' + noDot(r.title) + '’, ');
        if (r.venue) s.add(noDot(r.venue), true);
        if (r.volume) s.add(', ' + r.volume);
        if (r.issue) s.add('(' + r.issue + ')');
        if (r.pages) s.add(', pp. ' + r.pages);
        s.add('. ');
      } else {
        s.add(noDot(r.title), true).add('. ');
        if (r.venue) s.add(noDot(r.venue) + '. ');
      }
      s.add(link(r) ? 'Available at: ' + link(r) : '');
      return s.done();
    }},

    /* IEEE. Initials first, title in quotes, venue italic, year last. */
    ieee: { label: 'IEEE', build: function (r) {
      var s = seg();
      var who = joinNames(names(r.authors).map(nmInitialsFirst), ' and ', ' and ', true);
      s.add(who ? who + ', ' : '');
      s.add('“' + noDot(r.title) + ',” ');
      if (r.venue) s.add(noDot(r.venue), true).add(', ');
      if (r.volume) s.add('vol. ' + r.volume + ', ');
      if (r.issue) s.add('no. ' + r.issue + ', ');
      if (r.pages) s.add('pp. ' + r.pages + ', ');
      s.add(r.year || 'n.d.');
      s.add('. ');
      s.add(link(r) ? link(r) : '');
      return s.done();
    }},

    /* BibTeX. Not a prose style, and the one most likely to be wanted here —
       these papers are written in LaTeX. Multi-line, so it renders in a <pre>;
       the renderer asks the style whether it is `mono`. */
    bibtex: { label: 'BibTeX', mono: true, build: function (r) {
      var type = (r.type || '').toLowerCase();
      var ENTRY = {
        journal: 'article', conference: 'inproceedings', workshop: 'inproceedings',
        book: 'book', chapter: 'incollection', report: 'techreport'
      };
      var VENUE_FIELD = {
        article: 'journal', inproceedings: 'booktitle', incollection: 'booktitle',
        book: 'publisher', techreport: 'institution'
      };
      var kind = ENTRY[type] || 'misc';

      var n = names(r.authors);
      // Cite keys must be ASCII: "Róisín" would otherwise produce a key LaTeX
      // cannot match. Strip the diacritics rather than the letters.
      var first = n.length ? n[0].family : 'anon';
      var ascii = function (x) {
        return (x.normalize ? x.normalize('NFD').replace(/[̀-ͯ]/g, '') : x)
                 .replace(/[^A-Za-z0-9]/g, '').toLowerCase();
      };
      var word = noDot(r.title).split(/\s+/).find(function (wd) {
        return ascii(wd).length > 3;
      }) || '';
      var key = ascii(first) + (r.year || '') + ascii(word);

      var f = [];
      f.push(['author', n.map(nmPlainFull).join(' and ')]);
      f.push(['title', noDot(r.title)]);
      if (r.venue && VENUE_FIELD[kind]) f.push([VENUE_FIELD[kind], noDot(r.venue)]);
      else if (r.venue) f.push(['howpublished', noDot(r.venue)]);
      if (r.volume) f.push(['volume', r.volume]);
      if (r.issue) f.push(['number', r.issue]);
      if (r.pages) f.push(['pages', r.pages.replace(/-+/g, '--')]);
      if (r.year) f.push(['year', r.year]);
      if (r.doi) f.push(['doi', r.doi]);
      if (r.url && !r.doi) f.push(['url', r.url]);
      /* An arXiv preprint gets eprint/archivePrefix, which is what every LaTeX
         style expects and what turns the entry into a proper arXiv reference
         rather than a bare URL. Derived from the url, so nothing is declared
         twice. */
      var ax = (r.url || '').match(/arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5})/i);
      if (ax) {
        f.push(['eprint', ax[1]]);
        f.push(['archivePrefix', 'arXiv']);
      }
      if (type === 'preprint') f.push(['note', 'Preprint']);

      var pad = f.reduce(function (m, p) { return Math.max(m, p[0].length); }, 0);
      var body = f.map(function (p) {
        return '  ' + p[0] + new Array(pad - p[0].length + 1).join(' ')
               + ' = {' + p[1] + '},';
      }).join('\n');
      return [{ t: '@' + kind + '{' + key + ',\n' + body + '\n}', i: false }];
    }}
  };

  // Order of the chooser; the first is the default.
  var STYLE_ORDER = ['apa', 'mla', 'chicago', 'harvard', 'ieee', 'bibtex'];
  var DEFAULT_STYLE = 'apa';
  var STORE_KEY = 'digieire.citestyle';

  function citeParts(r, style) {
    // An explicit `cite:` overrides every style: the author has given the exact
    // words, and silently reformatting them in five other ways would be worse
    // than offering no choice at all.
    if (r.cite) return [{ t: r.cite, i: false }];
    var st = STYLES[style] || STYLES[DEFAULT_STYLE];
    try {
      return st.build(r);
    } catch (e) {
      return [{ t: 'This citation could not be built in ' + st.label + '.', i: false }];
    }
  }
  function citeText(r, style) {
    return citeParts(r, style).map(function (p) { return p.t; }).join('');
  }

  /* ONE CHOSEN STYLE FOR THE WHOLE PAGE, held here and broadcast to every
     citation block. The alternative — a chooser per entry, each independent —
     would let the page show five entries in five different styles, which is
     not a thing anyone wants and looks like a bug.

     localStorage is wrapped because it throws rather than returning null in a
     few real situations: Safari's private mode, a browser configured to block
     site data, and a page opened from file://. A remembered preference is a
     convenience, so it must never be able to stop the list rendering. */
  var listeners = [];
  var chosen = null;

  function currentStyle() {
    if (chosen) return chosen;
    try {
      var v = window.localStorage && window.localStorage.getItem(STORE_KEY);
      if (v && STYLES[v]) { chosen = v; return v; }
    } catch (e) { /* storage unavailable; the default is fine */ }
    chosen = DEFAULT_STYLE;
    return chosen;
  }

  function setStyle(k) {
    if (!STYLES[k] || k === chosen) return;
    chosen = k;
    try {
      if (window.localStorage) window.localStorage.setItem(STORE_KEY, k);
    } catch (e) { /* not remembering it is not a reason to not apply it */ }
    listeners.forEach(function (fn) { fn(k); });
  }

  function subscribe(fn) { listeners.push(fn); }

  /* navigator.clipboard is unavailable on a plain-http origin that is not
     localhost, and in older browsers, so the textarea route is a real fallback
     and not a formality: a lab member opening this from another machine on the
     network is exactly the case that loses the modern API. */
  function copyText(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function () { done(true); }, function () { done(legacyCopy(text)); });
      return;
    }
    done(legacyCopy(text));
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand && document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) {
      return false;
    }
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

    li.appendChild(citeBlock(r));

    var tags = splitList(r.tags);
    if (tags.length) {
      var tl = el('ul', 'pub-tags');
      tags.forEach(function (t) { tl.appendChild(el('li', null, t)); });
      li.appendChild(tl);
    }
    return li;
  }

  /* The tinted "Cite" region. Clicking anywhere in it copies — EXCEPT while
     the reader has text selected inside it, because someone who has just
     dragged across half the citation is reading or hand-picking it, and
     overwriting their clipboard at that moment is the opposite of helpful.
     The explicit button is still there for keyboard users and for anyone who
     wants the whole thing without thinking about it. */
  function citeBlock(r) {
    var style = currentStyle();

    var box = el('div', 'pub-cite');
    var head = el('div', 'pub-cite-h');
    head.appendChild(el('span', 'pub-cite-l', 'Cite:'));

    var btn = el('button', 'pub-copy', 'Copy');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Copy the citation for ' + r.title);
    head.appendChild(btn);
    box.appendChild(head);

    var body = el('p', 'pub-cite-t');
    box.appendChild(body);

    /* THE FORMAT CHOOSER sits under the citation it changes, so the thing that
       moves is directly above the control that moved it. Choosing a style on
       ONE entry changes every entry on the page: a reader wanting Harvard
       wants Harvard for all of them, and making them click it once per paper
       would be a worse offer than not having the choice. The preference is
       remembered, so coming back does not mean choosing again. */
    var pick = el('div', 'pub-fmt');
    pick.setAttribute('role', 'radiogroup');
    pick.setAttribute('aria-label', 'Citation format');
    var buttons = {};
    STYLE_ORDER.forEach(function (k) {
      var b = el('button', 'pub-fmt-b', STYLES[k].label);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.addEventListener('click', function (ev) {
        ev.stopPropagation();          // choosing a format is not a copy
        setStyle(k);
      });
      buttons[k] = b;
      pick.appendChild(b);
    });
    box.appendChild(pick);

    /* An overridden citation has one form of words by definition, so the
       chooser is not shown rather than shown and inert. */
    if (r.cite) pick.hidden = true;

    function draw(k) {
      style = k;
      body.textContent = '';
      var mono = !!(STYLES[k] && STYLES[k].mono) && !r.cite;
      body.classList.toggle('is-mono', mono);
      citeParts(r, k).forEach(function (p) {
        body.appendChild(p.i ? el('i', null, p.t) : document.createTextNode(p.t));
      });
      STYLE_ORDER.forEach(function (o) {
        var on = o === k;
        buttons[o].classList.toggle('on', on);
        buttons[o].setAttribute('aria-checked', on ? 'true' : 'false');
        // Only the selected button is in the tab order, which is how a
        // radiogroup is meant to behave.
        buttons[o].tabIndex = on ? 0 : -1;
      });
    }
    draw(style);
    subscribe(draw);

    // Announced rather than only coloured, so the confirmation reaches a
    // screen-reader user too.
    var say = el('span', 'sr');
    say.setAttribute('role', 'status');
    say.setAttribute('aria-live', 'polite');
    box.appendChild(say);

    var reset = null;
    function flash(okCopy) {
      btn.textContent = okCopy ? 'Copied' : 'Press ⌘C';
      box.classList.toggle('is-copied', okCopy);
      box.classList.toggle('is-failed', !okCopy);
      say.textContent = okCopy ? 'Citation copied to the clipboard'
                               : 'Could not copy automatically; the citation is selected';
      if (reset) clearTimeout(reset);
      reset = setTimeout(function () {
        btn.textContent = 'Copy';
        box.classList.remove('is-copied', 'is-failed');
        say.textContent = '';
      }, 1800);
    }

    // Reads the style at click time, not at build time, so it always copies
    // what the reader is actually looking at.
    function go() { copyText(citeText(r, style), flash); }

    btn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      go();
    });
    box.addEventListener('click', function () {
      var sel = window.getSelection && window.getSelection();
      if (sel && !sel.isCollapsed && box.contains(sel.anchorNode)) return;
      go();
    });
    return box;
  }

  function render(recs) {
    host.textContent = '';

    // Group by type, in KINDS order, then anything unrecognised, in the order
    // it first appeared. Newest first inside each group.
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

    /* ONE LIST, NEWEST FIRST, ACROSS EVERY KIND OF OUTPUT. Grouping by type
       used to come first, which meant the page had several orders running at
       once and no single reading of "what came after what" — a talk given
       between two papers appeared below both of them. Now position means one
       thing only. The kind is still visible, as a label on each entry, which
       is where it belongs when it is an attribute of the work rather than the
       organising principle of the page.

       Ties keep the order the file gives them: `sort` is stable in every
       engine that matters since ES2019, so two works with the same key stay as
       the author arranged them instead of swapping about between loads. */
    var kindLabel = {};
    KINDS.forEach(function (k) { kindLabel[k[0]] = k[1]; });

    var list = recs.slice().sort(function (a, b) {
      var ka = sortKey(a), kb = sortKey(b);
      return ka < kb ? 1 : ka > kb ? -1 : 0;
    });

    var ul = el('ul', 'pub-list');
    list.forEach(function (r) {
      var li = entry(r);
      var t = (r.type || '').toLowerCase();
      // An unrecognised type still gets a label, made from its own name.
      var name = kindLabel[t] || (t ? t.charAt(0).toUpperCase() + t.slice(1) : '');
      if (name) {
        var chip = el('span', 'pub-kind', name);
        chip.setAttribute('data-kind', t);
        li.insertBefore(chip, li.firstChild);
      }
      ul.appendChild(li);
    });
    host.appendChild(ul);

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
