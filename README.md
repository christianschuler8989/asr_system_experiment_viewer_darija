# ASR Experiment Review Tool

A static web application for native-speaker review of ASR-system transcriptions, hosted on GitHub Pages.

Click here to check out the [current prototype](https://christianschuler8989.github.io/asr_system_experiment_viewer_darija/)

## Project Structure

```
/
├── index.html                      # Main application entry point
├── app.js                          # Application logic
├── style.css                       # Styles
├── data.json                       # Aggregated transcription data (generated)
├── audio/                      
│   ├── audio_files_transcriptions/ # .gitignored input data
│   └── audio_files/                # Audio files, one sub-folder per location
│       ├── Casablanca/
│       ├── Tangier/
│       └── Oujda/
├── scripts/
│   └── aggregate_asr_data.py       # Generates data.json from raw data
├── README.md
└── ROADMAP.md
```

## UI Layout concept

```
┌─────────────────────────────────────────────┐
│  [Casablanca ▾]  [File 01 ▾]   ▶ Play       │
├─────────────────────────────────────────────┤
│           Spectrogram + playhead            │  ← wavesurfer.js
├─────────────────────────────────────────────┤
│  moulsot_v0_3   │ وقال الرئيس...            │  ← selectable text
│  qwen3_asr      │ قال الرئيس...             │
│  whisper_darija │ و قال...                  │
│  ...                                        │
├─────────────────────────────────────────────┤
│  [Annotation panel — per file notes]        │
│  [Export Annotations JSON]                  │
└─────────────────────────────────────────────┘
```


## Setup

**Prerequisites:** Python 3.8+ (for the aggregation script and local server). No other installation required — the app runs entirely in the browser with no build step.

---

**1. Place input files**

Audio files, transcriptions, and TextGrids belong under `audio/` as follows:

```
audio/
  audio_files/
      <Location>/
          <filename>.wav
  audio_files_transcriptions/
      <Location>/
          <filename>__<system_name>.TextGrid   (optional, per-system)
      transcriptions-<system_name>.csv
```

Supported locations: `Casablanca`, `Oujda`, `Tangier`.

---

**2. Regenerate `data.json` (only needed after adding new data)**

`data.json` is already committed and ready to use. Run this script only if the underlying transcription data or audio files have changed:

```bash
python scripts/aggregate_asr_data.py --data-dir audio/ --output-dir .
```

---

**3. Serve locally**

The app must be served over HTTP — opening `index.html` directly as a `file://` URL will not work because browsers block `fetch()` requests from local files.

From the project root:
```bash
python -m http.server 8000
```

Then open **http://localhost:8000** in your browser.

> If port 8000 is taken, use any other free port: `python -m http.server 8080`

---

**4. Deploy to GitHub Pages**

See the full deployment guide below.

## Data Format

`data.json` is the single source of truth for the application.
```json
{
  "_meta": { "locations": [], "systems": [], "total_files": 121 },
  "files": [
    {
      "id": "Casablanca_1-01_16k",
      "location": "Casablanca",
      "audio_path": "audio/audio_files/Casablanca/Casablanca_1-01_16k.wav",
      "transcriptions": [
        { "system": "system_name", "text": "...", "word_alignments": [] }
      ],
      "annotations": {}
    }
  ]
}
```
`word_alignments` is optional — only present when a `.TextGrid` existed for that system.

## Stack

| Concern | Choice |
|---|---|
| Hosting | GitHub Pages (static, no build step) |
| Frontend | Vanilla JS + HTML + CSS |
| Audio / Spectrogram | wavesurfer.js (CDN) |
| Annotations | localStorage → export JSON |

---

## GitHub Pages Deployment

This section covers three scenarios in order:
1. **Publishing this project for the first time** — turning the local folder into a live website
2. **Pushing updates** — keeping the live site in sync after code or data changes
3. **Replicating for a new project** — what a student needs to do to run this tool with their own data

**Prerequisites:** [Git](https://git-scm.com/downloads) installed and a free [GitHub account](https://github.com).

---

### 1 — Publishing for the first time

**Step 1: Initialise a local Git repository**

Open a terminal in the project root folder and run:

```bash
git init
git add .
git commit -m "Initial commit: ASR review tool"
```

> `git add .` stages every file not listed in `.gitignore`. The raw transcription files under `audio/audio_files_transcriptions/` are excluded automatically — only the generated `data.json` and the audio files themselves go into the repository.

**Step 2: Create a repository on GitHub**

1. Go to [github.com/new](https://github.com/new) and sign in.
2. Create a new repository and give it a name (e.g. `asr_system_experiment_viewer_darija`).
3. Set it to **Public** (required for free GitHub Pages hosting).
4. Leave all other options unticked — do **not** add a README or `.gitignore` from the GitHub form, as the project already has both.
5. Click **Create repository**.

GitHub will show a page with setup instructions. Copy the two commands under *"push an existing repository"* — they look like this:

```bash
git remote add origin https://github.com/<your-username>/<your-repo-name>.git
git branch -M main
git push -u origin main
```

Run all three in your terminal.

**Step 3: Enable GitHub Pages**

1. On your repository page on GitHub, click **Settings** (top navigation bar).
2. In the left sidebar, click **Pages**.
3. Under *Source*, select **Deploy from a branch**.
4. Set the branch to `main` and the folder to `/ (root)`.
5. Click **Save**.

Wait about 60–90 seconds. Your tool is then live at:

```
https://<your-username>.github.io/<your-repo-name>/
```

You can check the deployment status anytime under **Actions** in your repository.

---

### 2 — Pushing updates

After any change to the code or to `data.json`, run:

```bash
git add .
git commit -m "Short description of what changed"
git push
```

GitHub Pages rebuilds and republishes automatically within a minute or two. No further steps needed.

---

### 3 — Replicating for a new project

A student who wants to run this tool with their own ASR data on their own GitHub account should follow these steps.

**Step 1: Fork the repository**

On the original repository page on GitHub, click the **Fork** button (top-right corner). This creates an independent copy of the entire project under your own GitHub account. You can rename it anything you like.

**Step 2: Clone your fork to your computer**

```bash
git clone https://github.com/<your-username>/<your-fork-name>.git
cd <your-fork-name>
```

**Step 3: Replace the audio files**

Delete the contents of `audio/audio_files/` and replace them with your own `.wav` files, organised in subfolders by location:

```
audio/audio_files/
    Location_A/
        file_01.wav
        file_02.wav
    Location_B/
        ...
```

> Audio files must be under 100 MB each (GitHub's hard limit). Typical 30-second mono 16 kHz WAV files are around 1 MB each and well within this limit. For longer recordings or higher sample rates, consider [Git LFS](https://git-lfs.github.com/).

**Step 4: Replace the transcription data and regenerate `data.json`**

Place your CSV transcription files and optional TextGrid files in `audio/audio_files_transcriptions/` following the layout described in the Setup section. Then regenerate the data file:

```bash
python scripts/aggregate_asr_data.py --data-dir audio/ --output-dir .
```

**Step 5: Update the model configuration**

Edit `configs/model_config.yaml` to reflect your own ASR systems. At minimum, add an entry for each system with a `code_id` (must match the system name used in your CSV filenames) and a short `label` (what appears in the review tool's system column).

**Step 6: Commit and push everything**

```bash
git add .
git commit -m "Replace data: <your project name>"
git push
```

**Step 7: Enable GitHub Pages on your fork**

Same as Step 3 in Part 1 above — go to **Settings → Pages**, source = `main` branch, folder = `/ (root)`, then Save.

Your personalised tool will be live at `https://<your-username>.github.io/<your-fork-name>/` within a minute or two.
