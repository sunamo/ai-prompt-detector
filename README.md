# SpecStory AutoSave + AI Copilot Prompt Detection

Extension for VS Code that automatically detects AI prompts from SpecStory conversation exports and displays them in an Activity Bar view with quality verification notifications.

## Features

- **Functional Architecture**: Built with React-like hooks pattern for better modularity
- **Activity Bar Integration**: Shows recent AI prompts in dedicated sidebar view
- **Real-time Detection**: Monitors `.specstory/history/` folders for new conversation exports
- **Quality Notifications**: Smart contextual messages for AI-generated code verification
- **Czech Timezone Logging**: All logs use Czech time (UTC+2) for local debugging

## Architecture

### Hooks System
- `useWebview()` - Activity bar webview management
- `useStatusBar()` - Status bar updates and display
- `usePrompts()` - Prompt loading and processing
- `useLogging()` - Output channel and file logging

### Utils Modules
- `logging.ts` - Centralized logging with Czech timezone
- `statusBar.ts` - Status bar update functions
- `promptProcessing.ts` - SpecStory file parsing and prompt extraction
- `htmlGenerator.ts` - Webview HTML generation
- `fileValidation.ts` - SpecStory file format validation
- `timeUtils.ts` - Timestamp parsing from filenames

### State Management
- `state.ts` - Global extension state interface and object

## Version 1.1.66

✅ Converted from class-based to functional architecture  
✅ Modularized hooks into separate files  
✅ Centralized utility functions  
✅ Maintained all original functionality (244 prompts detection)  
✅ Activity bar integration working  
✅ Czech timezone logging preserved  

## Configuration

```json
{
  "specstory-autosave.debugLogging": false,
  "specstory-autosave.maxPrompts": 50,
  "specstory-autosave.customMessage": "Check AI suggestions carefully!"
}
```

## Usage

1. Open workspace with `.specstory/history/` folder
2. View "Recent AI Prompts" in Activity Bar
3. Extension automatically detects new SpecStory exports
4. Click refresh button to reload prompts manually

## Development

```bash
pnpm install
.\install.ps1  # Build, commit, package and install
```

MIT
