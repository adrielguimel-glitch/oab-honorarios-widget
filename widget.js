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
    apiKey:     scriptTag.getAttribute('data-api-key') || '',
    position:   scriptTag.getAttribute('data-position') || 'bottom-right',
    title:      scriptTag.getAttribute('data-title') || 'Assistente de Honorários',
    subtitle:   scriptTag.getAttribute('data-subtitle') || 'Tabela OAB • IA',
    proxyUrl:   scriptTag.getAttribute('data-proxy-url') || '',
    contentUrl: scriptTag.getAttribute('data-content-url') || '',
    leadsUrl:   scriptTag.getAttribute('data-leads-url') || '',
    selector:   scriptTag.getAttribute('data-selector') || 'body',
    lang:       scriptTag.getAttribute('data-lang') || 'pt-BR',
    mock:       scriptTag.getAttribute('data-mock') === 'true',
    height:     parseInt(scriptTag.getAttribute('data-height') || '480', 10),
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
  // Converte qualquer JSON de honorários em texto legível para a IA
  function jsonToReadableText(obj, depth) {
    depth = depth || 0;
    if (obj === null || obj === undefined) return '';
    if (typeof obj === 'string') return obj.trim();
    if (typeof obj === 'number') return String(obj);
    if (Array.isArray(obj)) {
      return obj.map(function(i){ return jsonToReadableText(i, depth); }).filter(Boolean).join('\n');
    }
    if (typeof obj === 'object') {
      var lines = [];
      var TITLE_KEYS  = ['titulo','title','nome','name','descricao','description','indicativo'];
      var VALUE_KEYS  = ['valor','value','preco','price','percentual','percent','porcentagem','minimo','maximo'];
      var titleKey = TITLE_KEYS.find(function(k){ return obj[k] && typeof obj[k]==='string'; });
      var arrKey   = Object.keys(obj).find(function(k){ return Array.isArray(obj[k]) && obj[k].length; });

      if (titleKey) lines.push((depth === 0 ? '## ' : '') + obj[titleKey]);

      var vals = VALUE_KEYS.filter(function(k){ return obj[k]; }).map(function(k){ return String(obj[k]).trim(); });
      if (vals.length) lines.push(vals.join(' | '));

      if (arrKey) lines.push(jsonToReadableText(obj[arrKey], depth + 1));
      else if (!titleKey) {
        var flat = Object.values(obj)
          .filter(function(v){ return typeof v==='string'||typeof v==='number'; })
          .map(function(v){ return String(v).trim(); }).filter(Boolean);
        if (flat.length) lines.push(flat.join(' | '));
      }
      return lines.filter(Boolean).join('\n');
    }
    return '';
  }

  // Cache do conteúdo carregado — só busca uma vez por sessão
  let _contentCache = null;

  async function loadContent() {
    if (_contentCache) return _contentCache;
    const res  = await fetch(CONFIG.contentUrl, { cache: 'no-store' });
    const json = await res.json();
    // Se o JSON já tem campo "content" (arquivo data/*.json), usa direto
    // Senão, converte JSON bruto de API
    _contentCache = json.content
      ? json.content
      : jsonToReadableText(json, 0).replace(/\n{3,}/g, '\n\n').trim();
    return _contentCache;
  }

  // Filtra seções relevantes para a query — evita mandar 87K chars para a IA
  function filterRelevantSections(fullText, query) {
    const sections = fullText.split(/\n(?=## )/);
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);

    // Pontua cada seção por quantas palavras da query ela contém
    const scored = sections.map(sec => {
      const low = sec.toLowerCase();
      const score = words.reduce((s, w) => s + (low.includes(w) ? 1 : 0), 0);
      return { sec, score };
    });

    // Pega as 3 seções com maior pontuação (pelo menos 1 match)
    const top = scored
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(x => x.sec);

    // Se nenhuma seção bateu, usa as 2 primeiras como fallback
    const result = top.length ? top : sections.slice(0, 2);
    return result.join('\n\n').slice(0, 12000);
  }

  async function fetchContentFromApi(query) {
    const full = await loadContent();
    return filterRelevantSections(full, query || '');
  }

  function extractPageContent() {
    const root = document.querySelector(CONFIG.selector) || document.body;

    const BLOCK_TAGS = new Set(['div','p','li','h1','h2','h3','h4','h5','h6',
      'section','article','tr','td','th','dt','dd','blockquote','label','span']);
    const SKIP_TAGS  = new Set(['script','style','noscript','iframe','svg','path']);

    const lines = [];
    let buf = [];

    const flush = () => {
      const t = buf.join(' ').replace(/\s+/g,' ').trim();
      if (t) lines.push(t);
      buf = [];
    };

    const walk = (node) => {
      if (node.id === '__oab_root') return;
      if (node.nodeType === 3) {
        const t = node.textContent.replace(/\s+/g,' ').trim();
        if (t) buf.push(t);
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.tagName.toLowerCase();
      if (SKIP_TAGS.has(tag)) return;

      const isBlock = BLOCK_TAGS.has(tag);
      if (isBlock) flush();
      node.childNodes.forEach(walk);
      if (isBlock) flush();
    };

    walk(root);
    flush();

    let text = lines.filter(Boolean).join('\n').replace(/\n{3,}/g,'\n\n').trim();
    if (text.length > 20000) text = text.slice(0, 20000) + '\n\n[... truncado ...]';
    return text;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MODO MOCK — respostas simuladas para demonstração (data-mock="true")
  // ─────────────────────────────────────────────────────────────────────────
  const MOCK_RESPONSES = [
    {
      keywords: ['divórcio', 'divorcio', 'consensual', 'separação'],
      text: 'Para o **divórcio consensual**, a tabela OAB/RS indica honorários de **5 a 15 UFIRs por parte**. Sendo um procedimento extrajudicial ou judicial simplificado, o valor tende ao piso da tabela quando há acordo total entre as partes.',
      result: { found: true, section: 'Direito Civil', items: [{ label: 'Divórcio consensual', value: '5 a 15 UFIRs por parte' }, { label: 'Divórcio litigioso', value: '10 a 20 UFIRs por parte' }], scrollKeyword: 'Divórcio consensual' },
    },
    {
      keywords: ['aposentadoria', 'invalidez', 'previdenciário', 'inss', 'benefício'],
      text: 'Para **aposentadoria por invalidez**, o honorário sugerido pela OAB/RS é de **20% a 30% dos valores atrasados** (retroativos). Esse percentual se aplica também a outros benefícios previdenciários como auxílio-doença e BPC/LOAS.',
      result: { found: true, section: 'Direito Previdenciário', items: [{ label: 'Aposentadoria por invalidez', value: '20% a 30% dos atrasados' }, { label: 'Auxílio por incapacidade', value: '20% a 30% dos atrasados' }], scrollKeyword: 'Aposentadoria por invalidez' },
    },
    {
      keywords: ['trabalhista', 'reclamação', 'clt', 'demissão', 'rescisão', 'trabalho'],
      text: 'Para **reclamação trabalhista simples**, a tabela prevê honorários de **20% a 30% do valor da causa**. Caso envolva recurso ordinário, acrescenta-se 10% a 20% adicional por instância.',
      result: { found: true, section: 'Direito do Trabalho', items: [{ label: 'Reclamação trabalhista simples', value: '20% a 30% do valor da causa' }, { label: 'Recurso ordinário', value: '10% a 20% do valor da causa' }], scrollKeyword: 'Reclamação trabalhista' },
    },
    {
      keywords: ['contrato', 'elaboração', 'minutar', 'redigir', 'contratual'],
      text: 'Para **elaboração de contrato**, os honorários variam conforme a complexidade: contratos simples ficam entre **R$ 500,00 e R$ 1.500,00**, enquanto contratos complexos vão de **R$ 1.500,00 a R$ 5.000,00**.',
      result: { found: true, section: 'Consultoria e Contratos', items: [{ label: 'Contrato simples', value: 'R$ 500,00 a R$ 1.500,00' }, { label: 'Contrato complexo', value: 'R$ 1.500,00 a R$ 5.000,00' }], scrollKeyword: 'Elaboração de contrato' },
    },
    {
      keywords: ['habeas corpus', 'hc', 'prisão', 'liberdade', 'criminal', 'penal'],
      text: 'Para **habeas corpus**, a tabela OAB/RS prevê honorários de **15 a 30 UFIRs**. Para defesa completa em processo criminal na fase processual, o valor sobe para **20 a 60 UFIRs**.',
      result: { found: true, section: 'Direito Criminal', items: [{ label: 'Habeas corpus', value: '15 a 30 UFIRs' }, { label: 'Defesa criminal — fase processual', value: '20 a 60 UFIRs' }], scrollKeyword: 'Habeas corpus' },
    },
    {
      keywords: ['inventário', 'partilha', 'espólio', 'herança', 'sucessão'],
      text: 'Para **inventário e partilha**, os honorários são calculados sobre o monte-mor (total do patrimônio): **4% a 6%**. Em inventários de menor complexidade ou por escritura pública, aplica-se o piso da tabela.',
      result: { found: true, section: 'Direito Civil', items: [{ label: 'Inventário e partilha', value: '4% a 6% do monte-mor' }], scrollKeyword: 'Inventário e partilha' },
    },
  ];

  function mockAI(userMessage) {
    const msg = userMessage.toLowerCase();
    const match = MOCK_RESPONSES.find(r => r.keywords.some(k => msg.includes(k)));
    if (match) {
      return { displayText: match.text, result: match.result };
    }
    return {
      displayText: 'Não encontrei um honorário específico para esse serviço na tabela. Tente descrever com mais detalhes ou consulte diretamente a tabela OAB/RS na página.',
      result: { found: false, section: '', items: [], scrollKeyword: '' },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // API — suporta proxy (Anthropic/Claude) e modo direto (OpenAI)
  // ─────────────────────────────────────────────────────────────────────────
  async function askAI(userMessage, pageContent) {
    const systemPrompt = `Você é um assistente jurídico amigável que ajuda advogados com honorários advocatícios.

TABELA DE HONORÁRIOS (use como referência):
---
${pageContent}
---

Você pode:
- Consultar valores de honorários na tabela acima
- Fazer cálculos (ex: "quanto fica 30% de R$ 50.000?")
- Conversar naturalmente sobre dúvidas do advogado
- Dar orientações práticas sobre cobrança
- Responder perguntas de acompanhamento da conversa anterior

Regras:
1. Quando encontrar honorários na tabela: escreva UMA frase curtíssima de contexto (ex: "Encontrei os honorários:") e coloque os valores SOMENTE no bloco oab_result. JAMAIS escreva valores (R$, %) no texto da resposta.
2. Quando for cálculo ou conversa: responda em texto livre, use "found: false" no bloco.
3. Seja natural, direto e prestativo. Pode usar um pouco de contexto da conversa para responder perguntas de acompanhamento.
4. Nunca invente valores que não estão na tabela.
5. Ao final SEMPRE inclua o bloco (found:false se for só conversa):

<oab_result>
{
  "found": true,
  "section": "Área do direito",
  "items": [{ "label": "Serviço", "value": "Valor" }],
  "scrollKeyword": "palavra para localizar na página"
}
</oab_result>`;

    let endpoint, headers, body, getRawText;

    if (CONFIG.proxyUrl) {
      // Modo proxy → Anthropic/Claude (chave fica no servidor)
      endpoint = CONFIG.proxyUrl;
      headers = { 'Content-Type': 'application/json' };
      body = JSON.stringify({
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });
      getRawText = (data) => data?.content?.[0]?.text || '';
    } else {
      // Modo direto → OpenAI (chave no data-api-key)
      endpoint = 'https://api.openai.com/v1/chat/completions';
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.apiKey}`,
      };
      body = JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      });
      getRawText = (data) => data?.choices?.[0]?.message?.content || '';
    }

    const response = await fetch(endpoint, { method: 'POST', headers, body });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || err?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const raw = getRawText(data);

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

    const kw    = keyword.toLowerCase().trim();
    const words = kw.split(/\s+/).filter(w => w.length > 3);

    const isWidget = el => !!el.closest('#__oab_root');
    const skip     = new Set(['script','style','noscript','svg','path','head']);

    function scoreEl(el) {
      if (isWidget(el)) return 0;
      if (skip.has(el.tagName.toLowerCase())) return 0;
      const t = (el.textContent || '').toLowerCase();
      if (!t || t.length > 600) return 0;
      if (t.includes(kw)) return 10 - Math.min(el.children.length, 5);
      if (words.length >= 2) {
        const hits = words.filter(w => t.includes(w)).length;
        if (hits >= Math.ceil(words.length * 0.6)) return hits - Math.min(el.children.length, 5);
      }
      return 0;
    }

    let best = null, bestScore = 0;
    document.querySelectorAll('*').forEach(el => {
      const s = scoreEl(el);
      if (s > bestScore) { bestScore = s; best = el; }
    });

    if (!best) return;

    // Procura acordeão fechado na ancestralidade e clica para abrir
    function openAccordions(el, cb) {
      const path = [];
      let node = el.parentElement;
      while (node && node !== document.body) { path.push(node); node = node.parentElement; }

      const collapsed = path.find(n => {
        const s = window.getComputedStyle(n);
        return s.display === 'none' || s.visibility === 'hidden' ||
               (s.overflow === 'hidden' && n.scrollHeight > n.clientHeight + 5 && n.clientHeight < 10);
      });

      if (collapsed) {
        // Tenta clicar no irmão anterior (header do acordeão) ou no pai
        const trigger = collapsed.previousElementSibling
          || collapsed.parentElement?.querySelector('[role="button"],[class*="title"],[class*="header"],[class*="toggle"],[class*="arrow"],[class*="expand"]');
        if (trigger && !isWidget(trigger)) {
          try { trigger.click(); } catch(_) {}
          setTimeout(cb, 500);
          return;
        }
        collapsed.style.display = 'block';
      }
      cb();
    }

    openAccordions(best, () => {
      best.scrollIntoView({ behavior: 'smooth', block: 'center' });
      highlightElement(best);
    });
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
  let leadCaptured = !!localStorage.getItem('oab_lead_captured');
  let freeUsed     = false; // 1ª interação já foi usada?
  let pendingQuery = '';    // guarda a query enquanto form está aberto
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
    const resetBtn  = root.querySelector('.oab-reset');
    const msgs      = root.querySelector('.oab-messages');
    const suggWrap  = root.querySelector('.oab-suggestions-wrap');
    const dragHandle = root.querySelector('.oab-drag-handle');

    // ── Redimensionamento por drag ────────────────────────────────────────
    let dragStartY = 0, dragStartH = 0;

    dragHandle.addEventListener('mousedown', e => {
      dragStartY = e.clientY;
      dragStartH = panel.getBoundingClientRect().height;
      document.body.style.userSelect = 'none';
      e.preventDefault();

      const onMove = e => {
        const delta = dragStartY - e.clientY; // arrasta pra cima → positivo → maior
        const newH  = Math.min(Math.max(280, dragStartH + delta), window.innerHeight - 110);
        panel.style.setProperty('height', newH + 'px', 'important');
        panel.style.setProperty('max-height', newH + 'px', 'important');
      };
      const onUp = () => {
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // Touch support
    dragHandle.addEventListener('touchstart', e => {
      dragStartY = e.touches[0].clientY;
      dragStartH = panel.getBoundingClientRect().height;
      e.preventDefault();

      const onMove = e => {
        const delta = dragStartY - e.touches[0].clientY;
        const newH  = Math.min(Math.max(280, dragStartH + delta), window.innerHeight - 110);
        panel.style.setProperty('height', newH + 'px', 'important');
        panel.style.setProperty('max-height', newH + 'px', 'important');
      };
      const onEnd = () => {
        dragHandle.removeEventListener('touchmove', onMove);
        dragHandle.removeEventListener('touchend', onEnd);
      };
      dragHandle.addEventListener('touchmove', onMove, { passive: false });
      dragHandle.addEventListener('touchend', onEnd);
    }, { passive: false });

    toggle.addEventListener('click', () => {
      isOpen = !isOpen;
      panel.classList.toggle('oab-open', isOpen);
      toggle.classList.toggle('oab-btn-open', isOpen);
      if (isOpen) setTimeout(() => input.focus(), 260);
    });

    resetBtn.addEventListener('click', () => {
      msgs.innerHTML = `
        <div class="oab-msg oab-msg-bot">
          <div class="oab-bubble">Olá! Me diga qual serviço jurídico foi prestado e vou localizar os honorários correspondentes nesta página.</div>
          <span class="oab-time">${getTime()}</span>
        </div>`;
      suggWrap.style.display = '';
      firstMessage = true;
      input.value = '';
      input.style.height = 'auto';
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

  function showLeadForm(msgs, afterQuery) {
    const card = document.createElement('div');
    card.className = 'oab-lead-card';
    card.innerHTML = `
      <div class="oab-lead-title">Para continuar usando o assistente da <a href="https://jusfy.com.br/" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;font-weight:700">JUSFY</a>, preencha seus dados e aproveite mais!</div>
      <input class="oab-lead-input" type="text"  placeholder="Seu nome completo"  data-f="nome">
      <input class="oab-lead-input" type="email" placeholder="E-mail"              data-f="email">
      <input class="oab-lead-input" type="tel"   placeholder="Telefone / WhatsApp" data-f="tel">
      <button class="oab-lead-btn">Continuar →</button>
      <div class="oab-lead-err" style="display:none;color:#dc2626;font-size:12px;margin-top:4px"></div>`;

    card.querySelector('.oab-lead-btn').addEventListener('click', async () => {
      const nome  = card.querySelector('[data-f="nome"]').value.trim();
      const email = card.querySelector('[data-f="email"]').value.trim();
      const tel   = card.querySelector('[data-f="tel"]').value.trim();
      const err   = card.querySelector('.oab-lead-err');

      if (!nome || !email || !tel) {
        err.textContent = 'Preencha todos os campos.';
        err.style.display = 'block';
        return;
      }

      const btn = card.querySelector('.oab-lead-btn');
      btn.textContent = 'Enviando...';
      btn.disabled = true;

      try {
        if (CONFIG.leadsUrl) {
          await fetch(CONFIG.leadsUrl, {
            method: 'POST',
            mode: 'no-cors', // necessário para Google Apps Script
            body: JSON.stringify({
              nome, email, telefone: tel,
              site: location.hostname,
              pergunta: afterQuery,
            }),
          });
        }
      } catch (_) { /* falha silenciosa — não bloqueia o usuário */ }

      localStorage.setItem('oab_lead_captured', '1');
      leadCaptured = true;
      card.remove();

      // Adiciona mensagem de boas-vindas e processa a query pendente
      appendMsg(msgs, `Obrigado, ${nome.split(' ')[0]}! Pode continuar usando o assistente.`, 'bot');
      if (pendingQuery) {
        const root   = document.getElementById('__oab_root');
        const input  = root.querySelector('.oab-input');
        input.value  = pendingQuery;
        pendingQuery = '';
        handleSend();
      }
    });

    msgs.appendChild(card);
    msgs.scrollTop = msgs.scrollHeight;
  }

  async function handleSend() {
    const root    = document.getElementById('__oab_root');
    const input   = root.querySelector('.oab-input');
    const sendBtn = root.querySelector('.oab-send');
    const sugg    = root.querySelector('.oab-suggestions-wrap');
    const msgs    = root.querySelector('.oab-messages');
    const resetBtn = root.querySelector('.oab-reset');

    const text = input.value.trim();
    if (!text || isLoading) return;

    // Esconde sugestões na primeira mensagem
    if (firstMessage) { sugg.style.display = 'none'; firstMessage = false; }

    // Gate de lead: 1ª interação grátis, depois pede dados
    if (!leadCaptured && CONFIG.leadsUrl && freeUsed) {
      appendMsg(msgs, text, 'user');
      input.value = '';
      pendingQuery = text;
      showLeadForm(msgs, text);
      return;
    }
    if (!leadCaptured && CONFIG.leadsUrl) freeUsed = true;

    // Mensagem do usuário
    appendMsg(msgs, text, 'user');
    input.value = '';
    input.style.height = 'auto';

    // Loading
    isLoading = true;
    sendBtn.disabled = true;
    const typingEl = appendTyping(msgs);

    try {
      let pageContent;
      if (CONFIG.mock) {
        const { displayText, result } = mockAI(text);
        typingEl.remove();
        appendMsg(msgs, displayText, 'bot', result);
        if (result?.found && result.scrollKeyword) setTimeout(() => smartScroll(result.scrollKeyword), 700);
        isLoading = false; sendBtn.disabled = false;
        return;
      }
      if (CONFIG.contentUrl) {
        pageContent = await fetchContentFromApi(text);
      } else {
        pageContent = extractPageContent();
      }
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
    const msgsH = Math.max(160, CONFIG.height - 220); // subtrai header+chips+input+footer
    root.style.cssText = `position:fixed;bottom:24px;${pos}z-index:2147483647;font-family:'DM Sans',system-ui,sans-serif;--oab-msgs-height:${msgsH}px;`;

    root.innerHTML = `
      <div class="oab-panel">
        <div class="oab-drag-handle" title="Arraste para redimensionar"></div>
        <div class="oab-header">
          <div class="oab-header-shield">OAB</div>
          <div class="oab-header-info">
            <strong>${CONFIG.title}</strong>
            <span>${CONFIG.subtitle}</span>
          </div>
          <div class="oab-status"><div class="oab-dot"></div>online</div>
          <button class="oab-reset" aria-label="Recomeçar conversa" title="Nova conversa">↺</button>
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
        <div class="oab-footer">Assistente IA · <a class="oab-footer-link" href="https://jusfy.com.br/" target="_blank" rel="noopener">Feito por JUSFY</a> · v14</div>
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

/* ── tokens Jusfy ── */
#__oab_root{
  --j-primary:#49b086;
  --j-dark:#3a8a6a;
  --j-darker:#2d6e54;
  --j-light:#eef8f4;
  --j-gold:#C8952A;
  --c-surface:#f3f4f6;
  --c-border:#e5e7eb;
  --c-text:#1f2937;
  --c-muted:#9ca3af;
  --c-white:#FFFFFF;
  --c-ok:#166534;
  --c-ok-bg:#F0FDF4;
  --c-ok-border:#BBF7D0;
}

/* ── painel ── */
#__oab_root .oab-panel{
  position:fixed !important;
  bottom:90px !important;
  right:24px !important;
  width:420px !important;max-width:calc(100vw - 32px) !important;
  max-height:calc(100vh - 110px) !important;
  background:#fff !important;border-radius:16px !important;
  box-shadow:0 8px 32px rgba(0,0,0,.14),0 20px 60px rgba(0,0,0,.10) !important;
  overflow:hidden !important;isolation:isolate !important;
  display:flex !important;flex-direction:column !important;
  opacity:0 !important;transform:translateY(14px) scale(.97) !important;
  pointer-events:none !important;transition:opacity .22s ease,transform .22s ease !important;
}
#__oab_root .oab-panel.oab-open{opacity:1 !important;transform:none !important;pointer-events:all !important}

/* ── header ── */
#__oab_root .oab-header{
  background:linear-gradient(135deg,var(--j-darker) 0%,var(--j-primary) 100%) !important;
  padding:22px 24px !important;
  display:flex !important;align-items:center !important;gap:14px !important;flex-shrink:0 !important
}
#__oab_root .oab-header-shield{
  width:44px !important;height:44px !important;background:var(--j-gold) !important;
  border-radius:50% !important;display:flex !important;
  align-items:center !important;justify-content:center !important;
  font-size:13px !important;font-weight:700 !important;color:#fff !important;flex-shrink:0 !important;
  font-family:'DM Sans',system-ui,sans-serif !important;letter-spacing:.5px !important;
  box-shadow:0 2px 8px rgba(0,0,0,.20),0 0 0 3px rgba(255,255,255,.2) !important
}
#__oab_root .oab-header-info{display:flex !important;flex-direction:column !important;gap:3px !important;min-width:0 !important}
#__oab_root .oab-header-info strong{
  font-size:15px !important;font-weight:600 !important;color:#fff !important;
  white-space:nowrap !important;overflow:hidden !important;text-overflow:ellipsis !important
}
#__oab_root .oab-header-info span{font-size:12px !important;color:rgba(255,255,255,.6) !important}
#__oab_root .oab-status{
  margin-left:auto !important;flex-shrink:0 !important;
  display:flex !important;align-items:center !important;gap:6px !important;
  font-size:11.5px !important;color:rgba(255,255,255,.65) !important
}
#__oab_root .oab-reset{
  background:rgba(255,255,255,.15) !important;border:none !important;
  border-radius:8px !important;color:#fff !important;cursor:pointer !important;
  padding:4px 8px !important;font-size:16px !important;line-height:1 !important;
  flex-shrink:0 !important;transition:background .15s !important;outline:none !important
}
#__oab_root .oab-reset:hover{background:rgba(255,255,255,.28) !important}
#__oab_root .oab-dot{
  width:8px !important;height:8px !important;background:#86efac !important;
  border-radius:50% !important;flex-shrink:0 !important;
  animation:oab-pulse 2s ease-in-out infinite !important
}
@keyframes oab-pulse{0%,100%{opacity:1}50%{opacity:.35}}

