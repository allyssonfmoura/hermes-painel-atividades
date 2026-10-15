"""Padroniza os nomes das conversas do Hermes.

Padrão (aprovado pelo Allysson em 15/10/2026, prancha hermes-nomes-chats):
  com Solicitação:  "#NNN (efeito) · ação"
  sem Solicitação:  "Assunto (efeito) · ação"
efeito com até 5 palavras; ação de uma lista fixa.

Roda com o python do agente Hermes (precisa de agent.auxiliary_client e hermes_state).
- Conversas do state.db (Hermes.app, Telegram, e a cópia das do WebUI): renomeia direto,
  como nome dado pelo usuário (o Hermes não troca mais depois).
- Conversas do WebUI (arquivos em webui/sessions): grava a proposta em nomes.json; a
  extensão do WebUI aplica pela rota oficial /api/session/rename e avisa o sidecar.
Cada conversa é renomeada uma vez só. Se o Allysson mudar o nome à mão depois, fica o dele.
"""
import json
import os
import re
import sqlite3
import subprocess
import sys
import time

HERMES = os.path.expanduser("~/.hermes")
PAINEL = f"{HERMES}/painel"
REGISTRO = f"{PAINEL}/nomes.json"
EFEITOS = f"{PAINEL}/efeitos.json"
AGORA = f"{PAINEL}/agora.json"
WEBUI_SESS = f"{HERMES}/webui/sessions"
REPO = "allyssonfmoura/maestro-os"

ACOES = ["decisão", "diagnóstico", "execução", "teste", "status", "investigação", "ajuste", "pergunta"]
PADRAO = re.compile(r"^\S.{0,40} \([^()]{2,60}\) · (" + "|".join(ACOES) + r")( \d+)?$")
SOLTAS = {"a", "o", "ao", "aos", "à", "as", "os", "de", "do", "da", "dos", "das", "e", "em", "no", "na", "com", "para", "por", "frente", "sem", "que"}
FONTES_FORA = {"oneshot", "subagent", "cron"}
MAX_NOVAS_POR_RODADA = int(os.environ.get("NOMES_MAX", "8"))
SECO = os.environ.get("NOMES_SECO") == "1"  # só mostra, não grava


def ler(caminho, padrao):
    try:
        with open(caminho, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return padrao


def gravar(caminho, dados):
    tmp = caminho + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=1)
    os.replace(tmp, caminho)


def texto(c):
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return " ".join(texto(x.get("text", "")) if isinstance(x, dict) else texto(x) for x in c)
    return ""


def efeitos_do_painel():
    ef = {}
    for x in ler(AGORA, []):
        m = re.match(r"#(\d+) \(([^)]*)\)", x.get("texto", ""))
        if m:
            ef[m[1]] = m[2]
    return ef


def titulo_issue(n, cache={}):
    if n not in cache:
        try:
            r = subprocess.run(["gh", "issue", "view", n, "-R", REPO, "--json", "title"],
                               capture_output=True, text=True, timeout=20)
            cache[n] = json.loads(r.stdout)["title"] if r.returncode == 0 else ""
        except Exception:
            cache[n] = ""
    return cache[n]


PROMPT = """Você dá nome a conversas de trabalho do Allysson (dono do produto Maestro OS).
Leia o começo da conversa e responda só com JSON:
{"numero": "...", "assunto": "...", "efeito": "...", "acao": "..."}

- numero: número da Solicitação principal da conversa, só os dígitos, escolhido entre os candidatos
  informados. Vazio se a conversa não for sobre uma Solicitação.
- assunto: só quando numero vazio. 1 a 3 palavras com o tema: Hermes, VPS, Mac, App Maestro, Maestro,
  Meraki, GO ON, HOMESET, Kira, Badeco, Railway etc. Conversa sobre o próprio Hermes (nomes dos chats,
  painel, plugins, interface, voz/transcrição, configuração do agente) = Hermes.
- efeito: o que a conversa quer que aconteça, em português do Brasil, de 2 a 5 palavras (frase completa, nunca cortada), minúsculas
  (exceto nomes próprios), sem ponto final, sem número de Solicitação, sem código SUP-.
  Se for dado um "efeito conhecido", encurte-o para no máximo 5 palavras mantendo o sentido.
- acao: exatamente uma destas: decisão, diagnóstico, execução, teste, status, investigação, ajuste, pergunta.
  "Me mostre a decisão pendente" = decisão; "Analise e traga o diagnóstico" = diagnóstico;
  "Executar agora" / construir / publicar = execução; "Quero testar" / "Testei" = teste;
  "Como está" = status; investigar causa/lentidão = investigação; mudar configuração/tela/layout = ajuste;
  dúvida simples = pergunta.
Exemplos: {"numero":"664","assunto":"","efeito":"acumulado no gráfico de Metas","acao":"decisão"}
{"numero":"","assunto":"Hermes","efeito":"transcrição lenta","acao":"investigação"}"""


