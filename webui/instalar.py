#!/usr/bin/env python3
"""Instala/atualiza a extensão maestro-painel no Hermes WebUI.

Uso: instalar.py [STATE_DIR]   (padrão /root/.hermes/webui)
- copia webui/extensao -> STATE_DIR/extensions/maestro-painel
- registra em extension-install-manifest.json (vale no próximo carregamento da página)
- libera o proxy do serviço auxiliar (extension-overrides.json)
- cria o token token-v1 em STATE_DIR/sidecar-auth/maestro-painel.token (0600)
"""
import datetime as dt, json, os, secrets, shutil, sys

EXT = "maestro-painel"
ORIGEM = "http://127.0.0.1:8796"
AQUI = os.path.dirname(os.path.abspath(__file__))
STATE = sys.argv[1] if len(sys.argv) > 1 else "/root/.hermes/webui"


def ler(p, d):
    try:
        with open(p) as f:
            return json.load(f)
    except Exception:
        return d


def gravar(p, d):
    tmp = p + ".tmp"
    with open(tmp, "w") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
    os.replace(tmp, p)


destino = os.path.join(STATE, "extensions", EXT)
if os.path.isdir(destino):
    shutil.rmtree(destino)
shutil.copytree(os.path.join(AQUI, "extensao"), destino)
arquivos = sorted(os.path.relpath(os.path.join(r, f), destino) for r, _, fs in os.walk(destino) for f in fs)

man_p = os.path.join(STATE, "extension-install-manifest.json")
man = ler(man_p, {"version": 1, "installed": {}})
man.setdefault("installed", {})[EXT] = {
    "version": "1.0.0", "files": arquivos,
    "installed_at": dt.datetime.now(dt.timezone.utc).isoformat(),
}
gravar(man_p, man)

ov_p = os.path.join(STATE, "extension-overrides.json")
ov = ler(ov_p, {"version": 1, "disabled_extensions": [], "sidecar_proxy_consents": {}})
ov.setdefault("version", 1)
ov["disabled_extensions"] = [x for x in ov.get("disabled_extensions", []) if x != EXT]
ov.setdefault("sidecar_proxy_consents", {})[EXT] = ORIGEM
gravar(ov_p, ov)

tdir = os.path.join(STATE, "sidecar-auth")
os.makedirs(tdir, mode=0o700, exist_ok=True)
tok = os.path.join(tdir, f"{EXT}.token")
if not os.path.exists(tok):
    fd = os.open(tok, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.write(fd, secrets.token_urlsafe(32).encode())
    os.close(fd)
print(f"instalado em {destino} ({len(arquivos)} arquivos)")
