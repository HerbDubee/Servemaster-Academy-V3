(function () {
  var token = localStorage.getItem('sma-token');
  if (!token) return;

  var loginD = document.getElementById('nav-login-d');
  var signupD = document.getElementById('nav-signup-d');
  var loginM = document.getElementById('nav-login-m');
  var signupM = document.getElementById('nav-signup-m');

  if (loginD) loginD.style.display = 'none';
  if (signupD) {
    signupD.href = '/app';
    signupD.textContent = 'Go to App →';
  }
  if (loginM) loginM.style.display = 'none';
  if (signupM) {
    signupM.href = '/app';
    signupM.textContent = 'Go to App →';
  }
})();
