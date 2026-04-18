# ♫ pushpop ♫

> Play a custom audio tag every time you `git commit` or `git push`.

Like a producer's tag, but for your terminal.

---

## What is this?

A way for your team to know who pushed the latest garbage. 

Play a custom audio tag every time you git add, commit or push. Choose from built-in sound packs or upload your own. For developers who want to add more personality in their workflow. Takes about 60 seconds to set up.

---

## Install

```bash
npm install -g pushpopper
```

> Requires Node.js 18 or higher. Works on macOS and Windows.

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


| Command                  | What it does                                   |
| ------------------------ | ---------------------------------------------- |
| `pushpop`                | Open the interactive dashboard                 |
| `pushpop init`           | First-time setup — installs git hooks globally |
| `pushpop upload <file>`  | Add a custom audio file (MP3, WAV)             |
| `pushpop activate <key>` | Unlock Pro with your license key               |
| `pushpop uninstall`      | Remove everything cleanly                      |


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

pushpop installs a global git hook on your machine using `core.hooksPath`. This means it works automatically across every repo without any per-project setup.

It plays nice with existing hooks too so if a repo already has Husky or lint-staged configured, pushpop chains onto those without breaking anything.

---

## Uninstall

```bash
pushpop uninstall
```

This removes the git hooks, restores your git config, and deletes the `~/.pushpop` directory. Clean slate, no leftovers.

---

## Free vs Pro


|                      | Free         | Pro            |
| -------------------- | ------------ | -------------- |
| Built-in sound packs | ✅ All genres | ✅ All genres   |
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