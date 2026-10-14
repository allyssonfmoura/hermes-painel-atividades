// Painel de atividades (Allysson / Maestro OS).
// Mostra, num painel fixo à direita da conversa, a página gerada a cada minuto na VPS:
// https://vpsbr-15649916.tailea14e1.ts.net/atividades/ (só dentro da tailnet).
import { SandboxedFrame, PALETTE_AREA, host } from '@hermes/plugin-sdk'
import { jsx } from 'react/jsx-runtime'

const URL_PAINEL = 'https://vpsbr-15649916.tailea14e1.ts.net/atividades/'

function Painel() {
  return jsx('div', {
    className: 'flex h-full w-full flex-col',
    children: jsx(SandboxedFrame, {
      src: URL_PAINEL,
      title: 'Painel de atividades',
      className: 'h-full w-full border-0',
      style: { flex: 1, minHeight: 0 }
    })
  })
}

export default {
  id: 'painel-atividades',
  name: 'Painel de atividades',
  register(ctx) {
    ctx.register({
      id: 'painel',
      area: 'panes',
      title: 'Atividades',
      data: { placement: 'right', width: '360px' },
      render: () => jsx(Painel, {})
    })
    ctx.register({
      id: 'abrir-navegador',
      area: PALETTE_AREA,
      data: {
        id: 'painel-atividades.abrir',
        label: 'Painel de atividades: abrir no navegador',
        keywords: ['atividades', 'painel', 'maestro'],
        run: () => ctx.os.openExternal(URL_PAINEL)
      }
    })
  }
}
