#!/usr/bin/env node
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import {
  HERMES_DESKTOP_PROXY_PATH,
  proxyHermesDesktopSocket
} from './hermes-desktop-proxy.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const neteaseApi = require('@neteasecloudmusicapienhanced/api');

const HOST = process.env.HERMES_HOST || '127.0.0.1';
const PORT = Number(process.env.HERMES_PORT || 8787);
const WS_PATH = process.env.HERMES_WS_PATH || '/hermes';
const ALLOWED_BROWSER_ORIGINS = new Set(String(
  process.env.HERMES_ALLOWED_ORIGINS
  || 'https://yachiyo.hk,http://127.0.0.1:5173,http://127.0.0.1:5176,http://localhost:5173,http://localhost:5176'
).split(',').map((value) => value.trim()).filter(Boolean));
const WORKSPACE_ROOT = path.resolve(process.env.HERMES_WORKSPACE || projectRoot);
const OUTPUT_ROOT = path.resolve(process.env.HERMES_OUTPUT || path.join(projectRoot, 'output', 'system-bridge'));
const ALLOWED_ROOTS = readPathList(process.env.HERMES_ALLOWED_ROOTS || WORKSPACE_ROOT);
const SHELL_ENABLED = isTruthy(process.env.HERMES_ALLOW_SHELL);
const WRITE_ENABLED = isTruthy(process.env.HERMES_ALLOW_WRITE);
const INPUT_ENABLED = process.env.HERMES_ALLOW_INPUT !== '0';
const MAX_FILE_BYTES = Number(process.env.HERMES_MAX_FILE_BYTES || 1024 * 1024);
const POWERSHELL = process.env.SystemRoot
  ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  : 'powershell.exe';
const SEARCH_TIMEOUT_MS = Number(process.env.AGENTOS_SEARCH_TIMEOUT_MS || 9000);
const SEARCH_RESULT_LIMIT = Number(process.env.AGENTOS_SEARCH_RESULT_LIMIT || 8);
const SEARCH_SEARX_INSTANCES = [
  'https://searx.be/search',
  'https://search.inetol.net/search',
  'https://searx.tiekoetter.com/search'
];
const MUSIC_RESULT_LIMIT = 30;
const QQ_MUSIC_API = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
const QQ_MUSIC_SEARCH_API = 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp';

const APP_REGISTRY = [
  { id: 'notepad', label: 'Notepad', target: 'notepad.exe', aliases: ['notepad', 'notes', 'ji shi ben', '记事本'] },
  { id: 'calculator', label: 'Calculator', target: 'calc.exe', aliases: ['calc', 'calculator', 'jisuanqi', '计算器'] },
  { id: 'explorer', label: 'File Explorer', target: 'explorer.exe', aliases: ['explorer', 'file explorer', 'files', '资源管理器', '文件资源管理器', '文件夹'] },
  { id: 'edge', label: 'Microsoft Edge', target: 'msedge.exe', aliases: ['edge', 'browser', 'microsoft edge', '浏览器'] },
  { id: 'terminal', label: 'Windows Terminal', target: 'wt.exe', aliases: ['terminal', 'windows terminal', '终端'] },
  { id: 'powershell', label: 'PowerShell', target: 'powershell.exe', aliases: ['powershell', 'shell'] },
  { id: 'vscode', label: 'Visual Studio Code', target: 'code.cmd', aliases: ['vscode', 'vs code', 'visual studio code', 'code'] }
];

const TOOL_SPECS = [
  { name: 'agentos.capabilities', description: 'List the Agent OS frontend, runtime, pet-mode, and system bridge capabilities.' },
  { name: 'agentos.petMode', description: 'Ask the Agent OS UI to show or hide the resident desktop pet overlay.' },
  { name: 'system.status', description: 'Show bridge, host, workspace, and permission status.' },
  { name: 'system.listApps', description: 'List built-in launch shortcuts.' },
  { name: 'system.launchApp', description: 'Launch a built-in app id or explicit executable/URI target.' },
  { name: 'system.listWindows', description: 'Enumerate visible top-level windows.' },
  { name: 'system.activeWindow', description: 'Return the current foreground window.' },
  { name: 'system.focusWindow', description: 'Focus a window by handle, title, or process name.' },
  { name: 'system.hotkey', description: 'Send an allowed shortcut to the active window.' },
  { name: 'system.typeText', description: 'Paste text into the active window. Set HERMES_ALLOW_INPUT=0 to disable.' },
  { name: 'system.screenshot', description: 'Capture the virtual screen to output/system-bridge.' },
  { name: 'fs.list', description: 'List files under an allowed root.' },
  { name: 'fs.readFile', description: 'Read a text file under an allowed root.' },
  { name: 'fs.writeFile', description: 'Write a file under an allowed root when HERMES_ALLOW_WRITE=1.' },
  { name: 'shell.run', description: 'Run a PowerShell command when HERMES_ALLOW_SHELL=1.' }
];

const AGENT_OS_UI_ACTIONS = [
  { name: 'ui.focusApp', args: ['app'], description: 'Open or focus an Agent OS app window by key, such as agent, appCenter, stream, settings, browser, notepad, weather.' },
  { name: 'ui.closeApp', args: ['app'], description: 'Close an Agent OS app window by key.' },
  { name: 'ui.openStart', args: [], description: 'Open the Agent OS start menu.' },
  { name: 'ui.openControlCenter', args: [], description: 'Open the Agent OS control center.' },
  { name: 'ui.toggleTheme', args: [], description: 'Toggle Agent OS light/dark theme.' },
  { name: 'ui.newConversation', args: [], description: 'Create or focus a new Hermes conversation.' },
  { name: 'ui.inspectProject', args: [], description: 'Prepare a project inspection prompt inside the Agent OS assistant window.' }
];

