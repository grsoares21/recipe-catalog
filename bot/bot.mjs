// Telegram bot that turns shared Instagram reels into catalog recipes.
// Share a reel to the bot → it fetches the reel (logged out), asks Claude Code to write the
// recipe in a temporary git worktree, and replies with a preview and Publish / Discard buttons.
// Replying to a preview asks for changes. Publishing commits and pushes to main.
//
// Run: node bot/bot.mjs   (config: ~/.config/recipe-bot/config.json, see bot/README.md)
// Needs Node 20+, git, Claude Code (`claude`), yt-dlp, ffmpeg and whisper-cli on PATH.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const BOT_DIR = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(BOT_DIR, '..');
const CONFIG_DIR = path.join(os.homedir(), '.config/recipe-bot');
const expand = (p) => p.replace(/^~(?=\/)/, os.homedir());

const cfg = JSON.parse(fs.readFileSync(process.env.RECIPE_BOT_CONFIG ?? path.join(CONFIG_DIR, 'config.json'), 'utf8'));
const WORK = expand(cfg.workDir ?? '~/.local/share/recipe-bot/work');
const STATE_PATH = path.join(CONFIG_DIR, 'state.json');
const SITE = cfg.siteUrl.replace(/\/?$/, '/');
const API = `https://api.telegram.org/bot${cfg.telegramToken}`;
const allowed = new Set((cfg.allowedUserIds ?? []).map(Number));

const REEL = /https?:\/\/(?:www\.)?instagram\.com\/(?:reels?|p)\/([A-Za-z0-9_-]+)/g;
// Telegram bot tokens, GitHub tokens, Anthropic keys, private keys.
const SECRET = /\b\d{8,10}:[A-Za-z0-9_-]{35}\b|\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_\w{20,}|\bsk-ant-[\w-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/;

// ---------- state ----------

// jobs[id] = { status: queued|working|preview|published|discarded|failed, url, chatId, previewId?, feedback? }
const state = fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) : { offset: 0, jobs: {} };
const save = () => fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 1));
const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------- telegram ----------

async function tg(method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${method}: ${json.description}`);
  return json.result;
}

const say = (chatId, text, extra = {}) =>
  tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });

async function sendPhoto(chatId, file) {
  const form = new FormData();
  form.set('chat_id', String(chatId));
  form.set('photo', new Blob([fs.readFileSync(file)]), 'photo.jpg');
  const res = await fetch(`${API}/sendPhoto`, { method: 'POST', body: form });
  if (!(await res.json()).ok) log('sendPhoto failed');
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- git & tools ----------

const git = (args, cwd = REPO) => exec('git', args, { cwd, maxBuffer: 10e6 }).then((r) => r.stdout.trim());
const worktree = (id) => path.join(WORK, id, 'repo');
const media = (id) => path.join(WORK, id, 'media');

async function freshWorktree(id) {
  const wt = worktree(id);
  await removeWorktree(id);
  await git(['pull', '--quiet', '--ff-only']); // keeps the bot's own checkout (and the "already in the catalog" check) current
  await git(['worktree', 'add', '--detach', wt, 'origin/main']);
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(wt, 'node_modules'));
  return wt;
}

async function removeWorktree(id) {
  if (fs.existsSync(worktree(id))) await git(['worktree', 'remove', '--force', worktree(id)]).catch(() => {});
  await git(['worktree', 'prune']);
}

async function claude(prompt, cwd, extraDirs) {
  const args = [
    '-p', prompt,
    '--permission-mode', 'dontAsk',
    // Only what's needed to write the recipe: no git, no network, no arbitrary shell.
    '--allowedTools', 'Read', 'Write', 'Edit', 'Glob', 'Grep',
    'Bash(npm run catalog)', 'Bash(node scripts/find-food.mjs:*)',
    '--output-format', 'json',
    ...extraDirs.flatMap((d) => ['--add-dir', d]),
    ...(cfg.claudeModel ? ['--model', cfg.claudeModel] : []),
  ];
  const { stdout } = await exec('claude', args, { cwd, maxBuffer: 50e6, timeout: 20 * 60e3 });
  return JSON.parse(stdout).result ?? '';
}

// ---------- jobs ----------

async function processNew(id) {
  const job = state.jobs[id];
  const dir = media(id);
  fs.mkdirSync(dir, { recursive: true });
  await exec('bash', [path.join(REPO, 'scripts/fetch-reel.sh'), job.url, dir], {
    env: { ...process.env, WHISPER_MODEL: expand(cfg.whisperModel) },
    timeout: 10 * 60e3,
  }).catch((e) => log('fetch-reel:', e.message));

  const infoFile = path.join(dir, `${id}.info.json`);
  if (!fs.existsSync(infoFile)) throw new Error("Instagram didn't return this reel to a logged-out visitor (private, age-restricted or a photo post).");
  const info = JSON.parse(fs.readFileSync(infoFile, 'utf8'));
  fs.writeFileSync(path.join(dir, 'caption.txt'), info.description ?? '');
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ creator: info.channel ?? info.uploader_id ?? info.uploader, url: job.url }, null, 1));

  const wt = await freshWorktree(id);
  if (fs.existsSync(path.join(dir, `${id}.jpg`))) {
    await exec('bash', [path.join(wt, 'scripts/add-photo.sh'), path.join(dir, `${id}.jpg`), id], { cwd: wt });
  }
  const prompt = `${fs.readFileSync(path.join(BOT_DIR, 'prompt.md'), 'utf8')}\n\n## This reel\n\n- id: ${id}\n- media directory: ${dir}\n`;
  const answer = await claude(prompt, wt, [dir]);
  return finish(id, answer);
}

