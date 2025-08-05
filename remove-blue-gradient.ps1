# Make all blue gradient shades transparent
Add-Type -AssemblyName System.Drawing

$original = [System.Drawing.Bitmap]::FromFile("icon-backup.png")
$enhanced = New-Object System.Drawing.Bitmap($original.Width, $original.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

# Process each pixel
for ($x = 0; $x -lt $original.Width; $x++) {
    for ($y = 0; $y -lt $original.Height; $y++) {
        $pixel = $original.GetPixel($x, $y)
        
        # Check if pixel is part of blue background circle (not symbols)
        # Background is usually lighter blue, symbols are darker or have different patterns
        $isLightBlueBackground = ($pixel.B -gt 200) -and ($pixel.R -lt 100) -and ($pixel.G -gt 150) -and ($pixel.G -lt 250)
        
        # Calculate distance from center to determine if it's background circle
        $centerX = $original.Width / 2
        $centerY = $original.Height / 2
        $distance = [Math]::Sqrt([Math]::Pow($x - $centerX, 2) + [Math]::Pow($y - $centerY, 2))
        $isInCircleArea = $distance -lt ($original.Width * 0.45)  # Most of the circle but not edge details
        
        if ($isLightBlueBackground -and $isInCircleArea) {
            # Make light blue background transparent
            $enhanced.SetPixel($x, $y, [System.Drawing.Color]::Transparent)
        } else {
            # Keep all other pixels including blue symbol outlines
            if ($pixel.A -gt 0) {
                # Only slightly boost non-background pixels
                $newR = [Math]::Min(255, [int]($pixel.R * 1.2))
                $newG = [Math]::Min(255, [int]($pixel.G * 1.2))
                $newB = [Math]::Min(255, [int]($pixel.B * 1.2))
                $enhanced.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($pixel.A, $newR, $newG, $newB))
            } else {
                $enhanced.SetPixel($x, $y, $pixel)
            }
        }
    }
}

# Save result
$enhanced.Save("icon.png", [System.Drawing.Imaging.ImageFormat]::Png)

# Cleanup
$enhanced.Dispose()
$original.Dispose()

Write-Host "✅ Blue background removed while preserving symbol outlines!" -ForegroundColor Green
