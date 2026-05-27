// ── CAC Hub — Frontend Application ──

let ws = null;
let nodes = {};          // nodeId -> { id, name, url, room, model, connected, state }
let selectedNodeId = null;
let nodeLibrary = {};    // nodeId -> [cd, ...]
let currentCdSlot = null;

const PLAYER_MODES = {
  P01: 'mode.park', P02: 'mode.setup', P03: 'mode.reject',
  P04: 'mode.play', P06: 'mode.pause', P07: 'mode.search',
  P08: 'mode.scan', P20: 'mode.discUnset', P21: 'mode.loading',
  P22: 'mode.unloading',
};

// ── Init ──

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initSubTabs();
  loadSettings();
  connectWebSocket();
});

// ── Tab Navigation ──

function initTabs() {
  document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(t => {
        t.style.display = 'none';
        t.classList.remove('active');
      });
      const tab = document.getElementById('tab-' + btn.dataset.tab);
      tab.style.display = 'block';
      tab.classList.add('active');

      if (btn.dataset.tab === 'settings') renderNodeList();
    });
  });
}

function initSubTabs() {
  document.querySelectorAll('.sub-nav-btn[data-sub]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sub-nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.sub-content').forEach(s => {
        s.style.display = 'none';
        s.classList.remove('active');
      });
      const sub = document.getElementById('sub-' + btn.dataset.sub);
      sub.style.display = 'block';
      sub.classList.add('active');

      if (btn.dataset.sub === 'library' && selectedNodeId) loadLibrary();
      if (btn.dataset.sub === 'playlists' && selectedNodeId) loadPlaylists();
    });
  });
}

// ── WebSocket ──

