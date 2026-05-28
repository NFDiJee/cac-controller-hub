// ── CAC Hub — Frontend Application ──

let ws = null;
let nodes = {};          // nodeId -> { id, name, url, room, model, connected, state }
let selectedNodeId = null;
let nodeLibrary = {};    // nodeId -> [cd, ...]
let nodeRatings = {};    // nodeId -> [{slot, track_number, rating}, ...]
let nodeFavorites = {};  // nodeId -> [{slot, track_number}, ...]
let currentCdSlot = null;

const PLAYER_MODES = {
  P01: 'mode.park', P02: 'mode.setup', P03: 'mode.reject',
  P04: 'mode.play', P06: 'mode.pause', P07: 'mode.search',
  P08: 'mode.scan', P20: 'player.discUnset', P21: 'mode.loading',
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
      if (btn.dataset.sub === 'favorites' && selectedNodeId) renderFavorites();
      if (btn.dataset.sub === 'ratings' && selectedNodeId) renderRatings();
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
      for (const n of msg.nodes) {
        nodes[n.id] = n;
      }
      renderDashboard();
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
      // Reload library after scan
      if (selectedNodeId === nodeId) {
        loadLibrary();
        loadNodeRatings(nodeId);
        loadNodeFavorites(nodeId);
      }
      break;
    case 'playModeChange':
      node.state.playModes = event.data;
      if (selectedNodeId === nodeId) updateShuffleUI(event.data);
      break;
  }

  updateNodeCard(nodeId);

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

  if (nodeId && state.mode) syncTimeRef(nodeId, pid, state);
  const timeLine = nodeId ? getTimeLineStr(nodeId, pid) : '';
  const coverUrl = cd && cd.cover_url && nodeId
    ? `/api/nodes/${nodeId}/cover/${cd.cover_url.replace(/^\/covers\//, '')}`
    : '';

  return `
    <div class="mini-player">
      <div class="mini-player-top">
        ${coverUrl
          ? `<img class="mini-player-cover" src="${coverUrl}" alt="">`
          : `<div class="mini-player-cover mini-player-no-cover">CD</div>`}
        <div class="mini-player-info">
          <div class="mini-player-label">Player ${pid}</div>
          <div class="mini-player-mode ${modeClass}">${modeLabel}</div>
          <div class="mini-player-disc">${disc} ${track}</div>
        </div>
      </div>
      <div class="mini-player-time" id="miniTime-${nodeId}-${pid}">${timeLine}</div>
    </div>`;
}

function updateNodeCard(nodeId) {
  const card = document.getElementById('nodeCard-' + nodeId);
  if (!card) return;
  const n = nodes[nodeId];
  if (!n) return;

  const dot = card.querySelector('.status-dot');
  if (dot) {
    dot.className = `status-dot ${n.connected ? 'online' : 'offline'}`;
    dot.title = n.connected ? t('node.online') : t('node.offline');
  }

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
  loadLibrary();
  loadNodeRatings(nodeId);
  loadNodeFavorites(nodeId);
}

function showDashboard() {
  selectedNodeId = null;
  document.getElementById('nodeGrid').style.display = '';
  document.getElementById('nodeDetail').style.display = 'none';
  renderDashboard();
}

// ── Time Interpolation (local 1s tick per player) ──
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
  if (ref.playing) trackSec += Math.floor((Date.now() - ref.localMs) / 1000);
  return fmtSec(trackSec);
}

