/* The site's only shared script: a sticky-bar state and the mobile menu.

   Deliberately small and entirely optional. Every page is complete markup, so
   with this file removed or blocked the navigation still works, every link still
   resolves and every figure still renders. That is also what lets the site work
   from `file://` and from a web server without changing anything.

   There is no scroll spy any more. When the site was one long page the current
   section had to be inferred from the scroll position; now each section is its
   own page, so the current item is known at build time and
   tools/homepage/build_pages.py marks it with `is-current` and `aria-current`.
   Deleting the guesswork removed a listener, a layout read on every frame, and
   a class of wrong answers near the end of the page.

   Nothing here fetches anything. */
(function () {
  'use strict';

  var bar = document.getElementById('topbar');
  var toggle = document.getElementById('nav-toggle');

  /* A border under the bar only once the page has actually moved: a rule under
     a bar at the very top of an unscrolled page is a line for no reason. */
  function onScroll() {
    if (bar) bar.classList.toggle('is-stuck', window.scrollY > 8);
  }

  if (toggle && bar) {
    toggle.addEventListener('click', function () {
      var open = bar.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    // A menu that stays open after you have chosen from it is in the way.
    bar.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.nav a')) {
        bar.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
