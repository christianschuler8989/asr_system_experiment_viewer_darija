// ASR Review Tool — Darija Pilot

const state = {
  data: null,          // parsed data.json
  modelConfig: {},     // parsed models section from model_config.yaml, keyed by code_id
  currentFile: null,   // currently selected file object
  wavesurfer: null,    // wavesurfer instance (M2)
  annotations: {},     // { [fileId]: { [system]: [...spans], _note: "" } }
  reviewer: '',        // set on first visit, persisted in localStorage
  fontSize: 12,        // current transcription font size in px
};

const LS_REVIEWER    = 'asr_reviewer';
const LS_ANNOTATIONS = 'asr_review_annotations';
const LS_FONT_SIZE   = 'asr_font_size';

const FONT_SIZE_DEFAULT = 12;
const FONT_SIZE_MIN     = 8;
const FONT_SIZE_MAX     = 22;
const FONT_SIZE_STEP    = 1;

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);

async function init() {
  initReviewer();
  loadAnnotations();
  initFontSize();

  setStatus('Loading data…');

  // Fetch data.json and model config in parallel; config failure is non-fatal.
  const [dataResult, configResult] = await Promise.allSettled([
    fetch('data.json').then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }),
    fetch('configs/model_config.yaml').then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    }),
  ]);

  if (dataResult.status === 'rejected') {
    showFatalError(`Failed to load data.json: ${dataResult.reason.message}`);
    return;
  }
  state.data = dataResult.value;

  if (configResult.status === 'fulfilled') {
    try {
      const parsed = (typeof jsyaml !== 'undefined')
        ? jsyaml.load(configResult.value)
        : null;
      if (parsed?.models) state.modelConfig = parsed.models;
    } catch (err) {
      console.warn('Could not parse model_config.yaml:', err.message);
    }
  } else {
    console.warn('Could not load model_config.yaml:', configResult.reason.message);
  }

  populateLocations();

  const locationSelect = el('location-select');
  populateFiles(locationSelect.value);

  locationSelect.addEventListener('change', () => populateFiles(locationSelect.value));
  el('file-select').addEventListener('change', e => selectFile(e.target.value));
  el('file-notes').addEventListener('input', saveNotes);
  el('export-btn').addEventListener('click', exportAnnotations);
  el('import-input').addEventListener('change', importAnnotations);
  el('font-shrink-btn').addEventListener('click', () => adjustFontSize(-FONT_SIZE_STEP));
  el('font-enlarge-btn').addEventListener('click', () => adjustFontSize(FONT_SIZE_STEP));
}

// ─── Reviewer ─────────────────────────────────────────────────────────────────

function initReviewer() {
  state.reviewer = localStorage.getItem(LS_REVIEWER) || '';
  if (!state.reviewer) {
    const name = prompt('Welcome! Please enter your name or initials to get started:');
    state.reviewer = (name || '').trim() || 'anonymous';
    localStorage.setItem(LS_REVIEWER, state.reviewer);
  }
  el('reviewer-label').textContent = state.reviewer;
}

// ─── Font Size ────────────────────────────────────────────────────────────────

function initFontSize() {
  const saved = parseInt(localStorage.getItem(LS_FONT_SIZE), 10);
  state.fontSize = (saved >= FONT_SIZE_MIN && saved <= FONT_SIZE_MAX)
    ? saved
    : FONT_SIZE_DEFAULT;
  applyFontSize();
}

function applyFontSize() {
  document.documentElement.style.setProperty('--transcription-font-size', `${state.fontSize}px`);
  el('font-size-display').textContent = `${state.fontSize}px`;
  el('font-shrink-btn').disabled = state.fontSize <= FONT_SIZE_MIN;
  el('font-enlarge-btn').disabled = state.fontSize >= FONT_SIZE_MAX;
}

function adjustFontSize(delta) {
  state.fontSize = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, state.fontSize + delta));
  localStorage.setItem(LS_FONT_SIZE, state.fontSize);
  applyFontSize();
}

// ─── Model Config Helpers ─────────────────────────────────────────────────────

function modelLabel(codeId) {
  return state.modelConfig[codeId]?.label ?? codeId;
}

function modelFullName(codeId) {
  return state.modelConfig[codeId]?.name ?? codeId;
}

// ─── Annotations ──────────────────────────────────────────────────────────────

function loadAnnotations() {
  try {
    const raw = localStorage.getItem(LS_ANNOTATIONS);
    if (raw) state.annotations = JSON.parse(raw);
  } catch {
    state.annotations = {};
  }
}

function persistAnnotations() {
  localStorage.setItem(LS_ANNOTATIONS, JSON.stringify(state.annotations));
}

function saveNotes() {
  if (!state.currentFile) return;
  const id = state.currentFile.id;
  if (!state.annotations[id]) state.annotations[id] = {};
  state.annotations[id]._note = el('file-notes').value;
  persistAnnotations();
}

// ─── File Browser ─────────────────────────────────────────────────────────────

function populateLocations() {
  const select = el('location-select');
  select.innerHTML = '';
  for (const loc of state.data._meta.locations) {
    select.appendChild(makeOption(loc, loc));
  }
}

