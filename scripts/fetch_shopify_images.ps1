param(
  [ValidateSet('pokemon', 'onepiece', 'dragonball')]
  [string]$Category = 'pokemon',

  [string]$Codes = '',

  [int]$Limit = 0,

  # Base URL for Shopify products.json. Should include limit=250.
  [string]$ProductsJsonBase = 'https://japantcjshop.myshopify.com/products.json?limit=250',

  [switch]$SkipExisting,

  # If set, do not restrict by spreadsheet codes (downloads any code found in the store).
  [switch]$AllStoreCodes
)

$ErrorActionPreference = 'Stop'

try { Add-Type -AssemblyName System.Web | Out-Null } catch { }

$SHEET_ID = '1PBMNNYHliomlgeNsvZgiccrfOWpIJbYPb9EMFtSAgdw'
$SHEET_ENC = @{
  pokemon    = '%E3%83%9D%E3%82%B1%E3%83%A2%E3%83%B3'
  onepiece   = '%E3%83%AF%E3%83%B3%E3%83%94%E3%83%BC%E3%82%B9'
  dragonball = '%E3%83%89%E3%83%A9%E3%82%B4%E3%83%B3%E3%83%9C%E3%83%BC%E3%83%AB'
}

$ROOT = Resolve-Path (Join-Path $PSScriptRoot '..')
$IMAGES = Join-Path $ROOT 'images'
$OUTDIR = Join-Path $IMAGES $Category
if (-not (Test-Path $OUTDIR)) { New-Item -ItemType Directory -Path $OUTDIR | Out-Null }

$EXTS = @('.jpg', '.jpeg', '.png', '.webp')

function Safe-FileBase([string]$s) {
  if ($null -eq $s) { return '' }
  return ($s.Trim() -replace '/', '-' -replace '\s+', '')
}

function Normalize-Code([string]$s) {
  if ([string]::IsNullOrWhiteSpace($s)) { return '' }
  return ($s.ToUpperInvariant() -replace '[^A-Z0-9]', '')
}

function Parse-CodeFromTitle([string]$title) {
  if ([string]::IsNullOrWhiteSpace($title)) { return '' }
  $m = [regex]::Match($title, '\(([^)]+)\)')
  if ($m.Success) { return $m.Groups[1].Value.Trim() }
  $m = [regex]::Match($title, '\[([^\]]+)\]')
  if ($m.Success) { return $m.Groups[1].Value.Trim() }
  return ''
}

function Is-PokemonProduct([string]$title) {
  if ([string]::IsNullOrWhiteSpace($title)) { return $false }
  $t = $title.ToLowerInvariant()
  return $t.StartsWith('pokémon card game') -or $t.StartsWith('pokemon card game')
}

function Get-SheetCodeSet([string]$categoryKey) {
  $sheetEnc = $SHEET_ENC[$categoryKey]
  if ([string]::IsNullOrWhiteSpace($sheetEnc)) { throw "unknown category: $categoryKey" }
  $url = "https://docs.google.com/spreadsheets/d/$SHEET_ID/gviz/tq?tqx=out:json&sheet=$sheetEnc"
  Write-Host "Fetching sheet codes:" $categoryKey
  $t = (Invoke-WebRequest -UseBasicParsing $url).Content
  $s = $t.IndexOf('{')
  $e = $t.LastIndexOf('}')
  if ($s -lt 0 -or $e -lt 0) { throw "GViz parse error" }
  $j = $t.Substring($s, $e - $s + 1)
  $o = $j | ConvertFrom-Json

  $map = @{} # normalized -> raw(sheet) code
  $re = '^[A-Za-z0-9][A-Za-z0-9-]*$'
  foreach ($r in @($o.table.rows)) {
    $c = $r.c
    if ($null -eq $c -or $c.Count -lt 3) { continue }
    $cell = $c[2]
    $m = $cell.f
    if ([string]::IsNullOrWhiteSpace([string]$m)) { $m = $cell.v }
    $m = ([string]$m).Trim()
    if ($m -match $re) {
      $norm = Normalize-Code $m
      if (-not [string]::IsNullOrWhiteSpace($norm) -and -not $map.ContainsKey($norm)) {
        $map[$norm] = $m
      }
    }
  }
  return $map
}

function Join-UrlQuery([string]$baseUrl, [hashtable]$extra) {
  $uri = [System.Uri]$baseUrl
  $q = [System.Web.HttpUtility]::ParseQueryString($uri.Query)
  foreach ($k in $extra.Keys) { $q[$k] = [string]$extra[$k] }
  $builder = New-Object System.UriBuilder($uri)
  $builder.Query = $q.ToString()
  return $builder.Uri.AbsoluteUri
}

function Get-ProductsAllPages([string]$baseUrl) {
  $all = New-Object System.Collections.Generic.List[object]
  $page = 1
  $limit = 250

  while ($true) {
    $url = Join-UrlQuery $baseUrl @{ page = $page; limit = $limit }
    Write-Host "Fetching products.json page=$page"
    $obj = (Invoke-WebRequest -UseBasicParsing $url).Content | ConvertFrom-Json
    $products = @($obj.products)
    foreach ($p in $products) { $all.Add($p) }
    if ($products.Count -lt $limit) { break }
    $page++
    if ($page -gt 50) { break } # safety
  }

  return $all
}

