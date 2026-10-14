// Painel de atividades — painel NATIVO do Hermes (mesmos componentes e cores do app).
// Lê /root/.hermes/painel/estado.json no servidor do Hermes (gerado a cada minuto por
// /root/.hermes/scripts/painel-atividades.py) pelo próprio gateway, sem página externa.
import { Codicon, DisclosureCaret, StatusDot, host } from '@hermes/plugin-sdk'
import { useEffect, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const ARQUIVO = '/root/.hermes/painel/estado.json'
const PEDACO = 3500 // o gateway devolve no máximo ~4000 caracteres por comando
const ABERTOS = { voce: true, testar: true, exec: true, fila: false, analise: false }

async function lerEstado() {
  let texto = ''
  for (let i = 0; i < 40; i++) {
    const r = await host.request('shell.exec', {
      command: `tail -c +${i * PEDACO + 1} ${ARQUIVO} | head -c ${PEDACO}`
    })
    const parte = (r && r.stdout) || ''
    texto += parte
    if (parte.length < PEDACO) break
  }
  return JSON.parse(texto)
}

const s = {
  raiz: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, color: 'var(--ui-text-primary)' },
  topo: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px 6px' },
  rolagem: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 6px 16px' },
  secao: { marginTop: 10 },
  cab: { display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '4px 6px', background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--ui-text-tertiary)', textAlign: 'left' },
  cabTxt: { fontSize: '0.64rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', flex: 1 },
  cont: { fontSize: '0.64rem', color: 'var(--ui-text-tertiary)', fontVariantNumeric: 'tabular-nums' },
  linha: { display: 'flex', flexDirection: 'column', gap: 1, width: '100%', padding: '5px 8px', borderRadius: 6, background: 'transparent', border: 0, textAlign: 'left', cursor: 'pointer', color: 'inherit' },
  titulo: { fontSize: '0.75rem', lineHeight: 1.35, color: 'var(--ui-text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  num: { fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: '0.68rem', color: 'var(--ui-text-tertiary)', marginRight: 6 },
  meta: { fontSize: '0.66rem', color: 'var(--ui-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  agora: { margin: '2px 6px 0', padding: '6px 10px', borderLeft: '2px solid var(--theme-primary, var(--ui-accent))', borderRadius: 4, background: 'var(--ui-bg-tertiary)' },
  vazio: { fontSize: '0.68rem', color: 'var(--ui-text-quaternary)', padding: '4px 8px' }
}

function Hover({ children, onClick, title }) {
  const [h, setH] = useState(false)
  return jsx('button', {
    type: 'button',
    title,
    onClick,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: { ...s.linha, background: h ? 'var(--ui-control-hover-background)' : 'transparent' },
    children
  })
}

function Secao({ titulo, contagem, aberta, alternar, children, cor }) {
  return jsxs('div', {
    style: s.secao,
    children: [
      jsxs('button', {
        type: 'button',
        style: { ...s.cab, color: cor || s.cab.color, cursor: alternar ? 'pointer' : 'default' },
        onClick: alternar,
        children: [
          alternar ? jsx(DisclosureCaret, { open: aberta, size: '0.7rem' }) : null,
          jsx('span', { style: s.cabTxt, children: titulo }),
          contagem != null ? jsx('span', { style: s.cont, children: String(contagem) }) : null
        ]
      }),
      aberta ? children : null
    ]
  })
}

function Painel({ abrir }) {
  const [estado, setEstado] = useState(null)
  const [erro, setErro] = useState('')
  const [abertos, setAbertos] = useState(ABERTOS)
  const [lendo, setLendo] = useState(false)

  const atualizar = async () => {
    setLendo(true)
    try {
      setEstado(await lerEstado())
      setErro('')
    } catch (e) {
      setErro(String((e && e.message) || e))
    } finally {
      setLendo(false)
    }
  }

  useEffect(() => {
    atualizar()
    const t = setInterval(atualizar, 60000)
    return () => clearInterval(t)
  }, [])

  const url = n => `https://github.com/${(estado && estado.repo) || 'allyssonfmoura/maestro-os'}/issues/${n}`

  const cabecalho = jsxs('div', {
    style: s.topo,
    children: [
      jsx('span', { 'aria-hidden': true, className: 'dither inline-block size-2 shrink-0 rounded-[1px]' }),
      jsx('span', { style: { ...s.cabTxt, color: 'var(--theme-primary, var(--ui-text-primary))', letterSpacing: '0.16em' }, children: 'Atividades' }),
      jsx('span', { style: s.cont, children: estado ? `atualizado ${estado.atualizado}` : '' }),
      jsx('button', {
        type: 'button',
        title: 'Atualizar agora',
        onClick: atualizar,
        style: { background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--ui-text-tertiary)', padding: 2 },
        children: jsx(Codicon, { name: 'refresh', size: '0.8rem', spinning: lendo })
      })
    ]
  })

  if (!estado) {
    return jsxs('div', {
      style: s.raiz,
      children: [cabecalho, jsx('div', { style: s.vazio, children: erro ? `Não consegui ler o painel: ${erro}` : 'Carregando…' })]
    })
  }

  const alternar = k => () => setAbertos(a => ({ ...a, [k]: !a[k] }))

  const agora = estado.agora.length
    ? jsx(Secao, {
        titulo: 'Agora',
        aberta: true,
        children: jsx('div', {
          style: s.agora,
          children: estado.agora.slice(0, 3).map((a, i) =>
            jsxs('div', {
              style: { padding: '2px 0', opacity: i === 0 ? 1 : 0.7 },
              children: [
                jsx('div', { style: { ...s.titulo, color: 'var(--ui-text-primary)', WebkitLineClamp: 3 }, children: a.texto }),
                jsx('div', { style: s.meta, children: a.quando })
              ]
            }, i)
          )
        })
      })
    : null

  const rodando = jsx(Secao, {
    titulo: 'Rodando agora',
    contagem: estado.rodando.length,
    aberta: true,
    children: estado.rodando.length
      ? estado.rodando.map((r, i) =>
          jsxs('div', {
            style: { ...s.linha, cursor: 'default', flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
            children: [
              jsx(StatusDot, { tone: r.tipo === 'publicacao' ? 'warn' : 'good', style: { marginTop: 6 } }),
              jsxs('div', {
                style: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 },
                children: [jsx('div', { style: s.titulo, children: r.texto }), jsx('div', { style: { ...s.meta, whiteSpace: 'normal' }, children: r.detalhe })]
              })
            ]
          }, i)
        )
      : jsx('div', { style: s.vazio, children: 'nada rodando' })
  })

  const cores = { voce: 'var(--ui-yellow, var(--ui-text-tertiary))', testar: 'var(--ui-green, var(--ui-text-tertiary))' }
  const grupos = estado.grupos
    .filter(g => g.itens.length)
    .map(g =>
      jsx(Secao, {
        titulo: g.titulo,
        contagem: g.itens.length,
        aberta: !!abertos[g.chave],
        alternar: alternar(g.chave),
        cor: cores[g.chave],
        children: g.itens.map(it =>
          jsxs(Hover, {
            title: 'Abrir no GitHub',
            onClick: () => abrir(url(it.n)),
            children: [
              jsxs('div', { style: s.titulo, children: [jsx('span', { style: s.num, children: `#${it.n}` }), it.nome] }),
              jsx('div', { style: s.meta, children: it.meta })
            ]
          }, it.n)
        )
      }, g.chave)
    )

  const noAr = estado.no_ar
    ? jsx('div', { style: { ...s.vazio, marginTop: 12 }, children: `${estado.no_ar} já no ar, só falta fechar` })
    : null

  return jsxs('div', {
    style: s.raiz,
    children: [
      cabecalho,
      erro ? jsx('div', { style: { ...s.vazio, color: 'var(--ui-red)' }, children: `Última leitura falhou: ${erro}` }) : null,
      jsxs('div', { style: s.rolagem, children: [agora, rodando, ...grupos, noAr] })
    ]
  })
}

export default {
  id: 'painel-atividades',
  name: 'Painel de atividades',
  register(ctx) {
    const abrir = u => ctx.os.openExternal(u)
    ctx.register({
      id: 'painel',
      area: 'panes',
      title: 'Atividades',
      data: { placement: 'right', width: '340px' },
      render: () => jsx(Painel, { abrir })
    })
  }
}
