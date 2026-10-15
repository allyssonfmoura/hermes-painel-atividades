#!/usr/bin/env python3
"""Serviço auxiliar do Painel Maestro no Hermes WebUI (só 127.0.0.1).

O WebUI encaminha os pedidos da extensão `maestro-painel` para cá pelo caminho fixo
/api/extensions/maestro-painel/sidecar/<rota>, sempre com o cabeçalho
X-Hermes-Sidecar-Token (token-v1). Sem o token certo, nada responde (exceto /health).

Rotas:
  GET  /health                 -> {"ok": true}
  GET  /estado                 -> chamados por fase, agentes trabalhando, arquivos, ambiente
  GET  /agentes                -> quem paga cada agente (sem segredos) + receitas
  POST /acao   {acao, n}       -> "fila" (vamos fazer) | "tirar" (volta para em análise)
  POST /parar  {pid}           -> encerra um executor (só claude -p / codex exec)
  POST /receitas {...}         -> grava receitas e escolhas por chamado
"""
import hmac, json, os, re, signal, sqlite3, subprocess, time
import datetime as dt
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from zoneinfo import ZoneInfo

PORTA = int(os.environ.get("PAINEL_PORTA", "8796"))
EXT_ID = "maestro-painel"
STATE_DIR = os.environ.get("HERMES_WEBUI_STATE_DIR", "/root/.hermes/webui")
TOKEN_FILE = os.path.join(STATE_DIR, "sidecar-auth", f"{EXT_ID}.token")
HERMES = "/root/.hermes"
ESTADO = f"{HERMES}/painel/estado.json"
RECEITAS = f"{HERMES}/painel/receitas.json"
REPO = "allyssonfmoura/maestro-os"
CODIGO = "/root/Documents/DESENVOLVIMENTO/codigo/maestro-os"
SAIDAS = "/root/Documents/DESENVOLVIMENTO/saidas"
BASE_URL = "https://vpsbr-15649916.tailea14e1.ts.net"
MAC_URL = "https://hermess-macbook-pro.tailea14e1.ts.net:9443"
TZ = ZoneInfo("America/Campo_Grande")
ESTADOS = ["estado: recebido", "estado: em análise", "estado: aguardando Allysson", "estado: vamos fazer",
           "estado: em andamento", "estado: pronto para testar", "estado: no ar", "estado: não vamos fazer"]

AGENTES = {
    "hermes": "Hermes (Opus)",
    "claude": "Claude Code",
    "codex": "Codex",
}
RECEITAS_PADRAO = {
    "padrao": "maestro",
    "construir_padrao": "claude",
    "receitas": [
        {"id": "maestro", "nome": "Maestro padrão",
         "etapas": {"planejar": "hermes", "construir": "claude", "revisar": "codex", "testar": "hermes"}},
        {"id": "investigar", "nome": "Só investigar",
         "etapas": {"planejar": "hermes", "construir": "", "revisar": "", "testar": ""}},
        {"id": "rapido", "nome": "Rápido (sem revisão)",
         "etapas": {"planejar": "hermes", "construir": "claude", "revisar": "", "testar": "hermes"}},
    ],
    "por_chamado": {},
}


# ── utilidades ────────────────────────────────────────────────────────────────
def token_ok(valor):
    try:
        esperado = open(TOKEN_FILE).read().strip()
    except OSError:
        return None  # sem arquivo de token -> 503
    return bool(valor) and hmac.compare_digest(valor.strip(), esperado)


def ler_json(caminho, padrao):
    try:
        with open(caminho) as f:
            return json.load(f)
    except Exception:
        return padrao


def gravar_json(caminho, dados):
    tmp = caminho + ".tmp"
    with open(tmp, "w") as f:
        json.dump(dados, f, ensure_ascii=False, indent=1)
    os.replace(tmp, caminho)


