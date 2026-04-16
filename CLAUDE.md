# CLAUDE.md

This repository currently contains a lightweight KOLForge workbench stack.

## Development Commands

### Local Development (Docker)
```bash
docker compose up --build
```
- Backend: `http://localhost:8000`
- Frontend: `http://localhost:5175`

### Frontend Only (Dashboard)
```bash
cd dashboard
npm install
npm run dev
npm run build
npm run lint
```

### Backend Only
```bash
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

## Current Architecture

- `app.py`: FastAPI backend exposing workbench endpoints:
  - `GET /api/workbench/projects`
  - `POST /api/workbench/projects`
  - `GET /api/workbench/static-assets`
- `dashboard/src/App.jsx`: main app layout and tab shell
- `dashboard/src/components/TestTab.jsx`: project/workbench UI

## Environment Variables

- `WORKBENCH_PROJECTS_ROOT` (optional): projects directory root
- `WORKBENCH_ASSETS_ROOT` (optional): static assets directory root

## Tech Stack

- Backend: Python 3.11, FastAPI
- Frontend: React 18, Vite 4, Tailwind CSS 3.4
- Infrastructure: Docker + Docker Compose
