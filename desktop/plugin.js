// Painel Maestro — plugin do Hermes Desktop (app do Mac). Mesmas funções da extensão do WebUI:
//  • aba lateral "Maestro" (Painel + Pergunta rápida)
//  • página "Agentes" (quem paga cada um + montar equipe), também no menu da esquerda
//  • selo de ambiente no topo (VPS online x Mac local)
//  • faixa "Memória da conversa" + botão Renovar contexto, acima da caixa de mensagem
// Dados e ações: serviço auxiliar da VPS (127.0.0.1:8796), alcançado pelo gateway do Hermes
// com host.request('shell.exec'). Funciona quando o app está ligado à VPS.
import { host, useValue } from '@hermes/plugin-sdk'
import { useEffect, useRef, useState } from 'react'
import { jsx } from 'react/jsx-runtime'

const TOKEN = '/root/.hermes/webui/sidecar-auth/maestro-painel.token'
const PEDACO = 3400
const URL_BASE = 'http://127.0.0.1:8796/'
const AG = { claude: 'Claude Code', codex: 'Codex', hermes: 'Hermes (Opus)' }
const ETAPAS = [
  ['planejar', '1. Planejar', 'Entende e faz a prancha'],
  ['construir', '2. Construir', 'Escreve o código'],
  ['revisar', '3. Revisar', 'Outro agente confere'],
  ['testar', '4. Testar', 'Abre no navegador e confere'],
]
const CLIENTES = [['todos', 'Todos'], ['HOMESET', 'Homeset'], ['GO ON', 'GO ON'], ['Meraki', 'Meraki'], ['geral', 'Geral']]

// ── acesso ao serviço auxiliar ────────────────────────────────────────────────
const sh = async command => {
  const r = await host.request('shell.exec', { command })
  if (r && typeof r.code === 'number' && r.code !== 0 && !(r.stdout || '').trim()) throw new Error((r.stderr || 'falhou').trim().slice(-200))
  return (r && r.stdout) || ''
}
const b64 = s => btoa(unescape(encodeURIComponent(s)))
async function sc(rota, corpo) {
  const arq = `/root/.hermes/cache/scratch/mp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}.json`
  const tok = `-H "X-Hermes-Sidecar-Token: $(cat ${TOKEN})"`
  const post = corpo ? `-X POST -H 'Content-Type: application/json' --data-binary @-` : ''
  const pre = corpo ? `printf %s '${b64(JSON.stringify(corpo))}' | base64 -d | ` : ''
  const cod = (await sh(`${pre}curl -s -m 25 -o ${arq} -w '%{http_code}' ${tok} ${post} ${URL_BASE}${rota}`)).trim()
  let texto = ''
  for (let i = 0; i < 60; i++) {
    const parte = await sh(`tail -c +${i * PEDACO + 1} ${arq} | head -c ${PEDACO}`)
    texto += parte
    if (parte.length < PEDACO) break
  }
  let dados
  try { dados = JSON.parse(texto) } catch (_) { throw new Error(cod === '000' ? 'o serviço do painel não respondeu' : `resposta inválida (${cod})`) }
  if (!/^2/.test(cod)) throw new Error(dados.erro || `erro ${cod}`)
  return dados
}