/* ── mensagens ── */
#__oab_root .oab-messages{
  overflow-y:auto !important;padding:24px 24px 12px !important;
  display:flex !important;flex-direction:column !important;gap:12px !important;
  background:#fff !important;min-height:160px !important;flex:1 1 0 !important;overflow-y:scroll !important
}
#__oab_root .oab-messages::-webkit-scrollbar{width:3px}
#__oab_root .oab-messages::-webkit-scrollbar-thumb{background:#c5d9d3;border-radius:4px}

#__oab_root .oab-msg{
  display:flex !important;flex-direction:column !important;
  gap:4px !important;max-width:80% !important;animation:oab-in .2s ease !important
}
@keyframes oab-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
#__oab_root .oab-msg-bot{align-self:flex-start !important}
#__oab_root .oab-msg-user{align-self:flex-end !important}

#__oab_root .oab-bubble{
  padding:14px 18px !important;line-height:1.6 !important;
  font-size:14px !important;color:#1f2937 !important
}
#__oab_root .oab-msg-bot .oab-bubble{
  background:#f3f4f6 !important;border:none !important;
  border-radius:16px 16px 16px 4px !important
}
#__oab_root .oab-msg-user .oab-bubble{
  background:var(--j-primary) !important;color:#fff !important;
  border-radius:16px 16px 4px 16px !important
}
#__oab_root .oab-time{font-size:10px !important;color:var(--c-muted) !important;padding:0 4px !important;display:block !important}
#__oab_root .oab-msg-user .oab-time{text-align:right !important}

