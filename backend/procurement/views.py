from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import PurchaseOrder, PurchaseOrderLine, GoodsReceipt, GoodsReceiptLine
from .serializers import (
    PurchaseOrderSerializer, PurchaseOrderLineSerializer,
    GoodsReceiptSerializer, GoodsReceiptLineSerializer,
)


def _proximo_numero(model, campo, prefixo):
    """Numeração automática de documento, saltando os números já ocupados.

    O `count() + 1` sozinho não serve: numa numeração com falhas (documentos
    lançados à mão, algum apagado) o número calculado já existe, e o campo é
    único — a gravação rebenta. O ciclo salta até encontrar um número livre.
    """
    n = model.objects.count() + 1
    while model.objects.filter(**{campo: f'{prefixo}-{n:06d}'}).exists():
        n += 1
    return f'{prefixo}-{n:06d}'


def _fechar_ou_atualizar_encomenda(po):
    """Põe a encomenda no estado que a realidade das receções manda.

    A encomenda ficava "Aprovada" para sempre, mesmo depois de a mercadoria toda
    ter chegado: os estados "Receção Parcial" e "Fechada" existiam na lista e
    nada no sistema os usava. O comprador não tinha como saber o que o fornecedor
    ainda deve entregar — ficava a telefonar para perguntar, ou encomendava outra
    vez o que já estava a caminho.

    Devolve a lista de AVISOS (texto para o ecrã). Receber mais do que o
    encomendado não se recusa — as caixas estão no cais e o stock tem de refletir
    a realidade — mas tem de ficar DITO, porque é dinheiro que ninguém aprovou.
    """
    if po is None or po.status == 'Canceled':
        return []

    # Quanto já entrou, por linha de encomenda, contando só receções validadas.
    recebido = {}
    for grn in po.receipts.filter(status='Validated').prefetch_related('lines'):
        for ln in grn.lines.all():
            chave = ln.po_line_id or ('artigo', ln.item_id)
            recebido[chave] = recebido.get(chave, Decimal('0')) + (ln.quantity_received or Decimal('0'))

    avisos = []
    linhas = list(po.lines.select_related('item').all())
    completas = 0
    alguma_entrada = False
    for linha in linhas:
        ja = recebido.get(linha.id, Decimal('0')) + recebido.get(('artigo', linha.item_id), Decimal('0'))
        if ja > 0:
            alguma_entrada = True
        if ja >= (linha.quantity_requested or Decimal('0')):
            completas += 1
        if ja > (linha.quantity_requested or Decimal('0')):
            avisos.append(
                f'{linha.item.name}: receberam-se {ja} mas a encomenda {po.po_number} pedia '
                f'{linha.quantity_requested}. Confirme a guia do fornecedor antes de pagar.')

    if linhas and completas == len(linhas):
        novo = 'Closed'
    elif alguma_entrada:
        novo = 'Partial_Received'
    elif po.status in ('Partial_Received', 'Closed'):
        # Todas as receções foram anuladas: a encomenda volta a estar a aguardar entrega.
        novo = 'Approved'
    else:
        novo = po.status

    if novo != po.status:
        po.status = novo
        po.save(update_fields=['status', 'updated_at'])
    return avisos


def _criar_divida_ao_fornecedor(grn):
    """Receber mercadoria é assumir uma dívida — ela nasce aqui ou não nasce.

    Isto estava dentro de um `except Exception: pass`. O número era calculado com
    `count() + 1` SEM verificar se já existia, e as duas apps numeram as faturas
    de fornecedor com o mesmo formato (FF-000001): bastava uma numeração com
    falhas para o número calculado já estar ocupado. A gravação rebentava, o erro
    era engolido, e o resultado era o pior possível — a mercadoria em stock e a
    casa a dever dinheiro a um fornecedor que nunca aparecia nas contas a pagar.

    Agora: se o módulo Financeiro não estiver licenciado, não há dívida a criar e
    segue-se em frente; qualquer OUTRA falha faz cair a receção inteira (é melhor
    não receber do que receber sem registar a dívida).
    """
    try:
        from finance.models import SupplierInvoice
    except ImportError:
        return None
    if SupplierInvoice.objects.filter(grn_ref=grn.receipt_number).exists():
        return None                      # já existe (validação repetida)
    total = sum((l.quantity_received * l.unit_cost for l in grn.lines.all()), Decimal('0'))
    return SupplierInvoice.objects.create(
        number=_proximo_numero(SupplierInvoice, 'number', 'FF'),
        supplier_name=grn.supplier.commercial_name, supplier_id_ref=grn.supplier_id,
        supplier_ref=grn.supplier_invoice_ref, grn_ref=grn.receipt_number,
        date=timezone.localdate(), amount=total, status='OPEN')


