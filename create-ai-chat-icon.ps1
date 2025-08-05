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

# Main chat bubble - large rounded rectangle
$bubbleRect = New-Object System.Drawing.Rectangle(20, 25, 80, 55)
$bubbleCorner = 15
$bubblePath = New-Object System.Drawing.Drawing2D.GraphicsPath
$bubblePath.AddArc($bubbleRect.X, $bubbleRect.Y, $bubbleCorner, $bubbleCorner, 180, 90)
$bubblePath.AddArc($bubbleRect.Right - $bubbleCorner, $bubbleRect.Y, $bubbleCorner, $bubbleCorner, 270, 90)
$bubblePath.AddArc($bubbleRect.Right - $bubbleCorner, $bubbleRect.Bottom - $bubbleCorner, $bubbleCorner, $bubbleCorner, 0, 90)
$bubblePath.AddArc($bubbleRect.X, $bubbleRect.Bottom - $bubbleCorner, $bubbleCorner, $bubbleCorner, 90, 90)
$bubblePath.CloseFigure()

# Chat bubble tail (small triangle pointing down-left)
$tailPoints = [System.Drawing.Point[]]@(
    [System.Drawing.Point]::new(35, 80),   # tip
    [System.Drawing.Point]::new(45, 68),   # right base
    [System.Drawing.Point]::new(55, 75)    # left base
)
$tailPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$tailPath.AddPolygon($tailPoints)

# Draw chat bubble
$graphics.FillPath($chatBrush, $bubblePath)
$graphics.DrawPath($outlinePen, $bubblePath)
$graphics.FillPath($chatBrush, $tailPath)
$graphics.DrawPath($outlinePen, $tailPath)

# AI indicator - three dots in bubble (like typing indicator)
$dotSize = 4
$dotY = 48
$graphics.FillEllipse($sparkleBrush, 35, $dotY, $dotSize, $dotSize)
$graphics.FillEllipse($sparkleBrush, 45, $dotY, $dotSize, $dotSize) 
$graphics.FillEllipse($sparkleBrush, 55, $dotY, $dotSize, $dotSize)

# AI sparkle effects - small stars around the bubble
$sparkleSize = 6
$sparklePen = New-Object System.Drawing.Pen($aiSparkleColor, 2)

# Top right sparkle
$graphics.FillEllipse($sparkleBrush, 85, 20, $sparkleSize, $sparkleSize)
$graphics.DrawLine($sparklePen, 88, 15, 88, 30)
$graphics.DrawLine($sparklePen, 80, 23, 95, 23)

# Bottom left sparkle  
$graphics.FillEllipse($sparkleBrush, 15, 90, $sparkleSize, $sparkleSize)
$graphics.DrawLine($sparklePen, 18, 85, 18, 100)
$graphics.DrawLine($sparklePen, 10, 93, 25, 93)

# Top left small sparkle
$graphics.FillEllipse($sparkleBrush, 25, 15, 3, 3)

# Bottom right small sparkle
$graphics.FillEllipse($sparkleBrush, 100, 100, 3, 3)

# Cleanup
$graphics.Dispose()
$chatBrush.Dispose()
$sparkleBrush.Dispose()
$outlinePen.Dispose()
$sparklePen.Dispose()

# Save the icon
$icon.Save("icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$icon.Dispose()

Write-Host "✅ New AI chat icon created!" -ForegroundColor Green
Write-Host "   • Single large chat bubble in VS Code blue" -ForegroundColor Cyan
Write-Host "   • AI typing dots inside bubble" -ForegroundColor Cyan  
Write-Host "   • Gold sparkle effects for AI indication" -ForegroundColor Cyan
Write-Host "   • Transparent background" -ForegroundColor Cyan