/* ── resultado ── */
#__oab_root .oab-result-box{
  background:var(--c-ok-bg) !important;border:1px solid var(--c-ok-border) !important;
  border-radius:12px !important;padding:12px 14px !important;margin-top:6px !important
}
#__oab_root .oab-result-label{
  font-size:10px !important;font-weight:700 !important;text-transform:uppercase !important;
  letter-spacing:.7px !important;color:var(--c-ok) !important;margin-bottom:8px !important
}
#__oab_root .oab-result-row{
  display:grid !important;
  grid-template-columns:1fr auto !important;
  gap:6px 12px !important;
  font-size:13px !important;padding:7px 0 !important;
  align-items:start !important;
  border-bottom:1px solid rgba(22,101,52,.1) !important
}
#__oab_root .oab-result-row:last-of-type{border-bottom:none !important}
#__oab_root .oab-result-row span:first-child{
  color:var(--c-text) !important;line-height:1.4 !important;
  word-break:break-word !important
}
#__oab_root .oab-result-row span:last-child{
  font-weight:700 !important;color:var(--c-ok) !important;
  white-space:nowrap !important;text-align:right !important;
  padding-top:1px !important
}
#__oab_root .oab-scroll-cta{
  margin-top:10px !important;padding-top:8px !important;
  border-top:1px solid rgba(22,101,52,.12) !important;
  font-size:11.5px !important;color:var(--c-ok) !important;font-weight:600 !important;
  cursor:pointer !important;display:flex !important;align-items:center !important;gap:4px !important
}

