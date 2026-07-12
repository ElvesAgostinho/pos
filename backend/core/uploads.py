"""
UPLOAD DE FICHEIROS — logótipos, imagens de artigos, fotos de alergénios.

Guarda no disco do servidor do cliente (nunca numa nuvem terceira: os dados do hotel
não saem da casa dele) e devolve o URL para gravar na ficha.
"""
import os
import uuid

from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated

ALLOWED = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'}
MAX_BYTES = 2 * 1024 * 1024      # 2 MB


class UploadView(APIView):
    """POST /api/platform/upload/  (multipart: file, folder)"""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    def post(self, request):
        f = request.FILES.get('file')
        if not f:
            return Response({'detail': 'Escolha um ficheiro.'}, status=400)
        ext = os.path.splitext(f.name)[1].lower()
        if ext not in ALLOWED:
            return Response({'detail': f'Formato não aceite ({ext}). Use PNG, JPG, GIF, WEBP ou SVG.'}, status=400)
        if f.size > MAX_BYTES:
            return Response({'detail': f'A imagem tem {f.size // 1024} KB. O máximo são 2 MB — '
                                       f'uma imagem grande atrasa o terminal a cada arranque.'}, status=400)

        folder = (request.data.get('folder') or 'logos').strip('/')
        dest_dir = os.path.join(settings.MEDIA_ROOT, folder)
        os.makedirs(dest_dir, exist_ok=True)
        name = f'{uuid.uuid4().hex[:12]}{ext}'
        with open(os.path.join(dest_dir, name), 'wb') as out:
            for chunk in f.chunks():
                out.write(chunk)
        return Response({'url': f'{settings.MEDIA_URL}{folder}/{name}', 'size': f.size}, status=201)
