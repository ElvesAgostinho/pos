# -*- coding: utf-8 -*-
"""O QUE VAI DENTRO DE UM PACOTE QUE SE ENTREGA A TODOS OS CLIENTES.

Os dois scripts de build (`instalador/build_atualizacao.ps1` e
`build_instalador.ps1`) copiam o backend com `robocopy` e uma lista de
exclusões. Essa lista é a única coisa entre o computador de quem desenvolve e o
disco de todos os clientes — e é uma lista de padrões escrita à mão.

Foi por aí que escapou uma chave: a lista excluía `private.pem` e `*.key.bak`,
e o ficheiro chamava-se `private.pem.bak`. Não batia com nenhum dos dois. Uma
chave RSA de assinatura, do computador de quem desenvolve, ia em **todos** os
pacotes de atualização.

Estes testes leem a lista dos próprios scripts e verificam as DUAS metades do
problema, porque consertar uma estraga a outra:

  1. **Nada de privado sai.** Chaves privadas, cópias de chaves, `.env`, bases
     de dados, licenças.
  2. **O que é público TEM de sair.** `licensing/engine/public.pem` é a chave com
     que a instalação do cliente verifica a licença. Quem "resolvesse" o ponto 1
     excluindo todos os `.pem` (ou a pasta das chaves) deixava todos os clientes
     sem conseguir validar a licença — um estrago maior do que o que corrigia.

Não precisam de correr o PowerShell nem de montar um pacote: a lista de
exclusões é texto, e os ficheiros sensíveis estão no disco. É uma verificação de
segundos que se faz em qualquer máquina.
"""
import fnmatch
import re
import unittest
from pathlib import Path

RAIZ_PROJETO = Path(__file__).resolve().parent.parent          # ...\POS\backend
INSTALADOR = RAIZ_PROJETO.parent / 'instalador'
SCRIPTS = [INSTALADOR / 'build_atualizacao.ps1', INSTALADOR / 'build_instalador.ps1']


def _exclusoes(script):
    """Os padrões de `/XF` (ficheiros) e `/XD` (pastas) de um script de build."""
    texto = script.read_text(encoding='utf-8', errors='replace')
    fich, pastas = [], []
    for marca, destino in (('/XF', fich), ('/XD', pastas)):
        m = re.search(re.escape(marca) + r'([^\n`]*)', texto)
        if m:
            destino.extend(p for p in m.group(1).split() if not p.startswith('/'))
    return fich, pastas


def _excluido(nome, padroes):
    return any(fnmatch.fnmatch(nome.lower(), p.lower()) for p in padroes)


@unittest.skipUnless(all(s.exists() for s in SCRIPTS), 'os scripts de build não estão presentes')
class NadaDePrivadoSaiNoPacoteTests(unittest.TestCase):

    # Nomes que NUNCA podem ir num pacote, aconteça o que acontecer.
    PROIBIDOS = [
        'private.pem', 'private.pem.bak', 'private.pem.old', 'private.key',
        'private.key.bak', 'license.key', 'license.key.bak', '.env',
        'db.sqlite3', 'erp.sqlite3', 'db.sqlite3-wal', 'db.sqlite3-shm',
    ]

    # E estes TÊM de ir — o cliente não funciona sem eles.
    OBRIGATORIOS = ['public.pem', 'public.v1.pem', '.env.example']

    def test_nenhum_nome_de_chave_privada_passa_a_lista(self):
        for script in SCRIPTS:
            fich, _ = _exclusoes(script)
            self.assertTrue(fich, f'{script.name}: não encontrei a lista /XF nenhuma.')
            for nome in self.PROIBIDOS:
                self.assertTrue(
                    _excluido(nome, fich),
                    f'{script.name} não exclui "{nome}". A lista é '
                    f'{fich} — e este ficheiro ia para o disco de todos os clientes.')

    def test_as_chaves_publicas_continuam_a_ir(self):
        """A metade que se estraga ao consertar a outra. Sem o `public.pem` do
        licenciamento, nenhuma instalação consegue verificar a licença dela."""
        for script in SCRIPTS:
            fich, _ = _exclusoes(script)
            for nome in self.OBRIGATORIOS:
                self.assertFalse(
                    _excluido(nome, fich),
                    f'{script.name} passou a excluir "{nome}". Se for o public.pem do '
                    f'licenciamento, todos os clientes deixam de poder validar a licença.')

    def test_os_dois_scripts_excluem_exactamente_o_mesmo(self):
        """Um pacote de atualização e um instalador completo levam o mesmo
        backend. Duas listas que divergem são um buraco que só aparece num dos
        caminhos — e ninguém sabe em qual."""
        listas = {s.name: tuple(sorted(_exclusoes(s)[0])) for s in SCRIPTS}
        self.assertEqual(len(set(listas.values())), 1,
                         f'As listas de exclusão divergiram: {listas}')

    def test_os_ficheiros_sensiveis_QUE_EXISTEM_estao_todos_cobertos(self):
        """A prova contra o disco a sério, e não contra uma lista de nomes que
        eu imaginei: percorre o backend, encontra o que parece um segredo, e
        exige que cada um esteja excluído. Um `private.pem.old` que alguém
        deixe para trás amanhã torna este teste vermelho hoje."""
        fich, pastas = _exclusoes(SCRIPTS[0])
        suspeitos, escapados = [], []
        for p in RAIZ_PROJETO.rglob('*'):
            if not p.is_file():
                continue
            rel = p.relative_to(RAIZ_PROJETO)
            if any(parte in {d.lower() for d in pastas} or parte in
                   ('venv', '.venv', '__pycache__', 'staticfiles', 'media', 'node_modules')
                   for parte in (x.lower() for x in rel.parts[:-1])):
                continue
            nome = p.name.lower()
            privado = (('private' in nome and nome.endswith(('.pem', '.key', '.bak')))
                       or nome in ('.env', 'license.key')
                       or nome.endswith(('.sqlite3', '.sqlite3-wal', '.sqlite3-shm')))
            if privado:
                suspeitos.append(str(rel))
                if not _excluido(p.name, fich):
                    escapados.append(str(rel))
        self.assertEqual(escapados, [],
                         f'Estes ficheiros existem no backend e NÃO são excluídos — vão '
                         f'no pacote para todos os clientes: {escapados}. '
                         f'(sensíveis encontrados: {suspeitos})')
