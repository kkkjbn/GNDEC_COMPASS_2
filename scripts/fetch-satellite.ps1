# Fetch a public satellite basemap for the GNDEC campus.
# Esri World Imagery via the public ArcGIS REST export endpoint.
#
# The export service expands a bbox to match the requested pixel aspect ratio,
# which silently shifts the image. Requesting a pixel size whose aspect exactly
# matches the geographic bbox keeps the returned extent identical to the
# campus bounds, so footprints can be drawn straight on top.
#
# Attribution: Esri, Maxar, Earthstar Geographics, and the GIS User Community.
# Run: powershell -ExecutionPolicy Bypass -File scripts/fetch-satellite.ps1
param(
  [string]$Out = "public/img/map/campus-satellite.jpg",
  [double]$MinLon = 75.8572,
  [double]$MaxLon = 75.8658,
  [double]$MinLat = 30.8548,
  [double]$MaxLat = 30.8642,
  [int]$Cols = 2,
  [int]$Rows = 2,
  [int]$TileW = 1640,
  [int]$TileH = 1792
)

Add-Type -AssemblyName System.Drawing

$cols = $Cols
$rows = $Rows
$tileW = $TileW
$tileH = $TileH
$totalW = $cols * $tileW
$totalH = $rows * $tileH
$lonStep = ($MaxLon - $MinLon) / $cols
$latStep = ($MaxLat - $MinLat) / $rows

$canvas = New-Object System.Drawing.Bitmap($totalW, $totalH)
$graphics = [System.Drawing.Graphics]::FromImage($canvas)
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

for ($row = 0; $row -lt $rows; $row++) {
  for ($col = 0; $col -lt $cols; $col++) {
    $lon1 = $minLon + $col * $lonStep
    $lon2 = $lon1 + $lonStep
    $lat2 = $maxLat - $row * $latStep
    $lat1 = $lat2 - $latStep
    $bbox = "0:{0},{1},{2},{3}" -f $lon1, $lat1, $lon2, $lat2
    # ArcGIS needs 15 significant digits to keep the extent from drifting.
    $bbox = ("{0},{1},{2},{3}" -f $lon1.ToString('R'), $lat1.ToString('R'), $lon2.ToString('R'), $lat2.ToString('R'))
    $url = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=$bbox&bboxSR=4326&imageSR=4326&size=$tileW,$tileH&format=jpg&f=image"
    $tmp = Join-Path $env:TEMP "gndec-sat-$row-$col.jpg"
    $ok = $false
    for ($try = 1; $try -le 5; $try++) {
      try {
        Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing -TimeoutSec 180
        $ok = $true
        break
      } catch {
        Start-Sleep -Seconds (2 * $try)
      }
    }
    if (-not $ok) { throw "Failed to fetch tile $row,$col" }
    $img = [System.Drawing.Image]::FromFile($tmp)
    $graphics.DrawImage($img, ($col * $tileW), ($row * $tileH), $tileW, $tileH)
    $img.Dispose()
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  }
  Write-Host "Row $row / $rows done"
}

$dir = Split-Path -Parent $Out
if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters(1)
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 86L)
$canvas.Save((Resolve-Path ".").Path + "\" + $Out, $codec, $params)

$graphics.Dispose()
$canvas.Dispose()
Write-Host "Saved $Out ($totalW x $totalH)"
