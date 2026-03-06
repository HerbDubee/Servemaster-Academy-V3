(function () {
  var LANG_KEY = 'sma_lang';
  var LANGS = ['en', 'fr', 'es'];

  var T = {
    en: {
      nav_home: 'Home',
      nav_about: 'About',
      nav_features: 'Features',
      nav_pricing: 'Pricing',
      nav_contact: 'Contact',
      nav_managers: 'For Managers',
      nav_blog: 'Blog',
      nav_login: 'Log in',
      nav_cta: 'Get Started Free',

      home_hero: 'Great service<br>shouldn\'t be rare.',
      home_hero_sub: 'ServeMaster Academy trains hospitality professionals with AI role‑play, voice practice, and 12 expert modules — in English, French, and Spanish.',
      home_free_strip: '14‑day free trial &bull; No credit card required &bull; Cancel any time',
      home_features_h: 'Everything a great server needs',
      home_ai_h: 'AI Roleplay',
      home_ai_p: 'Practice difficult guest scenarios — wine complaints, allergy questions, upselling — with an AI dining guest that responds like a real person.',
      home_voice_h: 'Voice Practice',
      home_voice_p: 'Build confidence speaking the right words with Whisper-powered pronunciation and phrasing feedback.',
      home_gamification_h: 'Gamification',
      home_gamification_p: 'Earn badges, build daily streaks, and climb the leaderboard. Learning is more effective when it feels like a game.',
      home_cert_h: 'Certificate',
      home_cert_p: 'Complete all 12 modules and earn a ServeMaster Academy certificate to display on your resumé or staff profile.',
      home_testimonials_h: 'Trusted by servers &amp; restaurants across North America',
      home_blog_h: 'Server Tips &amp; Resources',
      home_newsletter_h: 'Monthly tips for servers',
      home_newsletter_p: 'No spam. Just practical advice from Kirk — delivered once a month.',
      home_newsletter_btn: 'Subscribe',
      home_trial_cta_h: 'Start your free trial today',
      home_trial_cta_p: 'Join thousands of hospitality professionals already training with ServeMaster Academy.',
      home_trial_cta_btn: 'Get Started Free',

      about_h1: 'Why ServeMaster Academy Exists',
      about_founding_h: 'The Founding Story',
      about_values_h: 'Our Values',
      about_trilingual_h: 'Trilingual EN / FR / ES',
      about_trilingual_p: 'Built from day one for North America\'s multilingual hospitality market. Every module, term, and scenario is available in English, French, and Spanish.',

      features_h1: 'Every Tool a Professional Server Needs',
      features_sub: '12 interactive modules, AI role‑play, voice practice, gamification, and a certificate — all in one platform.',
      features_glossary_label: 'Trilingual EN/FR/ES',

      pricing_h1: 'Invest in your best people',
      pricing_sub: '14‑day free trial on every plan. No credit card required to start.',

      contact_h1: 'Get in Touch',
      contact_sub: 'Questions about the platform, partnerships, or enterprise pricing? We\'d love to hear from you.',

      managers_h1: 'Train Your Whole Team',
      managers_sub: 'ServeMaster Academy gives restaurant owners and managers the tools to build a consistently excellent front‑of‑house team.',

      login_h: 'Welcome back',
      login_btn: 'Log in',
      login_google: 'Continue with Google',
      login_no_acct: "Don't have an account?",
      login_signup_link: 'Start free trial',

      signup_h: 'Start your free trial',
      signup_btn: 'Create account',
      signup_google: 'Sign up with Google',
      signup_has_acct: 'Already have an account?',
      signup_login_link: 'Log in',

      trial_banner_pre: 'You have',
      trial_banner_post: 'days left in your free trial',
      upgrade_now: 'Upgrade now to keep access',
      footer_tagline: 'Professional hospitality training for serious servers.',
      terms_h1: 'Terms of Service',
      privacy_h1: 'Privacy Policy',
      blog_h1: 'Server Tips &amp; Resources',
      blog_sub: 'Practical advice from Kirk Adamson — fine‑dining aficionado &amp; founder of ServeMaster Academy.',
    },

    fr: {
      nav_home: 'Accueil',
      nav_about: 'À propos',
      nav_features: 'Fonctionnalités',
      nav_pricing: 'Tarifs',
      nav_contact: 'Contact',
      nav_managers: 'Pour les gérants',
      nav_blog: 'Blogue',
      nav_login: 'Se connecter',
      nav_cta: 'Commencer gratuitement',

      home_hero: 'Un excellent service<br>ne devrait pas être rare.',
      home_hero_sub: 'ServeMaster Academy forme les professionnels de l\'hôtellerie avec des jeux de rôle IA, la pratique vocale et 12 modules experts — en anglais, français et espagnol.',
      home_free_strip: 'Essai gratuit de 14 jours &bull; Aucune carte de crédit requise &bull; Annulez à tout moment',
      home_features_h: 'Tout ce dont un grand serveur a besoin',
      home_ai_h: 'Jeu de rôle IA',
      home_ai_p: 'Pratiquez des scénarios difficiles — plaintes sur le vin, questions d\'allergies, vente incitative — avec un convive IA qui répond comme une vraie personne.',
      home_voice_h: 'Pratique vocale',
      home_voice_p: 'Développez votre confiance en prononçant les bons mots grâce aux commentaires de prononciation et de formulation de Whisper.',
      home_gamification_h: 'Ludification',
      home_gamification_p: 'Gagnez des badges, construisez des séries quotidiennes et grimpez au classement. L\'apprentissage est plus efficace quand il ressemble à un jeu.',
      home_cert_h: 'Certificat',
      home_cert_p: 'Terminez les 12 modules et obtenez un certificat ServeMaster Academy à afficher sur votre CV ou profil d\'employé.',
      home_testimonials_h: 'Approuvé par des serveurs et des restaurants partout en Amérique du Nord',
      home_blog_h: 'Conseils et ressources pour les serveurs',
      home_newsletter_h: 'Conseils mensuels pour les serveurs',
      home_newsletter_p: 'Aucun spam. Juste des conseils pratiques de Kirk — livrés une fois par mois.',
      home_newsletter_btn: 'S\'abonner',
      home_trial_cta_h: 'Commencez votre essai gratuit aujourd\'hui',
      home_trial_cta_p: 'Rejoignez des milliers de professionnels de l\'hôtellerie qui se forment déjà avec ServeMaster Academy.',
      home_trial_cta_btn: 'Commencer gratuitement',

      about_h1: 'Pourquoi ServeMaster Academy existe',
      about_founding_h: 'L\'histoire fondatrice',
      about_values_h: 'Nos valeurs',
      about_trilingual_h: 'Trilingue EN / FR / ES',
      about_trilingual_p: 'Conçu dès le premier jour pour le marché hôtelier multilingue de l\'Amérique du Nord. Chaque module, terme et scénario est disponible en anglais, français et espagnol.',

      features_h1: 'Tous les outils dont un serveur professionnel a besoin',
      features_sub: '12 modules interactifs, jeux de rôle IA, pratique vocale, ludification et un certificat — tout en une seule plateforme.',
      features_glossary_label: 'Trilingue EN/FR/ES',

      pricing_h1: 'Investissez dans vos meilleurs employés',
      pricing_sub: 'Essai gratuit de 14 jours sur chaque forfait. Aucune carte de crédit requise pour commencer.',

      contact_h1: 'Contactez-nous',
      contact_sub: 'Questions sur la plateforme, les partenariats ou les tarifs entreprise\u00a0? Nous serions ravis de vous entendre.',

      managers_h1: 'Formez toute votre équipe',
      managers_sub: 'ServeMaster Academy donne aux propriétaires et gérants de restaurants les outils pour bâtir une équipe de salle constamment excellente.',

      login_h: 'Bon retour',
      login_btn: 'Se connecter',
      login_google: 'Continuer avec Google',
      login_no_acct: 'Pas encore de compte\u00a0?',
      login_signup_link: 'Commencer l\'essai gratuit',

      signup_h: 'Commencez votre essai gratuit',
      signup_btn: 'Créer un compte',
      signup_google: 'S\'inscrire avec Google',
      signup_has_acct: 'Vous avez déjà un compte\u00a0?',
      signup_login_link: 'Se connecter',

      trial_banner_pre: 'Il vous reste',
      trial_banner_post: 'jours dans votre essai gratuit',
      upgrade_now: 'Abonnez-vous pour garder l\'accès',
      footer_tagline: 'Formation professionnelle en hôtellerie pour les serveurs sérieux.',
      terms_h1: 'Conditions d\'utilisation',
      privacy_h1: 'Politique de confidentialité',
      blog_h1: 'Conseils et ressources pour les serveurs',
      blog_sub: 'Conseils pratiques de Kirk Adamson — passionné de gastronomie et fondateur de ServeMaster Academy.',
    },

    es: {
      nav_home: 'Inicio',
      nav_about: 'Acerca de',
      nav_features: 'Funciones',
      nav_pricing: 'Precios',
      nav_contact: 'Contacto',
      nav_managers: 'Para gerentes',
      nav_blog: 'Blog',
      nav_login: 'Iniciar sesión',
      nav_cta: 'Empieza gratis',

      home_hero: 'El buen servicio<br>no debería ser raro.',
      home_hero_sub: 'ServeMaster Academy forma a profesionales de la hostelería con juego de rol IA, práctica de voz y 12 módulos expertos — en inglés, francés y español.',
      home_free_strip: 'Prueba gratuita de 14 días &bull; Sin tarjeta de crédito &bull; Cancela cuando quieras',
      home_features_h: 'Todo lo que necesita un gran mesero',
      home_ai_h: 'Juego de rol con IA',
      home_ai_p: 'Practica escenarios difíciles — quejas sobre el vino, preguntas de alergias, ventas adicionales — con un comensal IA que responde como una persona real.',
      home_voice_h: 'Práctica de voz',
      home_voice_p: 'Desarrolla confianza hablando las palabras correctas con retroalimentación de pronunciación y fraseología impulsada por Whisper.',
      home_gamification_h: 'Gamificación',
      home_gamification_p: 'Gana insignias, construye rachas diarias y sube en el marcador. El aprendizaje es más efectivo cuando parece un juego.',
      home_cert_h: 'Certificado',
      home_cert_p: 'Completa los 12 módulos y obtén un certificado de ServeMaster Academy para mostrar en tu CV o perfil de empleado.',
      home_testimonials_h: 'Con la confianza de meseros y restaurantes en toda América del Norte',
      home_blog_h: 'Consejos y recursos para meseros',
      home_newsletter_h: 'Consejos mensuales para meseros',
      home_newsletter_p: 'Sin spam. Solo consejos prácticos de Kirk — enviados una vez al mes.',
      home_newsletter_btn: 'Suscribirse',
      home_trial_cta_h: 'Comienza tu prueba gratuita hoy',
      home_trial_cta_p: 'Únete a miles de profesionales de la hostelería que ya se forman con ServeMaster Academy.',
      home_trial_cta_btn: 'Empieza gratis',

      about_h1: 'Por qué existe ServeMaster Academy',
      about_founding_h: 'La historia fundadora',
      about_values_h: 'Nuestros valores',
      about_trilingual_h: 'Trilingüe EN / FR / ES',
      about_trilingual_p: 'Diseñado desde el primer día para el mercado hotelero multilingüe de América del Norte. Cada módulo, término y escenario está disponible en inglés, francés y español.',

      features_h1: 'Todas las herramientas que necesita un mesero profesional',
      features_sub: '12 módulos interactivos, juego de rol IA, práctica de voz, gamificación y un certificado — todo en una plataforma.',
      features_glossary_label: 'Trilingüe EN/FR/ES',

      pricing_h1: 'Invierte en tu mejor personal',
      pricing_sub: 'Prueba gratuita de 14 días en cada plan. Sin tarjeta de crédito para comenzar.',

      contact_h1: 'Ponte en contacto',
      contact_sub: '¿Preguntas sobre la plataforma, alianzas o precios empresariales? Nos encantaría escucharte.',

      managers_h1: 'Capacita a todo tu equipo',
      managers_sub: 'ServeMaster Academy da a los propietarios y gerentes de restaurantes las herramientas para construir un equipo de sala consistentemente excelente.',

      login_h: 'Bienvenido de nuevo',
      login_btn: 'Iniciar sesión',
      login_google: 'Continuar con Google',
      login_no_acct: '¿No tienes una cuenta?',
      login_signup_link: 'Comenzar prueba gratuita',

      signup_h: 'Comienza tu prueba gratuita',
      signup_btn: 'Crear cuenta',
      signup_google: 'Registrarse con Google',
      signup_has_acct: '¿Ya tienes una cuenta?',
      signup_login_link: 'Iniciar sesión',

      trial_banner_pre: 'Te quedan',
      trial_banner_post: 'días en tu prueba gratuita',
      upgrade_now: 'Mejora tu plan para mantener el acceso',
      footer_tagline: 'Formación profesional en hostelería para meseros serios.',
      terms_h1: 'Términos de servicio',
      privacy_h1: 'Política de privacidad',
      blog_h1: 'Consejos y recursos para meseros',
      blog_sub: 'Consejos prácticos de Kirk Adamson — aficionado a la alta cocina y fundador de ServeMaster Academy.',
    }
  };

  var NAV_HREF_MAP = {
    '/': 'nav_home',
    '/about': 'nav_about',
    '/features': 'nav_features',
    '/pricing': 'nav_pricing',
    '/contact': 'nav_contact',
    '/managers': 'nav_managers',
    '/blog': 'nav_blog',
    '/login': 'nav_login',
    '/signup': 'nav_cta'
  };

  function getCurrentLang() {
    return localStorage.getItem(LANG_KEY) || 'en';
  }

  function applyLang(lang) {
    var t = T[lang];
    if (!t) return;

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (t[key] !== undefined) el.textContent = t[key];
    });

    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-html');
      if (t[key] !== undefined) el.innerHTML = t[key];
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-placeholder');
      if (t[key] !== undefined) el.placeholder = t[key];
    });

    document.querySelectorAll('nav a').forEach(function (a) {
      try {
        var path = new URL(a.href, window.location.origin).pathname;
        var key = NAV_HREF_MAP[path];
        if (key && t[key] !== undefined) a.textContent = t[key];
      } catch (e) {}
    });

    document.documentElement.lang = lang;

    var btn = document.getElementById('lang-btn');
    if (btn) btn.textContent = lang.toUpperCase();

    var btns = document.querySelectorAll('[data-lang-option]');
    btns.forEach(function (b) {
      var active = b.getAttribute('data-lang-option') === lang;
      b.classList.toggle('text-amber-400', active);
      b.classList.toggle('font-bold', active);
    });
  }

  function setLang(lang) {
    if (LANGS.indexOf(lang) === -1) return;
    localStorage.setItem(LANG_KEY, lang);
    applyLang(lang);
    var menu = document.getElementById('lang-menu');
    if (menu) menu.classList.add('hidden');
  }

  function toggleLangMenu() {
    var menu = document.getElementById('lang-menu');
    if (menu) menu.classList.toggle('hidden');
  }

  document.addEventListener('click', function (e) {
    var wrapper = document.getElementById('lang-selector');
    var menu = document.getElementById('lang-menu');
    if (wrapper && menu && !wrapper.contains(e.target)) {
      menu.classList.add('hidden');
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    applyLang(getCurrentLang());
  });

  window.setLang = setLang;
  window.toggleLangMenu = toggleLangMenu;
})();
