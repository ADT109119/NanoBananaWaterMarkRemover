# Architecture: NanoBananaWaterMarkRemover

## Overview
A purely client-side tool to remove "Nano Banana" watermarks using **Reverse Alpha Blending** technology.

## Directory Structure
- `index.html`: Main entry point and UI structure.
- `styles.css`: Modern, responsive styling with dark/light mode support.
- `app.js`: Core application logic, UI interaction, and Worker orchestration.
- `worker.js`: Web Worker for image processing and watermark detection to prevent UI freezing.
- `i18n.js`: Internationalization module supporting 18 languages.
- `locales/`: JSON files containing translations for each supported language.
- `assets/`: Masks and other static assets.
- `sw.js`: Service worker for PWA support.

## Core Logic
1. **Watermark Detection**: Uses a brightness difference algorithm between the expected watermark area and surrounding pixels.
2. **Reverse Alpha Blending**: Mathematically reverses the alpha blending process to restore original pixel colors based on the known watermark mask.
3. **Force Remove (New)**: Allows users to bypass the detection check and force the removal calculation, useful for false negatives.

## Dependencies
- Pure Vanilla JS (No external libraries except Google Fonts).
- Web Worker API.
- Canvas API.
- Fetch API (for localization).
