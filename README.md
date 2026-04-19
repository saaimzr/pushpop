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

That's it. Next time you `git commit` or `git push`, your sound plays. 🎵

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

- ○ **General** — ka-ching, applause, gong
- ⊕  **Gaming** — coin collects, level-ups, YOSHI
- ≋ **Nature** — thunder, water drops
- ✦ **Sci-Fi** — laser blasts, warp whooshes, synth beeps
- ♫ **Producer Tags** — iconic tags from producers

---

## How it works

pushpop sets a **global `core.hooksPath`** (`~/.pushpop/hooks/`), so every repo works without per-project config. Hooks are CI-safe, debounce within 2 s, and chain to existing repo-local hooks. Config lives in `~/.pushpop/config.json`.

> **Note:** Repo-local hook managers (Husky, Lefthook) or a repo-level `core.hooksPath` can override the global hooks. Run `pushpop doctor` to diagnose.

## Uninstall

```bash
pushpop uninstall
```

Removes hooks, restores your previous `core.hooksPath`, clears `~/.pushpop`, and schedules `npm uninstall -g pushpopper`.

## Troubleshooting

Run `pushpop doctor` for full diagnostics. For verbose audio logging: `PUSHPOP_DEBUG_AUDIO=1 pushpop`.

## Free vs Pro


|                      | Free         | Pro            |
| -------------------- | ------------ | -------------- |
| Built-in sound packs | ◆ All genres | ◆ All genres   |
| Custom uploads       | 2 max        | Unlimited      |
| Price                | Free         | $1.29 one-time |


👉 **[Grab Pro here](https://pushpop.lemonsqueezy.com)** — Thanks for your support :)

Once you have a key:

```bash
pushpop activate YOUR-LICENSE-KEY
```

---

## License

MIT — the code is open.