/* ── typing ── */
#__oab_root .oab-typing{
  display:flex !important;gap:5px !important;align-items:center !important;
  padding:12px 16px !important;background:#f3f4f6 !important;
  border-radius:16px 16px 16px 4px !important;width:fit-content !important
}
#__oab_root .oab-typing span{
  width:6px !important;height:6px !important;background:var(--j-primary) !important;
  border-radius:50% !important;animation:oab-bounce 1.2s infinite !important
}
#__oab_root .oab-typing span:nth-child(2){animation-delay:.2s}
#__oab_root .oab-typing span:nth-child(3){animation-delay:.4s}
@keyframes oab-bounce{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-5px);opacity:1}}

/* ── sugestões ── */
#__oab_root .oab-suggestions-wrap{
  background:#fff !important;flex-shrink:0 !important;width:100% !important
}
#__oab_root .oab-suggestions{
  display:flex !important;gap:8px !important;
  padding:4px 24px 16px 24px !important;
  flex-wrap:wrap !important;
}
#__oab_root .oab-chip{
  padding:7px 14px !important;background:#fff !important;
  border:1.5px solid #49b086 !important;border-radius:100px !important;
  font-size:12px !important;color:#49b086 !important;font-weight:500 !important;
  cursor:pointer !important;white-space:nowrap !important;
  transition:all .2s ease !important;font-family:'DM Sans',system-ui,sans-serif !important
}
#__oab_root .oab-chip:hover{background:#eef8f4 !important;border-color:#3a8a6a !important;color:#3a8a6a !important}