// ── visual (variáveis do próprio app) ─────────────────────────────────────────
const CSS = `
.mpd{--bd:var(--ui-border,rgba(127,127,127,.22));--mut:var(--ui-text-tertiary);--tx:var(--ui-text-primary);--tx2:var(--ui-text-secondary);--ac:var(--theme-primary,var(--ui-accent,#4f7cff));--hov:var(--ui-control-hover-background,rgba(127,127,127,.08));color:var(--tx);font-size:13px}
.mpd *{box-sizing:border-box}
.mpd-raiz{display:flex;flex-direction:column;height:100%;min-height:0}
.mpd-cab{padding:8px 10px 8px;border-bottom:1px solid var(--bd);display:flex;flex-direction:column;gap:8px}
.mpd-abas{display:flex;align-items:center;gap:4px}
.mpd-aba{font:inherit;font-size:12px;background:none;border:1px solid transparent;border-radius:7px;padding:3px 9px;color:var(--mut);cursor:pointer}
.mpd-aba.on{border-color:var(--bd);color:var(--tx);font-weight:600;background:var(--ui-bg-tertiary,transparent)}
.mpd-tit{display:flex;align-items:center;gap:7px;font-size:.64rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)}
.mpd-ponto{width:7px;height:7px;border-radius:1px;background:var(--ac)}
.mpd-atu{margin-left:auto;font-weight:400;letter-spacing:0;text-transform:none;font-size:.66rem}
.mpd-ic{background:none;border:0;cursor:pointer;color:var(--mut);font-size:13px;padding:2px 4px;border-radius:5px;line-height:1}
.mpd-ic:hover{background:var(--hov);color:var(--tx)}
.mpd-ic.gira{animation:mpdG 1s linear infinite}@keyframes mpdG{to{transform:rotate(360deg)}}
.mpd-linha{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.mpd-rot{font-size:.68rem;color:var(--mut);white-space:nowrap}
.mpd-seg{display:flex;border:1px solid var(--bd);border-radius:7px;overflow:hidden}
.mpd-seg button{font:inherit;font-size:.7rem;background:none;border:0;padding:3px 7px;cursor:pointer;color:var(--tx2)}
.mpd-seg button+button{border-left:1px solid var(--bd)}
.mpd-seg button.on{background:var(--ac);color:#fff}
.mpd-chip{font:inherit;font-size:.7rem;padding:2px 9px;border-radius:20px;border:1px solid var(--bd);background:none;color:var(--tx2);cursor:pointer;white-space:nowrap}
.mpd-chip:hover{background:var(--hov)}
.mpd-chip.on{border-color:var(--ac);color:var(--ac)}
.mpd-chip.tr{border-style:dashed;color:var(--mut)}
.mpd-corpo{flex:1;min-height:0;overflow-y:auto;padding-bottom:16px}
.mpd-sec{border-bottom:1px solid var(--bd)}
.mpd-sec-cab{display:flex;align-items:center;gap:7px;width:100%;padding:9px 10px;background:none;border:0;cursor:pointer;font:inherit;font-size:.64rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);text-align:left}
.mpd-sec-cab:hover{color:var(--tx)}
.mpd-car{display:inline-block;transition:transform .15s;width:8px}.mpd-sec.ab .mpd-car{transform:rotate(90deg)}
.mpd-st{flex:1}.mpd-cnt{font-variant-numeric:tabular-nums;letter-spacing:0;font-weight:500}
.mpd-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex:none;background:#999}
.mpd-dot.verde{background:var(--ui-green,#22a55a)}.mpd-dot.vermelho{background:var(--ui-red,#e5484d)}.mpd-dot.azul{background:var(--ac)}.mpd-dot.amarelo{background:var(--ui-yellow,#e7a33e)}.mpd-dot.cinza{background:#9a9a9a}.mpd-dot.roxo{background:#8b5cf6}
.mpd-row{padding:6px 10px 7px 25px;display:flex;flex-direction:column;gap:2px}
.mpd-row:hover{background:var(--hov)}
.mpd-nome{font-size:.75rem;color:var(--tx2);line-height:1.35;text-decoration:none;cursor:pointer;background:none;border:0;padding:0;text-align:left;font-family:inherit}
.mpd-nome:hover{color:var(--tx)}
.mpd-nome b{color:var(--tx);font-family:var(--font-mono,ui-monospace,monospace);font-size:.68rem;margin-right:5px;font-weight:500}
.mpd-nome.fx{display:flex;gap:6px;align-items:center;cursor:default}
.mpd-meta{font-size:.66rem;color:var(--mut);line-height:1.35}
.mpd-tag{border:1px solid var(--bd);border-radius:4px;padding:0 4px}
.mpd-acoes{display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-top:3px;opacity:.55}
.mpd-row:hover .mpd-acoes,.mpd-acoes:focus-within{opacity:1}
.mpd-b{font:inherit;font-size:.7rem;background:var(--ui-bg-tertiary,transparent);border:1px solid var(--bd);color:var(--tx2);border-radius:6px;padding:2px 8px;cursor:pointer;white-space:nowrap}
.mpd-b:hover{border-color:var(--ac);color:var(--tx)}
.mpd-b.pri{background:var(--ac);border-color:var(--ac);color:#fff}
.mpd-b.pe:hover{border-color:var(--ui-red,#e5484d);color:var(--ui-red,#e5484d)}
.mpd-b[disabled]{opacity:.55;cursor:default}
.mpd-sel{font:inherit;font-size:.66rem;background:transparent;color:var(--mut);border:1px solid var(--bd);border-radius:6px;padding:1px 3px;margin-left:auto;max-width:115px}
.mpd-sel.gr{max-width:none;flex:1;font-size:.78rem;padding:5px 7px;margin:0;color:var(--tx)}
.mpd-mais{background:none;border:0;font:inherit;font-size:.7rem;color:var(--ac);cursor:pointer;padding:3px 25px 9px}
.mpd-vazio{padding:3px 10px 9px 25px;color:var(--ui-text-quaternary,var(--mut));font-size:.7rem}
.mpd-vazio.erro{color:var(--ui-red,#e5484d)}
.mpd-link{background:none;border:0;padding:0;font:inherit;font-size:.7rem;color:var(--ac);cursor:pointer}
.mpd-esp{flex:1}
.mpd-qa{flex:1;min-height:0;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px}
.mpd-qa-v{color:var(--mut);font-size:.75rem;line-height:1.5;padding:6px 2px}.mpd-qa-v b{display:block;color:var(--tx);margin-bottom:3px}
.mpd-q{align-self:flex-end;max-width:88%;background:color-mix(in srgb,var(--ac) 14%,transparent);border-radius:9px;padding:6px 9px;font-size:.78rem;white-space:pre-wrap}
.mpd-a{border:1px solid var(--bd);border-radius:9px;padding:7px 9px;font-size:.78rem;line-height:1.45;white-space:pre-wrap;color:var(--tx2)}
.mpd-a.erro{border-color:var(--ui-red,#e5484d);color:var(--ui-red,#e5484d)}
.mpd-a small{display:block;color:var(--mut);font-size:.64rem;margin-top:5px;white-space:normal}
.mpd-a-ac{display:flex;gap:10px;margin-top:4px;flex-wrap:wrap}
.mpd-pens{color:var(--mut);animation:mpdP 1.2s ease-in-out infinite}@keyframes mpdP{50%{opacity:.4}}
.mpd-in{border-top:1px solid var(--bd);padding:8px 10px;display:flex;flex-direction:column;gap:6px}
.mpd-txt{width:100%;border:1px solid var(--bd);border-radius:9px;padding:7px 9px;font:inherit;font-size:.8rem;resize:vertical;min-height:52px;background:transparent;color:var(--tx)}
.mpd-txt:focus{outline:none;border-color:var(--ac)}
.mpd-amb{display:inline-flex;align-items:center;gap:6px;padding:2px 9px;border-radius:20px;font:inherit;font-size:.7rem;cursor:pointer;border:1px solid;white-space:nowrap;-webkit-app-region:no-drag;app-region:no-drag}
.mpd-amb.vps{background:rgba(34,165,90,.12);border-color:rgba(34,165,90,.45);color:var(--ui-green,#22a55a)}
.mpd-amb.mac{background:rgba(231,163,62,.14);border-color:rgba(231,163,62,.5);color:var(--ui-yellow,#c88a1c)}
.mpd-amb i{width:6px;height:6px;border-radius:50%;background:currentColor}
.mpd-ctx{display:flex;align-items:center;gap:8px;margin:0 0 6px;padding:5px 8px 5px 10px;border-radius:9px;font-size:.72rem;border:1px solid}
.mpd-ctx.v{background:rgba(34,165,90,.07);border-color:rgba(34,165,90,.3);color:var(--ui-green,#22a55a)}
.mpd-ctx.a{background:rgba(231,163,62,.1);border-color:rgba(231,163,62,.45);color:var(--ui-yellow,#c88a1c)}
.mpd-ctx.r{background:rgba(229,72,77,.09);border-color:rgba(229,72,77,.45);color:var(--ui-red,#e5484d)}
.mpd-bar{width:80px;height:5px;border-radius:3px;background:rgba(127,127,127,.2);overflow:hidden;flex:none}.mpd-bar i{display:block;height:100%;background:currentColor}
.mpd-ctx-m{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;opacity:.9}
.mpd-pag{padding:22px 28px 40px;max-width:1100px;margin:0 auto;overflow:auto;height:100%}
.mpd-pag h2{margin:0 0 4px;font-size:1.1rem}
.mpd-h3{font-size:.64rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);margin:20px 0 9px}
.mpd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:9px}
.mpd-ag{border:1px solid var(--bd);border-radius:10px;padding:12px}
.mpd-ag-n{font-weight:600;font-size:.85rem}.mpd-ag-f{color:var(--mut);font-size:.7rem;margin:2px 0 9px}
.mpd-pay{display:flex;gap:7px;align-items:flex-start;padding:8px;border-radius:7px;font-size:.74rem;line-height:1.4}.mpd-pay b{display:block}
.mpd-pay.sub,.mpd-pg.sub{background:rgba(34,165,90,.12);color:var(--ui-green,#22a55a)}
.mpd-pay.api,.mpd-pg.api{background:rgba(231,163,62,.14);color:var(--ui-yellow,#c88a1c)}
.mpd-ag-nt{margin-top:7px;font-size:.68rem;color:var(--mut)}
.mpd-leg{display:flex;gap:16px;flex-wrap:wrap;font-size:.7rem;color:var(--mut);margin-top:9px}
.mpd-eq{border:1px solid var(--bd);border-radius:11px;padding:13px;display:flex;flex-direction:column;gap:11px}
.mpd-passos{display:flex;flex-wrap:wrap;align-items:stretch}
.mpd-passo{flex:1;min-width:140px;border:1px solid var(--bd);border-radius:9px;padding:9px;display:flex;flex-direction:column;gap:5px}
.mpd-passo.voce{border-style:dashed}
.mpd-pk{font-size:.62rem;color:var(--mut);text-transform:uppercase;letter-spacing:.08em}.mpd-pt{font-weight:600;font-size:.78rem}
.mpd-passo .mpd-sel{max-width:none;margin:0;font-size:.74rem;padding:3px;color:var(--tx)}
.mpd-pg{font-size:.66rem;padding:1px 6px;border-radius:5px;align-self:flex-start;color:var(--mut)}
.mpd-seta{width:20px;display:flex;align-items:center;justify-content:center;color:var(--mut)}
.mpd-regras{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px}
.mpd-regras div{border:1px solid var(--bd);border-radius:8px;padding:8px;font-size:.7rem;color:var(--mut);line-height:1.45}.mpd-regras b{display:block;color:var(--tx);margin-bottom:2px}
.mpd-aviso{background:rgba(231,163,62,.14);color:var(--ui-yellow,#c88a1c);border-radius:8px;padding:7px 9px;font-size:.74rem}
.mpd-go{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.mpd-go .mpd-b{font-size:.76rem;padding:5px 12px}
.mpd-menu{position:fixed;z-index:10000;width:330px;background:var(--ui-bg-elevated,var(--ui-bg-secondary,#1f1f1f));color:var(--ui-text-primary);border:1px solid var(--ui-border,rgba(127,127,127,.3));border-radius:11px;padding:6px;box-shadow:0 12px 32px rgba(0,0,0,.35);font-size:.78rem}
.mpd-mi{display:flex;gap:9px;padding:8px;border-radius:7px;align-items:flex-start;cursor:pointer}.mpd-mi:hover{background:var(--ui-control-hover-background)}
.mpd-mi b{display:block;margin-bottom:2px}.mpd-mi span{color:var(--ui-text-tertiary);font-size:.7rem;line-height:1.4}
.mpd-mi .mpd-dot{margin-top:4px}
`
function injetarCss() {
  if (document.getElementById('mpd-css')) return
  const s = document.createElement('style')
  s.id = 'mpd-css'
  s.textContent = CSS
  document.head.appendChild(s)
}

