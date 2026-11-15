# T33: smoke real de cargas con dos cuentas Cognito (A y B), desde PowerShell en Windows.
# Pide correo y contraseña de A y B con entrada oculta; no guarda contraseñas ni tokens.
# Crea un proyecto y sube un archivo real que NO se borra (DELETE aún no existe).
# Recibo sin tokens: %TEMP%\prometeo-t33-upload-check.json
# Uso: powershell -ExecutionPolicy Bypass -File tools\cognito\run_uploads_smoke.ps1 [-Source <csv|pdf>]
param(
  [string]$Source = 'tools/psi/data/datos_psi/tablas/PSI-25/PSI-25_Experimental table_BASS-II.csv'
)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')
if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) { throw "No existe el archivo fuente: $Source" }
if (-not (Test-Path 'tools/cognito/node_modules')) { npm ci --prefix tools/cognito --ignore-scripts }
# Solo IDs/URLs públicos de infra/*.env; no hay secretos en esos archivos.
foreach ($file in 'infra/config.env', 'infra/outputs.env') {
  foreach ($line in Get-Content -LiteralPath $file) {
    if ($line -match '^export (\w+)="?([^"]*)"?$') { Set-Item -Path "env:$($Matches[1])" -Value $Matches[2] }
  }
}
# check_uploads_live.py solo usa la librería estándar; cualquier Python 3 local sirve.
if (-not $env:T33_PYTHON) { $env:T33_PYTHON = (Get-Command python).Source }
node tools/cognito/cli.mjs uploads (Resolve-Path -LiteralPath $Source).Path