const AGENT_OS_APP_ACTIONS = [
  { name: 'app.appCenter.list', args: [], description: 'List Agent OS apps and open state.' },
  { name: 'app.appCenter.open', args: ['app'], description: 'Open an Agent OS app by key.' },
  { name: 'app.notepad.createNote', args: ['title', 'body', 'pinned'], description: 'Create a note inside Agent OS Notepad.' },
  { name: 'app.notepad.appendActive', args: ['text'], description: 'Append text to the active Agent OS Notepad note.' },
  { name: 'app.notepad.search', args: ['query'], description: 'Search notes inside Agent OS Notepad.' },
  { name: 'app.browser.open', args: ['url'], description: 'Open a URL in the Agent OS Browser app.' },
  { name: 'app.browser.search', args: ['query'], description: 'Search from the Agent OS Browser app.' },
  { name: 'app.calculator.evaluate', args: ['expression'], description: 'Evaluate an expression in the Agent OS Calculator app.' },
  { name: 'app.weather.current', args: [], description: 'Read the current Agent OS Weather state.' },
  { name: 'app.weather.searchCity', args: ['query', 'selectFirst'], description: 'Search and optionally select a city in Agent OS Weather.' },
  { name: 'app.clock.setTimer', args: ['hours', 'minutes', 'seconds', 'start'], description: 'Set the Agent OS Clock timer.' },
  { name: 'app.clock.addAlarm', args: ['time', 'label'], description: 'Add an Agent OS Clock alarm.' },
  { name: 'app.music.search', args: ['query', 'provider'], description: 'Search NetEase Cloud Music or QQ Music inside Agent OS.' },
  { name: 'app.music.play', args: ['query', 'provider'], description: 'Search and play a song inside the Agent OS Music app.' },
  { name: 'app.music.pause', args: [], description: 'Pause Agent OS Music playback.' },
  { name: 'app.music.resume', args: [], description: 'Resume Agent OS Music playback.' },
  { name: 'app.music.next', args: [], description: 'Play the next Agent OS Music queue item.' },
  { name: 'app.music.nowPlaying', args: [], description: 'Read the Agent OS Music playback state.' },
  { name: 'app.stream.summary', args: [], description: 'Read recent Agent OS Stream messages.' },
  { name: 'app.settings.open', args: [], description: 'Open Agent OS Settings.' }
];

const HOTKEYS = new Map([
  ['enter', '{ENTER}'],
  ['tab', '{TAB}'],
  ['escape', '{ESC}'],
  ['esc', '{ESC}'],
  ['backspace', '{BACKSPACE}'],
  ['delete', '{DELETE}'],
  ['home', '{HOME}'],
  ['end', '{END}'],
  ['pageup', '{PGUP}'],
  ['pagedown', '{PGDN}'],
  ['up', '{UP}'],
  ['down', '{DOWN}'],
  ['left', '{LEFT}'],
  ['right', '{RIGHT}'],
  ['ctrl+a', '^a'],
  ['ctrl+c', '^c'],
  ['ctrl+v', '^v'],
  ['ctrl+x', '^x'],
  ['ctrl+s', '^s'],
  ['ctrl+z', '^z'],
  ['ctrl+y', '^y'],
  ['ctrl+l', '^l'],
  ['alt+tab', '%{TAB}'],
  ['alt+f4', '%{F4}']
]);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }
  if (url.pathname === '/health') {
    writeJson(res, 200, statusPayload());
    return;
  }
  if (url.pathname === '/browser/search') {
    await handleBrowserSearch(url, res);
    return;
  }
  if (url.pathname.startsWith('/music/')) {
    await handleMusicRequest(req, url, res);
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', ...corsHeaders() });
  res.end('Hermes System Bridge is running. Connect WebSocket clients to /hermes.');
});

