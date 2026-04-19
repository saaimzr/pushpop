<img width="831" height="496" alt="pushpop_final" src="https://github.com/user-attachments/assets/dcb276ad-6e32-45de-9a21-c8730981f180" />

# ♫ pushpop ♫

> Play a custom audio tag every time you `git commit` or `git push`.

Like a producer's tag, but for your terminal.

---

## What is this?

A way for your team to know who pushed the latest garbage.

Play a custom audio tag every time you `git commit` or `git push`. Choose from built-in sound packs or upload your own. For developers who want to add more personality in their workflow. Takes about 15 seconds to set up.

---

## Install

```bash
npm install -g pushpopper
```

> Requires Node.js 20 or higher. Supported on **macOS** and **Windows** only — Linux is not supported in this release.

---

## Quick Start

```bash
# 1. Run first-time setup
pushpop init

# 2. Open the interactive dashboard
pushpop

# 3. Pick a sound, assign it to commit or push, done
```

That's it. Next time you `git commit` or `git push`, your sound plays in any repo on your machine. No per-repo config needed. ♫ ♫ ♫

---

## Commands

| Command | Description |
| --- | --- |
| `pushpop` | Open the interactive dashboard |
| `pushpop init` | Install global Git hooks and set `core.hooksPath` |
| `pushpop activate <key>` | Unlock Pro with a Polar license key |
| `pushpop doctor` | Print troubleshooting diagnostics (audio, hooks, config) |
| `pushpop uninstall` | Remove hooks, config, and attempt to remove the CLI |
| `pushpop --version` | Print the installed version |


---

## Sound Packs

Pushpop ships with built-in sounds across 5 genres:

- ○ &nbsp; **Interactive terminal dashboard** — browse, preview, and assign sounds without leaving the terminal
- ♫ &nbsp; **5 built-in sound packs** — General, Gaming, Nature, Sci-Fi, and Producer Tags
- ⬆ &nbsp; **Custom uploads** — add your own `.mp3`, `.wav`, or `.m4a` files via the native macOS / Windows file picker or by pasting a path
- ✦ &nbsp; **Volume control** — choose from 0 %, 25 %, 50 %, 75 %, or 100 %
- ◌ &nbsp; **CI-safe** — hooks skip audio when `$CI` is set
  
---

## Platform Support

**macOS** via `afplay` · **Windows** via WMP COM / `ffplay` / PowerShell fallback chain. Requires a modern terminal (Windows Terminal, Terminal.app, iTerm2, VS Code).

## Uploads

Upload `.mp3`, `.wav`, or `.m4a` files from the dashboard. Tags are capped at **5.5 s** — longer files are auto-trimmed when `ffmpeg` is installed. Preview before saving.

## Free vs Pro


|                      | Free         | Pro            |
| -------------------- | ------------ | -------------- |
| Built-in sound packs | ◆ All genres | ◆ All genres   |
| Custom uploads       | 2 max        | Unlimited      |
| Price                | Free         | $1.29 one-time |


► **[Grab Pro here](https://buy.polar.sh/polar_cl_1tD9WmV9vx3FrAiTVfKNMDXcQvtLemfYhdzqH37KkAS)** — Thanks for your support :)

Once you have a key:

```bash
pushpop activate YOUR-LICENSE-KEY
```


## How It Works

pushpop sets a **global `core.hooksPath`** (`~/.pushpop/hooks/`), so every repo works without per-project config. Hooks are CI-safe, debounce within 2 s, and chain to existing repo-local hooks. Config lives in `~/.pushpop/config.json`.

> **Note:** Repo-local hook managers (Husky, Lefthook) or a repo-level `core.hooksPath` can override the global hooks. Run `pushpop doctor` to diagnose.

## Uninstall

```bash
pushpop uninstall
```

Removes hooks, restores your previous `core.hooksPath`, clears `~/.pushpop`, and schedules `npm uninstall -g pushpopper`.

## Troubleshooting

Run `pushpop doctor` for full diagnostics. For verbose audio logging: `PUSHPOP_DEBUG_AUDIO=1 pushpop`.


## Feedback

Bug reports, feature requests, and producer-tag suggestions, etc are all welcome:

✧  **saaim.raad3@gmail.com**

---

## License

MIT
