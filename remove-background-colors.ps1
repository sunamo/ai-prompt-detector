# Make specific colors transparent: #a9c0ff, #2e2e2e and #0066cc
Add-Type -AssemblyName System.Drawing

$original = [System.Drawing.Bitmap]::FromFile("icon-backup.png")
$enhanced = New-Object System.Drawing.Bitmap($original.Width, $original.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

# Process each pixel
for ($x = 0; $x -lt $original.Width; $x++) {
    for ($y = 0; $y -lt $original.Height; $y++) {
        $pixel = $original.GetPixel($x, $y)
        
        # Check if pixel is #a9c0ff (RGB: 169, 192, 255) - circle interior in dark mode
        $isLightBlue = ($pixel.R -ge 165 -and $pixel.R -le 173) -and ($pixel.G -ge 188 -and $pixel.G -le 196) -and ($pixel.B -ge 250 -and $pixel.B -le 255)
        
        # Check if pixel is #2e2e2e (RGB: 46, 46, 46) - outer background
        $isDarkGray = ($pixel.R -ge 42 -and $pixel.R -le 50) -and ($pixel.G -ge 42 -and $pixel.G -le 50) -and ($pixel.B -ge 42 -and $pixel.B -le 50)
        
        # Check if pixel is #0066cc (RGB: 0, 102, 204) - circle interior in light mode
        $isDarkBlue = ($pixel.R -ge 0 -and $pixel.R -le 4) -and ($pixel.G -ge 98 -and $pixel.G -le 106) -and ($pixel.B -ge 200 -and $pixel.B -le 208)
        
        if ($isLightBlue -or $isDarkGray -or $isDarkBlue) {
            # Make these colors transparent
            $enhanced.SetPixel($x, $y, [System.Drawing.Color]::Transparent)
        } else {
            # Keep all other pixels (symbols and details)
            $enhanced.SetPixel($x, $y, $pixel)
        }
    }
}

# Save result
$enhanced.Save("icon.png", [System.Drawing.Imaging.ImageFormat]::Png)

# Cleanup
$enhanced.Dispose()
$original.Dispose()

Write-Host "✅ Colors #a9c0ff, #2e2e2e and #0066cc made transparent!" -ForegroundColor Green
