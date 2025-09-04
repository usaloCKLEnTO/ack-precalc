# Pre‑Calc Placement Coach

A lightweight, single‑page React app to help study for a pre‑calculus placement test. It wraps a single JSX file (`pre_calc_placement_coach.jsx`) and deploys to GitHub Pages.

## Quick Start

- Dev server: `npm install && npm run dev`
- Build: `npm run build`
- Preview build: `npm run preview`

Open `http://localhost:5173` during development.

## Configuring the Coach

- Click the gear icon (Settings) and set:
  - `Base URL` (e.g., `https://api.openai.com/v1`, OpenRouter, or local OpenAI‑compatible server)
  - `Model` (e.g., `gpt-4o-mini` or a local model id)
  - `API Key` (not required for some local servers)
- Settings and transcript persist in the browser’s localStorage.

## Tech Stack

- Vite + React 18
- Tailwind CSS (via PostCSS)
- GitHub Actions deploy to GitHub Pages

## Deploy

This repo is set up to deploy from the `main` branch using GitHub Actions. On push to `main`:

- CI installs dependencies, builds the app, and publishes the `dist/` artifact to Pages.
- Site URL: `https://usaloCKLEnTO.github.io/ack-precalc/`

## Project Layout

- `pre_calc_placement_coach.jsx` — The main React App component (single‑file app)
- `src/main.jsx` — Entry point that mounts `App`
- `index.html` — HTML shell
- `src/index.css` — Tailwind entry (base/components/utilities)
- `tailwind.config.js` and `postcss.config.js` — Tailwind/PostCSS config
- `.github/workflows/deploy.yml` — GitHub Pages workflow

## Notes

- If you fork/rename the repo, update `vite.config.js` `base` to match your Pages path.
- The app uses Tailwind utility classes already present in the JSX file.

## Magic Link (no typing credentials)

You can prefill `baseUrl`, `model`, and `apiKey` via a link that encodes the config in the URL fragment (after `#`). Example workflow:

1) Open the site → Settings → set your values.
2) Click "Magic Link" → it copies a URL like:

   https://usaloCKLEnTO.github.io/ack-precalc/#cfg=eyJiYXNlVXJsIjoiLi4uIiwibW9kZWwiOiIuLi4iLCJhcGlLZXkiOiJzay0uLi4ifQ

3) Send that URL privately. When opened, the app loads the config and immediately clears the `#cfg=...` from the address bar.

Notes:
- The fragment is never sent to servers in HTTP requests, and is cleared after use.
- Anyone with the link can use the key; share only with trusted recipients.