const wss = new WebSocketServer({ noServer: true });
const desktopWss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);
  if (!isAllowedBrowserOrigin(req.headers.origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  if (url.pathname === HERMES_DESKTOP_PROXY_PATH) {
    desktopWss.handleUpgrade(req, socket, head, (ws) => desktopWss.emit('connection', ws, req));
    return;
  }
  if (url.pathname !== WS_PATH) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

desktopWss.on('connection', (ws, req) => {
  const url = new URL(req.url || HERMES_DESKTOP_PROXY_PATH, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const preferredUrl = String(url.searchParams.get('desktopUrl') || '').trim();
  proxyHermesDesktopSocket(ws, {
    preferredUrls: preferredUrl ? [preferredUrl] : []
  });
});

wss.on('connection', (ws, req) => {
  const remoteAddress = req.socket.remoteAddress || '';
  send(ws, 'agent.ready', {
    text: 'Hermes System Bridge ready.',
    bridge: statusPayload(),
    capabilities: TOOL_SPECS
  });

  ws.on('message', (raw) => {
    handleMessage(ws, raw).catch((error) => {
      send(ws, 'error', { message: error.message || String(error), stack: error.stack });
    });
  });

  ws.on('close', () => {
    console.log(`[bridge] client disconnected ${remoteAddress}`);
  });

  console.log(`[bridge] client connected ${remoteAddress}`);
});

server.listen(PORT, HOST, () => {
  console.log(`[bridge] Hermes System Bridge listening on ws://${HOST}:${PORT}${WS_PATH}`);
  console.log(`[bridge] Hermes Desktop proxy listening on ws://${HOST}:${PORT}${HERMES_DESKTOP_PROXY_PATH}`);
  console.log(`[bridge] workspace: ${WORKSPACE_ROOT}`);
  console.log(`[bridge] allowed roots: ${ALLOWED_ROOTS.join(path.delimiter)}`);
  console.log(`[bridge] shell=${SHELL_ENABLED ? 'enabled' : 'disabled'} write=${WRITE_ENABLED ? 'enabled' : 'disabled'} input=${INPUT_ENABLED ? 'enabled' : 'disabled'}`);
});

function isAllowedBrowserOrigin(origin) {
  if (!origin) return true;
  return ALLOWED_BROWSER_ORIGINS.has(String(origin));
}

async function handleBrowserSearch(url, res) {
  const query = String(url.searchParams.get('q') || '').trim();
  if (!query) {
    writeJson(res, 400, { query, results: [], error: 'Missing search query.' });
    return;
  }

  try {
    const results = await fetchBrowserSearchResults(query);
    writeJson(res, 200, {
      query,
      results,
      count: results.length,
      source: 'agent-os-browser-search'
    });
  } catch (error) {
    writeJson(res, 503, {
      query,
      results: [],
      error: error?.message || 'Agent OS browser search failed.'
    });
  }
}

async function handleMusicRequest(req, url, res) {
  if (req.method !== 'POST') {
    writeJson(res, 405, { success: false, message: 'Music endpoints require POST.' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    let data;
    switch (url.pathname) {
      case '/music/search':
        data = await searchMusic(body);
        break;
      case '/music/resolve':
        data = await resolveMusic(body);
        break;
      case '/music/lyrics':
        data = await fetchMusicLyrics(body);
        break;
      case '/music/recommendations':
        data = await fetchMusicRecommendations(body);
        break;
      case '/music/account/validate':
        data = await validateMusicAccount(body);
        break;
      case '/music/login/netease/start':
        data = await startNeteaseQrLogin();
        break;
      case '/music/login/netease/check':
        data = await checkNeteaseQrLogin(body);
        break;
      default:
        writeJson(res, 404, { success: false, message: 'Unknown music endpoint.' });
        return;
    }
    writeJson(res, 200, { success: true, ...data });
  } catch (error) {
    writeJson(res, 502, {
      success: false,
      message: error?.message || 'Music platform request failed.'
    });
  }
}

async function readJsonBody(req, maxBytes = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Request body is too large.');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_) {
    throw new Error('Request body must be valid JSON.');
  }
}

function normalizeMusicProvider(value) {
  const provider = String(value || '').trim().toLowerCase();
  if (provider === 'qq' || provider === 'qqmusic' || provider === 'qq-music') return 'qqmusic';
  return 'netease';
}

function musicCookie(body) {
  return String(body?.cookie || '').trim();
}

function neteaseResultBody(result) {
  if (!result) return {};
  return result.body && typeof result.body === 'object' ? result.body : result;
}

function mapNeteaseSong(song = {}) {
  const artists = song.ar || song.artists || song.song?.artists || [];
  const album = song.al || song.album || song.song?.album || {};
  return {
    id: String(song.id || song.song?.id || ''),
    provider: 'netease',
    title: song.name || song.song?.name || '未知歌曲',
    artist: artists.map((item) => item.name).filter(Boolean).join(' / ') || '未知歌手',
    album: album.name || '',
    cover: album.picUrl || song.picUrl || song.song?.album?.picUrl || '',
    duration: Number(song.dt || song.duration || song.song?.duration || 0),
    mediaId: String(song.id || song.song?.id || ''),
    vip: Number(song.fee ?? song.song?.fee ?? 0) === 1
  };
}

function mapQqSong(song = {}) {
  const albumMid = song.album?.mid || song.albummid || '';
  const mediaId = song.file?.media_mid || song.media_mid || song.strMediaMid || song.songmid || song.mid || '';
  return {
    id: String(song.mid || song.songmid || song.id || song.songid || ''),
    provider: 'qqmusic',
    title: song.name || song.songname || '未知歌曲',
    artist: (song.singer || []).map((item) => item.name).filter(Boolean).join(' / ') || song.singername || '未知歌手',
    album: song.album?.name || song.albumname || '',
    cover: albumMid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albumMid}.jpg` : '',
    duration: Number(song.interval || 0) * 1000,
    mediaId: String(mediaId),
    vip: Number(song.pay?.payplay ?? song.pay?.play ?? 0) === 1 || Number(song.action?.switch || 0) === 16
  };
}

async function searchMusic(body) {
  const provider = normalizeMusicProvider(body.provider);
  const query = String(body.query || '').trim();
  const limit = Math.min(MUSIC_RESULT_LIMIT, Math.max(1, Number(body.limit) || 20));
  if (!query) throw new Error('请输入歌曲、歌手或专辑名称。');

  if (provider === 'netease') {
    const response = await neteaseApi.cloudsearch({
      keywords: query,
      limit,
      type: 1,
      cookie: musicCookie(body)
    });
    const data = neteaseResultBody(response);
    const songs = data?.result?.songs || [];
    return { provider, query, tracks: songs.map(mapNeteaseSong), total: Number(data?.result?.songCount || songs.length) };
  }

  const params = new URLSearchParams({
    p: '1',
    n: String(limit),
    w: query,
    format: 'json',
    inCharset: 'utf8',
    outCharset: 'utf-8',
    platform: 'yqq.json',
    needNewCode: '0'
  });
  const response = await fetchWithTimeout(`${QQ_MUSIC_SEARCH_API}?${params}`, {
    headers: qqMusicHeaders(musicCookie(body))
  });
  if (!response.ok) throw new Error(`QQ 音乐搜索失败 (${response.status})。`);
  const data = await response.json();
  const songs = data?.data?.song?.list || [];
  return { provider, query, tracks: songs.map(mapQqSong), total: Number(data?.data?.song?.totalnum || songs.length) };
}

async function resolveMusic(body) {
  const provider = normalizeMusicProvider(body.provider || body.track?.provider);
  const track = body.track || {};
  if (!track.id) throw new Error('缺少歌曲 ID。');

  if (provider === 'netease') {
    const response = await neteaseApi.song_url({
      id: String(track.id),
      br: musicBitrate(body.quality),
      cookie: musicCookie(body)
    });
    const data = neteaseResultBody(response)?.data?.[0] || {};
    if (!data.url) throw new Error('该歌曲暂时无法播放，可能需要会员或受版权限制。');
    return {
      provider,
      track: { ...track, provider },
      playback: {
        url: String(data.url).replace(/^http:/i, 'https:'),
        bitrate: Number(data.br || 0),
        format: data.type || 'mp3',
        trial: Number(data.freeTrialInfo?.end || 0) > 0
      }
    };
  }

  const cookie = musicCookie(body);
  if (!cookie) throw new Error('请先连接 QQ 音乐账号后再播放。');
  const playback = await resolveQqPlayback(track, cookie, body.quality);
  return { provider, track: { ...track, provider }, playback };
}

function musicBitrate(quality) {
  return { standard: 128000, high: 320000, lossless: 999000, hires: 999000 }[quality] || 320000;
}

function qqQualityChoices(quality) {
  const levels = {
    hires: [['F000', 'flac', 999000], ['M800', 'mp3', 320000], ['M500', 'mp3', 128000]],
    lossless: [['F000', 'flac', 999000], ['M800', 'mp3', 320000], ['M500', 'mp3', 128000]],
    high: [['M800', 'mp3', 320000], ['M500', 'mp3', 128000]],
    standard: [['M500', 'mp3', 128000], ['C400', 'm4a', 96000]]
  };
  return levels[quality] || levels.high;
}

async function resolveQqPlayback(track, cookie, quality) {
  const uin = qqUin(cookie);
  const guid = qqGuid(cookie);
  const gtk = qqGtk(cookie);
  const mediaId = track.mediaId || track.id;

  for (const [prefix, extension, bitrate] of qqQualityChoices(quality)) {
    const filename = `${prefix}${mediaId}.${extension}`;
    const requestBody = {
      req_0: {
        module: 'vkey.GetVkeyServer',
        method: 'CgiGetVkey',
        param: {
          guid,
          songmid: [String(track.id)],
          filename: [filename],
          songtype: [0],
          uin,
          loginflag: 1,
          platform: '20'
        }
      },
      comm: { uin, format: 'json', ct: 24, cv: 0, g_tk: gtk }
    };
    const response = await fetchWithTimeout(QQ_MUSIC_API, {
      method: 'POST',
      headers: { ...qqMusicHeaders(cookie), 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    if (!response.ok) continue;
    const data = await response.json();
    const payload = data?.req_0?.data || {};
    const purl = payload?.midurlinfo?.[0]?.purl || '';
    if (!purl) continue;
    const base = (payload.sip || []).find(Boolean) || 'https://isure.stream.qqmusic.qq.com/';
    return {
      url: purl.startsWith('http') ? purl : `${base}${purl}`,
      bitrate,
      format: extension,
      trial: false
    };
  }
  throw new Error('QQ 音乐未返回可播放地址，请检查账号登录状态或会员权限。');
}

async function fetchMusicLyrics(body) {
  const provider = normalizeMusicProvider(body.provider || body.track?.provider);
  const id = String(body.id || body.track?.id || '').trim();
  if (!id) throw new Error('缺少歌曲 ID。');
  if (provider === 'netease') {
    const response = await neteaseApi.lyric({ id, cookie: musicCookie(body) });
    const data = neteaseResultBody(response);
    return { provider, lyrics: data?.lrc?.lyric || '', translatedLyrics: data?.tlyric?.lyric || '' };
  }

  const params = new URLSearchParams({ songmid: id, format: 'json', nobase64: '1' });
  const response = await fetchWithTimeout(`https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?${params}`, {
    headers: qqMusicHeaders(musicCookie(body))
  });
  const data = response.ok ? await response.json().catch(() => ({})) : {};
  return { provider, lyrics: data.lyric || '', translatedLyrics: data.trans || '' };
}

async function fetchMusicRecommendations(body) {
  const provider = normalizeMusicProvider(body.provider);
  const limit = Math.min(30, Math.max(1, Number(body.limit) || 18));
  if (provider === 'netease') {
    const cookie = musicCookie(body);
    let data;
    if (cookie) {
      data = neteaseResultBody(await neteaseApi.recommend_songs({ cookie }));
    }
    let songs = data?.data?.dailySongs || [];
    if (!songs.length) {
      const fallback = neteaseResultBody(await neteaseApi.personalized_newsong({ limit }));
      songs = (fallback?.result || []).map((item) => item.song || item);
    }
    return { provider, tracks: songs.slice(0, limit).map(mapNeteaseSong) };
  }

  return searchMusic({ ...body, provider, query: '流行 热门', limit });
}

async function validateMusicAccount(body) {
  const provider = normalizeMusicProvider(body.provider);
  const cookie = musicCookie(body);
  if (!cookie) return { provider, connected: false, account: null };
  if (provider === 'netease') {
    const data = neteaseResultBody(await neteaseApi.login_status({ cookie }));
    const profile = data?.data?.profile || data?.profile || {};
    const account = data?.data?.account || data?.account || {};
    const connected = Boolean(profile.userId || account.id || /MUSIC_U=/.test(cookie));
    return {
      provider,
      connected,
      account: connected ? {
        id: String(profile.userId || account.id || ''),
        name: profile.nickname || '网易云用户',
        avatar: profile.avatarUrl || ''
      } : null
    };
  }

  const uin = qqUin(cookie);
  if (!uin || uin === '0') return { provider, connected: false, account: null };
  return { provider, connected: true, account: { id: uin, name: `QQ ${uin}`, avatar: '' } };
}

async function startNeteaseQrLogin() {
  const keyData = neteaseResultBody(await neteaseApi.login_qr_key({}));
  const key = keyData?.data?.unikey;
  if (!key) throw new Error('无法创建网易云登录二维码。');
  const qrData = neteaseResultBody(await neteaseApi.login_qr_create({ key, qrimg: true }));
  return { provider: 'netease', key, qrUrl: qrData?.data?.qrurl || '', qrImage: qrData?.data?.qrimg || '' };
}

async function checkNeteaseQrLogin(body) {
  const key = String(body.key || '').trim();
  if (!key) throw new Error('缺少二维码登录 key。');
  const data = neteaseResultBody(await neteaseApi.login_qr_check({ key, noCookie: true }));
  return {
    provider: 'netease',
    code: Number(data.code || 0),
    message: data.message || '',
    cookie: data.cookie || ''
  };
}

function qqMusicHeaders(cookie = '') {
  return {
    Accept: 'application/json, text/plain, */*',
    Referer: 'https://y.qq.com/',
    Origin: 'https://y.qq.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AgentOSMusic/0.1',
    ...(cookie ? { Cookie: cookie } : {})
  };
}

function qqUin(cookie = '') {
  for (const name of ['uin', 'qqmusic_uin', 'p_uin', 'pt2gguin', 'loginUin', 'wxuin']) {
    const match = cookie.match(new RegExp(`${name}=o?(\\d+)`, 'i'));
    if (match) return match[1];
  }
  return '0';
}

function qqGuid(cookie = '') {
  return cookie.match(/pgv_pvid=([^;]+)/)?.[1]?.replace(/\D/g, '') || '10000';
}

function qqGtk(cookie = '') {
  const key = cookie.match(/(?:qqmusic_key|qm_keyst|music_key|p_skey|skey)=([^;]+)/)?.[1] || '';
  let hash = 5381;
  for (const char of key) hash += (hash << 5) + char.charCodeAt(0);
  return hash & 0x7fffffff;
}

async function fetchBrowserSearchResults(query) {
  const providers = [
    fetchBingSearchResults(query),
    fetchJinaSearchResults(query),
    ...SEARCH_SEARX_INSTANCES.map((instanceUrl) => fetchSearxSearchResults(query, instanceUrl))
  ];
  const settled = await Promise.allSettled(providers);
  const fulfilled = settled
    .filter((item) => item.status === 'fulfilled')
    .map((item) => item.value);
  const firstWithResults = fulfilled.find((items) => items.length);
  if (firstWithResults) return firstWithResults;
  if (fulfilled.length) return [];
  throw settled.find((item) => item.status === 'rejected')?.reason || new Error('Search providers failed.');
}

async function fetchBingSearchResults(query) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  const response = await fetchWithTimeout(url, {
    headers: browserSearchHeaders('text/html')
  });
  if (!response.ok) throw new Error(`Bing search returned ${response.status}`);
  return parseBingSearchResults(await response.text());
}

async function fetchJinaSearchResults(query) {
  const response = await fetchWithTimeout(`https://s.jina.ai/${encodeURIComponent(query)}`, {
    headers: browserSearchHeaders('text/plain')
  });
  if (!response.ok) throw new Error(`Jina search returned ${response.status}`);
  return parseJinaSearchResults(await response.text());
}

async function fetchSearxSearchResults(query, instanceUrl) {
  const url = `${instanceUrl}?q=${encodeURIComponent(query)}&format=json&language=auto`;
  const response = await fetchWithTimeout(url, {
    headers: browserSearchHeaders('application/json')
  });
  if (!response.ok) throw new Error(`SearXNG search returned ${response.status}`);
  const data = await response.json();
  return normalizeSearchResults((data.results || []).map((item) => ({
    title: item.title,
    url: item.url,
    snippet: item.content || item.description || item.pretty_url,
    source: 'SearXNG'
  })));
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function parseBingSearchResults(html) {
  const results = [];
  const itemPattern = /<li class="b_algo"[\s\S]*?(?=<li class="b_algo"|<\/ol>|$)/gi;
  let match = itemPattern.exec(html);

  while (match && results.length < SEARCH_RESULT_LIMIT) {
    const block = match[0];
    const titleMatch = block.match(/<h2[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (titleMatch) {
      const resultUrl = normalizeSearchResultUrl(titleMatch[1]);
      if (resultUrl && /^https?:\/\//i.test(resultUrl)) {
        const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
        results.push({
          title: cleanSearchText(stripHtml(titleMatch[2])) || titleFromUrl(resultUrl),
          url: resultUrl,
          displayUrl: detailFromUrl(resultUrl),
          snippet: cleanSearchText(stripHtml(snippetMatch?.[1] || '')).slice(0, 260),
          source: 'Bing'
        });
      }
    }
    match = itemPattern.exec(html);
  }

  return normalizeSearchResults(results);
}

function parseJinaSearchResults(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const results = [];
  const seen = new Set();

  for (let index = 0; index < lines.length; index += 1) {
    const titleMatch = lines[index].match(/^Title:\s*(.+)$/i);
    if (!titleMatch) continue;

    let resultUrl = '';
    let cursor = index + 1;
    for (; cursor < lines.length; cursor += 1) {
      const urlMatch = lines[cursor].match(/^(?:URL Source|URL):\s*(https?:\/\/\S+)/i);
      if (urlMatch) {
        resultUrl = urlMatch[1].trim();
        break;
      }
      if (/^Title:\s*/i.test(lines[cursor])) break;
    }

    if (!resultUrl || seen.has(resultUrl)) continue;

    const snippetLines = [];
    for (let snippetIndex = cursor + 1; snippetIndex < lines.length; snippetIndex += 1) {
      const line = lines[snippetIndex].trim();
      if (/^Title:\s*/i.test(line)) break;
      if (!line || /^(Markdown Content|Published Time|Warning):/i.test(line)) continue;
      snippetLines.push(line);
      if (snippetLines.join(' ').length > 260) break;
    }

    seen.add(resultUrl);
    results.push({
      title: cleanSearchText(titleMatch[1]) || titleFromUrl(resultUrl),
      url: resultUrl,
      displayUrl: detailFromUrl(resultUrl),
      snippet: cleanSearchText(snippetLines.join(' ')).slice(0, 260),
      source: 'Jina'
    });

    if (results.length >= SEARCH_RESULT_LIMIT) break;
  }

  if (results.length) return results;

  const linkPattern = /\[([^\]]{3,180})]\((https?:\/\/[^)\s]+)\)/g;
  let match = linkPattern.exec(markdown);
  while (match && results.length < SEARCH_RESULT_LIMIT) {
    const [, title, resultUrl] = match;
    if (!seen.has(resultUrl) && !/jina\.ai\/?(?:$|[?#])/i.test(resultUrl)) {
      seen.add(resultUrl);
      results.push({
        title: cleanSearchText(title) || titleFromUrl(resultUrl),
        url: resultUrl,
        displayUrl: detailFromUrl(resultUrl),
        snippet: '',
        source: 'Jina'
      });
    }
    match = linkPattern.exec(markdown);
  }

  return results;
}

function browserSearchHeaders(accept) {
  return {
    Accept: accept,
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'User-Agent': 'Mozilla/5.0 AgentOSBrowser/0.1'
  };
}

function normalizeSearchResults(items) {
  const seen = new Set();
  return items
    .filter((item) => item?.url && /^https?:\/\//i.test(item.url))
    .filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    })
    .slice(0, SEARCH_RESULT_LIMIT)
    .map((item) => ({
      title: cleanSearchText(item.title) || titleFromUrl(item.url),
      url: item.url,
      displayUrl: detailFromUrl(item.url),
      snippet: cleanSearchText(item.snippet || item.content || '').slice(0, 260),
      source: item.source || ''
    }));
}

function normalizeSearchResultUrl(rawUrl) {
  const decoded = decodeHtml(rawUrl);
  try {
    const parsed = new URL(decoded, 'https://www.bing.com');
    const duckTarget = parsed.searchParams.get('uddg');
    if (duckTarget) return decodeHtml(duckTarget);

    const bingTarget = parsed.searchParams.get('u');
    if (/bing\.com$/i.test(parsed.hostname) && bingTarget) {
      const encoded = bingTarget.startsWith('a1') ? bingTarget.slice(2) : bingTarget;
      const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
      const target = Buffer.from(base64, 'base64').toString('utf8');
      if (/^https?:\/\//i.test(target)) return target;
    }

    return parsed.href;
  } catch (_) {
    return decoded;
  }
}

function cleanSearchText(value) {
  return String(value || '')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[[^\]]*]\([^)]*\)/g, '')
    .replace(/[#>*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtml(value) {
  return decodeHtml(String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '));
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function titleFromUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.replace(/^www\./, '') || rawUrl;
  } catch (_) {
    return rawUrl;
  }
}

function detailFromUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch (_) {
    return rawUrl;
  }
}

function corsHeaders(extra = {}) {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, accept',
    ...extra
  };
}

function writeJson(res, status, payload) {
  res.writeHead(status, corsHeaders({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  }));
  res.end(JSON.stringify(payload));
}

async function handleMessage(ws, raw) {
  const packet = parsePacket(raw);
  const type = String(packet.type || packet.event || packet.kind || '');

  if (type === 'agent.hello') {
    send(ws, 'agent.hello', {
      text: 'Connected to Hermes System Bridge.',
      capabilities: TOOL_SPECS
    });
    return;
  }

  if (type === 'agent.stop') {
    send(ws, 'agent.final', { done: true, reply: 'No long-running system action is active.' });
    return;
  }

  if (type === 'live2d.control') {
    send(ws, 'live2d.control', {
      status: 'acknowledged',
      live2d: packet.live2d || packet.intent || packet.control || packet
    });
    return;
  }

  if (type === 'system.action') {
    const requestId = packet.requestId || createId('sys');
    const action = normalizeAction(packet);
    await executeActionBatch(ws, requestId, [action], { finalPrefix: 'System action completed.' });
    return;
  }

  if (type === 'agent.run') {
    const requestId = packet.requestId || createId('run');
    const input = String(packet.input || packet.prompt || packet.text || '');
    const actions = planActions(input);
    await executeActionBatch(ws, requestId, actions, { input });
    return;
  }

  send(ws, 'error', { message: `Unsupported packet type: ${type || '(missing)'}`, raw: packet });
}

async function executeActionBatch(ws, requestId, actions, options = {}) {
  send(ws, 'tool.started', {
    id: requestId,
    name: 'agent.run',
    status: 'running',
    detail: options.input || `${actions.length} action(s)`
  });

  const results = [];
  for (const action of actions) {
    const id = createId('tool');
    send(ws, 'tool.started', {
      id,
      name: action.name,
      status: 'running',
      detail: describeAction(action)
    });

    try {
      const result = await runAction(action);
      results.push({ action, ok: true, result });
      send(ws, 'tool.result', {
        id,
        name: action.name,
        status: 'done',
        detail: result.summary || 'done',
        result
      });
    } catch (error) {
      const result = { summary: error.message || String(error) };
      results.push({ action, ok: false, result });
      send(ws, 'tool.error', {
        id,
        name: action.name,
        status: 'error',
        detail: result.summary,
        error: result
      });
    }
  }

  const failed = results.filter((item) => !item.ok);
  const ui = mergeUiPatches(results.map((item) => item.result?.data?.ui || item.result?.ui));
  send(ws, 'agent.final', {
    requestId,
    done: true,
    status: failed.length ? 'completed_with_errors' : 'completed',
    reply: formatFinalReply(results, options.finalPrefix),
    results,
    ui,
    live2d: {
      emotion: failed.length ? 'surprised' : 'happy',
      actions: failed.length ? ['look_at_chat', 'nod'] : ['smile', 'nod'],
      reply: failed.length ? 'Some system actions need attention.' : 'System action complete.'
    }
  });
}

async function runAction(action) {
  const args = action.args || {};
  switch (action.name) {
    case 'agentos.capabilities':
      return { summary: 'Agent OS capabilities are available.', data: capabilitiesPayload() };
    case 'agentos.petMode':
      return setPetModeAction(args);
    case 'system.status':
      return { summary: 'System bridge status ready.', data: statusPayload() };
    case 'system.listApps':
      return {
        summary: `${APP_REGISTRY.length} launch shortcuts available.`,
        data: APP_REGISTRY.map(({ id, label, target, aliases }) => ({ id, label, target, aliases }))
      };
    case 'system.launchApp':
      return launchApp(args);
    case 'system.listWindows':
      return listWindows(args);
    case 'system.activeWindow':
      return activeWindow();
    case 'system.focusWindow':
      return focusWindow(args);
    case 'system.hotkey':
      return sendHotkey(args);
    case 'system.typeText':
      return typeText(args);
    case 'system.screenshot':
      return screenshot(args);
    case 'fs.list':
      return listFiles(args);
    case 'fs.readFile':
      return readTextFile(args);
    case 'fs.writeFile':
      return writeTextFile(args);
    case 'shell.run':
      return runShell(args);
    default:
      throw new Error(`Unknown action: ${action.name}`);
  }
}

function planActions(input) {
  const explicit = parseExplicitActions(input);
  if (explicit.length) return explicit;

  const text = input.trim();
  const lower = text.toLowerCase();
  if (/桌宠|pet\s*-?\s*mode|desktop\s+pet/i.test(text)) {
    const enabled = !/(退出|关闭|关掉|disable|off|exit|leave)/i.test(text);
    return [{ name: 'agentos.petMode', args: { enabled } }];
  }
  if (/agent-os|agent os|全部功能|所有功能|capabilities/i.test(text)) {
    return [{ name: 'agentos.capabilities', args: {} }];
  }
  if (!text || /capabilities|tools|能力|工具|状态|status/.test(lower)) {
    return [{ name: 'system.status', args: {} }];
  }
  if (/窗口|windows|window/.test(lower) && /列出|查看|显示|list|show/.test(lower)) {
    return [{ name: 'system.listWindows', args: {} }];
  }
  if (/当前窗口|前台窗口|active window|foreground/.test(lower)) {
    return [{ name: 'system.activeWindow', args: {} }];
  }
  if (/应用|apps|app shortcuts/.test(lower) && /列出|查看|显示|list|show/.test(lower)) {
    return [{ name: 'system.listApps', args: {} }];
  }
  if (/截图|screenshot|screen shot/.test(lower)) {
    return [{ name: 'system.screenshot', args: {} }];
  }

  const app = appFromLaunchRequest(text);
  if (app) return [{ name: 'system.launchApp', args: { app } }];

  return [{
    name: 'system.status',
    args: {
      note: 'No natural-language system action matched. Send explicit JSON actions for precise control.'
    }
  }];
}

function parseExplicitActions(input) {
  const candidates = [];
  const trimmed = String(input || '').trim();
  if (!trimmed) return [];
  candidates.push(trimmed);

  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fence?.[1]) candidates.push(fence[1].trim());

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const rawActions = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.actions)
          ? parsed.actions
          : [parsed.action ? { name: parsed.action, args: parsed.args || parsed.params || {} } : parsed];
      return rawActions.map(normalizeAction).filter((item) => item.name);
    } catch (_) {
      // Try the next candidate.
    }
  }
  return [];
}

