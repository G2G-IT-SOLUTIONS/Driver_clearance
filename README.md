# G2G Clearance Letters (React + Node + PostgreSQL)

* `/`            driver page (no login): phone + plate -> OTP -> fleet check -> dates -> transactions -> Chapa -> one download
* `/admin`       staff console (login required): letters, templates (drag & drop editor), free-download tokens, payments, logs, settings, staff users

## Setup
1. Create a PostgreSQL 13+ database, e.g. `createdb g2g`
2. `cd server && cp .env.example .env` and fill it in
3. `npm install && npm run db:init`   (creates tables, default templates/messages and the first admin)
4. `npm start`   (API on :3001)
5. `cd ../client && npm install && npm run dev`   (http://localhost:5173, admin at /admin)

Production: `cd client && npm run build` — the Node server then serves the built app on the same port.

Notes
* PDFs are made with Puppeteer (downloads Chromium on `npm install`). For Amharic text install the "Noto Sans Ethiopic" font on the server.
* Chapa must reach `API_PUBLIC_URL` (https) for the callback; use ngrok while developing. The driver is also verified directly when returning from checkout.
* `SMS_PROVIDER=console` prints OTP codes in the server terminal for testing.
