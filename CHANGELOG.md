# Changelog

## 0.1.0

Initial release.

### Features
- Status bar display with live session/weekly usage percentages
- Color-coded usage indicators (green → yellow → orange → red)
- Rich tooltip with per-window breakdown and reset countdown
- Detail webview panel with progress bars, Sonnet/Opus breakdowns, and extra credit spend
- Configurable polling interval, alert/critical thresholds, and enabled providers
- Threshold-based VS Code notifications (warning at 80%, critical at 95%)
- Automatic credential reading from existing Claude Code and Codex config files
- Rate-limit safe polling with exponential backoff
- Commands: Refresh Now, Show Details, Open Settings
