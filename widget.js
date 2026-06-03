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
    const sugg    = root.querySelector('.oab-suggestions');
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

        <div class="oab-suggestions">
          ${SUGGESTIONS.map(s => `<div class="oab-chip">${s}</div>`).join('')}
        </div>

        <div class="oab-input-row">
          <textarea class="oab-input" placeholder="Ex: fiz um divórcio consensual…" rows="1"></textarea>
          <button class="oab-send" aria-label="Enviar">
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
        <div class="oab-footer">Assistente IA · OAB</div>
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
/* ── reset dentro do widget ── */
#__oab_root *{box-sizing:border-box;margin:0;padding:0}

/* ── variáveis ── */
#__oab_root{
  --w-navy:#003366;
  --w-blue:#0057A8;
  --w-gold:#C8952A;
  --w-light:#F4F7FB;
  --w-border:#D8E3EF;
  --w-text:#1A2A3A;
  --w-muted:#6B7E92;
  --w-white:#FFFFFF;
  --w-ok:#1B6E4F;
  --w-ok-bg:#EAF5EF;
  --w-r:18px;
  --w-rs:10px;
  --w-sh:0 12px 40px rgba(0,51,102,.18),0 3px 10px rgba(0,51,102,.10);
  --w-sh-sm:0 2px 8px rgba(0,51,102,.09);
}

/* ── painel ── */
.oab-panel{
  position:absolute;bottom:76px;right:0;
  width:360px;background:var(--w-white);
  border-radius:var(--w-r);box-shadow:var(--w-sh);
  border:1px solid var(--w-border);overflow:hidden;
  display:flex;flex-direction:column;
  opacity:0;transform:translateY(12px) scale(.96);
  pointer-events:none;transition:opacity .24s,transform .24s;
}
.oab-panel.oab-open{opacity:1;transform:none;pointer-events:all}

/* ── header ── */
.oab-header{
  background:var(--w-navy);padding:14px 16px;
  display:flex;align-items:center;gap:12px;flex-shrink:0
}
.oab-header-shield{
  width:36px;height:36px;background:var(--w-gold);
  border-radius:8px 8px 14px 14px;display:flex;
  align-items:center;justify-content:center;
  font-size:13px;font-weight:700;color:#fff;flex-shrink:0;
  font-family:'DM Sans',system-ui,sans-serif;letter-spacing:.5px;
  box-shadow:0 2px 6px rgba(0,0,0,.2)
}
.oab-header-info{display:flex;flex-direction:column;gap:1px}
.oab-header-info strong{font-size:13.5px;font-weight:600;color:#fff;letter-spacing:-.1px}
.oab-header-info span{font-size:11px;color:rgba(255,255,255,.45)}
.oab-status{margin-left:auto;display:flex;align-items:center;gap:5px;font-size:11px;color:rgba(255,255,255,.45)}
.oab-dot{width:7px;height:7px;background:#4ADE80;border-radius:50%;animation:oab-pulse 2s infinite}
@keyframes oab-pulse{0%,100%{opacity:1}50%{opacity:.3}}

/* ── mensagens ── */
.oab-messages{
  flex:1;overflow-y:auto;padding:16px 14px 12px;
  display:flex;flex-direction:column;gap:10px;
  background:var(--w-light);min-height:220px;max-height:340px
}
.oab-messages::-webkit-scrollbar{width:3px}
.oab-messages::-webkit-scrollbar-thumb{background:var(--w-border);border-radius:2px}

.oab-msg{display:flex;flex-direction:column;gap:4px;max-width:88%;animation:oab-in .18s ease}
@keyframes oab-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
.oab-msg-bot{align-self:flex-start}
.oab-msg-user{align-self:flex-end}

.oab-bubble{
  padding:10px 13px;border-radius:14px;
  font-size:13.5px;line-height:1.55;color:var(--w-text)
}
.oab-msg-bot .oab-bubble{
  background:var(--w-white);border:1px solid var(--w-border);
  border-bottom-left-radius:4px;box-shadow:var(--w-sh-sm)
}
.oab-msg-user .oab-bubble{
  background:var(--w-navy);color:#fff;border-bottom-right-radius:4px
}
.oab-time{font-size:10px;color:var(--w-muted);padding:0 4px}
.oab-msg-user .oab-time{text-align:right}

/* ── resultado estruturado ── */
.oab-result-box{
  background:var(--w-ok-bg);border:1px solid #A7D9C2;
  border-radius:var(--w-rs);padding:11px 13px;margin-top:6px
}
.oab-result-label{
  font-size:10px;font-weight:600;text-transform:uppercase;
  letter-spacing:.6px;color:var(--w-ok);margin-bottom:7px
}
.oab-result-row{
  display:flex;justify-content:space-between;align-items:baseline;
  font-size:12.5px;padding:5px 0;border-bottom:1px solid rgba(27,110,79,.1)
}
.oab-result-row:last-of-type{border-bottom:none}
.oab-result-row span:first-child{color:var(--w-text);flex:1;padding-right:8px}
.oab-result-row span:last-child{font-weight:600;color:var(--w-ok);white-space:nowrap}
.oab-scroll-cta{
  margin-top:9px;padding-top:8px;border-top:1px solid rgba(27,110,79,.15);
  font-size:11.5px;color:var(--w-ok);font-weight:500;cursor:pointer;
  display:flex;align-items:center;gap:4px
}
.oab-scroll-cta:hover{text-decoration:underline}

/* ── typing ── */
.oab-typing{
  display:flex;gap:4px;align-items:center;
  padding:11px 14px;background:var(--w-white);
  border:1px solid var(--w-border);border-radius:14px;
  border-bottom-left-radius:4px;width:fit-content;box-shadow:var(--w-sh-sm)
}
.oab-typing span{
  width:6px;height:6px;background:var(--w-blue);
  border-radius:50%;animation:oab-bounce 1.2s infinite
}
.oab-typing span:nth-child(2){animation-delay:.2s}
.oab-typing span:nth-child(3){animation-delay:.4s}
@keyframes oab-bounce{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-5px);opacity:1}}

