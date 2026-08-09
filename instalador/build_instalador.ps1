# ============================================================================
# MONTAR O SETUP.EXE — corre na MÁQUINA DO FORNECEDOR (a sua), nunca no cliente.
#
#   .\build_instalador.ps1
#
# Faz por ordem o que faria à mão:
#   0. pergunta a SENHA DE INSTALAÇÃO (como a Oracle/Primavera) — quem abre o
#      setup.exe no cliente tem de a saber; sem ela, o Windows nem deixa extrair.
#   1. compila o frontend (vite build) e mete-o DENTRO do backend (webapp\)
#   2. copia o backend para o pacote (sem lixo: sem db de dev, sem .env, sem chaves)
#   3. monta um Python EMBUTIDO com as dependências já instaladas — o cliente
#      não instala Python, como não instala Java para usar a Primavera
#   4. põe o WinSW como servidor.exe / impressao.exe ao lado dos XML
#   5. compila o setup.iss com o Inno Setup -> MwanaLodge-Setup-1.0.0.exe
#
# Precisa (só nesta máquina): node, python, Inno Setup 6, e internet no passo 3.
# ============================================================================
$ErrorActionPreference = 'Stop'
$Raiz    = Split-Path $PSScriptRoot -Parent          # ...\POS
$Pacote  = Join-Path $PSScriptRoot 'pacote'
$PyVer   = '3.12.8'
$WinSWUrl = 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe'