/* ── input ── */
#__oab_root .oab-input-row{
  border-top:1px solid #f3f4f6 !important;padding:16px 24px !important;
  display:flex !important;gap:12px !important;align-items:center !important;
  background:#fff !important;flex-shrink:0 !important
}
#__oab_root .oab-input{
  flex:1 !important;border:1px solid #e5e7eb !important;border-radius:24px !important;
  padding:14px 20px !important;font-size:14px !important;
  font-family:'DM Sans',system-ui,sans-serif !important;
  color:#1f2937 !important;background:#f9fafb !important;
  resize:none !important;outline:none !important;line-height:1.45 !important;
  max-height:88px !important;overflow-y:auto !important
}
#__oab_root .oab-input:focus{border-color:#49b086 !important;background:#fff !important}
#__oab_root .oab-input::placeholder{color:#9ca3af !important}
#__oab_root .oab-send{
  width:40px !important;height:40px !important;border-radius:50% !important;
  background:var(--j-primary) !important;border:none !important;cursor:pointer !important;
  display:flex !important;align-items:center !important;justify-content:center !important;
  flex-shrink:0 !important;outline:none !important;color:#fff !important;
  box-shadow:0 3px 12px rgba(73,176,134,.40) !important;
  transition:background .15s,transform .15s,box-shadow .15s !important
}
#__oab_root .oab-send:hover{background:var(--j-dark) !important;transform:scale(1.06) !important}
#__oab_root .oab-send:disabled{background:#e5e7eb !important;cursor:not-allowed !important;transform:none !important;box-shadow:none !important}

