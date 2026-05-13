const DEFAULT_FETCH_PATHS = ['./public/data/pubs.csv', './pubs.csv'];
const DEFAULT_ROUTES_FETCH_PATHS = ['./public/data/routes.json', './routes.json'];
const STORAGE_KEY = 'drinking_admin_local_draft_v5';
const SETTINGS_KEY = 'drinking_admin_github_settings_v5';
const UPLOAD_SETTINGS_KEY = 'drinking_admin_upload_settings_v1';
const UPLOAD_ENDPOINT = 'https://api.drinkinginthesun.com/upload-image';
const MAX_SEARCH_RESULTS = 14;
const APP_TIME_ZONE = 'Europe/London';
const KNOWN_HEADERS = [
  'id','name','address','lat','lng','spot_a','base_date','spot_a_sun_start','spot_a_horizon','spot_a_sun_end',
  'spot_b','spot_b_sun_start','spot_b_sun_end','spot_b_horizon','image_url','spot_a_photo_url','spot_b_photo_url',
  'notes','worth_the_trip','cycle_friendly','curated_route_id'
];

const state = {
  headers: [],
  rows: [],
  filteredIndexes: [],
  selectedIndex: -1,
  loadedFilename: 'pubs.csv',
  draftSavedAt: '',
  restoredFromDraft: false,
  githubSha: '',
  githubLastLoadedAt: '',
  isSavingGitHub: false,
  routeDrafts: {},
  routesData: {},
  routesSha: '',
  uploadLocalPreviewUrl: ''
};

const els = {
  fileInput: document.getElementById('fileInput'),
  btnReload: document.getElementById('btnReload'),
  btnDownload: document.getElementById('btnDownload'),
  btnSaveDraft: document.getElementById('btnSaveDraft'),
  btnRestoreDraft: document.getElementById('btnRestoreDraft'),
  btnClearDraft: document.getElementById('btnClearDraft'),
  draftStatus: document.getElementById('draftStatus'),
  btnNewPub: document.getElementById('btnNewPub'),
  btnDuplicate: document.getElementById('btnDuplicate'),
  btnDelete: document.getElementById('btnDelete'),
  searchInput: document.getElementById('searchInput'),
  pubList: document.getElementById('pubList'),
  pubCount: document.getElementById('pubCount'),
  previewDateA: document.getElementById('previewDateA'),
  previewDateB: document.getElementById('previewDateB'),
  previewSummaryA: document.getElementById('previewSummaryA'),
  previewSummaryB: document.getElementById('previewSummaryB'),
  graphA: document.getElementById('graphA'),
  graphB: document.getElementById('graphB'),
  spotAStatus: document.getElementById('spotAStatus'),
  spotBStatus: document.getElementById('spotBStatus'),
  githubOwner: document.getElementById('github-owner'),
  githubRepo: document.getElementById('github-repo'),
  githubBranch: document.getElementById('github-branch'),
  githubPath: document.getElementById('github-path'),
  githubRoutesPath: document.getElementById('github-routes-path'),
  githubToken: document.getElementById('github-token'),
  githubRememberToken: document.getElementById('github-remember-token'),
  githubMessage: document.getElementById('github-message'),
  btnGitHubLoad: document.getElementById('btnGitHubLoad'),
  btnGitHubSave: document.getElementById('btnGitHubSave'),
  gitStatus: document.getElementById('gitStatus'),
  routeGpxFile: document.getElementById('route-gpx-file'),
  routeStartLabel: document.getElementById('route-start-label'),
  routeStartLat: document.getElementById('route-start-lat'),
  routeStartLng: document.getElementById('route-start-lng'),
  routeGpxName: document.getElementById('route-gpx-name'),
  routeSummary: document.getElementById('route-summary'),
  routeSnippet: document.getElementById('route-snippet'),
  btnRouteClear: document.getElementById('btnRouteClear'),
  btnRouteCopy: document.getElementById('btnRouteCopy'),
  btnRouteDownload: document.getElementById('btnRouteDownload'),
  uploadFile: document.getElementById('upload-file'),
  uploadToken: document.getElementById('upload-token'),
  uploadRememberToken: document.getElementById('upload-remember-token'),
  uploadSlug: document.getElementById('upload-slug'),
  uploadFileName: document.getElementById('upload-file-name'),
  uploadReturnedUrl: document.getElementById('upload-returned-url'),
  uploadStatus: document.getElementById('uploadStatus'),
  btnUploadMain: document.getElementById('btnUploadMain'),
  btnUploadSpotA: document.getElementById('btnUploadSpotA'),
  btnUploadSpotB: document.getElementById('btnUploadSpotB'),
  uploadPreviewWrap: document.getElementById('uploadPreviewWrap'),
  uploadPreviewImg: document.getElementById('uploadPreviewImg')
};

const fieldIds = KNOWN_HEADERS.reduce((acc, header) => {
  const el = document.getElementById(`field-${header}`);
  if (el) acc[header] = el;
  return acc;
}, {});

const pointLists = {
  a: document.getElementById('pointList-a'),
  b: document.getElementById('pointList-b')
};

const pointRowTemplate = document.getElementById('pointRowTemplate');

document.addEventListener('DOMContentLoaded', init);

async function init() {
  wireUi();
  restoreSettings();
  restoreUploadSettings();
  const today = formatDate(new Date());
  els.previewDateA.value = today;
  els.previewDateB.value = today;
  if (!restoreDraftFromLocal()) {
    await loadDefaultCsv();
  }
  updateDraftStatus();
  updateGitStatus();
  updateUploadUi();
}


function wireUi() {
  els.fileInput.addEventListener('change', onFileChosen);
  els.btnReload.addEventListener('click', async () => {
    await loadDefaultCsv();
    updateDraftStatus('Reloaded bundled CSV from the tool folder.');
  });
  els.btnDownload.addEventListener('click', downloadCsv);
  els.btnSaveDraft.addEventListener('click', () => saveDraftToLocal(true));
  els.btnRestoreDraft.addEventListener('click', () => {
    if (restoreDraftFromLocal()) updateDraftStatus('Restored local draft from this device.');
    else updateDraftStatus('No local draft found on this device.');
  });
  els.btnClearDraft.addEventListener('click', () => {
    clearLocalDraft();
    updateDraftStatus('Local draft cleared from this device.');
  });
  els.btnNewPub.addEventListener('click', createNewPub);
  els.btnDuplicate.addEventListener('click', duplicateSelectedPub);
  els.btnDelete.addEventListener('click', deleteSelectedPub);
  els.searchInput.addEventListener('input', renderPubList);

  Object.entries(fieldIds).forEach(([key, el]) => {
    el.addEventListener('input', () => {
      if (!hasSelection()) return;
      state.rows[state.selectedIndex][key] = normalizeFieldValue(key, el.value);
      if (key === 'id' || key === 'name' || key === 'spot_a' || key === 'spot_b') renderPubList();
      if (key === 'id' || key === 'name') updateUploadUi();
      if (key === 'spot_a_horizon') rebuildPointRowsFromString('a', true);
      if (key === 'spot_b_horizon') rebuildPointRowsFromString('b', true);
      updatePreview();
      updateDirtyUi();
      saveDraftToLocal();
    });
  });

  document.querySelectorAll('[data-add-point]').forEach(btn => btn.addEventListener('click', () => addPointRow(btn.dataset.addPoint)));
  document.querySelectorAll('[data-sort-point]').forEach(btn => btn.addEventListener('click', () => sortPointRows(btn.dataset.sortPoint)));
  document.querySelectorAll('[data-rebuild-point]').forEach(btn => btn.addEventListener('click', () => syncPointRowsToField(btn.dataset.rebuildPoint)));
  els.previewDateA.addEventListener('input', () => { updatePreview(); saveDraftToLocal(); });
  els.previewDateB.addEventListener('input', () => { updatePreview(); saveDraftToLocal(); });

  [
    els.githubOwner,
    els.githubRepo,
    els.githubBranch,
    els.githubPath,
    els.githubRoutesPath,
    els.githubToken,
    els.githubRememberToken,
    els.githubMessage
  ].forEach(el => {
    const eventName = el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(eventName, () => {
      persistSettings();
      updateDirtyUi();
      updateGitStatus();
    });
  });

  els.btnGitHubLoad.addEventListener('click', loadCsvFromGitHub);
  els.btnGitHubSave.addEventListener('click', saveCsvToGitHub);

  els.routeGpxFile.addEventListener('change', onRouteGpxChosen);
  [els.routeStartLabel, els.routeStartLat, els.routeStartLng, els.routeGpxName].forEach(el => {
    el.addEventListener('input', () => {
      syncCurrentRouteDraftFromInputs(false);
      updateDirtyUi();
      saveDraftToLocal();
    });
  });
  els.btnRouteClear.addEventListener('click', clearCurrentRouteDraft);
  els.btnRouteCopy.addEventListener('click', copyRouteSnippet);
  els.btnRouteDownload.addEventListener('click', downloadRouteSnippet);

  [els.uploadToken].forEach(el => {
    el.addEventListener('input', () => {
      persistUploadSettings();
      updateUploadUi();
    });
  });
  els.uploadRememberToken.addEventListener('change', () => {
    persistUploadSettings();
    updateUploadUi();
  });
  els.uploadFile.addEventListener('click', () => {
    try { els.uploadFile.value = ''; } catch {}
  });
  els.uploadFile.addEventListener('change', onUploadFileChosen);
  els.btnUploadMain.addEventListener('click', () => uploadCurrentImage('main'));
  els.btnUploadSpotA.addEventListener('click', () => uploadCurrentImage('spot-a'));
  els.btnUploadSpotB.addEventListener('click', () => uploadCurrentImage('spot-b'));
}


