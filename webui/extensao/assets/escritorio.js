/* Escritório dos agentes — WebUI (navegador e celular). Parte da extensão maestro-painel.
 * Computador: caixa no rodapé da barra de conversas (esquerda).
 * Celular (até 700 px): faixa fina acima da caixa de mensagem; tocar abre o escritório inteiro.
 * Clique numa mesa: abre o chat dela (window.__mpAbrirTarefa vem de painel.js).
 * Dados: GET sidecar /escritorio a cada 10 s (só com a aba visível).
 */
(() => {
  'use strict';
  if (window.__mpEscritorio) return;
  window.__mpEscritorio = true;

  const SC = 'api/extensions/maestro-painel/sidecar/';
  const LS = {
    get: (k, d) => { try { const v = localStorage.getItem('mp.' + k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
    set: (k, v) => { try { localStorage.setItem('mp.' + k, JSON.stringify(v)); } catch (_) {} },
  };
  const h = (tag, attrs, ...filhos) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const f of filhos.flat(3)) {
      if (f === null || f === undefined || f === false) continue;
      el.appendChild(typeof f === 'string' || typeof f === 'number' ? document.createTextNode(String(f)) : f);
    }
    return el;
  };

/* ESCRITORIO-CORE-INICIO */
const ESC_CSS = `
.esc-caixa{flex-shrink:0;margin:6px 8px 8px;border:1px solid var(--esc-borda);border-radius:12px;background:var(--esc-fundo);padding:7px 7px 6px;font-size:12px;color:var(--esc-t1);
  --esc-borda:var(--ui-border-subtle,var(--border,rgba(127,127,127,.25)));--esc-fundo:var(--ui-control-background,rgba(127,127,127,.06));
  --esc-t1:var(--ui-text-primary,var(--text,#ececec));--esc-t2:var(--ui-text-secondary,var(--muted,#b8b8b8));--esc-t3:var(--ui-text-tertiary,var(--muted,#7d7d7d));
  --esc-mesa:var(--ui-control-hover-background,rgba(127,127,127,.09));--esc-ok:#3ccf78;--esc-vazia:rgba(127,127,127,.25)}
.esc-cab{display:flex;align-items:center;gap:6px;padding:0 3px 6px;cursor:pointer;user-select:none;background:none;border:0;width:100%;color:inherit;font:inherit;text-align:left}
.esc-cab .esc-tit{font-size:.64rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--esc-t3);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.esc-cab .esc-car{font-size:10px;color:var(--esc-t3);transition:transform .15s}
.esc-caixa.min .esc-car{transform:rotate(-90deg)}
.esc-caixa.min .esc-cab{padding-bottom:0}
.esc-pontos{display:flex;gap:3px}.esc-pontos i{width:6px;height:6px;border-radius:50%;background:var(--c);animation:esc-pul 1.2s infinite}
.esc-chao{display:grid;grid-template-columns:1fr 1fr;gap:6px;max-height:330px;overflow-y:auto}
.esc-caixa.min .esc-chao,.esc-caixa:not(.min) .esc-pontos{display:none}
.esc-vazio{font-size:.7rem;color:var(--esc-t3);padding:2px 4px 3px}
.esc-mesa{position:relative;border-radius:9px;padding:6px 7px 7px;background:var(--esc-mesa);border:1px solid transparent;cursor:pointer;text-align:left;color:inherit;font:inherit;min-width:0;display:block;width:100%}
.esc-mesa:hover{border-color:var(--esc-borda)}
.esc-mesa:focus-visible{outline:2px solid var(--c);outline-offset:1px}
.esc-cena{height:44px;position:relative;margin-bottom:4px}
.esc-bon{position:absolute;left:6px;bottom:6px;width:20px;height:30px}
.esc-cabeca{position:absolute;left:4px;top:0;width:12px;height:12px;border-radius:50%;background:var(--c);animation:esc-bal 1.6s ease-in-out infinite}
.esc-corpo{position:absolute;left:2px;top:12px;width:16px;height:14px;border-radius:6px 6px 3px 3px;background:var(--c);opacity:.75}
.esc-braco{position:absolute;left:14px;top:15px;width:9px;height:3px;border-radius:2px;background:var(--c);transform-origin:left;animation:esc-dig .35s ease-in-out infinite alternate}
.esc-tampo{position:absolute;left:0;right:0;bottom:2px;height:5px;border-radius:2px;background:#5a4632;opacity:.8}
.esc-tela{position:absolute;left:28px;bottom:7px;width:30px;height:20px;border-radius:3px;background:#0b0b0d;border:1px solid #3b3b44;overflow:hidden}
.esc-tela:after{content:"";position:absolute;left:3px;top:3px;height:2px;width:50%;background:var(--c);opacity:.85;box-shadow:0 4px 0 var(--c),0 8px 0 var(--c);animation:esc-cod 1.4s steps(3) infinite}
.esc-balao{position:absolute;right:0;top:0;max-width:64px;font-size:.58rem;line-height:1.2;color:#111;background:#e9e9ee;border-radius:7px 7px 7px 2px;padding:2px 5px;font-weight:700;white-space:nowrap}
.esc-balao:after{content:"";position:absolute;left:-3px;bottom:2px;border:3px solid transparent;border-right-color:#e9e9ee}
.esc-qtd{position:absolute;left:30px;top:0;font-size:.58rem;font-weight:700;color:var(--c)}
.esc-ag{font-size:.62rem;color:var(--c);font-weight:600;display:flex;align-items:center;gap:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.esc-ag:before{content:"";flex:0 0 5px;height:5px;border-radius:50%;background:var(--c);animation:esc-pul 1.2s infinite}
.esc-tar{font-size:.68rem;color:var(--esc-t1);margin-top:2px;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.esc-pas{font-size:.6rem;color:var(--esc-t3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.esc-prog{display:flex;gap:2px;margin-top:5px}
.esc-prog b{flex:1;height:4px;border-radius:2px;background:var(--esc-vazia);position:relative;overflow:hidden}
.esc-prog b.f{background:var(--esc-ok)}
.esc-prog b.a{background:linear-gradient(90deg,var(--esc-ok) 0 var(--p),var(--esc-vazia) var(--p))}
.esc-prog b.a:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.45),transparent);animation:esc-bri 1.8s infinite;transform:translateX(-100%)}
.esc-etq{display:flex;justify-content:space-between;font-size:.52rem;color:var(--esc-t3);margin-top:2px}
.esc-etq .on{color:var(--esc-t1);font-weight:600}
.esc-mesa.parado .esc-braco,.esc-mesa.parado .esc-cabeca,.esc-mesa.parado .esc-tela:after,.esc-mesa.parado .esc-ag:before,.esc-mesa.parado .esc-prog b.a:after{animation:none}
.esc-mesa.parado .esc-tela:after,.esc-mesa.parado .esc-ag:before{opacity:.3}
.esc-mais{grid-column:1/-1;font-size:.64rem;color:var(--esc-t3);background:none;border:0;padding:2px;cursor:pointer;font:inherit}
/* faixa (celular): mesas pequenas rolando para o lado */
.esc-caixa.faixa{margin:0 0 6px}
.esc-caixa.faixa .esc-pontos{display:none}
.esc-caixa.faixa .esc-car{transform:rotate(180deg)}.esc-caixa.faixa.aberta .esc-car{transform:none}
.esc-caixa.faixa:not(.aberta) .esc-chao{display:flex;overflow-x:auto;overflow-y:hidden;max-height:none;scrollbar-width:none}
.esc-caixa.faixa:not(.aberta) .esc-mesa{flex:0 0 150px}
.esc-caixa.faixa:not(.aberta) .esc-cena,.esc-caixa.faixa:not(.aberta) .esc-pas,.esc-caixa.faixa:not(.aberta) .esc-etq{display:none}
.esc-caixa.faixa:not(.aberta) .esc-tar{-webkit-line-clamp:1}
.esc-caixa.faixa.aberta .esc-chao{max-height:55vh}
@keyframes esc-dig{to{transform:rotate(14deg) translateY(1px)}}
@keyframes esc-bal{50%{transform:translateY(-1px)}}
@keyframes esc-cod{0%{width:30%}50%{width:70%}100%{width:50%}}
@keyframes esc-pul{50%{opacity:.25}}
@keyframes esc-bri{to{transform:translateX(100%)}}
@media (prefers-reduced-motion:reduce){.esc-caixa *{animation:none!important}}
`;
const ESC_COR = { claude: '#f0a060', codex: '#5fd0c8', hermes: '#b48cff', publicacao: '#7aa2ff' };
const ESC_NOME = { claude: 'Claude', codex: 'Codex', hermes: 'Hermes', publicacao: 'Publicação' };
const ESC_ETQ = ['Plan.', 'Constr.', 'Rev.', 'Test.', 'Publ.'];
const ESC_ETAPAS = ['Planejar', 'Construir', 'Revisar', 'Testar', 'Publicar'];
const ESC_MAX = 6;

function escVerbo(m) {
  if (m.agente === 'claude') return 'construindo';
  if (m.agente === 'codex') return 'revisando';
  if (m.agente === 'publicacao') return m.ativo ? 'publicando' : 'esperando você';
  return m.n ? (['planejando', 'acompanhando', 'revisando', 'testando', 'publicando'][m.etapa] || 'trabalhando') : 'conversando';
}

/* criarEscritorio({h, lsGet, lsSet, abrirMesa(m), faixa}) -> {el, desenhar(dados)} */
function criarEscritorio(o) {
  const h = o.h;
  const caixa = h('div', { class: 'esc-caixa' + (o.faixa ? ' faixa' : '') + (o.lsGet('esc.min', false) ? ' min' : '') });
  let ultimo = '';
  let todos = false;
  function alternar() {
    if (caixa.classList.contains('faixa')) { caixa.classList.toggle('aberta'); return; }
    const min = !caixa.classList.contains('min');
    caixa.classList.toggle('min', min);
    o.lsSet('esc.min', min);
  }
  function mesa(m) {
    const cor = ESC_COR[m.agente] || '#999';
    const tit = `${ESC_NOME[m.agente] || m.agente}${m.qtd > 1 ? ' ×' + m.qtd : ''} · ${escVerbo(m)}` +
      `\n${m.tarefa}${m.passo ? '\n' + m.passo : ''}${m.tempo ? '\nhá ' + m.tempo : ''}` +
      (m.etapa !== null && m.etapa !== undefined ? `\nEtapa: ${ESC_ETAPAS[m.etapa]} (estimativa ${m.pct}%)` : '') +
      '\nClique para abrir o chat';
    const prog = (m.etapa === null || m.etapa === undefined) ? null : [
      h('div', { class: 'esc-prog' }, ESC_ETAPAS.map((_, i) => h('b', {
        class: i < m.etapa ? 'f' : i === m.etapa ? 'a' : '', style: i === m.etapa ? `--p:${m.pct}%` : null,
      }))),
      h('div', { class: 'esc-etq' }, ESC_ETQ.map((t, i) => h('span', { class: i === m.etapa ? 'on' : '' }, t))),
    ];
    return h('button', {
      type: 'button', class: 'esc-mesa' + (m.ativo ? '' : ' parado'), style: `--c:${cor}`, title: tit,
      'aria-label': tit.replace(/\n/g, '. '), onclick: () => o.abrirMesa(m),
    },
    h('div', { class: 'esc-cena' },
      h('div', { class: 'esc-bon' }, h('div', { class: 'esc-cabeca' }), h('div', { class: 'esc-corpo' }), h('div', { class: 'esc-braco' })),
      h('div', { class: 'esc-tela' }), h('div', { class: 'esc-tampo' }),
      m.qtd > 1 ? h('span', { class: 'esc-qtd' }, '×' + m.qtd) : null,
      m.n ? h('div', { class: 'esc-balao' }, '#' + m.n) : null),
    h('div', { class: 'esc-ag' }, `${ESC_NOME[m.agente] || m.agente} · ${escVerbo(m)}`),
    h('div', { class: 'esc-tar' }, m.tarefa),
    h('div', { class: 'esc-pas' }, m.passo || ''),
    prog);
  }
  function desenhar(d) {
    const mesas = (d && d.mesas) || [];
    const chave = JSON.stringify([mesas.map(m => [m.agente, m.n, m.qtd, m.ativo, m.tarefa, m.passo, m.etapa, m.pct]), todos, !!(d && d.erro)]);
    if (chave === ultimo) return;
    ultimo = chave;
    const ativos = mesas.filter(m => m.ativo).length;
    const titulo = !d ? 'Escritório · carregando' : d.erro ? 'Escritório · sem conexão' :
      mesas.length ? `Escritório · ${ativos} trabalhando` + (mesas.length > ativos ? ` · ${mesas.length - ativos} esperando` : '') : 'Escritório vazio';
    const cab = h('button', { type: 'button', class: 'esc-cab', title: o.faixa ? 'Tocar para abrir ou fechar' : 'Recolher ou abrir o escritório', onclick: alternar },
      h('span', { class: 'esc-car' }, '▾'), h('span', { class: 'esc-tit' }, titulo),
      h('span', { class: 'esc-pontos' }, mesas.slice(0, 8).map(m => h('i', { style: `--c:${ESC_COR[m.agente] || '#999'}` }))));
    caixa.classList.toggle('vazio', !mesas.length);
    if (!mesas.length) { caixa.replaceChildren(cab); return; }
    const vis = todos ? mesas : mesas.slice(0, ESC_MAX);
    caixa.replaceChildren(cab, h('div', { class: 'esc-chao' }, vis.map(mesa),
      mesas.length > ESC_MAX ? h('button', { type: 'button', class: 'esc-mais', onclick: () => { todos = !todos; desenhar(d); } },
        todos ? 'mostrar menos' : `+ ${mesas.length - ESC_MAX} mesas`) : null));
  }
  return { el: caixa, desenhar };
}

/* Chat de uma tarefa: o mais recente que esta tela consegue abrir (app só abre os do state.db). */
function chatsDaTarefa(chats, n, soApp) {
  const l = ((chats || {})[String(n)] || []);
  return soApp ? l.filter(c => c.app) : l;
}
/* ESCRITORIO-CORE-FIM */

  function css() {
    let s = document.getElementById('esc-css');
    if (!s) { s = document.createElement('style'); s.id = 'esc-css'; document.head.appendChild(s); }
    if (s.textContent !== ESC_CSS) s.textContent = ESC_CSS;
  }

  let dados = null;
  const celular = () => window.innerWidth <= 700;
  function abrirMesa(m) {
    const abrir = window.__mpAbrirTarefa;
    if (typeof abrir !== 'function') return;
    abrir({ n: m.n, sid: m.sid, tarefa: m.tarefa, chats: dados && dados.chats });
    if (celular()) esc.el.classList.remove('aberta');
  }
  const esc = criarEscritorio({ h, lsGet: LS.get, lsSet: LS.set, abrirMesa, faixa: false });

  function posicionar() {
    const cel = celular();
    esc.el.classList.toggle('faixa', cel);
    esc.el.classList.toggle('min', !cel && LS.get('esc.min', false));
    if (!cel) esc.el.classList.remove('aberta');
    if (cel) {
      const comp = document.getElementById('composerWrap');
      if (comp && comp.parentNode && esc.el.nextSibling !== comp) comp.parentNode.insertBefore(esc.el, comp);
    } else {
      const lado = document.querySelector('aside.sidebar');
      if (lado && esc.el.parentNode !== lado) lado.appendChild(esc.el);
      else if (lado && lado.lastElementChild !== esc.el) lado.appendChild(esc.el);
    }
  }

  let lendo = false;
  async function ler(forcar) {
    if (lendo || (document.hidden && !forcar)) return;
    lendo = true;
    try { dados = await api(SC + 'escritorio', { timeoutMs: 20000, timeoutToast: false }); }
    catch (e) { dados = Object.assign({}, dados || { mesas: [] }, { erro: true }); }
    finally { lendo = false; }
    window.__mpEscritorioDados = dados;
    posicionar();
    esc.desenhar(dados);
  }

  function iniciar() {
    css();
    posicionar();
    esc.desenhar(null);
    ler(true);
    setInterval(ler, 10000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) ler(); });
    let t = null;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(posicionar, 150); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