// ── utilidades DOM ────────────────────────────────────────────────────────────
const h = (tag, attrs, ...filhos) => {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue
    if (k === 'class') el.className = v
    else if (k === 'style') el.style.cssText = v
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else el.setAttribute(k, v === true ? '' : v)
  }
  for (const f of filhos.flat()) {
    if (f === null || f === undefined || f === false) continue
    el.appendChild(typeof f === 'string' || typeof f === 'number' ? document.createTextNode(String(f)) : f)
  }
  return el
}
const LS = {
  get: (k, d) => { try { const v = localStorage.getItem('mpd.' + k); return v === null ? d : JSON.parse(v) } catch (_) { return d } },
  set: (k, v) => { try { localStorage.setItem('mpd.' + k, JSON.stringify(v)) } catch (_) {} },
}
const aviso = (msg, erro) => {
  try { if (erro) host.notifyError(msg); else host.notify({ kind: 'success', message: msg }) } catch (_) { try { host.notify(msg) } catch (__) {} }
}
const rotulo = it => `#${it.n} (${it.nome})`

// Componente React que hospeda um desenho em DOM puro (mesma lógica da extensão do WebUI)
function Hospede({ montar, estilo }) {
  const ref = useRef(null)
  useEffect(() => {
    injetarCss()
    const limpar = montar(ref.current)
    return () => { if (typeof limpar === 'function') limpar() }
  }, [])
  return jsx('div', { ref, className: 'mpd', style: Object.assign({ height: '100%', minHeight: 0 }, estilo || {}) })
}

// ── estado compartilhado ──────────────────────────────────────────────────────
const G = { estado: null, erro: '', lendo: false, ouvintes: new Set(), agentes: null }
const avisar = () => G.ouvintes.forEach(f => { try { f() } catch (_) {} })
async function atualizar() {
  if (G.lendo) return
  G.lendo = true; avisar()
  try { G.estado = await sc('estado'); G.erro = '' } catch (e) { G.erro = String((e && e.message) || e).slice(0, 160) }
  finally { G.lendo = false; avisar() }
}
async function salvarReceitas(parcial) {
  try {
    const r = await sc('receitas', parcial)
    if (G.estado) G.estado.receitas = r
    if (G.agentes) G.agentes.receitas = r
    avisar()
    return r
  } catch (e) { aviso('Não consegui salvar: ' + (e.message || e), true); throw e }
}
async function mudar(it, acao, ok) {
  try { await sc('acao', { acao, n: it.n }); aviso(ok); setTimeout(atualizar, 4000) } catch (e) { aviso('Não deu certo: ' + (e.message || e), true) }
}
async function novaConversa(texto, enviar) {
  try {
    host.newChat()
    await new Promise(ok => setTimeout(ok, 500))
    if (enviar) {
      if (!host.composer.submit(null, texto)) { await host.composer.setDraft(null, texto); aviso('Escrevi o pedido na caixa de mensagem; é só enviar') }
    } else { await host.composer.setDraft(null, texto); host.composer.focus(null) }
  } catch (e) { aviso('Não consegui abrir a conversa: ' + (e.message || e), true) }
}
function receitaDe(n) {
  const r = (G.estado && G.estado.receitas) || {}
  const lista = r.receitas || []
  const pc = (r.por_chamado || {})[String(n)] || {}
  const base = lista.find(x => x.id === (pc.receita || r.padrao)) || lista[0] || { nome: 'Maestro padrão', etapas: { planejar: 'hermes', construir: 'claude', revisar: 'codex', testar: 'hermes' } }
  const etapas = Object.assign({}, base.etapas)
  if (etapas.construir) etapas.construir = pc.construir || r.construir_padrao || etapas.construir
  return { nome: base.nome, etapas }
}
const textoEquipe = rec => ETAPAS.map(([k, t]) => `${t.slice(3).toLowerCase()} = ${rec.etapas[k] ? AG[rec.etapas[k]] : 'pular'}`).join('; ')
const urlIssue = n => `https://github.com/${(G.estado && G.estado.repo) || 'allyssonfmoura/maestro-os'}/issues/${n}`