async function loadDefaultCsv() {
  state.githubSha = '';
  state.githubLastLoadedAt = '';
  state.routesSha = '';
  state.routesData = {};
  for (const path of DEFAULT_FETCH_PATHS) {
    try {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) continue;
      const text = await res.text();
      loadCsvText(text, path.split('/').pop() || 'pubs.csv');
      break;
    } catch {}
  }
  if (!state.headers.length) {
    state.headers = [...KNOWN_HEADERS];
    state.rows = [];
    state.loadedFilename = 'pubs.csv';
    renderPubList();
    clearEditor('Load pubs.csv to start.');
  }
  await loadBundledRoutes();
  updateDirtyUi();
}

async function loadBundledRoutes() {
  state.routesData = {};
  state.routesSha = '';
  for (const path of DEFAULT_ROUTES_FETCH_PATHS) {
    try {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) continue;
      state.routesData = normalizeRoutesData(await res.json());
      return;
    } catch {}
  }
}

async function loadCsvFromGitHub() {
  const settings = getGitHubSettings();
  if (!settings.owner || !settings.repo || !settings.path) {
    updateGitStatus('Enter owner, repository, and CSV path first.', true);
    return;
  }

  updateGitStatus('Loading CSV and routes from GitHub…');
  try {
    const file = await githubGetFile(settings.owner, settings.repo, settings.path, settings.branch, settings.token);
    loadCsvText(file.text, file.path.split('/').pop() || 'pubs.csv');
    state.githubSha = file.sha || '';
    state.githubLastLoadedAt = new Date().toISOString();

    state.routesData = {};
    state.routesSha = '';
    if (settings.routesPath) {
      try {
        const routesFile = await githubGetFile(settings.owner, settings.repo, settings.routesPath, settings.branch, settings.token);
        state.routesData = normalizeRoutesData(JSON.parse(routesFile.text || '{}'));
        state.routesSha = routesFile.sha || '';
      } catch (err) {
        if (!/404|Not Found/i.test(String(err.message || ''))) throw err;
      }
    }

    if (hasSelection()) populateEditor();
    updateGitStatus(`Loaded ${file.path}${settings.routesPath ? ` and ${settings.routesPath}` : ''} from ${settings.owner}/${settings.repo}${settings.branch ? ` (${settings.branch})` : ''}.`);
    updateDirtyUi();
  } catch (err) {
    updateGitStatus(err.message || 'Could not load from GitHub.', true);
  }
}

async function saveCsvToGitHub() {
  if (state.isSavingGitHub) return;
  const settings = getGitHubSettings();
  if (!settings.owner || !settings.repo || !settings.path) {
    updateGitStatus('Enter owner, repository, and CSV path first.', true);
    return;
  }
  if (!settings.token) {
    updateGitStatus('Enter a fine-grained GitHub token before saving.', true);
    return;
  }
  if (!state.headers.length) {
    updateGitStatus('No CSV is loaded yet.', true);
    return;
  }

  state.isSavingGitHub = true;
  updateDirtyUi();
  updateGitStatus('Saving pubs.csv and routes.json to GitHub…');

  try {
    let csvSha = state.githubSha;
    if (!csvSha) {
      try {
        const existing = await githubGetFile(settings.owner, settings.repo, settings.path, settings.branch, settings.token);
        csvSha = existing.sha || '';
      } catch (err) {
        if (!/404/.test(String(err.message || ''))) throw err;
      }
    }

    syncRoutesDataFromDrafts();

    let routesSha = state.routesSha;
    if (settings.routesPath && !routesSha) {
      try {
        const existingRoutes = await githubGetFile(settings.owner, settings.repo, settings.routesPath, settings.branch, settings.token);
        routesSha = existingRoutes.sha || '';
        if (!Object.keys(state.routesData || {}).length) {
          state.routesData = normalizeRoutesData(JSON.parse(existingRoutes.text || '{}'));
        }
      } catch (err) {
        if (!/404/.test(String(err.message || ''))) throw err;
      }
    }

    const message = settings.message || `Update pubs/routes via admin tool ${formatDate(new Date())}`;
    const csvText = buildCsvText();
    const csvResult = await githubPutFile(settings.owner, settings.repo, settings.path, settings.branch, settings.token, csvText, csvSha, message);
    state.githubSha = csvResult.content?.sha || csvSha || '';

    if (settings.routesPath) {
      const routesText = JSON.stringify(state.routesData || {}, null, 2) + "\n";
      const routesResult = await githubPutFile(settings.owner, settings.repo, settings.routesPath, settings.branch, settings.token, routesText, routesSha, message);
      state.routesSha = routesResult.content?.sha || routesSha || '';
    }

    state.githubLastLoadedAt = new Date().toISOString();
    state.loadedFilename = settings.path.split('/').pop() || 'pubs.csv';
    updateGitStatus(`Saved ${settings.path}${settings.routesPath ? ` and ${settings.routesPath}` : ''} to ${settings.owner}/${settings.repo}.`);
  } catch (err) {
    updateGitStatus(err.message || 'Could not save to GitHub.', true);
  } finally {
    state.isSavingGitHub = false;
    updateDirtyUi();
  }
}

async function githubGetFile(owner, repo, path, branch = 'main', token = '') {
  const url = buildGitHubContentsUrl(owner, repo, path, branch);
  const headers = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  const data = await safeJson(res);
  if (!res.ok) {
    throw new Error(data?.message ? `GitHub load failed: ${data.message}` : `GitHub load failed (${res.status}).`);
  }
  const content = String(data?.content || '').replace(/\n/g, '');
  return {
    sha: data?.sha || '',
    path: data?.path || path,
    text: decodeBase64Utf8(content)
  };
}

async function githubPutFile(owner, repo, path, branch, token, textContent, sha, message) {
  const url = buildGitHubContentsUrl(owner, repo, path, '');
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
  const body = {
    message,
    content: encodeBase64Utf8(textContent),
    branch: branch || 'main'
  };
  if (sha) body.sha = sha;

  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body)
  });
  const data = await safeJson(res);
  if (!res.ok) {
    throw new Error(data?.message ? `GitHub save failed: ${data.message}` : `GitHub save failed (${res.status}).`);
  }
  return data;
}

function buildGitHubContentsUrl(owner, repo, path, branch = '') {
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  return branch ? `${base}?ref=${encodeURIComponent(branch)}` : base;
}