async function processFix(id) {
  const job = state.jobs[id];
  const wt = worktree(id);
  const prompt =
    `${fs.readFileSync(path.join(BOT_DIR, 'prompt.md'), 'utf8')}\n\n## Requested change\n\n` +
    `You already wrote data/recipes/${id}.json (media directory: ${media(id)}). ` +
    `The owner of the catalog reviewed it and asks for this change. Apply it, keep following the rules above, and run npm run catalog again:\n\n` +
    `"""\n${job.feedback}\n"""\n`;
  const answer = await claude(prompt, wt, [media(id)]);
  return finish(id, answer);
}

async function finish(id, answer) {
  const job = state.jobs[id];
  const wt = worktree(id);
  const notRecipe = answer.match(/NOT A RECIPE:(.*)/);
  if (notRecipe || !fs.existsSync(path.join(wt, 'data/recipes', `${id}.json`))) {
    await removeWorktree(id);
    job.status = 'discarded';
    return say(job.chatId, `🙅 Skipped ${esc(job.url)}\n${esc(notRecipe?.[1]?.trim() || answer.slice(-500) || 'No recipe was written.')}`);
  }
  await exec('npm', ['run', '--silent', 'catalog'], { cwd: wt }); // throws with the validation errors if it still fails
  const catalog = JSON.parse(fs.readFileSync(path.join(wt, 'public/catalog.json'), 'utf8'));
  const recipe = catalog.recipes.find((r) => r.id === id);
  const photo = path.join(wt, 'public/photos', `${id}.jpg`);
  if (fs.existsSync(photo)) await sendPhoto(job.chatId, photo);
  const msg = await say(job.chatId, preview(recipe, catalog.ingredients, answer), {
    reply_markup: { inline_keyboard: [[{ text: '✅ Publish', callback_data: `pub:${id}` }, { text: '🗑 Discard', callback_data: `del:${id}` }]] },
  });
  job.status = 'preview';
  job.previewId = msg.message_id;
}

const UNIT = { piece: '', 'to-taste': 'to taste' };
function amount(i) {
  if (i.unit === 'to-taste' || i.amount === undefined) return 'to taste';
  const n = Number(i.amount.toFixed(2));
  return `${i.assumed ? '≈' : ''}${n}${i.unit in UNIT ? UNIT[i.unit] && ` ${UNIT[i.unit]}` : ` ${i.unit}`}`;
}

