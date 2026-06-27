# Vibe RTS Demo

**Production:** https://vibe-rts-demo-production.up.railway.app

**Railway:** https://railway.com/project/0890717c-a636-4a48-9091-283b1d2e0fc7/service/3f567b92-9461-4f9c-89ef-58f6d38314eb?environmentId=c663fde2-5e44-453c-9651-365b21475080

**Railway workspace:** Guru Apps

Browser RTS demo with an Express/Socket.IO game server and a Vite browser client. The server is authoritative, exposes a health endpoint at `/api/health`, and does not require a database, auth, or persistent secrets.

## Local Run

Use Node.js 20+.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

Useful checks:

```bash
npm test
npm run typecheck
npm run build
```

Production-style local run:

```bash
npm run build
PORT=3000 npm start
```

## Demo Flow

1. Open the app in two browser tabs or two browser windows.
2. Player one creates a room and shares the room code.
3. Player two joins with the room code, or player one presses **Add Bot** for a local solo test.
4. Both human players mark ready, or the solo player marks ready after adding the bot.
5. Build units, issue move/attack orders, and destroy the opposing HQ to win.

## Game Controls

The server protocol supports creating rooms, joining rooms, readying up, queueing units, issuing move orders, issuing attack orders, and restarting a match.

Expected browser controls for the demo:

- Left-click an owned unit to select it.
- Left-drag over owned units to select a group.
- Right-click the map to move selected units without clearing selection.
- Right-click an enemy unit or building to attack with selected units without clearing selection.
- Left-clicking the map or an enemy also issues an order when units are already selected.
- Queue units from the production controls: Harvester, Rifle Squad, Tank, and Artillery.
- Press **Add Bot** after creating a room to add an AI opponent for local testing.
- Use the visible Ready control to start once a second player or bot has joined.

If the client control mapping changes during demo work, trust the visible browser controls and keep this section in sync with the final UI.

## Railway Deployment Notes

Target context for this demo: GuruApps Railway workspace, GitHub-connected deployment, repository under the `unicore-railway` GitHub organization.

Important rules:

- Do not use `railway up` for this company service.
- Do not deploy from local files.
- Deploy by pushing `main` to GitHub after the Railway service is connected to the GitHub repo.
- Use the Railway-provided `*.up.railway.app` domain for GuruApps unless a custom domain is explicitly approved.
- No Railway variables are required for the current demo: no DB, no auth, no persistent secrets.

This repo includes `railway.json` so the Railway service can use:

- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Healthcheck path: `/api/health`

Manual Railway setup that remains:

1. Ensure the GitHub repo exists in `unicore-railway` and the latest code is pushed to `main`.
2. In the GuruApps Railway workspace, create or select the project whose name matches the GitHub repo name.
3. Create/select the public app service.
4. In the Railway dashboard, connect that service to the GitHub repo, branch `main`, root directory `/`.
5. Confirm the service uses the repo `railway.json` settings or equivalent dashboard settings.
6. Generate a Railway public domain from service settings.
7. After deploy, verify `GET /api/health` returns `200`.

## Demo Fallback Notes

- Keep a local production build ready on the demo laptop: `npm run build && PORT=3000 npm start`.
- If Railway is unavailable, run the demo locally in two browser tabs on `http://localhost:3000`.
- If public WebSocket routing is the issue, verify the app is deployed as one service so the browser client and `/socket.io` endpoint share the same host.
- If the browser client is not ready at demo time, fall back to showing `/api/health` and the current lobby/server status while explaining the in-progress UI state.
- If multiplayer room discovery fails during the live demo, use two local tabs and a freshly created room code.
