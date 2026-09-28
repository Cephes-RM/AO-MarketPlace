<#
.SYNOPSIS
    p95 latency benchmark for search / guild / alliance queries.
    Runs pgbench inside the pg-tutorial Docker container.

.EXAMPLE
    .\scripts\bench.ps1
    .\scripts\bench.ps1 -Clients 32 -Duration 60
#>
param(
    [string]$Container   = "pg-tutorial",
    [string]$Db          = "AO-db",
    [string]$DbUser      = "postgres",
    [int]   $Clients     = 8,
    [int]   $Duration    = 30,
    [int]   $Warmup      = 5,
    [string]$ResultsDir  = ".\bench-results",
    [int]   $ThresholdMs = 300
)

$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Force -Path $ResultsDir | Out-Null
$ResultsDir = (Resolve-Path -LiteralPath $ResultsDir).Path
$InnerDir   = "/tmp/bench"

# --- pgbench scripts (literal here-strings, closing '@ at column 0) --------
$searchSql = @'
\set pat random(1000, 999999)
SELECT id, name FROM "Player"
WHERE name ILIKE '%' || :pat::text || '%'
LIMIT 20;
'@

$guildSql = @'
\set gid random(1, 100000)
SELECT
    g.id, g.name, g."allianceId",
    count(m."playerId")      AS member_count,
    COALESCE(SUM(p.fame), 0) AS total_fame
FROM "Guild" g
LEFT JOIN "GuildMembership" m
       ON m."guildId" = g.id AND m."leftAt" IS NULL
LEFT JOIN "Player" p ON p.id = m."playerId"
WHERE g.id = 'g_' || lpad(:gid::text, 7, '0')
GROUP BY g.id, g.name, g."allianceId";
'@

$allianceSql = @'
\set aid random(1, 10000)
SELECT
    a.id, a.name,
    count(DISTINCT g.id)         AS guild_count,
    count(DISTINCT m."playerId") AS member_count,
    COALESCE(SUM(p.fame), 0)     AS total_fame
FROM "Alliance" a
LEFT JOIN "Guild" g ON g."allianceId" = a.id
LEFT JOIN "GuildMembership" m
       ON m."guildId" = g.id AND m."leftAt" IS NULL
LEFT JOIN "Player" p ON p.id = m."playerId"
WHERE a.id = 'a_' || lpad(:aid::text, 6, '0')
GROUP BY a.id, a.name;
'@

$ascii = New-Object System.Text.ASCIIEncoding
[System.IO.File]::WriteAllText((Join-Path $ResultsDir "search.sql"),   $searchSql,   $ascii)
[System.IO.File]::WriteAllText((Join-Path $ResultsDir "guild.sql"),    $guildSql,    $ascii)
[System.IO.File]::WriteAllText((Join-Path $ResultsDir "alliance.sql"), $allianceSql, $ascii)

docker exec $Container mkdir -p $InnerDir | Out-Null
foreach ($f in @("search","guild","alliance")) {
    docker cp (Join-Path $ResultsDir "$f.sql") "${Container}:$InnerDir/$f.sql" | Out-Null
}

# --- sanity check (stdin pipe avoids Windows quote-stripping) --------------
Write-Host "==> sanity check against container=$Container db=$Db"
foreach ($t in @("Player","Guild","Alliance")) {
    $sql = 'SELECT count(*) FROM "' + $t + '";'
    $n = ($sql | docker exec -i $Container psql -U $DbUser -d $Db -tA) -join ""
    Write-Host ("  {0,-10} rows: {1}" -f $t, $n.Trim())
}

function Get-PercentileMs {
    param([long[]]$Sorted, [double]$P)
    if ($Sorted.Count -eq 0) { return [double]::NaN }
    $i = [Math]::Max(1, [int][Math]::Floor($Sorted.Count * $P)) - 1
    return [double]$Sorted[$i] / 1000.0
}

$results = @{}

