# FreeTime

FreeTime is a browser-based stationery inventory and borrowing application. It tracks stock by physical unit and quality, lets users submit dated borrow requests, lets staff approve requests and record return conditions, and provides account management, notifications, and analytics.

The application has two parts:

- **Frontend:** React UI built and served during development by Vite.
- **Backend:** FastAPI JSON API backed by SQLAlchemy and MySQL or SQLite.

During local development, the browser sends requests to Vite under `/api`. Vite forwards those requests to the FastAPI server on `http://127.0.0.1:8000`. The backend validates sessions and permissions, reads or updates the database, and returns JSON for the frontend to display.

## Features and roles

| Role | Pages | Main capabilities |
|---|---|---|
| User | Make Request | Browse available stationery, submit a request with a due date, and see their own request history and admin decisions. |
| Admin | Overall, Approval Request, Analytics | View inventory, manage accounts, review and approve/reject requests, record item returns, and view analytics. |
| Dev User | Make Request, Overall, Approval Request, Analytics | Access all application pages and borrow workflows. Dev Users do not have account-management permission. |

Page visibility in the frontend is for navigation and UX. The backend separately enforces authentication, role permissions, and borrower ownership; hiding a page is not the security boundary.

### Borrow workflow

1. A User or Dev User selects available stationery and quantities in **Make Request**.
2. They review the request, choose a due date, and submit it. Submission creates a pending request and request-item rows; it does not reserve or deduct stock.
3. An Admin or Dev User reviews it in **Approval Request**. Approval allocates physical units and creates loan records; rejection records the decision without checking out units.
4. An Admin or Dev User records each returned loan as usable, broken, or lost. Broken and lost units are excluded from available stock. Usable returns add the unit back to stock. The UI confirms broken/lost actions in an in-app dialog.
5. Borrowers see their request decisions in Notifications. Admins and Dev Users see pending requests in Notifications. The UI refreshes notifications periodically while signed in.

When approving requests, the backend allocates Worn, then Good, then New units. Unit quality is derived from lifetime borrow count: 0 uses is New, 1–5 is Good, 6–10 is Worn, and more than 10 is Broken. Broken or lost units are not borrowable.

### Analytics

Analytics reads borrowing and return events from the selected calendar month. The month picker defaults to the current month and can select a previous month. The chart plots only dates with recorded requests, checkouts, or returns; missing dates are not treated as zero and are not written to the database. The API reports ranges with no activity records separately, and the chart breaks lines across gaps. Other panels show all-time request/return totals, available stock by quality, and most-borrowed items.

## Repository map

```text
FreeTime/
├── Backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, database initialization and router registration
│   │   ├── database.py          # SQLAlchemy engine, session factory and DB dependency
│   │   ├── models.py            # Database tables and SQLAlchemy models
│   │   ├── schemas.py           # Pydantic request/response validation and API types
│   │   ├── security.py          # Password hashing, sessions, auth dependencies and admin bootstrap
│   │   └── routers/
│   │       ├── auth.py          # Login, logout, current account and account administration
│   │       └── items.py         # Inventory, borrow requests, loans, returns and analytics
│   ├── schema.sql               # MySQL database and table creation script
│   ├── requirements.txt         # Python dependencies
│   ├── .env.example             # Safe configuration template
│   └── .env                     # Private local configuration; do not commit
└── Frontend/
    ├── src/
    │   ├── main.jsx             # React entry point
    │   ├── App.jsx              # App state, API calls, page routing and UI
    │   ├── App.css              # Application component and page styles
    │   ├── index.css            # Global styles
    │   └── assets/              # Imported images and static assets
    ├── public/                  # Public files served as-is by Vite
    ├── index.html               # Browser document and app mount point
    ├── vite.config.js           # React plugins and development API proxy
    ├── package.json             # Frontend dependencies and scripts
    └── package-lock.json        # Locked frontend dependency versions
```

### How the folders and files relate