function getGitHubSettings() {
  return {
    owner: String(els.githubOwner.value || '').trim(),
    repo: String(els.githubRepo.value || '').trim(),
    branch: String(els.githubBranch.value || '').trim() || 'main',
    path: String(els.githubPath.value || '').trim() || 'app/public/data/pubs.csv',
    routesPath: String(els.githubRoutesPath.value || '').trim() || 'app/public/data/routes.json',
    token: String(els.githubToken.value || '').trim(),
    rememberToken: !!els.githubRememberToken.checked,
    message: String(els.githubMessage.value || '').trim()
  };
}

function persistSettings() {
  const settings = getGitHubSettings();
  const payload = {
    owner: settings.owner,
    repo: settings.repo,
    branch: settings.branch,
    path: settings.path,
    routesPath: settings.routesPath,
    message: settings.message,
    rememberToken: settings.rememberToken,
    token: settings.rememberToken ? settings.token : ''
  };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
  } catch {}
}

function restoreSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY) || '';
    if (!raw) return;
    const payload = JSON.parse(raw);
    els.githubOwner.value = payload.owner || '';
    els.githubRepo.value = payload.repo || '';
    els.githubBranch.value = payload.branch || 'main';
    els.githubPath.value = payload.path || 'app/public/data/pubs.csv';
    els.githubRoutesPath.value = payload.routesPath || 'app/public/data/routes.json';
    els.githubMessage.value = payload.message || 'Update pubs/routes via admin tool';
    els.githubRememberToken.checked = !!payload.rememberToken;
    els.githubToken.value = payload.rememberToken ? (payload.token || '') : '';
  } catch {}
}

function updateGitStatus(message = '', isError = false) {
  let text = message;
  if (!text) {
    const settings = getGitHubSettings();
    text = settings.owner && settings.repo
      ? `Target repo: ${settings.owner}/${settings.repo} · branch: ${settings.branch} · CSV: ${settings.path} · Routes: ${settings.routesPath}`
      : 'Load is optional for public repos. Save writes pubs.csv and routes.json with a token that has repository Contents write permission.';
  }
  els.gitStatus.textContent = text;
  els.gitStatus.classList.toggle('errorText', !!isError);
}

function onFileChosen(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.githubSha = '';
    state.githubLastLoadedAt = '';
    loadCsvText(String(reader.result || ''), file.name);
  };
  reader.readAsText(file);
}

function loadCsvText(text, filename = 'pubs.csv') {
  const parsed = parseCsv(text);
  if (!parsed.headers.length) {
    clearEditor('CSV looks empty.');
    return;
  }
  state.headers = mergeHeaders(parsed.headers);
  state.rows = parsed.rows.map(row => materializeRow(row, state.headers));
  state.loadedFilename = filename;
  state.selectedIndex = state.rows.length ? 0 : -1;
  state.restoredFromDraft = false;
  state.draftSavedAt = '';
  state.routeDrafts = state.routeDrafts || {};
  renderPubList();
  if (hasSelection()) populateEditor();
  else clearEditor('No rows in CSV.');
  updateDirtyUi();
}