def gerar(trecho, candidatos, efeito_conhecido):
    from agent.auxiliary_client import call_llm
    dicas = []
    for n in candidatos:
        dicas.append(f"#{n}: título no GitHub = {titulo_issue(n)!r}; efeito conhecido = {efeito_conhecido.get(n, '')!r}")
    user = ("Candidatos a Solicitação:\n" + ("\n".join(dicas) if dicas else "(nenhum)")
            + "\n\nComeço da conversa:\n" + trecho[:2500])
    r = call_llm(task="title_generation",
                 messages=[{"role": "system", "content": PROMPT}, {"role": "user", "content": user}],
                 max_tokens=200, temperature=None, reasoning_config={"enabled": False})
    bruto = r.choices[0].message.content or ""
    m = re.search(r"\{.*\}", bruto, re.S)
    d = json.loads(m.group(0)) if m else {}
    num = re.sub(r"\D", "", str(d.get("numero") or ""))
    if num and num not in candidatos:
        num = ""
    acao = str(d.get("acao") or "").strip().lower()
    if acao not in ACOES:
        acao = "pergunta"
    efeito = re.sub(r"[\s.()·#]+$", "", str(d.get("efeito") or "").strip().replace("(", "").replace(")", ""))
    palavras = efeito.split()
    if len(palavras) > 6:  # cortou: tira conectivo solto no fim
        palavras = palavras[:5]
        while palavras and palavras[-1].lower() in SOLTAS:
            palavras.pop()
    efeito = " ".join(palavras) or "conversa"
    assunto = " ".join(str(d.get("assunto") or "Maestro").replace("(", "").replace(")", "").split()[:3]) or "Maestro"
    return num, assunto, efeito, acao


def montar(num, assunto, efeito, acao, cache_ef):
    if num:
        efeito = cache_ef.setdefault(num, efeito)
        return f"#{num} ({efeito}) · {acao}"
    return f"{assunto} ({efeito}) · {acao}"


def unico(titulo, ocupados):
    if titulo not in ocupados:
        return titulo
    i = 2
    while f"{titulo} {i}" in ocupados:
        i += 1
    return f"{titulo} {i}"


def conversas_db(con):
    linhas = con.execute(
        "select id, source, coalesce(title,''), started_at from sessions "
        "where coalesce(hidden,0)=0 and coalesce(title,'') not like 'Subagent%' order by started_at desc").fetchall()
    for sid, fonte, titulo, ini in linhas:
        if fonte in FONTES_FORA:
            continue
        msgs = con.execute("select role, content from messages where session_id=? and role in ('user','assistant') "
                           "order by timestamp, id limit 6", (sid,)).fetchall()
        if not any(r == "assistant" for r, _ in msgs):
            continue  # ainda sem resposta: espera a primeira
        trecho = "\n".join(texto(c) for r, c in msgs if r == "user")[:3000]
        yield sid, titulo, trecho


def conversas_webui():
    if not os.path.isdir(WEBUI_SESS):
        return
    for nome in os.listdir(WEBUI_SESS):
        if not nome.endswith(".json") or nome.startswith("_"):
            continue
        d = ler(os.path.join(WEBUI_SESS, nome), None)
        if not isinstance(d, dict) or not d.get("session_id"):
            continue
        msgs = d.get("messages") or []
        if not any(isinstance(m, dict) and m.get("role") == "assistant" for m in msgs):
            continue
        trecho = "\n".join(texto(m.get("content")) for m in msgs[:8]
                           if isinstance(m, dict) and m.get("role") == "user")[:3000]
        yield d["session_id"], d.get("title") or "", trecho


def main():
    sys.path.insert(0, os.getcwd())
    from hermes_state import SessionDB
    reg = ler(REGISTRO, {})
    reg.setdefault("db", {})
    reg.setdefault("webui", {})       # sid -> nome aplicado
    reg.setdefault("propostas", {})   # sid -> nome a aplicar pela extensão
    cache_ef = ler(EFEITOS, {})
    painel_ef = efeitos_do_painel()
    con = sqlite3.connect(f"file:{HERMES}/state.db?mode=ro", uri=True)
    ocupados = {t for (t,) in con.execute("select title from sessions where title is not null")}
    db = SessionDB()
    feitos = 0
    nomes_por_sid = {}

    def nome_para(sid, trecho):
        if sid in nomes_por_sid:
            return nomes_por_sid[sid]
        cands = list(dict.fromkeys(re.findall(r"#(\d{1,4})\b", trecho)))[:4]
        num, assunto, efeito, acao = gerar(trecho, cands, {**painel_ef, **cache_ef})
        nomes_por_sid[sid] = montar(num, assunto, efeito, acao, cache_ef)
        return nomes_por_sid[sid]

    for sid, titulo, trecho in list(conversas_db(con)):
        if sid in reg["db"]:
            continue
        if PADRAO.match(titulo):
            reg["db"][sid] = titulo
            continue
        if feitos >= MAX_NOVAS_POR_RODADA or not trecho.strip():
            continue
        try:
            novo = unico(nome_para(sid, trecho), ocupados - {titulo})
            if not SECO:
                db.set_session_title(sid, novo)
            ocupados.discard(titulo)
            ocupados.add(novo)
            reg["db"][sid] = novo
            feitos += 1
            print(f"db {sid}: {titulo!r} -> {novo!r}")
        except Exception as e:
            print(f"db {sid}: falhou {e}", file=sys.stderr)

    ocupados_web = {t for _, t, _ in conversas_webui()}
    for sid, titulo, trecho in list(conversas_webui()):
        if sid in reg["webui"]:
            continue
        if PADRAO.match(titulo):
            reg["webui"][sid] = titulo
            reg["propostas"].pop(sid, None)
            continue
        if sid in reg["propostas"] or not trecho.strip():
            continue
        novo = reg["db"].get(sid)
        if not novo:
            if feitos >= MAX_NOVAS_POR_RODADA:
                continue
            try:
                novo = nome_para(sid, trecho)
                feitos += 1
            except Exception as e:
                print(f"webui {sid}: falhou {e}", file=sys.stderr)
                continue
        novo = unico(novo, ocupados_web - {titulo})
        ocupados_web.add(novo)
        reg["propostas"][sid] = novo
        print(f"webui {sid}: {titulo!r} -> {novo!r} (proposta)")

    if not SECO:
        gravar(EFEITOS, cache_ef)
        gravar(REGISTRO, reg)
    print(f"novas: {feitos}")


if __name__ == "__main__":
    main()