function normalizeAction(value = {}) {
  const name = value.name || value.tool || value.action || value.type;
  const args = value.args || value.params || value.arguments || {};
  const passThrough = { ...value };
  delete passThrough.name;
  delete passThrough.tool;
  delete passThrough.action;
  delete passThrough.type;
  delete passThrough.args;
  delete passThrough.params;
  delete passThrough.arguments;
  return {
    name: String(name || '').trim(),
    args: { ...passThrough, ...args }
  };
}

function appFromLaunchRequest(text) {
  const lower = normalizeLooseText(text);
  if (!/(打开|启动|运行|open|launch|start)/i.test(text)) return '';
  const matched = findApp(lower);
  return matched?.id || '';
}

function findApp(value) {
  const normalized = normalizeLooseText(value);
  return APP_REGISTRY.find((app) => {
    return app.id === normalized
      || normalizeLooseText(app.label) === normalized
      || app.aliases.some((alias) => normalized.includes(normalizeLooseText(alias)));
  });
}

async function launchApp(args) {
  const appHint = String(args.app || args.id || args.name || '').trim();
  const matched = appHint ? findApp(appHint) : null;
  const target = String(args.target || args.path || matched?.target || appHint).trim();
  if (!target) throw new Error('system.launchApp requires args.app or args.target.');

  const launchArgs = Array.isArray(args.arguments)
    ? args.arguments.map(String)
    : Array.isArray(args.args)
      ? args.args.map(String)
      : args.url
        ? [String(args.url)]
        : [];

  await startProcess(target, launchArgs);
  return {
    summary: `Launched ${matched?.label || target}.`,
    data: { app: matched?.id || '', target, arguments: launchArgs }
  };
}