function getInterpolatedDiscTime(nodeId, pid) {
  const ref = getTimeRef(nodeId, pid);
  if (ref.localMs <= 0) return '--:--';
  let discSec = ref.discSec;
  if (ref.playing) discSec += Math.floor((Date.now() - ref.localMs) / 1000);
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

setInterval(() => {
  if (selectedNodeId) {
    for (const pid of [1, 2]) {
      const el = document.getElementById(`p${pid}Time`);
      if (el) el.textContent = getInterpolatedTime(selectedNodeId, pid);
      const dt = document.getElementById(`p${pid}DiscTime`);
      if (dt) dt.textContent = 'CD ' + getInterpolatedDiscTime(selectedNodeId, pid) + ' / ' + getDiscTotal(selectedNodeId, pid);
    }
  }
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

    // Time
    syncTimeRef(selectedNodeId, pid, p);
    document.getElementById(prefix + 'Time').textContent = getInterpolatedTime(selectedNodeId, pid);
    document.getElementById(prefix + 'DiscTime').textContent =
      'CD ' + getInterpolatedDiscTime(selectedNodeId, pid) + ' / ' + getDiscTotal(selectedNodeId, pid);

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

    // Stars + Favorite for this CD
    const starsEl = document.getElementById(prefix + 'Stars');
    const favEl = document.getElementById(prefix + 'Fav');
    if (disc) {
      const cdRating = getRating(selectedNodeId, disc, 0);
      starsEl.innerHTML = starsHtml(cdRating, (r) => `rateItem(${disc}, 0, ${r})`);
      const isFav = isFavorite(selectedNodeId, disc, 0);
      favEl.innerHTML = isFav ? '&#9829;' : '&#9825;';
      favEl.className = 'btn-icon btn-fav' + (isFav ? ' active' : '');
      starsEl.style.display = '';
      favEl.style.display = '';
    } else {
      starsEl.innerHTML = '';
      favEl.style.display = 'none';
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
  el.innerHTML = cd.tracks.map(tr => {
    const rating = getRating(selectedNodeId, cd.slot, tr.track_number);
    const isFav = isFavorite(selectedNodeId, cd.slot, tr.track_number);
    return `
    <div class="track-row ${tr.track_number === activeTrack ? 'active' : ''}">
      <span class="track-num" onclick="playTrack(${pid}, ${cd.slot}, ${tr.track_number})">${tr.track_number}</span>
      <span class="track-name" onclick="playTrack(${pid}, ${cd.slot}, ${tr.track_number})">${esc(tr.title || 'Track ' + tr.track_number)}</span>
      <span class="track-stars-sm">${starsHtmlSm(rating, (r) => `rateItem(${cd.slot}, ${tr.track_number}, ${r})`)}</span>
      <button class="btn-icon btn-fav-sm${isFav ? ' active' : ''}" onclick="toggleFavItem(${cd.slot}, ${tr.track_number})">
        ${isFav ? '&#9829;' : '&#9825;'}
      </button>
      <button class="btn-icon btn-playlist-sm" onclick="event.stopPropagation();quickAddTrackToPlaylist(${cd.slot}, ${tr.track_number})" title="${t('library.addToPlaylist')}">+</button>
      <span class="track-dur">${formatSeconds(tr.duration_seconds)}</span>
    </div>`;
  }).join('');
}

function formatSeconds(sec) {
  if (!sec || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

// ── Ratings ──

async function loadNodeRatings(nodeId) {
  try {
    const resp = await fetch(`/api/nodes/${nodeId}/proxy/ratings`);
    if (!resp.ok) return;
    nodeRatings[nodeId] = await resp.json();
  } catch {
    nodeRatings[nodeId] = [];
  }
}

function getRating(nodeId, slot, trackNumber) {
  const ratings = nodeRatings[nodeId] || [];
  const r = ratings.find(r => r.slot === slot && r.track_number === trackNumber);
  return r ? r.rating : 0;
}

async function rateItem(slot, trackNumber, rating) {
  if (!selectedNodeId) return;
  const current = getRating(selectedNodeId, slot, trackNumber);
  const newRating = current === rating ? 0 : rating;
  try {
    await proxyPost('ratings', { slot, track: trackNumber, rating: newRating });
    await loadNodeRatings(selectedNodeId);
    updatePlayerUI();
    if (currentCdSlot === slot) refreshCdModal();
  } catch {}
}

function starsHtml(rating, onClickFn) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    const filled = i <= rating;
    html += `<span class="star ${filled ? 'filled' : ''}" onclick="${onClickFn(i)}">${filled ? '&#9733;' : '&#9734;'}</span>`;
  }
  return html;
}

function starsHtmlSm(rating, onClickFn) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    const filled = i <= rating;
    html += `<span class="star-sm ${filled ? 'filled' : ''}" onclick="event.stopPropagation();${onClickFn(i)}">${filled ? '&#9733;' : '&#9734;'}</span>`;
  }
  return html;
}

// ── Favorites ──

async function loadNodeFavorites(nodeId) {
  try {
    const resp = await fetch(`/api/nodes/${nodeId}/proxy/favorites`);
    if (!resp.ok) return;
    nodeFavorites[nodeId] = await resp.json();
  } catch {
    nodeFavorites[nodeId] = [];
  }
}

function isFavorite(nodeId, slot, trackNumber) {
  const favs = nodeFavorites[nodeId] || [];
  return favs.some(f => f.slot === slot && (f.track_number || 0) === trackNumber);
}

async function toggleFavItem(slot, trackNumber) {
  if (!selectedNodeId) return;
  try {
    await proxyPost('favorites/toggle', { slot, track: trackNumber });
    await loadNodeFavorites(selectedNodeId);
    updatePlayerUI();
    if (currentCdSlot === slot) refreshCdModal();
  } catch {}
}

async function togglePlayerFav(pid) {
  if (!selectedNodeId) return;
  const node = nodes[selectedNodeId];
  const p = node?.state?.players?.[pid] || {};
  const disc = p.disc && p.disc !== 'XXX' ? parseInt(p.disc) : null;
  if (!disc) return;
  await toggleFavItem(disc, 0);
}

async function toggleModalCdFav() {
  if (!currentCdSlot) return;
  await toggleFavItem(currentCdSlot, 0);
}

function renderFavorites() {
  const el = document.getElementById('favoritesList');
  const favs = nodeFavorites[selectedNodeId] || [];

  if (favs.length === 0) {
    el.innerHTML = `<div class="empty-state" style="padding:30px">${t('favorites.empty')}</div>`;
    return;
  }

  const lib = nodeLibrary[selectedNodeId] || [];

  // Group: CD favorites (track_number = 0) and track favorites
  const cdFavs = favs.filter(f => !f.track_number || f.track_number === 0);
  const trackFavs = favs.filter(f => f.track_number && f.track_number > 0);

  let html = '';

  if (cdFavs.length > 0) {
    html += `<div class="card-title">${t('favorites.cds')}</div>`;
    html += cdFavs.map(f => {
      const cd = lib.find(c => c.slot === f.slot);
      const title = cd?.title || `CD ${f.slot}`;
      const artist = cd?.artist || '';
      const coverUrl = cd?.cover_url
        ? `/api/nodes/${selectedNodeId}/cover/${cd.cover_url.replace(/^\/covers\//, '')}`
        : '';
      return `
        <div class="fav-item" onclick="openCdModal(${f.slot})">
          ${coverUrl ? `<img class="fav-cover" src="${coverUrl}" alt="">` : `<div class="fav-cover fav-no-cover">${f.slot}</div>`}
          <div class="fav-meta">
            <div class="fav-title">${esc(title)}</div>
            <div class="fav-artist">${esc(artist)}</div>
            <div class="fav-slot">Slot ${f.slot}</div>
          </div>
          <button class="btn-icon btn-fav active" onclick="event.stopPropagation();toggleFavItem(${f.slot}, 0)">&#9829;</button>
        </div>`;
    }).join('');
  }

  if (trackFavs.length > 0) {
    html += `<div class="card-title" style="margin-top:16px">${t('favorites.tracks')}</div>`;
    html += trackFavs.map(f => {
      const cd = lib.find(c => c.slot === f.slot);
      const tr = cd?.tracks?.find(t => t.track_number === f.track_number);
      const title = tr?.title || `Track ${f.track_number}`;
      const cdTitle = cd?.title || `CD ${f.slot}`;
      const coverUrl = cd?.cover_url
        ? `/api/nodes/${selectedNodeId}/cover/${cd.cover_url.replace(/^\/covers\//, '')}`
        : '';
      return `
        <div class="fav-item" onclick="openCdModal(${f.slot})">
          ${coverUrl ? `<img class="fav-cover" src="${coverUrl}" alt="">` : `<div class="fav-cover fav-no-cover">${f.slot}</div>`}
          <div class="fav-meta">
            <div class="fav-title">${esc(title)}</div>
            <div class="fav-artist">${esc(cdTitle)} &middot; Slot ${f.slot} &middot; Track ${f.track_number}</div>
          </div>
          <button class="btn-icon btn-fav active" onclick="event.stopPropagation();toggleFavItem(${f.slot}, ${f.track_number})">&#9829;</button>
        </div>`;
    }).join('');
  }

  el.innerHTML = html;
}

// ── Ratings Overview ──

function renderRatings() {
  const el = document.getElementById('ratingsList');
  const ratings = nodeRatings[selectedNodeId] || [];
  const rated = ratings.filter(r => r.rating > 0);

  if (rated.length === 0) {
    el.innerHTML = `<div class="empty-state" style="padding:30px">${t('ratings.empty')}</div>`;
    return;
  }

  const lib = nodeLibrary[selectedNodeId] || [];

  // Group: CD ratings (track_number = 0) and track ratings
  const cdRated = rated.filter(r => !r.track_number || r.track_number === 0)
    .sort((a, b) => b.rating - a.rating);
  const trackRated = rated.filter(r => r.track_number && r.track_number > 0)
    .sort((a, b) => b.rating - a.rating);

  let html = '';

  if (cdRated.length > 0) {
    html += `<div class="card-title">${t('ratings.cds')}</div>`;
    html += cdRated.map(r => {
      const cd = lib.find(c => c.slot === r.slot);
      const title = cd?.title || `CD ${r.slot}`;
      const artist = cd?.artist || '';
      const coverUrl = cd?.cover_url
        ? `/api/nodes/${selectedNodeId}/cover/${cd.cover_url.replace(/^\/covers\//, '')}`
        : '';
      return `
        <div class="fav-item" onclick="openCdModal(${r.slot})">
          ${coverUrl ? `<img class="fav-cover" src="${coverUrl}" alt="">` : `<div class="fav-cover fav-no-cover">${r.slot}</div>`}
          <div class="fav-meta">
            <div class="fav-title">${esc(title)}</div>
            <div class="fav-artist">${esc(artist)}</div>
            <div class="fav-slot">Slot ${r.slot}</div>
          </div>
          <div class="rating-display">${'&#9733;'.repeat(r.rating)}${'&#9734;'.repeat(5 - r.rating)}</div>
        </div>`;
    }).join('');
  }

  if (trackRated.length > 0) {
    html += `<div class="card-title" style="margin-top:16px">${t('ratings.tracks')}</div>`;
    html += trackRated.map(r => {
      const cd = lib.find(c => c.slot === r.slot);
      const tr = cd?.tracks?.find(t => t.track_number === r.track_number);
      const title = tr?.title || `Track ${r.track_number}`;
      const cdTitle = cd?.title || `CD ${r.slot}`;
      const coverUrl = cd?.cover_url
        ? `/api/nodes/${selectedNodeId}/cover/${cd.cover_url.replace(/^\/covers\//, '')}`
        : '';
      return `
        <div class="fav-item" onclick="openCdModal(${r.slot})">
          ${coverUrl ? `<img class="fav-cover" src="${coverUrl}" alt="">` : `<div class="fav-cover fav-no-cover">${r.slot}</div>`}
          <div class="fav-meta">
            <div class="fav-title">${esc(title)}</div>
            <div class="fav-artist">${esc(cdTitle)} &middot; Slot ${r.slot} &middot; Track ${r.track_number}</div>
          </div>
          <div class="rating-display">${'&#9733;'.repeat(r.rating)}${'&#9734;'.repeat(5 - r.rating)}</div>
        </div>`;
    }).join('');
  }

  el.innerHTML = html;
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
    updateShuffleUI(data);
  } catch {}
}

