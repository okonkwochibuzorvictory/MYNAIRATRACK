# Deploying MYNAIRATRACK

One honest fact first: **Netlify can only host the frontend** (the screens).
The backend (FastAPI) and database (PostgreSQL) cannot run on Netlify —
they go on Render (free tier available). Total: ~10 minutes of clicking.

## A. Backend + database on Render (do this first)

1. Sign up at **render.com** (GitHub login is easiest).
2. Dashboard → **New +** → **Blueprint** → connect the `MYNAIRATRACK` repo.
   Render reads `render.yaml` and creates the API service + database.
3. When asked for values marked `sync: false`, fill in:
   - `CORS_ORIGINS` and `FRONTEND_URL`: leave blank for now; you will
     come back after step B with your Netlify URL.
   - `RESEND_API_KEY`: paste your Resend key (same one working locally).
   - `FX_API_KEY`: leave blank (free provider needs none).
4. Click **Apply**. Render installs, runs migrations + seed
   (`preDeployCommand`), and starts the API.
5. Open `https://<your-api>.onrender.com/health` — expect `{"status":"ok"}`.
   Copy the API URL; you need it below.

## B. Frontend on Netlify

1. Sign up at **app.netlify.com** (GitHub login).
2. **Add new site → Import an existing project** → choose `MYNAIRATRACK`.
   Netlify reads `netlify.toml` automatically (base `frontend/`,
   build `npm run build`, publish `frontend/dist/`).
3. Before deploying: **Site settings → Environment variables** → add
   `VITE_API_URL` = your Render API URL from step A5 (no trailing slash).
4. **Deploy**. Open the Netlify URL and log in.

## C. Connect the two

1. Back in Render → your API service → **Environment** → set
   `CORS_ORIGINS` and `FRONTEND_URL` to your Netlify URL
   (e.g. `https://mynairatrack.netlify.app`), then **Save** (auto-redeploys).
2. Log out and back in on the Netlify site to confirm end-to-end.

## Notes

- Free-tier Render services sleep when idle: the first request after a
  while can take ~30 seconds. This is normal on the free plan.
- Never commit real keys: all secrets live in the Netlify/Render
  dashboards, not in this repo.
- Local development is unchanged: `npm run dev` + uvicorn still work.
