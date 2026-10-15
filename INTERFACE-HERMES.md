# Interface Hermes — onde paramos

Projeto do Allysson para melhorar a interface do Hermes (WebUI no navegador + app do Mac).
Código: este repositório (`allyssonfmoura/hermes-painel-atividades`), clonado em
`/root/Documents/DESENVOLVIMENTO/codigo/hermes-painel-atividades`.

## O que já existe (no ar)

**WebUI (navegador / celular)** — extensão `maestro-painel`, carrega sozinha a cada abertura da página.
- Selo de ambiente no topo: verde "Você está na VPS · online 24h" (no celular só "VPS"); menu explica VPS x Mac.
- Botão 💬 no topo: abre a Pergunta rápida (tela cheia no celular).
- Painel da direita (ícone "Painel Maestro" na barra de ícones): abas **Painel** e **Pergunta rápida**.
  - Painel (15/10, prancha painel-ja-no-ar aprovada): Esperando você, Para você testar e Sendo atendidos
    abertos no topo; depois Agentes, Arquivos, Na fila, Ainda não analisados (fechados). 3 itens por seção
    + "ver todos". Botões visíveis; extras (Executar, Para a fila, Quem constrói, GitHub) no menu ⋯.
    Botão **Já está no ar**: confirma no painel, some, e só manda após 10 s (Desfazer). Chamado de cliente
    (SUP-/origem: Suporte) ganha `estado: no ar` (Maestro avisa o cliente; fecha no "Sim" ou em 7 dias);
    interno ganha a etiqueta e é fechado. Rodapé separa no ar de cliente x internos; "Ver" fecha internos.
    Painel com 340 px (app e WebUI).
    Cada chamado mostra a data de abertura ("aberta 07/10 (há 8 dias)"), vinda do cron painel-atividades.py.
  - Pergunta rápida: responde em ~10 s, opcionalmente com o assunto da conversa aberta, sem entrar no histórico.
- Tela **Agentes** (ícone de robô): quem paga cada agente (assinatura x API) + montar equipe por receitas.
- Faixa **Memória da conversa** acima da caixa de mensagem (verde/amarelo/vermelho; vermelho = limite de
  compressão automática, hoje 50%) + botão **Renovar contexto** (resume e continua na mesma janela).
- Barra de conversas: abas "🌐 Navegador" e "💻 App e outros", filtros Origem e Cliente, Projetos chamados de "Grupos".

**App do Mac** — plugin `painel-atividades` 2.1 (`desktop/plugin.js`). Mesmas funções: aba Maestro à direita,
página Agentes no menu, selo de ambiente, faixa de memória. Instalação é passo do Allysson:
Recursos → Plugins → Instalar do Git → `allyssonfmoura/hermes-painel-atividades` (Interface do desktop),
ou o link `hermes://plugin/install?repo=allyssonfmoura/hermes-painel-atividades`.
Confirmado pelo Allysson em 14/10/2026: instalado e funcionando bem no app do Mac. Ajustes virão em breve.

**Serviço auxiliar** — systemd `hermes-painel-sidecar`, 127.0.0.1:8796, só via
`/api/extensions/maestro-painel/sidecar/<rota>` com token (token-v1). Rotas: `/estado`, `/agentes`,
`/acao` (fila/tirar = rótulo `estado:`; no_ar; fechar ns[]), `/parar`, `/receitas`, `/pergunta`, `/pergunta/<id>`.
O app do Mac chega nele por `shell.exec` + curl. Resposta sempre em ASCII (acentos escapados).

**Outras mudanças feitas**
- Hermes passou a usar a assinatura Claude primeiro; o crédito de API "HERMES VPS 24 HORAS" ficou de reserva
  (backup em `~/.hermes/auth.json.antes-assinatura-20261014`).
- `painel-atividades.py` (cron 1 min) agora manda empresas por chamado e junta recebido/sem estado em
  "Ainda não analisados".

**Nomes dos chats e chat rodando** (15/10/2026, prancha `hermes-nomes-chats`, aprovado opção 1)
- Padrão: `#NNN (efeito) · ação`; sem Solicitação: `Assunto (efeito) · ação`. Efeito até ~5 palavras (o mesmo
  para todos os chats da mesma Solicitação, guardado em `~/.hermes/painel/efeitos.json`); ação da lista fixa
  decisão, diagnóstico, execução, teste, status, investigação, ajuste, pergunta. Nome repetido ganha " 2".
- `webui/sidecar/nomes_chats.py` roda a cada minuto dentro do sidecar (python do agente). Chats do state.db
  (app, Telegram, cópia dos do navegador) renomeados direto como nome do usuário; os do WebUI viram proposta
  que a extensão aplica por `/api/session/rename`. Cada chat uma vez só (`~/.hermes/painel/nomes.json`);
  nome mudado à mão depois fica. Antigos renomeados em 15/10 (lista anterior em `painel/titulos-antes-nomes.tsv`).
- Rodando = última mensagem há < 15 min e turno não terminou (rota `/rodando`).
- WebUI: bloco "● Rodando agora" no topo da lista (fundo verde, ponto pulsando, "rodando"); a linha original some.
- App (plugin 2.2.0): fixa o chat rodando no topo com o "Fixar" do próprio app e solta quando termina (só os que
  ele fixou); linha com fundo verde e ponto pulsando à direita (some ao passar o mouse, para não cobrir o ⋯).

## Como publicar uma mudança
- WebUI: editar `webui/extensao/assets/*`, rodar `python3 webui/instalar.py` (padrão `/root/.hermes/webui`);
  basta recarregar a página.
- Serviço auxiliar: editar `webui/sidecar/painel_sidecar.py` e `systemctl restart hermes-painel-sidecar`.
- App: editar `desktop/plugin.js`, `git push`; ele clica em Atualizar no app.
- Testar sem a senha dele: cópia do WebUI na porta 8799 com estado em `~/.hermes/cache/scratch/webui-teste`
  (ver skill `hermes-user-customization`).

## Ideias e pendências
- Ajustes no plugin do app do Mac (ele vai dizer quais).
- Ele disse "daqui a pouco a gente pode melhorar mais" — perguntar o que incomoda primeiro.
- Prancha antes de qualquer mudança de tela (regra dele).
