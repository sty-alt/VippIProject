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
  if (Test-Path -LiteralPath (Join-Path $projectRoot '.env')) { throw 'Existing .env preserved. Configure your PostgreSQL manually or move it aside before creating a new project cluster.' }
  node --input-type=module -e 'import fs from "node:fs";import c from "node:crypto";const p=c.randomBytes(24).toString("hex");fs.writeFileSync(".local/pg-password.txt",p);fs.writeFileSync(".env","DATABASE_URL=postgresql://soglasovano:"+p+"@localhost:55477/soglasovano\nTEST_DATABASE_URL=postgresql://soglasovano:"+p+"@localhost:55477/soglasovano_test\nBETTER_AUTH_SECRET="+c.randomBytes(48).toString("hex")+"\nBETTER_AUTH_URL=http://localhost:3077\nAI_API_KEY=\nAI_BASE_URL=https://api.openai.com/v1\nAI_MODEL=\n");'
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