function Pick-ImageSrc($images) {
  $imgs = @($images)
  foreach ($i in $imgs) {
    $src = $i.src
    if ($src -is [string]) {
      $low = $src.ToLowerInvariant()
      foreach ($ext in $EXTS) {
        if ($low.EndsWith($ext)) { return $src }
      }
    }
  }
  if ($imgs.Count -gt 0 -and ($imgs[0].src -is [string])) { return [string]$imgs[0].src }
  return ''
}

function Ensure-SystemDrawing() {
  try {
    Add-Type -AssemblyName System.Drawing | Out-Null
  } catch {
    throw "System.Drawing load failed. Try Windows PowerShell 5.1 (not Core) or install compatibility."
  }
}

function Convert-ToSquare600Png([string]$srcPath, [string]$destPngPath, [int]$size = 600) {
  Ensure-SystemDrawing
  $img = $null
  $resized = $null
  $g = $null
  $final = $null
  $g2 = $null
  try {
    $img = [System.Drawing.Image]::FromFile($srcPath)
    $w = [double]$img.Width
    $h = [double]$img.Height
    if ($w -le 0 -or $h -le 0) { throw "invalid image dims" }

    $scale = $size / [Math]::Min($w, $h)
    $nw = [int][Math]::Ceiling($w * $scale)
    $nh = [int][Math]::Ceiling($h * $scale)

    $resized = New-Object System.Drawing.Bitmap($nw, $nh)
    $g = [System.Drawing.Graphics]::FromImage($resized)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.DrawImage($img, 0, 0, $nw, $nh)

    $x = [int][Math]::Max(0, [Math]::Floor(($nw - $size) / 2))
    $y = [int][Math]::Max(0, [Math]::Floor(($nh - $size) / 2))

    $final = New-Object System.Drawing.Bitmap($size, $size)
    $g2 = [System.Drawing.Graphics]::FromImage($final)
    $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g2.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g2.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g2.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    $destRect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
    $srcRect = New-Object System.Drawing.Rectangle($x, $y, $size, $size)
    $g2.DrawImage($resized, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

    $final.Save($destPngPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    if ($g2) { $g2.Dispose() }
    if ($final) { $final.Dispose() }
    if ($g) { $g.Dispose() }
    if ($resized) { $resized.Dispose() }
    if ($img) { $img.Dispose() }
  }
}

$want = @()
if (-not [string]::IsNullOrWhiteSpace($Codes)) {
  $want = $Codes.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
}
$codeMap = $null # normalized -> raw code for filename
if (-not $AllStoreCodes) {
  $codeMap = @{}
  if ($want.Count -gt 0) {
    foreach ($c in $want) {
      $n = Normalize-Code $c
      if (-not [string]::IsNullOrWhiteSpace($n) -and -not $codeMap.ContainsKey($n)) {
        $codeMap[$n] = $c
      }
    }
  } else {
    $codeMap = Get-SheetCodeSet $Category
  }
}

$products = Get-ProductsAllPages $ProductsJsonBase
Write-Host "Total products:" $products.Count

$matched = New-Object System.Collections.Generic.List[object]
foreach ($p in $products) {
  $title = [string]($p.title)
  $code = Parse-CodeFromTitle $title
  if ([string]::IsNullOrWhiteSpace($code)) { continue }
  $norm = Normalize-Code $code
  if ($codeMap -ne $null -and -not $codeMap.ContainsKey($norm)) { continue }
  if ($codeMap -ne $null) { $code = [string]$codeMap[$norm] }

  $src = Pick-ImageSrc $p.images
  if ([string]::IsNullOrWhiteSpace($src)) { continue }

  $matched.Add([pscustomobject]@{ code = $code; title = $title; src = $src })
}

# Dedup by code
$seen = @{}
$dedup = New-Object System.Collections.Generic.List[object]
foreach ($m in $matched) {
  if ($seen.ContainsKey($m.code)) { continue }
  $seen[$m.code] = $true
  $dedup.Add($m)
}

if ($Limit -gt 0) {
  $dedup = $dedup | Select-Object -First $Limit
}

if ($dedup.Count -eq 0) {
  Write-Host "no matches"
  exit 0
}

Write-Host ("matched {0} items" -f $dedup.Count)

$tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ('kaitori-img-' + [System.Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmpDir | Out-Null

try {
  foreach ($m in $dedup) {
    $code = [string]$m.code
    $base = Safe-FileBase $code
    if ([string]::IsNullOrWhiteSpace($base)) { continue }

    $dest = Join-Path $OUTDIR ($base + '.png')
    if ($SkipExisting -and (Test-Path $dest)) {
      Write-Host "skip exists" $code
      continue
    }

    $rawName = [System.IO.Path]::GetFileName(([System.Uri]$m.src).AbsolutePath)
    if ([string]::IsNullOrWhiteSpace($rawName)) { $rawName = 'img' }
    $rawPath = Join-Path $tmpDir $rawName

    Invoke-WebRequest -UseBasicParsing $m.src -OutFile $rawPath
    Convert-ToSquare600Png $rawPath $dest 600

    # If placeholder exists, keep it but it will no longer be used (manifest prefers png).
    Write-Host "wrote" $code "<-" $m.src
  }
} finally {
  Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
}
