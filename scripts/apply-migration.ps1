# Apply Phase 1 migration to a remote Supabase Postgres database.
# Prerequisites: set DATABASE_URL (Direct connection string from Supabase Dashboard → Settings → Database)
#
# Usage:
#   $env:DATABASE_URL = "postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"
#   .\scripts\apply-migration.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$migration = Join-Path $root "supabase\migrations\20260517000000_phase1_foundation.sql"
$seed = Join-Path $root "supabase\seed.sql"

if (-not $env:DATABASE_URL) {
  Write-Error "DATABASE_URL is not set. Use the Supabase direct connection string."
}

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  Write-Error "psql not found. Install PostgreSQL client tools or run the SQL in Supabase Dashboard → SQL Editor."
}

Write-Host "Applying migration: $migration"
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f $migration

$runSeed = Read-Host "Apply seed.sql for dev hierarchy? (y/N)"
if ($runSeed -eq "y") {
  Write-Host "Applying seed: $seed"
  psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f $seed
}

Write-Host "Done. Run supabase/tests/rls_verification.sql in SQL Editor to verify RLS."