async function listWindows(args = {}) {
  const windows = await readWindows();
  const query = normalizeLooseText(args.query || args.title || args.process || '');
  const filtered = query
    ? windows.filter((item) => normalizeLooseText(`${item.title} ${item.processName} ${item.className}`).includes(query))
    : windows;
  return {
    summary: `${filtered.length} visible window(s).`,
    data: filtered
  };
}

async function activeWindow() {
  const windows = await readWindows();
  const active = windows.find((item) => item.foreground) || null;
  return {
    summary: active ? `Active window: ${active.title}` : 'No active window found.',
    data: active
  };
}

async function focusWindow(args) {
  const handle = await resolveWindowHandle(args);
  if (!handle) throw new Error('No matching window found to focus.');

  await runPowerShell(`
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Focus {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
"@
$handle = [IntPtr][Int64]::Parse($env:HERMES_WINDOW_HANDLE)
[Win32Focus]::ShowWindowAsync($handle, 9) | Out-Null
[Win32Focus]::SetForegroundWindow($handle) | Out-Null
`, { HERMES_WINDOW_HANDLE: String(handle) });

  return { summary: `Focused window ${handle}.`, data: { handle } };
}

async function sendHotkey(args) {
  ensureInputEnabled();
  const key = normalizeHotkey(args.hotkey || args.keys || args.key || '');
  const sendKeys = HOTKEYS.get(key);
  if (!sendKeys) {
    throw new Error(`Unsupported hotkey "${args.hotkey || args.keys || args.key || ''}". Allowed: ${[...HOTKEYS.keys()].join(', ')}`);
  }
  await sendKeysWait(sendKeys);
  return { summary: `Sent hotkey ${key}.`, data: { hotkey: key } };
}

