# Crackers Billing Application

An offline-first retail billing web application engineered for retail shops selling crackers and fireworks. Designed for fast operation, high-volume seasonal retail sales, instant local search, local IndexedDB persistence, atomic receipt generation, and background Supabase synchronization.

---

## 1. Architectural Highlights

- **Offline-First Storage**: All reads and writes in the billing flow execute against Dexie (IndexedDB) first. The UI never waits for the network.
- **Sub-10ms In-Memory Search**: Products are pre-indexed into an in-memory MiniSearch instance (fuzzy 0.2, prefix matching, exact code match prioritization) with zero per-keystroke network latency or debounce delay.
- **Offline-Safe Bill Numbers**: Formatted as `YYMMDD-<DEVICE>-<SEQ>` (e.g. `261011-A-0007`). Device codes are configured per physical terminal in Settings; sequences are atomically incremented daily in Dexie.
- **Atomic Local Transactions**: Saving a bill records the bill header, snapshot unit prices for bill items, decrements local inventory stock, and enqueues an outbox record in a single Dexie transaction.
- **Idempotent Background Synchronization**: The background sync worker operates in FIFO order with exponential backoff on retries. Server synchronization executes idempotent upserts on UUID keys to prevent duplicates.
- **10-Minute Edit Window**: Staff members can edit bills only within 10 minutes of creation; administrators can edit at any time. Delete operations are disabled in UI and database.
- **Zero Gradients and Zero Emojis**: Built strictly with flat solid colors (palette #F7F7F5, #FFFFFF, #E2E2DE, #1C1C1A, #6B6B66, #C2410C) and self-hosted Inter typography with tabular numerals.

---

## 2. Technology Stack

- **Frontend Core**: React 18, Vite, TypeScript, React Router 6.
- **Styling**: Tailwind CSS with custom solid color tokens.
- **Database (Client)**: Dexie 4 (IndexedDB).
- **Search Engine**: MiniSearch (in-memory prefix and fuzzy matching).
- **State Management**: Zustand (cart and billing session state).
- **Backend & Authentication**: Supabase (PostgreSQL with Row Level Security, Triggers, and Edge Functions).
- **Data Caching (Admin Reports)**: TanStack Query 5.
- **Charts & Visualizations**: Recharts with flat fills and zero gradient definitions.
- **PWA**: vite-plugin-pwa with standalone manifest and offline shell precaching.
- **Testing**: Vitest unit test suite.

---

## 3. Local Setup Instructions

### Prerequisites
- Node.js 18 or later
- npm 9 or later

### Installation Steps

1. Clone or extract the repository:
   ```bash
   cd Crakers-billing
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Set your Supabase configuration:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```
   *Note: If no Supabase instance is provided, the application runs in local offline demo mode with seeded cracker products and simulated demo accounts.*

4. Run unit test suite:
   ```bash
   npm test
   ```

5. Start local development server:
   ```bash
   npm run dev
   ```

---

## 4. Running Migrations and Supabase Setup

### Database Schema and Policies
1. Open your Supabase project SQL Editor.
2. Execute the migration file located at:
   `supabase/migrations/001_init.sql`
3. This script performs the following operations:
   - Creates the tables: `profiles`, `products`, `bills`, `bill_items`, `activity_logs`, and `monthly_targets`.
   - Enables Row Level Security (RLS) on all tables.
   - Enforces the 10-minute edit constraint and blocks bill deletion via database triggers and policies.
   - Sets up audit logging triggers on bills, products, and profiles.
   - Creates reporting RPCs: `daily_sales`, `sales_by_staff`, `top_products`, `payment_mode_split`, `monthly_summary`, and `target_progress`.
   - Seeds 25 cracker products across categories (Sparklers, Flower Pots, Ground Chakkars, Rockets, Bombs, Fancy Shots, Gift Boxes).

### Creating the First Admin User
1. In Supabase Dashboard, navigate to **Authentication -> Users** and click **Add user**.
2. Enter email (e.g. `admin@crackers.com`) and a strong password. Confirm email automatically.
3. In SQL Editor, attach the admin profile by executing:
   ```sql
   INSERT INTO public.profiles (id, full_name, role, is_active)
   SELECT id, 'Store Administrator', 'admin', true
   FROM auth.users
   WHERE email = 'admin@crackers.com'
   ON CONFLICT (id) DO UPDATE SET role = 'admin', is_active = true;
   ```
4. Now log in using those credentials in the web application.

### Deploying the Edge Function (Admin User Management)
To enable administrative user creation from the admin portal, deploy the edge function using Supabase CLI:
```bash
supabase functions deploy admin-users --no-verify-jwt
```

---

## 5. Deploying to Vercel

The application is configured for deployment as a static Single Page Application (SPA) on Vercel:

- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`
- **Environment Variables**:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- **Routing Configuration**: `vercel.json` contains the required SPA rewrites rule:
  ```json
  {
    "rewrites": [
      {
        "source": "/(.*)",
        "destination": "/index.html"
      }
    ]
  }
  ```

---

## 6. Progressive Web App (PWA) Installation Instructions

### Android (Chrome / Edge)
1. Open the application URL in Chrome.
2. A prompt banner "Install app" will appear, or tap the three dots in the top right.
3. Select "Install app" or "Add to Home screen".
4. The Crackers Billing icon will appear in the app drawer and open as a standalone fullscreen application.

### iPhone / iPad (Safari)
1. Open the application URL in Safari.
2. Tap the "Share" icon (rectangle with upward arrow) in the bottom toolbar.
3. Scroll down and tap "Add to Home Screen".
4. Confirm name as "Crackers Billing" and tap "Add".

### Desktop (Chrome / Edge / Brave)
1. In the browser address bar, click the "Install" icon (monitor with down arrow).
2. Click "Install". The application runs in a standalone window without browser chrome.

---

## 7. Offline Test Checklist

Use this checklist in browser Developer Tools or a physical tablet to verify offline reliability:

1. **Initial Cache and Load**:
   - Log into the application while online.
   - In DevTools -> Application -> Service Workers, confirm the Service Worker is active.
   - Under Cache Storage, verify precached assets exist.
2. **Offline Simulation**:
   - In DevTools -> Network, switch throttling to **Offline**.
   - Confirm the connection indicator in the top bar switches to "Offline".
3. **Local Product Search**:
   - In the search bar on the New Bill screen, search for cracker codes like `SPK-01`, `BMB-02`, or `Flower Pots`.
   - Verify results render on every keystroke without delay.
4. **Offline Bill Creation**:
   - Add items, set customer details and discount.
   - Press `Ctrl+Enter` or click "Save & Print Receipt".
   - Confirm the receipt opens instantly with the generated bill number (e.g. `261011-A-0001`).
   - Confirm the top bar shows "Offline (1 pending)".
5. **10-Minute Edit Window**:
   - Click "Edit" on the receipt. Confirm the bill is loaded back into the cart with the countdown timer displayed.
   - Simulate changing system time past 10 minutes: confirm the edit button is disabled with "Edit window closed".
6. **Background Sync Reconciliation**:
   - Switch DevTools Network back to **Online**.
   - Within 30 seconds or upon clicking the sync badge, verify the outbox worker processes the record.
   - The indicator switches to "Online" with 0 pending items.
   - Inspect bills in Dexie and Supabase to confirm the record was upserted with no duplicates.

---

## 8. Implementation Decisions and Defaults

Where specific behaviors were unspecified, the following choices were implemented:

1. **Demo Offline Mode**: If environment variables contain placeholder credentials or if the device is started without internet before server setup, the app seeds two local accounts (`admin@crackers.local` and `staff@crackers.local`) so billing operations can be tested immediately.
2. **Inventory Stock Logic**: Local inventory stock decrements atomically when bills are saved in Dexie.
3. **Paper Size Support**: Both 80 mm POS thermal rolls and standard A4 sizes are supported via a toggle in Settings and standard CSS print media queries.
4. **GST Number**: Treated as optional shop metadata and printed on receipts when provided.
5. **No Hard Deletes**: As mandated, bills cannot be deleted. Products and users feature deactivate/reactivate toggles.
#   v n a c r a c k e r s  
 