function mergeHeaders(headers) {
  const seen = new Set();
  const out = [];
  for (const h of headers) {
    const name = String(h || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  for (const h of KNOWN_HEADERS) {
    if (!seen.has(h)) out.push(h);
  }
  return out;
}

function materializeRow(row, headers) {
  const obj = {};
  headers.forEach(h => { obj[h] = String(row[h] ?? '').trim(); });
  return obj;
}

function normalizeRoutesData(data) {
  if (!data || typeof data !== 'object') return {};
  if (Array.isArray(data)) {
    const out = {};
    data.forEach(route => {
      const key = String(route?.id || '').trim();
      if (key) out[key] = route;
    });
    return out;
  }
  return data;
}

function parseCsv(text) {
  const lines = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]).map(v => String(v || '').trim());
  const rows = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = String(cols[i] ?? '').trim(); });
    rows.push(row);
  }
  return { headers, rows };
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function escapeCsvCell(value) {
  const text = String(value ?? '');
  if (/[,"\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
  return text;
}

function buildCsvText() {
  return [state.headers.map(escapeCsvCell).join(',')]
    .concat(state.rows.map(row => state.headers.map(h => escapeCsvCell(row[h] ?? '')).join(',')))
    .join('\n');
}

function renderPubList() {
  const q = els.searchInput.value.trim().toLowerCase();
  state.filteredIndexes = [];

  if (q) {
    state.rows.forEach((row, idx) => {
      const hay = `${row.id} ${row.name} ${row.address}`.toLowerCase();
      if (hay.includes(q)) state.filteredIndexes.push(idx);
    });
    state.filteredIndexes = state.filteredIndexes.slice(0, MAX_SEARCH_RESULTS);
  } else if (hasSelection()) {
    state.filteredIndexes = [state.selectedIndex];
  }

  els.pubList.innerHTML = '';

  if (!state.rows.length) {
    els.pubList.innerHTML = '<div class="emptyList">No pubs loaded yet.</div>';
  } else if (!q && hasSelection()) {
    const row = state.rows[state.selectedIndex];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pubBtn active';
    btn.innerHTML = `<span class="name">${escapeHtml(row.name || '(untitled pub)')}</span><span class="meta">${escapeHtml(row.id || 'no-id')} · current selection</span>`;
    els.pubList.appendChild(btn);
  } else if (!q) {
    els.pubList.innerHTML = '<div class="emptyList">Type to search for a pub, or tap New pub.</div>';
  } else if (!state.filteredIndexes.length) {
    els.pubList.innerHTML = '<div class="emptyList">No matching pubs found.</div>';
  } else {
    state.filteredIndexes.forEach(idx => {
      const row = state.rows[idx];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pubBtn' + (idx === state.selectedIndex ? ' active' : '');
      btn.innerHTML = `<span class="name">${escapeHtml(row.name || '(untitled pub)')}</span><span class="meta">${escapeHtml(row.id || 'no-id')} · ${escapeHtml(row.spot_a || '')}</span>`;
      btn.addEventListener('click', () => {
        state.selectedIndex = idx;
        populateEditor();
        els.searchInput.value = '';
        renderPubList();
        updateDirtyUi();
        saveDraftToLocal();
      });
      els.pubList.appendChild(btn);
    });
  }

  const selected = hasSelection() ? state.rows[state.selectedIndex] : null;
  const selectedText = selected ? ` · selected: ${selected.name || selected.id || '(untitled pub)'}` : '';
  const draftText = state.restoredFromDraft ? ' · local draft active' : '';
  els.pubCount.textContent = `${state.rows.length} row${state.rows.length === 1 ? '' : 's'} · ${state.loadedFilename}${selectedText}${draftText}`;
}

function hasSelection() { return state.selectedIndex >= 0 && state.selectedIndex < state.rows.length; }
function getSelectedRow() { return hasSelection() ? state.rows[state.selectedIndex] : null; }

function populateEditor() {
  const row = getSelectedRow();
  if (!row) return clearEditor('No pub selected.');
  Object.entries(fieldIds).forEach(([key, el]) => {
    el.value = row[key] ?? '';
  });
  rebuildPointRowsFromString('a', false);
  rebuildPointRowsFromString('b', false);
  loadRouteDraftIntoEditor();
  updatePreview();
  updateUploadUi();
  updateDirtyUi();
}


function clearEditor(message) {
  Object.values(fieldIds).forEach(el => { el.value = ''; });
  pointLists.a.innerHTML = '';
  pointLists.b.innerHTML = '';
  els.previewSummaryA.textContent = message || 'No preview yet';
  els.previewSummaryB.textContent = message || 'No preview yet';
  els.graphA.innerHTML = '';
  els.graphB.innerHTML = '';
  els.spotAStatus.className = 'pill muted';
  els.spotAStatus.textContent = 'Waiting for points';
  els.spotBStatus.className = 'pill muted';
  els.spotBStatus.textContent = 'Optional';
  clearRouteEditor();
  clearUploadLocalPreview();
  if (els.uploadReturnedUrl) els.uploadReturnedUrl.value = '';
  if (els.uploadFileName) {
    els.uploadFileName.value = '';
    els.uploadFileName.placeholder = 'No image selected';
  }
  setUploadPreview('');
  updateUploadUi(message || 'Choose a pub, choose an image, then upload. The matching URL field will fill automatically.');
  updateDirtyUi();
}


function normalizeFieldValue(key, value) {
  if (key === 'worth_the_trip' || key === 'cycle_friendly') return String(value || '').trim().toLowerCase();
  return String(value ?? '').trim();
}

function createNewPub() {
  const row = {};
  state.headers.forEach(h => { row[h] = ''; });
  row.id = uniqueId('new_pub', state.rows.map(r => r.id));
  row.base_date = formatDate(new Date());
  state.rows.unshift(row);
  state.selectedIndex = 0;
  renderPubList();
  populateEditor();
  saveDraftToLocal();
}

function duplicateSelectedPub() {
  const row = getSelectedRow();
  if (!row) return;
  const copy = { ...row };
  copy.id = uniqueId((row.id || 'copy') + '_copy', state.rows.map(r => r.id));
  state.rows.splice(state.selectedIndex + 1, 0, copy);
  state.selectedIndex += 1;
  renderPubList();
  populateEditor();
  saveDraftToLocal();
}

function deleteSelectedPub() {
  if (!hasSelection()) return;
  state.rows.splice(state.selectedIndex, 1);
  state.selectedIndex = state.rows.length ? Math.min(state.selectedIndex, state.rows.length - 1) : -1;
  renderPubList();
  if (hasSelection()) populateEditor();
  else clearEditor('No pub selected.');
  saveDraftToLocal();
}

function uniqueId(base, existing) {
  const clean = String(base || 'pub').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'pub';
  let candidate = clean;
  let n = 2;
  const used = new Set(existing.filter(Boolean));
  while (used.has(candidate)) candidate = `${clean}_${n++}`;
  return candidate;
}

function addPointRow(spot, az = '', alt = '') {
  const row = pointRowTemplate.content.firstElementChild.cloneNode(true);
  row.querySelector('.pointAz').value = az;
  row.querySelector('.pointAlt').value = alt;
  row.querySelectorAll('input').forEach(input => input.addEventListener('input', () => {
    syncPointRowsToField(spot, false);
    updatePreview();
  }));
  row.querySelector('.pointDelete').addEventListener('click', () => {
    row.remove();
    syncPointRowsToField(spot, false);
    updatePreview();
  });
  pointLists[spot].appendChild(row);
  syncPointRowsToField(spot, false);
  saveDraftToLocal();
}

function rebuildPointRowsFromString(spot, preserveManualFocus) {
  const field = fieldIds[`spot_${spot}_horizon`];
  pointLists[spot].innerHTML = '';
  parseHorizonProfile(field.value).forEach(point => addPointRow(spot, point.az, point.alt));
  if (!parseHorizonProfile(field.value).length && !preserveManualFocus) {
    // keep list empty
  }
  syncPointRowsToField(spot, false);
}

function getPointRows(spot) {
  return [...pointLists[spot].querySelectorAll('.pointRow')].map(row => ({
    row,
    az: row.querySelector('.pointAz').value,
    alt: row.querySelector('.pointAlt').value
  }));
}

function sortPointRows(spot) {
  const points = collectPointsFromRows(spot).sort((a, b) => a.az - b.az);
  pointLists[spot].innerHTML = '';
  points.forEach(p => addPointRow(spot, p.az, p.alt));
  syncPointRowsToField(spot, true);
  updatePreview();
}

function collectPointsFromRows(spot) {
  return getPointRows(spot)
    .map(({ az, alt }) => ({ az: Number(az), alt: Number(alt) }))
    .filter(p => Number.isFinite(p.az) && Number.isFinite(p.alt));
}

function syncPointRowsToField(spot, sort = false) {
  let points = collectPointsFromRows(spot);
  if (sort) points = points.sort((a, b) => a.az - b.az);
  const text = points.map(p => `${trimNumber(p.az)}:${trimNumber(p.alt)}`).join('|');
  fieldIds[`spot_${spot}_horizon`].value = text;
  if (hasSelection()) state.rows[state.selectedIndex][`spot_${spot}_horizon`] = text;
  renderSpotStatus(spot, points);
  updateDirtyUi();
  saveDraftToLocal();
}

function trimNumber(n) {
  const s = Number(n).toFixed(4);
  return s.replace(/\.0+$/,'').replace(/(\.\d*?)0+$/,'$1');
}

function renderSpotStatus(spot, points) {
  const pill = spot === 'a' ? els.spotAStatus : els.spotBStatus;
  if (!points.length) {
    pill.className = 'pill muted';
    pill.textContent = spot === 'a' ? 'Waiting for points' : 'Optional';
    return;
  }
  if (points.length < 2) {
    pill.className = 'pill warn';
    pill.textContent = 'Need at least 2 points';
    return;
  }
  pill.className = 'pill good';
  pill.textContent = `${points.length} point${points.length === 1 ? '' : 's'}`;
}

function updatePreview() {
  const row = getSelectedRow();
  if (!row) return;
  updateSpotPreview('a', row, els.previewDateA.value || row.base_date || formatDate(new Date()));
  updateSpotPreview('b', row, els.previewDateB.value || row.base_date || formatDate(new Date()));
}

function updateSpotPreview(spot, row, dateStr) {
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  const horizon = row[`spot_${spot}_horizon`] || '';
  const summaryEl = spot === 'a' ? els.previewSummaryA : els.previewSummaryB;
  const graphEl = spot === 'a' ? els.graphA : els.graphB;
  const profile = parseHorizonProfile(horizon);
  const dateText = dateStr || formatDate(new Date());

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    summaryEl.textContent = 'Enter latitude and longitude for preview.';
    graphEl.innerHTML = '';
    return;
  }

  const preview = hasHorizonProfile(horizon)
    ? getWindowFromHorizon(lat, lng, horizon, dateText)
    : null;

  if (preview) {
    summaryEl.textContent = `Sun from ${fmtTime(preview.start)} to ${fmtTime(preview.end)} on ${dateText}`;
  } else if (profile.length >= 2) {
    summaryEl.textContent = `No sun window found on ${dateText}.`;
  } else {
    summaryEl.textContent = 'Add at least two horizon points for preview.';
  }

  renderGraph(graphEl, lat, lng, profile, dateText, preview);
}

function renderGraph(svg, lat, lng, profile, dateStr, preview) {
  const width = 360;
  const height = 220;
  const padL = 26;
  const padR = 8;
  const padT = 10;
  const padB = 24;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const yForAlt = alt => padT + innerH - clamp(alt, 0, 90) / 90 * innerH;
  const xForAz = az => padL + clamp(az, 0, 360) / 360 * innerW;

  const sunPath = [];
  const targetDate = parseISODate(dateStr || formatDate(new Date()));
  for (let minutes = 7 * 60; minutes <= 23 * 60; minutes += 6) {
    const dt = minutesToLocalDate(targetDate, minutes);
    const sun = getSunPositionLocal(lat, lng, dt);
    sunPath.push({ az: sun.azimuth, alt: sun.elevation, minutes });
  }
  const visibleSunPath = sunPath.filter(p => p.alt > -6 && p.az >= 0 && p.az <= 360);

  let parts = [];
  parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="#fcfbf7" rx="14" ry="14"></rect>`);

  [0,90,180,270,360].forEach(az => {
    const x = xForAz(az);
    parts.push(`<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + innerH}" class="graphBoundary"></line>`);
    parts.push(`<text x="${x}" y="${height - 8}" text-anchor="middle" class="graphLabel">${az}°</text>`);
  });
  [0,15,30,45,60,75,90].forEach(alt => {
    const y = yForAlt(alt);
    parts.push(`<line x1="${padL}" y1="${y}" x2="${padL + innerW}" y2="${y}" class="graphBoundary"></line>`);
    parts.push(`<text x="4" y="${y + 4}" class="graphLabel">${alt}°</text>`);
  });

  if (visibleSunPath.length) {
    const sunPolyline = visibleSunPath.map(p => `${xForAz(p.az)},${yForAlt(p.alt)}`).join(' ');
    parts.push(`<polyline points="${sunPolyline}" class="graphLine graphSun"></polyline>`);
  }

  if (profile.length) {
    const horizonPolyline = profile.map(p => `${xForAz(p.az)},${yForAlt(p.alt)}`).join(' ');
    parts.push(`<polyline points="${horizonPolyline}" class="graphLine graphHorizon"></polyline>`);
    profile.forEach(p => {
      parts.push(`<circle cx="${xForAz(p.az)}" cy="${yForAlt(p.alt)}" r="3" class="graphPoint"></circle>`);
      parts.push(`<text x="${xForAz(p.az)+4}" y="${yForAlt(p.alt)-6}" class="graphLabel">${trimNumber(p.az)}:${trimNumber(p.alt)}</text>`);
    });
    if (profile.length >= 2) {
      parts.push(`<line x1="${xForAz(profile[0].az)}" y1="${padT}" x2="${xForAz(profile[0].az)}" y2="${padT+innerH}" class="graphBoundary"></line>`);
      parts.push(`<line x1="${xForAz(profile[profile.length-1].az)}" y1="${padT}" x2="${xForAz(profile[profile.length-1].az)}" y2="${padT+innerH}" class="graphBoundary"></line>`);
    }
  }

  if (preview) {
    const startSun = getSunPositionLocal(lat, lng, preview.start);
    const endSun = getSunPositionLocal(lat, lng, preview.end);
    [
      { label: `Start ${fmtTime(preview.start)}`, sun: startSun },
      { label: `End ${fmtTime(preview.end)}`, sun: endSun }
    ].forEach((item, idx) => {
      const x = xForAz(item.sun.azimuth);
      const y = yForAlt(item.sun.elevation);
      parts.push(`<circle cx="${x}" cy="${y}" r="4" fill="${idx === 0 ? '#1f6a20' : '#a12d22'}"></circle>`);
      parts.push(`<text x="${x + 5}" y="${y + (idx === 0 ? -6 : 14)}" class="graphLabel">${item.label}</text>`);
    });
  }

  parts.push(`<text x="${padL}" y="12" class="legend">Horizon profile</text>`);
  parts.push(`<text x="${padL + 104}" y="12" class="legend">·</text>`);
  parts.push(`<text x="${padL + 114}" y="12" class="legend">Sun path ${escapeHtml(dateStr)}</text>`);
  svg.innerHTML = parts.join('');
}