let abrirExterno = u => window.open(u, '_blank')
const ACOES = {
  executar: it => {
    const rec = receitaDe(it.n)
    if (!confirm(`Executar agora ${rotulo(it)}?\n\nEquipe "${rec.nome}": ${textoEquipe(rec)}.`)) return
    novaConversa(`Executar agora a Solicitação ${rotulo(it)}.\nEquipe (receita "${rec.nome}"): ${textoEquipe(rec)}.\nSiga o fluxo da skill maestro-os-entrega. Quando ficar pronto, me mande o link, o usuário, a senha e o roteiro de teste.`, true)
  },
  fila: it => mudar(it, 'fila', `${rotulo(it)} foi para a fila`),
  tirar: it => mudar(it, 'tirar', `${rotulo(it)} saiu da fila (voltou para análise)`),
  pausar: it => { if (confirm(`Devolver ${rotulo(it)} para a fila?`)) mudar(it, 'fila', `${rotulo(it)} voltou para a fila`) },
  decidir: it => novaConversa(`Me mostre a decisão pendente da Solicitação ${rotulo(it)}: o que é, as opções numeradas e a sua recomendação.`, true),
  analisar: it => novaConversa(`Analise a Solicitação ${rotulo(it)} e me traga o diagnóstico, as opções numeradas e a sua recomendação.`, true),
  andamento: it => novaConversa(`Como está a Solicitação ${rotulo(it)}? Resumo curto: o que já foi feito, o que falta e se precisa de mim.`, true),
  abrirTeste: it => novaConversa(`Quero testar a Solicitação ${rotulo(it)}. Me passe o link, o usuário, a senha e o roteiro de teste.`, true),
  aprovar: it => { if (confirm(`Aprovar o teste de ${rotulo(it)}?`)) novaConversa(`Testei a Solicitação ${rotulo(it)}: aprovado. Siga para o próximo passo e me pergunte antes de publicar em qualquer empresa.`, true) },
  recusar: it => novaConversa(`Testei a Solicitação ${rotulo(it)}: não aprovado. O problema foi: `, false),
}
const BOTOES = {
  testar: [['Abrir teste', 'abrirTeste', 1], ['Aprovar', 'aprovar'], ['Recusar', 'recusar']],
  voce: [['Decidir', 'decidir', 1], ['Executar agora', 'executar'], ['Para a fila', 'fila']],
  exec: [['Ver andamento', 'andamento', 1], ['Devolver à fila', 'pausar']],
  analise: [['Analisar', 'analisar', 1], ['Executar agora', 'executar'], ['Para a fila', 'fila']],
  fila: [['Executar agora', 'executar', 1], ['Tirar da fila', 'tirar']],
}
const SECOES = [['testar', 'Para você testar', 'verde'], ['voce', 'Esperando você', 'vermelho'], ['exec', 'Sendo atendidos agora', 'azul'], ['analise', 'Ainda não analisados', 'cinza'], ['fila', 'Na fila (aprovados)', 'roxo']]