def quando(ts):
    d = dt.datetime.fromtimestamp(ts, TZ)
    hoje = dt.datetime.now(TZ).date()
    if d.date() == hoje:
        return d.strftime("hoje %H:%M")
    if (hoje - d.date()).days == 1:
        return d.strftime("ontem %H:%M")
    return d.strftime("%d/%m %H:%M")


def duracao(seg):
    seg = int(seg)
    if seg < 90:
        return "agora"
    if seg < 3600:
        return f"{seg // 60} min"
    h, m = divmod(seg // 60, 60)
    return f"{h} h {m:02d}" if h < 24 else f"{h // 24} d"


def processos():
    """Lista (pid, segundos rodando, cwd, linha de comando) de todos os processos."""
    r = subprocess.run(["ps", "-eo", "pid=,etimes=,args="], capture_output=True, text=True)
    out = []
    for linha in r.stdout.splitlines():
        partes = linha.strip().split(None, 2)
        if len(partes) < 3:
            continue
        pid, etimes, args = partes
        try:
            cwd = os.readlink(f"/proc/{pid}/cwd")
        except OSError:
            cwd = ""
        out.append((int(pid), int(etimes), cwd, args))
    return out


def nomes_dos_chamados():
    est = ler_json(ESTADO, {})
    d = {}
    for g in est.get("grupos", []):
        for it in g.get("itens", []):
            d[it["n"]] = it["nome"]
    return d


def num_da_pasta(cwd):
    m = re.match(r"(\d+)-", os.path.basename(cwd or ""))
    return int(m.group(1)) if m else None


# ── agentes trabalhando agora ─────────────────────────────────────────────────
def agentes_vivos():
    nomes = nomes_dos_chamados()
    vivos = []

    def rotulo(cwd):
        n = num_da_pasta(cwd)
        if n and n in nomes:
            return f"#{n} ({nomes[n]})"
        if n:
            return f"#{n}"
        return os.path.basename(cwd or "") or "sem pasta"

    for pid, seg, cwd, args in processos():
        if re.search(r"(^|/)claude -p\b", args) or args.startswith("/root/.local/bin/claude -p"):
            vivos.append({"agente": "claude", "nome": AGENTES["claude"], "pid": pid, "pode_parar": True,
                          "tarefa": rotulo(cwd) + ": construindo", "tempo": duracao(seg)})
        elif re.search(r"\bcodex(-linux[^ ]*)? exec\b", args) and "node " not in args[:5]:
            vivos.append({"agente": "codex", "nome": AGENTES["codex"], "pid": pid, "pode_parar": True,
                          "tarefa": rotulo(cwd) + ": revisando", "tempo": duracao(seg)})

    # Conversas do Hermes com mensagem nos últimos 3 minutos
    try:
        con = sqlite3.connect(f"file:{HERMES}/state.db?mode=ro", uri=True, timeout=2)
        agora = time.time()
        linhas = con.execute(
            """select s.id, s.source, coalesce(s.title,''), max(m.timestamp), s.started_at
               from messages m join sessions s on s.id = m.session_id
               where m.timestamp > ? group by s.id order by max(m.timestamp) desc limit 8""",
            (agora - 180,)).fetchall()
        con.close()
        ORIGEM = {"webui": "pelo navegador", "desktop": "pelo app do Mac", "cli": "pelo terminal",
                  "tui": "pelo terminal", "telegram": "pelo Telegram", "subagent": "ajudante",
                  "cron": "automática", "oneshot": "automática", "painel": "no painel"}
        for sid, src, titulo, ultimo, inicio in linhas:
            if (titulo or "").startswith("Pergunta rápida do Allysson"):
                titulo, src = "Respondendo uma pergunta rápida", "painel"
            vivos.append({"agente": "hermes", "nome": AGENTES["hermes"] if src != "subagent" else "Hermes (ajudante)",
                          "pid": None, "pode_parar": False, "sessao": sid,
                          "tarefa": (titulo or "conversa sem título") + f" · {ORIGEM.get(src, src)}",
                          "tempo": duracao(agora - inicio)})
    except Exception as e:  # noqa: BLE001
        vivos.append({"agente": "erro", "nome": "Não consegui ler as conversas", "tarefa": str(e)[:120],
                      "tempo": "", "pode_parar": False, "pid": None})
    return vivos


# ── arquivos saindo ───────────────────────────────────────────────────────────
def arquivos_recentes(limite=10):
    itens = []
    TIPOS = {".pdf": "PDF", ".xlsx": "Excel", ".xls": "Excel", ".csv": "Planilha", ".docx": "Word",
             ".pptx": "Apresentação", ".png": "Imagem", ".jpg": "Imagem", ".html": "Página", ".zip": "Pacote"}
    for pasta, rota, tipo_pasta in (("compartilhar", "compartilhar", None), ("pranchas", "pranchas", "Prancha")):
        base = os.path.join(SAIDAS, pasta)
        if not os.path.isdir(base):
            continue
        for nome in os.listdir(base):
            if nome.startswith("."):
                continue
            p = os.path.join(base, nome)
            try:
                mt = os.path.getmtime(p)
            except OSError:
                continue
            if os.path.isdir(p):
                if tipo_pasta != "Prancha" and not os.path.exists(os.path.join(p, "index.html")):
                    # pasta comum: mostra o arquivo mais novo dentro dela
                    filhos = [f for f in os.listdir(p) if not f.startswith(".")]
                    if not filhos:
                        continue
                    f = max(filhos, key=lambda f: os.path.getmtime(os.path.join(p, f)))
                    ext = os.path.splitext(f)[1].lower()
                    itens.append({"nome": f"{nome}/{f}", "tipo": TIPOS.get(ext, "Arquivo"), "ts": mt,
                                  "url": f"{BASE_URL}/{rota}/{nome}/{f}"})
                    continue
                m = re.match(r"(\d+)(\w?)-(.*)", nome)
                titulo = f"Prancha #{m.group(1)}{m.group(2)} ({m.group(3).replace('-', ' ')})" if m else f"Prancha: {nome.replace('-', ' ')}"
                itens.append({"nome": titulo, "tipo": "Prancha", "ts": mt, "url": f"{BASE_URL}/{rota}/{nome}/"})
            else:
                ext = os.path.splitext(nome)[1].lower()
                itens.append({"nome": nome, "tipo": TIPOS.get(ext, "Arquivo"), "ts": mt, "url": f"{BASE_URL}/{rota}/{nome}"})
    itens.sort(key=lambda i: i["ts"], reverse=True)
    for i in itens:
        i["quando"] = quando(i["ts"])
    return itens[:limite]


# ── ambiente ──────────────────────────────────────────────────────────────────
def ambiente():
    mac = "desconhecido"
    try:
        r = subprocess.run(["tailscale", "status", "--json"], capture_output=True, text=True, timeout=5)
        st = json.loads(r.stdout)
        for peer in (st.get("Peer") or {}).values():
            if peer.get("HostName", "").lower().startswith("hermess-macbook-pro") or \
               (peer.get("DNSName", "").lower().startswith("hermess-macbook-pro")):
                mac = "ligado" if peer.get("Online") else "desligado"
    except Exception:  # noqa: BLE001
        pass
    try:
        up = float(open("/proc/uptime").read().split()[0])
    except Exception:  # noqa: BLE001
        up = 0
    return {"maquina": "VPS", "descricao": "Servidor online, liga 24h", "ligada_ha": duracao(up),
            "url": BASE_URL, "mac": {"estado": mac, "url": MAC_URL}}


# ── quem paga cada agente ─────────────────────────────────────────────────────
def pagadores():
    auth = ler_json(f"{HERMES}/auth.json", {})
    pool = auth.get("credential_pool", {})
    ant = sorted(pool.get("anthropic", []), key=lambda e: e.get("priority", 99))
    out = []
    if ant:
        prim = ant[0]
        tipo = "assinatura" if prim.get("auth_type") == "oauth" else "api"
        reserva = next((e for e in ant[1:] if e.get("auth_type") != prim.get("auth_type")), None)
        out.append({
            "agente": "hermes", "nome": "Hermes (Opus)", "papel": "o que conversa com você aqui",
            "tipo": tipo,
            "titulo": "Assinatura Claude" if tipo == "assinatura" else "API Anthropic, cobrada por uso",
            "conta": "sua conta Claude (plano mensal)" if tipo == "assinatura" else f"crédito \"{prim.get('label', '')}\"",
            "nota": ("Se o limite da assinatura acabar, usa o crédito da API" if reserva and reserva.get("auth_type") == "api_key"
                     else "Se o limite acabar, troca para outra conta cadastrada" if reserva else ""),
        })
    cc = ler_json("/root/.claude/.credentials.json", {})
    out.append({"agente": "claude", "nome": "Claude Code", "papel": "constrói as telas do Maestro",
                "tipo": "assinatura" if cc.get("claudeAiOauth") else "api",
                "titulo": "Assinatura Claude" if cc.get("claudeAiOauth") else "API Anthropic, cobrada por uso",
                "conta": "sua conta Claude (plano mensal)" if cc.get("claudeAiOauth") else "chave de API",
                "nota": "Divide o limite semanal com o Hermes quando os dois usam a assinatura"})
    cx = ler_json("/root/.codex/auth.json", {})
    modo = cx.get("auth_mode", "")
    out.append({"agente": "codex", "nome": "Codex", "papel": "revisa as Entregas",
                "tipo": "assinatura" if modo == "chatgpt" else "api",
                "titulo": "Assinatura ChatGPT" if modo == "chatgpt" else "API OpenAI, cobrada por uso",
                "conta": "sua conta ChatGPT (plano mensal)" if modo == "chatgpt" else "chave de API OpenAI",
                "nota": ""})
    out.append({"agente": "conselho", "nome": "Conselho de modelos", "papel": "junta várias opiniões, quando você liga",
                "tipo": "api", "titulo": "OpenRouter, cobrado por uso", "conta": "crédito OpenRouter",
                "nota": "Só roda quando você pede"})
    return out


# ── ações ─────────────────────────────────────────────────────────────────────
def mudar_estado(n, novo):
    r = subprocess.run(["gh", "issue", "view", str(n), "-R", REPO, "--json", "labels,title,state"],
                       capture_output=True, text=True, timeout=60, cwd=CODIGO)
    if r.returncode != 0:
        raise RuntimeError("não achei o chamado no GitHub")
    info = json.loads(r.stdout)
    if info.get("state") != "OPEN":
        raise RuntimeError("o chamado já está fechado")
    atuais = [l["name"] for l in info["labels"] if l["name"].startswith("estado:")]
    args = ["gh", "issue", "edit", str(n), "-R", REPO, "--add-label", novo]
    for a in atuais:
        if a != novo:
            args += ["--remove-label", a]
    r = subprocess.run(args, capture_output=True, text=True, timeout=60, cwd=CODIGO)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip()[:200] or "o GitHub recusou")
    # atualiza o painel na hora (o cron também roda a cada minuto)
    subprocess.Popen(["/usr/bin/python3", f"{HERMES}/scripts/painel-atividades.py"],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return {"ok": True, "antes": atuais, "agora": novo}


def parar(pid):
    for p, _seg, _cwd, args in processos():
        if p == pid:
            if args.startswith("/root/.local/bin/claude -p") or re.search(r"\bcodex(-linux[^ ]*)? exec\b", args):
                os.kill(pid, signal.SIGTERM)
                return {"ok": True}
            raise RuntimeError("esse processo não é um executor")
    raise RuntimeError("o executor já tinha terminado")


def receitas():
    r = ler_json(RECEITAS, None)
    if not isinstance(r, dict) or not r.get("receitas"):
        r = json.loads(json.dumps(RECEITAS_PADRAO))
    return r


def salvar_receitas(dados):
    atual = receitas()
    for k in ("padrao", "construir_padrao", "receitas", "por_chamado"):
        if k in dados:
            atual[k] = dados[k]
    # validação mínima
    if not isinstance(atual["receitas"], list) or not all(isinstance(x, dict) and x.get("id") for x in atual["receitas"]):
        raise RuntimeError("receitas inválidas")
    if atual.get("construir_padrao") not in AGENTES:
        atual["construir_padrao"] = "claude"
    gravar_json(RECEITAS, atual)
    return atual


# ── pergunta rápida ───────────────────────────────────────────────────────────
import threading, uuid  # noqa: E402

HERMES_BIN = "/root/.hermes/hermes-agent/.hermes/bin/hermes"
PERGUNTAS = {}  # id -> {"estado": "pensando|pronto|erro", "resposta": str, "t": ts}
_LOCK_P = threading.Lock()


def _texto(c):
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return " ".join(x.get("text", "") for x in c if isinstance(x, dict) and x.get("type") == "text")
    return ""


def assunto_da_conversa(sid, limite_chars=12000):
    if not sid or not re.fullmatch(r"[A-Za-z0-9_\-]{6,64}", sid):
        return ""
    try:
        d = ler_json(os.path.join(STATE_DIR, "sessions", f"{sid}.json"), {})
    except Exception:  # noqa: BLE001
        return ""
    linhas, total = [], 0
    for m in reversed(d.get("messages") or []):
        if m.get("role") not in ("user", "assistant"):
            continue
        t = _texto(m.get("content")).strip()
        if not t:
            continue
        t = re.sub(r"\[Workspace::v1:[^\]]*\]\s*", "", t)[:1800]
        quem = "Allysson" if m.get("role") == "user" else "Hermes"
        linhas.append(f"{quem}: {t}")
        total += len(t)
        if total > limite_chars or len(linhas) >= 16:
            break
    titulo = d.get("title") or ""
    if not linhas:
        return ""
    return f"Conversa principal: \"{titulo}\"\n" + "\n\n".join(reversed(linhas))


def _rodar_pergunta(pid, pergunta, contexto):
    prompt = (
        "Pergunta rápida do Allysson, feita num painel lateral. Responda curto e direto, em pt-BR, "
        "em até 8 linhas, sem perguntar de volta e sem executar nenhuma mudança (só leitura e pesquisa). "
        "Isto NÃO faz parte da conversa principal.\n\n"
    )
    if contexto:
        prompt += "Para você saber do que ele está falando, este é o trecho recente da conversa principal:\n<<<\n" + contexto + "\n>>>\n\n"
    prompt += "Pergunta: " + pergunta
    try:
        r = subprocess.run([HERMES_BIN, "chat", "-q", prompt, "-Q", "--max-turns", "8", "-t", "web,file"],
                           capture_output=True, text=True, timeout=240, cwd="/root/workspace",
                           env=dict(os.environ, HOME="/root"))
        saida = r.stdout.strip()
        saida = re.sub(r"\n*session_id:\s*\S+\s*$", "", saida).strip()
        res = {"estado": "pronto", "resposta": saida or "(sem resposta)"} if r.returncode == 0 or saida else \
              {"estado": "erro", "resposta": (r.stderr.strip()[-300:] or "o Hermes não respondeu")}
    except subprocess.TimeoutExpired:
        res = {"estado": "erro", "resposta": "demorou demais (mais de 4 minutos)"}
    except Exception as e:  # noqa: BLE001
        res = {"estado": "erro", "resposta": str(e)[:200]}
    with _LOCK_P:
        PERGUNTAS[pid].update(res)


def nova_pergunta(d):
    pergunta = str(d.get("pergunta") or "").strip()[:4000]
    if not pergunta:
        raise RuntimeError("escreva a pergunta")
    contexto = assunto_da_conversa(str(d.get("sessao") or "")) if d.get("com_assunto") else ""
    pid = uuid.uuid4().hex[:12]
    with _LOCK_P:
        agora = time.time()
        for k in [k for k, v in PERGUNTAS.items() if agora - v["t"] > 3600]:
            PERGUNTAS.pop(k, None)
        PERGUNTAS[pid] = {"estado": "pensando", "resposta": "", "t": agora, "com_assunto": bool(contexto)}
    threading.Thread(target=_rodar_pergunta, args=(pid, pergunta, contexto), daemon=True).start()
    return {"id": pid, "com_assunto": bool(contexto)}


# ── servidor ──────────────────────────────────────────────────────────────────
class H(BaseHTTPRequestHandler):
    server_version = "painel-maestro/1"

    def log_message(self, fmt, *args):  # silencioso, só erros vão para o journal
        pass

    def _resp(self, cod, corpo):
        b = json.dumps(corpo, ensure_ascii=False).encode()
        self.send_response(cod)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def _autorizado(self):
        ok = token_ok(self.headers.get("X-Hermes-Sidecar-Token", ""))
        if ok is None:
            self._resp(503, {"erro": "token do painel ausente"})
            return False
        if not ok:
            self._resp(401, {"erro": "não autorizado"})
            return False
        return True

    def _corpo(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 200_000:
            raise RuntimeError("pedido grande demais")
        return json.loads(self.rfile.read(n) or b"{}") if n else {}

    def do_GET(self):
        rota = self.path.split("?")[0].rstrip("/") or "/"
        if rota == "/health":
            return self._resp(200, {"ok": True, "runtime": {"sidecar": "painel-maestro"}})
        if not self._autorizado():
            return
        try:
            if rota == "/estado":
                est = ler_json(ESTADO, {})
                return self._resp(200, {
                    "atualizado": est.get("atualizado", ""), "grupos": est.get("grupos", []),
                    "no_ar": est.get("no_ar", 0), "erros": est.get("erros", []), "repo": est.get("repo", REPO),
                    "agora": est.get("agora", []), "rodando": est.get("rodando", []),
                    "agentes": agentes_vivos(), "arquivos": arquivos_recentes(), "ambiente": ambiente(),
                    "receitas": receitas(),
                })
            if rota.startswith("/pergunta/"):
                with _LOCK_P:
                    p = PERGUNTAS.get(rota.split("/")[-1])
                    return self._resp(200, dict(p)) if p else self._resp(404, {"erro": "pergunta não encontrada"})
            if rota == "/agentes":
                return self._resp(200, {"pagadores": pagadores(), "receitas": receitas(), "nomes": AGENTES})
            return self._resp(404, {"erro": "rota desconhecida"})
        except Exception as e:  # noqa: BLE001
            return self._resp(500, {"erro": str(e)[:200]})

    def do_POST(self):
        rota = self.path.split("?")[0].rstrip("/")
        if not self._autorizado():
            return
        try:
            d = self._corpo()
            if rota == "/acao":
                n = int(d.get("n"))
                acao = d.get("acao")
                if acao == "fila":
                    return self._resp(200, mudar_estado(n, "estado: vamos fazer"))
                if acao == "tirar":
                    return self._resp(200, mudar_estado(n, "estado: em análise"))
                return self._resp(400, {"erro": "ação desconhecida"})
            if rota == "/parar":
                return self._resp(200, parar(int(d.get("pid"))))
            if rota == "/receitas":
                return self._resp(200, salvar_receitas(d))
            if rota == "/pergunta":
                return self._resp(200, nova_pergunta(d))
            return self._resp(404, {"erro": "rota desconhecida"})
        except Exception as e:  # noqa: BLE001
            return self._resp(400, {"erro": str(e)[:200]})


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", PORTA), H).serve_forever()
