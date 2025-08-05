# Create new AI chat icon - chat bubble with transparent 5-pointed star
Add-Type -AssemblyName System.Drawing

# Create 128x128 bitmap with transparent background
$size = 128
$icon = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($icon)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

# Colors for the icon
$chatBubbleColor = [System.Drawing.Color]::FromArgb(255, 0, 122, 204)  # VS Code blue #007ACC
$outlineColor = [System.Drawing.Color]::FromArgb(255, 37, 37, 38)      # VS Code dark #252526

# Create brushes and pens
$chatBrush = New-Object System.Drawing.SolidBrush($chatBubbleColor)
$transparentBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Transparent)
$outlinePen = New-Object System.Drawing.Pen($outlineColor, 3)
$borderPen = New-Object System.Drawing.Pen($chatBubbleColor, 4)

# Draw circular border around entire icon
$borderMargin = 8
$borderSize = $size - (2 * $borderMargin)
$borderRect = New-Object System.Drawing.Rectangle($borderMargin, $borderMargin, $borderSize, $borderSize)
$graphics.DrawEllipse($borderPen, $borderRect)

# Main chat bubble - large rounded rectangle perfectly centered in icon
$bubbleWidth = 70
$bubbleHeight = 50
$bubbleX = ($size - $bubbleWidth) / 2
$bubbleY = ($size - $bubbleHeight) / 2
$bubbleRect = New-Object System.Drawing.Rectangle($bubbleX, $bubbleY, $bubbleWidth, $bubbleHeight)
$bubbleCorner = 15
$bubblePath = New-Object System.Drawing.Drawing2D.GraphicsPath
$bubblePath.AddArc($bubbleRect.X, $bubbleRect.Y, $bubbleCorner, $bubbleCorner, 180, 90)
$bubblePath.AddArc($bubbleRect.Right - $bubbleCorner, $bubbleRect.Y, $bubbleCorner, $bubbleCorner, 270, 90)
$bubblePath.AddArc($bubbleRect.Right - $bubbleCorner, $bubbleRect.Bottom - $bubbleCorner, $bubbleCorner, $bubbleCorner, 0, 90)
$bubblePath.AddArc($bubbleRect.X, $bubbleRect.Bottom - $bubbleCorner, $bubbleCorner, $bubbleCorner, 90, 90)
$bubblePath.CloseFigure()

# Draw chat bubble
$graphics.FillPath($chatBrush, $bubblePath)
$graphics.DrawPath($outlinePen, $bubblePath)

# Create complete 5-pointed star shape as one transparent cut-out
$graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
$starCenterX = $bubbleX + ($bubbleWidth / 2)
$starCenterY = $bubbleY + ($bubbleHeight / 2) + 3  # Move star down by 3 pixels for perfect centering
$outerRadius = 25  # Much larger star to fill most of the bubble
$innerRadius = 10  # Proportionally larger inner radius

# Create complete star path
$starPath = New-Object System.Drawing.Drawing2D.GraphicsPath

# Add all 10 points (5 outer, 5 inner) to create complete star
for ($i = 0; $i -lt 10; $i++) {
    $angle = [Math]::PI * $i / 5.0 - [Math]::PI / 2
    if ($i % 2 -eq 0) {
        # Outer point
        $radius = $outerRadius
    } else {
        # Inner point
        $radius = $innerRadius
    }
    
    $x = $starCenterX + $radius * [Math]::Cos($angle)
    $y = $starCenterY + $radius * [Math]::Sin($angle)
    
    if ($i -eq 0) {
        $starPath.StartFigure()
        $starPath.AddLine([int]$x, [int]$y, [int]$x, [int]$y)
    } else {
        $starPath.AddLine([int]$x, [int]$y, [int]$x, [int]$y)
    }
}
$starPath.CloseFigure()

# Fill entire star with transparent color to create complete cut-out
$graphics.FillPath($transparentBrush, $starPath)
$starPath.Dispose()

# Cleanup
$graphics.Dispose()
$chatBrush.Dispose()
$transparentBrush.Dispose()
$outlinePen.Dispose()
$borderPen.Dispose()

# Save the icon
$icon.Save("icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$icon.Dispose()

Write-Host "✅ New AI chat icon created!" -ForegroundColor Green
Write-Host "   • Blue circular border around entire icon" -ForegroundColor Cyan
Write-Host "   • Chat bubble perfectly centered" -ForegroundColor Cyan
Write-Host "   • Transparent 5-pointed star in center" -ForegroundColor Cyan  
Write-Host "   • Clean minimalist design" -ForegroundColor Cyan
Write-Host "   • Transparent background" -ForegroundColor Cyan
