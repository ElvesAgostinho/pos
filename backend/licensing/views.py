from django.conf import settings
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from core.modules import optional_app_labels, all_modules, FEATURES, resolve_active_features


def _real_license():
    """
    Licença REAL da instalação — fonte de verdade: o PCC (clm.License), gerido no admin do
    Django. Fallback: license.key assinada (artefacto offline exportado pelo PCC para on-premises).
    """
    # 1) PCC — clm.License (registo no admin/BD do cliente)
    try:
        from clm.models import License
        from django.utils import timezone
        lic = License.objects.select_related('client').order_by('-created_at').first()
        if lic:
            valid = (lic.valid_until is None) or (lic.valid_until >= timezone.localdate())
            # feature_flags é um dict {key: bool}. Se tiver conteúdo, restringe (allowed = keys True).
            ff = lic.feature_flags or {}
            features = [k for k, v in ff.items() if v] if ff else None
            return {
                'licensed': bool(valid),
                'client': getattr(lic.client, 'commercial_name', None),
                'license_number': lic.license_number,
                'valid_until': str(lic.valid_until) if lic.valid_until else None,
                'modules': lic.modules or [],
                'features': features,   # None = licença não restringe funcionalidades
                'limits': {'hotels': lic.max_hotels, 'pos': lic.max_pos, 'users': lic.max_users, 'rooms': lic.max_rooms},
                'source': 'clm',
            }
    except Exception:
        pass
    # 2) Fallback offline — license.key assinada
    try:
        from .offline_validator import get_license
        f = get_license(settings.BASE_DIR)
        if f:
            return {
                'licensed': True, 'client': f.get('client_code'), 'license_number': f.get('license_number'),
                'valid_until': f.get('valid_until'), 'modules': f.get('modules', []),
                'limits': f.get('limits', {}), 'source': 'license.key',
            }
    except Exception:
        pass
    return {'licensed': False, 'modules': [], 'source': None}


def _aplicar_dados_empresa(company):
    """Preenche a ficha da Empresa a partir do que o PCC já sabe deste cliente.

    Sem Hotel nenhum ainda (instalação mesmo a estrear): cria a hierarquia toda
    (Grupo → Empresa → Hotel) já com os dados do PCC — o dono abre Configuração
    POS → Empresa pela primeira vez e já está preenchido. Com um Hotel já a
    existir: só escreve nos campos que ainda estão VAZIOS — nunca substitui o
    que o dono já tenha escrito à mão. Devolve True se mudou alguma coisa.
    """
    nome = (company or {}).get('name')
    if not nome:
        return False
    from identity.models import EnterpriseGroup, Company as Empresa, Hotel

    hotel = Hotel.objects.filter(is_master=True).first() or Hotel.objects.order_by('id').first()
    criado = hotel is None
    if criado:
        grupo, _ = EnterpriseGroup.objects.get_or_create(name=nome[:255])
        empresa, _ = Empresa.objects.get_or_create(
            group=grupo, name=nome[:255], defaults={'tax_id': (company.get('nif') or '')[:50]})
        hotel = Hotel(company=empresa, name=nome[:255], is_master=True)

    campos = {
        'name2': company.get('name2'), 'nif': company.get('nif'), 'address': company.get('address'),
        'city': company.get('city'), 'province': company.get('province'), 'country': company.get('country'),
        'postal_code': company.get('postal_code'), 'phone': company.get('phone'),
        'email': company.get('email'), 'website': company.get('website'),
        'currency': company.get('currency'), 'timezone': company.get('timezone'),
    }
    mudou = False
    for campo, valor in campos.items():
        if valor and not getattr(hotel, campo, None):
            setattr(hotel, campo, valor)
            mudou = True
    if criado or mudou:
        hotel.save()
        return True
    return False