async function typeText(args) {
  ensureInputEnabled();
  const text = String(args.text ?? args.value ?? '');
  if (!text) throw new Error('system.typeText requires args.text.');
  await pasteText(text);
  return {
    summary: `Typed ${text.length} character(s) into the active window.`,
    data: { characters: text.length, method: 'clipboard-paste' }
  };
}

async function screenshot(args = {}) {
  await fs.mkdir(OUTPUT_ROOT, { recursive: true });
  const filename = args.filename
    ? path.basename(String(args.filename))
    : `screenshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
  const outputPath = path.join(OUTPUT_ROOT, filename.endsWith('.png') ? filename : `${filename}.png`);

  await runPowerShell(`
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bounds.Size)
$bitmap.Save($env:HERMES_SCREENSHOT_PATH, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
`, { HERMES_SCREENSHOT_PATH: outputPath }, 30000);

  return {
    summary: `Screenshot saved to ${outputPath}.`,
    data: { path: outputPath }
  };
}

async function listFiles(args) {
  const dir = resolveAllowedPath(args.path || args.dir || '.');
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const items = await Promise.all(entries.slice(0, 500).map(async (entry) => {
    const fullPath = path.join(dir, entry.name);
    const stats = await fs.stat(fullPath).catch(() => null);
    return {
      name: entry.name,
      path: fullPath,
      type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
      size: stats?.size || 0,
      updatedAt: stats?.mtime?.toISOString?.() || ''
    };
  }));
  return {
    summary: `${items.length} item(s) in ${dir}.`,
    data: items
  };
}

async function readTextFile(args) {
  const filePath = resolveAllowedPath(args.path || args.file || '');
  const stats = await fs.stat(filePath);
  if (!stats.isFile()) throw new Error(`${filePath} is not a file.`);
  if (stats.size > MAX_FILE_BYTES) throw new Error(`${filePath} is larger than HERMES_MAX_FILE_BYTES (${MAX_FILE_BYTES}).`);
  const text = await fs.readFile(filePath, 'utf8');
  return {
    summary: `Read ${text.length} character(s) from ${filePath}.`,
    data: { path: filePath, text }
  };
}

async function writeTextFile(args) {
  if (!WRITE_ENABLED) throw new Error('File writing is disabled. Set HERMES_ALLOW_WRITE=1 to enable fs.writeFile.');
  const filePath = resolveAllowedPath(args.path || args.file || '');
  const content = String(args.content ?? args.text ?? '');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
  return {
    summary: `Wrote ${content.length} character(s) to ${filePath}.`,
    data: { path: filePath, characters: content.length }
  };
}

async function runShell(args) {
  if (!SHELL_ENABLED) throw new Error('shell.run is disabled. Set HERMES_ALLOW_SHELL=1 to enable it.');
  const command = String(args.command || args.script || '').trim();
  if (!command) throw new Error('shell.run requires args.command.');
  const cwd = resolveAllowedPath(args.cwd || WORKSPACE_ROOT);
  const result = await runPowerShell(command, {}, Number(args.timeoutMs || 30000), cwd);
  return {
    summary: result.stdout.trim().split(/\r?\n/).slice(-1)[0] || 'Shell command completed.',
    data: result
  };
}

function capabilitiesPayload() {
  return {
    frontend: {
      apps: ['Hermes', 'Browser', 'Notepad', 'Calculator', 'Clock', 'Weather', 'App Center', 'Yachiyo', 'Stream', 'Settings'],
      modes: ['operate', 'plan', 'review', 'pet-mode'],
      live2d: ['semantic-intents', 'presets', 'local-cubism-runtime', 'vtube-studio-bridge'],
      uiActions: AGENT_OS_UI_ACTIONS,
      appActions: AGENT_OS_APP_ACTIONS,
      petModel: {
        directApi: true,
        hermesChannel: false,
        settingsKeys: ['llmProvider', 'llmApiUrl', 'llmApiKey', 'llmModel', 'petSystemPrompt']
      }
    },
    runtime: {
      websocket: `ws://${HOST}:${PORT}${WS_PATH}`,
      tools: TOOL_SPECS.map((tool) => tool.name),
      permissions: {
        shell: SHELL_ENABLED,
        write: WRITE_ENABLED,
        input: INPUT_ENABLED
      }
    },
    systemLayer: {
      level: 'user-mode-win32-runtime',
      kernelDriver: false,
      reason: 'Kernel drivers require signing, isolation, and a separate safety boundary; Agent OS should call a privileged user-mode runtime first.'
    },
    ui: {
      petMode: true,
      residentOverlay: true
    }
  };
}

