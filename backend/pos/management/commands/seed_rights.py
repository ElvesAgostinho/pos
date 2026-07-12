"""
Catálogo de permissões numeradas + grupos de utilizadores.

O NÚMERO é a referência estável: o suporte diz "dê-lhe o 20258" e toda a gente sabe
do que se fala. Hierárquico — 20007=Artigos tem filhos (Adicionar, Editar, Apagar).
"""
from django.core.management.base import BaseCommand
from pos.models import PosRight, PosUserGroup

# (nº, nome, nº do pai, grupo)
RIGHTS = [
    (20000, 'Configuração', None, 'Geral'),
    (20001, 'Relatórios', None, 'Geral'),
    (20002, 'Fecho do Dia', None, 'Geral'),
    (20003, 'Utilitários', None, 'Geral'),
    (20252, 'Libertar mesas abertas no fecho do dia', None, 'Geral'),
    (20237, 'Pesquisar Documentos', None, 'Geral'),

    (20007, 'Artigos', None, 'Artigos'),
    (20008, 'Adicionar', 20007, 'Artigos'),
    (20009, 'Editar', 20007, 'Artigos'),
    (20010, 'Apagar', 20007, 'Artigos'),
    (20258, 'Permitir alterar preço', 20007, 'Artigos'),

    (20011, 'Grupo', None, 'Artigos'),
    (20012, 'Adicionar', 20011, 'Artigos'),
    (20013, 'Editar', 20011, 'Artigos'),
    (20014, 'Apagar', 20011, 'Artigos'),

    (20015, 'Família', None, 'Artigos'),
    (20016, 'Adicionar', 20015, 'Artigos'),
    (20017, 'Editar', 20015, 'Artigos'),
    (20018, 'Apagar', 20015, 'Artigos'),

    (20019, 'Sub Família', None, 'Artigos'),
    (20020, 'Adicionar', 20019, 'Artigos'),
    (20021, 'Editar', 20019, 'Artigos'),
    (20022, 'Apagar', 20019, 'Artigos'),

    (20031, 'Mensagens', None, 'Artigos'),
    (20032, 'Adicionar', 20031, 'Artigos'),
    (20033, 'Editar', 20031, 'Artigos'),
    (20034, 'Apagar', 20031, 'Artigos'),

    (20035, 'Manutenção', None, 'Artigos'),
    (20238, 'Criação rápida de artigos', 20035, 'Artigos'),
    (20239, 'Alteração rápida de artigos', 20035, 'Artigos'),
    (20240, 'Alterações de Preço', 20035, 'Artigos'),
    (20241, 'Outros', 20035, 'Artigos'),

    (20100, 'Descontos', None, 'Vendas'),
    (20101, 'Aplicar desconto', 20100, 'Vendas'),
    (20102, 'Desconto acima do limite (supervisor)', 20100, 'Vendas'),
    (20110, 'Anular venda', None, 'Vendas'),
    (20111, 'Anular linha já enviada à produção', 20110, 'Vendas'),
    (20120, 'Caixa', None, 'Vendas'),
    (20121, 'Abrir caixa', 20120, 'Vendas'),
    (20122, 'Fechar caixa', 20120, 'Vendas'),
    (20123, 'Sangria / Reforço', 20120, 'Vendas'),
]

GROUPS = [
    (10, 'ADMIN|DIR', 'Administração | Direcção'),
    (20, 'COMERCIAL', 'Comercial'),
    (30, 'CONSULTA', 'Consulta'),
    (40, 'FIN', 'Financeiro'),
    (50, 'FO-AGENT', 'Front Office | Back Office'),
    (60, 'FO-MANAGER', 'Front Office Manager'),
    (70, 'FO-SUP', 'Front Office Supervisor'),
    (80, 'HK|MANUT', 'Governanta | Manutenção'),
    (90, 'KITCHEN', 'Cozinha'),
    (100, 'MANAGERPOS', 'Manager POS'),
    (110, 'SPA', 'Spa'),
    (120, 'STORE-AGTN', 'Armazém - Operador'),
    (130, 'STORE-MAN', 'Armazém - Responsável'),
    (140, 'WAITER', 'Empregado de Mesa'),
]


class Command(BaseCommand):
    help = 'Cria o catálogo de permissões e os grupos de utilizadores.'

    def handle(self, *args, **o):
        for num, name, parent, group in RIGHTS:
            PosRight.objects.update_or_create(number=num, defaults={
                'name': name, 'module': 'POS', 'group': group})
        for num, name, parent, group in RIGHTS:
            if parent:
                r = PosRight.objects.get(number=num)
                r.parent = PosRight.objects.get(number=parent)
                r.save(update_fields=['parent'])

        for nr, code, name in GROUPS:
            PosUserGroup.objects.get_or_create(code=code, defaults={
                'number': nr, 'name': name, 'is_active': True})

        self.stdout.write(self.style.SUCCESS(
            f'{PosRight.objects.count()} permissões · {PosUserGroup.objects.count()} grupos'))