function downloadCsv() {
  if (!state.headers.length) return;
  const csv = buildCsvText();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pubs.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  updateDraftStatus('Downloaded pubs.csv. Upload that file to GitHub when ready.');
}

function updateDirtyUi() {
  const enabled = state.headers.length > 0;
  const settings = getGitHubSettings();
  els.btnDownload.disabled = !enabled;
  els.btnSaveDraft.disabled = !enabled;
  els.btnRestoreDraft.disabled = !hasLocalDraft();
  els.btnClearDraft.disabled = !hasLocalDraft();
  els.btnDuplicate.disabled = !hasSelection();
  els.btnDelete.disabled = !hasSelection();
  els.btnGitHubSave.disabled = !enabled || state.isSavingGitHub || !settings.owner || !settings.repo || !settings.path;
  const hasSnippet = !!String(els.routeSnippet.value || '').trim();
  els.btnRouteCopy.disabled = !hasSnippet;
  els.btnRouteDownload.disabled = !hasSnippet;
  els.btnRouteClear.disabled = !hasSelection() && !hasSnippet;
  const hasUploadReady = hasSelection() && !!String(els.uploadToken.value || '').trim() && !!els.uploadFile.files?.[0];
  els.btnUploadMain.disabled = !hasUploadReady;
  els.btnUploadSpotA.disabled = !hasUploadReady;
  els.btnUploadSpotB.disabled = !hasUploadReady;
}




function persistUploadSettings() {
  const payload = {
    rememberToken: !!els.uploadRememberToken.checked,
    token: els.uploadRememberToken.checked ? String(els.uploadToken.value || '').trim() : ''
  };
  try {
    localStorage.setItem(UPLOAD_SETTINGS_KEY, JSON.stringify(payload));
  } catch {}
}

function restoreUploadSettings() {
  try {
    const raw = localStorage.getItem(UPLOAD_SETTINGS_KEY) || '';
    if (!raw) return;
    const payload = JSON.parse(raw);
    els.uploadRememberToken.checked = !!payload.rememberToken;
    els.uploadToken.value = payload.rememberToken ? (payload.token || '') : '';
  } catch {}
}

function getUploadSlug(row = getSelectedRow()) {
  if (!row) return '';
  const raw = String(row.id || row.name || '').trim();
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function getUploadTargetFieldKey(imageType) {
  if (imageType === 'spot-a') return 'spot_a_photo_url';
  if (imageType === 'spot-b') return 'spot_b_photo_url';
  return 'image_url';
}

function updateUploadUi(message = '', isError = false) {
  const row = getSelectedRow();
  const slug = getUploadSlug(row);
  if (els.uploadSlug) els.uploadSlug.value = slug;
  if (!els.uploadFile.files?.length && els.uploadFileName) {
    els.uploadFileName.value = '';
    els.uploadFileName.placeholder = 'No image selected';
  }
  const mainValue = row ? String(row.image_url || '').trim() : '';
  const spotAValue = row ? String(row.spot_a_photo_url || '').trim() : '';
  const spotBValue = row ? String(row.spot_b_photo_url || '').trim() : '';
  const defaultText = row
    ? 'Choose a pub and image, then use the exact target button you want: Main image, Spot A, or Spot B.'
    : 'Choose a pub, choose an image, then use Main image, Spot A, or Spot B.';
  els.uploadStatus.textContent = message || defaultText;
  els.uploadStatus.classList.toggle('errorText', !!isError);
  const previewUrl =
    String(state.uploadLocalPreviewUrl || '').trim() ||
    String(els.uploadReturnedUrl.value || '').trim() ||
    mainValue || spotAValue || spotBValue || '';
  if (previewUrl) {
    setUploadPreview(previewUrl);
  } else {
    setUploadPreview('');
  }
  if (!row && els.uploadReturnedUrl) {
    els.uploadReturnedUrl.value = '';
    clearUploadLocalPreview();
    setUploadPreview('');
  }
  updateDirtyUi();
}

function clearUploadLocalPreview() {
  if (state.uploadLocalPreviewUrl) {
    try { URL.revokeObjectURL(state.uploadLocalPreviewUrl); } catch {}
    state.uploadLocalPreviewUrl = '';
  }
}

function setUploadPreview(url) {
  const clean = String(url || '').trim();
  if (!clean) {
    els.uploadPreviewWrap.classList.add('isHidden');
    els.uploadPreviewImg.removeAttribute('src');
    return;
  }
  els.uploadPreviewWrap.classList.remove('isHidden');
  els.uploadPreviewImg.src = clean;
}

function onUploadFileChosen() {
  const file = els.uploadFile.files?.[0] || null;
  if (els.uploadFileName) {
    els.uploadFileName.value = file ? file.name : '';
    els.uploadFileName.placeholder = file ? '' : 'No image selected';
  }
  clearUploadLocalPreview();
  if (file) {
    state.uploadLocalPreviewUrl = URL.createObjectURL(file);
    setUploadPreview(state.uploadLocalPreviewUrl);
  } else {
    setUploadPreview('');
  }
  updateUploadUi(file ? `Ready to upload ${file.name}. Choose Main image, Spot A, or Spot B.` : '');
}

async function uploadCurrentImage(targetType = 'main') {
  const row = getSelectedRow();
  if (!row) {
    updateUploadUi('Choose a pub first.', true);
    return;
  }

  const token = String(els.uploadToken.value || '').trim();
  const file = els.uploadFile.files?.[0] || null;
  const imageType = String(targetType || 'main');
  const pubSlug = getUploadSlug(row);

  if (!token) {
    updateUploadUi('Paste your Cloudflare upload token first.', true);
    return;
  }
  if (!pubSlug) {
    updateUploadUi('This pub needs an id or name before you can upload.', true);
    return;
  }
  if (!file) {
    updateUploadUi('Choose an image file first.', true);
    return;
  }

  persistUploadSettings();
  els.btnUploadMain.disabled = true;
  els.btnUploadSpotA.disabled = true;
  els.btnUploadSpotB.disabled = true;
  updateUploadUi('Uploading image to Cloudflare…');

  try {
    const form = new FormData();
    form.append('file', file);
    form.append('pubSlug', pubSlug);
    form.append('imageType', imageType);
    form.append('replace', 'true');

    const res = await fetch(UPLOAD_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: form
    });

    const data = await safeJson(res);

    if (!res.ok || !data?.ok || !data?.url) {
      throw new Error(data?.error || `Upload failed (${res.status}).`);
    }

    const targetKey = getUploadTargetFieldKey(imageType);
    row[targetKey] = data.url;
    if (fieldIds[targetKey]) fieldIds[targetKey].value = data.url;
    els.uploadReturnedUrl.value = data.url;
    clearUploadLocalPreview();
    setUploadPreview(data.url);
    els.uploadFile.value = '';
    if (els.uploadFileName) {
      els.uploadFileName.value = '';
      els.uploadFileName.placeholder = 'No image selected';
    }
    updateUploadUi(`Upload complete. ${targetKey} filled automatically with the Cloudflare URL.`);
    updatePreview();
    saveDraftToLocal();
  } catch (err) {
    updateUploadUi(err?.message || 'Upload failed.', true);
  } finally {
    updateDirtyUi();
  }
}

