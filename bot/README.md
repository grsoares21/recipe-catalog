# Recipe bot

A Telegram bot that adds recipes to the catalog. Share an Instagram reel with it; it fetches the reel (logged out), has Claude Code write the recipe, and replies with a preview and **Publish** / **Discard** buttons. Reply to a preview to ask for changes ("serves 4, not 2"). Publishing commits to `main`, which redeploys the site.

It runs on any always-on machine on a home connection (Instagram blocks most logged-out requests from cloud servers): a Mac or a Raspberry Pi.

## How it's kept safe

- **No secrets in this repo.** The bot token, allowed users and state live in `~/.config/recipe-bot/` on the machine. This folder only has `config.example.json`.
- **Only allowed Telegram users** can use it; everyone else is ignored.
- **Nothing is exposed to the internet**: the bot polls Telegram, it doesn't receive connections.
- **Claude Code runs restricted**: in a temporary git worktree, allowed only to read, edit files and run `npm run catalog` and `node scripts/find-food.mjs` (no git, no network, no other commands). Captions are treated as data, not instructions (see `prompt.md`).
- **Nothing is published without a tap**, and the bot refuses to commit anything outside `data/` and `public/photos/` or anything that looks like a credential.

## Setup (macOS)

1. Tools: `brew install yt-dlp ffmpeg whisper-cpp`, Node 20+, and [Claude Code](https://claude.com/claude-code) logged in (`claude` once, interactively). Recipes count against your Claude plan's usage.
2. A dedicated checkout for the bot, so it never touches your working copy:
   ```sh
   git clone https://github.com/<you>/recipe-catalog ~/.local/share/recipe-bot/repo
   cd ~/.local/share/recipe-bot/repo && npm ci
   ```
   It pushes with your normal git credentials (`gh auth setup-git`). On a Pi, use a [deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys) with write access to this repo only.
3. A Whisper model: `curl -L -o ~/.local/share/recipe-bot/models/ggml-base.bin --create-dirs https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin`
4. Create the bot: in Telegram, talk to **@BotFather** → `/newbot`, pick a name, and copy the token. For a group chat, also send `/setprivacy` → your bot → **Disable**, so it sees shared links and not only commands.
5. Config: copy `bot/config.example.json` to `~/.config/recipe-bot/config.json` and fill in the token, your git name and **noreply** email. Leave `allowedUserIds` empty for now, then `chmod 600 ~/.config/recipe-bot/config.json`.
6. Run it once in a terminal: `node bot/bot.mjs`. While `allowedUserIds` is empty it's in setup mode: each person sends it any message and it replies with their Telegram user id. Put the ids in the config and restart.
7. Keep it running in the background: `bot/install-macos.sh` (logs in `~/Library/Logs/recipe-bot.log`; `bot/install-macos.sh uninstall` to stop).

## Using it

- In Instagram: **Share → Telegram →** the bot (or a group with the bot in it). Pasting a link works too.
- After a few minutes you get the photo and a preview. Recipes where something had to be guessed are flagged ⚠️.
- **Publish**, **Discard**, or reply to the preview with what to change.
