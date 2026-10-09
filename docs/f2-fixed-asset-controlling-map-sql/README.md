# F2-Fixed Asset Controlling Map — Self-hosted (DB-backed) version

This turns the dashboard from a static HTML file into a small web app:

```
Browser  <-->  Node.js/Express server (port 4011)  <-->  MySQL database
```

Every time someone uploads an Excel file (or loads one from a URL), the server
parses it and **saves it into MySQL** — replacing the current dataset and
logging the event to an `import_history` table (so you always know what was
loaded, when, and whether it succeeded). The dashboard now loads its data
from the database on every page view instead of having it baked into the
HTML file.

> **I could not deploy this for you.** `192.168.122.10` is on your private
> network and unreachable from my sandbox — I have no way to log into your
> NAS. Everything below is written so you (or your IT admin) can deploy it
> in a few minutes via Container Station's UI.

## ⚠️ Before you do anything: change the MySQL password

You posted `Spc123@@@` in plain text in our chat. Please treat it as
compromised and pick a **new** password for this deployment — put the new
one in `.env` (step 2 below), not the old one.

---

## What's in this folder

```
├── docker-compose.yml     ← defines the app + MySQL containers
├── Dockerfile             ← builds the app container
├── .env.example           ← copy to .env and fill in your password
├── server/                ← Node.js/Express backend
│   ├── server.js
│   ├── db.js
│   ├── parseExcel.js
│   ├── routes/api.js
│   └── sql/init.sql       ← database schema (auto-runs on first boot)
└── public/
    └── index.html         ← the dashboard frontend
```

## Step 1 — Get these files onto your NAS

Copy the whole folder to your QNAP, e.g. into a shared folder like
`/share/Container/f2-fixed-asset/` (via File Station, SMB, or SCP).

## Step 2 — Set your password

On the NAS (SSH, or Container Station's "Create" → "Advanced" file editor),
in the same folder as `docker-compose.yml`:

```bash
cp .env.example .env
nano .env   # set DB_PASSWORD to a NEW strong password
```

## Step 3 — Deploy via Container Station

**Option A — Container Station UI (recommended, no SSH needed):**
1. Open **Container Station** on your QNAP.
2. Go to **Applications** (or **Create** → **Create Application**).
3. Choose **"Create from a docker-compose.yml"** (sometimes labeled "YAML").
4. Point it at the uploaded folder, or paste the contents of
   `docker-compose.yml`.
5. When prompted for environment variables, set `DB_PASSWORD` to the value
   you chose in Step 2.
6. Click **Create** / **Deploy**. Container Station will build the app
   image and start both containers.

**Option B — SSH into the NAS:**
```bash
cd /share/Container/f2-fixed-asset
docker compose up -d --build
```

## Step 4 — Open the dashboard

```
http://192.168.122.10:4011
```

The first time it loads, the asset list will be empty — click **📁 Upload
Excel** and pick your `SPC_Control_FixedAsset_Ver1_0.xlsx`. From then on,
every upload replaces and re-saves the dataset to MySQL automatically.

---

## How data persistence works

- **`assets` table** — always holds the *current* dataset (what the
  dashboard displays).
- **`import_history` table** — one row per upload attempt, success or
  failure, with filename/URL, row count, and timestamp. This is your audit
  trail of "every time an Excel was loaded."
- **`asset_history` table** — a full snapshot of every import, in case you
  ever need to look back at what a previous version of the data looked
  like.
- MySQL data lives in a **Docker named volume** (`f2-mysql-data`), so it
  survives container restarts/updates. Back this volume up periodically if
  the data matters — Container Station's **Volumes** tab lets you inspect
  and back it up.

## Updating the dashboard later

If you ask me for more changes to the frontend, I'll hand you an updated
`public/index.html`. Just replace that one file on the NAS and restart the
`app` container (`docker compose restart app`, or via Container Station's
UI) — no database changes needed unless the schema changes too.

## Troubleshooting

- **Dashboard loads but shows "Không kết nối được tới server/database"**:
  the `app` container can't reach `mysql`. Check both containers are
  running (`docker compose ps`) and that `DB_PASSWORD` matches in both
  places (it's shared via `.env`, so this should be automatic).
- **Port 4011 already in use on the NAS**: change the left-hand side of
  the port mapping in `docker-compose.yml`, e.g. `"3199:4011"`, and adjust
  the URL you open accordingly.
- **First boot takes a while**: MySQL needs a few seconds to initialize its
  data directory on the very first start. The app container retries the
  connection automatically for up to a minute.
- **Uploads fail with a parsing error**: the Excel file needs a sheet named
  "Details" with the same column layout as `SPC_Control_FixedAsset_Ver1_0.xlsx`
  (columns like `fI`, `FixedAssetName`, `Histoty Cost`, etc.).

## Security notes

- MySQL is **not** exposed outside the Docker network by default (see the
  commented-out `ports:` section under the `mysql` service in
  `docker-compose.yml`) — only the `app` container can reach it. Leave it
  that way unless you specifically need external DB access.
- The dashboard itself has no login/authentication — anyone who can reach
  port 4011 on your network can view and upload data. If this NAS is
  reachable from outside your LAN, put it behind your QNAP's VPN or
  reverse proxy with authentication before exposing it further.