function connectWebSocket() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}`);

  ws.onopen = () => {
    document.getElementById('wsStatus').className = 'ws-status connected';
    document.getElementById('wsStatusText').textContent = t('status.connected');
  };

  ws.onclose = () => {
    document.getElementById('wsStatus').className = 'ws-status disconnected';
    document.getElementById('wsStatusText').textContent = t('status.disconnected');
    setTimeout(connectWebSocket, 3000);
  };

  ws.onerror = () => {};

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      handleWsMessage(msg);
    } catch {}
  };
}

function handleWsMessage(msg) {
  switch (msg.type) {
    case 'init':
      // Initial state: array of nodes with status
      for (const n of msg.nodes) {
        nodes[n.id] = n;
      }
      renderDashboard();
      // Pre-load library for all connected nodes (for disc titles on dashboard)
      preloadAllLibraries();
      break;

    case 'nodeOnline':
      if (nodes[msg.nodeId]) {
        nodes[msg.nodeId].connected = true;
        if (msg.state) nodes[msg.nodeId].state = msg.state;
      }
      renderDashboard();
      if (selectedNodeId === msg.nodeId) updatePlayerUI();
      break;

    case 'nodeOffline':
      if (nodes[msg.nodeId]) {
        nodes[msg.nodeId].connected = false;
      }
      renderDashboard();
      break;

    case 'nodeState':
      if (nodes[msg.nodeId]) {
        nodes[msg.nodeId].state = msg.state;
        nodes[msg.nodeId].connected = true;
      }
      renderDashboard();
      if (selectedNodeId === msg.nodeId) updatePlayerUI();
      break;

    case 'nodeEvent':
      handleNodeEvent(msg.nodeId, msg.event);
      break;
  }
}

function handleNodeEvent(nodeId, event) {
  const node = nodes[nodeId];
  if (!node) return;
  if (!node.state) node.state = {};

  switch (event.type) {
    case 'playerState':
      if (!node.state.players) node.state.players = {};
      node.state.players[event.playerId] = event.data;
      syncTimeRef(nodeId, event.playerId, event.data);
      break;
    case 'scanProgress':
      node.state.scanner = event.data;
      break;
    case 'scanComplete':
      node.state.scanner = { scanning: false };
      break;
    case 'playModeChange':
      node.state.playModes = event.data;
      break;
  }

  // Update dashboard card
  updateNodeCard(nodeId);

  // Update detail view if this node is selected
  if (selectedNodeId === nodeId) {
    updatePlayerUI();
    if (event.type === 'scanProgress' || event.type === 'scanComplete') {
      updateScannerUI();
    }
  }
}

// ── Dashboard Rendering ──

function renderDashboard() {
  const grid = document.getElementById('nodeGrid');
  const nodeArr = Object.values(nodes);

  if (nodeArr.length === 0) {
    grid.innerHTML = `<div class="empty-state">${t('dashboard.empty')}</div>`;
    return;
  }

  grid.innerHTML = nodeArr.map(n => buildNodeCard(n)).join('');
}

function buildNodeCard(n) {
  const st = n.state || {};
  const p1 = st.players?.[1] || {};
  const p2 = st.players?.[2] || {};
  const statusClass = n.connected ? 'online' : 'offline';
  const statusText = n.connected ? t('node.online') : t('node.offline');

  return `
    <div class="node-card" id="nodeCard-${n.id}" onclick="selectNode(${n.id})">
      <div class="node-card-header">
        <div>
          <span class="node-card-name">${esc(n.name || n.state?.name || 'Node ' + n.id)}</span>
          <span class="node-card-room">${esc(n.room || n.state?.room || '')}</span>
        </div>
        <span class="status-dot ${statusClass}" title="${statusText}"></span>
      </div>
      <div class="node-card-model">${esc(n.model || st.model || '')}</div>
      <div class="node-card-players">
        ${buildMiniPlayer(1, p1, n.id)}
        ${buildMiniPlayer(2, p2, n.id)}
      </div>
      <div class="node-card-controls" onclick="event.stopPropagation()">
        <button class="mini-ctrl-btn" onclick="quickCmd(${n.id},1,'play')" title="Play P1">&#9654;</button>
        <button class="mini-ctrl-btn" onclick="quickCmd(${n.id},1,'pause')" title="Pause P1">&#9208;</button>
        <button class="mini-ctrl-btn" onclick="quickCmd(${n.id},1,'stop')" title="Stop P1">&#9209;</button>
        <button class="mini-ctrl-btn" onclick="quickCmd(${n.id},1,'next')" title="Next P1">&#9197;</button>
      </div>
    </div>`;
}

function buildMiniPlayer(pid, state, nodeId) {
  const mode = state.mode || '';
  const modeLabel = t(PLAYER_MODES[mode] || 'mode.unknown');
  const modeClass = mode === 'P04' ? 'playing' : mode === 'P06' ? 'paused' :
                    (mode === 'P21' || mode === 'P22') ? 'loading' : 'stopped';
  const discNum = state.disc && state.disc !== 'XXX' ? parseInt(state.disc) : null;
  const lib = nodeId ? (nodeLibrary[nodeId] || []) : [];
  const cd = discNum ? lib.find(c => c.slot === discNum) : null;
  const disc = cd && cd.title ? esc(cd.title) : (discNum ? `Disc ${discNum}` : t('player.noDisc'));
  const track = state.track && state.track !== 'XX' ? `Tr ${state.track}` : '';

  // Sync time ref so interpolation works immediately
  if (nodeId && state.mode) syncTimeRef(nodeId, pid, state);
  const timeLine = nodeId ? getTimeLineStr(nodeId, pid) : '';

  return `
    <div class="mini-player">
      <div class="mini-player-label">Player ${pid}</div>
      <div class="mini-player-mode ${modeClass}">${modeLabel}</div>
      <div class="mini-player-disc">${disc} ${track}</div>
      <div class="mini-player-time" id="miniTime-${nodeId}-${pid}">${timeLine}</div>
    </div>`;
}

function updateNodeCard(nodeId) {
  const card = document.getElementById('nodeCard-' + nodeId);
  if (!card) return;
  const n = nodes[nodeId];
  if (!n) return;

  // Update status dot
  const dot = card.querySelector('.status-dot');
  if (dot) {
    dot.className = `status-dot ${n.connected ? 'online' : 'offline'}`;
    dot.title = n.connected ? t('node.online') : t('node.offline');
  }

  // Update mini players in place
  const st = n.state || {};
  const playersDiv = card.querySelector('.node-card-players');
  if (playersDiv) {
    playersDiv.innerHTML = buildMiniPlayer(1, st.players?.[1] || {}, nodeId) + buildMiniPlayer(2, st.players?.[2] || {}, nodeId);
  }
}

// ── Node Selection (Detail View) ──

function selectNode(nodeId) {
  selectedNodeId = nodeId;
  const node = nodes[nodeId];
  if (!node) return;

  document.getElementById('nodeGrid').style.display = 'none';
  document.getElementById('nodeDetail').style.display = 'block';

  document.getElementById('detailNodeName').textContent = node.name || node.state?.name || 'Node ' + nodeId;
  document.getElementById('detailNodeRoom').textContent = node.room || node.state?.room || '';
  document.getElementById('detailNodeModel').textContent = node.model || node.state?.model || '';
  document.getElementById('detailOpenLink').href = node.url || '#';

  // Reset to player sub-tab
  document.querySelectorAll('.sub-nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.sub-nav-btn[data-sub="player"]').classList.add('active');
  document.querySelectorAll('.sub-content').forEach(s => { s.style.display = 'none'; s.classList.remove('active'); });
  document.getElementById('sub-player').style.display = 'block';
  document.getElementById('sub-player').classList.add('active');

  updatePlayerUI();
  loadPlayModes();
  loadLibrary(); // Pre-load for disc info
}

function showDashboard() {
  selectedNodeId = null;
  document.getElementById('nodeGrid').style.display = '';
  document.getElementById('nodeDetail').style.display = 'none';
  renderDashboard();
}

// ── Time Interpolation (local 1s tick per player) ──
// Key: "nodeId-playerId" → { trackSec, discSec, localMs, playing, lastPioneerTrack, lastPioneerDisc }
const timeRefs = {};

function getTimeRef(nodeId, pid) {
  const key = nodeId + '-' + pid;
  if (!timeRefs[key]) {
    timeRefs[key] = { trackSec: 0, discSec: 0, localMs: 0, playing: false,
                      lastPioneerTrack: -1, lastPioneerDisc: -1 };
  }
  return timeRefs[key];
}

function syncTimeRef(nodeId, pid, state) {
  const ref = getTimeRef(nodeId, pid);
  const newPlaying = state.mode === 'P04';
  const pioneerDisc = (state.timeMinutes || 0) * 60 + (state.timeSeconds || 0);
  const pioneerTrack = (state.trackTimeMinutes || 0) * 60 + (state.trackTimeSeconds || 0);

  if (pioneerDisc !== ref.lastPioneerDisc || pioneerTrack !== ref.lastPioneerTrack
      || newPlaying !== ref.playing) {
    ref.lastPioneerDisc = pioneerDisc;
    ref.lastPioneerTrack = pioneerTrack;
    ref.trackSec = pioneerTrack;
    ref.discSec = pioneerDisc;
    ref.localMs = Date.now();
  }
  ref.playing = newPlaying;
}

function fmtSec(s) {
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

function getInterpolatedTime(nodeId, pid) {
  const ref = getTimeRef(nodeId, pid);
  if (ref.localMs <= 0) return '--:--';
  let trackSec = ref.trackSec;
  if (ref.playing && ref.localMs > 0) {
    trackSec += Math.floor((Date.now() - ref.localMs) / 1000);
  }
  return fmtSec(trackSec);
}

function getInterpolatedDiscTime(nodeId, pid) {
  const ref = getTimeRef(nodeId, pid);
  if (ref.localMs <= 0) return '--:--';
  let discSec = ref.discSec;
  if (ref.playing && ref.localMs > 0) {
    discSec += Math.floor((Date.now() - ref.localMs) / 1000);
  }
  return fmtSec(discSec);
}

function getDiscTotal(nodeId, pid) {
  const node = nodes[nodeId];
  const state = node?.state?.players?.[pid] || {};
  const discNum = state.disc && state.disc !== 'XXX' ? parseInt(state.disc) : null;
  if (!discNum) return '--:--';
  const lib = nodeLibrary[nodeId] || [];
  const cd = lib.find(c => c.slot === discNum);
  return cd?.total_duration_seconds ? fmtSec(cd.total_duration_seconds) : '--:--';
}

function getTimeLineStr(nodeId, pid) {
  return getInterpolatedTime(nodeId, pid) + ' | CD ' + getInterpolatedDiscTime(nodeId, pid) + ' / ' + getDiscTotal(nodeId, pid);
}

// Tick every second to update displayed time
setInterval(() => {
  // Update detail view
  if (selectedNodeId) {
    for (const pid of [1, 2]) {
      const el = document.getElementById(`p${pid}Time`);
      if (el) el.textContent = getInterpolatedTime(selectedNodeId, pid);
    }
  }
  // Update mini-player times on dashboard
  for (const nodeId of Object.keys(nodes)) {
    for (const pid of [1, 2]) {
      const el = document.getElementById(`miniTime-${nodeId}-${pid}`);
      if (el) el.textContent = getTimeLineStr(nodeId, pid);
    }
  }
}, 1000);

// ── Player UI ──

function updatePlayerUI() {
  if (!selectedNodeId) return;
  const node = nodes[selectedNodeId];
  if (!node || !node.state) return;

  for (const pid of [1, 2]) {
    const p = node.state.players?.[pid] || {};
    const prefix = `p${pid}`;

    // Mode
    const mode = p.mode || '';
    const modeText = t(PLAYER_MODES[mode] || 'mode.unknown');
    document.getElementById(prefix + 'Mode').textContent = modeText;

    // Time (interpolated locally)
    syncTimeRef(selectedNodeId, pid, p);
    document.getElementById(prefix + 'Time').textContent = getInterpolatedTime(selectedNodeId, pid);

    // Track
    const track = p.track && p.track !== 'XX' ? p.track : '--';
    document.getElementById(prefix + 'Track').textContent = track;

    // Disc info from library
    const disc = p.disc && p.disc !== 'XXX' ? parseInt(p.disc) : null;
    const lib = nodeLibrary[selectedNodeId] || [];
    const cd = disc ? lib.find(c => c.slot === disc) : null;

    document.getElementById(prefix + 'DiscTitle').textContent = cd ? cd.title || `CD ${disc}` : '--';
    document.getElementById(prefix + 'DiscArtist').textContent = cd ? cd.artist || '' : '--';
    document.getElementById(prefix + 'DiscSlot').textContent = disc ? `Slot ${disc}` : '--';

    // Cover
    const coverImg = document.getElementById(prefix + 'Cover');
    const noCover = document.getElementById(prefix + 'NoCover');
    if (cd && cd.cover_url) {
      coverImg.src = `/api/nodes/${selectedNodeId}/cover/${cd.cover_url.replace(/^\/covers\//, '')}`;
      coverImg.style.display = 'block';
      noCover.style.display = 'none';
    } else {
      coverImg.style.display = 'none';
      noCover.style.display = 'flex';
    }

    // Track list
    renderTrackList(pid, cd, parseInt(track) || 0);

    // Track title
    const trackTitle = cd?.tracks?.find(t => t.track_number === parseInt(track));
    document.getElementById(prefix + 'TrackTitle').textContent = trackTitle ? trackTitle.title : '';
  }
}