function setPetModeAction(args = {}) {
  const raw = args.enabled ?? args.petMode ?? args.on ?? args.mode;
  const enabled = typeof raw === 'string'
    ? !['0', 'false', 'off', 'disable', 'disabled', 'exit'].includes(raw.trim().toLowerCase())
    : raw === undefined
      ? true
      : Boolean(raw);
  return {
    summary: `Requested Agent OS resident desktop pet ${enabled ? 'on' : 'off'}.`,
    data: {
      enabled,
      ui: { petMode: enabled }
    }
  };
}

async function resolveWindowHandle(args = {}) {
  if (args.handle) return Number(args.handle);
  const windows = await readWindows();
  const query = normalizeLooseText(args.query || args.title || args.process || args.processName || '');
  if (!query) return 0;
  const match = windows.find((item) => {
    const haystack = normalizeLooseText(`${item.title} ${item.processName} ${item.className}`);
    return haystack.includes(query);
  });
  return match?.handle || 0;
}

async function readWindows() {
  const { stdout } = await runPowerShell(`
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class Win32Windows {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
$items = New-Object System.Collections.Generic.List[object]
$foreground = [Win32Windows]::GetForegroundWindow()
[Win32Windows]::EnumWindows({
  param([IntPtr]$hWnd, [IntPtr]$lParam)
  if (-not [Win32Windows]::IsWindowVisible($hWnd)) { return $true }
  $length = [Win32Windows]::GetWindowTextLength($hWnd)
  if ($length -le 0) { return $true }
  $titleBuilder = New-Object System.Text.StringBuilder ($length + 1)
  [Win32Windows]::GetWindowText($hWnd, $titleBuilder, $titleBuilder.Capacity) | Out-Null
  $classBuilder = New-Object System.Text.StringBuilder 256
  [Win32Windows]::GetClassName($hWnd, $classBuilder, $classBuilder.Capacity) | Out-Null
  $pid = 0
  [Win32Windows]::GetWindowThreadProcessId($hWnd, [ref]$pid) | Out-Null
  $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
  $rect = New-Object Win32Windows+RECT
  [Win32Windows]::GetWindowRect($hWnd, [ref]$rect) | Out-Null
  $items.Add([pscustomobject]@{
    handle = $hWnd.ToInt64()
    title = $titleBuilder.ToString()
    processId = [int]$pid
    processName = if ($process) { $process.ProcessName } else { "" }
    className = $classBuilder.ToString()
    foreground = $hWnd -eq $foreground
    bounds = @{
      x = $rect.Left
      y = $rect.Top
      width = $rect.Right - $rect.Left
      height = $rect.Bottom - $rect.Top
    }
  }) | Out-Null
  return $true
}, [IntPtr]::Zero) | Out-Null
$items | Sort-Object -Property foreground -Descending | ConvertTo-Json -Depth 5
`, {}, 30000);
  const parsed = JSON.parse(stdout || '[]');
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function startProcess(target, args = []) {
  await runPowerShell(`
$target = $env:HERMES_TARGET
$arguments = @()
if ($env:HERMES_ARGUMENTS_JSON) {
  $arguments = ConvertFrom-Json $env:HERMES_ARGUMENTS_JSON
}
if ($arguments.Count -gt 0) {
  Start-Process -FilePath $target -ArgumentList $arguments
} else {
  Start-Process -FilePath $target
}
`, {
    HERMES_TARGET: target,
    HERMES_ARGUMENTS_JSON: JSON.stringify(args)
  });
}

async function sendKeysWait(keys) {
  await runPowerShell(`
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait($env:HERMES_SEND_KEYS)
`, { HERMES_SEND_KEYS: keys });
}

async function pasteText(text) {
  await runPowerShell(`
Add-Type -AssemblyName System.Windows.Forms
$previous = ""
$hadText = [System.Windows.Forms.Clipboard]::ContainsText()
if ($hadText) { $previous = [System.Windows.Forms.Clipboard]::GetText() }
[System.Windows.Forms.Clipboard]::SetText($env:HERMES_TEXT)
[System.Windows.Forms.SendKeys]::SendWait("^v")
Start-Sleep -Milliseconds 80
if ($hadText) { [System.Windows.Forms.Clipboard]::SetText($previous) }
`, { HERMES_TEXT: text });
}

function runPowerShell(script, env = {}, timeoutMs = 15000, cwd = WORKSPACE_ROOT) {
  return new Promise((resolve, reject) => {
    execFile(POWERSHELL, [
      '-NoLogo',
      '-NoProfile',
      '-Sta',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      script
    ], {
      cwd,
      env: { ...process.env, ...env },
      maxBuffer: 12 * 1024 * 1024,
      timeout: timeoutMs,
      windowsHide: true
    }, (error, stdout, stderr) => {
      if (error) {
        const detail = stderr?.trim() || stdout?.trim() || error.message;
        reject(new Error(detail));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function resolveAllowedPath(rawPath) {
  if (!rawPath) throw new Error('Path is required.');
  const resolved = path.resolve(WORKSPACE_ROOT, String(rawPath));
  const allowed = ALLOWED_ROOTS.some((root) => isPathInside(resolved, root));
  if (!allowed) {
    throw new Error(`Path is outside allowed roots: ${resolved}`);
  }
  return resolved;
}

function isPathInside(target, root) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function readPathList(value) {
  return String(value || '')
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => path.resolve(item));
}

function parsePacket(raw) {
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw || '');
  try {
    return JSON.parse(text);
  } catch (_) {
    return { type: 'text', text };
  }
}

function send(ws, type, data = {}) {
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify({
    type,
    data,
    sentAt: new Date().toISOString()
  }));
}

function statusPayload() {
  return {
    name: 'Hermes System Bridge',
    version: '0.1.0',
    host: os.hostname(),
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    pid: process.pid,
    workspace: WORKSPACE_ROOT,
    output: OUTPUT_ROOT,
    allowedRoots: ALLOWED_ROOTS,
    permissions: {
      shell: SHELL_ENABLED,
      write: WRITE_ENABLED,
      input: INPUT_ENABLED
    },
    tools: TOOL_SPECS.map((tool) => tool.name)
  };
}

function formatFinalReply(results, prefix = '') {
  const lines = results.map((item, index) => {
    const mark = item.ok ? 'OK' : 'ERR';
    return `${index + 1}. ${mark} ${item.action.name}: ${item.result.summary || ''}`;
  });
  const intro = prefix || 'System action batch completed.';
  return [intro, ...lines].join('\n');
}

function mergeUiPatches(patches) {
  return patches.reduce((merged, patch) => {
    if (!patch || typeof patch !== 'object') return merged;
    return { ...merged, ...patch };
  }, {});
}

function describeAction(action) {
  try {
    return JSON.stringify(action.args || {});
  } catch (_) {
    return action.name;
  }
}

function normalizeHotkey(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '').replace(/control/g, 'ctrl');
}

function normalizeLooseText(value) {
  return String(value || '').trim().toLowerCase().replace(/[，。！？,.!?;:]/g, ' ').replace(/\s+/g, ' ');
}

function ensureInputEnabled() {
  if (!INPUT_ENABLED) throw new Error('Keyboard/text input is disabled. Set HERMES_ALLOW_INPUT=1 to enable it.');
}

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
}
