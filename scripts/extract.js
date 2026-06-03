/**
 * Script de extração de conteúdo de honorários
 *
 * Uso:
 *   node scripts/extract.js --site oabrs
 *   node scripts/extract.js --site oabes --pdf caminho/para/arquivo.pdf
 *
 * Saída: data/<site>.json
 */

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

const args = process.argv.slice(2);
const siteIdx = args.indexOf('--site');
const pdfIdx  = args.indexOf('--pdf');
const urlIdx  = args.indexOf('--url');

if (siteIdx === -1) {
  console.error('Uso: node scripts/extract.js --site <id> [--url <api-url>] [--pdf <arquivo.pdf>]');
  process.exit(1);
}

const siteId = args[siteIdx + 1];
const pdfPath = pdfIdx > -1 ? args[pdfIdx + 1] : null;
const customUrl = urlIdx > -1 ? args[urlIdx + 1] : null;

// ── Configurações conhecidas por site ─────────────────────────────────────
const KNOWN_SITES = {
  oabrs: {
    name: 'OAB/RS',
    apiUrl: 'https://api-lumen.oabrs.org.br/honorarios?versao=0',
  },
  // Adicione outros aqui conforme descobrir as APIs
};

// ── Fetch helper ──────────────────────────────────────────────────────────
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Resposta não é JSON válido')); }
      });
    }).on('error', reject);
  });
}

// ── Converte JSON de honorários em texto limpo ────────────────────────────
// Tenta detectar o formato OAB RS (itens com indicativo/descricao/valor)
// e cai de volta para extração genérica em outros casos
function jsonToText(obj) {
  // Formato OAB RS: { data: [ { titulo, itens: [ { indicativo, descricao, valor, percentual } ] } ] }
  const sections = (Array.isArray(obj) ? obj : null)
    || obj?.data || obj?.honorarios || obj?.items || obj?.itens || null;

  if (Array.isArray(sections) && sections.length && sections[0].titulo !== undefined) {
    const lines = [];
    sections.forEach(sec => {
      if (!sec.ativo && sec.ativo !== undefined) return;
      lines.push('\n## ' + (sec.titulo || '').trim());

      const itens = sec.itens || sec.items || [];
      itens.forEach(item => {
        if (item.tipo === 'titulo' || item.tipo === 'cabecalho') return;

        // Tenta vários nomes de campo comuns
        const ind   = (item.subitem    || item.indicativo || item.codigo || '').trim();
        const desc  = (item.texto      || item.descricao  || item.titulo || item.name || '').trim();
        const valor = (item.valor      || item.value      || '').trim();
        const perc  = (item.percentual || item.percent    || '').trim().replace(/^\s*$/, '');

        if (!desc) return;

        const parts = [];
        if (ind)   parts.push(ind);
        parts.push(desc);
        if (valor) parts.push(valor);
        if (perc)  parts.push(perc);
        lines.push(parts.join(' | '));
      });
    });
    return lines.filter(Boolean).join('\n');
  }

  // Fallback genérico — converte qualquer JSON em texto legível
  function generic(o, depth) {
    if (!o) return '';
    if (typeof o === 'string' || typeof o === 'number') return String(o).trim();
    if (Array.isArray(o)) return o.map(i => generic(i, depth)).filter(Boolean).join('\n');
    const TITLE = ['titulo','title','nome','name','descricao','description'];
    const VALUE = ['valor','value','preco','percentual','percent'];
    const tk = TITLE.find(k => o[k] && typeof o[k] === 'string');
    const ak = Object.keys(o).find(k => Array.isArray(o[k]) && o[k].length);
    const lines = [];
    if (tk) lines.push((depth === 0 ? '## ' : '') + o[tk]);
    const vals = VALUE.filter(k => o[k]).map(k => String(o[k]).trim());
    if (vals.length) lines.push(vals.join(' | '));
    if (ak) lines.push(generic(o[ak], (depth||0) + 1));
    return lines.filter(Boolean).join('\n');
  }
  return generic(obj, 0);
}

// ── Salva o arquivo de dados ──────────────────────────────────────────────
function saveData(siteId, name, content) {
  const outPath = path.join(__dirname, '..', 'data', siteId + '.json');
  const payload = {
    site: siteId,
    name: name,
    updated: new Date().toISOString().slice(0, 10),
    content: content,
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`✅  Salvo em data/${siteId}.json (${content.length} chars)`);
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const site = KNOWN_SITES[siteId] || { name: siteId, apiUrl: customUrl };

  if (pdfPath) {
    // PDF — extrai texto via pdf-parse
    try {
      const pdfParse = require('pdf-parse');
      const buffer = fs.readFileSync(pdfPath);
      const data = await pdfParse(buffer);
      saveData(siteId, site.name, data.text.trim());
    } catch (e) {
      if (e.code === 'MODULE_NOT_FOUND') {
        console.error('Instale o módulo: npm install pdf-parse');
      } else {
        console.error('Erro ao ler PDF:', e.message);
      }
      process.exit(1);
    }
    return;
  }

  if (!site.apiUrl) {
    console.error('Informe --url <api-url> ou --pdf <arquivo>');
    process.exit(1);
  }

  console.log(`Buscando dados de ${site.name}...`);
  try {
    const json = await fetchJson(site.apiUrl);
    const content = jsonToText(json, 0).replace(/\n{3,}/g, '\n\n').trim();
    saveData(siteId, site.name, content);
  } catch (e) {
    console.error('Erro:', e.message);
    process.exit(1);
  }
}

main();
