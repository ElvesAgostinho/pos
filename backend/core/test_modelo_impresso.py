# -*- coding: utf-8 -*-
"""QUAL O MODELO COM QUE CADA DOCUMENTO SE IMPRIME.

Isto decide o aspecto do papel que o hotel entrega na mão do hóspede. Uma
escolha errada não dá erro nenhum — dá uma factura com o rodapé do hotel
errado, ou com o IBAN de outra casa, e ninguém dá por isso até alguém
transferir dinheiro para a conta errada.

Por isso a regra é testada degrau a degrau, e não só "devolve alguma coisa".
"""
from django.test import TestCase

from core.models import DocumentTemplate
from core.modelo_impresso import PADRAO, modelo_em_dicionario, modelo_para
from identity.models import Company, EnterpriseGroup, Hotel


class QualOModeloQueMandaNoPapel(TestCase):

    def setUp(self):
        grupo = EnterpriseGroup.objects.create(name='Grupo')
        empresa = Company.objects.create(group=grupo, name='Top Hotels')
        self.luanda = Hotel.objects.create(company=empresa, name='Hotel Luanda')
        self.benguela = Hotel.objects.create(company=empresa, name='Hotel Benguela')

    def _modelo(self, **kw):
        base = dict(name='m', doc_type='FT', is_active=True)
        base.update(kw)
        return DocumentTemplate.objects.create(**base)

    # ------------------------------------------------------------------
    def test_sem_modelo_nenhum_nao_se_inventa_um(self):
        """Uma instalação nova não tem modelos, e o papel tem de sair à mesma.

        E não se grava uma ficha sozinha na primeira impressão: encher a lista
        do dono com coisas que ele não criou é pior do que não ter nenhuma.
        """
        self.assertIsNone(modelo_para('FT'))
        self.assertEqual(DocumentTemplate.objects.count(), 0)

    def test_o_modelo_do_hotel_ganha_ao_da_instalacao(self):
        """Num grupo de três hotéis, cada um tem o seu papel."""
        geral = self._modelo(name='Geral')
        proprio = self._modelo(name='Luanda', hotel=self.luanda)

        self.assertEqual(modelo_para('FT', self.luanda.id), proprio)
        # O de Benguela não tem ficha própria — fica com o da instalação.
        self.assertEqual(modelo_para('FT', self.benguela.id), geral)

    def test_um_modelo_de_outro_hotel_nunca_se_usa(self):
        """Era o erro caro: o papel de Benguela a sair com o IBAN de Luanda."""
        self._modelo(name='Luanda', hotel=self.luanda)

        self.assertIsNone(modelo_para('FT', self.benguela.id),
                          'usou o modelo de outro hotel')

    def test_um_modelo_desligado_nao_conta(self):
        self._modelo(name='Antigo', is_active=False)

        self.assertIsNone(modelo_para('FT'))

    def test_o_predefinido_ganha_aos_outros_do_mesmo_tipo(self):
        self._modelo(name='Primeiro')
        marcado = self._modelo(name='O escolhido', is_default=True)

        self.assertEqual(modelo_para('FT'), marcado)

    def test_dois_modelos_iguais_escolhem_sempre_o_mesmo(self):
        """Sem ordem explícita, a base devolve-os pela ordem que lhe apetecer —
        e o papel mudava de aspecto entre duas impressões da mesma factura."""
        primeiro = self._modelo(name='A')
        self._modelo(name='B')

        self.assertEqual(modelo_para('FT'), primeiro)
        self.assertEqual(modelo_para('FT'), primeiro)

    def test_o_modelo_de_outro_tipo_de_documento_nao_serve(self):
        self._modelo(name='Recibo', doc_type='RC')

        self.assertIsNone(modelo_para('FT'))

    def test_sem_tipo_de_documento_nao_se_adivinha(self):
        self._modelo(name='Qualquer')

        self.assertIsNone(modelo_para(None))
        self.assertIsNone(modelo_para(''))


class OQueChegaAoDesenhoDoPapel(TestCase):
    """O desenhador não pode ter de perguntar se existe ficha.

    Se tivesse, ficaria cheio de `se houver modelo e se a caixa estiver
    ligada` — e é aí que um se esquece, e uma casa fica sem QR na factura.
    """

    def test_sem_modelo_vem_tudo_com_os_valores_de_fabrica(self):
        d = modelo_em_dicionario(None)

        for chave in PADRAO:
            self.assertIn(chave, d, f'faltou "{chave}" — o papel ia desenhar sem ele')
        self.assertTrue(d['show_qr'], 'o QR da AGT tem de vir ligado de fábrica')
        self.assertEqual(d['accent_color'], PADRAO['accent_color'])

    def test_com_modelo_vem_tudo_na_mesma_e_o_que_a_ficha_diz(self):
        m = DocumentTemplate.objects.create(
            name='Papel timbrado', doc_type='FT', accent_color='#7A5C2E',
            show_signature_line=True, footer='Obrigado pela sua visita.')

        d = modelo_em_dicionario(m)

        for chave in PADRAO:
            self.assertIn(chave, d)
        self.assertEqual(d['accent_color'], '#7A5C2E')
        self.assertTrue(d['show_signature_line'])
        self.assertEqual(d['footer'], 'Obrigado pela sua visita.')
        self.assertEqual(d['id'], m.id)

    def test_uma_caixa_desligada_chega_desligada(self):
        """`False` não pode ser confundido com "não preenchido".

        Era a armadilha: um `if valor:` em vez de `if valor is not None:`
        deixava passar o valor de fábrica (ligado) por cima do que o hotel
        tinha desligado — e a caixa que o dono desmarcou voltava sozinha.
        """
        m = DocumentTemplate.objects.create(name='Sem pagamentos', doc_type='FT',
                                            show_payments=False, show_qr=False)

        d = modelo_em_dicionario(m)

        self.assertFalse(d['show_payments'], 'a caixa desmarcada voltou a ligar-se sozinha')
        self.assertFalse(d['show_qr'])
