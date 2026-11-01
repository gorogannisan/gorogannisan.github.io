/* Preserve /#library links in previously published articles and bookmarks. */
(function () {
  'use strict';

  function followLegacyLink() {
    if (location.hash === '#library') location.replace('/library' + location.search);
  }

  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[href="#library"]');
    if (link) link.setAttribute('href', '/library');
  });

  followLegacyLink();
  window.addEventListener('hashchange', followLegacyLink);
})();
