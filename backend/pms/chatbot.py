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

from rest_framework import viewsets
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
    queryset = ChatbotSettings.objects.select_related('hotel').all()
    serializer_class = ChatbotSettingsSerializer


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
