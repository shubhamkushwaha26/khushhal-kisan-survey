# Khushhal Kisan — Farmer Survey Website

A responsive bilingual (English/Hindi) farmer needs and market-validation survey built with **React + Vite**, **Node.js + Express**, and **PostgreSQL**. Designed for the Khushhal Kisan initiative by AiVirinchi Private Limited.

## Features
- English/Hindi toggle; both languages are available for questions and answer options.
- Farmer survey plus a separate FPO/agriculture-stakeholder interview.
- Six farmer sections covering profile, challenges, technology/AI, payment preference, and open feedback.
- Input validation, multi-select limits, progress indicator, responsive mobile layout.
- Survey responses stored in PostgreSQL as JSONB.
- Unique receipt ID after successful save, e.g. `HK-20261027-A1B2C3`.
- Thank-you screen after successful database submission.
- API health endpoint at `/api/health`.

## 1. Requirements
- Node.js 20+ recommended
- PostgreSQL database (Neon works well)

## 2. Configure the database
Create a PostgreSQL database. In the `server` directory, copy `.env.example` to `.env` and set `DATABASE_URL`:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
PORT=5000
CLIENT_ORIGIN=http://localhost:5173
```

Use the actual connection string from your database provider. **Never commit `.env` or share your database password.** The server creates the `survey_responses` table automatically at startup using `server/schema.sql`.

## 3. Run locally (Windows PowerShell)
Open a terminal in the project root (`khushhal-kisan-survey`) and run:

```powershell
npm install
npm install --prefix server
npm install --prefix client
Copy-Item server/.env.example server/.env
# Edit server/.env and add DATABASE_URL
Copy-Item client/.env.example client/.env
npm run dev
```

The website runs at `http://localhost:5173`; the API runs at `http://localhost:5000`. If you already created `server/.env`, do not overwrite it. Check `http://localhost:5000/api/health` to confirm database connectivity.

## 4. Deploy online (Render + Neon)
You will deploy the frontend and backend as two services. You need to create these services in your own accounts; this source ZIP cannot publish a public URL without access to your hosting/database accounts.

### Backend — Render Web Service
1. Push this folder to a GitHub repository.
2. In Render, create **New → Web Service** and select the repository.
3. Set **Root Directory** to `server`.
4. Build command: `npm install`
5. Start command: `npm start`
6. Add environment variables:
   - `DATABASE_URL` = your PostgreSQL/Neon connection string (include `sslmode=require` when required by provider)
   - `CLIENT_ORIGIN` = your deployed frontend URL (after creating the frontend; comma-separate additional origins if needed)
   - `NODE_ENV` = `production`
7. Deploy and open `https://YOUR-BACKEND.onrender.com/api/health`. It should return `{"ok":true,"database":"connected"}`.

### Frontend — Render Static Site
1. Create **New → Static Site** from the same repository.
2. Set **Root Directory** to `client`.
3. Build command: `npm install && npm run build`
4. Publish directory: `dist`
5. Add build environment variable `VITE_API_URL` = `https://YOUR-BACKEND.onrender.com` (no trailing slash).
6. Deploy. Copy the frontend URL, then update the backend service's `CLIENT_ORIGIN` to that URL and redeploy the backend.

### Before sharing your survey link
- Submit one test response and confirm a unique ID is shown.
- Confirm the row appears in `survey_responses` in PostgreSQL.
- Test the Hindi toggle and the mobile layout.
- Keep the database connection string private. Do not put it in the React frontend.

## Database structure
`survey_responses` columns: `id`, `response_id`, `survey_type`, `language`, `answers` (JSONB), `consent`, `submitted_at`, `created_at`. Every question answer is stored under its question ID in `answers`, preserving multi-select responses as arrays.

## Notes
- This project does not include a public admin/dashboard endpoint; survey submissions are stored in the database. Review records using your PostgreSQL provider's SQL editor or add a secured admin dashboard later.
- Do not enter farmer personal contact details unless they voluntarily provide them and have agreed to be contacted.