- `Frontend/src/main.jsx` mounts `App.jsx` into the root element from `Frontend/index.html`.
- `Frontend/src/App.jsx` owns session state, role-based page selection, forms, polling, and API calls. It uses `App.css` for page and component layout and `index.css` for global styles.
- `Frontend/vite.config.js` proxies `/api/...` to the backend and removes the `/api` prefix. This is a **development server** proxy, not a production reverse proxy.
- `Backend/app/main.py` creates the SQLAlchemy tables, bootstraps the optional first administrator, performs a small set of legacy schema/data upgrades, and mounts the auth and item routers.
- `Backend/app/routers/` implements HTTP endpoints. Routers use models for persistence, schemas for validation and serialization, and security dependencies for identity and authorization.
- `Backend/app/models.py` is the SQLAlchemy definition of the database structure. `Backend/app/schemas.py` is the external API contract; schemas are not database tables.
- `Backend/schema.sql` provides the MySQL schema for initial setup. Keep it aligned with model changes.
- `Backend/.env` holds local secrets and connection configuration. `Backend/.env.example` documents the variables without containing credentials.

## Important frontend code

Most application behavior currently lives in `Frontend/src/App.jsx`.

### Page selection

`ROLE_PAGES` maps roles to the visible navigation labels. `renderPage()` renders the page matching `activePage`; it includes **Overall**, **Approval Request**, **Analytics**, and the request page (**Make Request**). When renaming a page, update both its label in `ROLE_PAGES` and any `activePage` comparisons or navigation calls that use that label.

### API and session flow

- `authenticatedFetch()` adds the bearer token and clears the local session when the backend returns 401.
- The session-restore effect calls `/auth/me` after page load when a token exists.
- `submitLogin()` calls `/auth/login`, saves the access token in browser `sessionStorage`, and selects the first page allowed for the returned role.
- `logout()` calls `/auth/logout`, then clears app and browser session state.
- `refreshPageData()`, `refreshAnalytics()`, and `refreshPendingNotifications()` load page data and periodically refresh active request/notification views.

### Request and account actions

- `addToBorrowRequest()`, `startEditingCartItem()`, `cancelEditingCartItem()`, and `confirmCartQuantity()` manage the request cart.
- `submitBorrowRequest()` posts the cart and due date, updates the request list, and opens the success popup only after a successful API response.
- `reviewBorrowRequest()` records an approval or rejection.
- `reviewBorrowReturn()` records a return decision and refreshes inventory.
- `createAccount()` posts a new account from the Admin account-management form.
- `exportBorrowRequestHistory()` and `printBorrowRequestHistory()` export selected request-log rows to CSV or print them.
- `getExpectedBorrowConditions()`, `formatDueDate()`, and the date-range helpers prepare values for display.
- `AnalyticsLineChart`, `AnalyticsDonut`, and `AnalyticsCategoryBars` render analytics visuals.

For a new UI section, first check whether it belongs in `App.jsx` or can be a small reusable component. Keep API validation and permissions in the backend even if the corresponding UI is hidden by role.

## Important backend code

### Startup and database

`Backend/app/database.py` loads `Backend/.env`, creates the SQLAlchemy engine and session factory, and exposes `get_db()` as a FastAPI dependency. `DATABASE_URL` selects the database. If it is unset, the backend uses `Backend/app.db` (SQLite).

`Backend/app/main.py` creates tables with `Base.metadata.create_all()`. It also adds selected columns to older databases and backfills physical item units and missing links for existing active loans. These startup upgrades are narrow, hand-written compatibility steps, not a general migration system.

### Authentication and account management

`Backend/app/security.py`:

- `hash_password()` and `verify_password()` use salted PBKDF2-HMAC-SHA256 password hashes.
- `create_session()` generates a random bearer token and stores only its SHA-256 hash in the database.
- `get_current_user()` validates the bearer session, expiry, revocation status, and active account.
- `require_roles()` restricts endpoints by role.
- `bootstrap_admin()` creates the initial Admin only when bootstrap variables are configured and the username is unused.

`Backend/app/routers/auth.py` implements:

| Method and path | Purpose |
|---|---|
| `POST /auth/login` | Verify username/password and issue an eight-hour bearer session. |
| `GET /auth/me` | Return the signed-in account. |
| `POST /auth/logout` | Revoke the current session. |
| `GET /auth/users` | List accounts; Admin only. |
| `POST /auth/users` | Create an account; Admin only. |

Passwords are never returned by the account API and are not stored in plaintext.

### Inventory and borrowing API

`Backend/app/routers/items.py` handles the active stationery workflow:

