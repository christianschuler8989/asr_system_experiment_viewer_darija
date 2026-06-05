# Roadmap

## Status Legend
`[ ]` open · `[x]` done · `[~]` in progress

---

## M0 — Data Pipeline
> Raw experiment data → single `data.json` ready for the app.

- [x] `aggregate_asr_data.py`: reads CSVs + optional TextGrids, outputs `data.json`
- [x] `data.json` validated: all 121 files × 16 systems accounted for
- [x] Audio files placed in `audio/audio_files/<Location>/`

---

## M1 — Application Skeleton
> Deployable page that loads data and lets users navigate files.

- [x] `index.html`, `app.js`, `style.css` in place
- [x] App loads `data.json` and populates a file browser (filter by location)
- [x] Selecting a file updates the main panel (transcription rows rendered, notes persisted)
- [x] Reviewer name prompt on first visit; export/import annotations wired up
- [ ] Deployed to GitHub Pages and accessible via URL

---

## M2 — Audio + Waveform
> Selected file plays audio with a visible waveform and moving playhead.

- [ ] Waveform rendered via wavesurfer.js (v7, CDN); spectrogram is a stretch goal after core works
- [ ] Play/pause control; playhead in sync with audio
- [ ] Where word alignments exist: current word highlighted as audio plays (word alignment format confirmed: `{word, start, end}` in seconds)

---

## M3 — Transcription Display
> All ASR system outputs shown clearly for the selected file.

- [ ] One row per system, labelled by system name
- [ ] Arabic text renders correctly (RTL, appropriate font)
- [ ] Word-level playhead highlighting applied per row where alignment data exists

---

## M4 — Annotations
> Reviewers can tag spans of text; data is exportable.

- [ ] Text selection within a row opens a tag dialog
- [ ] Initial tag set: `correct` · `incorrect` · `dialectal` · `unclear` · `other`
- [ ] Annotations persisted in localStorage
- [ ] Export → `annotations_<reviewer>_<date>.json`
- [ ] Import previously exported annotation file

---

## M5 — Review & Hardening
> Polish and reviewer onboarding.

- [ ] Reviewer name/ID set on first visit
- [ ] Progress indicator per location
- [ ] Keyboard shortcuts: next/prev file, play/pause
- [ ] Graceful handling of missing audio files
- [ ] Brief in-app reviewer guide
- [ ] Tested across Firefox, Chrome, Safari

---

## Out of Scope for Pilot
- Shared live annotation storage (e.g. Firestore)
- Inter-annotator agreement metrics