function saveDraftToLocal(manual = false) {
  if (!state.headers.length) return;
  const payload = {
    headers: state.headers,
    rows: state.rows,
    selectedIndex: state.selectedIndex,
    loadedFilename: state.loadedFilename,
    searchQuery: els.searchInput.value || '',
    previewDateA: els.previewDateA.value || '',
    previewDateB: els.previewDateB.value || '',
    githubSha: state.githubSha || '',
    routeDrafts: state.routeDrafts || {},
    savedAt: new Date().toISOString()
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    state.draftSavedAt = payload.savedAt;
    state.restoredFromDraft = true;
    updateDraftStatus(manual ? 'Draft saved on this device.' : 'Draft auto-saved on this device.');
    updateDirtyUi();
  } catch {
    updateDraftStatus('Could not save local draft on this device.');
  }
}

function hasLocalDraft() {
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

function restoreDraftFromLocal() {
  let raw = '';
  try {
    raw = localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return false;
  }
  if (!raw) return false;
  try {
    const payload = JSON.parse(raw);
    if (!Array.isArray(payload.headers) || !Array.isArray(payload.rows)) return false;
    state.headers = mergeHeaders(payload.headers);
    state.rows = payload.rows.map(row => materializeRow(row, state.headers));
    state.selectedIndex = Number.isInteger(payload.selectedIndex) ? Math.max(0, Math.min(payload.selectedIndex, Math.max(0, state.rows.length - 1))) : (state.rows.length ? 0 : -1);
    state.loadedFilename = payload.loadedFilename || 'pubs.csv';
    state.draftSavedAt = payload.savedAt || '';
    state.githubSha = payload.githubSha || '';
    state.routeDrafts = payload.routeDrafts || {};
    state.restoredFromDraft = true;
    els.searchInput.value = payload.searchQuery || '';
    if (payload.previewDateA) els.previewDateA.value = payload.previewDateA;
    if (payload.previewDateB) els.previewDateB.value = payload.previewDateB;
    renderPubList();
    if (hasSelection()) populateEditor();
    else clearEditor('No rows in local draft.');
    updateDirtyUi();
    return true;
  } catch {
    return false;
  }
}

function clearLocalDraft() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  state.draftSavedAt = '';
  state.restoredFromDraft = false;
  updateDirtyUi();
}

function updateDraftStatus(message = '') {
  let text = message;
  if (!text) {
    if (state.restoredFromDraft && state.draftSavedAt) {
      text = `Local draft active on this device · last saved ${formatDraftStamp(state.draftSavedAt)}.`;
    } else if (hasLocalDraft()) {
      text = 'Local draft available on this device.';
    } else {
      text = 'Latest CSV will load by default. Local draft restore is available on this device.';
    }
  }
  els.draftStatus.textContent = text;
}

function formatDraftStamp(isoText) {
  const dt = new Date(isoText);
  if (Number.isNaN(dt.getTime())) return 'recently';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(dt);
}

function getRouteDraftKey(row = getSelectedRow(), selectedIndex = state.selectedIndex) {
  if (!row) return '';
  const id = String(row.id || '').trim();
  return id ? `id:${id}` : `idx:${selectedIndex}`;
}

function getCurrentRouteDraft() {
  const key = getRouteDraftKey();
  return key ? (state.routeDrafts[key] || null) : null;
}

function loadRouteDraftIntoEditor() {
  const draft = getCurrentRouteDraft();
  const row = getSelectedRow();
  const existingRoute = getCurrentSavedRouteObject(row);
  els.routeStartLabel.value = draft?.startLabel || existingRoute?.start?.label || 'Near Nottingham city centre';
  els.routeStartLat.value = draft?.startLat ?? existingRoute?.start?.lat ?? '';
  els.routeStartLng.value = draft?.startLng ?? existingRoute?.start?.lng ?? '';
  els.routeGpxName.value = draft?.gpxName || existingRoute?.id || '';
  renderRouteDraft(row, draft, '', existingRoute);
}

function clearRouteEditor() {
  els.routeStartLabel.value = 'Near Nottingham city centre';
  els.routeStartLat.value = '';
  els.routeStartLng.value = '';
  els.routeGpxName.value = '';
  els.routeSummary.value = '';
  els.routeSnippet.value = '';
  if (els.routeGpxFile) els.routeGpxFile.value = '';
}

function syncCurrentRouteDraftFromInputs(showStatus = false) {
  const row = getSelectedRow();
  const existing = getCurrentRouteDraft();
  if (!row || !existing) {
    renderRouteDraft(row, existing);
    return;
  }
  existing.startLabel = String(els.routeStartLabel.value || '').trim() || 'Near Nottingham city centre';
  existing.startLat = parseFiniteOrBlank(els.routeStartLat.value);
  existing.startLng = parseFiniteOrBlank(els.routeStartLng.value);
  existing.gpxName = String(els.routeGpxName.value || '').trim();
  existing.snippet = buildRouteSnippet(row, existing);
  upsertRouteObjectFromDraft(row, existing);
  renderRouteDraft(row, existing, showStatus ? 'Route draft updated.' : '');
}

function clearCurrentRouteDraft() {
  const row = getSelectedRow();
  const key = getRouteDraftKey();
  if (key && state.routeDrafts[key]) delete state.routeDrafts[key];
  if (row) row.curated_route_id = row.curated_route_id || '';
  if (fieldIds.curated_route_id && row) fieldIds.curated_route_id.value = row.curated_route_id || '';
  clearRouteEditor();
  updateDraftStatus('Cleared local route draft for the current pub. Saved routes.json data is unchanged until you overwrite it.');
  updateDirtyUi();
  saveDraftToLocal();
}

async function copyRouteSnippet() {
  const text = String(els.routeSnippet.value || '').trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    updateDraftStatus('Copied route preview to clipboard.');
  } catch {
    updateDraftStatus('Could not copy automatically. Select and copy the route snippet manually.');
  }
}

