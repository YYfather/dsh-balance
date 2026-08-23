# dsh-balance

A DeepSeek Harness plugin that shows DeepSeek / MiMo account balance and per-request conversation cost in the composer dock, with model-aware peak/off-peak pricing and spend alerts (click the dock readout to configure).

## Features

- **Balance**: live DeepSeek account balance (loopback-only routes; the credential never leaves the Host; hidden when the current session uses an external provider such as Xiaomi MiMo)
- **Per-request cost**: each usage sample is priced by its own request timestamp (peak/off-peak) and its own model, with the same `(turn, step)` replacement rule as the official token-usage projection
  - `本会话 / this conversation` = full cost of the current session since its creation
  - `本次活跃 / active period` = cost of requests since this plugin instance started
  - `最近一次 / last request` = cost of the most recent request
  - `上次对话 / previous conversation` = cost of the immediately preceding session (MiMo sessions converted via a configurable USD rate)
- **Model price table**: DeepSeek V4 Flash / V4 Flash Vision Exp / V4 Pro (official CNY, off-peak/peak tiers) and Xiaomi MiMo V2.5 family (USD, editable), editable per model + tier in the click panel; USD entries converted at a configurable rate
- **Alerts**: orange pill badge when active-period spend ≥ spend line (default ¥1) or DeepSeek balance < balance line (default ¥10); both editable in the panel
- **Refresh**: after each conversation turn and every 5 minutes (toggleable)

## Installation

1. Clone into the profile dependency folder (`$DSH_HOME/profiles/<name>/node_modules/@yyfather/dsh-balance`):
   ```sh
   git clone https://github.com/YYfather/dsh-balance.git "$HOME/.dsh/profiles/node_modules/@yyfather/dsh-balance"
   ```
2. Append to the profile's `cordis.patch.yml` (the user patch layer; survives reinstalls):
   ```yaml
   - insert:
       - id: dsh-balance
         name: '@yyfather/dsh-balance'
   ```
3. Restart DSH Desktop. The dock readout appears; click it to open the settings panel.

### Requirements

- Host: `webServer`, `credentials` (store the DeepSeek key in Settings → Models, default ref `DEEPSEEK_API_KEY`), `sessions` / `sessionQuery`, `timer`
- Client: `slots` (`conversation.composer.dock`), React
- Node ≥ 20 (native fetch)

## Host config (overridable in the plugin row)

| Field | Default | Notes |
|---|---|---|
| `apiKeyRef` | `DEEPSEEK_API_KEY` | credential reference for balance queries |
| `baseUrl` | `https://api.deepseek.com` | DeepSeek API root |
| `timeoutMs` | `20000` | upstream timeout |
| `allowRemote` | `false` | keep false; routes are loopback-only by design |

Run-time pricing and alert lines are edited in the click panel (in-memory).

## Security

- Credentials resolve only on the Host; the browser talks exclusively to the loopback-only `dsh-balance/api/*` same-origin routes
- Responses never include upstream bodies, credentials, or unvalidated fields

## License

MIT
