(function () {
  var meta = document.querySelector('meta[name="blog-category"]');
  if (!meta) return;
  var cat = meta.getAttribute('content');

  var config = {
    'bartending':    { label: 'Barman',          color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
    'server-skills': { label: 'Mesero',           color: '#34d399', bg: 'rgba(52,211,153,0.12)'  },
    'management':    { label: 'Dirección',        color: '#60a5fa', bg: 'rgba(96,165,250,0.12)'  }
  };

  var c = config[cat];
  if (!c) return;

  var h1 = document.querySelector('main h1');
  if (!h1) return;

  var a = document.createElement('a');
  a.href = '/blog?cat=' + encodeURIComponent(cat);
  a.textContent = c.label;
  a.setAttribute('aria-label', 'Ver todos los artículos: ' + c.label);
  a.style.cssText = [
    'display:inline-block',
    'font-size:0.7rem',
    'font-weight:700',
    'text-transform:uppercase',
    'letter-spacing:0.1em',
    'padding:5px 14px',
    'border-radius:9999px',
    'border:1px solid ' + c.color,
    'color:' + c.color,
    'background:' + c.bg,
    'text-decoration:none',
    'margin-bottom:1.1rem',
    'cursor:pointer',
    'transition:opacity 0.15s'
  ].join(';');

  a.addEventListener('mouseover', function () { this.style.opacity = '0.7'; });
  a.addEventListener('mouseout',  function () { this.style.opacity = '1'; });

  h1.parentNode.insertBefore(a, h1);
})();
