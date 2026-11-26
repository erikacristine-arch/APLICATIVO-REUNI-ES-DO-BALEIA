#!/usr/bin/env python3
"""
Monta os arquivos prontos para o Google Apps Script a partir do código-fonte.

Uso (na pasta codigo-fonte):
    python3 montar.py

Gera:
    ../public/index.html       -> app servido pelo servidor Node.js (Railway + Supabase)
    ../apps-script/index.html  -> colar no arquivo "index" do Apps Script (versão Google)
    ../apps-script/Code.gs     -> colar no arquivo "Código.gs" do Apps Script (versão Google)
    ../public/seguranca.html   -> página dos planos de segurança (só na versão servidor)

Precisa de Python 3 e Node.js (o esbuild é baixado pelo npx na primeira vez).
O esbuild converte o JavaScript para uma versão mais antiga e só com
caracteres básicos, para funcionar em qualquer navegador (inclusive Firefox)
e não se alterar ao copiar e colar.
"""
import base64
import json
import os
import re
import shutil
import subprocess
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.path.join(AQUI, '..', 'apps-script')


def ler(nome, modo='r'):
    with open(os.path.join(AQUI, nome), modo, **({} if 'b' in modo else {'encoding': 'utf-8'})) as f:
        return f.read()


def imagem_js(nome, pedaco=1000):
    """Imagem como texto JavaScript quebrado em linhas curtas."""
    dados = 'data:image/jpeg;base64,' + base64.b64encode(ler(nome, 'rb')).decode()
    partes = [dados[i:i + pedaco] for i in range(0, len(dados), pedaco)]
    return '[\n' + ',\n'.join('"' + p + '"' for p in partes) + '\n].join("")'


def json_js(nome):
    return json.dumps(json.loads(ler(nome)), ensure_ascii=False, indent=0).replace('<', '\\u003c')


def esbuild():
    if shutil.which('esbuild'):
        return ['esbuild']
    return ['npx', '--yes', 'esbuild@0.24.0']


def converter_script(html):
    m = list(re.finditer(r'<script>(.*?)</script>', html, re.S))[-1]
    r = subprocess.run(esbuild() + ['--loader=js', '--target=es2017', '--charset=ascii', '--log-level=warning'],
                       input=m.group(1), capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit('Erro do esbuild:\n' + r.stderr)
    return html[:m.start(1)] + '\n' + r.stdout + html[m.end(1):]


def main():
    html = ler('app.html')
    html = html.replace('__LOGO_B_JS__', imagem_js('logo-baleia.jpg'))
    html = html.replace('__LOGO_U_JS__', imagem_js('logo-ueb.jpg'))
    html = html.replace('__SEED_JOGOS__', json_js('jogos.json'))
    html = html.replace('__CRYPTO_PARAMS__', json_js('conferencia-codigos.json'))
    faltando = [p for p in ('__LOGO_B_JS__', '__LOGO_U_JS__', '__SEED_JOGOS__', '__CRYPTO_PARAMS__') if p in html]
    if faltando:
        sys.exit('Marcadores não substituídos: ' + ', '.join(faltando))
    html = converter_script(html)

    ver = json.loads(ler('conferencia-codigos.json'))['ver']
    code = ler('Code.modelo.gs').replace('__VER__', json.dumps(ver, ensure_ascii=False, indent=2))

    # Versão do servidor próprio (Railway + Supabase): o app fala com /api
    servidor = html.replace('<script>\n(function(){var errs=[];', "<script>window.RN_API='/api';</script>\n<script>\n(function(){var errs=[];", 1)
    if servidor == html:
        sys.exit('Não achei onde avisar o app sobre o servidor (/api).')
    servidor = servidor.replace('Confira se o arquivo index foi colado inteiro (a última linha deve ser </html>), salve e implante uma nova versão.',
                                'Recarregue a página. Se continuar, avise quem cuida do app.')
    publico = os.path.join(AQUI, '..', 'public')
    os.makedirs(publico, exist_ok=True)
    with open(os.path.join(publico, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(servidor)

    os.makedirs(SAIDA, exist_ok=True)
    with open(os.path.join(SAIDA, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(html)
    with open(os.path.join(SAIDA, 'Code.gs'), 'w', encoding='utf-8') as f:
        f.write(code)
    # Página dos planos de segurança (só na versão servidor)
    seg = ler('seguranca.html')
    b64 = lambda n: 'data:image/jpeg;base64,' + base64.b64encode(ler(n, 'rb')).decode()
    seg = seg.replace('__BALEIA__', b64('logo-baleia.jpg')).replace('__UEB__', b64('logo-ueb.jpg'))
    seg = seg.replace('__CRYPTO_PARAMS__', json_js('conferencia-codigos.json'))
    for marca in ('__BALEIA__', '__UEB__', '__CRYPTO_PARAMS__'):
        if marca in seg:
            sys.exit('Marcador não substituído em seguranca.html: ' + marca)
    seg = converter_script(seg)
    with open(os.path.join(publico, 'seguranca.html'), 'w', encoding='utf-8') as f:
        f.write(seg)
    print('Pronto: public/index.html, public/seguranca.html, apps-script/index.html e apps-script/Code.gs atualizados.')


if __name__ == '__main__':
    main()
