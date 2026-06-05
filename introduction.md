# Project Introduction

## What Are We Doing Here?

This project is a lightweight, browser-based review tool for a pilot study on Automatic Speech Recognition (ASR) in Moroccan Arabic (Darija). The study involves a set of approximately 120 short audio recordings (~30 seconds each) sourced from radio broadcasts, covering three distinct geographic locations: Casablanca, Tangier, and Oujda.

A collection of around 16 different ASR systems have each produced transcriptions for every recording. The goal of this tool is to make all of that data accessible and reviewable (in one place, without friction) for native-speaker collaborators.

## Why Does This Tool Exist?

Evaluating ASR output is not just a matter of running automated metrics. Dialectal variation, pronunciation differences across regions, and the gap between what a system "heard" and what was actually said all require a human ear and a native speaker's intuition to assess properly.

This tool bridges that gap. It gives collaborators a simple interface to listen to a recording, read all available system transcriptions side by side, and mark what they find - whether that is a correct transcription, a clear error, a dialectal form, or something else entirely. That feedback will directly inform the next steps of the experiment.

## What Does the Tool Do?

At its core, the tool lets a reviewer:

- Browse recordings by location and select any file of interest
- See a spectrogram of the audio alongside a play button
- Read all ASR system transcriptions stacked in rows, one per system
- For systems where word-level timing data is available, follow along word by word as the audio plays
- Highlight and tag specific spans of text with short, descriptive labels
- Export their annotations as a JSON file to share with the research team

Everything runs in the browser. There is no server, no login, and no installation required - just a URL.

## Scope and Spirit

This is a pilot-study prototype, not a production system. The priority is getting useful data in front of the right people as quickly as possible. The design should be clean and unobtrusive - the content is what matters, and the tool should stay out of its way.

As the review process matures, the tool will evolve with it.