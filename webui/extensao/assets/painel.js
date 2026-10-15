/* Painel Maestro — extensão do Hermes WebUI (Allysson).
 * 1) Aviso de ambiente no topo (VPS online x Mac local)
 * 2) Painel fixo à direita: agentes agora, arquivos, testar, esperando você,
 *    sendo atendidos, não analisados, fila — com ações
 * 3) Barra de conversas com nomes amigáveis, filtros por origem e por cliente
 * 4) Tela "Agentes": quem paga cada um + montar equipe (receitas)
 * Dados e ações: serviço auxiliar 127.0.0.1:8796 via /api/extensions/maestro-painel/sidecar/.
 */
(() => {
  'use strict';
  if (window.__mpPainel) return;
  window.__mpPainel = true;
  try { window.hermesExt && window.hermesExt.register && window.hermesExt.register('maestro-painel'); } catch (_) {}

  const SC = 'api/extensions/maestro-painel/sidecar/';
  const LS = {
    get: (k, d) => { try { const v = localStorage.getItem('mp.' + k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
    set: (k, v) => { try { localStorage.setItem('mp.' + k, JSON.stringify(v)); } catch (_) {} },
  };
  const AG = { claude: 'Claude Code', codex: 'Codex', hermes: 'Hermes (Opus)' };
  const ETAPAS = [
    ['planejar', '1. Planejar', 'Entende e faz a prancha'],
    ['construir', '2. Construir', 'Escreve o código'],
    ['revisar', '3. Revisar', 'Outro agente confere'],
    ['testar', '4. Testar', 'Abre no navegador e confere'],
  ];
  const CLIENTES = [
    ['todos', 'Todos'], ['HOMESET', 'Homeset'], ['GO ON', 'GO ON'], ['Meraki', 'Meraki'], ['geral', 'Geral'],
  ];

  let estado = null, agentesInfo = null, lendo = false, erro = '';

  // ── utilidades ─────────────────────────────────────────────────────────────
  const h = (tag, attrs, ...filhos) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const f of filhos.flat()) {
      if (f === null || f === undefined || f === false) continue;
      el.appendChild(typeof f === 'string' || typeof f === 'number' ? document.createTextNode(String(f)) : f);
    }
    return el;
  };
  const toast = (msg, tipo) => { try { showToast(msg, 3500, tipo); } catch (_) { console.log('[painel]', msg); } };
  async function chamar(rota, corpo) {
    const opts = corpo ? { method: 'POST', body: JSON.stringify(corpo), headers: { 'Content-Type': 'application/json' } } : {};
    return api(SC + rota, Object.assign({ timeoutMs: 60000, timeoutToast: false }, opts));
  }
  const rotulo = it => `#${it.n} (${it.nome})`;
  const urlIssue = n => `https://github.com/${(estado && estado.repo) || 'allyssonfmoura/maestro-os'}/issues/${n}`;

  async function novaConversa(texto, enviar) {
    try {
      if (typeof switchPanel === 'function') await switchPanel('chat');
      await newSession(false);
      const m = document.getElementById('msg');
      m.value = texto;
      m.dispatchEvent(new Event('input', { bubbles: true }));
      if (enviar) await send();
      else { m.focus(); m.setSelectionRange(m.value.length, m.value.length); }
    } catch (e) {
      toast('Não consegui abrir a conversa: ' + (e.message || e), 'error');
    }
  }

  function receitaDe(n) {
    const r = (estado && estado.receitas) || (agentesInfo && agentesInfo.receitas) || {};
    const lista = r.receitas || [];
    const pc = (r.por_chamado || {})[String(n)] || {};
    const base = lista.find(x => x.id === (pc.receita || r.padrao)) || lista[0] ||
      { nome: 'Maestro padrão', etapas: { planejar: 'hermes', construir: 'claude', revisar: 'codex', testar: 'hermes' } };
    const etapas = Object.assign({}, base.etapas);
    if (etapas.construir) etapas.construir = pc.construir || r.construir_padrao || etapas.construir;
    return { nome: base.nome, etapas };
  }
  const textoEquipe = rec => ETAPAS.map(([k, t]) => `${t.slice(3).toLowerCase()} = ${rec.etapas[k] ? AG[rec.etapas[k]] : 'pular'}`).join('; ');

  // ── ações dos chamados ─────────────────────────────────────────────────────
  const ACOES = {
    executar: async it => {
      const rec = receitaDe(it.n);
      if (!confirm(`Executar agora ${rotulo(it)}?\n\nEquipe "${rec.nome}": ${textoEquipe(rec)}.`)) return;
      novaConversa(`Executar agora a Solicitação ${rotulo(it)}.\nEquipe (receita "${rec.nome}"): ${textoEquipe(rec)}.\nSiga o fluxo da skill maestro-os-entrega. Quando ficar pronto, me mande o link, o usuário, a senha e o roteiro de teste.`, true);
    },
    fila: async it => mudar(it, 'fila', `${rotulo(it)} foi para a fila`),
    tirar: async it => mudar(it, 'tirar', `${rotulo(it)} saiu da fila (voltou para análise)`),
    pausar: async it => {
      if (!confirm(`Devolver ${rotulo(it)} para a fila?\nSe algum agente estiver trabalhando nele, pare o agente em "Agentes trabalhando agora".`)) return;
      mudar(it, 'fila', `${rotulo(it)} voltou para a fila`);
    },
    decidir: it => novaConversa(`Me mostre a decisão pendente da Solicitação ${rotulo(it)}: o que é, as opções numeradas e a sua recomendação.`, true),
    analisar: it => novaConversa(`Analise a Solicitação ${rotulo(it)} e me traga o diagnóstico, as opções numeradas e a sua recomendação.`, true),
    andamento: it => novaConversa(`Como está a Solicitação ${rotulo(it)}? Resumo curto: o que já foi feito, o que falta e se precisa de mim.`, true),
    abrirTeste: it => novaConversa(`Quero testar a Solicitação ${rotulo(it)}. Me passe o link, o usuário, a senha e o roteiro de teste.`, true),
    aprovar: it => {
      if (!confirm(`Aprovar o teste de ${rotulo(it)}?`)) return;
      novaConversa(`Testei a Solicitação ${rotulo(it)}: aprovado. Siga para o próximo passo e me pergunte antes de publicar em qualquer empresa.`, true);
    },
    recusar: it => novaConversa(`Testei a Solicitação ${rotulo(it)}: não aprovado. O problema foi: `, false),
    github: it => window.open(urlIssue(it.n), '_blank', 'noopener'),
  };
  async function mudar(it, acao, ok) {
    try {
      await chamar('acao', { acao, n: it.n });
      toast(ok);
      setTimeout(atualizar, 4000);
    } catch (e) { toast('Não deu certo: ' + (e.message || e), 'error'); }
  }

  // Botões à vista (o 1º é o principal) + o que vai para o menu ⋯. 'noar' = botão "Já está no ar".
  const BOTOES = {
    voce: { ver: [['Decidir', 'decidir', 1], 'noar'], menu: ['executar', 'fila', 'construir', 'github'] },
    testar: { ver: [['Abrir teste', 'abrirTeste', 1], ['Aprovar', 'aprovar'], 'noar'], menu: ['recusar', 'github'] },
    exec: { ver: [['Ver andamento', 'andamento', 1], 'noar'], menu: ['pausar', 'construir', 'github'] },
    analise: { ver: [['Analisar', 'analisar', 1]], menu: ['executar', 'fila', 'construir', 'github'] },
    fila: { ver: [['Executar agora', 'executar', 1]], menu: ['tirar', 'construir', 'github'] },
  };
  const MENU_TXT = {
    executar: ['Executar agora', 'começa a construir já'], fila: ['Para a fila', 'aprovado, entra na fila'],
    pausar: ['Devolver à fila', 'volta para a fila de aprovados'], tirar: ['Tirar da fila', 'volta para análise'],
    recusar: ['Recusar o teste', 'abre uma conversa para você contar o problema'], github: ['Abrir no GitHub', ''],
  };
  // Ordem: primeiro o que precisa de você. Agentes e arquivos entram depois de "Sendo atendidos".
  const SECOES = [
    ['voce', 'Esperando você', 'vermelho'],
    ['testar', 'Para você testar', 'verde'],
    ['exec', 'Sendo atendidos agora', 'azul'],
    ['fila', 'Na fila (aprovados)', 'roxo'],
    ['analise', 'Ainda não analisados', 'cinza'],
  ];
  const ABERTAS = { voce: true, testar: true, exec: true, agentes: false, arquivos: false, fila: false, analise: false };
  const POR_SECAO = 3;
  const ESPERA_DESFAZER = 10000;

  // "Já está no ar": confirma no painel, some na hora e só manda ao GitHub depois de 10 s (Desfazer).
  let conf = null;               // número do chamado com a confirmação aberta
  const pend = new Map();        // n -> { it, t, ate }
  const feitos = new Set();      // já mandados; escondidos até a próxima leitura
  let vista = 'painel', marcados = null, tique = null;
  const curto = it => {
    let t = (it.nome || '').replace(/^\[SUP-[^\]]*\]\s*/, '').split(/[:(]/)[0].trim();
    if (t.length > 42) t = t.slice(0, 42).replace(/\s+\S*$/, '') + '…';
    return t;
  };
  const escondido = n => pend.has(n) || feitos.has(n);
  function confirmarNoAr(it) {
    conf = null;
    const t = setTimeout(() => mandarNoAr(it.n), ESPERA_DESFAZER);
    pend.set(it.n, { it, t, ate: Date.now() + ESPERA_DESFAZER });
    desenhar();
  }
  async function mandarNoAr(n) {
    const p = pend.get(n);
    if (!p) return;
    clearTimeout(p.t);
    try {
      const r = await chamar('acao', { acao: 'no_ar', n });
      feitos.add(n);
      toast(r.cliente ? `#${n} (${curto(p.it)}) está no ar; o cliente foi avisado` : `#${n} (${curto(p.it)}) fechado`);
      setTimeout(atualizar, 3000);
    } catch (e) { toast(`Não consegui marcar #${n} (${curto(p.it)}): ` + (e.message || e), 'error'); }
    pend.delete(n); desenhar();
  }
  function desfazerNoAr(n) {
    const p = pend.get(n);
    if (p) { clearTimeout(p.t); pend.delete(n); desenhar(); }
  }
  // Recarregar ou fechar a página não pode perder um "Já está no ar" confirmado: manda na hora.
  window.addEventListener('pagehide', () => {
    for (const n of pend.keys()) {
      try { fetch(new URL(SC + 'acao', document.baseURI || location.href), { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'no_ar', n }) }); } catch (_) {}
    }
  });
  async function fecharInternos(ns) {
    try {
      const r = await chamar('acao', { acao: 'fechar', ns });
      r.fechados.forEach(n => feitos.add(n));
      toast(`${r.fechados.length} chamado(s) interno(s) fechado(s)` + (r.erros.length ? `; ${r.erros.length} não deu: ${r.erros[0]}` : ''), r.erros.length ? 'error' : undefined);
      setTimeout(atualizar, 3000);
    } catch (e) { toast('Não consegui fechar: ' + (e.message || e), 'error'); }
    desenhar();
  }
  function menuAcoes(ev, it, chave) {
    ev.stopPropagation();
    fecharMenus();
    const rc = estado.receitas || {};
    const pc = (rc.por_chamado || {})[String(it.n)] || {};
    const atual = pc.construir || rc.construir_padrao || 'claude';
    const r = ev.currentTarget.getBoundingClientRect();
    const itens = [];
    for (const a of BOTOES[chave].menu) {
      if (a === 'construir') {
        itens.push(h('div', { class: 'mp-mh' }, 'Quem constrói este chamado'));
        for (const [k, v] of Object.entries(AG)) itens.push(h('div', {
          class: 'mp-mi', onclick: async () => {
            fecharMenus();
            const por = Object.assign({}, rc.por_chamado || {});
            por[String(it.n)] = Object.assign({}, pc, { construir: k });
            await salvarReceitas({ por_chamado: por });
            toast(`${rotulo(it)}: ${v} vai construir`);
          },
        }, h('div', null, h('b', null, (atual === k ? '✓ ' : '') + v))));
        itens.push(h('hr', { class: 'mp-hr' }));
      } else {
        const [t, d] = MENU_TXT[a];
        itens.push(h('div', { class: 'mp-mi', onclick: () => { fecharMenus(); ACOES[a](it); } }, h('div', null, h('b', null, t), d ? h('span', null, d) : null)));
      }
    }
    const w = Math.min(250, window.innerWidth - 16);
    const menu = h('div', { class: 'mp-menu mp-menu-acoes', style: `width:${w}px;top:${Math.max(8, Math.min(r.bottom + 4, window.innerHeight - 340))}px;left:${Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8))}px` }, itens);
    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', fecharMenus, { once: true }), 0);
  }

  // ── painel ─────────────────────────────────────────────────────────────────
  let painel = null;
  const abertos = LS.get('secoes2', Object.assign({}, ABERTAS));

  function montarPainel() {
    const layout = document.querySelector('.layout');
    if (!layout || document.getElementById('mpPainel')) return;
    painel = h('aside', { id: 'mpPainel', class: 'mp-painel', 'aria-label': 'Painel Maestro' });
    const direita = layout.querySelector('aside.rightpanel');
    layout.insertBefore(painel, direita || null);
    aplicarVisivel();
    desenhar();
  }
  function aplicarVisivel() {
    const v = LS.get('aberto', window.innerWidth > 1000);
    if (painel) painel.hidden = !v;
    document.body.classList.toggle('mp-com-painel', !!v);
    const b = document.getElementById('mpRailPainel');
    if (b) b.classList.toggle('active', !!v);
  }
  function abrirPergunta() {
    const jaAberta = painel && !painel.hidden && LS.get('aba', 'painel') === 'pergunta';
    if (jaAberta) { LS.set('aberto', false); aplicarVisivel(); return; }
    LS.set('aba', 'pergunta'); LS.set('aberto', true); aplicarVisivel(); desenhar();
    setTimeout(() => document.getElementById('mpPergTexto')?.focus(), 60);
  }
  function alternarPainel() { LS.set('aberto', !LS.get('aberto', window.innerWidth > 1000)); aplicarVisivel(); if (!painel.hidden) atualizar(); }

  function filtroOk(it) {
    const f = LS.get('cliente', 'todos');
    if (f === 'todos') return true;
    const emp = it.empresas || [];
    if (f === 'geral') return !emp.some(e => ['HOMESET', 'GO ON', 'Meraki'].includes(e));
    return emp.includes(f);
  }

  function secao(chave, titulo, cor, conteudo, contagem, forte) {
    const aberta = abertos[chave] !== undefined ? abertos[chave] : !!ABERTAS[chave];
    return h('section', { class: 'mp-sec' + (aberta ? ' aberta' : '') },
      h('button', {
        type: 'button', class: 'mp-sec-cab' + (forte ? ' forte' : ''),
        onclick: () => { abertos[chave] = !aberta; LS.set('secoes2', abertos); desenhar(); },
      }, h('span', { class: 'mp-caret' }, '›'), h('span', { class: 'mp-dot ' + cor }), h('span', { class: 'mp-sec-tit' }, titulo),
      contagem !== undefined ? h('span', { class: 'mp-cnt' + (chave === 'voce' && contagem ? ' alerta' : '') }, String(contagem)) : null),
      aberta ? conteudo : null);
  }

  const icOk = () => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 16 16'); s.setAttribute('class', 'mp-ico'); s.setAttribute('width', '14'); s.setAttribute('height', '14'); s.innerHTML = '<path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2"/>'; return s; };
  const botaoNoAr = (it, cheio) => h('button', { type: 'button', class: 'mp-b ok' + (cheio ? ' cheio' : ''), title: 'Já subiu e está funcionando', onclick: () => { conf = it.n; desenhar(); } }, icOk(), 'Já está no ar');
  const caixaConfirma = it => h('div', { class: 'mp-conf' },
    h('b', null, `#${it.n} (${curto(it)}) já está no ar?`),
    h('small', null, it.cliente
      ? 'É chamado de cliente: ele recebe o aviso "Já está no ar, veja aqui" e o chamado fecha quando ele responder Sim. Sai do painel.'
      : 'É chamado interno: ele é fechado no GitHub. Sai do painel.'),
    h('div', { class: 'mp-acoes' },
      h('button', { type: 'button', class: 'mp-b ok cheio', onclick: () => confirmarNoAr(it) }, icOk(), 'Sim, já está no ar'),
      h('button', { type: 'button', class: 'mp-b', onclick: () => { conf = null; desenhar(); } }, 'Cancelar')));

  function linhaChamado(it, chave) {
    const cfg = BOTOES[chave];
    const entrega = chave === 'exec' && it.entrega && /Entrega pronta/.test(it.meta || '');
    return h('div', { class: 'mp-row' },
      h('a', { class: 'mp-nome', href: urlIssue(it.n), target: '_blank', rel: 'noopener', title: 'Abrir no GitHub' },
        h('b', null, '#' + it.n), ' ', it.nome),
      h('div', { class: 'mp-meta' }, it.meta || ''),
      conf === it.n ? caixaConfirma(it) : h('div', { class: 'mp-acoes' },
        cfg.ver.map(b => b === 'noar' ? botaoNoAr(it, entrega)
          : h('button', { type: 'button', class: 'mp-b' + (b[2] && !entrega ? ' pri' : ''), onclick: () => ACOES[b[1]](it) }, b[0])),
        h('button', { type: 'button', class: 'mp-b mais', title: 'Mais ações', 'aria-label': 'Mais ações', onclick: ev => menuAcoes(ev, it, chave) }, '⋯')));
  }
  function listaSecao(chave, itens) {
    if (!itens.length) return h('div', { class: 'mp-vazio' }, chave === 'testar' ? 'Nada para testar agora.' : 'nada aqui');
    const todos = LS.get('todos.' + chave, false);
    const vis = todos ? itens : itens.slice(0, POR_SECAO);
    return [...vis.map(it => linhaChamado(it, chave)),
      itens.length > POR_SECAO ? h('button', { type: 'button', class: 'mp-mais', onclick: () => { LS.set('todos.' + chave, !todos); desenhar(); } }, todos ? 'mostrar só ' + POR_SECAO : `ver todos os ${itens.length} →`) : null];
  }
  function barraDesfazer() {
    if (!pend.size) return null;
    const [n, p] = [...pend.entries()].pop();
    const seg = Math.max(0, Math.ceil((p.ate - Date.now()) / 1000));
    return h('div', { class: 'mp-desf' }, icOk(),
      h('span', null, `#${n} (${curto(p.it)}) ` + (p.it.cliente ? 'marcado como no ar. O cliente será avisado.' : 'vai ser fechado.') + (pend.size > 1 ? ` (+${pend.size - 1})` : '')),
      h('button', { type: 'button', class: 'mp-desf-b', onclick: () => desfazerNoAr(n) }, `Desfazer ${seg}s`));
  }
  function rodapeNoAr() {
    const L = (estado.no_ar_itens || []).filter(it => !feitos.has(it.n));
    if (!L.length) return null;
    const cli = L.filter(x => x.cliente).length, int = L.length - cli;
    const partes = [];
    if (cli) partes.push(h('span', null, h('b', null, `${cli} de cliente`), ' esperando ele confirmar (fecham sozinhos em 7 dias)'));
    if (int) partes.push(h('span', null, h('b', null, `${int} interno${int > 1 ? 's' : ''}`), ' só falta fechar'));
    return h('div', { class: 'mp-rod' }, h('span', { class: 'mp-dot verde' }),
      h('span', { class: 'mp-rod-t' }, `${L.length} já estão no ar: `, partes.length > 1 ? [partes[0], ' e ', partes[1]] : partes[0]),
      h('button', { type: 'button', class: 'mp-b', onclick: () => { vista = 'noar'; marcados = null; desenhar(); } }, 'Ver'));
  }
  function desenharNoAr() {
    const L = ((estado && estado.no_ar_itens) || []).filter(it => !feitos.has(it.n)).sort((a, b) => a.cliente - b.cliente);
    if (!marcados) marcados = new Set(L.filter(x => !x.cliente).map(x => x.n));
    const cab = h('div', { class: 'mp-cab' }, abas(),
      h('div', { class: 'mp-tit' }, h('span', { class: 'mp-ponto' }), `No ar · ${L.length}`, h('button', { type: 'button', class: 'mp-link mp-atu', onclick: () => { vista = 'painel'; desenhar(); } }, '← voltar')),
      h('div', { class: 'mp-meta' }, 'Os de cliente fecham quando ele confirma no Suporte. Os internos você pode fechar aqui.'));
    const corpo = h('div', { class: 'mp-corpo' }, L.map(it => h('label', { class: 'mp-chk' + (it.cliente ? ' cli' : '') },
      h('input', { type: 'checkbox', disabled: it.cliente, checked: !it.cliente && marcados.has(it.n), onchange: ev => { ev.target.checked ? marcados.add(it.n) : marcados.delete(it.n); desenhar(); } }),
      h('span', null, h('b', null, '#' + it.n), ' ', it.nome, h('span', { class: 'mp-meta', style: 'display:block' }, (it.cliente ? 'de cliente · ' : 'interno · ') + (it.meta || ''))))));
    const k = [...marcados].filter(n => L.some(x => x.n === n && !x.cliente));
    const pe = h('div', { class: 'mp-rod' }, h('button', {
      type: 'button', class: 'mp-b pri', disabled: !k.length, onclick: async () => {
        if (!confirm(`Fechar ${k.length} chamado(s) interno(s) que já estão no ar?`)) return;
        await fecharInternos(k); vista = 'painel'; desenhar();
      },
    }, k.length ? `Fechar os ${k.length} internos marcados` : 'Nenhum interno marcado'));
    painel.replaceChildren(cab, corpo, pe);
  }

  function abas() {
    const aba = LS.get('aba', 'painel');
    return h('div', { class: 'mp-abas' },
      [['painel', 'Painel'], ['pergunta', 'Pergunta rápida']].map(([k, v]) => h('button', {
        type: 'button', class: 'mp-aba' + (aba === k ? ' on' : ''),
        onclick: () => { LS.set('aba', k); desenhar(); if (k === 'pergunta') setTimeout(() => document.getElementById('mpPergTexto')?.focus(), 30); },
      }, v)),
      h('span', { class: 'mp-esp' }),
      h('button', { type: 'button', class: 'mp-ic', title: 'Fechar painel', onclick: alternarPainel }, '✕'));
  }

  function desenhar() {
    if (!painel) return;
    if (LS.get('aba', 'painel') === 'pergunta') { desenharPergunta(); return; }
    if (vista === 'noar' && estado) { desenharNoAr(); return; }
    const cab = h('div', { class: 'mp-cab' }, abas(),
      h('div', { class: 'mp-tit' }, h('span', { class: 'mp-ponto' }), 'Painel Maestro',
        h('span', { class: 'mp-atu' }, estado ? 'atualizado ' + estado.atualizado : ''),
        h('button', { type: 'button', class: 'mp-ic' + (lendo ? ' girando' : ''), title: 'Atualizar agora', onclick: atualizar }, '↻')),
      estado ? h('div', { class: 'mp-linha' }, h('span', { class: 'mp-rot' }, 'Quem constrói:'),
        h('div', { class: 'mp-seg' }, Object.entries(AG).map(([k, v]) => h('button', {
          type: 'button', class: ((estado.receitas || {}).construir_padrao || 'claude') === k ? 'on' : '',
          onclick: async () => { await salvarReceitas({ construir_padrao: k }); toast(`Agente padrão para construir: ${v}`); },
        }, v)))) : null,
      h('div', { class: 'mp-chips' }, CLIENTES.map(([k, v]) => h('button', {
        type: 'button', class: 'mp-chip' + (LS.get('cliente', 'todos') === k ? ' on' : ''),
        onclick: () => { LS.set('cliente', k); desenhar(); },
      }, v))));

    const corpo = h('div', { class: 'mp-corpo' });
    if (!estado) {
      corpo.appendChild(h('div', { class: 'mp-vazio' }, erro ? 'Não consegui ler o painel: ' + erro : 'Carregando…'));
    } else {
      if (erro) corpo.appendChild(h('div', { class: 'mp-vazio erro' }, 'Última leitura falhou: ' + erro));
      const porChave = Object.fromEntries((estado.grupos || []).map(g => [g.chave, g.itens || []]));
      const fase = ([chave, titulo, cor]) => {
        const itens = (porChave[chave] || []).filter(filtroOk).filter(it => !escondido(it.n));
        corpo.appendChild(secao(chave, titulo, cor, listaSecao(chave, itens), itens.length, ['voce', 'testar', 'exec'].includes(chave)));
      };
      // Primeiro o que precisa de você
      SECOES.slice(0, 3).forEach(fase);
      // Agentes trabalhando agora
      const ag = estado.agentes || [];
      corpo.appendChild(secao('agentes', 'Agentes trabalhando agora', 'pulsando', ag.length ? ag.map(a => h('div', { class: 'mp-row' },
        h('div', { class: 'mp-nome flex' }, h('span', { class: 'mp-dot ' + (a.agente === 'erro' ? 'vermelho' : 'verde') }), h('b', null, a.nome)),
        h('div', { class: 'mp-meta' }, a.tarefa + (a.tempo ? ' · há ' + a.tempo : '')),
        (a.pode_parar || a.sessao) ? h('div', { class: 'mp-acoes' },
          a.sessao ? h('button', { type: 'button', class: 'mp-b', onclick: () => abrirSessao(a.sessao) }, 'Abrir conversa') : null,
          a.pode_parar ? h('button', {
            type: 'button', class: 'mp-b perigo',
            onclick: async () => {
              if (!confirm(`Parar ${a.nome} (${a.tarefa})?\nO trabalho já salvo na pasta fica; o que estava no meio se perde.`)) return;
              try { await chamar('parar', { pid: a.pid }); toast('Agente parado'); setTimeout(atualizar, 1500); } catch (e) { toast('Não deu: ' + (e.message || e), 'error'); }
            },
          }, 'Parar') : null) : null)) : h('div', { class: 'mp-vazio' }, 'Nenhum agente trabalhando agora'), ag.length));
      // Arquivos
      const arq = estado.arquivos || [];
      corpo.appendChild(secao('arquivos', 'Arquivos saindo', 'azul', arq.length ? arq.slice(0, 8).map(f => h('div', { class: 'mp-row' },
        h('a', { class: 'mp-nome', href: f.url, target: '_blank', rel: 'noopener' }, f.nome),
        h('div', { class: 'mp-meta' }, h('span', { class: 'mp-tag' }, f.tipo), ' ', f.quando),
        h('div', { class: 'mp-acoes' },
          h('button', { type: 'button', class: 'mp-b pri', onclick: () => window.open(f.url, '_blank', 'noopener') }, 'Abrir'),
          h('button', { type: 'button', class: 'mp-b', onclick: () => { navigator.clipboard.writeText(f.url).then(() => toast('Link copiado')); } }, 'Copiar link')))) :
        h('div', { class: 'mp-vazio' }, 'Nenhum arquivo recente'), arq.length));
      SECOES.slice(3).forEach(fase);
      const rod = rodapeNoAr();
      if (rod) corpo.appendChild(rod);
    }
    const velho = painel.querySelector('.mp-corpo');
    const rolagem = velho ? velho.scrollTop : 0;
    painel.replaceChildren(...[cab, corpo, barraDesfazer()].filter(Boolean));
    corpo.scrollTop = rolagem;
    clearInterval(tique);
    if (pend.size) tique = setInterval(() => {
      const b = painel.querySelector('.mp-desf-b'); const ult = [...pend.values()].pop();
      if (!b || !ult) { clearInterval(tique); return; }
      b.textContent = `Desfazer ${Math.max(0, Math.ceil((ult.ate - Date.now()) / 1000))}s`;
    }, 500);
  }

  async function abrirSessao(sid) {
    try { if (typeof switchPanel === 'function') await switchPanel('chat'); await loadSession(sid); }
    catch (e) { toast('Essa conversa não abre aqui no navegador', 'error'); }
  }

  async function salvarReceitas(parcial) {
    try {
      const r = await chamar('receitas', parcial);
      if (estado) estado.receitas = r;
      if (agentesInfo) agentesInfo.receitas = r;
      desenhar();
      if (telaAgentes && !telaAgentes.hidden) desenharAgentes();
      return r;
    } catch (e) { toast('Não consegui salvar: ' + (e.message || e), 'error'); throw e; }
  }

  async function atualizar() {
    if (lendo) return;
    lendo = true; desenhar();
    try { estado = await chamar('estado'); erro = ''; }
    catch (e) { erro = String((e && e.message) || e).slice(0, 160); }
    finally { lendo = false; desenhar(); desenharAmbiente(); }
  }

  // ── aviso de ambiente ──────────────────────────────────────────────────────
  function desenharAmbiente() {
    const alvo = document.querySelector('.app-titlebar-left');
    if (!alvo) return;
    let b = document.getElementById('mpAmbiente');
    const amb = estado && estado.ambiente;
    const naVps = amb ? amb.maquina === 'VPS' : /vpsbr|127\.0\.0\.1|localhost/.test(location.hostname);
    if (!b) {
      b = h('button', { id: 'mpAmbiente', type: 'button', class: 'mp-amb', onclick: ev => { ev.stopPropagation(); menuAmbiente(b); } });
      alvo.appendChild(b);
    }
    b.className = 'mp-amb ' + (naVps ? 'vps' : 'mac');
    const curto = window.innerWidth < 700;
    b.replaceChildren(h('span', { class: 'mp-amb-d' }), naVps ? (curto ? 'VPS' : 'Você está na VPS · online 24h') : (curto ? 'Mac' : 'Você está no Mac · local'), h('span', { class: 'mp-amb-v' }, '▾'));
    if (!document.getElementById('mpBtnPergunta')) {
      alvo.appendChild(h('button', { id: 'mpBtnPergunta', type: 'button', class: 'mp-btn-perg', title: 'Pergunta rápida (não entra na conversa)', onclick: abrirPergunta }, '💬', h('span', null, ' Pergunta')));
    }
    b.title = naVps ? 'O trabalho continua mesmo com o Mac fechado. É onde fica o Maestro.' : 'Só funciona com o Mac ligado.';
  }
  function menuAmbiente(ancora) {
    fecharMenus();
    const amb = (estado && estado.ambiente) || { maquina: 'VPS', mac: { estado: 'desconhecido', url: '' } };
    const macOn = amb.mac && amb.mac.estado === 'ligado';
    const r = ancora.getBoundingClientRect();
    const menu = h('div', { class: 'mp-menu', style: `top:${r.bottom + 6}px;left:${Math.max(8, r.left - 40)}px` },
      h('div', { class: 'mp-mi on' }, h('span', { class: 'mp-dot verde' }),
        h('div', null, h('b', null, 'VPS (servidor online)'), h('span', null, `Liga 24h${amb.ligada_ha ? ' · ligada há ' + amb.ligada_ha : ''}. Os agentes seguem trabalhando com o Mac fechado. É onde fica o Maestro.`)),
        h('span', { class: 'mp-ok' }, '✓')),
      h('div', {
        class: 'mp-mi' + (macOn ? '' : ' off'),
        onclick: () => { if (macOn && amb.mac.url) window.open(amb.mac.url, '_blank', 'noopener'); },
      }, h('span', { class: 'mp-dot ' + (macOn ? 'amarelo' : 'cinza') }),
        h('div', null, h('b', null, 'Mac (local)'), h('span', null, macOn ? 'Ligado. Clique para abrir o Hermes do Mac. Só funciona com o Mac ligado; o que fizer lá fica lá.' : `Desligado agora. Quando ligar, aparece aqui para trocar.`))),
      h('div', { class: 'mp-mi-nota' }, 'Conta que paga o Hermes: veja em ', h('a', { href: '#', onclick: ev => { ev.preventDefault(); fecharMenus(); abrirAgentes(); } }, 'Agentes'), '.'));
    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', fecharMenus, { once: true }), 0);
  }
  function fecharMenus() { document.querySelectorAll('.mp-menu').forEach(m => m.remove()); }

  // ── tela Agentes (quem paga + montar equipe) ───────────────────────────────
  let telaAgentes = null, receitaSel = null, tarefaSel = '';
  async function abrirAgentes() {
    if (!telaAgentes) {
      telaAgentes = h('div', { id: 'mpAgentes', class: 'mp-tela', hidden: true, onclick: ev => { if (ev.target === telaAgentes) fecharAgentes(); } });
      document.body.appendChild(telaAgentes);
      document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && telaAgentes && !telaAgentes.hidden) fecharAgentes(); });
    }
    telaAgentes.hidden = false;
    document.getElementById('mpRailAgentes')?.classList.add('active');
    desenharAgentes();
    try { agentesInfo = await chamar('agentes'); } catch (e) { agentesInfo = { erro: String(e.message || e) }; }
    if (!estado) await atualizar();
    desenharAgentes();
  }
  function fecharAgentes() { telaAgentes.hidden = true; document.getElementById('mpRailAgentes')?.classList.remove('active'); }

  function desenharAgentes() {
    if (!telaAgentes) return;
    const info = agentesInfo;
    const card = h('div', { class: 'mp-card-tela' });
    card.appendChild(h('div', { class: 'mp-tela-cab' }, h('h2', null, 'Agentes'), h('button', { type: 'button', class: 'mp-ic', onclick: fecharAgentes, title: 'Fechar (Esc)' }, '✕')));
    if (!info) { card.appendChild(h('div', { class: 'mp-vazio' }, 'Carregando…')); telaAgentes.replaceChildren(card); return; }
    if (info.erro) { card.appendChild(h('div', { class: 'mp-vazio erro' }, 'Não consegui ler: ' + info.erro)); telaAgentes.replaceChildren(card); return; }
    const pag = Object.fromEntries(info.pagadores.map(p => [p.agente, p]));

    card.appendChild(h('h3', { class: 'mp-h3' }, 'Seus agentes e quem paga'));
    card.appendChild(h('div', { class: 'mp-grid' }, info.pagadores.map(p => h('div', { class: 'mp-ag' },
      h('div', { class: 'mp-ag-n' }, p.nome), h('div', { class: 'mp-ag-f' }, p.papel),
      h('div', { class: 'mp-pay ' + (p.tipo === 'assinatura' ? 'sub' : 'api') },
        h('span', null, p.tipo === 'assinatura' ? '✅' : '💳'), h('div', null, h('b', null, p.titulo), p.conta)),
      p.nota ? h('div', { class: 'mp-ag-nota' }, p.nota) : null))));
    card.appendChild(h('div', { class: 'mp-leg' }, h('span', null, h('i', { class: 'sub' }), 'Assinatura: mensalidade, já está paga (tem limite semanal)'), h('span', null, h('i', { class: 'api' }), 'API: cada uso custa, sai do crédito')));

    // Montar equipe
    const rc = info.receitas;
    if (!receitaSel) receitaSel = JSON.parse(JSON.stringify(rc.receitas.find(r => r.id === rc.padrao) || rc.receitas[0]));
    card.appendChild(h('h3', { class: 'mp-h3' }, 'Montar equipe para uma tarefa grande'));
    const todos = estado ? (estado.grupos || []).filter(g => g.chave !== 'exec').flatMap(g => g.itens.map(it => Object.assign({ fase: g.titulo }, it))) : [];
    const eq = h('div', { class: 'mp-eq' });
    eq.appendChild(h('div', { class: 'mp-linha' }, h('span', { class: 'mp-rot' }, 'Tarefa:'),
      h('select', { class: 'mp-sel grande', onchange: ev => { tarefaSel = ev.target.value; } },
        h('option', { value: '' }, '— escolha um chamado —'),
        todos.map(it => h('option', { value: String(it.n), selected: String(it.n) === tarefaSel }, `#${it.n} (${it.nome.slice(0, 90)}) · ${it.fase}`)))));
    eq.appendChild(h('div', { class: 'mp-linha' }, h('span', { class: 'mp-rot' }, 'Receita:'),
      rc.receitas.map(r => h('button', {
        type: 'button', class: 'mp-chip' + (receitaSel.id === r.id ? ' on' : ''),
        onclick: () => { receitaSel = JSON.parse(JSON.stringify(r)); desenharAgentes(); },
      }, r.nome + (rc.padrao === r.id ? ' ★' : ''))),
      h('button', {
        type: 'button', class: 'mp-chip tracejado', onclick: () => {
          const nome = prompt('Nome da nova receita:');
          if (!nome) return;
          receitaSel = { id: 'r' + Date.now().toString(36), nome: nome.trim(), etapas: Object.assign({}, receitaSel.etapas), nova: true };
          desenharAgentes();
        },
      }, '+ Criar receita')));
    const passos = h('div', { class: 'mp-passos' });
    ETAPAS.forEach(([k, t, d], i) => {
      const ag = receitaSel.etapas[k] || '';
      const p = pag[ag];
      passos.appendChild(h('div', { class: 'mp-passo' },
        h('div', { class: 'mp-passo-k' }, t), h('div', { class: 'mp-passo-t' }, d),
        h('select', {
          class: 'mp-sel', onchange: ev => { receitaSel.etapas[k] = ev.target.value; desenharAgentes(); },
        }, h('option', { value: '', selected: !ag }, '— pular esta etapa'), Object.entries(AG).map(([ak, av]) => h('option', { value: ak, selected: ag === ak }, av))),
        p ? h('div', { class: 'mp-paga ' + (p.tipo === 'assinatura' ? 'sub' : 'api') }, p.tipo === 'assinatura' ? '✅ Assinatura' : '💳 API') : h('div', { class: 'mp-paga' }, 'não roda')));
      if (i < ETAPAS.length - 1) passos.appendChild(h('div', { class: 'mp-seta' }, '→'));
    });
    passos.appendChild(h('div', { class: 'mp-seta' }, '→'));
    passos.appendChild(h('div', { class: 'mp-passo voce' }, h('div', { class: 'mp-passo-k' }, '5. Você'), h('div', { class: 'mp-passo-t' }, 'Recebe link, usuário, senha e roteiro')));
    eq.appendChild(passos);

    const avisos = [];
    if (receitaSel.etapas.construir && receitaSel.etapas.construir === receitaSel.etapas.revisar) avisos.push('Quem constrói não deve revisar: escolha outro agente na etapa 3.');
    if (receitaSel.etapas.construir && pag[receitaSel.etapas.construir] && pag[receitaSel.etapas.construir].tipo === 'api') avisos.push('Construir é o trabalho mais pesado e este agente cobra por uso.');
    eq.appendChild(h('div', { class: 'mp-regras' },
      h('div', null, h('b', null, 'Regra 1: quem constrói não revisa'), 'Se o mesmo agente estiver nas etapas 2 e 3, aparece um aviso.'),
      h('div', null, h('b', null, 'Regra 2: trabalho pesado vai para a assinatura'), 'Construir e revisar rodam em quem já está pago.'),
      h('div', null, h('b', null, 'Regra 3: a receita fica salva'), 'Monte uma vez e use em todos os chamados; dá para trocar o agente só de um chamado no painel.')));
    if (avisos.length) eq.appendChild(h('div', { class: 'mp-aviso' }, avisos.map(a => h('div', null, '⚠️ ' + a))));

    eq.appendChild(h('div', { class: 'mp-go' },
      h('button', {
        type: 'button', class: 'mp-b', onclick: async () => {
          const lista = rc.receitas.filter(r => r.id !== receitaSel.id).concat([{ id: receitaSel.id, nome: receitaSel.nome, etapas: receitaSel.etapas }]);
          await salvarReceitas({ receitas: lista }); delete receitaSel.nova; toast(`Receita "${receitaSel.nome}" salva`);
        },
      }, 'Salvar receita'),
      h('button', {
        type: 'button', class: 'mp-b', onclick: async () => {
          const lista = rc.receitas.some(r => r.id === receitaSel.id) ? rc.receitas : rc.receitas.concat([receitaSel]);
          await salvarReceitas({ receitas: lista, padrao: receitaSel.id }); toast(`"${receitaSel.nome}" agora é a receita padrão`);
        },
      }, 'Usar como padrão'),
      h('span', { class: 'mp-esp' }),
      h('button', {
        type: 'button', class: 'mp-b', onclick: async () => {
          const it = todos.find(x => String(x.n) === tarefaSel);
          if (!it) return toast('Escolha a tarefa primeiro', 'error');
          await salvarPorChamado(it, receitaSel);
          mudar(it, 'fila', `${rotulo(it)} foi para a fila com a receita "${receitaSel.nome}"`);
        },
      }, 'Para a fila'),
      h('button', {
        type: 'button', class: 'mp-b pri', onclick: async () => {
          const it = todos.find(x => String(x.n) === tarefaSel);
          if (!it) return toast('Escolha a tarefa primeiro', 'error');
          await salvarPorChamado(it, receitaSel);
          fecharAgentes();
          ACOES.executar(it);
        },
      }, 'Executar agora')));
    card.appendChild(eq);
    telaAgentes.replaceChildren(card);
  }
  async function salvarPorChamado(it, rec) {
    const rc = agentesInfo.receitas;
    const lista = rc.receitas.some(r => r.id === rec.id) ? rc.receitas : rc.receitas.concat([{ id: rec.id, nome: rec.nome, etapas: rec.etapas }]);
    const por = Object.assign({}, rc.por_chamado || {});
    por[String(it.n)] = { receita: rec.id, construir: rec.etapas.construir || '' };
    await salvarReceitas({ receitas: lista, por_chamado: por });
  }

  // ── barra de ícones (rail) ─────────────────────────────────────────────────
  function montarRail() {
    const rail = document.querySelector('nav.rail');
    if (!rail || document.getElementById('mpRailPainel')) return;
    const ref = rail.querySelector('.rail-spacer');
    const svgPainel = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/><path d="M18 8h0"/><path d="M6 8h6M6 12h6M6 16h4"/></svg>';
    const svgAg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4"/><circle cx="12" cy="3" r="1"/><circle cx="9" cy="14" r="1.2"/><circle cx="15" cy="14" r="1.2"/></svg>';
    const b1 = h('button', { id: 'mpRailPainel', type: 'button', class: 'rail-btn nav-tab has-tooltip', 'data-tooltip': 'Painel Maestro', 'aria-label': 'Painel Maestro', onclick: alternarPainel });
    b1.innerHTML = svgPainel;
    const b2 = h('button', { id: 'mpRailAgentes', type: 'button', class: 'rail-btn nav-tab has-tooltip', 'data-tooltip': 'Agentes: quem paga e montar equipe', 'aria-label': 'Agentes', onclick: abrirAgentes });
    b2.innerHTML = svgAg;
    rail.insertBefore(b1, ref); rail.insertBefore(b2, ref);
  }

  // ── barra de conversas: nomes amigáveis + filtros ──────────────────────────
  const ORIGENS = [
    ['tudo', 'Tudo', null], ['desktop', '💻 App do Mac', ['desktop']], ['terminal', '⌨️ Terminal', ['cli', 'tui', 'acp']],
    ['telegram', '✈️ Telegram', ['telegram']], ['auto', '🤖 Automáticas', ['cron', 'oneshot', 'kanban', 'webhook']], ['ajudantes', '🧩 Ajudantes', ['subagent']],
  ];
  const CLI_RE = [['todos', 'Todos', null], ['homeset', 'Homeset', /homeset|hset|\bhs\b/i], ['goon', 'GO ON', /go ?on|goon/i], ['meraki', 'Meraki', /meraki|mrk/i]];
  function traduzirFixos() {
    try {
      for (const lang of ['pt', 'en']) {
        if (!LOCALES[lang]) continue;
        LOCALES[lang].sessions_source_webui = '🌐 Navegador ({0})';
        LOCALES[lang].sessions_source_cli = '💻 App e outros ({0})';
      }
    } catch (_) {}
  }
  let aplicando = false, observador = null;
  function ajustarLista() {
    const lista = document.getElementById('sessionList');
    if (!lista || aplicando) return;
    aplicando = true;
    try {
      lista.querySelectorAll('.session-source-tab').forEach(b => {
        b.textContent = b.textContent.replace(/Sess(?:ões|ions?) WebUI|WebUI sessions/i, '🌐 Navegador').replace(/Sess(?:ões|ions?) CLI|CLI sessions/i, '💻 App e outros');
        if (/Navegador/.test(b.textContent)) b.title = 'Conversas feitas aqui pelo navegador (Hermes WebUI)';
        else b.title = 'Conversas do app do Mac, do terminal, do Telegram, automáticas e de ajudantes';
      });
      const bar = lista.querySelector('.project-bar');
      if (bar) {
        if (!bar.querySelector('.mp-rot-grupos')) bar.insertBefore(h('span', { class: 'mp-rot-grupos' }, 'Grupos:'), bar.firstChild);
        bar.querySelectorAll('.project-chip').forEach(c => {
          if (c.textContent === 'All') c.textContent = 'Todos';
          if (c.textContent === 'Unassigned') { c.textContent = 'Sem grupo'; c.title = 'Conversas que ainda não estão em nenhum grupo'; }
        });
        const add = bar.querySelector('.project-create-btn');
        if (add) { add.title = 'Novo grupo'; add.textContent = '+ Grupo'; }
      }
      lista.querySelectorAll(':scope > div').forEach(d => {
        const t = d.textContent;
        let m;
        if ((m = t.match(/^Show (\d+) from other profiles$/))) d.textContent = `Mostrar ${m[1]} de outros perfis`;
        else if (t === 'Show active profile only') d.textContent = 'Mostrar só este perfil';
        else if ((m = t.match(/^Show (\d+) archived$/))) d.textContent = `Mostrar ${m[1]} arquivadas`;
        else if (t === 'Hide archived') d.textContent = 'Esconder arquivadas';
      });

      // filtros próprios
      const abaCli = !!lista.querySelector('.session-source-tab.active') && /App e outros/.test(lista.querySelector('.session-source-tab.active').textContent);
      let f = lista.querySelector('.mp-filtros');
      if (!f) {
        f = h('div', { class: 'mp-filtros' });
        const ancora = bar || lista.querySelector('.session-source-tabs');
        if (ancora && ancora.nextSibling) lista.insertBefore(f, ancora.nextSibling); else lista.appendChild(f);
      }
      const itens = [...lista.querySelectorAll('.session-item')];
      const origemSel = abaCli ? LS.get('origem', 'tudo') : 'tudo';
      const cliSel = LS.get('cliConv', 'todos');
      const linhaOrig = abaCli ? h('div', { class: 'mp-frow' }, h('span', { class: 'mp-rot' }, 'Origem:'), ORIGENS.map(([k, v, keys]) => {
        const n = keys ? itens.filter(i => keys.includes((i.dataset.sourceKey || '').toLowerCase())).length : itens.length;
        if (keys && !n && origemSel !== k) return null;
        return h('button', { type: 'button', class: 'mp-chip mini' + (origemSel === k ? ' on' : ''), onclick: () => { LS.set('origem', k); ajustarLista(); } }, `${v}${keys ? ' ' + n : ''}`);
      })) : null;
      const linhaCli = h('div', { class: 'mp-frow' }, h('span', { class: 'mp-rot' }, 'Cliente:'), CLI_RE.map(([k, v]) => h('button', {
        type: 'button', class: 'mp-chip mini' + (cliSel === k ? ' on' : ''), onclick: () => { LS.set('cliConv', k); ajustarLista(); },
      }, v)));
      f.replaceChildren(...[linhaOrig, linhaCli].filter(Boolean));
      const origKeys = (ORIGENS.find(o => o[0] === origemSel) || [])[2];
      const cliRe = (CLI_RE.find(o => o[0] === cliSel) || [])[2];
      itens.forEach(i => {
        const tit = (i.querySelector('.session-title') || i).textContent || '';
        if (/^Pergunta rápida do Allysson/.test(tit)) { i.classList.add('mp-oculto'); return; }
        const ok = (!origKeys || origKeys.includes((i.dataset.sourceKey || '').toLowerCase())) && (!cliRe || cliRe.test(tit));
        i.classList.toggle('mp-oculto', !ok);
      });
      lista.querySelectorAll('.session-date-group').forEach(g => {
        const vis = [...g.querySelectorAll('.session-item')].some(i => !i.classList.contains('mp-oculto'));
        g.classList.toggle('mp-oculto', !vis && (origKeys || cliRe));
      });
    } finally {
      aplicando = false;
      if (observador) observador.takeRecords(); // descarta as mudanças feitas por mim mesmo
    }
  }


  // ── pergunta rápida ────────────────────────────────────────────────────────
  let perguntas = LS.get('perguntas', []);
  let pergRascunho = '';
  const sessaoAtual = () => { try { return (S && S.session && S.session.session_id) || ''; } catch (_) { return ''; } };
  function guardarPerguntas() { LS.set('perguntas', perguntas.slice(-30).map(p => Object.assign({}, p, { estado: p.estado === 'pensando' ? 'erro' : p.estado, resposta: p.estado === 'pensando' ? 'a página foi recarregada antes da resposta' : p.resposta }))); }

  function desenharPergunta() {
    const comAssunto = LS.get('perg.assunto', true);
    const lista = h('div', { class: 'mp-qa', id: 'mpQa' });
    if (!perguntas.length) {
      lista.appendChild(h('div', { class: 'mp-qa-vazio' },
        h('b', null, 'Pergunte qualquer coisa aqui.'),
        'A resposta fica só neste painel e não entra na conversa principal. Funciona mesmo enquanto o Hermes está trabalhando.'));
    }
    perguntas.forEach((p, i) => {
      lista.appendChild(h('div', { class: 'mp-q' }, p.pergunta));
      const resp = h('div', { class: 'mp-a' + (p.estado === 'erro' ? ' erro' : '') });
      if (p.estado === 'pensando') resp.appendChild(h('span', { class: 'mp-pensando' }, 'pensando…'));
      else {
        const corpo = h('div', { class: 'mp-a-txt' });
        try { corpo.innerHTML = typeof renderMd === 'function' ? renderMd(p.resposta) : ''; } catch (_) { corpo.textContent = p.resposta; }
        if (!corpo.innerHTML) corpo.textContent = p.resposta;
        resp.appendChild(corpo);
      }
      resp.appendChild(h('small', null, (p.com_assunto ? 'sabia do assunto da conversa' : 'pergunta solta') + ' · não entrou no histórico'));
      if (p.estado === 'pronto') resp.appendChild(h('div', { class: 'mp-a-acoes' },
        h('button', {
          type: 'button', class: 'mp-link', onclick: () => {
            const m = document.getElementById('msg');
            if (!m) return;
            m.value = (m.value ? m.value + '\n\n' : '') + `Sobre a pergunta rápida "${p.pergunta}", a resposta foi:\n${p.resposta}`;
            m.dispatchEvent(new Event('input', { bubbles: true })); m.focus();
            toast('Copiei para a caixa de mensagem; é só enviar');
          },
        }, '↳ Levar para a conversa principal'),
        h('button', { type: 'button', class: 'mp-link', onclick: () => { navigator.clipboard.writeText(p.resposta).then(() => toast('Resposta copiada')); } }, 'Copiar'),
        h('button', { type: 'button', class: 'mp-link', onclick: () => { perguntas.splice(i, 1); guardarPerguntas(); desenhar(); } }, 'Apagar')));
      lista.appendChild(resp);
    });
    const caixa = h('textarea', {
      id: 'mpPergTexto', class: 'mp-perg-txt', rows: '3',
      placeholder: 'Pergunte qualquer coisa. Não atrapalha a conversa principal',
      oninput: ev => { pergRascunho = ev.target.value; },
      onkeydown: ev => { if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); perguntar(); } },
    });
    caixa.value = pergRascunho;
    const entrada = h('div', { class: 'mp-perg-in' }, caixa,
      h('div', { class: 'mp-linha' },
        h('button', { type: 'button', class: 'mp-chip mini' + (comAssunto ? ' on' : ''), title: 'Ela lê as últimas mensagens da conversa aberta', onclick: () => { LS.set('perg.assunto', true); desenhar(); } }, 'Usar o assunto da conversa'),
        h('button', { type: 'button', class: 'mp-chip mini' + (!comAssunto ? ' on' : ''), onclick: () => { LS.set('perg.assunto', false); desenhar(); } }, 'Pergunta solta'),
        h('span', { class: 'mp-esp' }),
        perguntas.length ? h('button', { type: 'button', class: 'mp-link', onclick: () => { if (confirm('Apagar todas as perguntas rápidas?')) { perguntas = []; guardarPerguntas(); desenhar(); } } }, 'Limpar') : null,
        h('button', { type: 'button', class: 'mp-b pri', onclick: perguntar }, 'Perguntar')));
    painel.replaceChildren(h('div', { class: 'mp-cab' }, abas()), lista, entrada);
    lista.scrollTop = lista.scrollHeight;
  }

  async function perguntar() {
    const texto = (pergRascunho || '').trim();
    if (!texto) return;
    const comAssunto = LS.get('perg.assunto', true);
    const item = { pergunta: texto, estado: 'pensando', resposta: '', com_assunto: comAssunto };
    perguntas.push(item); pergRascunho = ''; desenhar();
    try {
      const r = await chamar('pergunta', { pergunta: texto, com_assunto: comAssunto, sessao: sessaoAtual() });
      item.com_assunto = r.com_assunto;
      for (let i = 0; i < 150; i++) {
        await new Promise(ok => setTimeout(ok, 2000));
        const s = await chamar('pergunta/' + r.id);
        if (s.estado !== 'pensando') { item.estado = s.estado; item.resposta = s.resposta; break; }
      }
      if (item.estado === 'pensando') { item.estado = 'erro'; item.resposta = 'demorou demais'; }
    } catch (e) { item.estado = 'erro'; item.resposta = 'Não consegui perguntar: ' + (e.message || e); }
    guardarPerguntas();
    if (LS.get('aba', 'painel') === 'pergunta') desenhar(); else toast('A pergunta rápida foi respondida');
  }

  // ── memória da conversa + Renovar contexto ────────────────────────────────
  let renovarPendente = false, faixa = null;
  function limiteAuto() {
    const t = (document.getElementById('ctxTooltipThreshold') || {}).textContent || '';
    const m = t.match(/\((\d+)%\)/);
    return m ? Number(m[1]) : 50;
  }
  function ocupado() { try { return !!(S && (S.busy || S.activeStreamId)); } catch (_) { return false; } }
  function montarFaixa() {
    const comp = document.getElementById('composerWrap');
    if (!comp || document.getElementById('mpCtx')) return;
    faixa = h('div', { id: 'mpCtx', class: 'mp-ctx', hidden: true });
    comp.parentNode.insertBefore(faixa, comp);
  }
  function atualizarFaixa() {
    montarFaixa();
    if (!faixa) return;
    const wrap = document.getElementById('ctxIndicatorWrap');
    const txt = ((document.getElementById('ctxPercent') || {}).textContent || '').trim();
    const pct = /^\d+$/.test(txt) ? Number(txt) : null;
    if (pct === null || !wrap || wrap.style.display === 'none' || !sessaoAtual()) { faixa.hidden = true; return; }
    const lim = limiteAuto(), amarelo = Math.round(lim * 0.7);
    const cor = pct >= lim ? 'r' : pct >= amarelo ? 'a' : 'v';
    const msg = cor === 'r' ? 'Renove agora. Se não renovar, o Hermes renova sozinho no meio do trabalho e pode perder detalhes'
      : cor === 'a' ? 'Bom momento para renovar quando terminar este assunto' : 'Tranquilo, pode seguir';
    const busy = ocupado();
    if (renovarPendente && !busy) { renovarPendente = false; setTimeout(() => renovar(true), 300); }
    const chave = [pct, cor, busy, renovarPendente].join('|');
    if (faixa.dataset.k === chave && !faixa.hidden) return;
    faixa.dataset.k = chave;
    faixa.className = 'mp-ctx ' + cor;
    faixa.hidden = false;
    faixa.replaceChildren(
      h('span', { class: 'mp-ctx-r' }, window.innerWidth < 700 ? '🧠' : '🧠 Memória da conversa'),
      h('span', { class: 'mp-ctx-bar' }, h('i', { style: `width:${Math.min(100, Math.round(pct / lim * 100))}%` })),
      h('b', null, pct + '%'),
      h('span', { class: 'mp-ctx-msg' }, msg),
      h('span', { class: 'mp-esp' }),
      h('button', {
        type: 'button', class: 'mp-b' + (cor !== 'v' ? ' pri' : ''), disabled: renovarPendente,
        title: busy ? 'O Hermes está trabalhando; renovo quando ele terminar' : 'Resumir o que já foi feito e liberar memória',
        onclick: () => renovar(false),
      }, renovarPendente ? (window.innerWidth < 700 ? 'Aguardando' : 'Renovo assim que eu terminar') : (window.innerWidth < 700 ? 'Renovar' : 'Renovar contexto')));
  }
  async function renovar(automatico) {
    if (!automatico) {
      const foco = prompt('Vou resumir o que já fizemos e liberar memória. A conversa continua nesta mesma janela.\n\nO que é importante não esquecer? (opcional)', '');
      if (foco === null) return;
      window.__mpFoco = foco.trim();
      if (ocupado()) { renovarPendente = true; faixa.dataset.k = ''; atualizarFaixa(); toast('Renovo o contexto assim que o Hermes terminar'); return; }
    }
    try {
      if (typeof _runManualCompression !== 'function') throw new Error('função de renovar não encontrada');
      toast('Renovando o contexto…');
      await _runManualCompression(window.__mpFoco || '');
    } catch (e) { toast('Não consegui renovar: ' + (e.message || e), 'error'); }
    finally { window.__mpFoco = ''; if (faixa) faixa.dataset.k = ''; setTimeout(atualizarFaixa, 1500); }
  }

  // ── inicialização ──────────────────────────────────────────────────────────
  // O WebUI não muda o endereço do CSS entre versões: o navegador pode guardar o antigo.
  // Recarrega o CSS com a versão no endereço quando ela muda.
  const VERSAO_CSS = '2.1.1';
  function cssAtual() {
    const l = [...document.querySelectorAll('link[rel="stylesheet"]')].find(x => /maestro-painel\/assets\/painel\.css/.test(x.href));
    if (l && !l.href.includes('v=' + VERSAO_CSS)) l.href = l.href.split('?')[0] + '?v=' + VERSAO_CSS;
  }
  function iniciar() {
    cssAtual();
    traduzirFixos();
    montarRail();
    montarPainel();
    desenharAmbiente();
    montarFaixa(); atualizarFaixa();
    setInterval(atualizarFaixa, 1500);
    const lista = document.getElementById('sessionList');
    if (lista) {
      let pend = false;
      observador = new MutationObserver(() => {
        if (aplicando || pend) return;
        pend = true;
        requestAnimationFrame(() => { pend = false; ajustarLista(); });
      });
      observador.observe(lista, { childList: true, subtree: true });
      ajustarLista();
    }
    atualizar();
    setInterval(() => { if (!document.hidden && painel && !painel.hidden) atualizar(); }, 60000);
    window.addEventListener('resize', () => { if (window.innerWidth < 800 && painel && !painel.hidden && LS.get('aberto', null) === null) painel.hidden = true; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
