"""
Chatbot — assistente de reservas por WhatsApp.

`ChatbotSettingsViewSet` é configuração pura (nº de telefone, credenciais da
Meta Business API, mensagem de boas-vindas). Nada neste ficheiro liga a uma
conta WhatsApp real — a Meta só dá acesso à Cloud API a contas Business
verificadas, o mesmo tipo de passo comercial que falta ao Channel Manager
(ver `channel_manager.py`). O `access_token` fica guardado como está, pronto
para o dia em que essa credenciação existir.

`ChatbotSimulateView` é o "Simular Conversa": nunca envia uma mensagem
WhatsApp a sério, mas responde com DADOS REAIS — chama a mesma disponibilidade
do Booking Engine (`booking_engine._room_type_free_count/_room_type_price`)
para um período fixo próximo, para o dono ver o assistente a "raciocinar"
sobre o inventário verdadeiro, não um texto decorativo.
"""
import re
from datetime import date, timedelta

from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from core.tenancy import HotelScopedMixin, default_hotel_id
from .models import ChatbotSettings, RoomType
from .serializers import ChatbotSettingsSerializer
from .views import HotelDefaultMixin
from .booking_engine import _room_type_free_count, _room_type_price

GREETINGS = ('ola', 'olá', 'oi', 'bom dia', 'boa tarde', 'boa noite', 'hello', 'hi', 'hey')
AVAILABILITY_WORDS = ('disponibilidade', 'quarto', 'quartos', 'reserva', 'reservar', 'vaga',
                      'livre', 'preco', 'preço', 'precos', 'preços', 'custa', 'quanto', 'tarifa')

# As saudações procuram-se por PALAVRA INTEIRA, não por pedaço de texto. Com
# `'oi' in mensagem` — como estava — "Quanto custa uma n-oi-te?" e "qualquer
# c-oi-sa" eram tratadas como um "oi": o robô respondia com a mensagem de
# boas-vindas em vez de ir ver a disponibilidade, e o cliente que fez uma
# pergunta a sério recebia um cumprimento. ('hi' em "hotel"? não — mas 'oi' em
# "noite"/"coisa"/"dois"/"oito" sim, e "noite" é exactamente o vocabulário de
# quem pergunta preços.) Expressões de mais de uma palavra ("bom dia") passam
# por aqui tal como são.
_GREET_RE = re.compile(r'(?<![\w])(' + '|'.join(re.escape(g) for g in GREETINGS) + r')(?![\w])',
                       re.IGNORECASE)


def _is_greeting(texto: str) -> bool:
    return bool(_GREET_RE.search(texto))