class LicenseSyncView(APIView):
    """SINCRONIZAR COM O PCC — o botão do Gestor de licenças.

    O cliente apresenta a licença que TEM ao PCC (HTTPS); o PCC devolve a mais
    recente desse cliente. ANTES de gravar, valida-se localmente a assinatura e
    que o client_code é o mesmo — o PCC podia estar comprometido, o ficheiro no
    disco não fica à mercê dele. A antiga fica em license.key.bak.

    Sem internet, nada muda: o sistema continua com a licença que tem (offline
    é o desenho, não a falha).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        import os, json, base64, shutil, socket
        import requests as http
        from django.conf import settings
        from licensing.engine.crypto import verify_license

        pcc = os.environ.get('PCC_URL', getattr(settings, 'PCC_URL', 'http://127.0.0.1:8000'))
        caminho = os.path.join(settings.BASE_DIR, 'license.key')
        atual_raw = open(caminho).read().strip() if os.path.exists(caminho) else ''
        if not atual_raw:
            return Response({'detail': 'Não há licença instalada — a primeira instala-se '
                                       'com o ficheiro do PCC, não por sincronização.'}, status=400)
        try:
            hostname = socket.gethostname()
        except Exception:
            hostname = ''
        try:
            r = http.post(f'{pcc.rstrip("/")}/api/clm/licenses/latest/',
                          json={'license_key': atual_raw, 'hostname': hostname}, timeout=20)
        except Exception as e:
            return Response({'detail': f'Sem ligação ao PCC ({pcc}): {e}'}, status=502)
        if r.status_code != 200:
            try:
                return Response(r.json(), status=r.status_code)
            except Exception:
                return Response({'detail': f'PCC respondeu {r.status_code}.'}, status=502)

        nova_raw = (r.json().get('license_key') or '').strip()
        try:
            nova = json.loads(base64.b64decode(nova_raw).decode('utf-8'))
            sig = nova.pop('signature', None)
            if not (sig and verify_license(nova, sig)):
                return Response({'detail': 'O PCC devolveu uma licença com assinatura '
                                           'inválida — nada foi alterado.'}, status=502)
            antiga = json.loads(base64.b64decode(atual_raw).decode('utf-8'))
            if nova.get('client_code') != antiga.get('client_code'):
                return Response({'detail': 'A licença devolvida é de OUTRO cliente — '
                                           'nada foi alterado.'}, status=502)
        except Exception:
            return Response({'detail': 'Licença devolvida ilegível — nada foi alterado.'}, status=502)

        mudou_modulos = set(nova.get('modules') or []) != set(antiga.get('modules') or [])
        shutil.copyfile(caminho, caminho + '.bak')
        with open(caminho, 'w') as f:
            f.write(nova_raw)

        # VERSÃO — o PCC diz "a mais recente é a X" na MESMA resposta da licença.
        # Só se guarda; quem decide descarregar é o dono, no Diagnóstico.
        release = r.json().get('release') or {}
        if release.get('version'):
            from django.utils import timezone as _tz
            from .models import SupportSetting
            ss = SupportSetting.get()
            ss.latest_version = release.get('version')
            ss.latest_download_url = release.get('download_url') or ''
            ss.latest_release_notes = release.get('notes') or ''
            ss.version_checked_at = _tz.now()
            ss.save(update_fields=['latest_version', 'latest_download_url',
                                   'latest_release_notes', 'version_checked_at'])

        # CERTIFICAÇÃO AGT AUTOMÁTICA: se o PCC mandou credenciais e o nº de
        # certificado é DIFERENTE do instalado, aplica-as (chaves de assinatura +
        # número nas faturas). Igual = não se mexe — trocar a chave sem motivo
        # partia a verificação dos documentos antigos.
        agt = r.json().get('agt') or {}
        agt_aplicada = False
        if agt.get('certificate_number'):
            try:
                from fiscal.models import FiscalConfig
                from fiscal.certification import apply_certification
                if FiscalConfig.get().certificate_number != agt['certificate_number']:
                    apply_certification(cert=agt['certificate_number'],
                                        private_key=agt.get('private_key'),
                                        public_key=agt.get('public_key'))
                    agt_aplicada = True
            except Exception as e:
                return Response({'detail': f'Licença gravada, mas a certificação AGT falhou: {e}'},
                                status=502)

        # A LIGAÇÃO da fatura eletrónica (endpoints + credenciais do contribuinte)
        # também vem do PCC: escreve-se no AGTConnection do motor fiscal e o
        # agt_worker sai do modo simulação sozinho. O cliente nunca digita URLs.
        conexao_aplicada = False
        if agt.get('connection'):
            try:
                from fiscal.models import AGTConnection
                con = agt['connection']
                obj, _ = AGTConnection.objects.get_or_create(name='AGT')
                for campo in ('url_auth', 'url_submit', 'url_query', 'url_cancel',
                              'url_download', 'url_saft', 'url_health',
                              'client_id', 'environment'):
                    if con.get(campo) is not None:
                        setattr(obj, campo, con[campo])
                # o segredo guarda-se ENCRIPTADO (fiscal.secrets) — nunca em claro
                if con.get('client_secret'):
                    from fiscal.secrets import encrypt
                    obj.client_secret_enc = encrypt(con['client_secret'])
                obj.is_active = True
                obj.save()
                conexao_aplicada = True
            except Exception as e:
                return Response({'detail': f'Licença gravada, mas a ligação AGT falhou: {e}'},
                                status=502)

        # DADOS DA EMPRESA — o PCC já sabe nome/NIF/morada/telefone (foram escritos
        # ao criar o cliente, "Novo Provisionamento"); em vez do dono ter de os
        # escrever outra vez em Configuração POS → Empresa, aplicam-se sozinhos AQUI,
        # na mesma sincronização. Sem logo (esse continua upload local, de propósito —
        # nunca uma imagem por URL, mesmo princípio já seguido no resto do sistema).
        # Falha nisto nunca deve travar a sincronização — é conveniência, não segurança.
        empresa_aplicada = False
        try:
            empresa_aplicada = _aplicar_dados_empresa(r.json().get('company') or {})
        except Exception:
            pass

        return Response({
            'agt_applied': agt_aplicada,
            'agt_connection_applied': conexao_aplicada,
            'company_applied': empresa_aplicada,
            'detail': 'Licença sincronizada com o PCC.',
            'license_number': nova.get('license_number'),
            'valid_until': nova.get('valid_until'),
            'limits': nova.get('limits'),
            'modules': len(nova.get('modules') or []),
            # módulos novos só entram quando o serviço reinicia (INSTALLED_APPS)
            'restart_needed': mudou_modulos,
            'latest_version': release.get('version'),
        })


class OwnerPasswordResetView(APIView):
    """"ESQUECI-ME DA PASSWORD" — repõe a password do dono numa instalação JÁ A
    CORRER, sem PowerShell nem ida à máquina. O dono pede ao fornecedor um
    código (PCC → Gestão de Clientes → Acessos → "Gerar código de reposição"),
    recebe-o por telefone/WhatsApp, e usa-o aqui.

    O PCC nunca escreve na base de dados DESTE cliente (é impossível, são bases
    separadas) — só confirma "sim, este código é válido para esta licença".
    Quem escreve a password nova é este servidor, na sua própria base, mesma
    lógica do `core.management.commands.criar_dono`.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        import os
        import requests as http
        from django.conf import settings
        from django.contrib.auth import get_user_model

        codigo = (request.data.get('code') or '').strip()
        nova_password = request.data.get('new_password') or ''
        if not codigo:
            return Response({'detail': 'Indique o código recebido do fornecedor.'}, status=400)
        if len(nova_password) < 8:
            return Response({'detail': 'A nova password tem de ter pelo menos 8 caracteres.'}, status=400)

        caminho = os.path.join(settings.BASE_DIR, 'license.key')
        if not os.path.exists(caminho):
            return Response({'detail': 'Sem licença instalada nesta máquina — sem ela, '
                                       'não há forma de confirmar a que cliente pertence.'}, status=400)
        license_key = open(caminho, 'r', encoding='utf-8').read().strip()

        pcc = os.environ.get('PCC_URL', getattr(settings, 'PCC_URL', ''))
        if not pcc:
            return Response({'detail': 'PCC_URL não configurado nesta instalação.'}, status=500)
        try:
            r = http.post(f'{pcc.rstrip("/")}/api/clm/licenses/verify-reset-code/',
                          json={'license_key': license_key, 'code': codigo}, timeout=15)
        except Exception as e:
            return Response({'detail': f'Sem ligação ao PCC ({pcc}): {e}'}, status=502)

        body = r.json() if r.headers.get('content-type', '').startswith('application/json') else {}
        if r.status_code != 200 or not body.get('valid'):
            return Response({'detail': body.get('detail') or 'Código inválido ou expirado.'},
                            status=r.status_code if r.status_code != 200 else 403)

        username = body.get('username') or 'dono'
        User = get_user_model()
        user, _ = User.objects.get_or_create(
            username=username, defaults={'is_staff': True, 'is_superuser': True, 'is_active': True})
        user.set_password(nova_password)
        user.is_active = True
        user.save(update_fields=['password', 'is_active'])
        return Response({'detail': f'Password de "{username}" reposta — entre já com a nova.'})


