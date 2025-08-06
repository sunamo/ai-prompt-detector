# Create new AI chat icon - larger chat bubble with transparent star in center
Add-Type -AssemblyName System.Drawing

# Create 128x128 bitmap with transparent background
$size = 128
$icon = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($icon)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

# Colors for the icon
$chatBubbleColor = [System.Drawing.Color]::FromArgb(255, 0, 122, 204)  # VS Code blue #007ACC
$aiSparkleColor = [System.Drawing.Color]::FromArgb(255, 255, 215, 0)   # Gold for AI sparkle outline
$outlineColor = [System.Drawing.Color]::FromArgb(255, 37, 37, 38)      # VS Code dark #252526

# Create brushes and pens
$chatBrush = New-Object System.Drawing.SolidBrush($chatBubbleColor)
$outlinePen = New-Object System.Drawing.Pen($outlineColor, 3)
$borderPen = New-Object System.Drawing.Pen($chatBubbleColor, 4)  # Blue border pen
$starOutlinePen = New-Object System.Drawing.Pen($aiSparkleColor, 3)  # Gold outline for star

# Draw circular border around entire icon
$borderMargin = 8
$borderSize = $size - (2 * $borderMargin)
$borderRect = New-Object System.Drawing.Rectangle($borderMargin, $borderMargin, $borderSize, $borderSize)
$graphics.DrawEllipse($borderPen, $borderRect)

# Main chat bubble - larger rounded rectangle perfectly centered in icon
$bubbleWidth = 85  # Increased size
$bubbleHeight = 60  # Increased size
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

# AI indicator - transparent star with gold outline in center of bubble
$starCenterX = $bubbleX + ($bubbleWidth / 2)
$starCenterY = $bubbleY + ($bubbleHeight / 2)
$outerRadius = 18  # Larger star
$innerRadius = 7

# Draw star using lines (since polygon has issues)
# 5-pointed star coordinates
$angles = @(0, 72, 144, 216, 288)  # 5 points, 72 degrees apart

# Draw star outline with lines
for ($i = 0; $i -lt 5; $i++) {
    $angle1 = [Math]::PI * $angles[$i] / 180.0 - [Math]::PI / 2
    $angle2 = [Math]::PI * $angles[($i + 2) % 5] / 180.0 - [Math]::PI / 2
    
    $x1 = $starCenterX + $outerRadius * [Math]::Cos($angle1)
    $y1 = $starCenterY + $outerRadius * [Math]::Sin($angle1)
    $x2 = $starCenterX + $outerRadius * [Math]::Cos($angle2)
    $y2 = $starCenterY + $outerRadius * [Math]::Sin($angle2)
    
    $graphics.DrawLine($starOutlinePen, [int]$x1, [int]$y1, [int]$x2, [int]$y2)
}

# Cleanup
$graphics.Dispose()
$chatBrush.Dispose()
$outlinePen.Dispose()
$borderPen.Dispose()
$starOutlinePen.Dispose()
$bubblePath.Dispose()

# Save the icon
$icon.Save("icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$icon.Dispose()

Write-Host "✅ New AI chat icon created!" -ForegroundColor Green
Write-Host "   • Blue circular border around entire icon" -ForegroundColor Cyan
Write-Host "   • Larger chat bubble perfectly centered" -ForegroundColor Cyan
Write-Host "   • Transparent star with gold outline in center" -ForegroundColor Cyan  
Write-Host "   • Clean minimalist design" -ForegroundColor Cyan
Write-Host "   • Transparent background" -ForegroundColor Cyan
