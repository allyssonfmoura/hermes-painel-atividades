#!/usr/bin/env python3
"""Copia comum/escritorio-core.js para dentro do WebUI e do app, entre os marcadores
/* ESCRITORIO-CORE-INICIO */ ... /* ESCRITORIO-CORE-FIM */. Rode depois de editar o núcleo."""
import os, re

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
nucleo = open(os.path.join(AQUI, "escritorio-core.js")).read()
m = re.search(r"/\* ESCRITORIO-CORE-INICIO.*?\*/\n(.*?)/\* ESCRITORIO-CORE-FIM \*/", nucleo, re.S)
corpo = m.group(1)
PAD = re.compile(r"(/\* ESCRITORIO-CORE-INICIO \*/\n).*?(/\* ESCRITORIO-CORE-FIM \*/)", re.S)
for rel in ("webui/extensao/assets/escritorio.js", "desktop/plugin.js"):
    p = os.path.join(RAIZ, rel)
    txt = open(p).read()
    novo, k = PAD.subn(lambda x: x.group(1) + corpo + x.group(2), txt)
    if k != 1:
        raise SystemExit(f"{rel}: marcadores não encontrados ({k})")
    if novo != txt:
        open(p, "w").write(novo)
        print("atualizado", rel)
    else:
        print("igual", rel)
