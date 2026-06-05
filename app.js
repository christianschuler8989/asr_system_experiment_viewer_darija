// ASR Review Tool — Darija Pilot
// M1: data loading, file browser, transcription display, notes, export/import
// M2: WaveSurfer audio player, RTL waveform
// M3: word-level playback highlighting, word-agreement color coding
// M4: sequence annotation (level 1), span annotation with multi-level tag schema

const state = {
  data: null,
  modelConfig: {},
  currentFile: null,
  wavesurfer: null,
  annotations: {},  // { [fileId]: { _sequence_text, _note, [system]: [{text, tags}] } }
  reviewer: '',
  fontSize: 12,
};

// Ephemeral dialog state — reset on each selection, never persisted directly
const dlg = {
  system: null,
  cell: null,
  text: '',
  existingIndex: -1,   // -1 = new annotation; ≥0 = editing existing
  tags: freshTags(),
};

function freshTags() {
  return { correctness: null, register: null, loanword: [], flags: [] };
}

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

  const [dataResult, configResult] = await Promise.allSettled([
    fetch('data.json').then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    fetch('configs/model_config.yaml').then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); }),
  ]);

  if (dataResult.status === 'rejected') {
    showFatalError(`Failed to load data.json: ${dataResult.reason.message}`);
    return;
  }
  state.data = dataResult.value;

  if (configResult.status === 'fulfilled') {
    try {
      const parsed = (typeof jsyaml !== 'undefined') ? jsyaml.load(configResult.value) : null;
      if (parsed?.models) state.modelConfig = parsed.models;
    } catch (err) { console.warn('Could not parse model_config.yaml:', err.message); }
  } else {
    console.warn('Could not load model_config.yaml:', configResult.reason.message);
  }

  populateLocations();
  const locationSelect = el('location-select');
  populateFiles(locationSelect.value);

  // Navigation
  locationSelect.addEventListener('change', () => populateFiles(locationSelect.value));
  el('file-select').addEventListener('change', e => selectFile(e.target.value));

  // Annotations — level 1 (sequence) + bottom notes
  el('sequence-text').addEventListener('input', saveSequenceText);
  el('file-notes').addEventListener('input', saveNotes);
  el('export-btn').addEventListener('click', exportAnnotations);
  el('import-input').addEventListener('change', importAnnotations);

  // Font size
  el('font-shrink-btn').addEventListener('click', () => adjustFontSize(-FONT_SIZE_STEP));
  el('font-enlarge-btn').addEventListener('click', () => adjustFontSize(FONT_SIZE_STEP));

  // Audio
  el('play-btn').addEventListener('click', () => state.wavesurfer?.playPause());

  // Span annotation — level 2
  document.addEventListener('mouseup', handleTextSelection);
  document.addEventListener('mousedown', handleOutsideClick);
  el('tag-done-btn').addEventListener('click', hideTagDialog);
  el('tag-remove-btn').addEventListener('click', removeCurrentAnnotation);
  el('tag-dialog').addEventListener('click', handleTagButtonClick);
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
  state.fontSize = (saved >= FONT_SIZE_MIN && saved <= FONT_SIZE_MAX) ? saved : FONT_SIZE_DEFAULT;
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

function modelLabel(codeId)    { return state.modelConfig[codeId]?.label ?? codeId; }
function modelFullName(codeId) { return state.modelConfig[codeId]?.name  ?? codeId; }

// ─── Annotation Persistence ───────────────────────────────────────────────────

function loadAnnotations() {
  try {
    const raw = localStorage.getItem(LS_ANNOTATIONS);
    if (raw) state.annotations = JSON.parse(raw);
  } catch { state.annotations = {}; }
}

function persistAnnotations() {
  localStorage.setItem(LS_ANNOTATIONS, JSON.stringify(state.annotations));
}

function ensureFileEntry(fileId) {
  if (!state.annotations[fileId]) state.annotations[fileId] = {};
}

