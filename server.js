const express = require('express');
const { WebSocketServer } = require('ws');
const { execSync } = require('child_process');
const cors = require('cors');
const http = require('http');
const fs = require('fs');

// Write cookies from base64 env variable
if (process.env.YT_COOKIES_B64) {
  const decoded = Buffer.from(process.env.YT_COOKIES_B64, 'base64').toString('utf8');
  fs.writeFileSync('/tmp/cookies.txt', decoded);
  console.log('Cookies written from base64 environment variable');
}

// Get node path and tell yt-dlp to use it
const NODE_PATH = process.execPath;
const YTDLP = process.env.YTDLP_PATH || 'yt-dlp';
const COOKIES = fs.existsSync('/tmp/cookies.txt') ? '--cookies /tmp/cookies.txt' : '';
const JS_RUNTIME = `--js-runtimes "node:${NODE_PATH}"`;

console.log('Node path:', NODE_PATH);
console.log('Cookies file exists:', fs.existsSync('/tmp/cookies.txt'));

const app = express();
app.use(cors());
app.use(express.json());

const rooms = {};

function broadcastToRoom(roomCode, data, excludeWs = null) {
  const room = rooms[roomCode];
  if (!room) return;
  const msg = JSON.stringify(data);
  room.clients.forEach((name, client) => {
    if (client !== excludeWs && client.readyState === 1) {
      client.send(msg);
    }
  });
}

function broadcastAll(roomCode, data) {
  broadcastToRoom(roomCode, data, null);
}

// GET /audio?url=YOUTUBE_URL
app.get('/audio', (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'No URL provided' });
  const cleanUrl = url.split('&')[0];
  try {
    const streamUrl = execSync(
      `${YTDLP} --no-check-certificates ${COOKIES} ${JS_RUNTIME} -f "bestaudio/best" --get-url "${cleanUrl}"`,
      { timeout: 60000 }
    ).toString().trim().split('\n')[0];
    res.json({ streamUrl });
  } catch (e) {
    res.status(500).json({ error: 'yt-dlp failed', detail: e.message });
  }
});

// GET /info?url=YOUTUBE_URL
app.get('/info', (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'No URL provided' });
  const cleanUrl = url.split('&')[0];
  try {
    const raw = execSync(
      `${YTDLP} --no-check-certificates ${COOKIES} ${JS_RUNTIME} --print "%(title)s|||%(uploader)s|||%(duration)s" "${cleanUrl}"`,
      { timeout: 60000 }
    ).toString().trim();
    const [title, uploader, duration] = raw.split('|||');
    const mins = Math.floor(Number(duration) / 60);
    const secs = String(Number(duration) % 60).padStart(2, '0');
    res.json({ title, artist: uploader, dur: `${mins}:${secs}` });
  } catch (e) {
    res.status(500).json({ error: 'yt-dlp failed', detail: e.message });
  }
});

// GET /search?q=QUERY
app.get('/search', (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'No query' });
  try {
    const raw = execSync(
      `${YTDLP} --no-check-certificates ${COOKIES} ${JS_RUNTIME} "ytsearch5:${q}" --print "%(id)s|||%(title)s|||%(uploader)s|||%(duration)s" --no-download`,
      { timeout: 60000 }
    ).toString().trim();
    const results = raw.split('\n').filter(Boolean).map(line => {
      const [id, title, uploader, duration] = line.split('|||');
      const mins = Math.floor(Number(duration) / 60);
      const secs = String(Number(duration) % 60).padStart(2, '0');
      return {
        id,
        title,
        artist: uploader,
        dur: `${mins}:${secs}`,
        url: `https://www.youtube.com/watch?v=${id}`
      };
    });
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: 'Search failed', detail: e.message });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let currentRoom = null;
  let playerName = null;

  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    const { type, payload } = data;

    if (type === 'JOIN_ROOM') {
      const { roomCode, name } = payload;
      currentRoom = roomCode;
      playerName = name;
      if (!rooms[roomCode]) {
        rooms[roomCode] = { clients: new Map(), queue: [], currentIdx: -1, isPlaying: false, currentTime: 0 };
      }
      rooms[roomCode].clients.set(ws, name);
      ws.send(JSON.stringify({
        type: 'ROOM_STATE',
        payload: {
          queue: rooms[roomCode].queue,
          currentIdx: rooms[roomCode].currentIdx,
          isPlaying: rooms[roomCode].isPlaying,
          currentTime: rooms[roomCode].currentTime,
          players: [...rooms[roomCode].clients.values()]
        }
      }));
      broadcastToRoom(roomCode, {
        type: 'PLAYER_JOINED',
        payload: { name, players: [...rooms[roomCode].clients.values()] }
      }, ws);
    }

    if (type === 'PLAY') {
      rooms[currentRoom].currentIdx = payload.idx;
      rooms[currentRoom].isPlaying = true;
      rooms[currentRoom].currentTime = payload.time || 0;
      broadcastToRoom(currentRoom, { type: 'PLAY', payload }, ws);
    }
    if (type === 'PAUSE') {
      rooms[currentRoom].isPlaying = false;
      rooms[currentRoom].currentTime = payload.time;
      broadcastToRoom(currentRoom, { type: 'PAUSE', payload }, ws);
    }
    if (type === 'RESUME') {
      rooms[currentRoom].isPlaying = true;
      rooms[currentRoom].currentTime = payload.time;
      broadcastToRoom(currentRoom, { type: 'RESUME', payload }, ws);
    }
    if (type === 'SEEK') {
      rooms[currentRoom].currentTime = payload.time;
      broadcastToRoom(currentRoom, { type: 'SEEK', payload }, ws);
    }
    if (type === 'ADD_SONG') {
      rooms[currentRoom].queue.push(payload.track);
      broadcastToRoom(currentRoom, { type: 'ADD_SONG', payload }, ws);
    }
    if (type === 'REMOVE_SONG') {
      rooms[currentRoom].queue.splice(payload.idx, 1);
      broadcastToRoom(currentRoom, { type: 'REMOVE_SONG', payload }, ws);
    }
    if (type === 'CHAT') {
      broadcastAll(currentRoom, { type: 'CHAT', payload });
    }
    if (type === 'NEXT') {
      const room = rooms[currentRoom];
      const next = payload.shuffle
        ? Math.floor(Math.random() * room.queue.length)
        : Math.min(room.currentIdx + 1, room.queue.length - 1);
      room.currentIdx = next;
      room.isPlaying = true;
      broadcastAll(currentRoom, { type: 'PLAY', payload: { idx: next, time: 0 } });
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms[currentRoom]) {
      rooms[currentRoom].clients.delete(ws);
      if (rooms[currentRoom].clients.size === 0) {
        delete rooms[currentRoom];
      } else {
        broadcastToRoom(currentRoom, {
          type: 'PLAYER_LEFT',
          payload: { name: playerName, players: [...rooms[currentRoom].clients.values()] }
        });
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`JAMCRAFT server running on port ${PORT}`));
