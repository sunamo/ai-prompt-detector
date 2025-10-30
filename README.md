# AI Copilot Prompt Detector

![Version](https://img.shields.io/badge/version-1.1.434-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

**Okamžitá detekce AI promptů s notifikacemi pro ověření kvality a automatickou integrací se SpecStory.**

## 🎯 Co Rozšíření Dělá?

AI Copilot Prompt Detector monitoruje vaše interakce s GitHub Copilot Chatem a poskytuje okamžitou zpětnou vazbu pro ověření kvality AI kódu. Pokaždé když odešlete prompt do Copilotu:

1. **Detekuje prompt okamžitě** - klávesnice (Enter, Ctrl+Enter) i myš (omezená detekce)
2. **Zobrazí notifikaci** připomínající vám zkontrolovat odpověď AI
3. **Zobrazí všechny prompty** v panelu Activity Bar s real-time čítačem
4. **Čte SpecStory exporty** ze složek `.specstory/history/` pro kontextovou analýzu
5. **Generuje chytré notifikace** na základě obsahu konverzace (debugging, UI práce, tvorba API, atd.)

## 🚀 Hlavní Funkce

### Real-Time Detekce Promptů
- **Detekce Klávesnice**: Zachytává standardní GitHub Copilot zkratky
  - `Enter` - standardní odeslání promptu
  - `Ctrl+Enter` - rychlé odeslání promptu
- **Detekce Myši**: Omezená (architektonické omezení VS Code, viz Technické poznámky)
- **Čítač ve Status Baru**: Zobrazuje celkový počet odeslaných promptů (např. "AI Prompts: 42")
- **Ikona v Activity Baru**: Vlastní ikona v levém postranním panelu pro rychlý přístup

### Chytré Notifikace
- **Kontextové Zprávy**: Různé notifikace pro debugging, UI práci, změny databáze, tvorbu API
- **Vlastní Zprávy**: Nastavte si vlastní notifikační zprávu v nastavení
- **Quality Checklist**: Každá notifikace obsahuje specifické body k ověření

### Integrace se SpecStory
- **Automatické Čtení**: Čte existující SpecStory exporty ze složek `.specstory/history/`
- **Žádné Generování Souborů**: NEVYTVÁŘÍ ani neupravuje SpecStory soubory (to dělá SpecStory)
- **Analýza Konverzace**: Analyzuje nedávné konverzace pro lepší pochopení kontextu
- **Generování Chytrých Zpráv**: Generuje relevantní notifikace na základě typu konverzace

### Panel Activity Bar
- **Seznam Posledních Promptů**: Zobrazuje posledních N promptů (konfigurovatelné, výchozí: 50)
- **Chronologické Pořadí**: SpecStory prompty v původním pořadí, nové runtime prompty na konci
- **Označitelný Text**: Snadné kopírování předchozích promptů
- **Real-Time Aktualizace**: Obnovuje se automaticky po každé detekci

## 📦 Instalace

### Z VSIX (Vývoj)
```bash
# Instalace do VS Code Insiders
code-insiders --install-extension ai-prompt-detector-1.1.434.vsix --force

# Nebo použijte automatický instalátor
./install.ps1 "Initial installation"
```

### Z Marketplace (Připravuje se)
Vyhledejte "AI Copilot Prompt Detector" na VS Code Extensions marketplace.

## ⚙️ Konfigurace

Otevřete VS Code Settings (`Ctrl+,`) a vyhledejte "AI Copilot Prompt Detector":

```json
{
  // Maximální počet promptů k zobrazení v Activity Bar
  "ai-prompt-detector.maxPrompts": 50,

  // Povolit debug logování do C:/temp/ai-prompt-detector-logs/
  "ai-prompt-detector.enableDebugLogs": false,

  // Vlastní notifikační zpráva (ponechte prázdné pro chytré zprávy)
  "ai-prompt-detector.customMessage": ""
}
```

### Příklady Chytrých Notifikací

Když je `customMessage` prázdné, rozšíření generuje kontextové zprávy:

- **Debugging**: "AI just debugged! Check: • Fixed actual root cause? • Introduced new bugs? • Test edge cases"
- **HTML/CSS**: "AI worked with UI! Check: • Responsive design • Accessibility • Cross-browser compatibility"
- **Database**: "AI modified database! Check: • Data integrity • Performance impact • Backup strategy"
- **API**: "AI created API! Check: • Error handling • Security • API documentation"

## 🎮 Použití

1. **Nainstalujte rozšíření** do VS Code Insiders
2. **Otevřete GitHub Copilot Chat** (Ctrl+Shift+I nebo ikona v sidebaru)
3. **Odešlete prompt** pomocí Enter nebo Ctrl+Enter
4. **Uvidíte notifikaci** s checklistem pro ověření kvality
5. **Zobrazte historii promptů** v Activity Bar (ikona v levém sidebaru)

### Klávesové Zkratky

Rozšíření detekuje standardní GitHub Copilot klávesové zkratky:

| Klávesová Kombinace | Akce | Popis |
|---------------------|------|-------|
| `Enter` | Odeslat prompt + detekovat | Standardní odeslání promptu |
| `Ctrl+Enter` | Odeslat prompt + detekovat | Rychlé odeslání promptu |

**Obě klávesové kombinace fungují perfektně bez remapování nebo interference s Copilotem.**

> **Poznámka**: `Ctrl+Shift+Enter` (předání do nového okna) a jiné kombinace nejsou detekovány, protože neprovádějí přímé odeslání promptu.

## 📊 UI Komponenty

### Status Bar (Dole)
```
[✅] AI Prompts: 42 | v1.1.434
```
- **Ikona**: ✅ = proposed API povoleno, ⚠️ = omezený režim
- **Čítač**: Celkový počet detekovaných promptů v aktuální session
- **Verze**: Aktuální verze rozšíření
- **Bez Červeného Pozadí**: Barva ikony indikuje stav (policy: čitelné, ne alarmující)

### Panel Activity Bar (Levý Sidebar)
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Recent Prompts (50)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#1: Refactor UserService class (ze SpecStory)
#2: Add error handling to API endpoints (ze SpecStory)
...
#48: Fix the authentication bug (právě odesláno - nejnovější)
```

## 🔧 Technické Detaily

### Architektura
- **Extension Host**: Node.js kontext kde běží rozšíření
- **Renderer Process**: Electron UI kde běží Copilot Chat
- **Keybinding Hook**: Zachytává klávesové příkazy před tím než se dostanou do Copilotu
- **Async Processing**: Zachytí prompt, zpracuje ho, pak přepošle do Copilotu

### Detekce Klávesnice (Funguje Perfektně)
- Keybindings registrované v `package.json` s `inChatInput || chatInputFocus` kontextem
- Příkazy se vykonávají asynchronně bez blokování Copilotu
- Podporované zkratky: `Enter` a `Ctrl+Enter` (standardní GitHub Copilot zkratky)
- Nedetekované zkratky: `Ctrl+Shift+Enter` (pouze předání do nového okna, ne odeslání)

### Detekce Myši (Omezená)
- **Architektonické Omezení**: Kliknutí myší probíhají v Renderer Process, neviditelné pro Extension Host
- **Žádné Command Events**: Kliknutí myší negenerují příkazy které přecházejí hranice procesů
- **Schránka Zakázána**: Uživatelská policy explicitně zakazuje použití schránky pro detekci
- **28 Neúspěšných Pokusů**: Zdokumentováno v CLAUDE.md (Widget access, IPC monitoring, DevTools Protocol, atd.)
- **Současné Řešení**: 25ms polling detekuje zmizení textu, zobrazí notifikaci okamžitě

### Integrace se SpecStory
- **Read-Only**: Pouze čte existující `.specstory/history/*.md` soubory
- **Formát Souboru**: `YYYY-MM-DD_HH-mmZ-conversation-description.md`
- **Analýza Obsahu**: Parsuje user/assistant zprávy pro kontext
- **Žádné Vytváření Souborů**: Nikdy nevytváří, neupravuje ani nemaže SpecStory soubory

## 📁 Struktura Projektu

```
ai-prompt-detector/
├── src/
│   ├── extension.ts              # Hlavní vstupní bod rozšíření
│   ├── activityBarProvider.ts    # Activity Bar webview provider
│   ├── chatHelpers.ts            # Pomocníci pro zachycení textu z chat inputu
│   ├── logger.ts                 # Debug logování do C:/temp/ai-prompt-detector-logs/
│   ├── specstoryReader.ts        # Čtečka SpecStory exportních souborů
│   └── state.ts                  # Správa globálního stavu
├── i18n/
│   └── en.json                   # Všechny uživatelsky viditelné texty (i18n ready)
├── out/                          # Zkompilovaný JavaScript
├── package.json                  # Extension manifest
├── tsconfig.json                 # TypeScript konfigurace
├── install.ps1                   # Build + deploy skript
└── README.md                     # Tento soubor
```

## 🛠️ Vývoj

### Prerekvizity
- **Node.js** 20.x nebo vyšší
- **pnpm** 10.20.0 (package manager)
- **TypeScript** 5.4.5 nebo vyšší
- **VS Code Insiders** (pro testování)
- **git** (verzovací systém)
- **vsce** (VS Code Extension manager)

### Build a Instalace

**DŮLEŽITÉ**: Používejte POUZE `install.ps1` pro buildování a deployment. Nikdy nespouštějte `pnpm run compile` samostatně.

```powershell
# Kompletní workflow (build + commit + push + package + install + restart)
./install.ps1 "Váš popis commitu"
```

Skript automaticky:
1. Inkrementuje PATCH verzi (1.1.433 → 1.1.434)
2. Zkompiluje TypeScript do JavaScriptu
3. Commitne změny s verzí jako message
4. Pushne na GitHub
5. Vytvoří VSIX balíček
6. Nainstaluje do VS Code Insiders
7. Restartuje VS Code Insiders

### Správa Verzí
- **PATCH** (1.1.x): Automatická inkrementace pomocí `install.ps1`
- **MINOR** (1.x.0): Pouze když uživatel řekne "compile for marketplace"
- **MAJOR** (x.0.0): Pouze s explicitním příkazem
- **Nikdy ručně neměňte** verzi v `package.json`!

### Development Příkazy
```bash
# Instalace závislostí (pouze když je potřeba)
pnpm install

# Watch režim (NEDOPORUČENO, místo toho použijte install.ps1)
pnpm run watch

# Kompilace (NEDOPORUČENO, místo toho použijte install.ps1)
pnpm run compile
```

## 🐛 Debug Logování

Povolte detailní logování pro řešení problémů:

```json
{
  "ai-prompt-detector.enableDebugLogs": true
}
```

Logy se zapisují do: `C:/temp/ai-prompt-detector-logs/extension-YYYYMMDD-HHMMSS.log`

## 📝 Známá Omezení

### Detekce Kliknutí Myší
- **Omezená Podpora**: Kliknutí myší v Copilot Chatu jsou architektonicky neviditelné pro rozšíření
- **Proč**: VS Code rozšíření běží v Extension Host (Node.js), Chat UI běží v Renderer Process (Electron)
- **Workaround**: 25ms polling detekuje zmizení textu (minimální zpoždění, okamžitá notifikace)
- **Klávesnice Funguje Perfektně**: Všechny Enter varianty plně podporovány bez jakýchkoliv omezení

### Vyžaduje Instalaci SpecStory
Toto rozšíření se integruje s [SpecStory](https://marketplace.visualstudio.com/items?itemName=SpecStory.specstory-vscode) pro analýzu konverzací. SpecStory musí být nainstalováno samostatně.

## 🤝 Přispívání

Toto je osobní vývojový nástroj. Pro návrhy nebo hlášení bugů prosím otevřete issue na GitHubu.

## 📄 Licence

MIT License - Viz LICENSE soubor pro detaily

## 🔗 Odkazy

- **GitHub Repository**: [sunamo/ai-prompt-detector](https://github.com/sunamo/ai-prompt-detector2)
- **SpecStory Extension**: [SpecStory na Marketplace](https://marketplace.visualstudio.com/items?itemName=SpecStory.specstory-vscode)
- **Issue Tracker**: [GitHub Issues](https://github.com/sunamo/ai-prompt-detector2/issues)

## 📊 Historie Verzí

Viz [commit-descriptions.log](./commit-descriptions.log) pro detailní historii verzí.

---

**Vytvořeno s ❤️ pro zajištění kvality AI-asistovaného vývoje**
