# Just boost brightness/contrast of original icon, keep original shape
Add-Type -AssemblyName System.Drawing

# Load original
$original = [System.Drawing.Image]::FromFile("icon-backup.png")

# Create new image same size
$enhanced = New-Object System.Drawing.Bitmap($original.Width, $original.Height)
$g = [System.Drawing.Graphics]::FromImage($enhanced)

# Set high quality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

# Just boost brightness and contrast, no background
$colorMatrix = New-Object System.Drawing.Imaging.ColorMatrix
$colorMatrix.Matrix00 = 2.0  # Much higher red boost
$colorMatrix.Matrix11 = 2.0  # Much higher green boost
$colorMatrix.Matrix22 = 2.0  # Much higher blue boost  
$colorMatrix.Matrix33 = 1.0  # Keep alpha unchanged
$colorMatrix.Matrix40 = 0.3  # Higher brightness boost
$colorMatrix.Matrix41 = 0.3  
$colorMatrix.Matrix42 = 0.3
$colorMatrix.Matrix44 = 1.0

$attributes = New-Object System.Drawing.Imaging.ImageAttributes
$attributes.SetColorMatrix($colorMatrix)

# Draw original with enhancement, preserving transparency
$g.DrawImage($original, [System.Drawing.Rectangle]::new(0, 0, $original.Width, $original.Height), 0, 0, $original.Width, $original.Height, [System.Drawing.GraphicsUnit]::Pixel, $attributes)

# Save enhanced version
$enhanced.Save("icon.png", [System.Drawing.Imaging.ImageFormat]::Png)

# Cleanup
$g.Dispose()
$enhanced.Dispose() 
$original.Dispose()
$attributes.Dispose()

Write-Host "✅ Icon brightness/contrast enhanced while keeping original shape!" -ForegroundColor Green
