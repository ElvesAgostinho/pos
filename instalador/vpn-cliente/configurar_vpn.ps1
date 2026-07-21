# ============================================================================
# OPENVPN NO SERVIDOR DO CLIENTE — para o DONO DO HOTEL aceder ao seu próprio
# sistema remotamente (de casa, em viagem), com OpenVPN Connect no telemóvel
# ou portátil — a MESMA ferramenta que o fornecedor usa para o PCC, só que
# aqui o servidor VPN corre DENTRO da rede do próprio cliente.
#
# É um extra OPCIONAL — só se corre nos clientes que pedirem acesso remoto.
# Não faz parte do setup.exe principal; corre-se à parte, uma vez, no servidor
# onde o System Mwana Lodge já está instalado.
#
# USO (PowerShell como Administrador, no servidor do hotel):
#   .\configurar_vpn.ps1 -PublicHost meuhotel.duckdns.org
#
# Se o hotel não tiver um nome fixo (a maioria não tem IP público fixo), veja
# o LEIA-ME.md ao lado — recomenda o DuckDNS (grátis, 5 minutos a configurar).
#
# O QUE ESTE SCRIPT NÃO PODE FAZER (fica para o técnico, à mão, no router do
# hotel): reencaminhar a porta UDP (1194 por omissão) do router para o IP
# LOCAL deste servidor. Sem isso, ninguém de fora consegue ligar-se — o
# servidor OpenVPN fica a funcionar, mas surdo para o exterior.
# ============================================================================
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$PublicHost,                 # ex.: meuhotel.duckdns.org  ou  102.34.x.x
  [string]$LanSubnet = '192.168.1.0',   # a rede LOCAL do hotel — CONFIRME antes de correr
  [string]$LanMask = '255.255.255.0',
  [int]$Porta = 1194,
  [string]$ClienteNome = 'dono'
)
$ErrorActionPreference = 'Stop'

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) {
  throw 'Corra este script como Administrador (botão direito no PowerShell > Executar como Administrador).'
}

$OpenVpnDir = 'C:\Program Files\OpenVPN'
$OpenSsl = Join-Path $OpenVpnDir 'bin\openssl.exe'
$OpenVpnExe = Join-Path $OpenVpnDir 'bin\openvpn.exe'
$ConfigAuto = Join-Path $OpenVpnDir 'config-auto'
$Certs = 'C:\ProgramData\MwanaVPN\certs'
$SaidaCliente = 'C:\ProgramData\MwanaVPN\cliente'

Write-Host "== 1/6 OpenVPN (instalar se faltar) =="
if (-not (Test-Path $OpenVpnExe)) {
  $Installer = Join-Path $env:TEMP 'openvpn-install.exe'
  Write-Host 'A descarregar o instalador oficial do OpenVPN…'
  Invoke-WebRequest 'https://swupdate.openvpn.org/community/releases/OpenVPN-2.6.12-I001-amd64.msi' -OutFile $Installer
  Write-Host 'A instalar silenciosamente (isto demora um minuto)…'
  Start-Process msiexec.exe -ArgumentList "/i `"$Installer`" /qn" -Wait
  if (-not (Test-Path $OpenVpnExe)) {
    Write-Warning 'A instalação silenciosa não deixou o OpenVPN no sítio esperado.'
    Write-Warning "Corra o instalador à mão (dê duplo clique em $Installer, opções por omissão) e depois corra este script outra vez."
    exit 1
  }
} else {
  Write-Host 'Já está instalado.'
}

New-Item -ItemType Directory -Force $Certs | Out-Null
New-Item -ItemType Directory -Force $SaidaCliente | Out-Null

Write-Host "== 2/6 Autoridade certificadora e certificados =="
$CaKey = Join-Path $Certs 'ca.key'
$CaCert = Join-Path $Certs 'ca.crt'
if (-not (Test-Path $CaCert)) {
  # A CA é o "carimbo" que valida o servidor e o(s) cliente(s) — vive só neste
  # servidor; nunca sai daqui, nem precisa de tocar na internet. Só se gera
  # UMA vez: regenerá-la invalidava o acesso de quem já tivesse um .ovpn.
  & $OpenSsl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes `
    -keyout $CaKey -out $CaCert -subj '/CN=MwanaLodge-VPN-CA' 2>$null

  & $OpenSsl req -newkey rsa:2048 -nodes -keyout "$Certs\server.key" -out "$Certs\server.csr" -subj '/CN=MwanaLodge-VPN-Server' 2>$null
  & $OpenSsl x509 -req -in "$Certs\server.csr" -CA $CaCert -CAkey $CaKey -CAcreateserial -out "$Certs\server.crt" -days 3650 -sha256 2>$null

  Write-Host 'A gerar os parâmetros Diffie-Hellman (pode demorar 1-2 minutos)…'
  & $OpenSsl dhparam -out "$Certs\dh2048.pem" 2048 2>$null

  # tls-auth — uma camada extra: quem não tiver esta chave nem chega a
  # negociar o TLS, mesmo que tente adivinhar um certificado.
  & $OpenVpnExe --genkey secret "$Certs\ta.key"
} else {
  Write-Host 'CA/servidor já existiam — não se mexe.'
}

