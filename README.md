# Khushhal Kisan Survey

A multilingual survey platform for Farmer and FPO / Agriculture Stakeholder responses.

## Project layout

- `client/` — React + Vite public survey and admin pages
- `client/src/main.jsx` — survey experience, language selection, client-side draft handling
- `client/src/styles.css` — responsive survey UI
- `client/public/admin.html` — production admin dashboard (`/admin.html`)
- `client/admin.html` — development admin dashboard
- `server/` — Express API, PostgreSQL integration, Excel exports
- `server/schema.sql` — additive database schema / compatibility setup

## Local development

Use Node.js 20 or newer and PostgreSQL.

1. Create a PostgreSQL database for Khushhal Kisan.
2. Create `server/.env` locally (never commit or upload this file) with:
   - `DATABASE_URL` — PostgreSQL connection string
   - `PORT` — local API port, usually `5000`
   - `CLIENT_ORIGIN` — allowed frontend origin, e.g. `http://localhost:5173`
   - `ADMIN_USERNAME` — admin login username
   - `ADMIN_PASSWORD_HASH` — bcrypt hash of the admin password
   - `JWT_SECRET` — long, random signing secret
3. Install dependencies from the repository root:

   ```bash
   npm run install:all
   ```

4. Start both services:

   ```bash
   npm run dev
   ```

5. Open the Vite URL printed in the terminal. The admin page is `/admin.html`.

## Production deployment

Deploy the API and frontend separately.

### API (Render or another Node host)

- Root directory: `server`
- Build command: `npm install`
- Start command: `npm start`
- Configure the environment variables listed above.
- Set `CLIENT_ORIGIN` to the exact deployed frontend origin. Multiple allowed origins may be comma-separated.
- Attach a persistent PostgreSQL database and use its connection string as `DATABASE_URL`.
- Keep `.env`, credentials, database URLs, password hashes, and JWT secrets out of Git and deployment ZIPs.

### Frontend (Vercel or another static host)

- Root directory: `client`
- Build command: `npm run build`
- Output directory: `dist`
- Set `VITE_API_URL` to the deployed API base URL, without a trailing slash.
- After deployment, add the exact frontend domain to the API's `CLIENT_ORIGIN`.

The production admin page is emitted from `client/public/admin.html` and is available at `/admin.html`.

## Data and privacy safeguards

- Farmer and Stakeholder submissions are stored separately by `survey_type`.
- Server-side pending records are created only after a name and valid Indian mobile number are present.
- Pending Farmer and Pending Stakeholder records are separate.
- Draft lookup is scoped by survey type and exact name + normalized mobile.
- Previous response identifiers are retained internally for historical traceability and are not displayed in the admin UI or Excel exports.
- The server schema is additive. Do not reset or truncate the production database to deploy code updates.
- Take a verified PostgreSQL backup before applying any production update.

## Important deployment checks

- Confirm the API health endpoint returns `{"ok":true,"database":"connected"}`.
- Submit one test Farmer response and one test Stakeholder response.
- Confirm both appear in their respective admin tabs.
- Confirm pending records appear only after name + valid mobile are entered.
- Confirm each Excel export contains only the selected category.
- Confirm Hindi, English, and Assamese labels render correctly.
- Remove test records only through an approved, audited data-management process; do not reset the database.


## Questionnaire and admin improvements in this update

- Farmer Q7 displays its conditional Q7.1 follow-up inside the same question group.
- Farmer Q8 displays Q8.1 only after a Yes answer; the optional soil-report image control appears beneath that follow-up.
- Farmer Q14 groups crop name, disease name and optional crop-disease photo in one card.
- The seven AI model rating questions have been replaced in both Farmer and FPO surveys by one required Yes/No question, `khushhal_app_useful`.
- Historical responses containing any of the seven former rating answers are consolidated to `Yes` in the writable current database. Old Neon data remains read-only and is displayed/exported as `Yes` through the API without modifying Neon.
- Existing answer keys are retained: `soil_test_method`, `soil_report_photo`, `recent_crop_name`, `recent_disease_name`, and `disease_photo`.
- FPO Q14 and the FPO questionnaire numbering are unchanged.
- The admin login page now has an API URL setting and a connection test against `/api/health`. Save the deployed API base URL there if the admin page cannot fetch records. The API must allow the frontend origin through `CLIENT_ORIGIN`.

## Updating an existing deployment safely

1. Keep the existing `server/.env` file and all hosting environment variables unchanged.
2. Take and verify a PostgreSQL backup before applying any database change.
3. Confirm the baseline schema and migrations `002_current_question_columns.sql` and `003_current_question_catalog.sql` are already applied. Then run `server/migrations/004_khushhal_app_usefulness.sql` once against the writable `DATABASE_URL` database. **Do not run it against the read-only `LEGACY_DATABASE_URL` / Neon database.**
4. Replace application source files with this release; do not replace `.env`.
5. Build and deploy the client from `client/` (`npm install`, then `npm run build`; publish `dist/`).
6. Deploy the API from `server/` (`npm install`, then `npm start`).
7. Set `VITE_API_URL` on the frontend to the exact API base URL. Set `CLIENT_ORIGIN` on the API to the exact frontend origin.
8. Open `/admin.html`, set the API Server URL, click **Test Connection**, then log in with the existing admin credentials.

No database reset, truncation, or deletion is required. This archive does not include secrets or a database backup.
