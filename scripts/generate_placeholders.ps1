$ErrorActionPreference = 'Stop'

$SHEET_ID = '1PBMNNYHliomlgeNsvZgiccrfOWpIJbYPb9EMFtSAgdw'

$CATEGORIES = @(
  # NOTE: Keep this script ASCII-only to avoid mojibake parser errors on some Windows PowerShell setups.
  @{ key = 'pokemon';    label = 'Pokemon';    sheetEnc = '%E3%83%9D%E3%82%B1%E3%83%A2%E3%83%B3';       dir = 'pokemon' },
  @{ key = 'onepiece';   label = 'ONE PIECE';  sheetEnc = '%E3%83%AF%E3%83%B3%E3%83%94%E3%83%BC%E3%82%B9'; dir = 'onepiece' },
  @{ key = 'dragonball'; label = 'DragonBall'; sheetEnc = '%E3%83%89%E3%83%A9%E3%82%B4%E3%83%B3%E3%83%9C%E3%83%BC%E3%83%AB'; dir = 'dragonball' }
)

$ROOT = Resolve-Path (Join-Path $PSScriptRoot '..')
$IMAGES = Join-Path $ROOT 'images'

$EXTS = @('.webp', '.png', '.jpg', '.jpeg', '.svg')

function Safe-FileBase([string]$s) {
  if ($null -eq $s) { return '' }
  return ($s.Trim() -replace '/', '-' -replace '\s+', '')
}

function Get-GvizJson([string]$sheetName) {
  $url = "https://docs.google.com/spreadsheets/d/$SHEET_ID/gviz/tq?tqx=out:json&sheet=$sheetName"
  $t = (Invoke-WebRequest -UseBasicParsing $url).Content
  $s = $t.IndexOf('{')
  $e = $t.LastIndexOf('}')
  if ($s -lt 0 -or $e -lt 0) { throw "GViz parse error (sheet=$sheetName)" }
  $j = $t.Substring($s, $e - $s + 1)
  return ($j | ConvertFrom-Json)
}

function Pick-CellText($cell) {
  if ($null -eq $cell) { return '' }
  if ($null -ne $cell.f -and -not [string]::IsNullOrWhiteSpace([string]$cell.f)) { return ([string]$cell.f).Trim() }
  if ($null -eq $cell.v) { return '' }
  return ([string]$cell.v).Trim()
}

function Get-ModelsFromSheet($gviz) {
  $rows = @($gviz.table.rows)
  $models = New-Object System.Collections.Generic.List[string]
  $re = '^[A-Za-z0-9][A-Za-z0-9-]*$'

  foreach ($r in $rows) {
    $c = $r.c
    if ($null -eq $c -or $c.Count -lt 5) { continue }

    $model = Pick-CellText $c[2]

    if (-not [string]::IsNullOrWhiteSpace($model) -and $model -match $re) {
      $models.Add($model)
    }
  }

  return ($models | Sort-Object -Unique)
}

function Make-Svg([string]$categoryLabel, [string]$model) {
  $safeModel = $model -replace '&', '&amp;' -replace '<', '&lt;' -replace '>', '&gt;'
  $safeCat = $categoryLabel -replace '&', '&amp;' -replace '<', '&lt;' -replace '>', '&gt;'
@"
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b1020"/>
      <stop offset="1" stop-color="#1b1b3a"/>
    </linearGradient>
    <radialGradient id="glow" cx="25%" cy="15%" r="80%">
      <stop offset="0" stop-color="#7c3aed" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#22c55e" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="600" height="600" fill="url(#bg)"/>
  <rect width="600" height="600" fill="url(#glow)"/>
  <rect x="36" y="36" width="528" height="528" rx="56" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.10)"/>

  <text x="300" y="285" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="78" font-weight="800" fill="rgba(255,255,255,0.92)">$safeModel</text>
  <text x="300" y="340" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="26" font-weight="600" fill="rgba(255,255,255,0.70)">$safeCat</text>

  <text x="300" y="520" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="16" fill="rgba(255,255,255,0.55)">Placeholder</text>
</svg>
"@
}

$created = 0
$skipped = 0

foreach ($cat in $CATEGORIES) {
  $dir = Join-Path $IMAGES $cat.dir
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }

  Write-Host "Fetching sheet:" $cat.key
  $gviz = Get-GvizJson $cat.sheetEnc
  $models = Get-ModelsFromSheet $gviz

  foreach ($m in $models) {
    $base = Safe-FileBase $m
    if ([string]::IsNullOrWhiteSpace($base)) { continue }

    $exists = $false
    foreach ($ext in $EXTS) {
      if (Test-Path (Join-Path $dir ($base + $ext))) { $exists = $true; break }
    }
    if ($exists) { $skipped++; continue }

    $svg = Make-Svg $cat.label $m
    $dest = Join-Path $dir ($base + '.svg')
    [System.IO.File]::WriteAllText($dest, $svg, (New-Object System.Text.UTF8Encoding($false)))
    $created++
  }
}

Write-Host "done. created=$created skipped(existing)=$skipped"