// Level 1 — sequence free-text field (top, under waveform)
function saveSequenceText() {
  if (!state.currentFile) return;
  const id = state.currentFile.id;
  ensureFileEntry(id);
  state.annotations[id]._sequence_text = el('sequence-text').value;
  persistAnnotations();
}

function restoreSequenceText(file) {
  el('sequence-text').value = state.annotations[file.id]?._sequence_text || '';
}

// Bottom free-text notes field
function saveNotes() {
  if (!state.currentFile) return;
  const id = state.currentFile.id;
  ensureFileEntry(id);
  state.annotations[id]._note = el('file-notes').value;
  persistAnnotations();
}

function restoreNotes(file) {
  el('file-notes').value = state.annotations[file.id]?._note || '';
}

// ─── File Browser ─────────────────────────────────────────────────────────────

function populateLocations() {
  const select = el('location-select');
  select.innerHTML = '';
  for (const loc of state.data._meta.locations) select.appendChild(makeOption(loc, loc));
}

function populateFiles(location) {
  const select = el('file-select');
  select.innerHTML = '';
  const files = state.data.files.filter(f => f.location === location);
  for (const file of files) select.appendChild(makeOption(file.id, fileLabel(file)));
  if (files.length) selectFile(files[0].id);
}

function fileLabel(file) {
  return file.id.replace(`${file.location}_`, '').replace(/_16k$/, '');
}

function selectFile(fileId) {
  const file = state.data.files.find(f => f.id === fileId);
  if (!file) return;
  hideTagDialog();
  state.currentFile = file;
  renderFile(file);
  initWaveSurfer(file);
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function renderFile(file) {
  renderTranscriptions(file);
  applyWordColors();
  wireMarkHandlers();
  restoreSequenceText(file);
  restoreNotes(file);
}

function renderTranscriptions(file) {
  const tbody = el('transcription-body');
  tbody.innerHTML = '';

  const systemOrder = state.data._meta.systems;
  const bySystem = Object.fromEntries(file.transcriptions.map(t => [t.system, t]));
  const fileAnns = state.annotations[file.id] || {};

  for (const sysName of systemOrder) {
    const t = bySystem[sysName];
    if (!t) continue;

    const tr = document.createElement('tr');
    tr.dataset.system = sysName;

    const labelTd = document.createElement('td');
    labelTd.className = 'system-label';
    labelTd.textContent = modelLabel(sysName);
    labelTd.title = `${modelFullName(sysName)}\n(${sysName})`;

    const textTd = document.createElement('td');
    textTd.className = 'transcription-cell';
    textTd.setAttribute('dir', 'rtl');
    textTd.dataset.system = sysName;
    textTd.dataset.fileId = file.id;

    renderCellContent(textTd, t, fileAnns[sysName] || []);

    tr.appendChild(labelTd);
    tr.appendChild(textTd);
    tbody.appendChild(tr);
  }
}

function renderCellContent(cell, transcription, annotations) {
  cell.innerHTML = '';

  if (!annotations || annotations.length === 0) {
    // No annotations: word spans for color coding and time highlighting
    if (transcription.word_alignments?.length) {
      renderWordSpans(cell, transcription.word_alignments);
    } else {
      renderTextSpans(cell, transcription.text);
    }
    return;
  }

  // With annotations: render plain text with <mark> elements around annotated spans.
  // Word-level spans are omitted in annotated cells (acceptable pilot trade-off).
  const displayText = transcription.text || '';
  const frag = document.createDocumentFragment();
  let remaining = displayText;

  // Sort by first occurrence in the text so marks are inserted left-to-right
  const sorted = [...annotations].sort(
    (a, b) => displayText.indexOf(a.text) - displayText.indexOf(b.text)
  );

  for (const ann of sorted) {
    const idx = remaining.indexOf(ann.text);
    if (idx < 0) continue;
    if (idx > 0) frag.appendChild(document.createTextNode(remaining.slice(0, idx)));

    const markEl = document.createElement('mark');
    markEl.className = `span-annotation ${markCssClass(ann.tags)}`;
    markEl.title = buildTagSummary(ann.tags);
    markEl.dataset.annotationText = ann.text;
    markEl.textContent = ann.text;
    frag.appendChild(markEl);

    remaining = remaining.slice(idx + ann.text.length);
  }

  if (remaining) frag.appendChild(document.createTextNode(remaining));
  cell.appendChild(frag);
}

function renderWordSpans(cell, alignments) {
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
  const colorMap = new Map();
  let nextIndex = 0;
  for (const span of document.querySelectorAll('.transcription-cell .word')) {
    const word = span.textContent;
    if (!colorMap.has(word)) colorMap.set(word, nextIndex++);
    const hue = (colorMap.get(word) * 137.508) % 360;
    span.style.backgroundColor = `hsl(${hue}, 58%, 87%)`;
  }
}

// ─── Mark Helpers ─────────────────────────────────────────────────────────────

function markCssClass(tags) {
  if (tags.correctness === 'incorrect') return 'mark-incorrect';
  if (tags.correctness === 'correct')   return 'mark-correct';
  if (tags.register === 'dialectal')    return 'mark-dialectal';
  if (tags.register === 'standard')     return 'mark-standard';
  if (tags.loanword.length > 0)         return 'mark-loanword';
  if (tags.flags.includes('unclear'))   return 'mark-unclear';
  return 'mark-other';
}

function buildTagSummary(tags) {
  const parts = [];
  if (tags.correctness)     parts.push(tags.correctness);
  if (tags.register)        parts.push(tags.register);
  if (tags.loanword.length) parts.push(`loanword: ${tags.loanword.join(', ')}`);
  tags.flags.forEach(f => parts.push(f));
  return parts.length ? parts.join(' · ') : 'annotated (no tags)';
}

// ─── Span Annotation — Text Selection (Level 2) ───────────────────────────────

function handleTextSelection() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return;

  const selectedText = sel.toString().trim();
  if (!selectedText) return;

  const range = sel.getRangeAt(0);
  const ancestor = range.commonAncestorContainer;
  const cell = (ancestor instanceof Element ? ancestor : ancestor.parentElement)
    ?.closest('.transcription-cell');
  if (!cell || !state.currentFile) return;

  showTagDialog(selectedText, cell.dataset.system, cell, range.getBoundingClientRect(), -1);
}