class ApplyUpdateView(APIView):
    """Aplica a atualização — um clique, sem senha nem assistente outra vez.

    Não faz nada aqui dentro: lança atualizar.py como processo DESTACADO (sobrevive
    ao próprio serviço do Django ser morto, que é exatamente o que a atualização
    faz a seguir) e devolve logo. O ecrã volta a perguntar o estado até o serviço
    responder outra vez, na versão nova.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        import subprocess
        import sys
        from .models import SupportSetting
        if not request.user.is_staff:
            return Response({'detail': 'Só o dono/administrador pode aplicar atualizações.'}, status=403)
        ss = SupportSetting.get()
        url = ss.latest_download_url
        if not url or not url.lower().endswith('.zip'):
            return Response({'detail': 'Sem pacote de atualização "um clique" disponível — '
                                       'esta versão só tem instalador completo (.exe), tem de '
                                       'ser corrido à mão.'}, status=400)
        script = settings.BASE_DIR / 'atualizar.py'
        python = sys.executable
        kwargs = {}
        if sys.platform == 'win32':
            kwargs['creationflags'] = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
        subprocess.Popen([python, str(script), '--url', url], cwd=str(settings.BASE_DIR),
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         close_fds=True, **kwargs)
        return Response({'detail': 'Atualização iniciada — o serviço vai parar e reiniciar em '
                                   'breve. Não feche esta janela nem desligue o computador.'})


class LicenseStatusView(APIView):
    """Estado da licença real (on-premises). Sem licença válida = sem acesso à plataforma."""
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(_real_license())


class LicensePreflightView(APIView):
    """DIAGNÓSTICO DA ATIVAÇÃO — sem precisar de login (não HÁ login possível sem
    licença) nem de copiar scripts para a máquina do cliente: abre-se esta URL no
    browser e vê-se a causa exata (ficheiro em falta, mal colocado, corrompido,
    assinatura inválida, expirada) em vez do genérico "sem licença encontrada".

    Nasceu de um caso real: técnico jurava ter posto o license.key no sítio certo,
    o ecrã continuava preso, e não havia forma de saber PORQUÊ sem alguém ir lá
    correr um script PowerShell à mão. Nunca devolve o conteúdo do ficheiro nem a
    assinatura — só factos de diagnóstico, seguros de colar numa mensagem de suporte.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        import os
        import json
        import base64
        from datetime import datetime, date

        path = os.path.join(settings.BASE_DIR, 'license.key')
        info = {'checked_path': str(path), 'exists': os.path.exists(path)}

        if not info['exists']:
            info['diagnosis'] = 'FICHEIRO_AUSENTE'
            info['detail'] = (f'Não há nenhum ficheiro em "{path}". Confirme se é mesmo '
                              'este o caminho da instalação — se o setup.exe não usou a '
                              'pasta por omissão, o caminho é outro.')
            return Response(info)

        try:
            st = os.stat(path)
            info['size_bytes'] = st.st_size
            info['modified_at'] = datetime.fromtimestamp(st.st_mtime).isoformat()
        except Exception:
            pass

        try:
            raw = open(path, 'r', encoding='utf-8').read().strip()
        except Exception as e:
            info['diagnosis'] = 'FICHEIRO_ILEGIVEL'
            info['detail'] = f'Não foi possível ler o ficheiro como texto: {str(e)[:200]}'
            return Response(info)

        try:
            data = json.loads(base64.b64decode(raw).decode('utf-8'))
        except Exception:
            info['diagnosis'] = 'CONTEUDO_CORROMPIDO'
            info['detail'] = ('O ficheiro não decodifica como license.key válido. Foi '
                              'provavelmente alterado no transporte (email/editor de texto '
                              'que "corrige" quebras de linha ou codificação) — peça o '
                              'ficheiro outra vez ao PCC e copie-o sem o abrir em nada.')
            return Response(info)

        sig = data.pop('signature', None)
        info['client_code'] = data.get('client_code')
        info['license_number'] = data.get('license_number')
        info['valid_until'] = data.get('valid_until')

        if not sig:
            info['diagnosis'] = 'SEM_ASSINATURA'
            info['detail'] = 'O ficheiro não tem assinatura — não foi gerado pelo PCC.'
            return Response(info)

        try:
            from .engine.crypto import verify_license
            ok = verify_license(data, sig)
        except Exception as e:
            info['diagnosis'] = 'ERRO_VERIFICACAO'
            info['detail'] = str(e)[:200]
            return Response(info)

        if not ok:
            info['diagnosis'] = 'ASSINATURA_INVALIDA'
            info['detail'] = ('A assinatura não bate com a chave pública desta instalação. '
                              'O ficheiro foi corrompido no transporte, ou pertence a outro '
                              'cliente/instalação — peça-o de novo ao PCC.')
            return Response(info)

        if info['valid_until']:
            try:
                if date.fromisoformat(info['valid_until']) < date.today():
                    info['diagnosis'] = 'EXPIRADA'
                    info['detail'] = f'Licença válida até {info["valid_until"]} — já passou.'
                    return Response(info)
            except Exception:
                pass

        info['diagnosis'] = 'OK'
        info['detail'] = ('O ficheiro é válido. Se o ecrã continua preso, recarregue a '
                          'página (Ctrl+F5) — se persistir, reinicie o serviço "Mwana '
                          'Lodge — Servidor".')
        return Response(info)