/* ── sugestões ── */
.oab-suggestions{
  display:flex;gap:6px;
  padding:10px 14px 12px;background:var(--w-light);
  overflow-x:auto;overflow-y:hidden;flex-wrap:nowrap;
  scrollbar-width:none;
}
.oab-suggestions::-webkit-scrollbar{display:none}
.oab-chip{
  padding:5px 12px;background:var(--w-white);
  border:1px solid var(--w-border);border-radius:20px;
  font-size:12px;color:var(--w-blue);cursor:pointer;
  white-space:nowrap;transition:background .14s,border-color .14s,color .14s;
  font-family:'DM Sans',system-ui,sans-serif;flex-shrink:0
}
.oab-chip:hover{background:var(--w-navy);border-color:var(--w-navy);color:#fff}

/* ── input ── */
.oab-input-row{
  border-top:1px solid var(--w-border);padding:10px 12px;
  display:flex;gap:8px;align-items:flex-end;
  background:var(--w-white);flex-shrink:0
}
.oab-input{
  flex:1;border:1.5px solid var(--w-border);border-radius:22px;
  padding:9px 15px;font-size:13.5px;font-family:'DM Sans',system-ui,sans-serif;
  color:var(--w-text);background:var(--w-light);
  resize:none;outline:none;line-height:1.4;max-height:88px;overflow-y:auto;
  transition:border-color .15s,background .15s
}
.oab-input:focus{border-color:var(--w-blue);background:#fff}
.oab-input::placeholder{color:var(--w-muted)}
.oab-send{
  width:38px;height:38px;border-radius:50%;
  background:var(--w-navy);border:none;cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  flex-shrink:0;transition:background .15s,transform .15s;
  outline:none;color:#fff;box-shadow:0 2px 8px rgba(0,51,102,.25)
}
.oab-send:hover{background:var(--w-blue);transform:scale(1.06)}
.oab-send:disabled{background:var(--w-border);cursor:not-allowed;transform:none;box-shadow:none}

/* ── footer ── */
.oab-footer{
  padding:6px;text-align:center;font-size:10px;
  color:var(--w-muted);background:var(--w-white);
  border-top:1px solid var(--w-border);flex-shrink:0;
  letter-spacing:.2px
}

/* ── botão toggle ── */
.oab-toggle{
  width:54px;height:54px;border-radius:50%;
  background:var(--w-navy);border:none;
  box-shadow:0 0 0 3px var(--w-gold),0 8px 28px rgba(0,51,102,.30);
  cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  transition:transform .22s,box-shadow .22s,background .18s;
  outline:none;margin-left:auto;color:#fff;
  margin-top:12px
}
.oab-toggle:hover{
  transform:scale(1.08);
  box-shadow:0 0 0 3px var(--w-gold),0 12px 36px rgba(0,51,102,.38)
}
.oab-toggle.oab-btn-open{background:var(--w-blue)}

/* ── responsivo ── */
@media(max-width:420px){
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
