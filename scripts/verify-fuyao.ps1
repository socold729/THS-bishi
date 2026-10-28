param([string]$EvidenceFile = 'docs/evidence/2026-10-27-stage2-capability-recheck.json')
$ErrorActionPreference = 'Stop'
$credentialLine = Get-Content -LiteralPath '.env.local' | Where-Object { $_.StartsWith('FUYAO_API_KEY=') }
$credential = $credentialLine.Substring('FUYAO_API_KEY='.Length)
if ([string]::IsNullOrWhiteSpace($credential) -or $credential -match '\s') { throw 'Invalid local credential format' }
$headers = @{'X-api-key' = $credential}
$dateMs = [DateTimeOffset]::Parse('2026-10-27T00:00:00+08:00').ToUnixTimeMilliseconds()
$startMs = [DateTimeOffset]::Parse('2025-10-27T00:00:00+08:00').ToUnixTimeMilliseconds()
$paths = @(
    "/api/a-share/special-data/limit-up-pool?date_ms=$dateMs&page=1&size=200&sort_field=continue_day_cnt&sort_dir=desc",
    "/api/a-share/special-data/limit-down-pool?date_ms=$dateMs&page=1&size=200",
    '/api/a-share/special-data/limit-up-ladder',
    "/api/a-share-index/prices/historical?thscode=000300.SH&interval=1d&start=$startMs&end=$dateMs",
    '/api/a-share-index/catalog/ths-index-list?tag=industry',
    '/api/a-share/financials/balance-sheets?thscode=600519.SH&period=annual&limit=2',
    '/api/a-share/financials/cash-flow-statements?thscode=600519.SH&period=annual&limit=2',
    '/api/a-share/financials/indicators?thscode=600519.SH&report=2025-4'
)
$records = @()
foreach ($path in $paths) {
    $entry = [ordered]@{ id = ('S2-RECHECK-{0:d3}' -f ($records.Count + 1)); started_at_utc = [DateTimeOffset]::UtcNow.ToString('o'); path = $path; http_status = $null; code = $null; message = $null; request_id = $null; fields = @(); count = $null; first_fields = @(); metadata = @{}; error = $null }
    try {
        $response = Invoke-WebRequest -Uri ('https://fuyao.aicubes.cn' + $path) -Headers $headers -TimeoutSec 15 -SkipHttpErrorCheck
        $json = $response.Content | ConvertFrom-Json
        $entry.http_status = [int]$response.StatusCode
        $entry.code = $json.code; $entry.message = $json.message; $entry.request_id = $json.request_id
        if ($json.data) {
            $entry.fields = @($json.data.PSObject.Properties.Name)
            if ($json.data.item) { $entry.count = @($json.data.item).Count; $entry.first_fields = @($json.data.item[0].PSObject.Properties.Name) }
            foreach ($name in @('timestamp','pagination','window','thscode','interval','report')) { if ($json.data.PSObject.Properties.Name -contains $name) { $entry.metadata[$name] = $json.data.$name } }
            if ($path -like '*catalog*') { $entry.metadata.first_industries = @($json.data.item | Select-Object -First 3) }
            if ($path -like '*financials*') { $entry.metadata.report_dates = @($json.data.item | Select-Object period_end_ms,report_date_ms) }
        }
    } catch { $entry.error = $_.Exception.Message }
    $records += [pscustomobject]$entry
    [pscustomobject]$entry | ConvertTo-Json -Depth 8
    if ($entry.code -in @(2001,2003) -or $entry.http_status -in @(401,403)) { break }
}
$headers.Clear(); $credential = $null; $credentialLine = $null
$records | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $EvidenceFile -Encoding UTF8
