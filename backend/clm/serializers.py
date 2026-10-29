from rest_framework import serializers
from .models import (Client, Contact, CommercialData, License, Installation, Equipment,
                     AuditLogCLM, TerminalLicense, SystemRelease, ErrorReport)

class ContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contact
        fields = '__all__'

class CommercialDataSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommercialData
        fields = '__all__'

class LicenseSerializer(serializers.ModelSerializer):
    # Os campos _enc são a senha CIFRADA — nunca saem pela API, nem cifrados (é
    # material criptográfico sem uso nenhum do lado de fora). Só se expõe SE está
    # definida e QUANDO — nunca a senha em si.
    has_install_password = serializers.SerializerMethodField()
    has_owner_password = serializers.SerializerMethodField()

    class Meta:
        model = License
        # agt_private_key: a chave de assinatura do FORNECEDOR — quem a precisa (o
        # próprio ecrã de Certificação AGT) já a lê por um endpoint dedicado
        # (AgtLicenseCredentialsView); não faz sentido ir também no JSON genérico
        # de qualquer listagem de clientes/licenças.
        exclude = ('install_password_enc', 'owner_password_enc', 'agt_private_key')

    def get_has_install_password(self, o):
        return bool(o.install_password_enc)

    def get_has_owner_password(self, o):
        return bool(o.owner_password_enc)

class InstallationSerializer(serializers.ModelSerializer):
    # "Online" é um cálculo, não um estado gravado — nunca fica desatualizado
    # (ninguém tem de correr uma tarefa a apagar isto quando o cliente cai).
    is_online = serializers.SerializerMethodField()

    class Meta:
        model = Installation
        fields = '__all__'

    def get_is_online(self, o):
        if not o.last_ping:
            return False
        from django.utils import timezone
        from datetime import timedelta
        return timezone.now() - o.last_ping < timedelta(hours=6)

class ClientSerializer(serializers.ModelSerializer):
    contacts = ContactSerializer(many=True, read_only=True)
    commercial_data = CommercialDataSerializer(read_only=True)
    licenses = LicenseSerializer(many=True, read_only=True)
    installations = InstallationSerializer(many=True, read_only=True)

    class Meta:
        model = Client
        fields = '__all__'

class AuditLogCLMSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLogCLM
        fields = '__all__'

class ProvisioningRequestSerializer(serializers.Serializer):
    client_data = serializers.DictField()
    commercial_data = serializers.DictField()
    modules = serializers.ListField(child=serializers.CharField())
    feature_flags = serializers.DictField(required=False)
    limits = serializers.DictField(required=False)
    # O NOME DA CONTA DO DONO DO CLIENTE.
    #
    # Faltava, e o DRF descarta tudo o que um serializer não declara: o Wizard
    # enviava o nome que o fornecedor escreveu, a vista fazia
    # `validated_data.get('owner_username')` — e recebia None, porque o campo
    # tinha sido atirado fora pelo caminho. Caía no `or 'dono'`, e a conta do
    # cliente chamava-se SEMPRE "dono", escrevesse-se lá o que se escrevesse.
    #
    # O ecrã de alterar a senha do dono não tinha este defeito porque lê de
    # `request.data` directamente (clm/views.py: set_owner_password) — era por
    # isso que o nome parecia funcionar num sítio e não no outro.
    owner_username = serializers.CharField(required=False, allow_blank=True,
                                           max_length=60)

class TerminalLicenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = TerminalLicense
        fields = '__all__'

class SystemReleaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemRelease
        fields = '__all__'
        read_only_fields = ('created_at',)

    def validate(self, attrs):
        """Ou se carrega o ficheiro, ou se cola um link — mas tem de haver um."""
        ficheiro = attrs.get('package') or getattr(self.instance, 'package', None)
        link = attrs.get('download_url') or getattr(self.instance, 'download_url', '')
        if not ficheiro and not link:
            raise serializers.ValidationError({
                'package': ['Carregue o ficheiro da versão (.zip da atualização ou .exe do '
                            'instalador), ou cole o link de onde ele já está alojado. Sem um '
                            'dos dois, o cliente não tem de onde descarregar.'],
            })
        versao = attrs.get('version') or getattr(self.instance, 'version', '')
        if ficheiro and versao:
            self._conferir_versao_do_pacote(ficheiro, versao)
        return attrs

    @staticmethod
    def _conferir_versao_do_pacote(ficheiro, versao_declarada):
        """O PACOTE É MESMO DESTA VERSÃO? — a conferência que evita uma armadilha.

        Os dois passos de publicar uma versão são subir o número em
        `core/support.py` e correr o build. Fazê-los por outra ordem é fácil —
        acontece a quem conhece bem o processo — e o resultado é um pacote que
        por dentro diz 1.0.0 publicado como sendo o 1.1.0.

        O que isso provoca não parece um erro, parece um fantasma: o cliente
        atualiza, o processo corre bem do princípio ao fim, e no fim o sistema
        dele continua a dizer que tem a 1.0.0 — por isso volta a ver a mesma
        atualização disponível. E outra vez. E outra. Ninguém relaciona isso com
        a ordem em que o pacote foi feito, semanas antes.

        Lê-se a versão de dentro do .zip (`app/core/support.py`, a mesma fonte
        única de onde o build a tirou) e compara-se. Um .exe não se abre assim e
        passa sem conferência, como passava antes — é o preço de o instalador
        completo ser um formato fechado.
        """
        import re
        import zipfile

        nome = (getattr(ficheiro, 'name', '') or '').lower()
        if not nome.endswith('.zip'):
            return
        try:
            ficheiro.seek(0)
            with zipfile.ZipFile(ficheiro) as zf:
                # AS BARRAS: o Compress-Archive do Windows PowerShell 5.1 escreve
                # "app\\core\\support.py" em vez de "app/core/support.py". O mesmo
                # script, corrido em duas máquinas, produz pacotes que por fora são
                # iguais e por dentro não — e procurar "app/" num desses não
                # encontrava nada. Recusava-se o pacote a dizer que lhe faltava o
                # que lá estava.
                nomes = [n.replace('\\', '/') for n in zf.namelist()]
                # O MESMO CONTRATO QUE O ATUALIZADOR EXIGE, e nem mais um grão.
                #
                # Isto exigia `core/support.py` lá dentro e recusava tudo o resto
                # — um controlo MAIS APERTADO do que o do próprio `atualizar.py`,
                # que só precisa de `app/` ou `webapp/`. O resultado foi rejeitar
                # pacotes que teriam funcionado, com uma mensagem a dizer que não
                # traziam o backend quando traziam. Uma verificação que recusa o
                # que o sistema aceitaria não protege nada: só tranca a porta.
                if not any(n.startswith('app/') or n.startswith('webapp/') for n in nomes):
                    amostra = ', '.join(nomes[:6]) or '(vazio)'
                    raise serializers.ValidationError({
                        'package': [
                            f'Este .zip não tem a forma de um pacote do sistema: lá dentro '
                            f'deviam estar as pastas "app/" e "webapp/", e o que está é: '
                            f'{amostra}. Se o compactou à mão, apanhou uma pasta a mais — '
                            f'use o ficheiro que o build_atualizacao.ps1 cria em '
                            f'instalador\\Output\\, tal como ele sai.'],
                    })
                alvo = next((n for n in zf.namelist()
                             if n.replace('\\', '/').endswith('core/support.py')), None)
                if not alvo:
                    # Tem a forma certa mas não traz o support.py (um pacote só do
                    # site, por exemplo). Não se inventa versão nenhuma: passa.
                    return
                texto = zf.read(alvo).decode('utf-8', errors='replace')
        except zipfile.BadZipFile:
            raise serializers.ValidationError({
                'package': ['O ficheiro não é um .zip válido (pode ter ficado a meio ao ser '
                            'copiado). Volte a correr o build_atualizacao.ps1.'],
            })
        finally:
            try:
                ficheiro.seek(0)
            except Exception:
                pass

        m = re.search(r"APP_VERSION\s*=\s*['\"]([\d.]+)['\"]", texto)
        if not m:
            return
        dentro = m.group(1)
        if dentro != str(versao_declarada).strip():
            raise serializers.ValidationError({
                'package': [
                    f'Está a publicar a versão {versao_declarada}, mas este pacote por dentro '
                    f'é a {dentro}. O cliente ia atualizar e continuar a dizer que tem a '
                    f'{dentro} — e via a mesma atualização disponível outra vez, sem fim. '
                    f'Suba APP_VERSION para {versao_declarada} em backend/core/support.py e '
                    f'volte a correr o build_atualizacao.ps1.'],
            })

    def _com_morada(self, instance):
        """O LINK, feito a partir do ficheiro carregado.

        Isto é o que faltava para o ecrã deixar de pedir uma coisa impossível:
        quem publica a versão carrega o ficheiro e o endereço nasce dele. Tem de
        ser ABSOLUTO (com o domínio do PCC), porque quem o vai abrir é a
        instalação do cliente, noutra máquina e noutra rede — um caminho
        relativo só funcionaria dentro do próprio PCC.
        """
        if instance.package and not instance.download_url:
            pedido = self.context.get('request')
            url = instance.package.url
            instance.download_url = pedido.build_absolute_uri(url) if pedido else url
            instance.save(update_fields=['download_url'])
        return instance

    def create(self, validated):
        return self._com_morada(super().create(validated))

    def update(self, instance, validated):
        return self._com_morada(super().update(instance, validated))

class ErrorReportSerializer(serializers.ModelSerializer):
    installation_name = serializers.CharField(source='installation.name', read_only=True)

    class Meta:
        model = ErrorReport
        fields = '__all__'
        read_only_fields = ('installation', 'client_code', 'level', 'logger_name', 'message',
                            'traceback', 'path', 'app_version', 'hostname', 'created_at')