function handleOutsideClick(e) {
  const dialog = el('tag-dialog');
  if (dialog.hidden) return;
  if (!dialog.contains(e.target)) hideTagDialog();
}

// ─── Span Annotation — Dialog ─────────────────────────────────────────────────

function showTagDialog(text, system, cell, anchorRect, existingIndex) {
  dlg.system        = system;
  dlg.cell          = cell;
  dlg.text          = text;
  dlg.existingIndex = existingIndex;

  if (existingIndex >= 0) {
    const anns = state.annotations[state.currentFile.id]?.[system] || [];
    dlg.tags = JSON.parse(JSON.stringify(anns[existingIndex]?.tags || freshTags()));
  } else {
    dlg.tags = freshTags();
  }

  el('tag-remove-btn').hidden = existingIndex < 0;
  updateDialogButtons();

  // Show offscreen first to measure, then position
  const dialog = el('tag-dialog');
  dialog.removeAttribute('hidden');
  dialog.style.visibility = 'hidden';
  dialog.style.top = '0';
  dialog.style.left = '0';

  const dw = dialog.offsetWidth;
  const dh = dialog.offsetHeight;
  const m  = 8;

  let top  = anchorRect.bottom + m;
  let left = anchorRect.left;
  if (top + dh > window.innerHeight - m) top = anchorRect.top - dh - m;
  left = Math.max(m, Math.min(left, window.innerWidth - dw - m));
  top  = Math.max(m, top);

  dialog.style.top        = `${top}px`;
  dialog.style.left       = `${left}px`;
  dialog.style.visibility = '';
}

