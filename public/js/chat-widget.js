(async function () {
  try {
    const cfg = await fetch('/api/chat-config');
    if (!cfg.ok) return;
    const { enabled } = await cfg.json();
    if (!enabled) return;
    initChatWidget();
  } catch (e) {}

  function initChatWidget() {
    const lang = localStorage.getItem('sma-lang') || 'en';
    const i18n = {
      en: { title: 'ServeMaster AI', subtitle: 'Ask anything about our platform', placeholder: 'Type a message…', send: 'Send', greeting: 'Hi! I\'m the ServeMaster AI assistant. Ask me anything about the platform, pricing, or training modules.' },
      fr: { title: 'ServeMaster IA', subtitle: 'Posez n\'importe quelle question', placeholder: 'Écrivez un message…', send: 'Envoyer', greeting: 'Bonjour! Je suis l\'assistant IA de ServeMaster. Posez-moi n\'importe quelle question sur la plateforme, les tarifs ou les modules.' },
      es: { title: 'ServeMaster IA', subtitle: 'Pregunte lo que quiera', placeholder: 'Escribe un mensaje…', send: 'Enviar', greeting: 'Hola! Soy el asistente de IA de ServeMaster. Pregúntame lo que quieras sobre la plataforma, precios o módulos de formación.' }
    };
    const t = i18n[lang] || i18n.en;
    const history = [];
    let open = false;
    let thinking = false;

    const style = document.createElement('style');
    style.textContent = `
      #sma-chat-bubble { position:fixed; bottom:24px; right:24px; z-index:9999; width:56px; height:56px; border-radius:50%; background:linear-gradient(135deg,#f59e0b,#d97706); box-shadow:0 4px 20px rgba(245,158,11,0.4); border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:transform 0.2s,box-shadow 0.2s; }
      #sma-chat-bubble:hover { transform:scale(1.08); box-shadow:0 6px 28px rgba(245,158,11,0.55); }
      #sma-chat-bubble svg { width:26px; height:26px; fill:none; stroke:#09090b; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
      #sma-chat-panel { position:fixed; bottom:92px; right:24px; z-index:9999; width:360px; max-width:calc(100vw - 32px); background:#09090b; border:1px solid #3f3f46; border-radius:20px; box-shadow:0 12px 48px rgba(0,0,0,0.7); display:flex; flex-direction:column; overflow:hidden; transition:opacity 0.2s,transform 0.2s; }
      #sma-chat-panel.sma-hidden { opacity:0; pointer-events:none; transform:translateY(12px); }
      #sma-chat-header { background:#18181b; padding:14px 16px; display:flex; align-items:center; gap:10px; border-bottom:1px solid #27272a; }
      #sma-chat-header .sma-avatar { width:34px; height:34px; border-radius:50%; background:linear-gradient(135deg,#f59e0b,#d97706); display:flex; align-items:center; justify-content:center; font-size:16px; flex-shrink:0; }
      #sma-chat-header .sma-info { flex:1; min-width:0; }
      #sma-chat-header .sma-info strong { display:block; font-size:14px; font-weight:700; color:#fafafa; }
      #sma-chat-header .sma-info span { font-size:11px; color:#71717a; }
      #sma-chat-header .sma-close { background:none; border:none; cursor:pointer; color:#71717a; font-size:20px; line-height:1; padding:2px 4px; border-radius:6px; }
      #sma-chat-header .sma-close:hover { color:#fafafa; background:#27272a; }
      #sma-chat-messages { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:10px; height:320px; scroll-behavior:smooth; }
      #sma-chat-messages::-webkit-scrollbar { width:4px; } #sma-chat-messages::-webkit-scrollbar-track { background:transparent; } #sma-chat-messages::-webkit-scrollbar-thumb { background:#3f3f46; border-radius:2px; }
      .sma-msg { max-width:86%; padding:10px 13px; border-radius:14px; font-size:13.5px; line-height:1.5; word-wrap:break-word; }
      .sma-msg-user { align-self:flex-end; background:#f59e0b; color:#09090b; font-weight:500; border-bottom-right-radius:4px; }
      .sma-msg-bot { align-self:flex-start; background:#27272a; color:#e4e4e7; border-bottom-left-radius:4px; }
      .sma-msg-typing { align-self:flex-start; background:#27272a; color:#71717a; padding:10px 16px; border-radius:14px; border-bottom-left-radius:4px; font-size:20px; letter-spacing:3px; }
      #sma-chat-input-row { display:flex; gap:8px; padding:12px; border-top:1px solid #27272a; background:#18181b; }
      #sma-chat-input { flex:1; background:#27272a; border:1px solid #3f3f46; border-radius:12px; padding:9px 12px; font-size:13px; color:#fafafa; outline:none; resize:none; font-family:inherit; line-height:1.4; transition:border-color 0.15s; }
      #sma-chat-input:focus { border-color:#f59e0b; }
      #sma-chat-input::placeholder { color:#71717a; }
      #sma-chat-send { background:#f59e0b; border:none; border-radius:10px; width:38px; height:38px; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; align-self:flex-end; transition:background 0.15s; }
      #sma-chat-send:hover { background:#d97706; }
      #sma-chat-send svg { width:18px; height:18px; fill:none; stroke:#09090b; stroke-width:2.2; stroke-linecap:round; stroke-linejoin:round; }
      #sma-chat-send:disabled { opacity:0.5; cursor:not-allowed; }
    `;
    document.head.appendChild(style);

    const bubble = document.createElement('button');
    bubble.id = 'sma-chat-bubble';
    bubble.setAttribute('aria-label', 'Open chat');
    bubble.innerHTML = `<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
    document.body.appendChild(bubble);

    const panel = document.createElement('div');
    panel.id = 'sma-chat-panel';
    panel.classList.add('sma-hidden');
    panel.innerHTML = `
      <div id="sma-chat-header">
        <div class="sma-avatar">🤖</div>
        <div class="sma-info"><strong>${t.title}</strong><span>${t.subtitle}</span></div>
        <button class="sma-close" id="sma-chat-close" aria-label="Close chat">✕</button>
      </div>
      <div id="sma-chat-messages"></div>
      <div id="sma-chat-input-row">
        <textarea id="sma-chat-input" rows="1" placeholder="${t.placeholder}"></textarea>
        <button id="sma-chat-send" aria-label="${t.send}">
          <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    `;
    document.body.appendChild(panel);

    const messagesEl = panel.querySelector('#sma-chat-messages');
    const inputEl = panel.querySelector('#sma-chat-input');
    const sendBtn = panel.querySelector('#sma-chat-send');

    function addMessage(role, text) {
      const div = document.createElement('div');
      div.className = 'sma-msg ' + (role === 'user' ? 'sma-msg-user' : 'sma-msg-bot');
      div.textContent = text;
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return div;
    }

    function showTyping() {
      const div = document.createElement('div');
      div.className = 'sma-msg-typing';
      div.id = 'sma-typing';
      div.textContent = '···';
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function removeTyping() {
      const el = document.getElementById('sma-typing');
      if (el) el.remove();
    }

    addMessage('bot', t.greeting);

    async function sendMessage() {
      const msg = inputEl.value.trim();
      if (!msg || thinking) return;
      inputEl.value = '';
      inputEl.style.height = 'auto';
      thinking = true;
      sendBtn.disabled = true;
      addMessage('user', msg);
      showTyping();
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg, history })
        });
        removeTyping();
        if (!res.ok) {
          addMessage('bot', 'Sorry, something went wrong. Please try again.');
        } else {
          const { reply } = await res.json();
          addMessage('bot', reply);
          history.push({ role: 'user', content: msg });
          history.push({ role: 'assistant', content: reply });
          if (history.length > 20) history.splice(0, 2);
        }
      } catch (e) {
        removeTyping();
        addMessage('bot', 'Connection error. Please try again.');
      }
      thinking = false;
      sendBtn.disabled = false;
      inputEl.focus();
    }

    function togglePanel() {
      open = !open;
      if (open) {
        panel.classList.remove('sma-hidden');
        bubble.innerHTML = `<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
        inputEl.focus();
      } else {
        panel.classList.add('sma-hidden');
        bubble.innerHTML = `<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
      }
    }

    bubble.addEventListener('click', togglePanel);
    panel.querySelector('#sma-chat-close').addEventListener('click', togglePanel);
    sendBtn.addEventListener('click', sendMessage);
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    inputEl.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    });
  }
})();