function renderTrackList(pid, cd, activeTrack) {
  const el = document.getElementById(`p${pid}TrackList`);
  if (!cd || !cd.tracks || cd.tracks.length === 0) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = cd.tracks.map(t => `
    <div class="track-row ${t.track_number === activeTrack ? 'active' : ''}"
         onclick="playTrack(${pid}, ${cd.slot}, ${t.track_number})">
      <span class="track-num">${t.track_number}</span>
      <span class="track-name">${esc(t.title || 'Track ' + t.track_number)}</span>
      <span class="track-dur">${formatSeconds(t.duration_seconds)}</span>
    </div>`).join('');
}

function formatTime(time) {
  if (!time || time === 'XXXX') return '00:00';
  if (typeof time === 'string' && time.length === 4) {
    return time.slice(0, 2) + ':' + time.slice(2);
  }
  if (typeof time === 'number') return formatSeconds(time);
  return time;
}

function formatSeconds(sec) {
  if (!sec || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

// ── Player Commands ──

async function nodeCmd(playerId, action) {
  if (!selectedNodeId) return;
  await proxyPost(`player/${playerId}/${action}`);
}

async function setVolume(playerId, value) {
  if (!selectedNodeId) return;
  await proxyPost(`player/${playerId}/volume`, { value: parseInt(value) });
}

async function playTrack(playerId, disc, track) {
  if (!selectedNodeId) return;
  await proxyPost(`player/${playerId}/load`, { disc, track });
}

async function quickCmd(nodeId, playerId, action) {
  try {
    await fetch(`/api/nodes/${nodeId}/proxy/player/${playerId}/${action}`, { method: 'POST' });
  } catch {}
}

// ── Play Modes ──

async function loadPlayModes() {
  if (!selectedNodeId) return;
  try {
    const data = await proxyGet('playmodes');
    document.getElementById('modeContinuous').checked = !!data.continuous;
    document.getElementById('modeGapless').checked = !!data.gapless;
    document.getElementById('modeShuffle').checked = !!data.shuffle;
  } catch {}
}

async function setPlayMode(mode, value) {
  if (!selectedNodeId) return;
  await proxyPut('playmodes', { [mode]: value });
}

async function toggleShuffle() {
  const checked = document.getElementById('modeShuffle').checked;
  await proxyPut('playmodes', { shuffle: checked ? 'cd' : false });
}

// ── Library ──

async function preloadAllLibraries() {
  for (const n of Object.values(nodes)) {
    if (n.connected && !nodeLibrary[n.id]) {
      preloadNodeLibrary(n.id);
    }
  }
}

async function preloadNodeLibrary(nodeId) {
  try {
    const resp = await fetch(`/api/nodes/${nodeId}/proxy/library`);
    if (!resp.ok) return;
    nodeLibrary[nodeId] = await resp.json();
    updateNodeCard(nodeId);
    if (selectedNodeId === nodeId) updatePlayerUI();
  } catch {}
}

async function loadLibrary() {
  if (!selectedNodeId) return;
  try {
    const data = await proxyGet('library');
    nodeLibrary[selectedNodeId] = data;
    renderLibrary();
    // Re-update player UI with disc info now available
    updatePlayerUI();
  } catch {
    nodeLibrary[selectedNodeId] = [];
  }
}

function renderLibrary() {
  const lib = nodeLibrary[selectedNodeId] || [];
  const grid = document.getElementById('libraryGrid');
  document.getElementById('libCount').textContent = `${lib.length} CDs`;

  if (lib.length === 0) {
    grid.innerHTML = `<div class="empty-state">${t('library.noCds')}</div>`;
    return;
  }

  const query = (document.getElementById('libSearch').value || '').toLowerCase();
  const filtered = query
    ? lib.filter(c => (c.title || '').toLowerCase().includes(query) ||
                      (c.artist || '').toLowerCase().includes(query) ||
                      String(c.slot).includes(query))
    : lib;

  grid.innerHTML = filtered.map(cd => {
    const coverSrc = cd.cover_url
      ? `/api/nodes/${selectedNodeId}/cover/${cd.cover_url.replace(/^\/covers\//, '')}`
      : '';
    return `
      <div class="lib-card" onclick="openCdModal(${cd.slot})">
        ${coverSrc
          ? `<img class="lib-card-cover" src="${coverSrc}" alt="">`
          : `<div class="lib-card-no-cover">${cd.slot}</div>`}
        <div class="lib-card-meta">
          <div class="lib-card-title">${esc(cd.title || 'CD ' + cd.slot)}</div>
          <div class="lib-card-artist">${esc(cd.artist || '')}</div>
          <div class="lib-card-info">Slot ${cd.slot} · ${cd.total_tracks || '?'} Tracks</div>
        </div>
      </div>`;
  }).join('');
}

function filterLibrary() {
  renderLibrary();
}

// ── CD Modal ──

function openCdModal(slot) {
  const lib = nodeLibrary[selectedNodeId] || [];
  const cd = lib.find(c => c.slot === slot);
  if (!cd) return;

  currentCdSlot = slot;

  document.getElementById('cdModalTitle').textContent = cd.title || 'CD ' + slot;
  document.getElementById('cdModalArtist').textContent = cd.artist || '';
  document.getElementById('cdModalYear').textContent = cd.year || '';
  document.getElementById('cdModalGenre').textContent = cd.genre || '';
  document.getElementById('cdModalSlot').textContent = 'Slot ' + slot;

  const cover = document.getElementById('cdModalCover');
  if (cd.cover_url) {
    cover.src = `/api/nodes/${selectedNodeId}/cover/${cd.cover_url.replace(/^\/covers\//, '')}`;
    cover.style.display = 'block';
  } else {
    cover.style.display = 'none';
  }

  const tracksEl = document.getElementById('cdModalTracks');
  if (cd.tracks && cd.tracks.length) {
    tracksEl.innerHTML = cd.tracks.map(t => `
      <div class="track-row" onclick="loadCdTrack(${slot}, ${t.track_number})">
        <span class="track-num">${t.track_number}</span>
        <span class="track-name">${esc(t.title || 'Track ' + t.track_number)}</span>
        <span class="track-dur">${formatSeconds(t.duration_seconds)}</span>
      </div>`).join('');
  } else {
    tracksEl.innerHTML = '<div style="color:var(--text-dim);padding:8px">No track data</div>';
  }

  document.getElementById('cdModal').style.display = 'flex';
}

function closeCdModal() {
  document.getElementById('cdModal').style.display = 'none';
  currentCdSlot = null;
}

async function loadCdFromModal(playerId) {
  if (!currentCdSlot || !selectedNodeId) return;
  await proxyPost(`player/${playerId}/load`, { disc: currentCdSlot });
  closeCdModal();
}

async function loadCdTrack(slot, track) {
  if (!selectedNodeId) return;
  await proxyPost('player/1/load', { disc: slot, track });
  closeCdModal();
}

// ── Playlists ──

async function loadPlaylists() {
  if (!selectedNodeId) return;
  try {
    const data = await proxyGet('playlists');
    const el = document.getElementById('playlistList');
    if (!data || data.length === 0) {
      el.innerHTML = `<div class="empty-state" style="padding:20px">${t('playlists.empty')}</div>`;
      return;
    }
    el.innerHTML = data.map(pl => `
      <div class="playlist-item">
        <div>
          <div class="playlist-name">${esc(pl.name)}</div>
          <div class="playlist-count">${pl.items?.length || 0} ${t('playlists.items')}</div>
        </div>
        <div class="playlist-actions">
          <button class="btn btn-accent btn-sm" onclick="playPlaylist(${pl.id})">${t('playlists.play')}</button>
        </div>
      </div>`).join('');
  } catch {
    document.getElementById('playlistList').innerHTML = '';
  }
}

async function playPlaylist(id) {
  await proxyPost(`playlists/${id}/play`);
}

// ── Scanner ──

async function startScan() {
  if (!selectedNodeId) return;
  const start = parseInt(document.getElementById('scanStart').value) || 1;
  const end = parseInt(document.getElementById('scanEnd').value) || 300;
  await proxyPost('scanner/scan', { startSlot: start, endSlot: end });
  document.getElementById('scanProgress').style.display = 'block';
}

async function abortScan() {
  if (!selectedNodeId) return;
  await proxyPost('scanner/abort');
}

function updateScannerUI() {
  if (!selectedNodeId) return;
  const node = nodes[selectedNodeId];
  const scanner = node?.state?.scanner;

  if (!scanner || !scanner.scanning) {
    document.getElementById('scanProgress').style.display = 'none';
    return;
  }

  document.getElementById('scanProgress').style.display = 'block';
  const pct = scanner.total ? Math.round((scanner.current / scanner.total) * 100) : 0;
  document.getElementById('scanFill').style.width = pct + '%';
  document.getElementById('scanText').textContent =
    `${t('scanner.scanning')} ${scanner.currentSlot || '?'} (${scanner.current || 0}/${scanner.total || '?'})`;
}

// ── Settings ──

async function loadSettings() {
  try {
    const data = await fetch('/api/settings').then(r => r.json());
    document.getElementById('settHubName').value = data.hub_name || 'CAC Hub';
    document.getElementById('settHubPort').value = data.hub_port || '4000';
    document.getElementById('settLanguage').value = data.language || 'auto';
    setLanguage(data.language || 'auto');
  } catch {}
}

async function saveHubSettings() {
  const settings = {
    hub_name: document.getElementById('settHubName').value,
    hub_port: document.getElementById('settHubPort').value,
    language: document.getElementById('settLanguage').value,
  };
  await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  setLanguage(settings.language);
  document.querySelector('.hub-title').textContent = settings.hub_name || 'CAC Hub';
}

function renderNodeList() {
  const nodeArr = Object.values(nodes);
  const el = document.getElementById('nodeList');
  if (nodeArr.length === 0) {
    el.innerHTML = '<div style="color:var(--text-dim);padding:8px">--</div>';
    return;
  }
  el.innerHTML = nodeArr.map(n => `
    <div class="node-list-item">
      <span class="status-dot ${n.connected ? 'online' : 'offline'}"></span>
      <div class="node-list-info">
        <div class="node-list-name">${esc(n.name || 'Node ' + n.id)}</div>
        <div class="node-list-url">${esc(n.url || '')} ${n.room ? '· ' + esc(n.room) : ''}</div>
      </div>
      <div class="node-list-actions">
        <button class="btn btn-danger btn-sm" onclick="deleteNode(${n.id})">&times;</button>
      </div>
    </div>`).join('');
}

async function testNodeConnection() {
  const url = document.getElementById('addNodeUrl').value.trim();
  const apiKey = document.getElementById('addNodeApiKey').value.trim();
  const el = document.getElementById('testResult');

  if (!url) return;

  el.style.display = 'block';
  el.className = 'test-result';
  el.textContent = '...';

  try {
    const resp = await fetch('/api/nodes/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, api_key: apiKey }),
    });
    const data = await resp.json();
    if (data.ok) {
      el.className = 'test-result success';
      el.textContent = `${t('test.success')} ${data.data?.name || ''} (${data.data?.model || ''})`;
      // Auto-fill name and room if empty
      if (!document.getElementById('addNodeName').value && data.data?.name) {
        document.getElementById('addNodeName').value = data.data.name;
      }
      if (!document.getElementById('addNodeRoom').value && data.data?.room) {
        document.getElementById('addNodeRoom').value = data.data.room;
      }
    } else {
      el.className = 'test-result error';
      el.textContent = `${t('test.failed')} ${data.error || data.status}`;
    }
  } catch (err) {
    el.className = 'test-result error';
    el.textContent = `${t('test.failed')} ${err.message}`;
  }
}

async function addNode() {
  const url = document.getElementById('addNodeUrl').value.trim();
  const apiKey = document.getElementById('addNodeApiKey').value.trim();
  const name = document.getElementById('addNodeName').value.trim();
  const room = document.getElementById('addNodeRoom').value.trim();

  if (!url) return;

  try {
    const resp = await fetch('/api/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, api_key: apiKey, name, room }),
    });
    const node = await resp.json();
    nodes[node.id] = { ...node, connected: false, state: null };

    // Clear form
    document.getElementById('addNodeUrl').value = '';
    document.getElementById('addNodeApiKey').value = '';
    document.getElementById('addNodeName').value = '';
    document.getElementById('addNodeRoom').value = '';
    document.getElementById('testResult').style.display = 'none';

    renderNodeList();
    renderDashboard();
  } catch {}
}

async function deleteNode(nodeId) {
  if (!confirm(t('settings.deleteConfirm'))) return;
  try {
    await fetch(`/api/nodes/${nodeId}`, { method: 'DELETE' });
    delete nodes[nodeId];
    renderNodeList();
    renderDashboard();
    if (selectedNodeId === nodeId) showDashboard();
  } catch {}
}

// ── Proxy Helpers ──

async function proxyGet(path) {
  const resp = await fetch(`/api/nodes/${selectedNodeId}/proxy/${path}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function proxyPost(path, body = {}) {
  const resp = await fetch(`/api/nodes/${selectedNodeId}/proxy/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return resp.json();
}

async function proxyPut(path, body = {}) {
  const resp = await fetch(`/api/nodes/${selectedNodeId}/proxy/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return resp.json();
}

// ── Utility ──

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
