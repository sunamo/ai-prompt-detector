# Simple approach - make blue circle transparent using color key
Add-Type -AssemblyName System.Drawing

$original = [System.Drawing.Image]::FromFile("icon-backup.png")
$enhanced = New-Object System.Drawing.Bitmap($original.Width, $original.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($enhanced)

$g.Clear([System.Drawing.Color]::Transparent)

# Use MakeTransparent method to remove blue background
$bitmap = New-Object System.Drawing.Bitmap($original)
$bitmap.MakeTransparent([System.Drawing.Color]::FromArgb(0, 163, 255))  # #00a3ff

# Draw the result
$g.DrawImage($bitmap, 0, 0)

# Save
$enhanced.Save("icon.png", [System.Drawing.Imaging.ImageFormat]::Png)

# Cleanup
$g.Dispose()
$enhanced.Dispose()
$original.Dispose()
$bitmap.Dispose()

Write-Host "✅ Icon created using MakeTransparent method!" -ForegroundColor Green
