# Diagnostico da instalacao do System Mwana Lodge — correr como Administrador
# na maquina onde o setup.exe foi instalado.
$App = "C:\Program Files (x86)\MwanaLodge"
if (-not (Test-Path $App)) { $App = "C:\Program Files\MwanaLodge" }
Write-Host "=== Pasta de instalacao: $App ===" -ForegroundColor Cyan

Write-Host "`n=== Servico (Servidor) ===" -ForegroundColor Cyan
Get-Service -Name MwanaLodgeServidor -ErrorAction SilentlyContinue | Format-List Name, Status, StartType

Write-Host "`n=== Servico (Impressao e Gaveta) ===" -ForegroundColor Cyan
Get-Service -Name MwanaLodgeImpressao -ErrorAction SilentlyContinue | Format-List Name, Status, StartType

Write-Host "`n=== Licenca (license.key) ===" -ForegroundColor Cyan
$licPath = "$App\app\license.key"
if (Test-Path $licPath) {
    Get-Item $licPath | Format-List FullName, Length, LastWriteTime
} else {
    Write-Host "NAO EXISTE: $licPath — sem isto o sistema fica preso no /onboarding (nenhum modulo opcional, dono nao consegue entrar)." -ForegroundColor Red
}

Write-Host "`n=== .env (linhas relevantes) ===" -ForegroundColor Cyan
$envPath = "$App\app\.env"
if (Test-Path $envPath) {
    Get-Content $envPath | Where-Object { $_ -match "DEBUG|SSL_REDIRECT|ALLOWED_HOSTS|SECRET_KEY|PCC_URL" }
    if (-not (Select-String -Path $envPath -Pattern "PCC_URL" -Quiet)) {
        Write-Host "AVISO: sem PCC_URL — 'Sincronizar com o PCC' nunca vai conseguir ligar ao fornecedor." -ForegroundColor Yellow
    }
} else { Write-Host "NAO EXISTE: $envPath" -ForegroundColor Red }

Write-Host "`n=== webapp/index.html ===" -ForegroundColor Cyan
$idx = "$App\app\webapp\index.html"
if (Test-Path $idx) { Get-Item $idx | Format-List FullName, Length, LastWriteTime }
else { Write-Host "NAO EXISTE: $idx" -ForegroundColor Red }

Write-Host "`n=== urls.py tem o bloco do SPA? ===" -ForegroundColor Cyan
$urlsPath = "$App\app\erp_server\urls.py"
if (Test-Path $urlsPath) {
    $tem = Select-String -Path $urlsPath -Pattern "_WEBAPP" -Quiet
    Write-Host "Contem _WEBAPP: $tem"
} else { Write-Host "NAO EXISTE: $urlsPath" -ForegroundColor Red }

Write-Host "`n=== Ultimas linhas do log do servico ===" -ForegroundColor Cyan
$logDir = "$App\dados\logs"
if (Test-Path $logDir) {
    $log = Get-ChildItem $logDir -Filter "*.log" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($log) { Get-Content $log.FullName -Tail 40 }
} else { Write-Host "Sem pasta de logs: $logDir" -ForegroundColor Red }

Write-Host "`n=== Pedido real a http://localhost:8000/ ===" -ForegroundColor Cyan
try {
    $r = Invoke-WebRequest -Uri "http://localhost:8000/" -UseBasicParsing -MaximumRedirection 0 -ErrorAction Stop
    Write-Host "Status: $($r.StatusCode)"
    $r.Content.Substring(0, [Math]::Min(500, $r.Content.Length))
} catch {
    Write-Host "ERRO: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $body = $reader.ReadToEnd()
        Write-Host "Status: $([int]$_.Exception.Response.StatusCode)"
        $body.Substring(0, [Math]::Min(800, $body.Length))
    }
}
