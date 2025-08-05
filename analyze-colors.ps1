# Analyze original icon to find exact blue color
Add-Type -AssemblyName System.Drawing

$original = [System.Drawing.Bitmap]::FromFile("icon-backup.png")

Write-Host "Analyzing icon colors..." -ForegroundColor Yellow

# Sample some pixels from the blue background area (center of circle)
$centerX = $original.Width / 2
$centerY = $original.Height / 2

for ($x = [int]($centerX - 10); $x -le [int]($centerX + 10); $x += 5) {
    for ($y = [int]($centerY - 10); $y -le [int]($centerY + 10); $y += 5) {
        if ($x -ge 0 -and $x -lt $original.Width -and $y -ge 0 -and $y -lt $original.Height) {
            $pixel = $original.GetPixel($x, $y)
            if ($pixel.B -gt 200) {  # Likely blue pixel
                Write-Host "Blue pixel at ($x,$y): R=$($pixel.R) G=$($pixel.G) B=$($pixel.B) A=$($pixel.A) Hex=#$($pixel.R.ToString('X2'))$($pixel.G.ToString('X2'))$($pixel.B.ToString('X2'))" -ForegroundColor Cyan
            }
        }
    }
}

$original.Dispose()
Write-Host "Analysis complete!" -ForegroundColor Green
