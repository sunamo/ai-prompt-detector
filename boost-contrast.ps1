# Add dark outline around original icon to make details visible
Add-Type -AssemblyName System.Drawing

# Load original
$original = [System.Drawing.Image]::FromFile("icon-backup.png")

# Create new image same size
$enhanced = New-Object System.Drawing.Bitmap($original.Width, $original.Height)
$g = [System.Drawing.Graphics]::FromImage($enhanced)

# Set high quality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

# First draw original icon multiple times with slight offsets to create dark outline
$darkBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(200, 0, 0, 0))
for ($x = -2; $x -le 2; $x++) {
    for ($y = -2; $y -le 2; $y++) {
        if ($x -ne 0 -or $y -ne 0) {
            # Create dark version of original for outline
            $darkMatrix = New-Object System.Drawing.Imaging.ColorMatrix
            $darkMatrix.Matrix00 = 0.1  # Very dark red
            $darkMatrix.Matrix11 = 0.1  # Very dark green  
            $darkMatrix.Matrix22 = 0.1  # Very dark blue
            $darkMatrix.Matrix33 = 1.0  # Keep alpha
            $darkMatrix.Matrix44 = 1.0
            
            $darkAttributes = New-Object System.Drawing.Imaging.ImageAttributes
            $darkAttributes.SetColorMatrix($darkMatrix)
            
            $g.DrawImage($original, [System.Drawing.Rectangle]::new($x, $y, $original.Width, $original.Height), 0, 0, $original.Width, $original.Height, [System.Drawing.GraphicsUnit]::Pixel, $darkAttributes)
            $darkAttributes.Dispose()
        }
    }
}

# Now draw original on top with enhanced brightness to make details pop
$brightMatrix = New-Object System.Drawing.Imaging.ColorMatrix
$brightMatrix.Matrix00 = 1.8  # Bright red
$brightMatrix.Matrix11 = 1.8  # Bright green
$brightMatrix.Matrix22 = 1.8  # Bright blue  
$brightMatrix.Matrix33 = 1.0  # Keep alpha
$brightMatrix.Matrix40 = 0.2  # Add brightness
$brightMatrix.Matrix41 = 0.2  
$brightMatrix.Matrix42 = 0.2
$brightMatrix.Matrix44 = 1.0

$attributes = New-Object System.Drawing.Imaging.ImageAttributes
$attributes.SetColorMatrix($brightMatrix)

# Draw original with enhancement, preserving transparency
$g.DrawImage($original, [System.Drawing.Rectangle]::new(0, 0, $original.Width, $original.Height), 0, 0, $original.Width, $original.Height, [System.Drawing.GraphicsUnit]::Pixel, $attributes)

# Save enhanced version
$enhanced.Save("icon.png", [System.Drawing.Imaging.ImageFormat]::Png)

# Cleanup
$g.Dispose()
$enhanced.Dispose() 
$original.Dispose()
$attributes.Dispose()

Write-Host "✅ Icon enhanced with dark outline to make details visible!" -ForegroundColor Green
