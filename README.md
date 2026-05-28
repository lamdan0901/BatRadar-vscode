# BatRadar — AI Usage Monitor for VS Code

> Monitor Claude and Codex AI usage in real-time from your VS Code status bar. Ported from the [BatRadar](https://github.com/ZenithHawking/BatRadar) desktop app.

![VS Code](https://img.shields.io/badge/VS_Code-1.85+-007ACC?logo=visual-studio-code)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

- **Status bar usage** — live session and weekly usage percentages with color coding
- **Multi-provider** — Claude Code (OAuth or API key) + Codex (OAuth)
- **Rich detail panel** — click the status bar to open a webview with per-provider usage bars, Sonnet/Opus breakdowns, extra credit spend, and reset countdowns
- **Threshold alerts** — VS Code notifications at warning (80%) and critical (95%) thresholds
- **Auto-polling** — background polling with configurable interval (default 30s), rate-limit safe with exponential backoff
- **Zero config** — reads existing Claude and Codex credential files automatically

---

## Screenshots

| Status Bar | Detail Panel |
|:---:|:---:|
| ![Status Bar](images/status-bar.png) | ![Detail Panel](images/detail-panel.png) |

---

## Getting Started

1. Install the extension from the VS Code Marketplace (or install the `.vsix` file)
2. Ensure you're logged in to Claude Code (`claude login`) or Codex (`codex`)
3. Usage data appears in the status bar automatically

---

## Supported Providers

| Provider | Auth method | How to connect |
|---|---|---|
| **Claude Code** | OAuth (auto) | Run `claude login` in terminal |
| **Claude Code** | API Key | Stored in `%APPDATA%/batradar/apikey.enc` |
| **Codex** | OAuth (auto) | Run `codex` once to authenticate |

BatRadar reads credentials directly from the files Claude Code and Codex create on your machine — no re-login required.

---

## Usage Metrics

**Claude Code**
- Session usage (5-hour window)
- Weekly usage (7-day window)
- Weekly Sonnet / Opus breakdowns
- Extra usage credit spend

**Codex**
- Session usage (primary window)
- Weekly usage (secondary window)
- Credit balance

---

## Commands

| Command | Description |
|---|---|
| `BatRadar: Refresh Now` | Force an immediate usage poll |
| `BatRadar: Show Details` | Open the detailed usage panel |
| `BatRadar: Open Settings` | Open BatRadar configuration |

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `batradar.pollInterval` | `30` | Polling interval in seconds |
| `batradar.alertThreshold` | `0.8` | Usage ratio to trigger warning (0–1) |
| `batradar.criticalThreshold` | `0.95` | Usage ratio to trigger critical alert (0–1) |
| `batradar.enabledProviders` | `["claude", "codex"]` | List of providers to monitor |

---

## Privacy

- All data stays on your machine
- No analytics or telemetry
- Credentials are only read from disk and sent to the respective provider APIs (Anthropic, OpenAI)

---

## License

MIT