function preview(r, ingredients, answer) {
  const n = r.nutrition;
  const lines = [
    `<b>${esc(r.title)}</b>${r.kind === 'tip' ? ' (tip)' : ''}`,
    `@${esc(r.creator)} · ${r.servings} serving${r.servings === 1 ? '' : 's'}${r.servingsEstimated ? ' (est.)' : ''}${r.yield ? ` · ${esc(r.yield)}` : ''}`,
    n ? `${n.kcal} kcal · P ${n.protein} g · C ${n.carbs} g · F ${n.fat} g (${n.source === 'creator' ? 'from the creator' : 'estimated'})` : '',
    r.status === 'incomplete' ? `⚠️ ${esc(r.statusNote ?? 'Incomplete')}` : '',
    '',
    ...r.ingredientGroups.flatMap((g) => [
      ...(g.name ? [`<i>${esc(g.name)}</i>`] : []),
      ...g.items.map((i) => `• ${esc(amount(i))} ${esc(ingredients[i.ingredient]?.name ?? i.ingredient)}${i.note ? ` (${esc(i.note)})` : ''}`),
    ]),
    '',
    ...r.steps.map((s, i) => `${i + 1}. ${esc(s)}`),
    '',
    `<i>${esc(answer.trim().split('\n').pop())}</i>`,
    'Reply to this message to ask for changes.',
  ];
  const text = lines.filter((l, i) => l !== '' || lines[i - 1] !== '').join('\n');
  return text.length > 4000 ? `${text.slice(0, 3990)}…` : text;
}

async function publish(id) {
  const job = state.jobs[id];
  const wt = worktree(id);
  const recipe = JSON.parse(fs.readFileSync(path.join(wt, 'data/recipes', `${id}.json`), 'utf8'));
  await git(['add', 'data/recipes', 'data/ingredients.json', 'public/photos'], wt);
  // The repo is public: refuse to commit anything that looks like a credential.
  const staged = await git(['diff', '--cached', '--name-only'], wt);
  const diff = await git(['diff', '--cached', '--', 'data'], wt);
  const unexpected = staged.split('\n').filter((f) => f && !/^(data\/recipes\/[\w-]+\.json|data\/ingredients\.json|public\/photos\/[\w-]+\.jpg)$/.test(f));
  if (unexpected.length || diff.includes(cfg.telegramToken) || SECRET.test(diff)) {
    await git(['reset', '--quiet'], wt);
    throw new Error(`refusing to commit: ${unexpected.length ? `unexpected files ${unexpected.join(', ')}` : 'the change looks like it contains a credential'}`);
  }
  await git(['-c', `user.name=${cfg.gitName}`, '-c', `user.email=${cfg.gitEmail}`, 'commit', '--quiet', '-m',
    `Add recipe: ${recipe.title}\n\nAdded via the recipe bot.\n\nCo-Authored-By: Claude <noreply@anthropic.com>`], wt);
  await git(['fetch', '--quiet', 'origin', 'main'], wt);
  await git(['rebase', '--quiet', 'origin/main'], wt);
  await git(['push', '--quiet', 'origin', 'HEAD:main'], wt);
  await removeWorktree(id);
  job.status = 'published';
  await say(job.chatId, `✅ Published <b>${esc(recipe.title)}</b>. It'll be in the app in a minute or two:\n${SITE}#/r/${id}`);
}

async function discard(id) {
  await removeWorktree(id);
  state.jobs[id].status = 'discarded';
  await say(state.jobs[id].chatId, '🗑 Discarded.');
}

// One job at a time: Claude and whisper are heavy, and Instagram dislikes bursts.
const queue = [];
let busy = false;
function enqueue(id, kind) {
  queue.push({ id, kind });
  void drain();
}
async function drain() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const { id, kind } = queue.shift();
    const job = state.jobs[id];
    job.status = 'working';
    save();
    log(`${kind} ${id}`);
    try {
      if (kind === 'new') await processNew(id);
      else if (kind === 'fix') await processFix(id);
      else if (kind === 'publish') await publish(id);
      else if (kind === 'discard') await discard(id);
    } catch (e) {
      log(`failed ${kind} ${id}:`, e.stderr || e.message);
      job.status = kind === 'new' ? 'failed' : 'preview';
      const buttons = kind === 'new' ? {} : {
        // Keep the recipe reachable: a fresh message with the buttons, which replies also target.
        reply_markup: { inline_keyboard: [[{ text: '✅ Publish', callback_data: `pub:${id}` }, { text: '🗑 Discard', callback_data: `del:${id}` }]] },
      };
      const msg = await say(job.chatId, `❌ Something went wrong (${kind}) for ${esc(job.url)}:\n<code>${esc(String(e.stderr || e.message).slice(-600))}</code>`, buttons).catch(() => null);
      if (msg && kind !== 'new') job.previewId = msg.message_id;
    }
    save();
  }
  busy = false;
}