function Invoke-OneBench {
    param([string]$Name, [string]$Script)
    $dir = Join-Path $ResultsDir $Name
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    docker exec $Container bash -c "rm -f $InnerDir/pgbench_log.*" | Out-Null

    Write-Host "==> [$Name] warmup ${Warmup}s"
    docker exec $Container bash -c "cd $InnerDir && pgbench -U $DbUser -n -f $Script -c $Clients -T $Warmup $Db" | Out-Null

    Write-Host "==> [$Name] measured ${Duration}s with $Clients clients"
    docker exec $Container bash -c "cd $InnerDir && pgbench -U $DbUser -n -f $Script -c $Clients -T $Duration -l $Db" | Out-Null

    $logFile = Join-Path $dir "pgbench_log.all"
    (docker exec $Container bash -c "cat $InnerDir/pgbench_log.* 2>/dev/null || true") |
        Out-File -Encoding ascii $logFile

    $latencies = New-Object System.Collections.Generic.List[long]
    foreach ($line in Get-Content $logFile) {
        $parts = $line -split '\s+'
        if ($parts.Length -ge 3) {
            $v = 0L
            if ([long]::TryParse($parts[2], [ref]$v)) { $latencies.Add($v) }
        }
    }

    if ($latencies.Count -eq 0) {
        Write-Host "  !! no samples collected for $Name"
        $results[$Name] = [pscustomobject]@{ N = 0; P50 = "n/a"; P95 = "n/a"; P99 = "n/a"; Max = "n/a" }
        return
    }

    $sorted = $latencies | Sort-Object
    $n    = $sorted.Count
    $p50  = Get-PercentileMs $sorted 0.50
    $p95  = Get-PercentileMs $sorted 0.95
    $p99  = Get-PercentileMs $sorted 0.99
    $pmax = [double]$sorted[$n - 1] / 1000.0

    $results[$Name] = [pscustomobject]@{ N = $n; P50 = $p50; P95 = $p95; P99 = $p99; Max = $pmax }
    Write-Host ("  samples={0}  p50={1:F2}ms  p95={2:F2}ms  p99={3:F2}ms  max={4:F2}ms" -f $n, $p50, $p95, $p99, $pmax)
}

Invoke-OneBench -Name "search"   -Script "search.sql"
Invoke-OneBench -Name "guild"    -Script "guild.sql"
Invoke-OneBench -Name "alliance" -Script "alliance.sql"

# --- markdown summary + SLO gate -------------------------------------------
$ts = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
Write-Host ""
Write-Host ("## Benchmark results - " + $ts)
Write-Host ""
Write-Host ("Host: docker container {0} | DB: {1} | clients={2} | duration={3}s | warmup={4}s | SLO={5}ms" -f $Container, $Db, $Clients, $Duration, $Warmup, $ThresholdMs)
Write-Host ""
Write-Host ("| Endpoint | samples | p50 (ms) | p95 (ms) | p99 (ms) | max (ms) | p95 under " + $ThresholdMs + "ms |")
Write-Host  "|----------|--------:|---------:|---------:|---------:|---------:|:----------------------:|"

$fail = $false
foreach ($name in @("search","guild","alliance")) {
    $r  = $results[$name]
    $ok = ($r.P95 -is [double]) -and ($r.P95 -lt $ThresholdMs)
    if (-not $ok) { $fail = $true }
    $mark = if ($ok) { "OK" } else { "FAIL" }
    if ($r.P95 -is [double]) {
        Write-Host ("| {0,-8} | {1,7} | {2,8:F2} | {3,8:F2} | {4,8:F2} | {5,8:F2} | {6} |" -f `
            $name, $r.N, [double]$r.P50, [double]$r.P95, [double]$r.P99, [double]$r.Max, $mark)
    } else {
        Write-Host ("| {0,-8} | {1,7} | {2,8} | {3,8} | {4,8} | {5,8} | {6} |" -f `
            $name, $r.N, $r.P50, $r.P95, $r.P99, $r.Max, $mark)
    }
}
Write-Host ""

if ($fail) {
    Write-Host ("FAIL: p95 exceeded " + $ThresholdMs + "ms on at least one endpoint.") -ForegroundColor Red
    exit 1
}
Write-Host ("PASS: all endpoints under " + $ThresholdMs + "ms p95.") -ForegroundColor Green