def _divida_da_recepcao(grn):
    """A fatura de fornecedor que nasceu desta receção (se o Financeiro existir)."""
    try:
        from finance.models import SupplierInvoice
    except ImportError:
        return None
    return (SupplierInvoice.objects.filter(grn_ref=grn.receipt_number)
            .exclude(status='CANCELLED').first())


def _repor_custo_medio_antes_da_entrada(item, qty_in, unit_cost):
    """Desfaz no custo médio o efeito de uma entrada que vai ser anulada.

    O custo médio é ponderado: uma compra a 1.000 sobre stock a 800 deixa o artigo
    a 900. Anular a compra sem desfazer isto deixava o artigo a 900 — a casa
    passava a calcular a margem de cada prato com um custo que nunca pagou.

    Retira-se o peso da entrada ao valor total do stock:
        custo_antes = (qtd_total × custo_atual − qtd_entrada × custo_entrada)
                      ÷ (qtd_total − qtd_entrada)
    Se nada se mexeu desde a receção, isto devolve exactamente o custo anterior.
    Se já houve movimentos pelo meio, é a melhor reposição possível — e é o que os
    ERP's fazem num estorno "ao valor da receção".

    Chamar ANTES de tirar a quantidade do armazém (a fórmula conta com a entrada
    ainda incluída no saldo).
    """
    from django.db.models import Sum as _Sum
    from inventory.models import StockLevel

    qty_in = Decimal(str(qty_in))
    unit_cost = Decimal(str(unit_cost))
    total = StockLevel.objects.filter(item=item).aggregate(s=_Sum('quantity_on_hand'))['s'] or Decimal('0')
    resto = total - qty_in
    if resto <= 0:
        # Não fica stock nenhum: o custo deixa de valorizar coisa alguma e a
        # próxima entrada define-o de novo. Mexer aqui só inventava um número.
        return
    atual = item.current_average_cost or Decimal('0')
    anterior = ((total * atual) - (qty_in * unit_cost)) / resto
    if anterior < 0:
        anterior = Decimal('0')
    item.current_average_cost = anterior.quantize(Decimal('0.0001'))
    item.save(update_fields=['current_average_cost', 'updated_at'])


def _recompute_po_total(po_id):
    try:
        po = PurchaseOrder.objects.get(id=po_id)
    except PurchaseOrder.DoesNotExist:
        return
    po.total_amount = po.lines.aggregate(t=Sum('line_total'))['t'] or 0
    po.save(update_fields=['total_amount', 'updated_at'])


class PurchaseOrderViewSet(viewsets.ModelViewSet):
    serializer_class = PurchaseOrderSerializer

    def get_queryset(self):
        qs = (
            PurchaseOrder.objects
            .select_related('supplier', 'delivery_warehouse', 'hotel')
            .prefetch_related('lines__item', 'lines__uom')
            .order_by('-created_at')
        )
        status_param = self.request.query_params.get('status')
        supplier = self.request.query_params.get('supplier')
        if status_param:
            qs = qs.filter(status=status_param)
        if supplier:
            qs = qs.filter(supplier_id=supplier)
        return qs

    def perform_create(self, serializer):
        # Deriva o hotel do armazém de entrega se não for enviado.
        data = serializer.validated_data
        if not data.get('po_number'):
            data['po_number'] = _proximo_numero(PurchaseOrder, 'po_number', 'OC')
        if not data.get('hotel') and data.get('delivery_warehouse'):
            serializer.save(hotel=data['delivery_warehouse'].hotel)
        else:
            serializer.save()

    @action(detail=True, methods=['post'])
    def set_status(self, request, pk=None):
        po = self.get_object()
        new_status = request.data.get('status')
        if new_status not in dict(PurchaseOrder.STATUS_CHOICES):
            return Response({'detail': 'Estado inválido.'}, status=status.HTTP_400_BAD_REQUEST)
        po.status = new_status
        po.save(update_fields=['status', 'updated_at'])
        return Response(self.get_serializer(po).data)