// ---------- updates ----------

const HELP =
  'Share an Instagram reel with me (Share → Telegram) or paste its link. ' +
  "I'll write the recipe and send you a preview to publish or discard. Reply to a preview to ask for changes.";

async function onMessage(m) {
  const from = m.from?.id;
  if (!allowed.size) return say(m.chat.id, `Setup mode: your Telegram user id is <code>${from}</code>. Add it to allowedUserIds in the config and restart me.`);
  if (!allowed.has(from)) return log(`ignored message from user ${from}`);
  const text = m.text ?? m.caption ?? '';

  const replyTo = m.reply_to_message?.message_id;
  const fixFor = replyTo && Object.keys(state.jobs).find((id) => state.jobs[id].previewId === replyTo && state.jobs[id].status === 'preview');
  if (fixFor) {
    state.jobs[fixFor].feedback = text;
    enqueue(fixFor, 'fix');
    return say(m.chat.id, '✏️ On it, I\'ll send a new preview.', { reply_to_message_id: m.message_id });
  }

  const ids = [...new Set([...text.matchAll(REEL)].map((x) => x[1]))];
  if (!ids.length) return text.startsWith('/') || m.chat.type === 'private' ? say(m.chat.id, HELP) : undefined;
  for (const id of ids) {
    if (fs.existsSync(path.join(REPO, 'data/recipes', `${id}.json`))) {
      await say(m.chat.id, `Already in the catalog: ${SITE}#/r/${id}`);
    } else if (['queued', 'working', 'preview'].includes(state.jobs[id]?.status)) {
      await say(m.chat.id, 'Already working on that one.');
    } else {
      state.jobs[id] = { status: 'queued', url: `https://www.instagram.com/reel/${id}/`, chatId: m.chat.id };
      enqueue(id, 'new');
      await say(m.chat.id, `⏳ Got it, writing it up. It takes a few minutes.`, { reply_to_message_id: m.message_id });
    }
  }
}

async function onButton(q) {
  if (!allowed.has(q.from.id)) return tg('answerCallbackQuery', { callback_query_id: q.id });
  const [action, id] = q.data.split(':');
  const job = state.jobs[id];
  await tg('answerCallbackQuery', { callback_query_id: q.id });
  if (job?.status !== 'preview' || job.previewId !== q.message.message_id) return;
  await tg('editMessageReplyMarkup', { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } });
  enqueue(id, action === 'pub' ? 'publish' : 'discard');
}

async function main() {
  fs.mkdirSync(WORK, { recursive: true });
  const me = await tg('getMe', {});
  log(`running as @${me.username}; allowed users: ${[...allowed].join(', ') || 'none (setup mode)'}`);
  // Resume anything interrupted by a restart.
  for (const [id, job] of Object.entries(state.jobs)) {
    if (job.status === 'queued' || (job.status === 'working' && !fs.existsSync(worktree(id)))) enqueue(id, 'new');
    else if (job.status === 'working') job.status = 'preview'; // was mid-fix or mid-publish: the buttons on the last preview still work
  }
  for (;;) {
    try {
      const updates = await tg('getUpdates', { offset: state.offset, timeout: 50, allowed_updates: ['message', 'callback_query'] });
      for (const u of updates) {
        state.offset = u.update_id + 1;
        save();
        await (u.message ? onMessage(u.message) : u.callback_query ? onButton(u.callback_query) : null)?.catch((e) => log('update error:', e.message));
      }
    } catch (e) {
      log('poll error:', e.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

main();
