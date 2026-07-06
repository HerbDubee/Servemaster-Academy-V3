(function () {
  var token = localStorage.getItem('sma-token');
  if (!token) return;

  var lang = localStorage.getItem('sma-lang') || 'en';
  var appLabels = { en: 'Go to App →', fr: 'Accéder à l\'app →', es: 'Ir a la app →' };
  var trainingLabels = { en: 'Back to Training', fr: 'Retour à la formation', es: 'Volver a la formación' };
  var appLabel = appLabels[lang] || appLabels.en;
  var trainingLabel = trainingLabels[lang] || trainingLabels.en;

  var loginD = document.getElementById('nav-login-d');
  var signupD = document.getElementById('nav-signup-d');
  var loginM = document.getElementById('nav-login-m');
  var signupM = document.getElementById('nav-signup-m');

  if (loginD) loginD.style.display = 'none';
  if (signupD) {
    signupD.href = '/app';
    signupD.textContent = appLabel;
  }
  if (loginM) loginM.style.display = 'none';
  if (signupM) {
    signupM.href = '/app';
    signupM.textContent = appLabel;
  }

  // On the novel reader pages, give logged-in users a clear, branded way back
  // into the training app from within the nav itself (not just the CTA button),
  // so crossing into the novels never leaves them stranded.
  if (/^\/novels(\/|$)/.test(location.pathname)) {
    var desktopNav = document.querySelector('nav .hidden.md\\:flex');
    if (desktopNav && !document.getElementById('nav-training-d')) {
      var a = document.createElement('a');
      a.id = 'nav-training-d';
      a.href = '/app';
      a.className = 'flex items-center gap-1.5 font-semibold transition-colors hover:opacity-90';
      a.style.color = '#FF5E3A';
      a.innerHTML = '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/></svg>' + trainingLabel;
      desktopNav.insertBefore(a, desktopNav.firstChild);
    }

    var mobileMenu = document.querySelector('#mobile-menu .flex.flex-col');
    if (mobileMenu && !document.getElementById('nav-training-m')) {
      var m = document.createElement('a');
      m.id = 'nav-training-m';
      m.href = '/app';
      m.className = 'py-4 border-b border-zinc-800 text-sm font-semibold hover:opacity-80';
      m.style.color = '#FF5E3A';
      m.textContent = '\u2190 ' + trainingLabel;
      mobileMenu.insertBefore(m, mobileMenu.firstChild);
    }
  }
})();