# O CERTIFICADO DO CLIENTE é por PESSOA, não por instalação — gera-se sempre
# que -ClienteNome ainda não tiver o seu, mesmo que a CA já exista de uma
# corrida anterior (é assim que se dá acesso a uma segunda pessoa depois).
if (-not (Test-Path "$Certs\$ClienteNome.crt")) {
  & $OpenSsl req -newkey rsa:2048 -nodes -keyout "$Certs\$ClienteNome.key" -out "$Certs\$ClienteNome.csr" -subj "/CN=$ClienteNome" 2>$null
  & $OpenSsl x509 -req -in "$Certs\$ClienteNome.csr" -CA $CaCert -CAkey $CaKey -CAcreateserial -out "$Certs\$ClienteNome.crt" -days 3650 -sha256 2>$null
} else {
  Write-Host "Certificado de '$ClienteNome' já existia — reutilizado."
}

Write-Host "== 3/6 Configuração do servidor =="
New-Item -ItemType Directory -Force $ConfigAuto | Out-Null
@"
port $Porta
proto udp
dev tun
ca "$($Certs -replace '\\','/')/ca.crt"
cert "$($Certs -replace '\\','/')/server.crt"
key "$($Certs -replace '\\','/')/server.key"
dh "$($Certs -replace '\\','/')/dh2048.pem"
tls-auth "$($Certs -replace '\\','/')/ta.key" 0
cipher AES-256-GCM
auth SHA256
server 10.9.0.0 255.255.255.0
# Sem isto, o telemóvel do dono só falava com o servidor VPN — com isto,
# também alcança o resto da rede do hotel (o servidor do POS incluído).
push "route $LanSubnet $LanMask"
keepalive 10 120
persist-key
persist-tun
status "$($Certs -replace '\\','/')/status.log"
verb 3
"@ | Set-Content -Path (Join-Path $ConfigAuto 'server.ovpn') -Encoding ASCII

Write-Host "== 4/6 Firewall do Windows =="
if (-not (Get-NetFirewallRule -DisplayName 'Mwana VPN (OpenVPN)' -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName 'Mwana VPN (OpenVPN)' -Direction Inbound -Protocol UDP -LocalPort $Porta -Action Allow | Out-Null
}

Write-Host "== 5/6 Serviço do OpenVPN =="
# O instalador do OpenVPN já regista "OpenVPNService" — arranca sozinho com o
# Windows e lê tudo o que estiver em config-auto\ automaticamente.
Set-Service -Name OpenVPNService -StartupType Automatic -ErrorAction SilentlyContinue
Restart-Service -Name OpenVPNService -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
$svc = Get-Service -Name OpenVPNService -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq 'Running') { Write-Host 'Serviço a correr.' }
else { Write-Warning 'O serviço OpenVPNService não ficou "Running" — veja os Logs de Eventos do Windows (Aplicação) para o motivo.' }

Write-Host "== 6/6 Perfil do cliente (.ovpn) para o dono importar no OpenVPN Connect =="
$ficheiroCliente = Join-Path $SaidaCliente "$ClienteNome.ovpn"
@"
client
dev tun
proto udp
remote $PublicHost $Porta
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
cipher AES-256-GCM
auth SHA256
verb 3
<ca>
$(Get-Content $CaCert -Raw)
</ca>
<cert>
$(Get-Content "$Certs\$ClienteNome.crt" -Raw)
</cert>
<key>
$(Get-Content "$Certs\$ClienteNome.key" -Raw)
</key>
<tls-auth>
$(Get-Content "$Certs\ta.key" -Raw)
</tls-auth>
key-direction 1
"@ | Set-Content -Path $ficheiroCliente -Encoding ASCII

$ipLocal = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.InterfaceAlias -notmatch 'Loopback|Virtual|VPN' } |
  Select-Object -First 1).IPAddress

Write-Host ""
Write-Host "FEITO (do lado deste servidor). Falta o técnico fazer, uma vez, no ROUTER do hotel:"
Write-Host "  1. Reencaminhar a porta UDP $Porta para o IP local deste servidor ($ipLocal)."
Write-Host "  2. Confirmar que $PublicHost aponta para o IP público do hotel (DDNS — ver LEIA-ME.md se ainda não tiver)."
Write-Host ""
Write-Host "Entregue ao dono do hotel o ficheiro:"
Write-Host "  $ficheiroCliente"
Write-Host "para ele importar na app 'OpenVPN Connect' (Android/iPhone/Windows/Mac) — é um clique, fica ligado."
Write-Host ""
Write-Host "NUNCA copie a pasta $Certs para fora deste servidor — tem a chave privada da CA."
Write-Host "Se precisar de dar acesso a mais alguém, corra este script outra vez com -ClienteNome outro-nome."