class LicenseLimitsView(APIView):
    """Consumo vs licenciado: propriedades, terminais e utilizadores.

    O sistema vende-se POR PROPRIEDADE — este ecrã mostra ao cliente quantas tem e
    quantas pode ter. Criar acima do limite é recusado pelo servidor.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from .limits import status
        return Response(status())


def _active_modules():
    installed = set(settings.INSTALLED_APPS)
    active = [c for c in optional_app_labels() if c in installed]
    # 'fiscal' é núcleo (sempre instalado) mas as suas features contam como módulo ativo.
    if 'fiscal' in installed:
        active.append('fiscal')
    return active


class ActiveModulesView(APIView):
    """Módulos opcionais efetivamente carregados. O frontend mostra apenas estes."""
    permission_classes = [AllowAny]

    def get(self, request):
        info = _real_license()
        return Response({
            'active': _active_modules(),
            'licensed': info['licensed'],
            'license_modules': info.get('modules', []),
            'core': ['core', 'mdm', 'identity', 'eae', 'licensing'],
            'catalog': all_modules(),
        })


class FeaturesView(APIView):
    """Funcionalidades (feature flags) — licenciamento dentro do módulo.
    GET: catálogo (dos módulos ativos) + lista de ativas. POST {key, enabled}: override do admin."""
    permission_classes = [AllowAny]

    def _overrides(self):
        try:
            from .models import FeatureFlag
            return {f.key: f.enabled for f in FeatureFlag.objects.all()}
        except Exception:
            return {}

    def get(self, request):
        info = _real_license()
        active_modules = _active_modules()
        lic_features = info.get('features')  # None se a licença não restringir
        overrides = self._overrides()
        active = resolve_active_features(active_modules, lic_features, overrides)
        catalog = [f for f in FEATURES if f['module'] in active_modules or f['module'] == 'ops']
        for f in catalog:
            f = f  # noqa
        return Response({
            'catalog': [{**f, 'active': f['key'] in active} for f in catalog],
            'active': active,
        })

    def post(self, request):
        from .models import FeatureFlag
        key = request.data.get('key')
        enabled = bool(request.data.get('enabled'))
        if not key:
            return Response({'detail': 'key obrigatório.'}, status=400)
        FeatureFlag.objects.update_or_create(key=key, defaults={'enabled': enabled})
        return self.get(request)