async function setPlayMode(mode, value) {
  if (!selectedNodeId) return;
  await proxyPut('playmodes', { [mode]: value });
}

async function setShuffle(mode) {
  if (!selectedNodeId) return;
  const data = await proxyPut('playmodes', { shuffle: mode === 'off' ? false : mode });
  updateShuffleUI(data);
}

function updateShuffleUI(data) {
  const current = data?.shuffle || 'off';
  document.querySelectorAll('.shuffle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.shuffle === (current || 'off'));
  });
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
    updatePlayerUI();
  } catch {
    nodeLibrary[selectedNodeId] = [];
  }
}

function renderLibrary() {
  const lib = nodeLibrary[selectedNodeId] || [];
  const grid = document.getElementById('libraryGrid');

  if (lib.length === 0) {
    document.getElementById('libCount').textContent = '0 CDs';
    grid.innerHTML = `<div class="empty-state">${t('library.noCds')}</div>`;
    return;
  }

  // Populate filter dropdowns
  populateLibraryFilters(lib);

  // Apply filters
  const query = (document.getElementById('libSearch').value || '').toLowerCase();
  const genreFilter = document.getElementById('libFilterGenre').value;
  const yearFilter = document.getElementById('libFilterYear').value;
  const ratingFilter = parseInt(document.getElementById('libFilterRating').value) || 0;

  const filtered = lib.filter(c => {
    if (query && !(c.title || '').toLowerCase().includes(query) &&
        !(c.artist || '').toLowerCase().includes(query) &&
        !String(c.slot).includes(query)) return false;
    if (genreFilter && (c.genre || '') !== genreFilter) return false;
    if (yearFilter && String(c.year || '') !== yearFilter) return false;
    if (ratingFilter) {
      const r = getRating(selectedNodeId, c.slot, 0);
      if (r < ratingFilter) return false;
    }
    return true;
  });

  document.getElementById('libCount').textContent = `${filtered.length}/${lib.length} CDs`;

  grid.innerHTML = filtered.map(cd => {
    const coverSrc = cd.cover_url
      ? `/api/nodes/${selectedNodeId}/cover/${cd.cover_url.replace(/^\/covers\//, '')}`
      : '';
    const rating = getRating(selectedNodeId, cd.slot, 0);
    const isFav = isFavorite(selectedNodeId, cd.slot, 0);
    return `
      <div class="lib-card" onclick="openCdModal(${cd.slot})">
        ${coverSrc
          ? `<img class="lib-card-cover" src="${coverSrc}" alt="">`
          : `<div class="lib-card-no-cover">${cd.slot}</div>`}
        <div class="lib-card-meta">
          <div class="lib-card-title">${esc(cd.title || 'CD ' + cd.slot)}</div>
          <div class="lib-card-artist">${esc(cd.artist || '')}</div>
          <div class="lib-card-info">Slot ${cd.slot} · ${cd.total_tracks || '?'} Tracks
            ${rating ? ' · ' + '&#9733;'.repeat(rating) : ''}
            ${isFav ? ' &#9829;' : ''}
          </div>
        </div>
      </div>`;
  }).join('');
}

