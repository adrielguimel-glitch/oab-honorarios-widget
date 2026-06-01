# OAB Honorários Widget

Widget embeddável com IA para páginas de honorários da OAB. Lê automaticamente o conteúdo da página e responde às perguntas dos advogados sobre honorários, fazendo scroll até o item encontrado.

## Como funciona

1. O advogado digita o serviço prestado ("fiz um divórcio consensual")
2. A IA lê o conteúdo visível da página como contexto
3. Identifica o honorário correspondente na tabela
4. Responde com o valor e rola a página até o item

**Zero configuração** — o widget lê a página automaticamente, sem precisar mapear nenhum seletor ou estrutura específica.

---

## Deploy no GitHub Pages (5 minutos)

### 1. Fork ou clone este repositório

```bash
git clone https://github.com/SEU_USUARIO/oab-honorarios-widget.git
cd oab-honorarios-widget
```

### 2. Ative o GitHub Pages

- Vá em **Settings → Pages**
- Em **Source**, selecione `main` branch, pasta `/ (root)`
- Clique em **Save**

Seu widget estará disponível em:
```
https://SEU_USUARIO.github.io/oab-honorarios-widget/widget.js
```

### 3. Configure sua API key

Por enquanto (modo protótipo), a chave vai no atributo `data-api-key` do script.

> ⚠️ Para produção, use o proxy (ver abaixo) para não expor a chave no frontend.

---

## Como embeddar em qualquer site

Cole **uma única linha** antes do fechamento de `</body>`:

```html
<script
  src="https://SEU_USUARIO.github.io/oab-honorarios-widget/widget.js"
  data-api-key="sk-ant-SUA_CHAVE_AQUI"
></script>
```

Pronto. O widget já aparece e já lê a página.

---

## Opções de configuração

Todos os atributos são opcionais (exceto `data-api-key` no modo frontend):

| Atributo | Padrão | Descrição |
|---|---|---|
| `data-api-key` | — | Chave da API Anthropic (modo protótipo) |
| `data-proxy-url` | — | URL do proxy próprio (modo produção) |
| `data-title` | `Assistente de Honorários` | Título no cabeçalho do widget |
| `data-subtitle` | `Tabela OAB • IA` | Subtítulo no cabeçalho |
| `data-position` | `bottom-right` | Posição: `bottom-right` ou `bottom-left` |
| `data-selector` | `body` | Seletor CSS do elemento com o conteúdo da tabela |
| `data-lang` | `pt-BR` | Idioma para formatos de hora |

### Exemplo com todas as opções

```html
<script
  src="https://SEU_USUARIO.github.io/oab-honorarios-widget/widget.js"
  data-api-key="sk-ant-..."
  data-title="Honorários OAB/SP"
  data-subtitle="Tabela 2024 · IA"
  data-position="bottom-right"
  data-selector="#conteudo-honorarios"
  data-lang="pt-BR"
></script>
```

### Dica: use `data-selector` para melhorar a precisão

Se a página tiver muito conteúdo além da tabela (menus, rodapé, etc.), aponte o widget para o elemento certo:

```html
data-selector="#tabela-honorarios"
```

Se não especificar, o widget usa `body` e filtra automaticamente `nav`, `header`, `footer` e elementos de navegação.

---

## Modo produção: proxy seguro

Para não expor a chave no frontend, use o proxy incluso:

### 1. Suba o proxy (qualquer servidor Node.js, Railway, Render, Fly.io…)

```bash
ANTHROPIC_API_KEY=sk-ant-... node proxy/server.js
```

Variáveis de ambiente:

| Variável | Descrição |
|---|---|
| `ANTHROPIC_API_KEY` | Sua chave Anthropic (obrigatório) |
| `PORT` | Porta do servidor (padrão: 3001) |
| `ALLOWED_ORIGINS` | Origens permitidas, separadas por vírgula (padrão: `*`) |

Exemplo de restrição de origem:
```bash
ALLOWED_ORIGINS=https://oabrs.org.br,https://www2.oabrs.org.br node proxy/server.js
```

### 2. Configure o widget para usar o proxy

```html
<script
  src="https://SEU_USUARIO.github.io/oab-honorarios-widget/widget.js"
  data-proxy-url="https://seu-proxy.railway.app/api/chat"
></script>
```

Sem `data-api-key` — a chave fica apenas no servidor.

---

## Rodar a demo localmente

```bash
npm run dev
# Abre http://localhost:8080/demo/index.html
```

Edite `demo/index.html` e substitua `YOUR_API_KEY` pela sua chave para testar.

---

## Estrutura do projeto

```
oab-honorarios-widget/
├── widget.js          ← Script embeddável (servido pelo GitHub Pages)
├── demo/
│   └── index.html     ← Página de demonstração com tabela completa
├── proxy/
│   └── server.js      ← Proxy Node.js para produção (chave no servidor)
├── package.json
└── README.md
```

---

## Compatibilidade

- Qualquer site HTML — WordPress, Wix, Squarespace, sites estáticos
- Não depende de jQuery, React, Vue ou qualquer framework
- Funciona em páginas de qualquer estrutura (lê o texto visível)
- Responsivo (≥ 320px)

---

## Licença

MIT