class ChatbotSettingsViewSet(HotelScopedMixin, HotelDefaultMixin, viewsets.ModelViewSet):
    """Configuração + ligação da conta de WhatsApp do hotel.

    Duas formas de ligar, e as duas são tratadas aqui:

    · API OFICIAL (Meta Cloud API) — o caminho homologado. Não há nada a
      "ligar": a conta vale quando a Meta a aprova e o token é colado na
      configuração. Marcar como ligado é dizer que essas credenciais existem.
    · API NÃO OFICIAL (ponte WhatsApp Web) — liga o número que o hotel já usa,
      lendo um QR Code ou introduzindo um código de 8 letras no telemóvel. Quem
      mantém a sessão é um serviço à parte (ver `whatsapp_bridge.py`); este
      viewset é só quem lhe pergunta e guarda a resposta.

    O estado "ligado" nunca é inventado deste lado — vem sempre da ponte.
    """
    queryset = ChatbotSettings.objects.select_related('hotel').all()
    serializer_class = ChatbotSettingsSerializer

    def _guardar_sessao(self, cfg, resposta):
        """Escreve na configuração o que a ponte disse — e só o que ela disse."""
        estado = (resposta.get('status') or 'PAIRING').upper()
        cfg.session_status = estado if estado in dict(ChatbotSettings.SESSION) else 'ERROR'
        cfg.qr_payload = resposta.get('qr') or None
        cfg.pairing_code = resposta.get('pairing_code') or None
        cfg.session_message = (resposta.get('message') or '')[:500] or None
        if cfg.session_status == 'CONNECTED':
            cfg.connected_number = resposta.get('number') or cfg.whatsapp_phone_number
            cfg.connected_at = timezone.now()
            cfg.qr_payload = cfg.pairing_code = None
            cfg.pairing_expires_at = None
        elif cfg.session_status == 'PAIRING':
            # O QR do WhatsApp Web caduca ao fim de ~1 minuto; o ecrã volta a
            # pedir um novo em vez de deixar o dono a apontar a câmara a um
            # código morto.
            cfg.pairing_expires_at = timezone.now() + timedelta(seconds=60)
        cfg.save()

    @action(detail=True, methods=['post'])
    def connect(self, request, pk=None):
        cfg = self.get_object()

        if (cfg.connection_mode or 'OFFICIAL') == 'OFFICIAL':
            em_falta = [nome for nome, valor in (
                ('Nº WhatsApp Business', cfg.whatsapp_phone_number),
                ('WhatsApp Business Account ID', cfg.whatsapp_business_account_id),
                ('Access Token (Meta)', cfg.access_token)) if not (valor or '').strip()]
            if em_falta:
                return Response({'detail': 'Faltam as credenciais da Meta: '
                                           + ', '.join(em_falta) + '.'}, status=400)
            cfg.session_status = 'CONNECTED'
            cfg.connected_number = cfg.whatsapp_phone_number
            cfg.connected_at = timezone.now()
            cfg.session_message = ('Credenciais da Meta guardadas. O envio real depende da '
                                   'aprovação da sua conta Business pela Meta.')
            cfg.save()
            return Response(self.get_serializer(cfg).data)

        from .whatsapp_bridge import start, PonteIndisponivel
        try:
            resposta = start(cfg)
        except PonteIndisponivel as e:
            cfg.session_status, cfg.session_message = 'ERROR', str(e)[:500]
            cfg.save(update_fields=['session_status', 'session_message'])
            return Response({'detail': str(e)}, status=502)
        self._guardar_sessao(cfg, resposta)
        return Response(self.get_serializer(cfg).data)

    @action(detail=True, methods=['get'])
    def session(self, request, pk=None):
        """Estado da sessão — o ecrã chama isto enquanto espera pelo emparelhamento."""
        cfg = self.get_object()
        if (cfg.connection_mode or 'OFFICIAL') == 'OFFICIAL':
            return Response(self.get_serializer(cfg).data)
        from .whatsapp_bridge import status, PonteIndisponivel
        try:
            self._guardar_sessao(cfg, status(cfg))
        except PonteIndisponivel as e:
            cfg.session_status, cfg.session_message = 'ERROR', str(e)[:500]
            cfg.save(update_fields=['session_status', 'session_message'])
        return Response(self.get_serializer(cfg).data)

    @action(detail=True, methods=['post'])
    def disconnect(self, request, pk=None):
        cfg = self.get_object()
        erro = None
        if (cfg.connection_mode or 'OFFICIAL') == 'BRIDGE' and (cfg.bridge_url or '').strip():
            from .whatsapp_bridge import logout, PonteIndisponivel
            try:
                logout(cfg)
            except PonteIndisponivel as e:
                erro = str(e)
        cfg.session_status = 'DISCONNECTED'
        cfg.qr_payload = cfg.pairing_code = cfg.connected_number = None
        cfg.pairing_expires_at = cfg.connected_at = None
        cfg.session_message = erro or 'Sessão terminada.'
        cfg.save()
        return Response(self.get_serializer(cfg).data)

    @action(detail=True, methods=['post'], url_path='send-test')
    def send_test(self, request, pk=None):
        """Mandar uma mensagem a sério, para o dono confirmar que ficou a funcionar."""
        cfg = self.get_object()
        destino = (request.data.get('to') or '').strip()
        if not destino:
            return Response({'detail': 'Indique o número de destino.'}, status=400)
        if cfg.session_status != 'CONNECTED':
            return Response({'detail': 'A conta de WhatsApp não está ligada.'}, status=409)
        texto = (request.data.get('text') or '').strip() or (
            f'Mensagem de teste do {cfg.hotel.name}. Se recebeu isto, o assistente está a funcionar.')

        if (cfg.connection_mode or 'OFFICIAL') == 'OFFICIAL':
            return Response({'detail': 'O envio pela Meta Cloud API precisa da conta Business '
                                       'aprovada e do número homologado — esse passo é comercial, '
                                       'com a Meta, e ainda não está concluído nesta instalação. '
                                       'Para enviar já, use a ligação por QR Code (API não '
                                       'oficial).'}, status=501)

        from .whatsapp_bridge import send, PonteIndisponivel
        try:
            r = send(cfg, destino, texto)
        except PonteIndisponivel as e:
            return Response({'detail': str(e)}, status=502)
        return Response({'detail': f'Mensagem enviada para {destino}.', 'id': r.get('id')})


