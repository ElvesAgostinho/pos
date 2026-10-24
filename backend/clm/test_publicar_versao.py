# -*- coding: utf-8 -*-
"""PUBLICAR UMA VERSÃO — e o campo que pedia o impossível.

O ecrã de publicação do PCC tinha um campo só: "Link de descarga do instalador".
Mas o link não existe até alguém pôr o ficheiro algures na internet — e o PCC
não o guardava, só guardava a morada. Quem publica a versão é quem faz o
produto, não um administrador de sistemas: ficava preso num campo que lhe pedia
uma coisa que o próprio sistema não lhe dava maneira de produzir.

E havia um segundo laço, mais caro: o rótulo dizia ".exe" e dava um exemplo
.exe. Quem seguisse o ecrã à letra publicava o instalador completo — e é
precisamente o .exe que DESLIGA o botão "Atualizar agora" do lado do cliente.
Publicava-se uma atualização que obrigava todos os clientes a reinstalar à mão,
sem ninguém perceber porquê.

Estes testes exercem o que passou a ser verdade: carrega-se o ficheiro, e o
sistema trata do resto.
"""
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase

from clm.models import SystemRelease


class PublicarUmaVersaoTests(APITestCase):

    def setUp(self):
        self.user = User.objects.create_superuser('fornecedor', '', 'x')
        self.client.force_authenticate(self.user)

    def _pacote(self, nome='MwanaLodge-Update-1.1.0.zip'):
        return SimpleUploadedFile(nome, b'PK\x03\x04 conteudo do pacote',
                                  content_type='application/zip')

    def test_carregar_o_ficheiro_gera_o_link_sozinho(self):
        """O que destrava a publicação: quem tem o .zip na pasta Output já tem
        tudo o que precisa."""
        r = self.client.post('/api/clm/releases/', {
            'version': '1.1.0', 'package': self._pacote(),
            'release_notes': 'Correções do terminal.'}, format='multipart')
        self.assertEqual(r.status_code, 201, r.content[:400])
        rel = SystemRelease.objects.get(version='1.1.0')
        self.assertTrue(rel.download_url,
                        'O ficheiro foi carregado e o link de descarga ficou vazio — '
                        'o cliente não tem de onde o ir buscar.')
        self.assertIn('.zip', rel.download_url)

    def test_o_link_gerado_e_absoluto(self):
        """Quem o vai abrir é a instalação do cliente, noutra máquina e noutra
        rede. Um caminho relativo (`/media/...`) só funcionaria dentro do
        próprio PCC — do lado do cliente dava um endereço que não existe."""
        self.client.post('/api/clm/releases/', {
            'version': '1.2.0', 'package': self._pacote()}, format='multipart')
        url = SystemRelease.objects.get(version='1.2.0').download_url
        self.assertTrue(url.startswith('http'),
                        f'O link ficou relativo ({url}): a instalação do cliente não o '
                        f'consegue abrir.')

    def test_o_ficheiro_fica_guardado_e_descarrega_se(self):
        """Não basta haver um link: tem de haver ficheiro do outro lado."""
        self.client.post('/api/clm/releases/', {
            'version': '1.3.0', 'package': self._pacote()}, format='multipart')
        rel = SystemRelease.objects.get(version='1.3.0')
        self.assertTrue(rel.package.name.startswith('releases/'),
                        f'O pacote foi guardado fora da pasta das versões: {rel.package.name}')
        with rel.package.open('rb') as f:
            self.assertEqual(f.read(), b'PK\x03\x04 conteudo do pacote',
                             'O ficheiro guardado não é o que foi carregado.')

    def test_quem_ja_tem_onde_alojar_continua_a_poder_colar_o_link(self):
        """A mudança não tira nada a quem já tinha o ficheiro noutro sítio."""
        r = self.client.post('/api/clm/releases/', {
            'version': '1.4.0',
            'download_url': 'https://cdn.exemplo.ao/MwanaLodge-Update-1.4.0.zip'},
            format='json')
        self.assertEqual(r.status_code, 201, r.content[:300])
        self.assertEqual(SystemRelease.objects.get(version='1.4.0').download_url,
                         'https://cdn.exemplo.ao/MwanaLodge-Update-1.4.0.zip')

    def test_publicar_sem_ficheiro_e_sem_link_e_recusado_com_explicacao(self):
        """Uma versão sem nenhum dos dois é uma versão que o cliente vê anunciada
        e não consegue descarregar — pior do que não a publicar."""
        r = self.client.post('/api/clm/releases/', {'version': '1.5.0'}, format='json')
        self.assertEqual(r.status_code, 400, r.content[:300])
        texto = str(r.data)
        self.assertIn('Carregue o ficheiro', texto)
        self.assertIn('link', texto)

    def test_a_versao_que_o_cliente_recebe_e_a_ultima_publicada(self):
        """É esta consulta que o botão "Atualizar agora" do cliente usa."""
        for v in ('1.0.0', '1.1.0', '1.2.0'):
            self.client.post('/api/clm/releases/', {
                'version': v, 'package': self._pacote(f'update-{v}.zip')}, format='multipart')
        ultima = SystemRelease.objects.first()      # ordering = ['-created_at']
        self.assertEqual(ultima.version, '1.2.0')
        self.assertTrue(ultima.download_url.endswith('.zip'))

    def test_um_exe_publicado_continua_a_ser_aceite(self):
        """O instalador completo tem o seu lugar — quando o que muda está fora do
        `app/` (Python novo, serviço novo). O que não pode é ser a única opção
        que o ecrã sugere."""
        r = self.client.post('/api/clm/releases/', {
            'version': '2.0.0',
            'package': SimpleUploadedFile('MwanaLodge-Setup-2.0.0.exe', b'MZ instalador',
                                          content_type='application/octet-stream')},
            format='multipart')
        self.assertEqual(r.status_code, 201, r.content[:300])
        self.assertTrue(SystemRelease.objects.get(version='2.0.0').download_url.endswith('.exe'))
