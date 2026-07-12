"""
Catálogo de parâmetros do POS (globais).

O NÚMERO é a referência estável: é por ele que o suporte fala com o cliente
("mude o 8128"). O nome pode mudar de versão para versão; o número nunca.
"""
from django.core.management.base import BaseCommand

from pos.models import PosParameter
from pos import params as pengine

B, I, T, C = 'BOOL', 'INT', 'TEXT', 'CHOICE'

# (nº, grupo, nome, tipo, opções, valor por omissão, ajuda)
PARAMS = [
    # ---------------- Geral ----------------
    (8183, 'Geral', 'Fazer backup no fecho do dia', B, [], 'false', 'Ativar só quando não existe PMS.'),
    (8176, 'Geral', 'Configuração de teclado por', C, ['Setor', 'Terminal', 'Operador'], 'Setor', ''),
    (8001, 'Geral', 'Layout do teclado', C, ['QWERTY (Português)', 'AZERTY', 'Numérico'], 'QWERTY (Português)', ''),
    (8128, 'Geral', 'Emitir sempre nota de crédito ao anular fatura', B, [], 'true',
     'LIGADO: anular uma fatura emite automaticamente a Nota de Crédito (exigência da AGT).'),
    (8012, 'Geral', 'Modo de Pagamento base', C, ['Cash', 'Cartão', 'Transferência'], 'Cash', ''),
    (8036, 'Geral', 'Dias a guardar o log', I, [], '30', ''),
    (8062, 'Geral', 'Permitir Fechar o Dia no Front Office', B, [], 'false',
     'Se desligado, só o backoffice pode fechar o dia.'),
    (8124, 'Geral', 'Transferências de Mesas', C, ['Total', 'Parcial', 'Não permitir'], 'Parcial', ''),
    (8101, 'Geral', 'Nº de documentos visíveis no POS', I, [], '0', '0 = todos.'),
    (8063, 'Geral', 'Tempo para refrescar mesas (em segundos)', I, [], '8',
     'De quanto em quanto tempo o mapa de sala é re-lido do servidor.'),
    (8084, 'Geral', 'Mostrar Status do Pagamento', B, [], 'false', ''),
    (8088, 'Geral', 'Tempo em minutos para terminar sessão automaticamente', I, [], '60', ''),
    (8138, 'Geral', 'Tempo em minutos para fechar POS automaticamente', I, [], '120', ''),
    (8089, 'Geral', 'Hora para aviso de fecho do Dia', I, [], '5', ''),
    (8110, 'Geral', 'Permitir alterar contas de eventos', B, [], 'true', ''),
    (8127, 'Geral', 'Configuração de documentos por', C, ['Setor', 'Terminal'], 'Setor', ''),
    (8143, 'Geral', 'Formato do Nome da Entidade', T, [], '{name1}, {name2}', ''),
    (8148, 'Geral', 'Nome da entidade por defeito para Faturas Simplificadas', T, [], 'Consumidor Final', ''),
    (8333, 'Geral', 'Tipo de Hóspede é obrigatório', B, [], 'true', ''),
    (8145, 'Geral', 'Permissões de utilizador', B, [], 'true', ''),
    (8197, 'Geral', 'Quantidade máxima a dividir antes de emitir aviso', I, [], '10', ''),
    (8150, 'Geral', 'Primeiro número de mesa a utilizar nas contas de cartão', I, [], '100000', ''),
    (8175, 'Geral', 'Perguntar tipo de cliente', B, [], 'true',
     'LIGADO: ao abrir a mesa, o POS pergunta se é passante ou hóspede.'),
    (8180, 'Geral', 'Largura do scroll no teclado de artigos', I, [], '0', ''),
    (8177, 'Geral', 'Colocar como oferta ao aplicar 100% desconto no artigo', B, [], 'true', ''),
    (8207, 'Geral', 'Linhas a adicionar antes de cortar o papel', I, [], '2', ''),
    (8149, 'Geral', 'Não imprimir artigos com valor 0', B, [], 'false', ''),
    (8222, 'Geral', 'Cash Pickup - Nº de vias', I, [], '2', ''),
    (8240, 'Geral', 'Descontos exclusivos', T, [], '', ''),
    (8256, 'Geral', 'Mensagem final no talão', T, [], 'Obrigado pela sua visita.', ''),
    (8271, 'Geral', 'Imagem de Fundo (Ativar)', B, [], 'true', ''),
    (8364, 'Geral', 'Impressão de Talão - Casas decimais em valores', I, [], '2', ''),
    (8620, 'Geral', 'Desconto máximo sem supervisor (%)', I, [], '10',
     'Acima deste valor, o POS exige a autorização de um supervisor.'),

    # ---------------- Reporting ----------------
    (1363, 'Reporting', 'Servidor de Relatórios (URL)', T, [], '', 'Windows Reporting Services (SSRS).'),
    (1360, 'Reporting', 'Gestor de Relatórios (URL)', T, [], '', ''),
    (8053, 'Reporting', 'Ligação aos Relatórios', T, [], '', ''),
    (8374, 'Reporting', 'Relatório - Ficha técnica', T, [], '', ''),

    # ---------------- Moeda ----------------
    (8006, 'Moeda', 'Moeda base', T, [], 'Kz', ''),
    (8059, 'Moeda', 'Moeda para Troco', T, [], 'Kz', ''),
    (8007, 'Moeda', 'Moeda alternativa', T, [], 'USD', ''),

    # ---------------- Interface com PMS ----------------
    (8035, 'Interface com PMS', 'Interface com PMS', B, [], 'true',
     'LIGADO: o POS pode lançar consumos na conta do quarto.'),
    (8126, 'Interface com PMS', 'Lançar encargos PMS por', C, ['Setor', 'Artigo', 'Sub-Família'], 'Setor', ''),
    (8055, 'Interface com PMS', 'Visualizar Paymasters/Dummies do PMS', B, [], 'true', ''),
    (8236, 'Interface com PMS', 'Mostrar grupo/empresa na pesquisa de quartos', B, [], 'true', ''),
    (8365, 'Interface com PMS', 'Visualizar assinatura do hóspede', B, [], 'true', ''),
    (8064, 'Interface com PMS', 'Informação do hóspede', B, [], 'true', ''),
    (8174, 'Interface com PMS', 'Verificar se a conta PMS está aberta ao anular talões de quarto', B, [], 'true', ''),
    (8147, 'Interface com PMS', 'Plano de refeições - Forçar a pesquisa de hóspedes', B, [], 'false', ''),

    # ---------------- Descontos ----------------
    (8237, 'Descontos', 'Desconto de linha detalhado', B, [], 'false', ''),
    (8075, 'Descontos', 'Desconto - Hóspede', T, [], '', ''),
    (8076, 'Descontos', 'Desconto - Empresa', T, [], '', ''),
    (8077, 'Descontos', 'Desconto - Agência', T, [], '', ''),
    (8079, 'Descontos', 'Desconto - Grupo', T, [], '', ''),
    (8081, 'Descontos', 'Desconto - Proprietário', T, [], '', ''),

    # ---------------- Gratificação ----------------
    (8214, 'Gratificação', 'Remover a gratificação do dinheiro no fecho', B, [], 'true', ''),
    (8213, 'Gratificação', 'Modo de pagamento para remover gratificação', C, ['Cash', 'Cartão'], 'Cash', ''),

    # ---------------- Fecho de caixa ----------------
    (8005, 'Fecho de caixa', 'Perguntar Total Vendido', C, ['Modo Detalhado', 'Modo Simples', 'Não perguntar'], 'Modo Detalhado',
     'CEGO: o operador conta o dinheiro sem ver o esperado — é assim que se deteta desvio.'),
    (8215, 'Fecho de caixa', 'Gratificações', B, [], 'true', ''),
    (8038, 'Fecho de caixa', 'Vendas por Artigo', B, [], 'true', ''),
    (8040, 'Fecho de caixa', 'Vendas por Família', B, [], 'true', ''),
    (8192, 'Fecho de caixa', 'Vendas por Sub-Família', B, [], 'false', ''),
    (8042, 'Fecho de caixa', 'Vendas por Documento', B, [], 'false', ''),
    (8044, 'Fecho de caixa', 'Resumo do IVA', B, [], 'true', ''),
    (8046, 'Fecho de caixa', 'Ofertas', B, [], 'true', ''),
    (8135, 'Fecho de caixa', 'Descontos', B, [], 'true', ''),
    (8061, 'Fecho de caixa', 'Encargos', B, [], 'false', ''),
    (8178, 'Fecho de caixa', 'Cancelamentos', B, [], 'true',
     'O relatório de fecho mostra o que foi anulado — é a primeira coisa que um dono quer ver.'),

    # ---------------- Fecho do Dia ----------------
    (8198, 'Fecho do Dia', 'Fecho do dia Automático', B, [], 'false', ''),
    (8199, 'Fecho do Dia', 'Fecho do dia Automático - Hora', T, [], '00:00', ''),
    (8037, 'Fecho do Dia', 'Vendas por Artigo', B, [], 'true', ''),
    (8216, 'Fecho do Dia', 'Gratificações', B, [], 'true', ''),
    (8039, 'Fecho do Dia', 'Vendas por Família', B, [], 'false', ''),
    (8191, 'Fecho do Dia', 'Vendas por Sub-Família', B, [], 'true', ''),
    (8041, 'Fecho do Dia', 'Vendas por Documento', B, [], 'false', ''),
    (8043, 'Fecho do Dia', 'Resumo do IVA', B, [], 'true', ''),
    (8179, 'Fecho do Dia', 'Cancelamentos', B, [], 'true', ''),
    (8231, 'Fecho do Dia', 'E-mails para avisar quando são libertadas mesas abertas (;)', T, [], '', ''),

    # ---------------- Artigos ----------------
    (8209, 'Artigos', 'Configurar IVA por sub-família', B, [], 'false', ''),
    (8010, 'Artigos', 'Gerar códigos automaticamente', B, [], 'true', ''),
    (8009, 'Artigos', 'Número de dígitos do código', I, [], '4', ''),
    (8011, 'Artigos', 'Utilizar código da sub-família como prefixo', B, [], 'true', ''),
    (8235, 'Artigos', 'Usar o código do artigo como código de barras se não estiver preenchido', B, [], 'true', ''),
]


class Command(BaseCommand):
    help = 'Cria/atualiza o catálogo de parâmetros globais do POS.'

    def handle(self, *args, **o):
        for n, group, name, kind, choices, default, help_text in PARAMS:
            PosParameter.objects.update_or_create(number=n, defaults={
                'name': name, 'group': group, 'kind': kind, 'choices': choices,
                'default': default, 'help_text': help_text, 'scope': 'GLOBAL',
            })
        pengine.invalidate()
        self.stdout.write(self.style.SUCCESS(
            f'{PosParameter.objects.filter(scope="GLOBAL").count()} parâmetros globais em '
            f'{len(set(p[1] for p in PARAMS))} grupos.'))
