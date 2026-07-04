# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"期末复习笔记" — a zero-build static study site for university exam review. Pure vanilla HTML/CSS/JS, no frameworks, no bundler, no package manager. Deployed to GitHub Pages at `web.zzzzcx.com`.

**To run:** Open `index.html` directly in a browser. No build step or server required.

## Architecture

**Module pattern:** Every `.js` file uses `(function(){ 'use strict'; ... })();`. Features expose globals via `window.*` when needed (e.g. `window.checkQuiz`, `window.toggleTheme`).

**Course pages:** Each subject under `courses/<name>/` has:
- `index.html` — monolithic, hand-authored page (20–127KB) with all chapter content inline, sidebar nav, quizzes
- `style.css` — course-specific styles (imports `theme.css` from root)
- `main.js` — course-specific interactive logic (simulators, visualizations, calculators)

**Shared feature modules** (root-level `.js` files): `wrong-book.js`, `formula-ref.js`, `mastery.js`, `random-quiz.js`, `cross-links.js`, `print-mode.js`, `stats.js`, `ux.js`, `remember.js`, `search.js`, `preview.js`. These dynamically inject their own CSS and DOM — they don't rely on pre-existing markup.

**Theme system:** `theme.css` defines CSS custom properties for dark (`:root`) and light (`.light` on `<html>`). `theme.js` toggles and persists to `localStorage` key `site_theme`.

**State persistence:** All client state uses `localStorage` — key prefixes: `site_theme`, `scroll_*`, `visits_*`, `dwell_*`, `ux_chapter_*`, `wrong_answers`, `mastery_data`, `exam_class_id`.

**Homepage:** `index.js` contains a `var FILES = [...]` array with metadata for all study materials — drives the file browser and search. `index.html` includes a changelog section auto-updated by CI on push.

**PWA:** `manifest.json` + `sw.js` + `pwa.js`. Service worker uses static pre-cache + stale-while-revalidate for HTML.

## Conventions

- **Language:** All UI text and content is Chinese (zh-CN)
- **Naming:** kebab-case for JS and CSS files; lowercase English for course directories
- **CDN dependencies:** KaTeX (math rendering), pptxjs (PPTX preview), mammoth.js (DOCX preview) — all loaded from jsDelivr
- **Images:** Hosted on Cloudflare R2 CDN, not in the repo
- **R2 credentials:** Stored in `.env` (gitignored). Endpoint, keys, bucket, and public URL are all in that file.
- **No tests or linting** — no test framework, no eslint/prettier config exists
- **Git workflow:** All changes are committed locally by default (`git add -A && git commit`). Do NOT push to remote (`git push`) unless explicitly asked by the user.

## Adding Images

Images are hosted on Cloudflare R2 and referenced by absolute URL. Workflow:

1. Place source image in `courses/<name>/images/` (local working copy, not deployed)
2. Upload to R2 via Node.js (Python/boto3 not available in this environment):
   ```js
   const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
   const s3 = new S3Client({
     region: 'auto',
     endpoint: '<R2_ENDPOINT from .env>',
     credentials: { accessKeyId: '<R2_ACCESS_KEY_ID>', secretAccessKey: '<R2_SECRET_ACCESS_KEY>' }
   });
   await s3.send(new PutObjectCommand({
     Bucket: 'web', Key: 'images/<subdir>/<filename>',
     Body: fs.readFileSync('<local path>'), ContentType: 'image/png'
   }));
   ```
3. Reference in HTML by R2 public URL: `https://r2.zzzzcx.cn/images/<subdir>/<filename>`
4. R2 URL base: `https://r2.zzzzcx.cn` (bucket: `web`)

For images from course PPTX files: extract PNGs with `unzip -o <file>.pptx "ppt/media/*.png" -d <dest>`, then upload the relevant ones. WMF/EMF files in PPTX are not web-compatible — only PNG/JPEG work.

## Key Files

- `index.js` — homepage logic + `FILES` registry array (update when adding study materials)
- `index.css` — homepage styles
- `theme.css` / `theme.js` — shared theming (dark/light)
- `sw.js` — service worker (update cache version when deploying changes)
- `scripts/build-exam-json.mjs` — regenerates `files/exam-schedule.json` from XLSX (requires `xlsx` npm package)
- `scripts/upload-r2.py` — uploads images to Cloudflare R2 (requires `boto3`)

## Adding a New Course

1. Create `courses/<name>/` with `index.html`, `style.css`, `main.js`
2. Import `theme.css` from root: `<link rel="stylesheet" href="../../theme.css">`
3. Include shared modules as needed via `<script>` tags (e.g. `theme.js`, `ux.js`)
4. Add course card to `index.html` homepage
5. Add any study files to `files/<name>/`
6. Update `FILES` array in `index.js` with new file metadata