function populateFiles(location) {
  const select = el('file-select');
  select.innerHTML = '';
  const files = state.data.files.filter(f => f.location === location);
  for (const file of files) {
    select.appendChild(makeOption(file.id, fileLabel(file)));
  }
  if (files.length) selectFile(files[0].id);
}

function fileLabel(file) {
  // "Casablanca_1-01_16k" → "1-01"
  return file.id.replace(`${file.location}_`, '').replace(/_16k$/, '');
}

function selectFile(fileId) {
  const file = state.data.files.find(f => f.id === fileId);
  if (!file) return;
  state.currentFile = file;
  renderFile(file);
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function renderFile(file) {
  renderTranscriptions(file);
  applyWordColors();
  restoreNotes(file);
}

function renderTranscriptions(file) {
  const tbody = el('transcription-body');
  tbody.innerHTML = '';

  const systemOrder = state.data._meta.systems;
  const bySystem = Object.fromEntries(file.transcriptions.map(t => [t.system, t]));

  for (const sysName of systemOrder) {
    const t = bySystem[sysName];
    if (!t) continue;

    const tr = document.createElement('tr');
    tr.dataset.system = sysName;

    const labelTd = document.createElement('td');
    labelTd.className = 'system-label';
    labelTd.textContent = modelLabel(sysName);
    // Full name + code_id on hover so nothing is lost
    labelTd.title = `${modelFullName(sysName)}\n(${sysName})`;

    const textTd = document.createElement('td');
    textTd.className = 'transcription-cell';
    textTd.setAttribute('dir', 'rtl');
    textTd.dataset.system = sysName;
    textTd.dataset.fileId = file.id;

    if (t.word_alignments && t.word_alignments.length) {
      renderWordSpans(textTd, t.word_alignments);
    } else {
      renderTextSpans(textTd, t.text);
    }

    tr.appendChild(labelTd);
    tr.appendChild(textTd);
    tbody.appendChild(tr);
  }
}

function renderWordSpans(cell, alignments) {
  // Wrap each word in a span carrying timing data for M2/M3 highlighting.
  // Words with start === end (zero-duration) get the span but will never be highlighted.
  const frag = document.createDocumentFragment();
  alignments.forEach((w, i) => {
    const span = document.createElement('span');
    span.className = 'word';
    span.dataset.start = w.start;
    span.dataset.end = w.end;
    span.textContent = w.word;
    frag.appendChild(span);
    if (i < alignments.length - 1) frag.appendChild(document.createTextNode(' '));
  });
  cell.appendChild(frag);
}

function renderTextSpans(cell, text) {
  // Split plain text into word spans so applyWordColors() can color them.
  // No normalization — exact strings as they appear in the transcription.
  if (!text) { cell.textContent = '—'; return; }
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) { cell.textContent = '—'; return; }
  const frag = document.createDocumentFragment();
  words.forEach((word, i) => {
    const span = document.createElement('span');
    span.className = 'word';
    span.textContent = word;
    frag.appendChild(span);
    if (i < words.length - 1) frag.appendChild(document.createTextNode(' '));
  });
  cell.appendChild(frag);
}

function applyWordColors() {
  // Assign each unique word its own background color using the golden-angle hue offset.
  // Golden angle (~137.508°) guarantees maximum hue distance between consecutive words,
  // so word N and word N+1 always land in very different parts of the color wheel.
  // Words are indexed in order of first appearance across all rows (top to bottom,
  // left to right within each row), which keeps colors stable as the user scans down.
  const colorMap = new Map(); // exact word string → integer index
  let nextIndex = 0;

  for (const span of document.querySelectorAll('.transcription-cell .word')) {
    const word = span.textContent;
    if (!colorMap.has(word)) colorMap.set(word, nextIndex++);
    const hue = (colorMap.get(word) * 137.508) % 360;
    span.style.backgroundColor = `hsl(${hue}, 58%, 87%)`;
  }
}

function restoreNotes(file) {
  el('file-notes').value = state.annotations[file.id]?._note || '';
}

// ─── Export / Import ──────────────────────────────────────────────────────────

function exportAnnotations() {
  const date = new Date().toISOString().slice(0, 10);
  const filename = `annotations_${state.reviewer}_${date}.json`;
  const blob = new Blob([JSON.stringify(state.annotations, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function importAnnotations(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const imported = JSON.parse(ev.target.result);
      // Deep merge: imported entries overwrite local entries at the file level
      for (const [fileId, fileData] of Object.entries(imported)) {
        state.annotations[fileId] = Object.assign(
          state.annotations[fileId] || {},
          fileData
        );
      }
      persistAnnotations();
      if (state.currentFile) restoreNotes(state.currentFile);
      alert('Annotations imported successfully.');
    } catch {
      alert('Import failed: the file does not appear to be valid JSON.');
    }
  };
  reader.readAsText(file);
  e.target.value = ''; // allow re-importing the same file
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function el(id) {
  return document.getElementById(id);
}

function makeOption(value, label) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = label;
  return opt;
}

function setStatus(msg) {
  el('transcription-body').innerHTML =
    `<tr><td colspan="2" class="status-cell">${msg}</td></tr>`;
}

function showFatalError(msg) {
  el('app').innerHTML = `<div class="fatal-error">${msg}</div>`;
}
