# Painel de atividades (Hermes Desktop)

Painel nativo à direita da conversa (mesmos componentes e cores do Hermes): o que o Hermes
está fazendo agora, o que está rodando (executores, CI, publicações) e cada Solicitação do
Maestro OS com nome e fase. Os dados vêm do próprio servidor do Hermes
(`/root/.hermes/painel/estado.json`, gerado a cada minuto por
`/root/.hermes/scripts/painel-atividades.py`) pelo gateway — sem página externa.

Instalar: `hermes://plugin/install?repo=allyssonfmoura/hermes-painel-atividades&enable=1`
