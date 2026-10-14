# Painel de atividades (Hermes Desktop)

Painel fixo à direita da conversa com o que está acontecendo no Maestro OS: o que o Hermes
está fazendo agora, o que está rodando (executores, CI, publicações) e cada Solicitação com
nome e fase. A página é gerada a cada minuto na VPS (`/root/.hermes/scripts/painel-atividades.py`)
e só abre dentro da tailnet.

Instalar: `hermes://plugin/install?repo=allyssonfmoura/hermes-painel-atividades&enable=1`