/* ── footer ── */
#__oab_root .oab-footer{
  padding:8px !important;text-align:center !important;font-size:10px !important;
  color:var(--c-muted) !important;background:#fff !important;
  border-top:1px solid #f3f4f6 !important;flex-shrink:0 !important
}
#__oab_root .oab-footer-link{
  color:var(--j-primary) !important;text-decoration:underline !important;
  font-weight:600 !important;cursor:pointer !important
}
#__oab_root .oab-footer-link:hover{color:var(--j-dark) !important}

/* ── lead capture form ── */
#__oab_root .oab-lead-card{
  background:#f0fdf4 !important;border:1.5px solid #86efac !important;
  border-radius:14px !important;padding:16px !important;margin:4px 0 !important;
  display:flex !important;flex-direction:column !important;gap:10px !important
}
#__oab_root .oab-lead-title{
  font-size:13.5px !important;font-weight:600 !important;color:#166534 !important;
  line-height:1.4 !important
}
#__oab_root .oab-lead-input{
  border:1.5px solid #d1fae5 !important;border-radius:10px !important;
  padding:10px 14px !important;font-size:13.5px !important;
  font-family:'DM Sans',system-ui,sans-serif !important;
  color:#1a2a25 !important;background:#fff !important;
  outline:none !important;width:100% !important
}
#__oab_root .oab-lead-input:focus{border-color:var(--j-primary) !important}
#__oab_root .oab-lead-btn{
  background:var(--j-primary) !important;color:#fff !important;
  border:none !important;border-radius:10px !important;
  padding:11px !important;font-size:14px !important;font-weight:600 !important;
  cursor:pointer !important;font-family:'DM Sans',system-ui,sans-serif !important;
  transition:background .15s !important
}
#__oab_root .oab-lead-btn:hover{background:var(--j-dark) !important}
#__oab_root .oab-lead-btn:disabled{background:#9ca3af !important;cursor:not-allowed !important}