// ── aba lateral: Painel + Pergunta rápida ─────────────────────────────────────
function montarPainel(raiz) {
  const abertos = LS.get('secoes', { agentes: true, arquivos: true, testar: true, voce: true, exec: true, analise: false, fila: false })
  let perguntas = LS.get('perguntas', [])
  let rascunho = ''
  let vivo = true
  const guardar = () => LS.set('perguntas', perguntas.slice(-30).map(p => p.estado === 'pensando' ? Object.assign({}, p, { estado: 'erro', resposta: 'o painel foi fechado antes da resposta' }) : p))

  const abas = () => h('div', { class: 'mpd-abas' },
    [['painel', 'Painel'], ['pergunta', 'Pergunta rápida']].map(([k, v]) => h('button', { type: 'button', class: 'mpd-aba' + (LS.get('aba', 'painel') === k ? ' on' : ''), onclick: () => { LS.set('aba', k); desenhar() } }, v)),
    h('span', { class: 'mpd-esp' }),
    h('button', { type: 'button', class: 'mpd-ic' + (G.lendo ? ' gira' : ''), title: 'Atualizar agora', onclick: atualizar }, '↻'))

  const secao = (chave, titulo, cor, conteudo, n) => {
    const ab = abertos[chave] !== undefined ? abertos[chave] : true
    return h('section', { class: 'mpd-sec' + (ab ? ' ab' : '') },
      h('button', { type: 'button', class: 'mpd-sec-cab', onclick: () => { abertos[chave] = !ab; LS.set('secoes', abertos); desenhar() } },
        h('span', { class: 'mpd-car' }, '›'), h('span', { class: 'mpd-dot ' + cor }), h('span', { class: 'mpd-st' }, titulo), n !== undefined ? h('span', { class: 'mpd-cnt' }, String(n)) : null),
      ab ? conteudo : null)
  }
  const filtroOk = it => {
    const f = LS.get('cliente', 'todos'); const emp = it.empresas || []
    if (f === 'todos') return true
    if (f === 'geral') return !emp.some(e => ['HOMESET', 'GO ON', 'Meraki'].includes(e))
    return emp.includes(f)
  }
  const linha = (it, chave) => {
    const rc = G.estado.receitas || {}; const pc = (rc.por_chamado || {})[String(it.n)] || {}
    const temExec = (BOTOES[chave] || []).some(b => b[1] === 'executar')
    return h('div', { class: 'mpd-row' },
      h('button', { type: 'button', class: 'mpd-nome', title: 'Abrir no GitHub', onclick: () => abrirExterno(urlIssue(it.n)) }, h('b', null, '#' + it.n), it.nome),
      h('div', { class: 'mpd-meta' }, it.meta || ''),
      h('div', { class: 'mpd-acoes' },
        (BOTOES[chave] || []).map(([t, a, pri]) => h('button', { type: 'button', class: 'mpd-b' + (pri ? ' pri' : ''), onclick: () => ACOES[a](it) }, t)),
        temExec ? h('select', {
          class: 'mpd-sel', title: 'Quem constrói este chamado',
          onchange: async ev => { const por = Object.assign({}, rc.por_chamado || {}); por[String(it.n)] = Object.assign({}, pc, { construir: ev.target.value }); await salvarReceitas({ por_chamado: por }); aviso(`${rotulo(it)}: ${AG[ev.target.value]} vai construir`) },
        }, Object.entries(AG).map(([k, v]) => h('option', { value: k, selected: (pc.construir || rc.construir_padrao || 'claude') === k }, v))) : null))
  }

  function desenharPainel() {
    const e = G.estado
    const cab = h('div', { class: 'mpd-cab' }, abas(),
      h('div', { class: 'mpd-tit' }, h('span', { class: 'mpd-ponto' }), 'Painel Maestro', h('span', { class: 'mpd-atu' }, e ? 'atualizado ' + e.atualizado : '')),
      e ? h('div', { class: 'mpd-linha' }, h('span', { class: 'mpd-rot' }, 'Quem constrói:'), h('div', { class: 'mpd-seg' }, Object.entries(AG).map(([k, v]) => h('button', {
        type: 'button', class: ((e.receitas || {}).construir_padrao || 'claude') === k ? 'on' : '',
        onclick: async () => { await salvarReceitas({ construir_padrao: k }); aviso(`Agente padrão para construir: ${v}`) },
      }, v)))) : null,
      h('div', { class: 'mpd-linha' }, CLIENTES.map(([k, v]) => h('button', { type: 'button', class: 'mpd-chip' + (LS.get('cliente', 'todos') === k ? ' on' : ''), onclick: () => { LS.set('cliente', k); desenhar() } }, v))))
    const corpo = h('div', { class: 'mpd-corpo' })
    if (!e) corpo.appendChild(h('div', { class: 'mpd-vazio' + (G.erro ? ' erro' : ''), style: 'padding:12px' }, G.erro ? 'Não consegui ler o painel: ' + G.erro + '. O painel funciona com o app ligado à VPS.' : 'Carregando…'))
    else {
      if (G.erro) corpo.appendChild(h('div', { class: 'mpd-vazio erro' }, 'Última leitura falhou: ' + G.erro))
      const ag = e.agentes || []
      corpo.appendChild(secao('agentes', 'Agentes trabalhando agora', 'verde', ag.length ? ag.map(a => h('div', { class: 'mpd-row' },
        h('div', { class: 'mpd-nome fx' }, h('span', { class: 'mpd-dot ' + (a.agente === 'erro' ? 'vermelho' : 'verde') }), h('b', { style: 'font-family:inherit;font-size:.75rem' }, a.nome)),
        h('div', { class: 'mpd-meta' }, a.tarefa + (a.tempo ? ' · há ' + a.tempo : '')),
        (a.pode_parar || a.sessao) ? h('div', { class: 'mpd-acoes' },
          a.sessao ? h('button', { type: 'button', class: 'mpd-b', onclick: () => host.openSession(a.sessao).catch(() => aviso('Essa conversa não abre aqui no app', true)) }, 'Abrir conversa') : null,
          a.pode_parar ? h('button', { type: 'button', class: 'mpd-b pe', onclick: async () => {
            if (!confirm(`Parar ${a.nome} (${a.tarefa})?`)) return
            try { await sc('parar', { pid: a.pid }); aviso('Agente parado'); setTimeout(atualizar, 1500) } catch (er) { aviso('Não deu: ' + (er.message || er), true) }
          } }, 'Parar') : null) : null)) : h('div', { class: 'mpd-vazio' }, 'Nenhum agente trabalhando agora'), ag.length))
      const arq = e.arquivos || []
      corpo.appendChild(secao('arquivos', 'Arquivos saindo', 'azul', arq.length ? arq.slice(0, 8).map(f => h('div', { class: 'mpd-row' },
        h('button', { type: 'button', class: 'mpd-nome', onclick: () => abrirExterno(f.url) }, f.nome),
        h('div', { class: 'mpd-meta' }, h('span', { class: 'mpd-tag' }, f.tipo), ' ', f.quando),
        h('div', { class: 'mpd-acoes' }, h('button', { type: 'button', class: 'mpd-b pri', onclick: () => abrirExterno(f.url) }, 'Abrir'),
          h('button', { type: 'button', class: 'mpd-b', onclick: () => navigator.clipboard.writeText(f.url).then(() => aviso('Link copiado')) }, 'Copiar link')))) : h('div', { class: 'mpd-vazio' }, 'Nenhum arquivo recente'), arq.length))
      const porChave = Object.fromEntries((e.grupos || []).map(g => [g.chave, g.itens || []]))
      for (const [chave, titulo, cor] of SECOES) {
        const itens = (porChave[chave] || []).filter(filtroOk)
        const lim = LS.get('lim.' + chave, 5)
        corpo.appendChild(secao(chave, titulo, cor, itens.length ? [
          ...itens.slice(0, lim).map(it => linha(it, chave)),
          itens.length > lim ? h('button', { type: 'button', class: 'mpd-mais', onclick: () => { LS.set('lim.' + chave, lim + 20); desenhar() } }, `ver mais ${Math.min(20, itens.length - lim)} de ${itens.length - lim} →`) : null,
        ] : h('div', { class: 'mpd-vazio' }, 'nada aqui'), itens.length))
      }
      if (e.no_ar) corpo.appendChild(h('div', { class: 'mpd-vazio', style: 'padding:10px' }, `${e.no_ar} chamados já no ar, só falta fechar`))
    }
    raiz.replaceChildren(h('div', { class: 'mpd-raiz' }, cab, corpo))
  }

  function desenharPergunta() {
    const comAssunto = LS.get('perg.assunto', true)
    const lista = h('div', { class: 'mpd-qa' })
    if (!perguntas.length) lista.appendChild(h('div', { class: 'mpd-qa-v' }, h('b', null, 'Pergunte qualquer coisa aqui.'), 'A resposta fica só neste painel e não entra na conversa principal. Funciona mesmo enquanto o Hermes está trabalhando.'))
    perguntas.forEach((p, i) => {
      lista.appendChild(h('div', { class: 'mpd-q' }, p.pergunta))
      lista.appendChild(h('div', { class: 'mpd-a' + (p.estado === 'erro' ? ' erro' : '') },
        p.estado === 'pensando' ? h('span', { class: 'mpd-pens' }, 'pensando…') : p.resposta,
        h('small', null, (p.com_assunto ? 'sabia do assunto da conversa' : 'pergunta solta') + ' · não entrou no histórico'),
        p.estado === 'pronto' ? h('div', { class: 'mpd-a-ac' },
          h('button', { type: 'button', class: 'mpd-link', onclick: async () => { await host.composer.insertText(null, `Sobre a pergunta rápida "${p.pergunta}", a resposta foi:\n${p.resposta}`); aviso('Copiei para a caixa de mensagem; é só enviar') } }, '↳ Levar para a conversa principal'),
          h('button', { type: 'button', class: 'mpd-link', onclick: () => navigator.clipboard.writeText(p.resposta).then(() => aviso('Resposta copiada')) }, 'Copiar'),
          h('button', { type: 'button', class: 'mpd-link', onclick: () => { perguntas.splice(i, 1); guardar(); desenhar() } }, 'Apagar')) : null))
    })
    const caixa = h('textarea', { class: 'mpd-txt', rows: '3', placeholder: 'Pergunte qualquer coisa. Não atrapalha a conversa principal',
      oninput: ev => { rascunho = ev.target.value }, onkeydown: ev => { if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); perguntar() } } })
    caixa.value = rascunho
    const entrada = h('div', { class: 'mpd-in' }, caixa, h('div', { class: 'mpd-linha' },
      h('button', { type: 'button', class: 'mpd-chip' + (comAssunto ? ' on' : ''), onclick: () => { LS.set('perg.assunto', true); desenhar() } }, 'Usar o assunto da conversa'),
      h('button', { type: 'button', class: 'mpd-chip' + (!comAssunto ? ' on' : ''), onclick: () => { LS.set('perg.assunto', false); desenhar() } }, 'Pergunta solta'),
      h('span', { class: 'mpd-esp' }),
      perguntas.length ? h('button', { type: 'button', class: 'mpd-link', onclick: () => { if (confirm('Apagar todas as perguntas rápidas?')) { perguntas = []; guardar(); desenhar() } } }, 'Limpar') : null,
      h('button', { type: 'button', class: 'mpd-b pri', onclick: perguntar }, 'Perguntar')))
    raiz.replaceChildren(h('div', { class: 'mpd-raiz' }, h('div', { class: 'mpd-cab' }, abas()), lista, entrada))
    lista.scrollTop = lista.scrollHeight
  }

  async function perguntar() {
    const texto = (rascunho || '').trim()
    if (!texto) return
    const comAssunto = LS.get('perg.assunto', true)
    const item = { pergunta: texto, estado: 'pensando', resposta: '', com_assunto: comAssunto }
    perguntas.push(item); rascunho = ''; desenhar()
    try {
      const sessao = host.state.focusedStoredSessionId.get() || ''
      const r = await sc('pergunta', { pergunta: texto, com_assunto: comAssunto, sessao })
      item.com_assunto = r.com_assunto
      for (let i = 0; i < 150; i++) {
        await new Promise(ok => setTimeout(ok, 2500))
        const s = await sc('pergunta/' + r.id)
        if (s.estado !== 'pensando') { item.estado = s.estado; item.resposta = s.resposta; break }
      }
      if (item.estado === 'pensando') { item.estado = 'erro'; item.resposta = 'demorou demais' }
    } catch (e) { item.estado = 'erro'; item.resposta = 'Não consegui perguntar: ' + (e.message || e) }
    guardar()
    if (vivo) desenhar(); else aviso('A pergunta rápida foi respondida')
  }

  function desenhar() { if (vivo) (LS.get('aba', 'painel') === 'pergunta' ? desenharPergunta : desenharPainel)() }
  const ouvinte = () => { if (LS.get('aba', 'painel') !== 'pergunta') desenhar() }
  G.ouvintes.add(ouvinte)
  desenhar()
  if (!G.estado) atualizar()
  const t = setInterval(() => { if (!document.hidden) atualizar() }, 60000)
  return () => { vivo = false; G.ouvintes.delete(ouvinte); clearInterval(t) }
}