class ChatbotSimulateView(APIView):
    """POST pms/chatbot/simulate/ {message} — ecrã autenticado (é o dono a
    testar o robô), por isso usa o hotel ativo da sessão como o WhatsApp
    real usaria o hotel dono do número."""

    def post(self, request):
        message = (request.data.get('message') or '').strip()
        if not message:
            return Response({'detail': 'Mensagem vazia.'}, status=400)
        low = message.lower()

        hid = default_hotel_id(request)
        settings_obj = ChatbotSettings.objects.filter(hotel_id=hid).first() if hid else None
        welcome = settings_obj.welcome_message if settings_obj else ChatbotSettings._meta.get_field('welcome_message').default

        # A PERGUNTA vem antes do cumprimento. "Boa noite, tem quartos livres?"
        # traz as duas coisas; se o cumprimento ganhar, o cliente recebe a
        # mensagem de boas-vindas e a pergunta dele fica sem resposta. Só se
        # responde com o "olá" quando não há mais nada na mensagem.
        pergunta_disponibilidade = any(w in low for w in AVAILABILITY_WORDS)

        if _is_greeting(low) and not pergunta_disponibilidade:
            return Response({'reply': welcome, 'intent': 'greeting'})

        if pergunta_disponibilidade:
            if not hid:
                return Response({'reply': 'Ainda não consigo verificar a disponibilidade (hotel não identificado).', 'intent': 'availability'})
            check_in = date.today() + timedelta(days=7)
            check_out = check_in + timedelta(days=2)
            nights = (check_out - check_in).days
            lines = []
            for rt in RoomType.objects.filter(hotel_id=hid, is_active=True):
                available = _room_type_free_count(rt, check_in, check_out)
                if available <= 0:
                    continue
                price, board, _plan = _room_type_price(rt, check_in, check_out)
                lines.append(f"• {rt.name}: {available} disponível(is) · {price} / noite "
                              f"({board}) · total {price * nights} para {nights} noites")
            if lines:
                reply = (f"Para {check_in.isoformat()} → {check_out.isoformat()} temos:\n" + "\n".join(lines)
                          + "\n\nQuer que eu faça a reserva? Preciso do seu nome, email e telefone.")
            else:
                reply = f"Para {check_in.isoformat()} → {check_out.isoformat()} não há disponibilidade neste momento."
            return Response({'reply': reply, 'intent': 'availability', 'check_in': check_in.isoformat(), 'check_out': check_out.isoformat()})

        return Response({'reply': 'Desculpe, não percebi. Pergunte sobre "disponibilidade" ou "quartos" para eu '
                                    'consultar o inventário real, ou contacte a receção. (Nota: este é o simulador — '
                                    'o envio real por WhatsApp precisa das credenciais da Meta Business API na aba '
                                    'Configuração.)', 'intent': 'fallback'})
