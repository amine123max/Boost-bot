# SEC EDGAR access for the research bot on Windows; same commands and output as sec.sh. Run it from the workspace root.
# Every call saves the raw response under app\reports\<run-id>\raw\ and appends one line to
# app\reports\<run-id>\tools.jsonl, so the numbers in a report can be traced to what SEC returned.
#
#   sec.ps1 <run-id> lookup  <ticker or company name>
#   sec.ps1 <run-id> concept <cik> <taxonomy/Tag> [annual|quarterly]
#   sec.ps1 <run-id> filings <cik> [form] [count]
#   sec.ps1 <run-id> read    <https://www.sec.gov/... document url>
#   sec.ps1 <run-id> note    <tool> <text>
param(
  [Parameter(Position = 0)][string]$Run,
  [Parameter(Position = 1)][string]$Cmd,
  [Parameter(Position = 2, ValueFromRemainingArguments = $true)][string[]]$Rest
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$MaxSteps = 20
$MaxRepeats = 3
$UA = 'AnyModelBot support@anymodel.bot'
$Utf8 = New-Object Text.UTF8Encoding($false)
$Args2 = @($Rest)

function Die([string]$Message) {
  [Console]::Error.WriteLine("error: $Message")
  exit 1
}
function Arg([int]$Index) {
  if ($Index -lt $Args2.Count -and $null -ne $Args2[$Index]) { return [string]$Args2[$Index] }
  return ''
}

if (-not $Run -or -not $Cmd) { Die 'usage: sec.ps1 <run-id> <lookup|concept|filings|read|note> ...' }
if ($Run -cnotmatch '^[a-z0-9][a-z0-9-]{0,63}$') { Die 'run-id may only use lowercase letters, digits and hyphens' }
$Root = (Get-Location).Path
if (-not (Test-Path (Join-Path $Root 'app'))) { Die 'run this from the workspace root (no app folder here)' }

$Dir = Join-Path $Root "app\reports\$Run"
$RawDir = Join-Path $Dir 'raw'
$Trace = Join-Path $Dir 'tools.jsonl'
New-Item -ItemType Directory -Force -Path $RawDir | Out-Null
if (-not (Test-Path $Trace)) { [IO.File]::WriteAllText($Trace, '', $Utf8) }

function Now-Utc { return [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ') }
function Trace-Lines { return @([IO.File]::ReadAllLines($Trace, $Utf8)) }
function Count-Calls { return @(Trace-Lines | Where-Object { $_.Contains('"status":') }).Count }
function Count-Steps { return @(Trace-Lines | Where-Object { $_.Contains('"cached":false') }).Count }
function Same-Lines([string]$Tool, [string]$Target) {
  $needle = "`"tool`":`"$Tool`",`"target`":`"$Target`","
  return @(Trace-Lines | Where-Object { $_.Contains($needle) })
}
function Write-Trace([string]$Tool, [string]$Target, [string]$Url, [int]$Status, [string]$File, [long]$Bytes, [bool]$Cached) {
  $c = if ($Cached) { 'true' } else { 'false' }
  $line = "{`"ts`":`"$(Now-Utc)`",`"tool`":`"$Tool`",`"target`":`"$Target`",`"url`":`"$Url`",`"status`":$Status,`"file`":`"$File`",`"bytes`":$Bytes,`"cached`":$c}`n"
  [IO.File]::AppendAllText($Trace, $line, $Utf8)
}
function Guard([string]$Tool, [string]$Target) {
  $same = @(Same-Lines $Tool $Target).Count
  if ($same -ge $MaxRepeats) { Die "this exact call already ran $same times. Stop repeating it and report what you have." }
  if ($same -eq 0 -and (Count-Steps) -ge $MaxSteps) { Die "step limit reached ($MaxSteps). Stop fetching, write the report, and list what is missing under limitations." }
}

# Retries 429 and 5xx with backoff. Returns the HTTP status, or 0 when the request itself failed.
function Get-Url([string]$Url, [string]$Dest) {
  $part = "$Dest.part"
  $delay = 2
  $code = 0
  for ($i = 0; $i -le 3; $i++) {
    $code = 0
    try {
      $r = Invoke-WebRequest -Uri $Url -UserAgent $UA -UseBasicParsing -MaximumRedirection 3 -TimeoutSec 120 -OutFile $part -PassThru
      $code = [int]$r.StatusCode
    } catch {
      $resp = $_.Exception.Response
      if ($resp) { $code = [int]$resp.StatusCode }
    }
    if ($code -eq 200) {
      Move-Item -Force -LiteralPath $part -Destination $Dest
      return 200
    }
    if (Test-Path -LiteralPath $part) { Remove-Item -Force -LiteralPath $part }
    if ($code -ne 0 -and $code -ne 429 -and $code -lt 500) { return $code }
    if ($i -lt 3) {
      Start-Sleep -Seconds $delay
      $delay *= 2
    }
  }
  return $code
}

function No-Data([int]$Code, [string]$Url) {
  [Console]::Out.WriteLine(('no data: HTTP {0:000} for {1}' -f $Code, $Url))
  exit 2
}

# Sets $script:File and $script:FileRel, or stops.
function Fetch([string]$Tool, [string]$Target, [string]$Url, [string]$Ext) {
  Guard $Tool $Target
  $prev = @(Same-Lines $Tool $Target)
  if ($prev.Count -gt 0) {
    $m = [regex]::Match($prev[0], '"file":"([^"]*)"')
    if ($m.Success -and $m.Groups[1].Value) {
      $rel = $m.Groups[1].Value
      $full = Join-Path $Dir ($rel -replace '/', '\')
      if (Test-Path -LiteralPath $full) {
        $script:FileRel = $rel
        $script:File = $full
        Write-Trace $Tool $Target $Url 200 $rel (Get-Item -LiteralPath $full).Length $true
        Write-Output '(already fetched in this run, using the saved copy)'
        return
      }
    }
  }
  $name = '{0:00}-{1}.{2}' -f ((Count-Calls) + 1), $Tool, $Ext
  $script:File = Join-Path $RawDir $name
  $script:FileRel = "raw/$name"
  $code = Get-Url $Url $script:File
  if ($code -ne 200) {
    Write-Trace $Tool $Target $Url $code '' 0 $false
    No-Data $code $Url
  }
  Write-Trace $Tool $Target $Url 200 $script:FileRel (Get-Item -LiteralPath $script:File).Length $false
}

function Cik-Arg([string]$Value) {
  if ($Value -cnotmatch '^[0-9]{1,10}$') { Die 'cik must be digits; get it with lookup' }
  $script:CikInt = [long]$Value
  $script:Cik10 = '{0:0000000000}' -f $script:CikInt
}
function Footer { Write-Output "saved: $script:File  |  steps used: $(Count-Steps)/$MaxSteps" }

function Cmd-Lookup {
  $q = Arg 0
  if ($q -cnotmatch '^[A-Za-z0-9][A-Za-z0-9 .&-]{0,59}$') { Die 'lookup takes a ticker or company name' }
  $url = 'https://www.sec.gov/files/company_tickers.json'
  $tickers = Join-Path $RawDir 'company_tickers.json'
  Guard 'lookup' $q
  if (-not (Test-Path -LiteralPath $tickers)) {
    $code = Get-Url $url $tickers
    if ($code -ne 200) {
      Write-Trace 'lookup' $q $url $code '' 0 $false
      No-Data $code $url
    }
    Write-Trace 'lookup' $q $url 200 'raw/company_tickers.json' (Get-Item -LiteralPath $tickers).Length $false
  } else {
    Write-Trace 'lookup' $q $url 200 'raw/company_tickers.json' (Get-Item -LiteralPath $tickers).Length $true
  }
  $script:File = $tickers
  $text = [IO.File]::ReadAllText($tickers, $Utf8)
  $exact = New-Object Collections.ArrayList
  $near = New-Object Collections.ArrayList
  foreach ($m in [regex]::Matches($text, '"cik_str":(\d+),"ticker":"([^"]*)","title":"([^"]*)"')) {
    $row = "$($m.Groups[1].Value)`t$($m.Groups[2].Value)`t$($m.Groups[3].Value)"
    if ($m.Groups[2].Value -ieq $q) { [void]$exact.Add($row) }
    elseif ($near.Count -lt 10 -and $m.Groups[3].Value.ToUpperInvariant().Contains($q.ToUpperInvariant())) { [void]$near.Add($row) }
  }
  $rows = if ($exact.Count) { $exact } else { $near }
  if ($rows.Count) {
    Write-Output "cik`tticker`tname"
    $rows | ForEach-Object { Write-Output $_ }
  } else {
    Write-Output "no match for `"$q`" among SEC-registered tickers. It may not be listed in the US."
  }
  Footer
}

function Cmd-Concept {
  Cik-Arg (Arg 0)
  $tag = Arg 1
  $period = if (Arg 2) { Arg 2 } else { 'annual' }
  if ($tag -cnotmatch '^[a-z0-9-]+/[A-Za-z0-9_]+$') { Die 'concept takes a tag like us-gaap/GrossProfit' }
  switch ($period) {
    'annual' { $forms = '^(10-K|20-F|40-F)(/A)?$'; $lo = 350; $hi = 380; $keep = 8 }
    'quarterly' { $forms = '^10-Q(/A)?$'; $lo = 80; $hi = 100; $keep = 12 }
    default { Die 'period must be annual or quarterly' }
  }
  Fetch 'concept' "$script:Cik10 $tag $period" "https://data.sec.gov/api/xbrl/companyconcept/CIK$script:Cik10/$tag.json" 'json'
  $json = [IO.File]::ReadAllText($script:File, $Utf8) | ConvertFrom-Json
  Write-Output "company: $($json.entityName)"
  Write-Output "label: $($json.label)"
  $best = @{}
  foreach ($u in $json.units.PSObject.Properties) {
    foreach ($e in @($u.Value)) {
      $form = [string]$e.form
      if ($form -cnotmatch $forms) { continue }
      if ($period -eq 'annual' -and [string]$e.fp -cne 'FY') { continue }
      $start = [string]$e.start
      $end = [string]$e.end
      if ($start) {
        $span = ([datetime]$end - [datetime]$start).Days
        if ($span -lt $lo -or $span -gt $hi) { continue }
      }
      $key = "$start|$end|$($u.Name)"
      $filed = [string]$e.filed
      if (-not $best.ContainsKey($key) -or [string]::CompareOrdinal($filed, $best[$key].filed) -ge 0) {
        $shown = if ($start) { $start } else { '-' }
        $best[$key] = @{ filed = $filed; row = "$end`t$shown`t$($e.val)`t$($u.Name)`t$form`t$filed`t$($e.accn)" }
      }
    }
  }
  Write-Output "period_end`tperiod_start`tvalue`tunit`tform`tfiled`taccession"
  $best.Values | ForEach-Object { $_.row } | Sort-Object | Select-Object -Last $keep | ForEach-Object { Write-Output $_ }
  Footer
}

function Column([string]$Text, [string]$Name) {
  $m = [regex]::Match($Text, '"' + $Name + '":\[([^\]]*)\]')
  if (-not $m.Success) { return @() }
  return @([regex]::Matches($m.Groups[1].Value, '"([^"]*)"') | ForEach-Object { $_.Groups[1].Value })
}

function Cmd-Filings {
  Cik-Arg (Arg 0)
  $form = Arg 1
  $count = if (Arg 2) { Arg 2 } else { '5' }
  if ($form -cnotmatch '^[A-Za-z0-9 /-]{0,12}$') { Die 'form looks wrong; try 10-K, 10-Q, 8-K, 4' }
  if ($count -cnotmatch '^[0-9]{1,2}$' -or [int]$count -lt 1) { Die 'count must be 1-20' }
  $n = [Math]::Min([int]$count, 20)
  $label = if ($form) { $form } else { 'any' }
  Fetch 'filings' "$script:Cik10 $label $count" "https://data.sec.gov/submissions/CIK$script:Cik10.json" 'json'
  $text = [IO.File]::ReadAllText($script:File, $Utf8)
  $dates = Column $text 'filingDate'
  $forms = Column $text 'form'
  $reports = Column $text 'reportDate'
  $accns = Column $text 'accessionNumber'
  $docs = Column $text 'primaryDocument'
  Write-Output "filed`tform`treport_date`turl"
  $seen = 0
  for ($i = 0; $i -lt $forms.Count -and $seen -lt $n; $i++) {
    if ($form -and $forms[$i] -cne $form) { continue }
    $seen++
    $a = $accns[$i] -replace '-', ''
    Write-Output "$($dates[$i])`t$($forms[$i])`t$($reports[$i])`thttps://www.sec.gov/Archives/edgar/data/$script:CikInt/$a/$($docs[$i])"
  }
  Footer
}

function Cmd-Read {
  $url = Arg 0
  if ($url -cnotmatch '^https://(www|data)\.sec\.gov/[A-Za-z0-9._/~-]+$') { Die 'read only opens www.sec.gov and data.sec.gov documents' }
  Fetch 'read' $url $url 'htm'
  $textFile = "$script:File.txt"
  $s = [IO.File]::ReadAllText($script:File)
  $s = [regex]::Replace($s, '[\r\n]+', ' ')
  $s = [regex]::Replace($s, '(?s)<ix:header>.*</ix:header>', ' ')
  $s = [regex]::Replace($s, '</(div|p|tr|table|li|title|h[1-6])>', '$0' + "`n")
  $s = [regex]::Replace($s, '<br[^>]*>', "`n")
  $s = [regex]::Replace($s, '<[^>]*>', ' ')
  $s = [Net.WebUtility]::HtmlDecode($s)
  $lines = @($s -split "`n" | ForEach-Object { ([regex]::Replace($_, '\s+', ' ')).Trim() } | Where-Object { $_ })
  [IO.File]::WriteAllLines($textFile, [string[]]$lines, $Utf8)
  Write-Output "text: $textFile ($($lines.Count) lines)"
  Write-Output 'sections (line number: heading):'
  $shown = 0
  for ($i = 0; $i -lt $lines.Count -and $shown -lt 60; $i++) {
    if ($lines[$i] -match '(?i)^(part +[ivx]+|item +[0-9]+[abc]?[.: ])') {
      $shown++
      $head = $lines[$i].Substring(0, [Math]::Min(100, $lines[$i].Length))
      Write-Output "$($i + 1):$head"
    }
  }
  Write-Output "read a section with: Get-Content -Encoding UTF8 `"$textFile`" | Select-Object -Skip (START-1) -First COUNT"
  Footer
}

function Cmd-Note {
  $tool = Arg 0
  $body = Arg 1
  if ($tool -cnotmatch '^[a-z_-]{1,30}$') { Die 'note takes a tool name such as web_search' }
  if (-not $body) { Die 'note takes a short description' }
  $body = ($body -replace '["\\]', '') -replace '[\r\n\t]', ' '
  if ($body.Length -gt 200) { $body = $body.Substring(0, 200) }
  [IO.File]::AppendAllText($Trace, "{`"ts`":`"$(Now-Utc)`",`"tool`":`"$tool`",`"target`":`"$body`",`"note`":true}`n", $Utf8)
  Write-Output 'noted'
}

switch ($Cmd) {
  'lookup' { Cmd-Lookup }
  'concept' { Cmd-Concept }
  'filings' { Cmd-Filings }
  'read' { Cmd-Read }
  'note' { Cmd-Note }
  default { Die "unknown command: $Cmd" }
}
