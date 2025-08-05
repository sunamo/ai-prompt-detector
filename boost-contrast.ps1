# Make transparent background with vibrant colors only for symbols
Add-Type -AssemblyName System.Drawing

# Load original
$original = [System.Drawing.Image]::FromFile("icon-backup.png")

# Create new image same size with transparent background
$enhanced = New-Object System.Drawing.Bitmap($original.Width, $original.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($enhanced)

# Set high quality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

# Clear with transparent background
$g.Clear([System.Drawing.Color]::Transparent)

# Process pixel by pixel to make blue background transparent
for ($x = 0; $x -lt $original.Width; $x++) {
    for ($y = 0; $y -lt $original.Height; $y++) {
        $pixel = $original.GetPixel($x, $y)
        
        # Check if pixel is blue background (with tolerance for similar blues)
        $isBlueBackground = ($pixel.B -gt 200) -and ($pixel.R -lt 50) -and ($pixel.G -gt 100) -and ($pixel.G -lt 200)
        
        if ($isBlueBackground) {
            # Make blue background pixels transparent
            $enhanced.SetPixel($x, $y, [System.Drawing.Color]::Transparent)
        } else {
            # Keep other pixels (symbols) but boost saturation
            if ($pixel.A -gt 0) {  # Only process non-transparent pixels
                $newR = [Math]::Min(255, [int]($pixel.R * 1.6))
                $newG = [Math]::Min(255, [int]($pixel.G * 1.6))
                $newB = [Math]::Min(255, [int]($pixel.B * 1.6))
                $newPixel = [System.Drawing.Color]::FromArgb($pixel.A, $newR, $newG, $newB)
                $enhanced.SetPixel($x, $y, $newPixel)
            } else {
                $enhanced.SetPixel($x, $y, $pixel)
            }
        }
    }
}

# Save enhanced version
$enhanced.Save("icon.png", [System.Drawing.Imaging.ImageFormat]::Png)

# Cleanup
$g.Dispose()
$original.Dispose()

Write-Host "✅ Icon created with #00a3ff background transparent and vibrant symbols!" -ForegroundColor Green