// ── página Agentes ────────────────────────────────────────────────────────────
function montarAgentes(raiz) {
  let receitaSel = null, tarefaSel = ''
  async function carregar() {
    try { G.agentes = await sc('agentes') } catch (e) { G.agentes = { erro: String(e.message || e) } }
    if (!G.estado) await atualizar()
    desenhar()
  }
  async function salvarPorChamado(it, rec) {
    const rc = G.agentes.receitas
    const lista = rc.receitas.some(r => r.id === rec.id) ? rc.receitas : rc.receitas.concat([{ id: rec.id, nome: rec.nome, etapas: rec.etapas }])
    const por = Object.assign({}, rc.por_chamado || {}); por[String(it.n)] = { receita: rec.id, construir: rec.etapas.construir || '' }
    await salvarReceitas({ receitas: lista, por_chamado: por })
  }
  function desenhar() {
    const pag = h('div', { class: 'mpd-pag' }, h('h2', null, 'Agentes'), h('div', { class: 'mpd-meta' }, 'Quem paga cada agente e como montar uma equipe para uma tarefa grande.'))
    const info = G.agentes
    if (!info) { pag.appendChild(h('div', { class: 'mpd-vazio', style: 'padding:14px 0' }, 'Carregando…')); raiz.replaceChildren(pag); return }
    if (info.erro) { pag.appendChild(h('div', { class: 'mpd-vazio erro', style: 'padding:14px 0' }, 'Não consegui ler: ' + info.erro + '. Funciona com o app ligado à VPS.')); raiz.replaceChildren(pag); return }
    const pagd = Object.fromEntries(info.pagadores.map(p => [p.agente, p]))
    pag.appendChild(h('div', { class: 'mpd-h3' }, 'Seus agentes e quem paga'))
    pag.appendChild(h('div', { class: 'mpd-grid' }, info.pagadores.map(p => h('div', { class: 'mpd-ag' },
      h('div', { class: 'mpd-ag-n' }, p.nome), h('div', { class: 'mpd-ag-f' }, p.papel),
      h('div', { class: 'mpd-pay ' + (p.tipo === 'assinatura' ? 'sub' : 'api') }, h('span', null, p.tipo === 'assinatura' ? '✅' : '💳'), h('div', null, h('b', null, p.titulo), p.conta)),
      p.nota ? h('div', { class: 'mpd-ag-nt' }, p.nota) : null))))
    pag.appendChild(h('div', { class: 'mpd-leg' }, h('span', null, '✅ Assinatura: mensalidade, já está paga (tem limite semanal)'), h('span', null, '💳 API: cada uso custa, sai do crédito')))
    const rc = info.receitas
    if (!receitaSel) receitaSel = JSON.parse(JSON.stringify(rc.receitas.find(r => r.id === rc.padrao) || rc.receitas[0]))
    pag.appendChild(h('div', { class: 'mpd-h3' }, 'Montar equipe para uma tarefa grande'))
    const todos = G.estado ? (G.estado.grupos || []).filter(g => g.chave !== 'exec').flatMap(g => g.itens.map(it => Object.assign({ fase: g.titulo }, it))) : []
    const eq = h('div', { class: 'mpd-eq' })
    eq.appendChild(h('div', { class: 'mpd-linha' }, h('span', { class: 'mpd-rot' }, 'Tarefa:'),
      h('select', { class: 'mpd-sel gr', onchange: ev => { tarefaSel = ev.target.value } }, h('option', { value: '' }, '— escolha um chamado —'),
        todos.map(it => h('option', { value: String(it.n), selected: String(it.n) === tarefaSel }, `#${it.n} (${it.nome.slice(0, 90)}) · ${it.fase}`)))))
    eq.appendChild(h('div', { class: 'mpd-linha' }, h('span', { class: 'mpd-rot' }, 'Receita:'),
      rc.receitas.map(r => h('button', { type: 'button', class: 'mpd-chip' + (receitaSel.id === r.id ? ' on' : ''), onclick: () => { receitaSel = JSON.parse(JSON.stringify(r)); desenhar() } }, r.nome + (rc.padrao === r.id ? ' ★' : ''))),
      h('button', { type: 'button', class: 'mpd-chip tr', onclick: () => {
        const nome = prompt('Nome da nova receita:'); if (!nome) return
        receitaSel = { id: 'r' + Date.now().toString(36), nome: nome.trim(), etapas: Object.assign({}, receitaSel.etapas) }; desenhar()
      } }, '+ Criar receita')))
    const passos = h('div', { class: 'mpd-passos' })
    ETAPAS.forEach(([k, t, d]) => {
      const ag = receitaSel.etapas[k] || ''; const p = pagd[ag]
      passos.appendChild(h('div', { class: 'mpd-passo' }, h('div', { class: 'mpd-pk' }, t), h('div', { class: 'mpd-pt' }, d),
        h('select', { class: 'mpd-sel', onchange: ev => { receitaSel.etapas[k] = ev.target.value; desenhar() } },
          h('option', { value: '', selected: !ag }, '— pular esta etapa'), Object.entries(AG).map(([ak, av]) => h('option', { value: ak, selected: ag === ak }, av))),
        p ? h('div', { class: 'mpd-pg ' + (p.tipo === 'assinatura' ? 'sub' : 'api') }, p.tipo === 'assinatura' ? '✅ Assinatura' : '💳 API') : h('div', { class: 'mpd-pg' }, 'não roda')))
      passos.appendChild(h('div', { class: 'mpd-seta' }, '→'))
    })
    passos.appendChild(h('div', { class: 'mpd-passo voce' }, h('div', { class: 'mpd-pk' }, '5. Você'), h('div', { class: 'mpd-pt' }, 'Recebe link, usuário, senha e roteiro')))
    eq.appendChild(passos)
    const avisos = []
    if (receitaSel.etapas.construir && receitaSel.etapas.construir === receitaSel.etapas.revisar) avisos.push('Quem constrói não deve revisar: escolha outro agente na etapa 3.')
    if (receitaSel.etapas.construir && pagd[receitaSel.etapas.construir] && pagd[receitaSel.etapas.construir].tipo === 'api') avisos.push('Construir é o trabalho mais pesado e este agente cobra por uso.')
    eq.appendChild(h('div', { class: 'mpd-regras' },
      h('div', null, h('b', null, 'Regra 1: quem constrói não revisa'), 'Se o mesmo agente estiver nas etapas 2 e 3, aparece um aviso.'),
      h('div', null, h('b', null, 'Regra 2: trabalho pesado vai para a assinatura'), 'Construir e revisar rodam em quem já está pago.'),
      h('div', null, h('b', null, 'Regra 3: a receita fica salva'), 'Monte uma vez e use em todos os chamados; dá para trocar o agente só de um chamado no painel.')))
    if (avisos.length) eq.appendChild(h('div', { class: 'mpd-aviso' }, avisos.map(a => h('div', null, '⚠️ ' + a))))
    const achar = () => todos.find(x => String(x.n) === tarefaSel)
    eq.appendChild(h('div', { class: 'mpd-go' },
      h('button', { type: 'button', class: 'mpd-b', onclick: async () => {
        const lista = rc.receitas.filter(r => r.id !== receitaSel.id).concat([{ id: receitaSel.id, nome: receitaSel.nome, etapas: receitaSel.etapas }])
        await salvarReceitas({ receitas: lista }); aviso(`Receita "${receitaSel.nome}" salva`)
      } }, 'Salvar receita'),
      h('button', { type: 'button', class: 'mpd-b', onclick: async () => {
        const lista = rc.receitas.some(r => r.id === receitaSel.id) ? rc.receitas : rc.receitas.concat([receitaSel])
        await salvarReceitas({ receitas: lista, padrao: receitaSel.id }); aviso(`"${receitaSel.nome}" agora é a receita padrão`)
      } }, 'Usar como padrão'),
      h('span', { class: 'mpd-esp' }),
      h('button', { type: 'button', class: 'mpd-b', onclick: async () => { const it = achar(); if (!it) return aviso('Escolha a tarefa primeiro', true); await salvarPorChamado(it, receitaSel); mudar(it, 'fila', `${rotulo(it)} foi para a fila com a receita "${receitaSel.nome}"`) } }, 'Para a fila'),
      h('button', { type: 'button', class: 'mpd-b pri', onclick: async () => { const it = achar(); if (!it) return aviso('Escolha a tarefa primeiro', true); await salvarPorChamado(it, receitaSel); ACOES.executar(it) } }, 'Executar agora')))
    pag.appendChild(eq)
    raiz.replaceChildren(pag)
  }
  const ouvinte = () => desenhar()
  G.ouvintes.add(ouvinte)
  desenhar(); carregar()
  return () => G.ouvintes.delete(ouvinte)
}

