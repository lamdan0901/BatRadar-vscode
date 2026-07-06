# BatRadar Extension Logic Sync Design

## Summary

Update the VS Code extension in `batradar-vscode` to match the current upstream BatRadar provider-management logic from `BatRadar` where that logic is relevant to the extension runtime. The sync is limited to provider polling, credential refresh, backoff, and provider status handling. Electron-only tray, window, and floating UI behaviors remain out of scope.

## Goals

- Port upstream OAuth refresh behavior for Claude and Codex into the extension.
- Make polling honor per-provider backoff instead of using a fixed minimum gap only.
- Distinguish `disconnected`, `expired`, and `error` provider states accurately.
- Keep the existing extension UI structure while improving the logic that feeds it.
- Preserve current provider parsing and credential file locations unless the upstream logic requires a change.

## Non-Goals

- Port Electron-specific BatRadar app behavior such as tray, dashboard windows, or floating overlays.
- Redesign the extension webview or status bar UI.
- Add new providers or speculative endpoint fallbacks that are not needed for parity.
- Re-architect the extension around a shared cross-repo core in this change.

## Recommended Approach

Use targeted logic parity rather than a broad rewrite.

The extension keeps its current structure:

- `src/providers/credentials.ts` owns credential discovery, reads, and token writes.
- `src/providers/claude.ts` and `src/providers/codex.ts` own remote API calls and response parsing.
- `src/polling.ts` remains the orchestration point for polling, retries, refresh attempts, and runtime provider state.

This keeps the change small while still importing the upstream behavior that matters.

## Architecture Changes

`PollingEngine` will stop deriving provider status from cache presence alone. Each provider will instead keep explicit runtime state:

- `status`
- `cache`
- `extraDelay`
- `lastPollAt`
- `lastRefreshAt`

`getProviderState()` will return the tracked status plus the cached usage payload. This lets the status bar and details panel show `expired` and `error` correctly even when old cached usage still exists.

## Credential Refresh

The extension will mirror upstream OAuth refresh behavior in an extension-native way.

Claude:

- Detect OAuth credentials from `.claude/.credentials.json` using the existing credential lookup rules.
- Refresh via `https://console.anthropic.com/v1/oauth/token` with the same public CLI client id used upstream.
- Update `accessToken`, optional `refreshToken`, and optional expiry metadata in the credentials file.

Codex:

- Detect refreshable credentials from `.codex/auth.json` using the existing credential lookup rules.
- Refresh via `https://auth.openai.com/oauth/token` with the same public CLI client id used upstream.
- Update `access_token`, optional `id_token`, optional `refresh_token`, and refresh bookkeeping fields in the auth file.

Write behavior:

- Token file updates must be atomic so the upstream CLIs never observe partially written JSON.
- Refresh attempts are rate-limited to one per provider per 5 minutes.

## Polling And Backoff Behavior

Per provider:

- The minimum gap is `30 seconds + extraDelay`.
- Successful fetches reset `extraDelay` to `0`, update cached usage, and set status to `connected`.
- Missing credentials set status to `disconnected`.
- `429` responses increase `extraDelay` using the upstream capped exponential backoff behavior and do not mark the provider `error`.
- Authentication expiry triggers one refresh attempt when the auth method supports it, then retries the poll once immediately.
- If refresh fails, or if the retry is still rejected for auth, status becomes `expired`.
- Non-auth failures become `error`.

Polling remains parallel across providers so one provider's delay or error does not block the other.

## Provider-Specific Error Classification

Claude:

- Continue treating `401` as `token_expired` and `429` as `rate_limited`.
- OAuth refresh is only attempted when Claude is using OAuth auth, not when a manual API key is configured.

Codex:

- Preserve the upstream distinction that only real auth rejection should map to `token_expired`.
- Avoid converting generic network failures or non-auth API errors into false `expired` states.
- Keep the current extension endpoint unless additional endpoint fallback is required later by a concrete breakage.

## UI Impact

No UI redesign is required.

Expected behavior improvements:

- status bar provider state reflects explicit runtime status instead of inferred cache state
- details panel labels and hints become more accurate for expired and error cases
- stale cached usage no longer silently masks an expired or errored provider state

## Testing And Verification

Add or update tests for:

- Claude refresh helper success and failure paths
- Codex refresh helper success and failure paths
- atomic credential file write behavior where practical
- polling transitions:
  - missing credentials -> `disconnected`
  - successful fetch -> `connected`
  - `429` -> backoff increase without `error`
  - `401` or `403` -> refresh attempt, then `connected` on success or `expired` on failure
  - non-auth failure -> `error`
- `getProviderState()` returning explicit tracked status while preserving cached usage separately

Verification commands should include the repo's existing lint, typecheck, and test commands if present.

## Risks And Mitigations

- Risk: writing CLI-managed auth files incorrectly can break login state.
  - Mitigation: keep file shape changes minimal and use atomic writes.
- Risk: stale cache and explicit status can drift.
  - Mitigation: make status transitions happen inside the polling flow instead of being derived later.
- Risk: refresh retries could hammer auth endpoints.
  - Mitigation: enforce one refresh attempt per provider per 5 minutes.

## Implementation Boundaries

Files expected to change:

- `src/polling.ts`
- `src/providers/credentials.ts`
- `src/providers/claude.ts`
- `src/providers/codex.ts`
- related tests for polling and provider credential behavior

This change should remain a targeted logic sync and avoid unrelated refactors.
