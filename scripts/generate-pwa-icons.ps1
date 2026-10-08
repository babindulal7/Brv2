Add-Type -AssemblyName System.Drawing

$sourcePath = Join-Path $PSScriptRoot "..\public\icons\512.png"
if (-not (Test-Path $sourcePath)) {
    Write-Error "Source icon not found at $sourcePath"
    exit 1
}

# Load source image into memory stream so file lock is released
$bytes = [System.IO.File]::ReadAllBytes($sourcePath)
$ms = New-Object System.IO.MemoryStream(,$bytes)
$sourceImg = [System.Drawing.Image]::FromStream($ms)

function Resize-Icon([int]$targetWidth, [int]$targetHeight, [string]$destPath) {
    $bmp = New-Object System.Drawing.Bitmap $targetWidth, $targetHeight
    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.DrawImage($sourceImg, 0, 0, $targetWidth, $targetHeight)
    
    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bmp.Dispose()
    Write-Host "Generated $destPath ($targetWidth x $targetHeight)"
}

function Generate-Maskable-Icon([int]$size, [string]$destPath, [string]$bgColorHex) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    
    $color = [System.Drawing.ColorTranslator]::FromHtml($bgColorHex)
    $graphics.Clear($color)
    
    # Safe zone: center 80% of canvas (10% margin on each side)
    $innerSize = [int]($size * 0.8)
    $offset = [int](($size - $innerSize) / 2)
    $graphics.DrawImage($sourceImg, $offset, $offset, $innerSize, $innerSize)
    
    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bmp.Dispose()
    Write-Host "Generated maskable icon $destPath with safe zone ($size x $size, color $bgColorHex)"
}

$iconsDir = Join-Path $PSScriptRoot "..\public\icons"

Resize-Icon 192 192 (Join-Path $iconsDir "192.png")
Resize-Icon 512 512 (Join-Path $iconsDir "512.png")
Resize-Icon 96 96 (Join-Path $iconsDir "scan-96.png")
Generate-Maskable-Icon 512 (Join-Path $iconsDir "maskable-512.png") "#FDEFDC"

$sourceImg.Dispose()
$ms.Dispose()
Write-Host "PWA icons generated successfully."