// ── selo de ambiente (topo) ───────────────────────────────────────────────────
function Ambiente() {
  const conexao = useValue(host.state.connectionId)
  const [amb, setAmb] = useState(null)
  useEffect(() => {
    let vivo = true
    injetarCss()
    sh('hostname; test -f ' + TOKEN + ' && echo PAINEL').then(o => {
      if (vivo) setAmb({ vps: /vpsbr|PAINEL/.test(o) })
    }).catch(() => { if (vivo) setAmb({ vps: false }) })
    return () => { vivo = false }
  }, [conexao])
  if (!amb) return null
  const abrirMenu = ev => {
    ev.stopPropagation()
    document.querySelectorAll('.mpd-menu').forEach(m => m.remove())
    const r = ev.currentTarget.getBoundingClientRect()
    const mac = G.estado && G.estado.ambiente && G.estado.ambiente.mac
    const fechar = () => document.querySelectorAll('.mpd-menu').forEach(m => m.remove())
    const menu = h('div', { class: 'mpd menu-mpd mpd-menu', style: `top:${r.bottom + 6}px;left:${Math.max(8, r.left - 20)}px` },
      h('div', { class: 'mpd-mi' }, h('span', { class: 'mpd-dot verde' }), h('div', null, h('b', null, 'VPS (servidor online)' + (amb.vps ? '  ✓' : '')), h('span', null, 'Liga 24h. Os agentes seguem trabalhando com o Mac fechado. É onde fica o Maestro.'))),
      h('div', { class: 'mpd-mi' }, h('span', { class: 'mpd-dot amarelo' }), h('div', null, h('b', null, 'Este Mac (local)' + (!amb.vps ? '  ✓' : '')), h('span', null, 'Só funciona com o Mac ligado; o que fizer aqui fica só aqui.' + (mac && mac.estado ? ` Mac servidor: ${mac.estado}.` : '')))),
      h('div', { class: 'mpd-mi', onclick: () => { fechar(); host.navigate('/settings?tab=gateway') } }, h('span', { class: 'mpd-dot azul' }), h('div', null, h('b', null, 'Trocar de máquina…'), h('span', null, 'Abre Ajustes → Gateways, onde você escolhe a VPS ou este Mac.'))))
    document.body.appendChild(menu)
    setTimeout(() => document.addEventListener('click', fechar, { once: true }), 0)
  }
  return jsx('button', {
    type: 'button', className: 'mpd mpd-amb ' + (amb.vps ? 'vps' : 'mac'), onClick: abrirMenu,
    title: amb.vps ? 'O trabalho continua mesmo com o Mac fechado' : 'Só funciona com o Mac ligado',
    children: [jsx('i', {}, 'i'), amb.vps ? 'Você está na VPS · online 24h' : 'Você está no Mac · local'],
  })
}

