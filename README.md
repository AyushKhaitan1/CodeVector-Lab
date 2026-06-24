# AeroScale - High-Speed Consistency-Preserving Pagination Engine

A lightweight, high-performance Node.js (TypeScript) & Express backend that implements **consistent, low-latency cursor-based pagination** over a dataset of **200,000 products**. It includes a beautiful glassmorphic telemetry dashboard that displays query metrics, active SQL code, and a real-time simulator to test concurrent data ingestion.

---

## 🚀 Key Features

* **$O(1)$ Pagination Speed**: Query times remain under **2ms** even when scrolling thousands of pages deep, using B-Tree index seeks.
* **Concurrent Writing Consistency**: Eliminates the "shifting offset" problem. When new products are added or updated in the background, users browsing the feed will **never see duplicate products or miss any existing items**.
* **Zero-Setup Local Dev**: Automatically spins up and configures a local **SQLite** database (`products.db`).
* **Production-Ready PG Support**: Plugs into cloud database services (e.g. **Neon** or **Supabase**) via the `DATABASE_URL` environment variable.
* **SQL Telemetry Console**: The frontend dashboard displays the exact SQL query run in the backend in real-time, showcasing how cursor markers dynamically adapt.
* **Ingestion Simulator**: Includes an interactive button that injects 50 new products at the top of the timeline to demonstrate paging consistency live.

---

## 🛠️ How It Works (The Cursor Strategy)

Instead of using shifting offsets (`LIMIT 20 OFFSET 100000`), the engine queries relative to a specific record. Sorted by `created_at DESC, id DESC`, the cursor encodes the timestamp and ID of the last item in the page. The subsequent page query is:

```sql
WHERE (created_at < :cursor_created_at)
   OR (created_at = :cursor_created_at AND id < :cursor_id)
```

Combined with composite indexes `(created_at DESC, id DESC)` and `(category, created_at DESC, id DESC)`, this query avoids scanning table rows, performing a highly optimized index seek.

---

## 📦 Getting Started (Local Run)

### 1. Install Dependencies
```bash
npm install
```

### 2. Seed 200,000 Products (Takes ~1.5 seconds)
This generates 200,000 structured products with realistic names, prices, and sequential timestamps.
```bash
npm run seed
```

### 3. Run Development Server
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🚀 Cloud Deployment

### 1. Setup Cloud Database (Neon / Supabase)
1. Sign up for a free PostgreSQL instance on [Neon.tech](https://neon.tech/) or [Supabase.com](https://supabase.com/).
2. Copy your Connection URI string.

### 2. Seed Your Cloud Database
From your local machine, pass the cloud URL to the seed script:
```bash
# Windows (PowerShell)
$env:DATABASE_URL="postgres://username:password@hostname/dbname?sslmode=require"
npm run seed

# macOS / Linux
DATABASE_URL="postgres://username:password@hostname/dbname?sslmode=require" npm run seed
```
This automatically initializes the Postgres tables, builds the composite indices, and uploads the 200,000 records.

### 3. Setup Hosted Backend (Render)
1. Create a new free Web Service on [Render.com](https://render.com/).
2. Connect your Git repository.
3. Configure:
   * **Build Command**: `npm install && npm run build`
   * **Start Command**: `npm start`
4. Under **Environment Variables**, add:
   * `DATABASE_URL`: `postgres://username:password@hostname/dbname?sslmode=require`
   * `NODE_ENV`: `production`
5. Click **Deploy**. The service will build and host the app, serving both the API and the frontend dashboard.