| Method and path | Purpose |
|---|---|
| `GET /items` | List inventory with available quantity and quality counts. |
| `POST /items` | Create inventory item and physical units; Admin/Dev User. |
| `PATCH /items/{item_id}` | Change total stock; Admin/Dev User. |
| `PATCH /items/{item_id}/condition` | Change a quantity of units between Broken and a usable quality; Admin/Dev User. |
| `POST /items/requests` | Submit a multi-item borrow request; User/Dev User. |
| `GET /items/requests?borrower_name=...` | List a borrower's requests; Users are restricted to their own username. |
| `GET /items/requests/pending` | List pending requests for review; Admin/Dev User. |
| `GET /items/requests/history` | List all requests; Admin/Dev User. |
| `PATCH /items/requests/{request_id}/decision` | Approve or reject a pending request; Admin/Dev User. |
| `GET /items/loans?borrower_name=...` | List a borrower's loan history; Users are restricted to their own username. |
| `GET /items/loans/returns/pending` | List borrower-reported returns awaiting review; Admin/Dev User. |
| `GET /items/loans/checked-out` | List active checkouts; Admin/Dev User. |
| `PATCH /items/loans/{loan_id}/return-decision` | Record usable, broken, lost, or rejected return outcome; Admin/Dev User. |
| `GET /items/analytics/borrow?month=YYYY-MM` | Return current or selected month analytics; Admin/Dev User. |

`/health` is registered by `Backend/app/main.py` and reports backend health. Interactive API documentation is available at `/docs` while the backend is running; `/openapi.json` describes the registered API.

Helpers such as `_item_output()`, `_item_condition_quantities()`, `_borrow_request_output()`, and `_item_borrow_output()` adapt database rows into API response shapes. Keep these response helpers consistent with `Backend/app/schemas.py`.

## Database contents

The database contains the following groups of tables. The current UI/API uses the account, inventory, borrow-request, unit, and loan tables. Tool requisition tables are defined for a possible future workflow but do **not** currently have an active API router or UI.

### Active account tables

| Table | Contents |
|---|---|
| `user_accounts` | Normalized username, display name, password hash, role, active flag, and creation timestamp. |
| `user_sessions` | Account reference, token hash, creation/expiry timestamps, and revocation timestamp. |

### Active stationery and borrowing tables

| Table | Contents |
|---|---|
| `items` | Inventory catalog entry: title, category, available quantity, and legacy broken flag. |
| `item_units` | One row per physical unit: lifetime borrow count, broken/checked-out/lost flags, and item reference. |
| `borrow_requests` | Request owner, status, submission time, requested due date, and review time. |
| `borrow_request_items` | Item and quantity requested for each request. |
| `item_borrows` | Approved loan per item: request/item references, borrower, quantity, dates, status, and return decision/condition. |
| `item_borrow_units` | Links each loan to the physical units checked out for it. |

`items.quantity` is the available stock count. Unit-level rows preserve each physical item's history and condition. Requesting does not reserve stock; stock is checked and decremented transactionally on approval. `borrow_request_items` preserves the original request, while `item_borrows` records approved checkouts and return outcomes.

### Schema-only tool and requisition tables

| Table | Contents |
|---|---|
| `tools` | Tool catalog including serial number, category, location, calibration status, and availability status. |
| `requisitions` | Request code, requester, location, urgency, status, reason, and timestamp. |
| `requisition_items` | Tools and quantities included in a requisition. |
| `tool_loans` | Tool checkout and due/return dates. |
| `return_receipts` | Tool-loan return receipt, condition, receiver, and timestamp. |

These tables exist in `models.py` and `schema.sql`, but should be treated as scaffold/schema only until a router, validation schemas, frontend UI, and tests are added.

## Setup and running locally

### 1. Configure the database

For MySQL:

1. Create the database and starter tables by running `Backend/schema.sql` in MySQL Workbench or a MySQL client.
2. Copy the example configuration:

   ```powershell
   Copy-Item Backend\.env.example Backend\.env
   ```

3. Edit `Backend/.env` locally. Set `DATABASE_URL` to your MySQL connection string and, optionally, set the bootstrap administrator username and password. Never paste actual credentials into source files, commits, chat, or issue reports.
4. The backend creates missing SQLAlchemy tables at startup. Existing installations may also require the specific compatibility upgrades in `Backend/app/main.py`.

