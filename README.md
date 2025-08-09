# SpecStory AutoSave

Minimal scaffold per instructions. Features:

- Logging (normal + debug) to `C:/temp/specstory-autosave-logs/extension.log`
- Validates log freshness (<=5 minutes) on activation
- Session datastore: prompt count + loaded markdown prompt history from `.specstory/history/*.md`
- Command: `SpecStory: Show Status`
- Increment prompt counter when a document inside `.specstory` changes (placeholder for real prompt events)

Configuration:
- `specstoryAutosave.debugLogging` (boolean) enable/disable debug level output

Build:
```
npm install
npm run compile
```

Use `install.ps1` (auto version bump + package + install) as supplied.
