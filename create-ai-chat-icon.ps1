# Create new AI chat icon - single large chat bubble with AI indicators
Add-Type -AssemblyName System.Drawing

# Create 128x128 bitmap with transparent background
$size = 128
$icon = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($icon)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

# Colors for the icon
$chatBubbleColor = [System.Drawing.Color]::FromArgb(255, 0, 122, 204)  # VS Code blue #007ACC
$aiSparkleColor = [System.Drawing.Color]::FromArgb(255, 255, 215, 0)   # Gold for AI sparkle
$outlineColor = [System.Drawing.Color]::FromArgb(255, 37, 37, 38)      # VS Code dark #252526

# Create brushes and pens
$chatBrush = New-Object System.Drawing.SolidBrush($chatBubbleColor)
$sparkleBrush = New-Object System.Drawing.SolidBrush($aiSparkleColor)
$outlinePen = New-Object System.Drawing.Pen($outlineColor, 3)
$borderPen = New-Object System.Drawing.Pen($chatBubbleColor, 4)  # Blue border pen

# Draw circular border around entire icon
$borderMargin = 8
$borderSize = $size - (2 * $borderMargin)
$borderRect = New-Object System.Drawing.Rectangle($borderMargin, $borderMargin, $borderSize, $borderSize)
$graphics.DrawEllipse($borderPen, $borderRect)

# Main chat bubble - large rounded rectangle perfectly centered in icon
$bubbleWidth = 70
$bubbleHeight = 50
$bubbleX = ($size - $bubbleWidth) / 2
$bubbleY = ($size - $bubbleHeight) / 2  # Perfect center vertically
$bubbleRect = New-Object System.Drawing.Rectangle($bubbleX, $bubbleY, $bubbleWidth, $bubbleHeight)
$bubbleCorner = 15
$bubblePath = New-Object System.Drawing.Drawing2D.GraphicsPath
$bubblePath.AddArc($bubbleRect.X, $bubbleRect.Y, $bubbleCorner, $bubbleCorner, 180, 90)
$bubblePath.AddArc($bubbleRect.Right - $bubbleCorner, $bubbleRect.Y, $bubbleCorner, $bubbleCorner, 270, 90)
$bubblePath.AddArc($bubbleRect.Right - $bubbleCorner, $bubbleRect.Bottom - $bubbleCorner, $bubbleCorner, $bubbleCorner, 0, 90)
$bubblePath.AddArc($bubbleRect.X, $bubbleRect.Bottom - $bubbleCorner, $bubbleCorner, $bubbleCorner, 90, 90)
$bubblePath.CloseFigure()

# Draw chat bubble (without tail - just clean rounded rectangle)
$graphics.FillPath($chatBrush, $bubblePath)
$graphics.DrawPath($outlinePen, $bubblePath)

# AI indicator - three dots perfectly centered in bubble
$dotSize = 4
$dotY = $bubbleY + ($bubbleHeight / 2) - ($dotSize / 2)  # Perfect vertical center
$dotSpacing = 8
$totalDotsWidth = ($dotSize * 3) + ($dotSpacing * 2)  # Total width of all 3 dots with spacing
$dotStartX = $bubbleX + ($bubbleWidth - $totalDotsWidth) / 2  # Perfect horizontal center
$graphics.FillEllipse($sparkleBrush, $dotStartX, $dotY, $dotSize, $dotSize)
$graphics.FillEllipse($sparkleBrush, $dotStartX + $dotSize + $dotSpacing, $dotY, $dotSize, $dotSize) 
$graphics.FillEllipse($sparkleBrush, $dotStartX + ($dotSize + $dotSpacing) * 2, $dotY, $dotSize, $dotSize)

# AI sparkle effects - 6 stars around the centered bubble
$sparkleSize = 6
$sparklePen = New-Object System.Drawing.Pen($aiSparkleColor, 2)

# Top right sparkle
$graphics.FillEllipse($sparkleBrush, 90, 25, $sparkleSize, $sparkleSize)
$graphics.DrawLine($sparklePen, 93, 20, 93, 35)
$graphics.DrawLine($sparklePen, 85, 28, 100, 28)

# Bottom left sparkle  
$graphics.FillEllipse($sparkleBrush, 20, 95, $sparkleSize, $sparkleSize)
$graphics.DrawLine($sparklePen, 23, 90, 23, 105)
$graphics.DrawLine($sparklePen, 15, 98, 30, 98)

# Top center sparkle
$graphics.FillEllipse($sparkleBrush, 60, 18, $sparkleSize, $sparkleSize)
$graphics.DrawLine($sparklePen, 63, 13, 63, 28)
$graphics.DrawLine($sparklePen, 55, 21, 70, 21)

# Right center sparkle
$graphics.FillEllipse($sparkleBrush, 100, 60, $sparkleSize, $sparkleSize)
$graphics.DrawLine($sparklePen, 103, 55, 103, 70)
$graphics.DrawLine($sparklePen, 95, 63, 110, 63)

# Left center sparkle
$graphics.FillEllipse($sparkleBrush, 15, 60, $sparkleSize, $sparkleSize)
$graphics.DrawLine($sparklePen, 18, 55, 18, 70)
$graphics.DrawLine($sparklePen, 10, 63, 25, 63)

# Top left small sparkle
$graphics.FillEllipse($sparkleBrush, 30, 20, 3, 3)

# Bottom right small sparkle
$graphics.FillEllipse($sparkleBrush, 95, 100, 3, 3)

# Bottom center small sparkle
$graphics.FillEllipse($sparkleBrush, 64, 105, 3, 3)

# Cleanup
$graphics.Dispose()
$chatBrush.Dispose()
$sparkleBrush.Dispose()
$outlinePen.Dispose()
$sparklePen.Dispose()
$borderPen.Dispose()

# Save the icon
$icon.Save("icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$icon.Dispose()

Write-Host "✅ New AI chat icon created!" -ForegroundColor Green
Write-Host "   • Blue circular border around entire icon" -ForegroundColor Cyan
Write-Host "   • Chat bubble perfectly centered" -ForegroundColor Cyan
Write-Host "   • AI typing dots inside bubble" -ForegroundColor Cyan  
Write-Host "   • 8 gold sparkle effects for AI indication" -ForegroundColor Cyan
Write-Host "   • Transparent background" -ForegroundColor Cyan