function populateLibraryFilters(lib) {
  const genreSelect = document.getElementById('libFilterGenre');
  const yearSelect = document.getElementById('libFilterYear');
  const currentGenre = genreSelect.value;
  const currentYear = yearSelect.value;

  // Collect unique genres and years
  const genres = new Set();
  const years = new Set();
  for (const cd of lib) {
    if (cd.genre) genres.add(cd.genre);
    if (cd.year) years.add(String(cd.year));
  }

  // Only rebuild if options changed
  const genreArr = [...genres].sort();
  const yearArr = [...years].sort().reverse();

  if (genreSelect.options.length !== genreArr.length + 1) {
    genreSelect.innerHTML = `<option value="">${t('library.allGenres')}</option>` +
      genreArr.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
    genreSelect.value = currentGenre;
  }

  if (yearSelect.options.length !== yearArr.length + 1) {
    yearSelect.innerHTML = `<option value="">${t('library.allYears')}</option>` +
      yearArr.map(y => `<option value="${y}">${y}</option>`).join('');
    yearSelect.value = currentYear;
  }
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
  refreshCdModal();
  document.getElementById('cdModal').style.display = 'flex';
}

function refreshCdModal() {
  if (!currentCdSlot || !selectedNodeId) return;
  const lib = nodeLibrary[selectedNodeId] || [];
  const cd = lib.find(c => c.slot === currentCdSlot);
  if (!cd) return;
  const slot = currentCdSlot;

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

  // CD-level rating + favorite
  const cdRating = getRating(selectedNodeId, slot, 0);
  document.getElementById('cdModalStars').innerHTML = starsHtml(cdRating, (r) => `rateItem(${slot}, 0, ${r})`);
  const cdFav = isFavorite(selectedNodeId, slot, 0);
  const favBtn = document.getElementById('cdModalFav');
  favBtn.innerHTML = cdFav ? '&#9829;' : '&#9825;';
  favBtn.className = 'btn-icon btn-fav' + (cdFav ? ' active' : '');

  // Tracks with stars + favorites + playlist add
  const tracksEl = document.getElementById('cdModalTracks');
  if (cd.tracks && cd.tracks.length) {
    tracksEl.innerHTML = cd.tracks.map(tr => {
      const rating = getRating(selectedNodeId, slot, tr.track_number);
      const isFav = isFavorite(selectedNodeId, slot, tr.track_number);
      return `
      <div class="track-row" onclick="loadCdTrack(${slot}, ${tr.track_number})">
        <span class="track-num">${tr.track_number}</span>
        <span class="track-name">${esc(tr.title || 'Track ' + tr.track_number)}</span>
        <span class="track-stars-sm">${starsHtmlSm(rating, (r) => `rateItem(${slot}, ${tr.track_number}, ${r})`)}</span>
        <button class="btn-icon btn-fav-sm${isFav ? ' active' : ''}" onclick="event.stopPropagation();toggleFavItem(${slot}, ${tr.track_number})">
          ${isFav ? '&#9829;' : '&#9825;'}
        </button>
        <button class="btn-icon btn-playlist-sm" onclick="event.stopPropagation();quickAddTrackToPlaylist(${slot}, ${tr.track_number})" title="${t('library.addToPlaylist')}">+</button>
        <span class="track-dur">${formatSeconds(tr.duration_seconds)}</span>
      </div>`;
    }).join('');
  } else {
    tracksEl.innerHTML = '<div style="color:var(--text-dim);padding:8px">No track data</div>';
  }
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

let nodePlaylists = {}; // nodeId -> [playlist with items, ...]

async function loadPlaylists() {
  if (!selectedNodeId) return;
  try {
    // GET /playlists returns list without items, so fetch each individually
    const list = await proxyGet('playlists');
    const detailed = [];
    for (const pl of (list || [])) {
      try {
        const full = await proxyGet(`playlists/${pl.id}`);
        detailed.push(full);
      } catch {
        detailed.push({ ...pl, items: [] });
      }
    }
    nodePlaylists[selectedNodeId] = detailed;
    renderPlaylists();
  } catch {
    nodePlaylists[selectedNodeId] = [];
    renderPlaylists();
  }
}

function renderPlaylists() {
  const data = nodePlaylists[selectedNodeId] || [];
  const el = document.getElementById('playlistList');
  if (data.length === 0) {
    el.innerHTML = `<div class="empty-state" style="padding:20px">${t('playlists.empty')}</div>`;
    return;
  }
  el.innerHTML = data.map(pl => {
    const count = pl.items?.length || 0;
    return `
    <div class="playlist-item" onclick="openPlaylistDetail(${pl.id})">
      <div>
        <div class="playlist-name">${esc(pl.name)}</div>
        <div class="playlist-count">${count} ${t('playlists.items')}</div>
      </div>
      <div class="playlist-actions">
        <button class="btn btn-accent btn-sm" onclick="event.stopPropagation();playPlaylist(${pl.id})">${t('playlists.play')}</button>
        <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deletePlaylist(${pl.id})">&times;</button>
      </div>
    </div>`;
  }).join('');
}

async function playPlaylist(id) {
  await proxyPost(`playlists/${id}/play`);
}

async function deletePlaylist(id) {
  if (!confirm(t('playlists.deleteConfirm'))) return;
  try {
    await fetch(`/api/nodes/${selectedNodeId}/proxy/playlists/${id}`, { method: 'DELETE' });
    await loadPlaylists();
  } catch {}
}

async function createPlaylistInline() {
  const input = document.getElementById('newPlaylistNameInline');
  const name = input.value.trim();
  if (!name || !selectedNodeId) return;
  await proxyPost('playlists', { name });
  input.value = '';
  await loadPlaylists();
}

async function openPlaylistDetail(id) {
  if (!selectedNodeId) return;
  try {
    const pl = await proxyGet(`playlists/${id}`);
    showPlaylistDetailModal(pl);
  } catch {}
}

function showPlaylistDetailModal(pl) {
  const lib = nodeLibrary[selectedNodeId] || [];
  const items = pl.items || [];

  // Calculate total duration
  let totalSec = 0;
  for (const item of items) {
    const cd = lib.find(c => c.slot === item.slot);
    const tr = cd?.tracks?.find(t => t.track_number === item.track_number);
    if (tr?.duration_seconds) totalSec += tr.duration_seconds;
  }
  const totalDur = totalSec > 0 ? ` · ${formatSeconds(totalSec)}` : '';

  let html = `<div class="playlist-detail-header">
    <strong>${esc(pl.name)}</strong>
    <span class="playlist-count">${items.length} ${t('playlists.items')}${totalDur}</span>
    <button class="btn btn-accent btn-sm" style="margin-left:auto" onclick="playPlaylist(${pl.id});closeBrainzModal()">${t('playlists.play')}</button>
  </div><div class="playlist-detail-items">`;

  if (items.length === 0) {
    html += `<div style="color:var(--text-dim);padding:12px">${t('playlists.empty')}</div>`;
  } else {
    html += items.map((item, idx) => {
      const cd = lib.find(c => c.slot === item.slot);
      const cdTitle = cd ? (cd.title || 'CD ' + item.slot) : 'Slot ' + item.slot;
      const tr = cd?.tracks?.find(t => t.track_number === item.track_number);
      // Use track_title from API if available, else look up in library
      const trackTitle = item.track_title || tr?.title || '';
      const trackName = trackTitle
        ? `${trackTitle}`
        : `Track ${item.track_number || '?'}`;
      const dur = tr?.duration_seconds ? formatSeconds(tr.duration_seconds) : '';
      const rating = getRating(selectedNodeId, item.slot, item.track_number || 0);
      const isFav = isFavorite(selectedNodeId, item.slot, item.track_number || 0);

      const coverSrc = cd?.cover_url
        ? `/api/nodes/${selectedNodeId}/cover/${cd.cover_url.replace(/^\/covers\//, '')}`
        : '';

      return `<div class="playlist-detail-item">
        <span class="track-num">${idx + 1}</span>
        ${coverSrc
          ? `<img class="playlist-item-cover" src="${coverSrc}" alt="">`
          : `<span class="playlist-item-no-cover">${item.slot}</span>`}
        <div class="playlist-item-info">
          <div class="playlist-item-track">${esc(trackName)}</div>
          <div class="playlist-item-cd">${esc(cdTitle)} · Slot ${item.slot}</div>
        </div>
        ${rating ? `<span class="track-stars-sm">${'&#9733;'.repeat(rating)}</span>` : ''}
        ${isFav ? '<span class="btn-fav-sm active">&#9829;</span>' : ''}
        <span class="track-dur">${dur}</span>
        <button class="btn-icon btn-playlist-sm" onclick="removePlaylistItem(${pl.id}, ${item.id})" title="Entfernen">&times;</button>
      </div>`;
    }).join('');
  }

  html += '</div>';
  document.getElementById('brainzModalBody').innerHTML = html;
  document.getElementById('brainzModal').querySelector('.modal-header span').textContent = t('nav.playlists');
  document.getElementById('brainzModal').style.display = 'flex';
}

async function removePlaylistItem(playlistId, itemId) {
  try {
    await fetch(`/api/nodes/${selectedNodeId}/proxy/playlists/${playlistId}/items/${itemId}`, { method: 'DELETE' });
    await openPlaylistDetail(playlistId);
    await loadPlaylists();
  } catch {}
}

// ── Add to Playlist (from CD Modal) ──

async function showAddToPlaylistMenu() {
  if (!selectedNodeId) return;
  // Always refresh playlist data
  try {
    const list = await proxyGet('playlists');
    // Quick-fetch with item counts
    const detailed = [];
    for (const pl of (list || [])) {
      try { detailed.push(await proxyGet(`playlists/${pl.id}`)); } catch { detailed.push({ ...pl, items: [] }); }
    }
    nodePlaylists[selectedNodeId] = detailed;
  } catch { if (!nodePlaylists[selectedNodeId]) nodePlaylists[selectedNodeId] = []; }

  const playlists = nodePlaylists[selectedNodeId] || [];
  const listEl = document.getElementById('cdModalPlaylistList');

  if (playlists.length === 0) {
    listEl.innerHTML = `<div style="color:var(--text-dim);padding:8px;font-size:0.85rem">${t('playlists.empty')}</div>`;
  } else {
    listEl.innerHTML = playlists.map(pl =>
      `<div class="playlist-pick-item" onclick="addCdToPlaylist(${pl.id})">
        <span>${esc(pl.name)}</span>
        <span class="playlist-count">${pl.items?.length || 0}</span>
      </div>`
    ).join('');
  }
  document.getElementById('cdModalPlaylistMenu').style.display = 'block';
}

function hideAddToPlaylistMenu() {
  document.getElementById('cdModalPlaylistMenu').style.display = 'none';
}

async function addCdToPlaylist(playlistId) {
  if (!currentCdSlot || !selectedNodeId) return;
  const lib = nodeLibrary[selectedNodeId] || [];
  const cd = lib.find(c => c.slot === currentCdSlot);
  const tracks = cd?.tracks || [];

  if (tracks.length > 0) {
    // Add all tracks individually
    for (const tr of tracks) {
      await proxyPost(`playlists/${playlistId}/items`, { slot: currentCdSlot, track: tr.track_number });
    }
  } else {
    // No track data — add whole CD as one item
    await proxyPost(`playlists/${playlistId}/items`, { slot: currentCdSlot, track: 0 });
  }
  hideAddToPlaylistMenu();
  // Refresh cache
  try { nodePlaylists[selectedNodeId] = await proxyGet('playlists'); } catch {}
}

async function addTrackToPlaylist(playlistId, slot, trackNumber) {
  if (!selectedNodeId) return;
  await proxyPost(`playlists/${playlistId}/items`, { slot, track: trackNumber });
  try { nodePlaylists[selectedNodeId] = await proxyGet('playlists'); } catch {}
}

async function quickAddTrackToPlaylist(slot, trackNumber) {
  if (!selectedNodeId) return;
  // If only one playlist exists, add directly. Otherwise show picker.
  if (!nodePlaylists[selectedNodeId]) {
    try { nodePlaylists[selectedNodeId] = await proxyGet('playlists'); } catch { nodePlaylists[selectedNodeId] = []; }
  }
  const playlists = nodePlaylists[selectedNodeId] || [];
  if (playlists.length === 0) {
    const name = prompt(t('playlists.newName'));
    if (!name) return;
    const pl = await proxyPost('playlists', { name });
    await proxyPost(`playlists/${pl.id}/items`, { slot, track: trackNumber });
    nodePlaylists[selectedNodeId] = await proxyGet('playlists');
    return;
  }
  if (playlists.length === 1) {
    await addTrackToPlaylist(playlists[0].id, slot, trackNumber);
    return;
  }
  // Multiple playlists — show a simple picker
  const picked = prompt(
    playlists.map((pl, i) => `${i + 1}. ${pl.name}`).join('\n') + '\n\n' + t('playlists.pickNumber'),
    '1'
  );
  const idx = parseInt(picked) - 1;
  if (idx >= 0 && idx < playlists.length) {
    await addTrackToPlaylist(playlists[idx].id, slot, trackNumber);
  }
}

async function createAndAddToPlaylist() {
  const input = document.getElementById('newPlaylistName');
  const name = input.value.trim();
  if (!name || !selectedNodeId || !currentCdSlot) return;
  const pl = await proxyPost('playlists', { name });
  input.value = '';
  await addCdToPlaylist(pl.id);
  nodePlaylists[selectedNodeId] = await proxyGet('playlists');
}

// ── Scanner ──

async function scanSingle() {
  if (!selectedNodeId) return;
  const slot = parseInt(document.getElementById('scanSlot').value) || 1;
  try {
    document.getElementById('scanProgress').style.display = 'block';
    document.getElementById('scanText').textContent = `${t('scanner.scanning')} ${slot}...`;
    document.getElementById('scanFill').style.width = '50%';
    const result = await proxyPost('scanner/scan', { slot });
    await loadLibrary();
    await loadNodeRatings(selectedNodeId);
    document.getElementById('scanFill').style.width = '100%';
    document.getElementById('scanText').textContent = `${t('scanner.complete')} — Slot ${slot}`;
    setTimeout(() => { document.getElementById('scanProgress').style.display = 'none'; }, 2000);
    // Auto-trigger MusicBrainz lookup after scan
    lookupBrainz();
  } catch {}
}

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

// ── MusicBrainz ──

async function lookupBrainz() {
  if (!selectedNodeId) return;
  const slot = parseInt(document.getElementById('scanSlot').value) || 1;

  // Get CD info for search
  const lib = nodeLibrary[selectedNodeId] || [];
  const cd = lib.find(c => c.slot === slot);
  const query = cd ? `${cd.artist || ''} ${cd.title || ''}`.trim() : '';

  // Try disc_id first (most accurate for MusicBrainz)
  try {
    const cdData = await proxyGet(`library/${slot}`);
    if (cdData?.disc_id) {
      const results = await proxyGet(`musicbrainz/search?q=${encodeURIComponent(cdData.disc_id)}`);
      if (results && results.length > 0) {
        showBrainzResults(slot, results);
        return;
      }
    }
  } catch {}

  // Fallback to artist+title search
  if (query) {
    try {
      const results = await proxyGet(`musicbrainz/search?q=${encodeURIComponent(query)}`);
      showBrainzResults(slot, results);
      return;
    } catch (err) {
      alert('MusicBrainz: ' + err.message);
      return;
    }
  }

  // Nothing to search with — show empty results
  showBrainzResults(slot, []);
}

function showBrainzResults(slot, results) {
  const body = document.getElementById('brainzModalBody');

  if (!results || results.length === 0) {
    body.innerHTML = `<div style="padding:16px;color:var(--text-dim)">${t('scanner.brainzNoResults')}</div>`;
    document.getElementById('brainzModal').style.display = 'flex';
    return;
  }

  body.innerHTML = results.map(r => `
    <div class="brainz-item" onclick="applyBrainz(${slot}, '${esc(r.id || r.releaseId || '')}')">
      <div class="brainz-title">${esc(r.title || '')}</div>
      <div class="brainz-artist">${esc(r.artist || r['artist-credit'] || '')}</div>
      <div class="brainz-info">${esc(r.date || r.year || '')} ${r.country ? '· ' + esc(r.country) : ''} ${r.label ? '· ' + esc(r.label) : ''}</div>
    </div>`).join('');

  document.getElementById('brainzModal').style.display = 'flex';
}

async function applyBrainz(slot, releaseId) {
  if (!selectedNodeId || !releaseId) return;
  try {
    await proxyPost(`musicbrainz/apply/${slot}`, { releaseId });
    closeBrainzModal();
    await loadLibrary();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

function closeBrainzModal() {
  document.getElementById('brainzModal').style.display = 'none';
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
        <button class="btn btn-dim btn-sm" onclick="openEditNodeModal(${n.id})">&#9998;</button>
        <button class="btn btn-danger btn-sm" onclick="deleteNode(${n.id})">&times;</button>
      </div>
    </div>`).join('');
}

function openEditNodeModal(nodeId) {
  const node = nodes[nodeId];
  if (!node) return;
  document.getElementById('editNodeId').value = nodeId;
  document.getElementById('editNodeName').value = node.name || '';
  document.getElementById('editNodeUrl').value = node.url || '';
  document.getElementById('editNodeApiKey').value = '';
  document.getElementById('editNodeApiKey').placeholder = node.api_key ? '••••••••' : '';
  document.getElementById('editNodeRoom').value = node.room || '';
  document.getElementById('editNodeModal').style.display = 'flex';
}

function closeEditNodeModal() {
  document.getElementById('editNodeModal').style.display = 'none';
}

async function saveNodeEdit() {
  const nodeId = parseInt(document.getElementById('editNodeId').value);
  const data = {
    name: document.getElementById('editNodeName').value.trim(),
    room: document.getElementById('editNodeRoom').value.trim(),
  };
  // Only send url/api_key if user actually entered a value (don't overwrite with empty)
  const newUrl = document.getElementById('editNodeUrl').value.trim();
  const newApiKey = document.getElementById('editNodeApiKey').value.trim();
  if (newUrl) data.url = newUrl;
  if (newApiKey) data.api_key = newApiKey;
  try {
    const resp = await fetch(`/api/nodes/${nodeId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const updated = await resp.json();
    if (nodes[nodeId]) {
      nodes[nodeId] = { ...nodes[nodeId], ...updated };
    }
    closeEditNodeModal();
    renderNodeList();
    renderDashboard();
  } catch {}
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
