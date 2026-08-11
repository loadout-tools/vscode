# Loadout for VS Code

Loadout brings your personal AI-agent context into every repo you open—automatically equipped in Copilot Chat and Cursor. Your `load` CLI manages the context; this extension opens the studio and triggers refreshes.

> **Windows support is through WSL2.** Open your folder in a WSL window and the extension runs inside WSL, where the bundled `load` binary works unmodified. On a local Windows window the extension offers to reopen the folder in WSL for you — VS Code does not carry the extension into the remote automatically, so after it reopens, install Loadout there too (Extensions view → Install in WSL).

Context lives in your local `~/.config/loadout/config.toml`. For each repo, loadout renders a gitignored overlay file your AI tools read on every request — `.github/instructions/loadout.instructions.md` for Copilot Chat in VS Code, `.cursor/rules/loadout.mdc` for Cursor ("Loadout: Open Overlay File" shows you the one in use).

## How it works

1. **Install the extension** from the marketplace, then restart VS Code or Cursor.
2. **Set up your context** — on first run the extension offers setup and, when you accept, opens the Loadout Studio panel. Nothing is written until you say yes.
3. **Open any repo**—Loadout detects your profile and refreshes context automatically.
4. **Copilot Chat or Cursor reads it**—both tools pick up the context on every request, so your AI tools always know your stack, conventions, and personal guidance.

## Your `load` install wins

If you have `load` installed via `curl | bash` or a package manager, that CLI always takes precedence—the extension never updates it. The bundled binary (a Linux build, used as-is inside WSL) is a fallback for fresh installs.

## Platform support

- macOS (arm64, x64)
- Linux (x64, arm64)
- Windows, via WSL2

## For the studio

When this extension opens the studio, it sets `LOADOUT_STUDIO_HOST` (`vscode` or `cursor`) in the child process's environment. `load` ignores this today — it's a forward-compat signal so studio can later detect it's running inside an IDE and customize itself for embedding.

## Links

- [loadout.tools](https://loadout.tools) — docs and guides
- [GitHub: elleryfamilia/loadout](https://github.com/elleryfamilia/loadout) — source, issues, releases

## Cursor note

Cursor keeps unpinned sidebar icons in the activity bar's `…` overflow menu. If the Loadout backpack isn't visible next to the other icons, open the overflow menu, right-click **Loadout**, and pin it.
