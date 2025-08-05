# SpecStory AutoSave

VS Code extension pro automatické ukládání souborů a správu příběhů.

## Funkce

- Automatické ukládání souborů v definovaných intervalech
- Konfigurovatelné vzory souborů pro ukládání
- Jednoduché ovládání pomocí příkazů
- Podpora pro .md, .txt, .json a další formáty

## Použití

1. Nainstalujte rozšíření
2. Otevřete Command Palette (`Ctrl+Shift+P`)
3. Spusťte příkaz `SpecStory: Enable AutoSave`

## Konfigurace

Rozšíření lze konfigurovat přes VS Code Settings:

- `specstory-autosave.enabled`: Povolit automatické ukládání
- `specstory-autosave.interval`: Interval ukládání v milisekundách
- `specstory-autosave.filePatterns`: Vzory souborů pro automatické ukládání

## Příkazy

- `SpecStory: Enable AutoSave`: Zapnout automatické ukládání
- `SpecStory: Disable AutoSave`: Vypnout automatické ukládání  
- `SpecStory: Configure AutoSave`: Otevřít nastavení

## Vývoj

Projekt používá pnpm jako package manager.

```bash
# Instalace závislostí
pnpm install

# Kompilace
pnpm run compile

# Sledování změn
pnpm run watch

# Spuštění testů
pnpm run test
```

## Licence

MIT
