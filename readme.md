# Forest App — Flask + MySQL backend

Windows PowerShell: $env:DB_PASSWORD="your_actual_password"


## 1. Create the database

Make sure MySQL is running, then run the schema file:

```bash
mysql -u root -p < schema.sql
```

This creates a `Profiles` database with a single table:

| column     | type         | notes                          |
|------------|--------------|---------------------------------|
| profile_id | INT          | auto-increment primary key      |
| username   | VARCHAR(50)  | unique                          |
| password   | VARCHAR(255) | stores a hashed password        |
| admin      | BOOLEAN      | defaults to FALSE on register   |

## 2. Install Python dependencies

```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## 3. Set your MySQL credentials

The app reads these from environment variables (defaults shown):

```bash
export DB_HOST=localhost
export DB_USER=root
export DB_PASSWORD=your_mysql_password
export DB_NAME=Profiles
export SECRET_KEY=some-random-string
```

On Windows (PowerShell): `$env:DB_PASSWORD="your_mysql_password"`, etc.

## 4. Run the app

```bash
python app.py
```

Visit `http://localhost:5000/` — it serves `login.html` first. Register a
user, then log in; on success you're redirected to `dashboard.html`.
Logging out clears the session and sends you back to the login page.

## What's wired up so far

- `POST /api/register` — inserts a new row into `profiles` (password is
  hashed with Werkzeug's `generate_password_hash`, `admin` is always
  `False` for new signups).
- `POST /api/login` — checks the username/password against the table and
  starts a Flask session if they match.
- `POST /api/logout` — clears the session.
- `GET /api/whoami` — returns the logged-in username/admin flag, in case
  you want the dashboard to greet the real user or show/hide admin-only
  nav items later.

## Still using placeholder data

The dashboard's stats, charts, tree detail lookup, "add new tree," and
"maintenance details" forms are **not** connected to any database yet —
they still just log to the console. Those can be wired up to real tables
the same way registration/login were, whenever you're ready.

## Notes

- The register page's "Email ID" field isn't stored anywhere yet, since
  the `Profiles` table doesn't have an email column. Add a column and a
  couple lines in `/api/register` if you want to keep it.
- To make the first admin account, register normally, then run:
  ```sql
  UPDATE profiles SET admin = TRUE WHERE username = 'yourusername';
  ```