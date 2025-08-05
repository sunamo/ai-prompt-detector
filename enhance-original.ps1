# Simply enhance the existing icon with better contrast for activity bar
Add-Type -AssemblyName System.Drawing

# Load original icon
$original = [System.Drawing.Image]::FromFile("icon-backup.png")

# Create new image same size
$enhanced = New-Object System.Drawing.Bitmap($original.Width, $original.Height)
$g = [System.Drawing.Graphics]::FromImage($enhanced)

# Add dark background for contrast in activity bar
$darkBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(40, 40, 40))
$g.FillRectangle($darkBrush, 0, 0, $original.Width, $original.Height)

# Draw original icon on top with slight brightness boost
$colorMatrix = New-Object System.Drawing.Imaging.ColorMatrix
$colorMatrix.Matrix00 = 1.3  # Boost red
$colorMatrix.Matrix11 = 1.3  # Boost green  
$colorMatrix.Matrix22 = 1.3  # Boost blue
$colorMatrix.Matrix33 = 1.0  # Keep alpha
$colorMatrix.Matrix44 = 1.0

$attributes = New-Object System.Drawing.Imaging.ImageAttributes
$attributes.SetColorMatrix($colorMatrix)

$g.DrawImage($original, [System.Drawing.Rectangle]::new(0, 0, $original.Width, $original.Height), 0, 0, $original.Width, $original.Height, [System.Drawing.GraphicsUnit]::Pixel, $attributes)

# Save over original
$enhanced.Save("icon.png", [System.Drawing.Imaging.ImageFormat]::Png)

# Cleanup
$g.Dispose()
$enhanced.Dispose()
$original.Dispose()
$darkBrush.Dispose()
$attributes.Dispose()

Write-Host "✅ Original icon enhanced with better contrast!" -ForegroundColor Green