function hideTagDialog() {
  el('tag-dialog').setAttribute('hidden', '');
  window.getSelection()?.removeAllRanges();
  dlg.system = null; dlg.cell = null; dlg.text = '';
  dlg.existingIndex = -1; dlg.tags = freshTags();
}

function updateDialogButtons() {
  for (const btn of el('tag-dialog').querySelectorAll('.tag-btn[data-group]')) {
    const { group, value } = btn.dataset;
    btn.classList.remove('selected', 'faded');

    if (group === 'correctness' || group === 'register') {
      const current = dlg.tags[group];
      if (current === value)              btn.classList.add('selected');
      else if (current && current !== value) btn.classList.add('faded');
    } else if (group === 'loanword') {
      if (dlg.tags.loanword.includes(value)) btn.classList.add('selected');
    } else if (group === 'flag') {
      if (dlg.tags.flags.includes(value)) btn.classList.add('selected');
    }
  }
}

function handleTagButtonClick(e) {
  const btn = e.target.closest('.tag-btn[data-group]');
  if (!btn || !dlg.system) return;

  const { group, value } = btn.dataset;

  if (group === 'correctness' || group === 'register') {
    // Binary: click active → deselect; click inactive → switch
    dlg.tags[group] = (dlg.tags[group] === value) ? null : value;
  } else if (group === 'loanword') {
    const idx = dlg.tags.loanword.indexOf(value);
    idx >= 0 ? dlg.tags.loanword.splice(idx, 1) : dlg.tags.loanword.push(value);
  } else if (group === 'flag') {
    const idx = dlg.tags.flags.indexOf(value);
    idx >= 0 ? dlg.tags.flags.splice(idx, 1) : dlg.tags.flags.push(value);
  }

  updateDialogButtons();
  saveDialogAnnotation(); // auto-save on every tag click
}

function saveDialogAnnotation() {
  if (!dlg.text || !dlg.system || !state.currentFile) return;
  const fileId = state.currentFile.id;
  ensureFileEntry(fileId);
  if (!state.annotations[fileId][dlg.system]) state.annotations[fileId][dlg.system] = [];

  const anns    = state.annotations[fileId][dlg.system];
  const annData = { text: dlg.text, tags: JSON.parse(JSON.stringify(dlg.tags)) };

  if (dlg.existingIndex >= 0) {
    anns[dlg.existingIndex] = annData;
  } else {
    anns.push(annData);
    dlg.existingIndex = anns.length - 1;
  }

  persistAnnotations();
  redrawCell(fileId, dlg.system, dlg.cell, anns);
}

function removeCurrentAnnotation() {
  if (dlg.existingIndex < 0 || !dlg.system || !state.currentFile) return;
  const fileId = state.currentFile.id;
  const anns   = state.annotations[fileId]?.[dlg.system];
  if (!anns) return;
  anns.splice(dlg.existingIndex, 1);
  persistAnnotations();
  redrawCell(fileId, dlg.system, dlg.cell, anns);
  hideTagDialog();
}

function redrawCell(fileId, sysName, cell, anns) {
  const t = state.currentFile?.transcriptions.find(t => t.system === sysName);
  if (t && cell) {
    renderCellContent(cell, t, anns);
    wireCellMarkHandlers(cell);
    // Re-apply word colors to any new word spans in the redrawn cell
    applyWordColors();
  }
}

// ─── Mark Click (editing existing annotations) ────────────────────────────────

function handleMarkClick(e) {
  e.stopPropagation();
  const mark    = e.currentTarget;
  const cell    = mark.closest('.transcription-cell');
  if (!cell || !state.currentFile) return;

  const system  = cell.dataset.system;
  const fileId  = state.currentFile.id;
  const anns    = state.annotations[fileId]?.[system] || [];
  const idx     = anns.findIndex(a => a.text === mark.dataset.annotationText);
  if (idx < 0) return;

  showTagDialog(anns[idx].text, system, cell, mark.getBoundingClientRect(), idx);
}

function wireCellMarkHandlers(cell) {
  for (const mark of cell.querySelectorAll('.span-annotation')) {
    mark.addEventListener('click', handleMarkClick);
  }
}

