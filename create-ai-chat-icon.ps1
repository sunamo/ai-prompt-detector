<#
.SYNOPSIS
    Generátor ikony pro AI Copilot Prompt Detector rozšíření.
    Vytváří 128x128 PNG ikonu s chat bubble a transparentní hvězdou pomocí .NET System.Drawing.

.DESCRIPTION
    Tento skript programaticky generuje ikonu rozšíření bez potřeby externích grafických nástrojů.
    Využívá .NET Framework System.Drawing knihovny pro vytvoření vektorové grafiky, která je
    následně rasterizována do PNG formátu s plnou podporou transparence (alpha kanál).
    
    Design ikony obsahuje následující prvky:
    1. Transparentní pozadí (128x128 pixelů)
    2. Modrý kruhový rámeček kolem celé ikony (#007ACC - oficiální VS Code modrá)
    3. Centrovaný chat bubble (zaoblený obdélník) ve stejné modré barvě
    4. Tmavý obrys chat bubble (#252526 - VS Code tmavá)
    5. Transparentní 5-cípá hvězda uprostřed (vyříznutá díra v chat bubble)
    
    Technické detaily implementace:
    - Anti-aliasing pro hladké hrany všech tvarů
    - GraphicsPath pro vytvoření komplexních tvarů (bubble, hvězda)
    - CompositingMode.SourceCopy pro vytvoření skutečné transparentní díry
    - Zachování 32-bit ARGB formátu pro plnou podporu průhlednosti
    - Matematický výpočet bodů hvězdy pomocí trigonometrických funkcí
    
    Design filosofie:
    - Minimalistický čistý vzhled odpovídající VS Code estetice
    - Chat bubble symbolizuje komunikaci s AI asistentem
    - Transparentní hvězda reprezentuje AI/inteligenci
    - Modrá barva zachovává konzistenci s VS Code brandingem
    
    Parametry grafiky:
    - Velikost ikony: 128x128 pixelů
    - Rámeček: 8px margin, 4px tloušťka
    - Chat bubble: 85x60 pixelů, zaoblení 15px
    - Hvězda: vnější radius 18px, vnitřní radius 7px
    - Outline: 3px tloušťka

.PARAMETER None
    Skript nemá žádné parametry. Všechny hodnoty jsou pevně dané pro konzistenci.

.EXAMPLE
    ./create-ai-chat-icon.ps1
    
    Vytvoří soubor icon.png v aktuálním adresáři.

.NOTES
    - Vyžaduje .NET Framework s System.Drawing assembly
    - Výstupní soubor je vždy icon.png v kořenovém adresáři
    - Přepíše existující icon.png bez varování
    - Ikona je optimalizována pro zobrazení ve VS Code Activity Bar
    - PNG formát zajišťuje kompatibilitu napříč platformami

.PREREQUISITES
    - Windows s .NET Framework (System.Drawing assembly)
    - PowerShell 5.0 nebo novější
    - Práva pro zápis do aktuálního adresáře

.OUTPUTS
    - icon.png: 128x128 PNG ikona s transparentním pozadím
    - Konzolový výstup s potvrzením vytvoření a popisem designu
#>
# Create new AI chat icon - larger chat bubble with transparent star in center
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
$outlinePen = New-Object System.Drawing.Pen($outlineColor, 3)
$borderPen = New-Object System.Drawing.Pen($chatBubbleColor, 4)  # Blue border pen

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

# AI indicator - punch a transparent 5-point star and draw gold outline
$starCenterX = $bubbleX + ($bubbleWidth / 2)
$starCenterY = $bubbleY + ($bubbleHeight / 2)
$outerRadius = 18
$innerRadius = 7

# Build star path (10 vertices alternating outer/inner)
$starPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$points = New-Object 'System.Drawing.PointF[]' 10
for ($i = 0; $i -lt 10; $i++) {
    $angle = (-90 + (36 * $i)) * [Math]::PI / 180.0
    $r = if ($i % 2 -eq 0) { $outerRadius } else { $innerRadius }
    $points[$i] = New-Object System.Drawing.PointF (
        [float]($starCenterX + $r * [Math]::Cos($angle)),
        [float]($starCenterY + $r * [Math]::Sin($angle))
    )
}
$starPath.AddPolygon($points)

# Punch transparency into bubble where star is
$prevMode = $graphics.CompositingMode
$graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
$transparentBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(0,0,0,0))
$graphics.FillPath($transparentBrush, $starPath)
$graphics.CompositingMode = $prevMode

# No outline: keep the entire star area fully transparent

# Cleanup
$graphics.Dispose()
$chatBrush.Dispose()
$outlinePen.Dispose()
$borderPen.Dispose()
$transparentBrush.Dispose()
$starPath.Dispose()
$bubblePath.Dispose()

# Save the icon
$icon.Save("icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$icon.Dispose()

Write-Host "✅ New AI chat icon created!" -ForegroundColor Green
Write-Host "   • Blue circular border around entire icon" -ForegroundColor Cyan
Write-Host "   • Larger chat bubble perfectly centered" -ForegroundColor Cyan
Write-Host "   • Fully transparent star in center" -ForegroundColor Cyan  
Write-Host "   • Clean minimalist design" -ForegroundColor Cyan
Write-Host "   • Transparent background" -ForegroundColor Cyan