function downloadRouteSnippet() {
  const text = String(els.routeSnippet.value || '').trim();
  if (!text) return;
  const row = getSelectedRow();
  const routeId = String(row?.curated_route_id || row?.id || 'route').trim();
  const blob = new Blob([text + "\n"], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${routeId || 'route'}-snippet.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  updateDraftStatus('Downloaded route preview snippet.');
}

function onRouteGpxChosen(event) {
  const file = event.target.files?.[0];
  const row = getSelectedRow();
  if (!file || !row) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const xmlText = String(reader.result || '');
      const draft = buildRouteDraftFromGpx(xmlText, file.name, row);
      const key = getRouteDraftKey(row, state.selectedIndex);
      if (key) state.routeDrafts[key] = draft;
      if (!row.curated_route_id) {
        row.curated_route_id = sanitizeRouteId(row.id || row.name || file.name.replace(/\.gpx$/i, 'route'));
        if (fieldIds.curated_route_id) fieldIds.curated_route_id.value = row.curated_route_id;
      }
      upsertRouteObjectFromDraft(row, draft);
      loadRouteDraftIntoEditor();
      updateDirtyUi();
      saveDraftToLocal();
      updateDraftStatus(`Loaded GPX route with ${draft.points.length} points.`);
    } catch (err) {
      updateDraftStatus(err?.message || 'Could not read GPX file.');
    }
    if (els.routeGpxFile) els.routeGpxFile.value = '';
  };
  reader.readAsText(file);
}

function buildRouteDraftFromGpx(xmlText, fileName, row) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('GPX parse failed.');
  const pts = Array.from(xml.querySelectorAll('trkpt, rtept')).map(node => {
    const lat = Number(node.getAttribute('lat'));
    const lng = Number(node.getAttribute('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return [lat, lng];
  }).filter(Boolean);
  if (pts.length < 2) throw new Error('GPX needs at least 2 route points.');
  const stats = computeRouteStats(pts);
  return {
    gpxName: String(fileName || '').trim(),
    startLabel: String(els.routeStartLabel.value || '').trim() || 'Near Nottingham city centre',
    startLat: parseFiniteOrBlank(els.routeStartLat.value),
    startLng: parseFiniteOrBlank(els.routeStartLng.value),
    points: pts,
    bbox: stats.bbox,
    distanceKm: stats.distanceKm,
    minutesAt15kph: Math.round((stats.distanceKm / 15) * 60),
    minutesAt18kph: Math.round((stats.distanceKm / 18) * 60),
    encodedPolyline5: encodePolyline5(pts)
  };
}

function renderRouteDraft(row, draft, statusMessage = '', existingRoute = null) {
  if (!row) {
    clearRouteEditor();
    return;
  }
  const routeObj = existingRoute || getCurrentSavedRouteObject(row);
  if (!draft && !routeObj) {
    els.routeSummary.value = statusMessage || 'No GPX route loaded for this pub yet.';
    els.routeSnippet.value = '';
    return;
  }
  if (draft) {
    els.routeStartLabel.value = draft.startLabel || 'Near Nottingham city centre';
    els.routeStartLat.value = draft.startLat ?? '';
    els.routeStartLng.value = draft.startLng ?? '';
    els.routeGpxName.value = draft.gpxName || '';
    draft.snippet = buildRouteSnippet(row, draft);
    els.routeSummary.value = `${draft.gpxName || 'route.gpx'} · ${draft.points.length} points · ${draft.distanceKm.toFixed(2)} km · ~${draft.minutesAt18kph} min at 18kph`;
    els.routeSnippet.value = draft.snippet;
    return;
  }
  els.routeSummary.value = statusMessage || `${routeObj.id || row.curated_route_id || 'route'} · ${Number(routeObj?.stats?.routePoints || 0)} points · ${Number(routeObj?.stats?.distanceKm || 0).toFixed(2)} km · ~${Number(routeObj?.stats?.minutesAt18kph || 0)} min at 18kph`;
  els.routeSnippet.value = buildRouteEntrySnippet(String(routeObj.id || row.curated_route_id || row.id || 'route'), routeObj);
}

function buildRouteSnippet(row, draft) {
  if (!row || !draft || !draft.points?.length) return '';
  const routeId = sanitizeRouteId(String(row.curated_route_id || row.id || row.name || 'route').trim());
  const pubName = jsQuote(String(row.name || '').trim() || routeId);
  const startLabel = jsQuote(String(draft.startLabel || 'Near Nottingham city centre').trim() || 'Near Nottingham city centre');
  const startLat = Number.isFinite(draft.startLat) ? draft.startLat : draft.points[0][0];
  const startLng = Number.isFinite(draft.startLng) ? draft.startLng : draft.points[0][1];
  const endLat = Number(row.lat);
  const endLng = Number(row.lng);
  const finalEndLat = Number.isFinite(endLat) ? endLat : draft.points[draft.points.length - 1][0];
  const finalEndLng = Number.isFinite(endLng) ? endLng : draft.points[draft.points.length - 1][1];
  const bbox = draft.bbox.map(v => Number(v.toFixed(6)));
  return `${routeId}: {
  id: '${routeId}',
  pubName: '${pubName}',
  start: {
    label: '${startLabel}',
    lat: ${formatJsNumber(startLat)},
    lng: ${formatJsNumber(startLng)}
  },
  end: {
    label: '${pubName}',
    lat: ${formatJsNumber(finalEndLat)},
    lng: ${formatJsNumber(finalEndLng)}
  },
  stats: {
    routePoints: ${draft.points.length},
    distanceKm: ${formatJsNumber(draft.distanceKm)},
    minutesAt15kph: ${draft.minutesAt15kph},
    minutesAt18kph: ${draft.minutesAt18kph}
  },
  map: {
    bbox: [${bbox.map(formatJsNumber).join(', ')}],
    encodedPolyline5: '${draft.encodedPolyline5}'
  }
},`;
}

function getCurrentSavedRouteObject(row = getSelectedRow()) {
  if (!row) return null;
  const routeId = String(row.curated_route_id || '').trim();
  return routeId && state.routesData ? (state.routesData[routeId] || null) : null;
}

function buildRouteObject(row, draft) {
  if (!row || !draft || !draft.points?.length) return null;
  const routeId = sanitizeRouteId(String(row.curated_route_id || row.id || row.name || 'route').trim());
  const startLabel = String(draft.startLabel || 'Near Nottingham city centre').trim() || 'Near Nottingham city centre';
  const startLat = Number.isFinite(draft.startLat) ? draft.startLat : draft.points[0][0];
  const startLng = Number.isFinite(draft.startLng) ? draft.startLng : draft.points[0][1];
  const endLat = Number(row.lat);
  const endLng = Number(row.lng);
  const finalEndLat = Number.isFinite(endLat) ? endLat : draft.points[draft.points.length - 1][0];
  const finalEndLng = Number.isFinite(endLng) ? endLng : draft.points[draft.points.length - 1][1];
  const bbox = draft.bbox.map(v => Number(v.toFixed(6)));
  return {
    id: routeId,
    pubName: String(row.name || '').trim() || routeId,
    start: {
      label: startLabel,
      lat: Number(startLat.toFixed(6)),
      lng: Number(startLng.toFixed(6))
    },
    end: {
      label: String(row.name || '').trim() || routeId,
      lat: Number(finalEndLat.toFixed(6)),
      lng: Number(finalEndLng.toFixed(6))
    },
    stats: {
      routePoints: draft.points.length,
      distanceKm: Number(draft.distanceKm.toFixed(2)),
      minutesAt15kph: draft.minutesAt15kph,
      minutesAt18kph: draft.minutesAt18kph
    },
    map: {
      bbox,
      encodedPolyline5: draft.encodedPolyline5
    }
  };
}

function buildRouteEntrySnippet(routeId, routeObj) {
  if (!routeObj) return '';
  return `${routeId}: ${JSON.stringify(routeObj, null, 2)},`;
}

function upsertRouteObjectFromDraft(row, draft) {
  const routeObj = buildRouteObject(row, draft);
  if (!routeObj) return;
  if (!state.routesData || typeof state.routesData !== 'object') state.routesData = {};
  state.routesData[routeObj.id] = routeObj;
}

function syncRoutesDataFromDrafts() {
  if (!state.routesData || typeof state.routesData !== 'object') state.routesData = {};
  const byKey = state.routeDrafts || {};
  Object.keys(byKey).forEach(key => {
    const draft = byKey[key];
    const row = findRowForRouteDraftKey(key);
    if (!row) return;
    upsertRouteObjectFromDraft(row, draft);
  });
}

function findRowForRouteDraftKey(key) {
  if (!key) return null;
  if (key.startsWith('id:')) {
    const id = key.slice(3);
    return state.rows.find(row => String(row.id || '').trim() === id) || null;
  }
  if (key.startsWith('idx:')) {
    const idx = Number(key.slice(4));
    return Number.isInteger(idx) && idx >= 0 && idx < state.rows.length ? state.rows[idx] : null;
  }
  return null;
}

function computeRouteStats(points) {
  let distanceKm = 0;
  let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const [lat, lng] = points[i];
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
    if (i) distanceKm += haversineKm(points[i - 1][0], points[i - 1][1], lat, lng);
  }
  return { distanceKm, bbox: [minLng, minLat, maxLng, maxLat] };
}

