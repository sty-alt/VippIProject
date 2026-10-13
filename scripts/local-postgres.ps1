param([switch]$Stop)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $projectRoot
$pgBin = Join-Path $projectRoot '.local\postgres\pgsql\bin'
$pgData = Join-Path $projectRoot '.local\pg-data'
if ($Stop) {
  & (Join-Path $pgBin 'pg_ctl.exe') -D $pgData stop -m fast
  if ($LASTEXITCODE -ne 0) { throw 'Could not stop this project PostgreSQL.' }
  exit
}
New-Item -ItemType Directory -Force (Join-Path $projectRoot '.local') | Out-Null
if (!(Test-Path -LiteralPath (Join-Path $pgBin 'pg_ctl.exe'))) {
  $zip = Join-Path $projectRoot '.local\postgres.zip'
  Invoke-WebRequest -Uri 'https://get.enterprisedb.com/postgresql/postgresql-17.6-1-windows-x64-binaries.zip' -OutFile $zip
  Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $projectRoot '.local\postgres') -Force
}
if (!(Test-Path -LiteralPath (Join-Path $pgData 'PG_VERSION'))) {
  node scripts/setup-env.mjs --local-cluster
  if ($LASTEXITCODE -ne 0) { throw 'Environment creation failed.' }
  & (Join-Path $pgBin 'initdb.exe') -D $pgData -U soglasovano --pwfile='.local\pg-password.txt' --auth=scram-sha-256 --encoding=UTF8 --locale=C
  if ($LASTEXITCODE -ne 0) { throw 'Cluster initialization failed.' }
}
& (Join-Path $pgBin 'pg_ctl.exe') -D $pgData status 2>$null
if ($LASTEXITCODE -ne 0) {
  & (Join-Path $pgBin 'pg_ctl.exe') -D $pgData -l (Join-Path $projectRoot '.local\postgres.log') -o '-p 55477 -h 127.0.0.1 -c timezone=UTC' start
  if ($LASTEXITCODE -ne 0) { throw 'Server start failed. Check port 55477.' }
}
node scripts/create-local-databases.mjs
if ($LASTEXITCODE -ne 0) { throw 'Database creation failed.' }