class PurchaseOrderLineViewSet(viewsets.ModelViewSet):
    serializer_class = PurchaseOrderLineSerializer

    def get_queryset(self):
        qs = PurchaseOrderLine.objects.select_related('item', 'uom').all()
        po = self.request.query_params.get('purchase_order')
        return qs.filter(purchase_order_id=po) if po else qs

    def perform_create(self, serializer):
        line = serializer.save()
        _recompute_po_total(line.purchase_order_id)

    def perform_update(self, serializer):
        line = serializer.save()
        _recompute_po_total(line.purchase_order_id)

    def perform_destroy(self, instance):
        po_id = instance.purchase_order_id
        instance.delete()
        _recompute_po_total(po_id)


class GoodsReceiptViewSet(viewsets.ModelViewSet):
    serializer_class = GoodsReceiptSerializer

    def get_queryset(self):
        qs = (
            GoodsReceipt.objects
            .select_related('supplier', 'delivery_warehouse', 'purchase_order')
            .prefetch_related('lines__item', 'lines__uom')
            .order_by('-created_at')
        )
        po = self.request.query_params.get('purchase_order')
        return qs.filter(purchase_order_id=po) if po else qs

    def perform_create(self, serializer):
        data = serializer.validated_data
        po = data.get('purchase_order')
        extra = {}
        if not data.get('receipt_number'):
            data['receipt_number'] = _proximo_numero(GoodsReceipt, 'receipt_number', 'GRN')
        if po:
            if not data.get('supplier'):
                extra['supplier'] = po.supplier
            if not data.get('delivery_warehouse'):
                extra['delivery_warehouse'] = po.delivery_warehouse
        serializer.save(**extra)

    # ------------------------------------------------------------------ validar
    @action(detail=True, methods=['post'])
    def validate_receipt(self, request, pk=None):
        """
        Valida a receção (estado 'Validated'): ENTRA EM STOCK cada linha no armazém de entrega
        e atualiza o CUSTO MÉDIO PONDERADO do artigo. Dispara também o signal do SRM (performance
        do fornecedor). Idempotente — só valida/entra em stock uma vez.

        TUDO OU NADA: a entrada em stock, o estado do documento, o estado da
        encomenda e a dívida ao fornecedor são UMA operação. Antes não eram: cada
        linha entrava em stock por sua conta e, se a linha seguinte falhasse, as
        anteriores ficavam em stock com o documento ainda "Em Conferência" — e a
        validação seguinte metia essa mercadoria em stock OUTRA VEZ.
        """
        from inventory import stock as stock_engine
        grn = self.get_object()
        if grn.status == 'Validated':
            return Response({'detail': 'Receção já validada.'}, status=status.HTTP_400_BAD_REQUEST)
        if grn.status == 'Canceled':
            return Response({'detail': 'Receção anulada — já não pode ser validada.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if not grn.lines.exists():
            return Response({'detail': 'A receção não tem linhas: não há nada a dar entrada.'},
                            status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            for line in grn.lines.select_related('item').all():
                stock_engine.move_in(
                    grn.delivery_warehouse, line.item, line.quantity_received, line.unit_cost,
                    reference=grn.receipt_number, note=f'Receção {grn.receipt_number}',
                    by=(request.user.username if request.user.is_authenticated else None),
                    mtype='GRN',
                    # O lote e o prazo da GUIA DO FORNECEDOR. Em branco, o motor usa
                    # o nº da receção como lote e a validade da ficha do artigo.
                    lote=line.lot_number, validade=line.expiry_date)
            grn.status = 'Validated'
            grn.save()  # save completo dispara o post_save do SRM
            avisos = _fechar_ou_atualizar_encomenda(grn.purchase_order)
            _criar_divida_ao_fornecedor(grn)

        data = self.get_serializer(grn).data
        data['warnings'] = avisos
        return Response(data)

    # ------------------------------------------------------------------- anular
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Anula a receção e DESFAZ o que ela fez: o stock e o custo médio.

        Recebe-se por erro mais vezes do que se pensa (documento trocado,
        mercadoria que era de outro hotel, preço errado na guia). Sem anulação, a
        única saída era "corrigir" o stock à mão num inventário — e o custo médio
        ficava contaminado para sempre pelo preço de uma compra que não existiu.

        O que esta anulação faz, por esta ordem:
          1. recusa se a mercadoria já saiu (venderam-se as garrafas: anular punha
             o stock negativo, e stock negativo estraga o custo médio de todas as
             compras seguintes);
          2. recusa se a dívida já foi paga ao fornecedor (o dinheiro já saiu da
             casa; anular deixava um pagamento sem fatura que o explique);
          3. tira a quantidade do armazém, deixando movimento de estorno no ledger
             (a anulação não apaga história);
          4. repõe o custo médio como estava antes desta entrada;
          5. anula a dívida ao fornecedor.
        """
        from inventory import stock as stock_engine
        from inventory.models import StockLevel

        grn = self.get_object()
        if grn.status == 'Canceled':
            return Response({'detail': 'Receção já anulada.'}, status=status.HTTP_400_BAD_REQUEST)

        if grn.status == 'Validated':
            # (1) a mercadoria ainda está toda cá?
            for line in grn.lines.select_related('item').all():
                lvl = StockLevel.objects.filter(warehouse=grn.delivery_warehouse,
                                                item=line.item).first()
                em_casa = (lvl.quantity_on_hand if lvl else Decimal('0')) or Decimal('0')
                if em_casa < line.quantity_received:
                    return Response({'detail':
                        f'Não é possível anular: de {line.item.name} receberam-se '
                        f'{line.quantity_received} mas só restam {em_casa} em '
                        f'{grn.delivery_warehouse.name}. A mercadoria já foi consumida ou '
                        f'vendida — registe uma devolução ou um ajuste de inventário.'},
                        status=status.HTTP_409_CONFLICT)

            # (2) já se pagou ao fornecedor por esta entrega?
            divida = _divida_da_recepcao(grn)
            if divida is not None and divida.paid_amount > 0:
                return Response({'detail':
                    f'Não é possível anular: a fatura {divida.number} desta receção já tem '
                    f'{divida.paid_amount} pagos ao fornecedor. Anule primeiro o pagamento.'},
                    status=status.HTTP_409_CONFLICT)

            with transaction.atomic():
                for line in grn.lines.select_related('item').all():
                    _repor_custo_medio_antes_da_entrada(line.item, line.quantity_received,
                                                        line.unit_cost)
                    stock_engine.move_out(
                        grn.delivery_warehouse, line.item, line.quantity_received,
                        reference=grn.receipt_number,
                        note=f'Estorno da receção {grn.receipt_number} (anulada)',
                        by=(request.user.username if request.user.is_authenticated else None),
                        mtype='OUT',
                        # ANULAR UMA ENTRADA TIRA O LOTE QUE ELA CRIOU, não "o mais
                        # antigo". Sem isto, o estorno saía por FEFO: devolvia-se ao
                        # fornecedor a mercadoria errada no papel — o lote da guia
                        # anulada ficava em armazém com a sua validade, e o lote que
                        # estava mesmo a expirar desaparecia das contagens sem
                        # ninguém o ter consumido.
                        lote=(line.lot_number or grn.receipt_number))
                if divida is not None:
                    divida.status = 'CANCELLED'
                    divida.save(update_fields=['status'])
                grn.status = 'Canceled'
                grn.save()
                _fechar_ou_atualizar_encomenda(grn.purchase_order)
        else:
            grn.status = 'Canceled'
            grn.save()

        return Response(self.get_serializer(grn).data)


class GoodsReceiptLineViewSet(viewsets.ModelViewSet):
    serializer_class = GoodsReceiptLineSerializer

    def get_queryset(self):
        qs = GoodsReceiptLine.objects.select_related('item', 'uom').all()
        grn = self.request.query_params.get('goods_receipt')
        return qs.filter(goods_receipt_id=grn) if grn else qs