function encodePolyline5(points) {
  let lastLat = 0, lastLng = 0;
  let out = '';
  for (const [lat, lng] of points) {
    const ilat = Math.round(lat * 1e5);
    const ilng = Math.round(lng * 1e5);
    out += encodePolylineValue(ilat - lastLat);
    out += encodePolylineValue(ilng - lastLng);
    lastLat = ilat; lastLng = ilng;
  }
  return out;
}

function encodePolylineValue(value) {
  let v = value < 0 ? ~(value << 1) : (value << 1);
  let encoded = '';
  while (v >= 0x20) {
    encoded += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  encoded += String.fromCharCode(v + 63);
  return encoded;
}

function sanitizeRouteId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'route';
}

function parseFiniteOrBlank(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatJsNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return String(Number(n.toFixed(6)));
}

function jsQuote(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\'");
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function normalizeAzimuth(az) {
  let value = Number(az);
  if (!Number.isFinite(value)) return null;
  value = value % 360;
  if (value < 0) value += 360;
  return value;
}

function parseHorizonProfile(horizonStr) {
  return String(horizonStr || '')
    .split('|')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const [azStr, altStr] = part.split(':').map(s => s.trim());
      const az = normalizeAzimuth(azStr);
      const alt = Number(altStr);
      if (!Number.isFinite(az) || !Number.isFinite(alt)) return null;
      return { az, alt };
    })
    .filter(Boolean)
    .sort((a, b) => a.az - b.az);
}

function hasHorizonProfile(horizonStr) {
  return parseHorizonProfile(horizonStr).length >= 2;
}

function horizonAltitudeAt(profile, azimuth) {
  const az = normalizeAzimuth(azimuth);
  if (!profile.length || az == null) return Infinity;
  if (az < profile[0].az) return Infinity;
  for (let i = 1; i < profile.length; i++) {
    const prev = profile[i - 1];
    const next = profile[i];
    if (az <= next.az) {
      const span = next.az - prev.az || 1;
      const t = (az - prev.az) / span;
      return prev.alt + ((next.alt - prev.alt) * t);
    }
  }
  return Infinity;
}

function getWindowFromHorizon(lat, lng, horizonStr, targetDateStr) {
  const profile = parseHorizonProfile(horizonStr);
  if (profile.length < 2) return null;
  const targetDate = parseISODate(targetDateStr);
  const stepMinutes = 2;
  let firstSun = null;
  let lastSun = null;
  for (let minutes = 7 * 60; minutes <= 23 * 60; minutes += stepMinutes) {
    const dt = minutesToLocalDate(targetDate, minutes);
    const sun = getSunPositionLocal(lat, lng, dt);
    const obstructionAlt = horizonAltitudeAt(profile, sun.azimuth);
    const inSun = sun.elevation > obstructionAlt;
    if (inSun && !firstSun) firstSun = new Date(dt);
    if (inSun) lastSun = new Date(dt);
  }
  if (!firstSun || !lastSun) return null;
  return { start: firstSun, end: lastSun };
}

function getSunPositionLocal(lat, lng, dateObj) {
  const parts = getLondonDateParts(dateObj);
  const localMinutes = parts.hour + (parts.minute / 60) + (parts.second / 3600);
  const dayDate = createUtcAnchorDate(parts.year, parts.month, parts.day);
  const n = dayOfYear(dayDate);
  const gamma = (2 * Math.PI / 365) * (n - 1 + ((localMinutes - 12) / 24));
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const tzOffsetMin = getLondonOffsetMinutesForDateParts(parts.year, parts.month, parts.day);
  const minutesNow = (parts.hour * 60) + parts.minute + (parts.second / 60);
  const trueSolarTime = (minutesNow + eqTime + (4 * lng) - tzOffsetMin + 1440) % 1440;
  const hourAngleDeg = (trueSolarTime / 4) - 180;
  const hourAngle = deg2rad(hourAngleDeg);
  const latRad = deg2rad(lat);
  const cosZenith = (Math.sin(latRad) * Math.sin(decl)) + (Math.cos(latRad) * Math.cos(decl) * Math.cos(hourAngle));
  const zenith = Math.acos(clamp(cosZenith, -1, 1));
  const elevation = 90 - rad2deg(zenith);
  const azimuthRad = Math.atan2(Math.sin(hourAngle), (Math.cos(hourAngle) * Math.sin(latRad)) - (Math.tan(decl) * Math.cos(latRad)));
  const azimuth = (rad2deg(azimuthRad) + 180 + 360) % 360;
  return { azimuth, elevation };
}

function parseISODate(str) {
  const [y, m, d] = String(str || '').split('-').map(Number);
  return createUtcAnchorDate(y || 1970, (m || 1), d || 1);
}
function formatDate(d) {
  const parts = getLondonDateParts(d);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}
function fmtTime(d) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: APP_TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}
function deg2rad(d) { return d * Math.PI / 180; }
function rad2deg(r) { return r * 180 / Math.PI; }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function dayOfYear(dateObj) {
  const year = dateObj.getUTCFullYear();
  const current = Date.UTC(year, dateObj.getUTCMonth(), dateObj.getUTCDate(), 12, 0, 0, 0);
  const start = Date.UTC(year, 0, 0, 12, 0, 0, 0);
  return Math.floor((current - start) / 86400000);
}
function lastSundayOfMonthUtc(year, monthIndex) {
  const d = new Date(Date.UTC(year, monthIndex + 1, 0, 0, 0, 0, 0));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d;
}
function getLondonDstStartUtc(year) {
  const lastSunday = lastSundayOfMonthUtc(year, 2);
  return Date.UTC(year, 2, lastSunday.getUTCDate(), 1, 0, 0, 0);
}
function getLondonDstEndUtc(year) {
  const lastSunday = lastSundayOfMonthUtc(year, 9);
  return Date.UTC(year, 9, lastSunday.getUTCDate(), 1, 0, 0, 0);
}
function isLondonDstAtUtc(utcMs) {
  const probe = new Date(utcMs);
  const year = probe.getUTCFullYear();
  return utcMs >= getLondonDstStartUtc(year) && utcMs < getLondonDstEndUtc(year);
}
function getLondonOffsetMinutesForDateParts(year, month, day) {
  const noonUtc = Date.UTC(year, month - 1, day, 12, 0, 0, 0);
  return isLondonDstAtUtc(noonUtc) ? 60 : 0;
}
function getLondonDateParts(dateObj) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(dateObj instanceof Date ? dateObj : new Date(dateObj));
  const out = {};
  for (const part of parts) if (part.type !== 'literal') out[part.type] = Number(part.value);
  return { year: out.year, month: out.month, day: out.day, hour: out.hour, minute: out.minute, second: out.second };
}
function createUtcAnchorDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}
function minutesToLocalDate(dateObj, minutes) {
  const year = dateObj.getUTCFullYear();
  const month = dateObj.getUTCMonth() + 1;
  const day = dateObj.getUTCDate();
  const offsetMinutes = getLondonOffsetMinutesForDateParts(year, month, day);
  return new Date(Date.UTC(year, month - 1, day, 0, minutes, 0, 0) - (offsetMinutes * 60000));
}

function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decodeBase64Utf8(base64Text) {
  const binary = atob(base64Text || '');
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]));
}
