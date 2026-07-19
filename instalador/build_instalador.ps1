# ============================================================================
# MONTAR O SETUP.EXE — corre na MÁQUINA DO FORNECEDOR (a sua), nunca no cliente.
#
#   .\build_instalador.ps1
#
# Faz por ordem o que faria à mão:
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

Write-Host "== 1/5 Frontend (vite build) =="
Push-Location (Join-Path $Raiz 'frontend')
npm run build
if ($LASTEXITCODE -ne 0) { throw 'vite build falhou' }
Pop-Location

Write-Host "== 2/5 Pacote: backend limpo + webapp =="
if (Test-Path $Pacote) { Remove-Item $Pacote -Recurse -Force }
New-Item -ItemType Directory -Force "$Pacote\app" | Out-Null
# robocopy: copia o backend SEM o que nunca pode sair desta máquina —
# a base de dev, o .env, as chaves privadas e a licença de teste.
robocopy (Join-Path $Raiz 'backend') "$Pacote\app" /E /NFL /NDL /NJH /NJS `
  /XF db.sqlite3 *.sqlite3-wal *.sqlite3-shm .env private.pem license.key *.key.bak servidor.log `
  /XD __pycache__ .pytest_cache staticfiles | Out-Null
# o site compilado vai DENTRO do backend: um serviço serve tudo
Copy-Item (Join-Path $Raiz 'frontend\dist') "$Pacote\app\webapp" -Recurse
# o configurador viaja na raiz do pacote
Copy-Item (Join-Path $PSScriptRoot 'configurar.py') $Pacote

Write-Host "== 3/5 Python embutido + dependências =="
$PyZip = Join-Path $env:TEMP "python-$PyVer-embed-amd64.zip"
if (-not (Test-Path $PyZip)) {
  Invoke-WebRequest "https://www.python.org/ftp/python/$PyVer/python-$PyVer-embed-amd64.zip" -OutFile $PyZip
}
Expand-Archive $PyZip "$Pacote\python" -Force
# o embutido traz o site desligado — liga-se para o pip funcionar
$pth = Get-ChildItem "$Pacote\python\python3*._pth" | Select-Object -First 1
(Get-Content $pth.FullName) -replace '#import site', 'import site' | Set-Content $pth.FullName
Invoke-WebRequest 'https://bootstrap.pypa.io/get-pip.py' -OutFile "$Pacote\python\get-pip.py"
& "$Pacote\python\python.exe" "$Pacote\python\get-pip.py" --no-warn-script-location
& "$Pacote\python\python.exe" -m pip install --no-warn-script-location -r (Join-Path $Raiz 'backend\requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'pip install falhou' }

Write-Host "== 4/5 Serviços (WinSW) =="
New-Item -ItemType Directory -Force "$Pacote\servicos" | Out-Null
$WinSW = Join-Path $env:TEMP 'WinSW-x64.exe'
if (-not (Test-Path $WinSW)) { Invoke-WebRequest $WinSWUrl -OutFile $WinSW }
Copy-Item $WinSW "$Pacote\servicos\servidor.exe"
Copy-Item $WinSW "$Pacote\servicos\impressao.exe"
Copy-Item "$PSScriptRoot\servicos\servidor.xml"  "$Pacote\servicos\"
Copy-Item "$PSScriptRoot\servicos\impressao.xml" "$Pacote\servicos\"

Write-Host "== 5/5 Inno Setup =="
$iscc = @('C:\Program Files (x86)\Inno Setup 6\ISCC.exe', 'C:\Program Files\Inno Setup 6\ISCC.exe') |
        Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) {
  Write-Warning 'Inno Setup 6 não está instalado (https://jrsoftware.org/isdl.php).'
  Write-Warning "O pacote ficou pronto em $Pacote — depois de instalar o Inno, corra:"
  Write-Warning "  ISCC.exe `"$PSScriptRoot\setup.iss`""
  exit 0
}
& $iscc (Join-Path $PSScriptRoot 'setup.iss')
Write-Host "`nFEITO: instalador em $PSScriptRoot\Output\MwanaLodge-Setup-*.exe"