// ── faixa Memória da conversa + Renovar ───────────────────────────────────────
let renovarPendente = false
function enviarRenovar(foco) {
  const ok = host.composer.submit(null, foco ? `/compress ${foco}` : '/compress')
  aviso(ok ? 'Renovando o contexto…' : 'Não consegui renovar daqui; digite /compress na caixa de mensagem', !ok)
  window.__mpdFoco = ''
}
function Memoria() {
  const uso = useValue(host.state.focusedUsage)
  const ocupado = useValue(host.state.busy)
  const sessao = useValue(host.state.focusedSessionId)
  const [, forcar] = useState(0)
  useEffect(() => { injetarCss(); if (!G.estado) atualizar() }, [])
  useEffect(() => {
    if (renovarPendente && !ocupado) { renovarPendente = false; enviarRenovar(window.__mpdFoco || ''); forcar(x => x + 1) }
  }, [ocupado])
  const pct = uso && typeof uso.context_percent === 'number' ? Math.round(uso.context_percent) : null
  if (pct === null || !sessao) return null
  const lim = (G.estado && G.estado.limite_compressao) || 50
  const cor = pct >= lim ? 'r' : pct >= Math.round(lim * 0.7) ? 'a' : 'v'
  const msg = cor === 'r' ? 'Renove agora. Se não renovar, o Hermes renova sozinho no meio do trabalho e pode perder detalhes'
    : cor === 'a' ? 'Bom momento para renovar quando terminar este assunto' : 'Tranquilo, pode seguir'
  const clicar = () => {
    const foco = prompt('Vou resumir o que já fizemos e liberar memória. A conversa continua nesta mesma janela.\n\nO que é importante não esquecer? (opcional)', '')
    if (foco === null) return
    window.__mpdFoco = foco.trim()
    if (ocupado) { renovarPendente = true; forcar(x => x + 1); aviso('Renovo o contexto assim que o Hermes terminar'); return }
    enviarRenovar(window.__mpdFoco)
  }
  return jsx('div', { className: 'mpd mpd-ctx ' + cor, children: [
    jsx('span', { style: { whiteSpace: 'nowrap' }, children: '🧠 Memória da conversa' }, 'r'),
    jsx('span', { className: 'mpd-bar', children: jsx('i', { style: { width: Math.min(100, Math.round(pct / lim * 100)) + '%' } }) }, 'b'),
    jsx('b', { children: pct + '%' }, 'p'),
    jsx('span', { className: 'mpd-ctx-m', children: msg }, 'm'),
    jsx('span', { className: 'mpd-esp' }, 'e'),
    jsx('button', { type: 'button', className: 'mpd-b' + (cor !== 'v' ? ' pri' : ''), disabled: renovarPendente, onClick: clicar,
      children: renovarPendente ? 'Renovo assim que eu terminar' : 'Renovar contexto' }, 'k'),
  ] })
}

export default {
  id: 'painel-atividades',
  name: 'Painel Maestro',
  register(ctx) {
    abrirExterno = u => ctx.os.openExternal(u)
    ctx.registerMany([
      { id: 'painel', area: 'panes', title: 'Maestro', data: { placement: 'right', width: '360px' }, render: () => jsx(Hospede, { montar: montarPainel }) },
      { id: 'agentes', area: 'routes', title: 'Agentes', data: { path: '/agentes' }, render: () => jsx(Hospede, { montar: montarAgentes, estilo: { overflow: 'auto' } }) },
      { id: 'nav-agentes', area: 'sidebar.nav', order: 60, data: { codicon: 'hubot', label: 'Agentes', path: '/agentes' } },
      { id: 'ambiente', area: 'titleBar.left', order: 90, render: () => jsx(Ambiente, {}) },
      { id: 'memoria', area: 'composer.top', order: 10, render: () => jsx(Memoria, {}) },
    ])
  },
}
