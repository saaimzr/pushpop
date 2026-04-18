# pushpop

> Play a short producer-style audio tag every time you `git commit` or `git push`.

pushpop installs global Git hooks on your machine, gives you an interactive dashboard for assigning sounds, supports custom uploads, and now works across macOS, Windows, and Linux boxes that have a usable local audio backend.

## Install

```bash
npm install -g pushpopper
```

Requires Node.js 18 or higher.

## Quick start

```bash
# 1. Install the global hooks
pushpop init

# 2. Open the dashboard
pushpop

# 3. Pick a sound for commit and/or push
```

## Commands

| Command | What it does |
| --- | --- |
| `pushpop` | Open the interactive dashboard |
| `pushpop init` | Install global Git hooks and set `core.hooksPath` |
| `pushpop upload <file>` | Add a custom audio file (`.mp3`, `.wav`, `.m4a`) |
| `pushpop activate <key>` | Unlock Pro with your Lemon Squeezy license key |
| `pushpop doctor` | Print troubleshooting details about audio, hooks, and config |
| `pushpop uninstall` | Remove hooks, config, and attempt to remove the global CLI |

## Features

- Interactive terminal dashboard for sound assignment
- Built-in sound packs across General, Gaming, Nature, Sci-Fi, and Producer Tags
- Custom uploads with automatic truncation to the first 3 seconds when `ffmpeg` is available
- Runtime volume control with presets from `0%` to `100%`
- Remove-assignment flow for clearing commit or push sounds
- Global Git hook installation with repo-hook chaining

## Platform support

- macOS: supported via `afplay`
- Windows: supported via Windows Media Player COM, with `ffplay` and PowerShell fallbacks
- Linux: supported via `paplay -> ffplay -> aplay -> mpg123`

Linux caveats:

- Headless servers stay silent instead of crashing.
- `paplay` and `ffplay` respect pushpop volume.
- `aplay` does not expose a clean volume flag, so WAV playback uses source volume.

## Uploads and audio limits

Custom uploads accept `.mp3`, `.wav`, and `.m4a`.

- Files longer than 3 seconds are truncated to the first 3 seconds with `ffmpeg -t 3 -y`.
- If `ffmpeg` is missing, long uploads are rejected with a clear error instead of silently failing.

## Dashboard notes

The dashboard status panel shows:

- current commit sound
- current push sound
- configured volume
- upload usage or Pro status

If an assigned custom file is deleted manually, pushpop shows `(file missing)` in the dashboard and stays silent during Git events.

## Free vs Pro

| | Free | Pro |
| --- | --- | --- |
| Built-in sound packs | All genres | All genres |
| Custom uploads | 2 max | Unlimited |
| Price | Free | $1.49 one-time |

Local and development builds in this repo still use a placeholder Lemon Squeezy URL. Until the real buy URL is set before publish, the CLI will show a "coming soon" style paywall message instead of a live checkout link.

Once you have a key:

```bash
pushpop activate YOUR-LICENSE-KEY
```

## Hooks and Git behavior

pushpop uses a global `core.hooksPath`, so it works across every repo without per-project setup.

Generated hooks:

- skip audio in CI
- debounce repeated plays within 2 seconds
- resolve the pushpop binary path at install time
- chain to repo-local `.git/hooks/post-commit` and `.git/hooks/pre-push` when present

If `pushpop init` detects Husky near the current repo, it prints a copy-paste snippet you can add to the relevant Husky hook.

## Uninstall

```bash
pushpop uninstall
```

This command:

- restores your previous `core.hooksPath` if one was set
- removes pushpop hook files
- clears `~/.pushpop`
- attempts to run `npm uninstall -g pushpopper` in the background

If pushpop cannot safely remove the global install automatically, it falls back to printing the manual command.

## Troubleshooting

Run:

```bash
pushpop doctor
```

The doctor output includes:

- OS and architecture
- Node and Git versions
- `ffmpeg` availability
- detected audio backend
- installed hook files and executable state
- current assignments, including missing-file flags
- volume and Pro status
- resolved pushpop binary path

For audio backend debugging, set:

```bash
PUSHPOP_DEBUG_AUDIO=1
```

For local development env loading, copy `.env.example` to `.env`. The published npm package only includes `dist/` and `assets/`, so `.env` files are not shipped.

## Feedback

Email: `saaim.raad3@gmail.com`

## License

MIT