/* ── drag handle ── */
#__oab_root .oab-drag-handle{
  height:18px !important;width:100% !important;
  display:flex !important;align-items:center !important;justify-content:center !important;
  cursor:ns-resize !important;flex-shrink:0 !important;
  background:transparent !important;
}
#__oab_root .oab-drag-handle::after{
  content:'' !important;
  width:36px !important;height:4px !important;
  background:#d1d5db !important;border-radius:2px !important;
  transition:background .15s !important
}
#__oab_root .oab-drag-handle:hover::after{
  background:var(--j-primary) !important
}

/* ── toggle ── */
#__oab_root .oab-toggle{
  width:56px !important;height:56px !important;border-radius:50% !important;
  background:linear-gradient(145deg,var(--j-darker),var(--j-primary)) !important;
  border:none !important;
  box-shadow:0 8px 24px rgba(73,176,134,.50),0 3px 8px rgba(0,0,0,.12) !important;
  cursor:pointer !important;outline:none !important;color:#fff !important;
  display:flex !important;align-items:center !important;justify-content:center !important;
  margin-left:auto !important;margin-top:12px !important;
  transition:transform .2s ease,box-shadow .2s ease !important
}
#__oab_root .oab-toggle:hover{
  transform:scale(1.08) translateY(-2px) !important;
  box-shadow:0 14px 32px rgba(73,176,134,.55),0 4px 12px rgba(0,0,0,.15) !important
}
#__oab_root .oab-toggle.oab-btn-open{
  background:linear-gradient(145deg,var(--j-dark),var(--j-primary)) !important
}

/* ── responsivo ── */
@media(max-width:500px){
  #__oab_root .oab-panel{width:calc(100vw - 32px) !important;right:-8px !important}
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
