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

# Draw chat bubble (clean rounded rectangle)
$graphics.FillPath($chatBrush, $bubblePath)
$graphics.DrawPath($outlinePen, $bubblePath)

# AI indicator - classic 5-pointed star like Google Gemini
$starCenterX = $bubbleX + ($bubbleWidth / 2)
$starCenterY = $bubbleY + ($bubbleHeight / 2)
$outerRadius = 15
$innerRadius = 6

# Create 5-pointed star manually with correct coordinates
$starPoints = @(
    # Point 1 (top)
    [System.Drawing.Point]::new($starCenterX, $starCenterY - $outerRadius),
    [System.Drawing.Point]::new($starCenterX + $innerRadius * 0.6, $starCenterY - $innerRadius * 0.6),
    
    # Point 2 (top right)  
    [System.Drawing.Point]::new($starCenterX + $outerRadius * 0.95, $starCenterY - $outerRadius * 0.31),
    [System.Drawing.Point]::new($starCenterX + $innerRadius * 0.95, $starCenterY + $innerRadius * 0.31),
    
    # Point 3 (bottom right)
    [System.Drawing.Point]::new($starCenterX + $outerRadius * 0.59, $starCenterY + $outerRadius * 0.81),
    [System.Drawing.Point]::new($starCenterX - $innerRadius * 0.0, $starCenterY + $innerRadius * 1.0),
    
    # Point 4 (bottom left)
    [System.Drawing.Point]::new($starCenterX - $outerRadius * 0.59, $starCenterY + $outerRadius * 0.81),
    [System.Drawing.Point]::new($starCenterX - $innerRadius * 0.95, $starCenterY + $innerRadius * 0.31),
    
    # Point 5 (top left)
    [System.Drawing.Point]::new($starCenterX - $outerRadius * 0.95, $starCenterY - $outerRadius * 0.31),
    [System.Drawing.Point]::new($starCenterX - $innerRadius * 0.6, $starCenterY - $innerRadius * 0.6)
)

# Draw filled star
$graphics.FillPolygon($sparkleBrush, $starPoints)

# Cleanup
$graphics.Dispose()
$chatBrush.Dispose()
$sparkleBrush.Dispose()
$outlinePen.Dispose()
$borderPen.Dispose()

# Save the icon
$icon.Save("icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$icon.Dispose()

Write-Host "✅ New AI chat icon created!" -ForegroundColor Green
Write-Host "   • Blue circular border around entire icon" -ForegroundColor Cyan
Write-Host "   • Chat bubble perfectly centered" -ForegroundColor Cyan
Write-Host "   • Large gold star in center of bubble" -ForegroundColor Cyan  
Write-Host "   • Clean minimalist design" -ForegroundColor Cyan
Write-Host "   • Transparent background" -ForegroundColor Cyan
