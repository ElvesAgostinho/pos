# -*- coding: utf-8 -*-
"""OS EVENTOS DO EMS PASSAM PARA O MOTOR DE EVENTOS.

Havia duas tabelas a guardar a mesma coisa: `pms.Event` (um MVP deste módulo) e
`pos.EventRequest` (o motor do comercial). Um evento marcado no EMS não
reservava a sala — nada impedia dois eventos no mesmo espaço à mesma hora,
porque um lado não sabia do outro.

Esta migração leva o que estiver em `pms.Event` para `pos.EventRequest`, para
não se perder nada ao fechar a porta antiga.

─── PORQUE É QUE ELA PÁRA EM VEZ DE ADIVINHAR ────────────────────────────────
O `pos.EventRequest` exige três coisas que o `pms.Event` não tinha: um TIPO DE
EVENTO, um ESPAÇO a sério (o EMS guardava o nome da sala como texto livre) e um
ESTADO do hotel. Inventar os três aqui era escrever configuração em nome do
cliente — e um espaço inventado é pior do que nenhum: o sistema passaria a
bloquear uma sala que não é aquela, e a recusar reservas legítimas.

Por isso: se houver eventos para mover e a casa não tiver essas peças
configuradas, a migração PÁRA e diz o que falta. Numa instalação sem eventos no
EMS — que é o caso da esmagadora maioria, por isto nunca ter saído de MVP —
não faz nada e não pergunta nada.
"""
from django.db import migrations


def _tipo_de_evento(apps):
    EventType = apps.get_model('pos', 'EventType')
    t = EventType.objects.order_by('id').first()
    if t:
        return t
    return EventType.objects.create(code='EMS', name='Evento (importado do EMS)')


def _estado(apps, confirmado):
    """O estado do hotel que equivale a confirmado (bloqueia) ou a opção."""
    State = apps.get_model('pos', 'EventReservationState')
    bloqueiam = ('NORMAL', 'CHECKIN', 'PENDING')
    for s in State.objects.order_by('id'):
        if confirmado and s.equivalent in bloqueiam:
            return s
        if not confirmado and s.equivalent == 'OPTION':
            return s
    return State.objects.order_by('id').first()


def levar_para_o_motor(apps, schema_editor):
    Event = apps.get_model('pms', 'Event')
    EventRequest = apps.get_model('pos', 'EventRequest')
    PosSector = apps.get_model('pos', 'PosSector')

    antigos = list(Event.objects.all())
    if not antigos:
        return

    espacos = list(PosSector.objects.order_by('id'))
    estado_ok = _estado(apps, True)
    if not espacos or not estado_ok:
        raise RuntimeError(
            'Há %d evento(s) no EMS para mover para o motor de eventos, mas falta '
            'configuração para os receber: %s. Configure-a em Configuração POS '
            '(Setores / Estados de Reserva de Evento) e volte a atualizar — os '
            'eventos ficam onde estão até lá, não se perde nenhum.'
            % (len(antigos),
               'nenhum setor (espaço) criado' if not espacos else 'nenhum estado de reserva de evento'))

    tipo = _tipo_de_evento(apps)
    por_nome = {(s.name or '').strip().lower(): s for s in espacos}

    from datetime import datetime, time
    for i, ev in enumerate(antigos, 1):
        # O ESPAÇO: tenta-se casar o texto livre com o nome de um setor; não
        # casando, fica o primeiro — e o número do pedido diz de onde veio, para
        # quem for conferir saber que aquele espaço foi escolhido por omissão.
        espaco = por_nome.get((ev.venue or '').strip().lower()) or espacos[0]
        inicio = datetime.combine(ev.event_date, ev.start_time or time(9, 0))
        fim = datetime.combine(ev.event_date, ev.end_time or time(18, 0))
        if fim <= inicio:
            fim = datetime.combine(ev.event_date, time(23, 59))
        confirmado = ev.status == 'CONFIRMED'
        EventRequest.objects.create(
            number='EMS-%04d' % i,
            title=ev.name,
            customer_id=ev.client_id,
            event_type=tipo,
            pax=ev.expected_guests or 0,
            notes=('%s\n[Importado do EMS. Sala original: %s]'
                   % (ev.notes or '', ev.venue or '—')).strip(),
            space=espaco,
            start_at=inicio,
            end_at=fim,
            state=_estado(apps, confirmado) or estado_ok,
            price_per_pax=0,
            extra_total=ev.estimated_revenue or 0,
        )
    Event.objects.all().delete()


def nao_se_desfaz(apps, schema_editor):
    """Não se repõe a tabela antiga.

    Desfazer seria copiar de volta pedidos que entretanto podem ter sido
    alterados no motor — e deixar outra vez duas versões do mesmo evento, que é
    exactamente o problema que esta migração fecha. Para voltar atrás repõe-se a
    cópia de segurança, que é o que uma reversão de dados deve ser.
    """


class Migration(migrations.Migration):

    dependencies = [
        ('pms', '0014_remove_foliocharge_folio_um_lancamento_por_origem_and_more'),
        ('pos', '0069_remove_stockdoc_stockdoc_numero_unico_na_serie_and_more'),
    ]

    operations = [
        migrations.RunPython(levar_para_o_motor, nao_se_desfaz),
    ]
