(function () {
  var token = localStorage.getItem('sma-token');
  if (!token) return;

  var labels = { en: 'Go to App →', fr: 'Accéder à l\'app →', es: 'Ir a la app →' };
  var lang = localStorage.getItem('sma-lang') || 'en';
  var label = labels[lang] || labels.en;

  var loginD = document.getElementById('nav-login-d');
  var signupD = document.getElementById('nav-signup-d');
  var loginM = document.getElementById('nav-login-m');
  var signupM = document.getElementById('nav-signup-m');

  if (loginD) loginD.style.display = 'none';
  if (signupD) {
    signupD.href = '/app';
    signupD.textContent = label;
  }
  if (loginM) loginM.style.display = 'none';
  if (signupM) {
    signupM.href = '/app';
    signupM.textContent = label;
  }
})();
