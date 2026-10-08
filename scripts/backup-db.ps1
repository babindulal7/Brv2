param (
    [string]$DbUrl = $env:SUPABASE_DB_URL,
    [string]$BackupFile = "production_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql"
)

if (-not $DbUrl) {
    Write-Host "Error: SUPABASE_DB_URL is not set." -ForegroundColor Red
    Write-Host "Please set it or pass it as an argument:" -ForegroundColor Yellow
    Write-Host ".\backup-db.ps1 -DbUrl 'postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres'" -ForegroundColor Yellow
    exit 1
}

Write-Host "Starting native pg_dump for $DbUrl..." -ForegroundColor Cyan

# We use --clean to include DROP statements so the restore is idempotent.
# We exclude the auth schema if we don't want to mess with Supabase auth users,
# but for a full backup, leaving it default or dumping the whole db is safer.
pg_dump --clean --if-exists --quote-all-identifiers -d $DbUrl -f $BackupFile

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Backup successfully saved to $BackupFile" -ForegroundColor Green
    Write-Host "Verifying backup file..." -ForegroundColor Cyan
    $Size = (Get-Item $BackupFile).Length / 1MB
    Write-Host "Backup size: $([math]::Round($Size, 2)) MB" -ForegroundColor Green
} else {
    Write-Host "❌ pg_dump failed with exit code $LASTEXITCODE" -ForegroundColor Red
}