For local SQLite, leave `DATABASE_URL` unset; the backend creates/uses `Backend/app.db`.

### 2. Install and start the backend

From the repository root in PowerShell:

```powershell
python -m venv Backend\.venv
Backend\.venv\Scripts\python.exe -m pip install -r Backend\requirements.txt
Backend\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --app-dir Backend
```

Alternatively, change to `Backend` and run `.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000`.

### 3. Install and start the frontend

In another PowerShell terminal:

```powershell
cd Frontend
npm ci
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). Keep both development servers running. The Vite proxy in `Frontend/vite.config.js` forwards `/api` requests to port 8000.

### Start both services with one command on Windows

From the repository root in PowerShell, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\run.ps1
```

The launcher opens separate backend and frontend windows, installs missing dependencies, and prints the local frontend URL. Keep both windows open while using the app.

The bootstrap Admin is optional. If bootstrap credentials are configured, an account is created on backend startup only if that username is not already present. Admins can create other accounts from **Overall → Manage accounts**. Account passwords must be at least 12 characters.

## Updating the project safely

### Add or change a database field

1. Update the SQLAlchemy model in `Backend/app/models.py`.
2. Update the matching Pydantic input/output schema in `Backend/app/schemas.py`.
3. Update route logic/response shaping in the relevant file under `Backend/app/routers/`.
4. Update `Backend/schema.sql` for fresh MySQL installations.
5. For existing databases, add and test a deliberate migration. Current startup compatibility code is in `Backend/app/main.py`; it is not a substitute for a versioned migration system. Back up real data before schema changes. Do not remove columns or tables just because a model field was removed.
6. Update frontend API usage and UI in `Frontend/src/App.jsx`, plus `App.css`/`index.css` if presentation changes.
7. Test both a fresh database and an existing database with representative data.

### Add or change an API feature

- Define/adjust Pydantic schemas first so accepted payloads and response types are explicit.
- Implement database operations and error handling in the appropriate router.
- Apply `get_current_user` and `require_roles(...)` to every protected endpoint. Enforce ownership checks server-side for user-scoped data.
- Update the frontend request and error handling. Use `authenticatedFetch()` for protected requests.
- Update this README’s endpoint, role, or data-flow notes when behavior changes.

### Add or change a page or interaction

- Update role navigation in `ROLE_PAGES` and the page rendering branches in `renderPage()` in `Frontend/src/App.jsx`.
- Keep API access role checks aligned with the backend; frontend navigation alone is not authorization.
- Add styles to `Frontend/src/App.css` for app components and `Frontend/src/index.css` only for global styles.
- Preserve responsive behavior and accessible labels/alerts when changing forms, dialogs, tables, or buttons.

### Database changes and data integrity

- Use the application API or reviewed database migrations rather than ad hoc edits to live production rows.
- Do not store plaintext passwords. Account passwords must be hashed through `hash_password()`; never return `password_hash` from API schemas.
- Do not create synthetic analytics records to fill quiet days. A day without source events is a missing range, not a recorded zero.
- Approval and return updates affect both summary inventory and physical unit/loan history. Keep those changes transactional and preserve foreign-key relationships.
- `schema.sql` is an initial MySQL setup script, not a complete migration history. For long-lived deployments, consider adding a versioned migration tool before making complex schema changes.

## Validation commands

Frontend:

```powershell
cd Frontend
npm run lint
npm run build
```

Backend syntax compilation:

```powershell
Backend\.venv\Scripts\python.exe -m compileall Backend\app
```

The repository does not currently define a standalone automated test suite. For API behavior changes, add focused tests using an isolated SQLite database and verify authentication, role/ownership boundaries, data integrity, and error responses. Do not test by altering the production database.

## Configuration and deployment notes

- `Backend/.env` and `Backend/app.db` are ignored by `Backend/.gitignore`; keep local credentials and database data private.
- Use a unique, strong bootstrap password and restrict access to database credentials.
- The bearer token is stored in browser `sessionStorage`; the database stores only its hash and session metadata. Sessions expire after eight hours and are revoked at logout.
- The Vite proxy only supports local development. A production deployment must serve the built frontend and route `/api` to FastAPI through a properly configured web server/reverse proxy.
- Use HTTPS for deployments beyond a trusted local machine/network. Configure allowed CORS origins for the production frontend rather than copying the development origin blindly.
