# Interface Hermes — onde paramos

Projeto do Allysson para melhorar a interface do Hermes (WebUI no navegador + app do Mac).
Código: este repositório (`allyssonfmoura/hermes-painel-atividades`), clonado em
`/root/Documents/DESENVOLVIMENTO/codigo/hermes-painel-atividades`.

## O que já existe (no ar)

**WebUI (navegador / celular)** — extensão `maestro-painel`, carrega sozinha a cada abertura da página.
- Selo de ambiente no topo: verde "Você está na VPS · online 24h" (no celular só "VPS"); menu explica VPS x Mac.
- Botão 💬 no topo: abre a Pergunta rápida (tela cheia no celular).
- Painel da direita (ícone "Painel Maestro" na barra de ícones): abas **Painel** e **Pergunta rápida**.
  - Painel: Agentes trabalhando agora, Arquivos saindo, Para você testar, Esperando você, Sendo atendidos,
    Ainda não analisados, Na fila; filtro por cliente; "Quem constrói" (padrão e por chamado); botões de ação.
  - Pergunta rápida: responde em ~10 s, opcionalmente com o assunto da conversa aberta, sem entrar no histórico.
- Tela **Agentes** (ícone de robô): quem paga cada agente (assinatura x API) + montar equipe por receitas.
- Faixa **Memória da conversa** acima da caixa de mensagem (verde/amarelo/vermelho; vermelho = limite de
  compressão automática, hoje 50%) + botão **Renovar contexto** (resume e continua na mesma janela).
- Barra de conversas: abas "🌐 Navegador" e "💻 App e outros", filtros Origem e Cliente, Projetos chamados de "Grupos".

**App do Mac** — plugin `painel-atividades` 2.0 (`desktop/plugin.js`). Mesmas funções: aba Maestro à direita,
página Agentes no menu, selo de ambiente, faixa de memória. Instalação é passo do Allysson:
Recursos → Plugins → Instalar do Git → `allyssonfmoura/hermes-painel-atividades` (Interface do desktop),
ou o link `hermes://plugin/install?repo=allyssonfmoura/hermes-painel-atividades`.
Ainda NÃO confirmado na tela dele (só testado em simulador com dados reais).

**Serviço auxiliar** — systemd `hermes-painel-sidecar`, 127.0.0.1:8796, só via
`/api/extensions/maestro-painel/sidecar/<rota>` com token (token-v1). Rotas: `/estado`, `/agentes`,
`/acao` (fila/tirar = rótulo `estado:` no GitHub), `/parar`, `/receitas`, `/pergunta`, `/pergunta/<id>`.
O app do Mac chega nele por `shell.exec` + curl. Resposta sempre em ASCII (acentos escapados).

**Outras mudanças feitas**
- Hermes passou a usar a assinatura Claude primeiro; o crédito de API "HERMES VPS 24 HORAS" ficou de reserva
  (backup em `~/.hermes/auth.json.antes-assinatura-20261014`).
- `painel-atividades.py` (cron 1 min) agora manda empresas por chamado e junta recebido/sem estado em
  "Ainda não analisados".

## Como publicar uma mudança
- WebUI: editar `webui/extensao/assets/*`, rodar `python3 webui/instalar.py` (padrão `/root/.hermes/webui`);
  basta recarregar a página.
- Serviço auxiliar: editar `webui/sidecar/painel_sidecar.py` e `systemctl restart hermes-painel-sidecar`.
- App: editar `desktop/plugin.js`, `git push`; ele clica em Atualizar no app.
- Testar sem a senha dele: cópia do WebUI na porta 8799 com estado em `~/.hermes/cache/scratch/webui-teste`
  (ver skill `hermes-user-customization`).

## Ideias e pendências
- Confirmar o plugin instalado no app do Mac (print dele).
- Ele disse "daqui a pouco a gente pode melhorar mais" — perguntar o que incomoda primeiro.
- Prancha antes de qualquer mudança de tela (regra dele).
