(function () {
  var _prompt = null;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  var isStandalone = window.navigator.standalone ||
    window.matchMedia('(display-mode: standalone)').matches;

  if (isStandalone) return;

  function showBtn() {
    ['nav-pwa-d', 'nav-pwa-m'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.remove('hidden');
    });
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    _prompt = e;
    showBtn();
  });

  if (isIOS) showBtn();

  window.navPwaClick = function () {
    if (_prompt) {
      _prompt.prompt();
      _prompt.userChoice.then(function () { _prompt = null; });
    } else if (isIOS) {
      alert('To install: tap the Share button (\u25a1\u2191) at the bottom of Safari, then tap \u201cAdd to Home Screen\u201d.');
    }
  };
})();
