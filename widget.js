/*!
 * OAB Honorários Widget v1.0.0
 * https://github.com/SEU_USUARIO/oab-honorarios-widget
 *
 * Embedde em qualquer página com:
 * <script src="https://SEU_USUARIO.github.io/oab-honorarios-widget/widget.js"
 *   data-api-key="sk-ant-..."
 * ></script>
 */
(function () {
  'use strict';

  // ─── Configuração via atributos do <script> ───────────────────────────────
  const scriptTag = document.currentScript || (function () {
    const scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  const CONFIG = {
    apiKey:    scriptTag.getAttribute('data-api-key') || '',
    theme:     scriptTag.getAttribute('data-theme') || 'navy',
    position:  scriptTag.getAttribute('data-position') || 'bottom-right',
    title:     scriptTag.getAttribute('data-title') || 'Assistente de Honorários',
    subtitle:  scriptTag.getAttribute('data-subtitle') || 'Tabela OAB • IA',
    proxyUrl:  scriptTag.getAttribute('data-proxy-url') || '',   // futuro: URL do proxy
    selector:  scriptTag.getAttribute('data-selector') || 'body', // seletor CSS do conteúdo
    lang:      scriptTag.getAttribute('data-lang') || 'pt-BR',
  };

  // ─── Evitar inicialização dupla ───────────────────────────────────────────
  if (window.__oabWidgetLoaded) return;
  window.__oabWidgetLoaded = true;

  // ─────────────────────────────────────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────────────────────────────────────
  function init() {
    injectStyles();
    injectHTML();
    bindEvents();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // EXTRAÇÃO DE CONTEÚDO DA PÁGINA
  // Lê o texto visível do seletor configurado, filtrando ruído (nav, footer…)
  // ─────────────────────────────────────────────────────────────────────────
  function extractPageContent() {
    const root = document.querySelector(CONFIG.selector) || document.body;

    // Clona para não modificar o DOM real
    const clone = root.cloneNode(true);

    // Remove elementos que não contêm conteúdo útil
    const NOISE_SELECTORS = [
      'script', 'style', 'noscript', 'iframe',
      'nav', 'header', 'footer',
      '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
      '.widget-oab-root',            // o próprio widget
      '[aria-hidden="true"]',
    ];
    NOISE_SELECTORS.forEach(sel => {
      clone.querySelectorAll(sel).forEach(el => el.remove());
    });

    // Texto limpo: colapsa espaços/quebras de linha excessivas
    let text = (clone.innerText || clone.textContent || '').trim();
    text = text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ');

    // Limita a ~12.000 chars para não explodir o contexto
    if (text.length > 12000) {
      text = text.slice(0, 12000) + '\n\n[... conteúdo truncado ...]';
    }
    return text;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // API CLAUDE
  // ─────────────────────────────────────────────────────────────────────────
  async function askAI(userMessage, pageContent) {
    const endpoint = CONFIG.proxyUrl || 'https://api.openai.com/v1/chat/completions';

    const systemPrompt = `Você é um assistente jurídico especializado em honorários advocatícios.

O CONTEÚDO ATUAL DA PÁGINA é:
---
${pageContent}
---

Seu papel:
- Interpretar o serviço jurídico descrito pelo advogado
- Localizar o honorário correspondente no conteúdo acima
- Responder de forma clara, direta e em português

Regras:
1. Baseie-se APENAS no conteúdo da página fornecido. Não invente valores.
2. Se encontrar mais de um honorário relevante, liste todos.
3. Se não encontrar, diga claramente e sugira onde o advogado pode buscar.
4. Seja conciso: máximo 3 parágrafos curtos.
5. Ao final, inclua SEMPRE este bloco (mesmo se não encontrar):

<oab_result>
{
  "found": true,
  "section": "Nome da seção/área do direito encontrada",
  "items": [
    { "label": "Nome do serviço", "value": "Valor/percentual do honorário" }
  ],
  "scrollKeyword": "palavra-chave para localizar na página"
}
</oab_result>

Se não encontrado: { "found": false, "section": "", "items": [], "scrollKeyword": "" }`;

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.apiKey}`,
    };

    const body = JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 1000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });

    const response = await fetch(endpoint, { method: 'POST', headers, body });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content || '';

    // Extrai bloco de resultado estruturado
    const match = raw.match(/<oab_result>([\s\S]*?)<\/oab_result>/);
    let result = null;
    if (match) {
      try { result = JSON.parse(match[1].trim()); } catch (_) {}
    }

    const displayText = raw.replace(/<oab_result>[\s\S]*?<\/oab_result>/g, '').trim();
    return { displayText, result };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCROLL INTELIGENTE
  // Tenta localizar o elemento da página usando a keyword retornada pela IA
  // ─────────────────────────────────────────────────────────────────────────
  function smartScroll(keyword) {
    if (!keyword) return;

    const kw = keyword.toLowerCase();
    const candidates = Array.from(document.querySelectorAll(
      'h1,h2,h3,h4,h5,h6,td,th,li,p,dt,dd,span,div'
    ));

    const found = candidates.find(el => {
      const t = (el.textContent || '').toLowerCase();
      return t.includes(kw) && t.length < 200;
    });

    if (found) {
      found.scrollIntoView({ behavior: 'smooth', block: 'center' });
      highlightElement(found);
    }
  }

  function highlightElement(el) {
    const original = el.style.cssText;
    el.style.transition = 'background 0.3s';
    el.style.background = 'rgba(200,149,42,0.35)';
    el.style.borderRadius = '4px';
    setTimeout(() => {
      el.style.background = 'rgba(200,149,42,0.10)';
      setTimeout(() => { el.style.cssText = original; }, 2000);
    }, 1200);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ESTADO DO CHAT
  // ─────────────────────────────────────────────────────────────────────────
  let isOpen = false;
  let isLoading = false;
  let firstMessage = true;

  const SUGGESTIONS = [
    'Divórcio consensual',
    'Aposentadoria por invalidez',
    'Reclamação trabalhista',
    'Elaboração de contrato',
    'Habeas corpus',
    'Inventário e partilha',
  ];

  function getTime() {
    return new Date().toLocaleTimeString(CONFIG.lang, { hour: '2-digit', minute: '2-digit' });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BIND DE EVENTOS
  // ─────────────────────────────────────────────────────────────────────────
  function bindEvents() {
    const root      = document.getElementById('__oab_root');
    const toggle    = root.querySelector('.oab-toggle');
    const panel     = root.querySelector('.oab-panel');
    const input     = root.querySelector('.oab-input');
    const sendBtn   = root.querySelector('.oab-send');

    toggle.addEventListener('click', () => {
      isOpen = !isOpen;
      panel.classList.toggle('oab-open', isOpen);
      toggle.classList.toggle('oab-btn-open', isOpen);
      if (isOpen) setTimeout(() => input.focus(), 260);
    });

    sendBtn.addEventListener('click', handleSend);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 88) + 'px';
    });

    // Chips de sugestão
    root.querySelectorAll('.oab-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        input.value = chip.textContent;
        handleSend();
      });
    });
  }

  async function handleSend() {
    const root    = document.getElementById('__oab_root');
    const input   = root.querySelector('.oab-input');
    const sendBtn = root.querySelector('.oab-send');
    const sugg    = root.querySelector('.oab-suggestions-wrap');
    const msgs    = root.querySelector('.oab-messages');

    const text = input.value.trim();
    if (!text || isLoading) return;

    // Esconde sugestões na primeira mensagem
    if (firstMessage) { sugg.style.display = 'none'; firstMessage = false; }

    // Mensagem do usuário
    appendMsg(msgs, text, 'user');
    input.value = '';
    input.style.height = 'auto';

    // Loading
    isLoading = true;
    sendBtn.disabled = true;
    const typingEl = appendTyping(msgs);

    try {
      const pageContent = extractPageContent();
      const { displayText, result } = await askAI(text, pageContent);

      typingEl.remove();
      appendMsg(msgs, displayText, 'bot', result);

      if (result?.found && result.scrollKeyword) {
        setTimeout(() => smartScroll(result.scrollKeyword), 700);
      }
    } catch (err) {
      typingEl.remove();
      appendMsg(msgs, `⚠️ Erro: ${err.message}`, 'bot');
    } finally {
      isLoading = false;
      sendBtn.disabled = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS DE DOM
  // ─────────────────────────────────────────────────────────────────────────
  function appendMsg(container, text, type, result) {
    const wrap = document.createElement('div');
    wrap.className = `oab-msg oab-msg-${type}`;

    const bubble = document.createElement('div');
    bubble.className = 'oab-bubble';
    bubble.innerHTML = text.replace(/\n/g, '<br>');
    wrap.appendChild(bubble);

    if (result?.found && result.items?.length) {
      const box = document.createElement('div');
      box.className = 'oab-result-box';
      box.innerHTML = `
        <div class="oab-result-label">📋 Honorários encontrados</div>
        ${result.items.map(i => `
          <div class="oab-result-row">
            <span>${i.label}</span>
            <span>${i.value}</span>
          </div>`).join('')}
        <div class="oab-scroll-cta" data-kw="${result.scrollKeyword || ''}">
          ↓ Localizar na página
        </div>`;
      box.querySelector('.oab-scroll-cta').addEventListener('click', e => {
        smartScroll(e.currentTarget.dataset.kw);
      });
      wrap.appendChild(box);
    }

    const time = document.createElement('span');
    time.className = 'oab-time';
    time.textContent = getTime();
    wrap.appendChild(time);

    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
    return wrap;
  }

  function appendTyping(container) {
    const wrap = document.createElement('div');
    wrap.className = 'oab-msg oab-msg-bot';
    wrap.innerHTML = `<div class="oab-typing"><span></span><span></span><span></span></div>`;
    container.appendChild(wrap);
    container.scrollTop = container.scrollHeight;
    return wrap;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INJEÇÃO DE HTML
  // ─────────────────────────────────────────────────────────────────────────
  function injectHTML() {
    const pos = CONFIG.position === 'bottom-left'
      ? 'left:24px;right:auto;'
      : 'right:24px;';

    const root = document.createElement('div');
    root.id = '__oab_root';
    root.className = 'widget-oab-root';
    root.style.cssText = `position:fixed;bottom:24px;${pos}z-index:2147483647;font-family:'DM Sans',system-ui,sans-serif;`;

    root.innerHTML = `
      <div class="oab-panel">
        <div class="oab-header">
          <div class="oab-header-shield">OAB</div>
          <div class="oab-header-info">
            <strong>${CONFIG.title}</strong>
            <span>${CONFIG.subtitle}</span>
          </div>
          <div class="oab-status"><div class="oab-dot"></div>online</div>
        </div>

        <div class="oab-messages">
          <div class="oab-msg oab-msg-bot">
            <div class="oab-bubble">
              Olá! Me diga qual serviço jurídico foi prestado e vou localizar os honorários correspondentes nesta página.
            </div>
            <span class="oab-time">${getTime()}</span>
          </div>
        </div>

        <div class="oab-suggestions-wrap">
          <div class="oab-suggestions">
            ${SUGGESTIONS.map(s => `<div class="oab-chip">${s}</div>`).join('')}
          </div>
        </div>

        <div class="oab-input-row">
          <textarea class="oab-input" placeholder="Ex: fiz um divórcio consensual…" rows="1"></textarea>
          <button class="oab-send" aria-label="Enviar">
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
        <div class="oab-footer">Assistente IA · OAB · v11</div>
      </div>

      <button class="oab-toggle" aria-label="Abrir assistente de honorários">
        <svg class="oab-icon-open" viewBox="0 0 24 24" fill="currentColor" width="26" height="26"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>
        <svg class="oab-icon-close" viewBox="0 0 24 24" fill="currentColor" width="24" height="24" style="display:none"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button>`;

    document.body.appendChild(root);

    // Atualiza ícone do toggle
    const toggle = root.querySelector('.oab-toggle');
    const panel  = root.querySelector('.oab-panel');
    const btnObs = new MutationObserver(() => {
      const open = panel.classList.contains('oab-open');
      root.querySelector('.oab-icon-open').style.display  = open ? 'none'  : 'block';
      root.querySelector('.oab-icon-close').style.display = open ? 'block' : 'none';
    });
    btnObs.observe(panel, { attributes: true, attributeFilter: ['class'] });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INJEÇÃO DE CSS  (tudo scoped com .widget-oab-root ou #__oab_root)
  // ─────────────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('__oab_styles')) return;

    // Carrega DM Sans do Google Fonts
    const gf = document.createElement('link');
    gf.rel  = 'stylesheet';
    gf.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&display=swap';
    document.head.appendChild(gf);

    const style = document.createElement('style');
    style.id = '__oab_styles';
    style.textContent = `
/* ── reset blindado ── */
#__oab_root *{box-sizing:border-box !important;margin:0 !important;padding:0 !important}
.oab-panel,.oab-panel *{box-sizing:border-box !important}

/* ── tokens Jusfy ── */
#__oab_root{
  --j-primary:#49b086;
  --j-dark:#3a8a6a;
  --j-darker:#2d6e54;
  --j-light:#eef8f4;
  --j-gold:#C8952A;
  --c-surface:#F7F9F8;
  --c-border:#E0EDE8;
  --c-text:#1A2A25;
  --c-muted:#7A9490;
  --c-white:#FFFFFF;
  --c-ok:#166534;
  --c-ok-bg:#F0FDF4;
  --c-ok-border:#BBF7D0;
  --radius-panel:12px;
  --radius-msg:14px;
  --shadow-panel:0 20px 60px rgba(0,0,0,.18),0 6px 20px rgba(0,0,0,.10);
  --shadow-el:0 1px 6px rgba(0,0,0,.07);
}

/* ── painel ── */
.oab-panel{
  position:absolute;bottom:72px;right:0;
  width:420px;max-width:calc(100vw - 32px);
  background:var(--c-white);
  border-radius:var(--radius-panel);
  box-shadow:var(--shadow-panel);
  overflow:hidden;isolation:isolate;
  display:flex;flex-direction:column;
  opacity:0;transform:translateY(14px) scale(.97);
  pointer-events:none;transition:opacity .22s ease,transform .22s ease;
  --oab-spacing-x:24px;
}
.oab-panel.oab-open{opacity:1;transform:none;pointer-events:all}

/* ── header ── */
.oab-header{
  background:linear-gradient(135deg,var(--j-darker) 0%,var(--j-primary) 100%) !important;
  padding:22px 24px !important;
  display:flex !important;align-items:center !important;gap:14px !important;flex-shrink:0 !important
}
.oab-header-shield{
  width:44px;height:44px;background:var(--j-gold);
  border-radius:50%;display:flex;
  align-items:center;justify-content:center;
  font-size:13px;font-weight:700;color:#fff;flex-shrink:0;
  font-family:'DM Sans',system-ui,sans-serif;letter-spacing:.5px;
  box-shadow:0 2px 8px rgba(0,0,0,.20),0 0 0 3px rgba(255,255,255,.2)
}
.oab-header-info{display:flex;flex-direction:column;gap:3px;min-width:0}
.oab-header-info strong{
  font-size:15px;font-weight:600;color:#fff;
  letter-spacing:-.1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis
}
.oab-header-info span{font-size:12px;color:rgba(255,255,255,.6)}
.oab-status{
  margin-left:auto;flex-shrink:0;
  display:flex;align-items:center;gap:6px;
  font-size:11.5px;color:rgba(255,255,255,.65)
}
.oab-dot{
  width:8px;height:8px;background:#86efac;
  border-radius:50%;flex-shrink:0;
  animation:oab-pulse 2s ease-in-out infinite
}
@keyframes oab-pulse{0%,100%{opacity:1}50%{opacity:.35}}

/* ── mensagens ── */
.oab-messages{
  overflow-y:auto !important;padding:24px 24px 12px !important;
  display:flex !important;flex-direction:column !important;gap:12px !important;
  background:#fff !important;
  min-height:180px;max-height:300px;flex:1
}
.oab-messages::-webkit-scrollbar{width:3px}
.oab-messages::-webkit-scrollbar-thumb{background:#c5d9d3;border-radius:4px}
.oab-messages::-webkit-scrollbar-track{background:transparent}

.oab-msg{display:flex;flex-direction:column;gap:4px;max-width:78%;animation:oab-in .2s ease}
@keyframes oab-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.oab-msg-bot{align-self:flex-start}
.oab-msg-user{align-self:flex-end}

.oab-bubble{
  padding:14px 18px !important;line-height:1.6 !important;
  font-size:14px !important;color:#1f2937 !important
}
.oab-msg-bot .oab-bubble{
  background:#f3f4f6 !important;border:none !important;
  border-radius:16px 16px 16px 4px !important
}
.oab-msg-user .oab-bubble{
  background:var(--j-primary) !important;color:#fff !important;
  border-radius:16px 16px 4px 16px !important
}
.oab-time{font-size:10px;color:var(--c-muted);padding:0 4px;display:block}
.oab-msg-user .oab-time{text-align:right}

/* ── resultado ── */
.oab-result-box{
  background:var(--c-ok-bg);border:1px solid var(--c-ok-border);
  border-radius:12px;padding:12px 14px;margin-top:6px
}
.oab-result-label{
  font-size:10px;font-weight:700;text-transform:uppercase;
  letter-spacing:.7px;color:var(--c-ok);margin-bottom:8px
}
.oab-result-row{
  display:flex;justify-content:space-between;align-items:baseline;
  font-size:12.5px;padding:5px 0;
  border-bottom:1px solid rgba(22,101,52,.1)
}
.oab-result-row:last-of-type{border-bottom:none}
.oab-result-row span:first-child{color:var(--c-text);flex:1;padding-right:10px}
.oab-result-row span:last-child{font-weight:700;color:var(--c-ok);white-space:nowrap}
.oab-scroll-cta{
  margin-top:10px;padding-top:8px;
  border-top:1px solid rgba(22,101,52,.12);
  font-size:11.5px;color:var(--c-ok);font-weight:600;
  cursor:pointer;display:flex;align-items:center;gap:4px
}
.oab-scroll-cta:hover{text-decoration:underline}

/* ── typing ── */
.oab-typing{
  display:flex;gap:5px;align-items:center;
  padding:11px 14px;background:var(--c-white);
  border:1px solid var(--c-border);
  border-radius:4px var(--radius-msg) var(--radius-msg) var(--radius-msg);
  width:fit-content;box-shadow:var(--shadow-el)
}
.oab-typing span{
  width:6px;height:6px;background:var(--c-blue);
  border-radius:50%;animation:oab-bounce 1.2s infinite
}
.oab-typing span:nth-child(2){animation-delay:.2s}
.oab-typing span:nth-child(3){animation-delay:.4s}
@keyframes oab-bounce{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-5px);opacity:1}}

/* ── sugestões ── */
.oab-suggestions-wrap{
  position:relative;background:var(--c-white);flex-shrink:0
}
.oab-suggestions{
  display:flex !important;gap:8px !important;
  padding:8px 24px 16px 24px !important;
  overflow-x:auto !important;overflow-y:hidden !important;flex-wrap:nowrap !important;
  scroll-behavior:smooth;scrollbar-width:none;
  -ms-overflow-style:none
}
.oab-suggestions::-webkit-scrollbar{display:none}
.oab-suggestions::after{
  content:'';flex:0 0 1px;
  padding-right:calc(var(--oab-spacing-x) - 8px)
}
.oab-chip{
  padding:10px 16px !important;background:#fff !important;
  border:1px solid #49b086 !important;border-radius:100px !important;
  font-size:13px !important;color:#49b086 !important;font-weight:500 !important;
  cursor:pointer !important;white-space:nowrap !important;flex-shrink:0 !important;
  transition:all .2s ease;
  font-family:'DM Sans',system-ui,sans-serif !important
}
.oab-chip:hover{background:#eef8f4 !important}

/* ── input ── */
.oab-input-row{
  border-top:1px solid #f3f4f6 !important;padding:16px 24px !important;
  display:flex !important;gap:12px !important;align-items:center !important;
  background:#fff !important;flex-shrink:0 !important
}
.oab-input{
  flex:1 !important;border:1px solid #e5e7eb !important;border-radius:24px !important;
  padding:14px 20px !important;font-size:14px !important;
  font-family:'DM Sans',system-ui,sans-serif !important;
  color:#1f2937 !important;background:#f9fafb !important;
  resize:none !important;outline:none !important;line-height:1.45 !important;
  max-height:88px;overflow-y:auto;
  transition:border-color .15s,background .15s
}
.oab-input:focus{border-color:#49b086 !important;background:#fff !important}
.oab-input::placeholder{color:#9ca3af !important}
.oab-send{
  width:40px;height:40px;border-radius:50%;
  background:var(--j-primary);border:none;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  flex-shrink:0;outline:none;color:#fff;
  box-shadow:0 3px 12px rgba(73,176,134,.40);
  transition:background .15s,transform .15s,box-shadow .15s
}
.oab-send:hover{background:var(--j-dark);transform:scale(1.06);box-shadow:0 5px 16px rgba(73,176,134,.45)}
.oab-send:disabled{background:var(--c-border);cursor:not-allowed;transform:none;box-shadow:none}

/* ── footer ── */
.oab-footer{
  padding:8px;text-align:center;font-size:10px;
  color:var(--c-muted);background:var(--c-white);
  border-top:1px solid var(--c-border);flex-shrink:0;letter-spacing:.2px
}

/* ── toggle ── */
.oab-toggle{
  width:56px;height:56px;border-radius:50%;
  background:linear-gradient(145deg,var(--j-darker),var(--j-primary));
  border:none;
  box-shadow:0 8px 24px rgba(73,176,134,.50),0 3px 8px rgba(0,0,0,.12);
  cursor:pointer;outline:none;color:#fff;
  display:flex;align-items:center;justify-content:center;
  margin-left:auto;margin-top:12px;
  transition:transform .2s ease,box-shadow .2s ease
}
.oab-toggle:hover{
  transform:scale(1.08) translateY(-2px);
  box-shadow:0 14px 32px rgba(73,176,134,.55),0 4px 12px rgba(0,0,0,.15)
}
.oab-toggle.oab-btn-open{
  background:linear-gradient(145deg,var(--j-dark),var(--j-primary))
}

/* ── responsivo ── */
@media(max-width:440px){
  .oab-panel{width:calc(100vw - 32px);right:-8px}
}`;

    document.head.appendChild(style);
  }

  // ─── Aguarda DOM estar pronto ─────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
