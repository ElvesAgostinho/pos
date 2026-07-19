"""Traz os alergénios e as mensagens para DENTRO do POS.

O POS é autossuficiente: não pode depender de módulo nenhum. Os dados que viviam
nas tabelas do módulo de Produção passam para as tabelas do POS — sem perder uma
linha. Se as tabelas antigas já não existirem, a migração passa em silêncio (é o
caso de uma instalação nova, que nasce só com o POS).
"""
from django.db import migrations


def trazer(apps, schema_editor):
    con = schema_editor.connection
    tabelas = set(con.introspection.table_names())
    Allergen = apps.get_model('pos', 'Allergen')
    Perfil = apps.get_model('pos', 'ItemPosProfile')
    Msg = apps.get_model('pos', 'KitchenMessage')
    Opt = apps.get_model('pos', 'KitchenMessageOption')

    mapa_alerg = {}
    if 'prod_allergen' in tabelas:
        with con.cursor() as c:
            c.execute('SELECT id, code, name, icon, photo_url, is_active FROM prod_allergen')
            for i, code, name, icon, photo, ativo in c.fetchall():
                novo, _ = Allergen.objects.get_or_create(
                    code=code, defaults={'name': name, 'icon': icon,
                                         'photo_url': photo, 'is_active': bool(ativo)})
                mapa_alerg[i] = novo.id

    # ligação artigo ↔ alergénios (a M2M do perfil de produção)
    if mapa_alerg and 'prod_item_profile_allergens' in tabelas:
        with con.cursor() as c:
            c.execute('SELECT p.item_id, l.allergen_id FROM prod_item_profile_allergens l '
                      'JOIN prod_item_profile p ON p.id = l.itemproductionprofile_id')
            for item_id, alerg_id in c.fetchall():
                if alerg_id not in mapa_alerg:
                    continue
                perfil, _ = Perfil.objects.get_or_create(item_id=item_id)
                perfil.allergens.add(mapa_alerg[alerg_id])

    if 'prod_pos_message' in tabelas:
        with con.cursor() as c:
            c.execute('SELECT id, code, sort_order, is_message, is_comment, is_active '
                      'FROM prod_pos_message')
            antigas = c.fetchall()
        mapa_msg = {}
        for i, code, ordem, is_msg, is_com, ativo in antigas:
            nova, _ = Msg.objects.get_or_create(
                code=code, defaults={'name': code, 'sort_order': ordem,
                                     'is_message': bool(is_msg), 'is_comment': bool(is_com),
                                     'is_active': bool(ativo)})
            mapa_msg[i] = nova.id
        if 'prod_pos_message_option' in tabelas:
            with con.cursor() as c:
                c.execute('SELECT message_id, key_label, print_label, sort_order '
                          'FROM prod_pos_message_option')
                for msg_id, chave, impresso, ordem in c.fetchall():
                    if msg_id in mapa_msg:
                        Opt.objects.get_or_create(
                            message_id=mapa_msg[msg_id], code=(chave or impresso or '')[:40],
                            defaults={'text': impresso or chave or '', 'sort_order': ordem})


def nada(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [('pos', '0053_allergen_kitchenmessage_itemposprofile_and_more')]
    operations = [migrations.RunPython(trazer, nada)]