function wireMarkHandlers() {
  for (const cell of document.querySelectorAll('.transcription-cell')) {
    wireCellMarkHandlers(cell);
  }
}

// ─── Audio (M2) ───────────────────────────────────────────────────────────────

function initWaveSurfer(file) {
  if (state.wavesurfer) { state.wavesurfer.destroy(); state.wavesurfer = null; }

  const playBtn = el('play-btn');
  playBtn.disabled = true;
  playBtn.textContent = '▶ Play';

  const container = el('waveform-container');
  container.innerHTML = '<div id="waveform-placeholder">Decoding audio…</div>';
  const waveDiv = document.createElement('div');
  waveDiv.id = 'waveform-wave';
  container.appendChild(waveDiv);

  state.wavesurfer = WaveSurfer.create({
    container: waveDiv,
    waveColor: '#475569', progressColor: '#3b82f6',
    height: parseInt(getComputedStyle(document.documentElement)
              .getPropertyValue('--waveform-height'), 10) || 96,
    barWidth: 2, barGap: 1, barRadius: 2, normalize: true,
  });

  waveDiv.addEventListener('pointerdown', e => {
    if (!state.wavesurfer) return;
    const rect = waveDiv.getBoundingClientRect();
    state.wavesurfer.seekTo(Math.max(0, Math.min(1, 1 - ((e.clientX - rect.left) / rect.width))));
    e.stopImmediatePropagation();
  }, true);

  state.wavesurfer.on('ready',      () => { document.getElementById('waveform-placeholder')?.remove(); playBtn.disabled = false; });
  state.wavesurfer.on('play',       () => { playBtn.textContent = '⏸ Pause'; });
  state.wavesurfer.on('pause',      () => { playBtn.textContent = '▶ Play'; });
  state.wavesurfer.on('finish',     () => { playBtn.textContent = '▶ Play'; clearWordHighlights(); });
  state.wavesurfer.on('timeupdate', t  => highlightCurrentWord(t));
  state.wavesurfer.on('error',      err => {
    console.error('WaveSurfer error:', err);
    container.innerHTML = '<div id="waveform-error">⚠ Audio file could not be loaded.</div>';
    playBtn.disabled = true;
  });

  state.wavesurfer.load(file.audio_path);
}

function highlightCurrentWord(currentTime) {
  for (const span of document.querySelectorAll('.word[data-start]')) {
    const start = parseFloat(span.dataset.start);
    const end   = parseFloat(span.dataset.end);
    if (start >= end) continue;
    span.classList.toggle('word-active', currentTime >= start && currentTime < end);
  }
}

function clearWordHighlights() {
  for (const span of document.querySelectorAll('.word-active')) span.classList.remove('word-active');
}

// ─── Export / Import ──────────────────────────────────────────────────────────

function exportAnnotations() {
  const date     = new Date().toISOString().slice(0, 10);
  const filename = `annotations_${state.reviewer}_${date}.json`;
  const blob     = new Blob([JSON.stringify(state.annotations, null, 2)], { type: 'application/json' });
  const url      = URL.createObjectURL(blob);
  const a        = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function importAnnotations(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const imported = JSON.parse(ev.target.result);
      for (const [fileId, fileData] of Object.entries(imported)) {
        state.annotations[fileId] = Object.assign(state.annotations[fileId] || {}, fileData);
      }
      persistAnnotations();
      if (state.currentFile) renderFile(state.currentFile);
      alert('Annotations imported successfully.');
    } catch { alert('Import failed: the file does not appear to be valid JSON.'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function el(id) { return document.getElementById(id); }

function makeOption(value, label) {
  const opt = document.createElement('option');
  opt.value = value; opt.textContent = label;
  return opt;
}

function setStatus(msg) {
  el('transcription-body').innerHTML = `<tr><td colspan="2" class="status-cell">${msg}</td></tr>`;
}

function showFatalError(msg) {
  el('app').innerHTML = `<div class="fatal-error">${msg}</div>`;
}
