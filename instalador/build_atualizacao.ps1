# ============================================================================
# MONTAR O PACOTE DE ATUALIZAÇÃO ("um clique") — corre na MÁQUINA DO FORNECEDOR.
#
#   .\build_atualizacao.ps1
#
# Ao contrário do build_instalador.ps1 (que monta o setup.exe completo, com Python
# embutido e o Inno Setup, para a PRIMEIRA instalação), este script monta só um
# .zip leve com o backend (app/) + o site compilado (webapp/) — o que muda entre
# versões. Sem Python, sem WinSW, sem senha: o cliente já tem tudo isso instalado,
# só precisa dos ficheiros novos. É este .zip que se publica no PCC (CLM › Versões)
# para o botão "Atualizar agora" (Configuração POS › Utilitários › Diagnóstico).
#
# DEPOIS DE GERAR, é só carregar o .zip no PCC — não precisa de o alojar em lado
# nenhum. O PCC guarda-o e cria o link de descarga sozinho:
#
#   PCC > Versoes > Publicar versao nova
#     Versao:              o mesmo numero que esta no support.py
#     Ficheiro da versao:  escolha o .zip que este script acabou de criar
#     O que mudou:         o texto que o cliente vai ler no aviso
#
# (Este script dizia aqui para "subir o .zip ao GitHub Releases, S3, etc." e
#  colar o URL. Era a unica forma possivel enquanto o PCC so guardava a morada
#  do ficheiro e nao o ficheiro — e era o passo onde se encalhava, porque esse
#  link nao existe ate alguem o criar. O PCC passou a receber o ficheiro; o
#  campo do link continua la para quem ja tem onde o alojar.)
# ============================================================================
$ErrorActionPreference = 'Stop'
$Raiz   = Split-Path $PSScriptRoot -Parent          # ...\POS
$Temp   = Join-Path $PSScriptRoot 'pacote_update'
$OutDir = Join-Path $PSScriptRoot 'Output'

# A versão vem do PRÓPRIO código (core/support.py) — fonte única, evita publicar
# um pacote com um número que não bate certo com o que o sistema diz que é.
$SupportPy = Join-Path $Raiz 'backend\core\support.py'
$m = Select-String -Path $SupportPy -Pattern "APP_VERSION = '([\d.]+)'" | Select-Object -First 1
if (-not $m) { throw "Não encontrei APP_VERSION em $SupportPy — confirme que a linha existe e tem esse formato." }
$Versao = $m.Matches[0].Groups[1].Value
Write-Host "== Versão (de backend/core/support.py): $Versao =="

Write-Host "== 1/4 Frontend (vite build) =="
Push-Location (Join-Path $Raiz 'frontend')
npm run build
if ($LASTEXITCODE -ne 0) { throw 'vite build falhou' }
Pop-Location

Write-Host "== 2/4 Backend limpo (sem venv, sem .env, sem dados do cliente) =="
if (Test-Path $Temp) { Remove-Item $Temp -Recurse -Force }
New-Item -ItemType Directory -Force "$Temp\app" | Out-Null
# MESMOS excludes do build_instalador.ps1 — um pacote de atualização NUNCA pode
# levar a base de dev, a licença de teste, nem as chaves privadas.
robocopy (Join-Path $Raiz 'backend') "$Temp\app" /E /NFL /NDL /NJH /NJS `
  /XF db.sqlite3 *.sqlite3-wal *.sqlite3-shm .env private.pem license.key *.key.bak servidor.log `
  /XD __pycache__ .pytest_cache staticfiles venv .venv media | Out-Null
Copy-Item (Join-Path $Raiz 'frontend\dist') "$Temp\webapp" -Recurse

Write-Host "== 3/4 A compactar =="
New-Item -ItemType Directory -Force $OutDir | Out-Null
$ZipPath = Join-Path $OutDir "MwanaLodge-Update-$Versao.zip"
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Compress-Archive -Path "$Temp\app", "$Temp\webapp" -DestinationPath $ZipPath -CompressionLevel Optimal

Write-Host "== 4/4 A limpar =="
Remove-Item $Temp -Recurse -Force

$TamanhoMB = [Math]::Round((Get-Item $ZipPath).Length / 1MB, 1)
Write-Host "`nFEITO: $ZipPath ($TamanhoMB MB)"
Write-Host ""
Write-Host "AGORA PUBLIQUE NO PCC (nao precisa de alojar o ficheiro em lado nenhum):"
Write-Host "  1. PCC > Versoes > Publicar versao nova"
Write-Host "  2. Versao:             $Versao"
Write-Host "  3. Ficheiro da versao: escolha o .zip indicado acima"
Write-Host "  4. O que mudou:        o texto que o cliente vai ler no aviso"
Write-Host "  5. Publicar - o link de descarga preenche-se sozinho."
Write-Host ""
Write-Host "O CLIENTE: Configuracao POS > Utilitarios > Diagnostico > Atualizar agora."
Write-Host "Nao reinstala nada; a configuracao, a licenca e a base de dados dele ficam intactas."
Write-Host ""
Write-Host "Publicar um .exe em vez deste .zip DESLIGA o botao de um clique: o cliente passa a"
Write-Host "ter de descarregar e correr o instalador completo a mao. So faz sentido quando o que"
Write-Host "muda esta FORA do app/ (Python novo, servico novo) - nesse caso use build_instalador.ps1."