function Ler-SenhaPlana([string]$Prompt) {
  $segura = Read-Host -Prompt $Prompt -AsSecureString
  $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)
  try { [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

Write-Host "== 1/6 Senha de instalação =="
Write-Host "Vá ao PCC (Gestão de Clientes > Acessos) e gere/copie a senha de instalação DESTE cliente."
Write-Host "Cole-a aqui — nunca fica gravada no código."
do {
  $senha1 = Ler-SenhaPlana 'Senha de instalação (do PCC)'
  $senha2 = Ler-SenhaPlana 'Repita a senha'
  if ($senha1 -ne $senha2) { Write-Warning 'As duas senhas não coincidem — tente outra vez.' }
  elseif ([string]::IsNullOrWhiteSpace($senha1)) { Write-Warning 'A senha não pode ficar vazia.' }
} while ($senha1 -ne $senha2 -or [string]::IsNullOrWhiteSpace($senha1))

# O ENDEREÇO DO PCC — o MESMO para todos os clientes (é a sua VPS). Sem isto,
# "Sincronizar com o PCC" no cliente aponta sempre para o próprio servidor dele.
# Só se pergunta da primeira vez; fica guardado (fora do git) para os próximos builds.
$PccUrlFile = Join-Path $PSScriptRoot 'pcc_url.txt'
if (Test-Path $PccUrlFile) {
  $PccUrl = (Get-Content $PccUrlFile -Raw).Trim()
  Write-Host "Endereço do PCC (guardado): $PccUrl — Enter para manter, ou escreva um novo:"
  $novo = Read-Host 'PCC_URL'
  if (-not [string]::IsNullOrWhiteSpace($novo)) { $PccUrl = $novo.Trim() }
} else {
  Write-Host 'Ainda não tem o endereço do PCC guardado (ex.: https://pcc.mwanalodge.ao).'
  $PccUrl = (Read-Host 'PCC_URL').Trim()
}
if ([string]::IsNullOrWhiteSpace($PccUrl)) {
  Write-Warning 'Sem PCC_URL, este cliente nunca vai conseguir sincronizar (licença, AGT). Continuando mesmo assim.'
} else {
  Set-Content -Path $PccUrlFile -Value $PccUrl -Encoding UTF8 -NoNewline
}

Write-Host "== 2/6 Frontend (vite build) =="
Push-Location (Join-Path $Raiz 'frontend')
npm run build
if ($LASTEXITCODE -ne 0) { throw 'vite build falhou' }
Pop-Location

Write-Host "== 3/6 Pacote: backend limpo + webapp =="
if (Test-Path $Pacote) { Remove-Item $Pacote -Recurse -Force }
New-Item -ItemType Directory -Force "$Pacote\app" | Out-Null
# robocopy: copia o backend SEM o que nunca pode sair desta máquina —
# a base de dev, o .env, as chaves privadas e a licença de teste.
robocopy (Join-Path $Raiz 'backend') "$Pacote\app" /E /NFL /NDL /NJH /NJS `
  /XF db.sqlite3 *.sqlite3-wal *.sqlite3-shm .env private.pem license.key *.key.bak servidor.log `
  /XD __pycache__ .pytest_cache staticfiles venv .venv media | Out-Null
# o site compilado vai DENTRO do backend: um serviço serve tudo
Copy-Item (Join-Path $Raiz 'frontend\dist') "$Pacote\app\webapp" -Recurse
# o configurador viaja na raiz do pacote
Copy-Item (Join-Path $PSScriptRoot 'configurar.py') $Pacote
# o endereço do PCC viaja ao lado — configurar.py lê-o dali e escreve-o no .env
if (Test-Path $PccUrlFile) { Copy-Item $PccUrlFile $Pacote }

Write-Host "== 4/6 Python embutido + dependências =="
$PyZip = Join-Path $env:TEMP "python-$PyVer-embed-amd64.zip"
if (-not (Test-Path $PyZip)) {
  Invoke-WebRequest "https://www.python.org/ftp/python/$PyVer/python-$PyVer-embed-amd64.zip" -OutFile $PyZip
}
Expand-Archive $PyZip "$Pacote\python" -Force
# o embutido traz o site desligado — liga-se para o pip funcionar
$pth = Get-ChildItem "$Pacote\python\python3*._pth" | Select-Object -First 1
(Get-Content $pth.FullName) -replace '#import site', 'import site' | Set-Content $pth.FullName
# O Python embutido só vê as pastas listadas AQUI (é o que o torna "isolado").
# "-m waitress" funciona sem isto (o -m junta sempre a pasta atual sozinho),
# mas correr "manage.py" diretamente (ex.: o serviço de Impressão) não — sem
# esta linha, import erp_server falha sempre, nesse caso, em qualquer máquina.
Add-Content -Path $pth.FullName -Value '..\app' -Encoding UTF8
Invoke-WebRequest 'https://bootstrap.pypa.io/get-pip.py' -OutFile "$Pacote\python\get-pip.py"
& "$Pacote\python\python.exe" "$Pacote\python\get-pip.py" --no-warn-script-location
& "$Pacote\python\python.exe" -m pip install --no-warn-script-location -r (Join-Path $Raiz 'backend\requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'pip install falhou' }

Write-Host "== 5/6 Serviços (WinSW) =="
New-Item -ItemType Directory -Force "$Pacote\servicos" | Out-Null
$WinSW = Join-Path $env:TEMP 'WinSW-x64.exe'
if (-not (Test-Path $WinSW)) { Invoke-WebRequest $WinSWUrl -OutFile $WinSW }
Copy-Item $WinSW "$Pacote\servicos\servidor.exe"
Copy-Item $WinSW "$Pacote\servicos\impressao.exe"
Copy-Item "$PSScriptRoot\servicos\servidor.xml"  "$Pacote\servicos\"
Copy-Item "$PSScriptRoot\servicos\impressao.xml" "$Pacote\servicos\"

Write-Host "== 6/6 Inno Setup =="
$iscc = @('C:\Program Files (x86)\Inno Setup 6\ISCC.exe', 'C:\Program Files\Inno Setup 6\ISCC.exe',
          "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe") |
        Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) {
  Write-Warning 'Inno Setup 6 não está instalado (https://jrsoftware.org/isdl.php).'
  Write-Warning "O pacote ficou pronto em $Pacote — depois de instalar o Inno, corra:"
  Write-Warning "  ISCC.exe /DInstallPassword=A-SUA-SENHA `"$PSScriptRoot\setup.iss`""
  exit 0
}
# A senha passa ao compilador só por argumento (nunca escrita num ficheiro do
# PROJETO nem entra no histórico do git) — mas fica um registo LOCAL depois de
# compilar, dentro de instalador\Output\ (pasta já no .gitignore): sem isto, uma
# senha esquecida perdia-se para sempre e ninguém instalava mais aquela versão.
& $iscc "/DInstallPassword=$senha1" (Join-Path $PSScriptRoot 'setup.iss')
if ($LASTEXITCODE -ne 0) { $senha1 = $null; $senha2 = $null; throw 'Inno Setup falhou a compilar o instalador.' }

$RegistoSenhas = Join-Path $PSScriptRoot 'Output\senhas.txt'
$OutputDir = Join-Path $PSScriptRoot 'Output'
$Instalador = Get-ChildItem $OutputDir -Filter 'MwanaLodge-Setup-*.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
"$(Get-Date -Format 'yyyy-MM-dd HH:mm')  $($Instalador.Name)  $senha1" | Add-Content -Path $RegistoSenhas -Encoding UTF8
$senha1 = $null; $senha2 = $null

Write-Host "`nFEITO: instalador em $PSScriptRoot\Output\MwanaLodge-Setup-*.exe"
Write-Host "Senha registada em $RegistoSenhas — ficheiro LOCAL, fora do git, só seu. Trate-o como uma password (mova para um gestor de senhas se quiser)."
Write-Host "Entregue a senha ao técnico por um canal separado do .exe (nunca por e-mail junto)."
