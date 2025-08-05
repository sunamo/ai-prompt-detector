# Make specific color #007af5 transparent
Add-Type -AssemblyName System.Drawing

$original = [System.Drawing.Bitmap]::FromFile("icon-backup.png")
$enhanced = New-Object System.Drawing.Bitmap($original.Width, $original.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

# Process each pixel
for ($x = 0; $x -lt $original.Width; $x++) {
    for ($y = 0; $y -lt $original.Height; $y++) {
        $pixel = $original.GetPixel($x, $y)
        
        # Check if pixel is exactly #007af5 (RGB: 0, 122, 245) or very close
        $isTargetBlue = ($pixel.R -le 5) -and ($pixel.G -ge 120 -and $pixel.G -le 125) -and ($pixel.B -ge 240 -and $pixel.B -le 250)
        
        if ($isTargetBlue) {
            # Make this specific blue transparent
            $enhanced.SetPixel($x, $y, [System.Drawing.Color]::Transparent)
        } else {
            # Keep all other pixels unchanged
            $enhanced.SetPixel($x, $y, $pixel)
        }
    }
}

# Save result
$enhanced.Save("icon.png", [System.Drawing.Imaging.ImageFormat]::Png)

# Cleanup
$enhanced.Dispose()
$original.Dispose()

Write-Host "✅ Color #007af5 made transparent!" -ForegroundColor Green
