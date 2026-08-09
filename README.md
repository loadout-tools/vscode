# Loadout for VS Code

Loadout brings your personal AI-agent context into every repo you open—automatically equipped in Copilot Chat and Cursor. Your `load` CLI manages the context; this extension opens the studio and triggers refreshes.

Context lives in your local `~/.config/loadout/config.toml` and your repo's optional `.loadout/` directory. Loadout reads both, merges them, and writes a `.loadout-context.md` file that your AI tools consume on every request.

## How it works

1. **Install the extension** from the marketplace, then restart VS Code or Cursor.
2. **Set up your context** via the Loadout Studio panel (opens on first run). Create a profile, add your scripts and capabilities, and choose which repos will use it.
3. **Open any repo**—Loadout detects your profile and refreshes context automatically.
4. **Copilot Chat or Cursor reads it**—both tools pick up the context on every request, so your AI tools always know your stack, conventions, and personal guidance.

## Your `load` install wins

If you have `load` installed via `curl | bash` or a package manager, that CLI always takes precedence—the extension never updates it. The bundled binary (macOS/Linux only) is a fallback for fresh installs.

## Platform support

- macOS (arm64, x64)
- Linux (x64, arm64)
- Windows: coming with loadout's Windows support

## Links

- [loadout.tools](https://loadout.tools) — docs and guides
- [GitHub: elleryfamilia/loadout](https://github.com/elleryfamilia/loadout) — source, issues, releases
