import os
import sqlite3
from contextlib import closing
from functools import wraps

from flask import Flask, request, jsonify, session, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__, static_folder="static", static_url_path="")

app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-me")
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
)

DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "forest.db"))


# ---------------------------------------------------------------------
# DB
# ---------------------------------------------------------------------

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


SCHEMA = """
CREATE TABLE IF NOT EXISTS profiles (
    profile_id INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT    NOT NULL UNIQUE,
    email      TEXT    UNIQUE,
    password   TEXT    NOT NULL,
    admin      INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trees (
    tree_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    species          TEXT    NOT NULL,
    scientific_name  TEXT,
    location         TEXT,
    plantation_date  TEXT,
    height           TEXT,
    health           TEXT,
    watering         TEXT,
    last_checked     TEXT,
    status           TEXT,
    profile_id       INTEGER NOT NULL,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (profile_id) REFERENCES profiles(profile_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trees_profile ON trees(profile_id);
CREATE INDEX IF NOT EXISTS idx_trees_planted ON trees(plantation_date);

CREATE TABLE IF NOT EXISTS maintenance (
    maintenance_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    tree_id           INTEGER NOT NULL,
    profile_id        INTEGER NOT NULL,
    current_height    TEXT,
    maintenance_date  TEXT,
    maintenance_time  TEXT,
    condition         TEXT,
    created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (tree_id)    REFERENCES trees(tree_id)         ON DELETE CASCADE,
    FOREIGN KEY (profile_id) REFERENCES profiles(profile_id)   ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_maint_tree ON maintenance(tree_id);
"""


def init_db():
    with closing(get_db()) as conn:
        conn.executescript(SCHEMA)
        conn.commit()


def current_profile_id():
    return session.get("profile_id")


def is_admin():
    return bool(session.get("admin"))


def unauthorized():
    return jsonify({"error": "Not authenticated."}), 401


def admin_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not current_profile_id():
            return unauthorized()
        if not is_admin():
            return jsonify({"error": "Admin only."}), 403
        return f(*args, **kwargs)
    return wrapper


# ---------------------------------------------------------------------
# Static SPA
# ---------------------------------------------------------------------

@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


# ---------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------

@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    email    = (data.get("email") or "").strip() or None
    password = data.get("password") or ""

    hashed = generate_password_hash(password)

    try:
        with closing(get_db()) as conn:
            # First user to ever register becomes admin
            count = conn.execute("SELECT COUNT(*) AS c FROM profiles").fetchone()["c"]
            admin = 1 if count == 0 else 0

            conn.execute(
                "INSERT INTO profiles (username, email, password, admin) "
                "VALUES (?, ?, ?, ?)",
                (username, email, hashed, admin),
            )
            conn.commit()
    except sqlite3.IntegrityError as e:
        msg = str(e).lower()
        if "email" in msg:
            return jsonify({"error": "That email is already registered."}), 409
        return jsonify({"error": "That username is already taken."}), 409
    except sqlite3.Error as e:
        return jsonify({"error": f"Database error: {e}"}), 500

    return jsonify({"message": "Registered.", "admin": bool(admin)}), 201


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    try:
        with closing(get_db()) as conn:
            row = conn.execute(
                "SELECT profile_id, username, password, admin "
                "FROM profiles WHERE username = ?",
                (username,),
            ).fetchone()
    except sqlite3.Error as e:
        return jsonify({"error": f"Database error: {e}"}), 500

    if not row or not check_password_hash(row["password"], password):
        return jsonify({"error": "Invalid username or password."}), 401

    session["profile_id"] = row["profile_id"]
    session["username"]   = row["username"]
    session["admin"]      = bool(row["admin"])

    return jsonify({
        "message": "Login successful.",
        "username": row["username"],
        "admin": bool(row["admin"]),
    }), 200


@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Logged out."}), 200


@app.route("/api/whoami", methods=["GET"])
def whoami():
    if "username" not in session:
        return jsonify({"authenticated": False}), 200
    return jsonify({
        "authenticated": True,
        "username": session["username"],
        "admin": session.get("admin", False),
    }), 200


# ---------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------

@app.route("/api/profile", methods=["GET"])
def get_profile():
    if not current_profile_id():
        return unauthorized()

    pid = current_profile_id()

    try:
        with closing(get_db()) as conn:
            row = conn.execute(
                "SELECT profile_id, username, email, admin, created_at "
                "FROM profiles WHERE profile_id = ?",
                (pid,),
            ).fetchone()
            if not row:
                return unauthorized()

            tree_count = conn.execute(
                "SELECT COUNT(*) AS c FROM trees WHERE profile_id = ?",
                (pid,),
            ).fetchone()["c"]

            maint_count = conn.execute(
                "SELECT COUNT(*) AS c FROM maintenance WHERE profile_id = ?",
                (pid,),
            ).fetchone()["c"]
    except sqlite3.Error as e:
        return jsonify({"error": f"Database error: {e}"}), 500

    data = dict(row)
    data["admin"] = bool(data["admin"])
    data["tree_count"] = tree_count
    data["maintenance_count"] = maint_count
    return jsonify(data), 200


@app.route("/api/profile", methods=["PUT"])
def update_profile():
    if not current_profile_id():
        return unauthorized()

    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip() or None

    try:
        with closing(get_db()) as conn:
            conn.execute(
                "UPDATE profiles SET email = ? WHERE profile_id = ?",
                (email, current_profile_id()),
            )
            conn.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "That email is already in use."}), 409
    except sqlite3.Error as e:
        return jsonify({"error": f"Database error: {e}"}), 500

    return jsonify({"message": "Profile updated."}), 200


@app.route("/api/profile/password", methods=["POST"])
def change_password():
    if not current_profile_id():
        return unauthorized()

    data = request.get_json(silent=True) or {}
    old_password = data.get("oldPassword") or ""
    new_password = data.get("newPassword") or ""

    try:
        with closing(get_db()) as conn:
            row = conn.execute(
                "SELECT password FROM profiles WHERE profile_id = ?",
                (current_profile_id(),),
            ).fetchone()
            if not row or not check_password_hash(row["password"], old_password):
                return jsonify({"error": "Current password is incorrect."}), 401

            conn.execute(
                "UPDATE profiles SET password = ? WHERE profile_id = ?",
                (generate_password_hash(new_password), current_profile_id()),
            )
            conn.commit()
    except sqlite3.Error as e:
        return jsonify({"error": f"Database error: {e}"}), 500

    return jsonify({"message": "Password changed."}), 200


@app.route("/api/profile", methods=["DELETE"])
def delete_self():
    if not current_profile_id():
        return unauthorized()

    try:
        with closing(get_db()) as conn:
            conn.execute("DELETE FROM profiles WHERE profile_id = ?",
                         (current_profile_id(),))
            conn.commit()
    except sqlite3.Error as e:
        return jsonify({"error": f"Database error: {e}"}), 500

    session.clear()
    return jsonify({"message": "Account deleted."}), 200


# ---------------------------------------------------------------------
# Trees
# ---------------------------------------------------------------------

@app.route("/api/trees", methods=["POST"])
def add_tree():
    if not current_profile_id():
        return unauthorized()

    data = request.get_json(silent=True) or {}
    species         = (data.get("species") or "").strip()
    height          = (data.get("height") or "").strip() or None
    plantation_date = (data.get("plantationDate") or "").strip() or None
    location        = (data.get("location") or "").strip() or None

    try:
        with closing(get_db()) as conn:
            cur = conn.execute(
                "INSERT INTO trees "
                "(species, height, plantation_date, location, profile_id) "
                "VALUES (?, ?, ?, ?, ?)",
                (species, height, plantation_date, location, current_profile_id()),
            )
            new_id = cur.lastrowid
            conn.commit()
    except sqlite3.Error as e:
        return jsonify({"error": f"Database error: {e}"}), 500

    return jsonify({"message": "Tree added.", "tree_id": new_id}), 201


@app.route("/api/trees/<int:tree_id>", methods=["GET"])
def get_tree(tree_id):
    if not current_profile_id():
        return unauthorized()

    try:
        with closing(get_db()) as conn:
            if is_admin():
                row = conn.execute(
                    """SELECT t.*, p.username AS owner
                       FROM trees t JOIN profiles p ON p.profile_id = t.profile_id
                       WHERE t.tree_id = ?""",
                    (tree_id,),
                ).fetchone()
            else:
                row = conn.execute(
                    """SELECT t.*, p.username AS owner
                       FROM trees t JOIN profiles p ON p.profile_id = t.profile_id
                       WHERE t.tree_id = ? AND t.profile_id = ?""",
                    (tree_id, current_profile_id()),
                ).fetchone()
    except sqlite3.Error as e:
        return jsonify({"error": f"Database error: {e}"}), 500

    if not row:
        return jsonify({"error": "No tree found with that ID."}), 404

    return jsonify(dict(row)), 200


@app.route("/api/trees/<int:tree_id>", methods=["DELETE"])
def delete_tree(tree_id):
    if not current_profile_id():
        return unauthorized()

    try:
        with closing(get_db()) as conn:
            if is_admin():
                conn.execute("DELETE FROM trees WHERE tree_id = ?", (tree_id,))
            else:
                conn.execute(
                    "DELETE FROM trees WHERE tree_id = ? AND profile_id = ?",
                    (tree_id, current_profile_id()),
                )
            conn.commit()
    except sqlite3.Error as e:
        return jsonify({"error": f"Database error: {e}"}), 500

    return jsonify({"message": "Tree deleted."}), 200


@app.route("/api/trees/<int:tree_id>/maintenance", methods=["GET"])
def list_maintenance(tree_id):
    if not current_profile_id():
        return unauthorized()

    try:
        with closing(get_db()) as conn:
            if not is_admin():
                owns = conn.execute(
                    "SELECT 1 FROM trees WHERE tree_id = ? AND profile_id = ?",
                    (tree_id, current_profile_id()),
                ).fetchone()
                if not owns:
                    return jsonify({"error": "No tree found with that ID."}), 404

            rows = conn.execute(
                """SELECT maintenance_id, tree_id, current_height,
                          maintenance_date, maintenance_time, condition
                   FROM maintenance
                   WHERE tree_id = ?
                   ORDER BY maintenance_date DESC, maintenance_time DESC""",
                (tree_id,),
            ).fetchall()
    except sqlite3.Error as e:
        return jsonify({"error": f"Database error: {e}"}), 500

    return jsonify({"entries": [dict(r) for r in rows]}), 200


# ---------------------------------------------------------------------
# Maintenance
# ---------------------------------------------------------------------

@app.route("/api/maintenance", methods=["POST"])
def add_maintenance():
    if not current_profile_id():
        return unauthorized()

    data = request.get_json(silent=True) or {}
    current_height   = (data.get("currentHeight") or "").strip() or None
    maintenance_date = (data.get("maintenanceDate") or "").strip() or None
    maintenance_time = (data.get("maintenanceTime") or "").strip() or None
    condition        = (data.get("condition") or "").strip() or None

    try:
        tree_id = int(data.get("treeId"))
    except (TypeError, ValueError):
        return jsonify({"error": "A valid Tree ID is required."}), 400

    pid = current_profile_id()

    try:
        with closing(get_db()) as conn:
            if not is_admin():
                owns = conn.execute(
                    "SELECT 1 FROM trees WHERE tree_id = ? AND profile_id = ?",
                    (tree_id, pid),
                ).fetchone()
                if not owns:
                    return jsonify({"error": "No tree found with that ID."}), 404

            conn.execute(
                """INSERT INTO maintenance
                   (tree_id, profile_id, current_height,
                    maintenance_date, maintenance_time, condition)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (tree_id, pid, current_height,
                 maintenance_date, maintenance_time, condition),
            )

            updates, params = [], []
            if current_height is not None:
                updates.append("height = ?");       params.append(current_height)
            if maintenance_date is not None:
                updates.append("last_checked = ?"); params.append(maintenance_date)
            if condition is not None:
                updates.append("health = ?");       params.append(condition)

            if updates:
                params.append(tree_id)
                conn.execute(
                    f"UPDATE trees SET {', '.join(updates)} WHERE tree_id = ?",
                    tuple(params),
                )
            conn.commit()
    except sqlite3.Error as e:
        return jsonify({"error": f"Database error: {e}"}), 500

    return jsonify({"message": "Maintenance logged."}), 201


# ---------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------

@app.route("/api/stats", methods=["GET"])
def stats():
    if not current_profile_id():
        return unauthorized()

    pid = current_profile_id()
    empty = [0] * 12

    try:
        with closing(get_db()) as conn:
            month_count = conn.execute(
                """SELECT COUNT(*) AS c FROM trees
                   WHERE profile_id = ?
                     AND strftime('%Y', plantation_date) = strftime('%Y', 'now')
                     AND strftime('%m', plantation_date) = strftime('%m', 'now')""",
                (pid,),
            ).fetchone()["c"]

            year_count = conn.execute(
                """SELECT COUNT(*) AS c FROM trees
                   WHERE profile_id = ?
                     AND strftime('%Y', plantation_date) = strftime('%Y', 'now')""",
                (pid,),
            ).fetchone()["c"]

            trees_by_month = empty[:]
            for r in conn.execute(
                """SELECT CAST(strftime('%m', plantation_date) AS INTEGER) AS m,
                          COUNT(*) AS c
                   FROM trees
                   WHERE profile_id = ?
                     AND strftime('%Y', plantation_date) = strftime('%Y', 'now')
                   GROUP BY m""",
                (pid,),
            ).fetchall():
                if r["m"]:
                    trees_by_month[r["m"] - 1] = r["c"]

            users_by_month = empty[:]
            for r in conn.execute(
                """SELECT CAST(strftime('%m', created_at) AS INTEGER) AS m,
                          COUNT(*) AS c
                   FROM profiles
                   WHERE strftime('%Y', created_at) = strftime('%Y', 'now')
                   GROUP BY m""",
            ).fetchall():
                if r["m"]:
                    users_by_month[r["m"] - 1] = r["c"]
    except sqlite3.Error as e:
        return jsonify({"error": f"Database error: {e}"}), 500

    return jsonify({
        "this_month":     month_count,
        "this_year":      year_count,
        "trees_by_month": trees_by_month,
        "users_by_month": users_by_month,
    }), 200


# ---------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------

@app.route("/api/admin/overview", methods=["GET"])
@admin_required
def admin_overview():
    try:
        with closing(get_db()) as conn:
            users = [dict(r) for r in conn.execute(
                """SELECT p.profile_id, p.username, p.email, p.admin, p.created_at,
                          (SELECT COUNT(*) FROM trees t WHERE t.profile_id = p.profile_id) AS tree_count
                   FROM profiles p
                   ORDER BY p.profile_id"""
            ).fetchall()]

            trees = [dict(r) for r in conn.execute(
                """SELECT t.tree_id, t.species, t.location, t.plantation_date,
                          t.height, t.health, t.profile_id,
                          p.username AS owner
                   FROM trees t JOIN profiles p ON p.profile_id = t.profile_id
                   ORDER BY t.tree_id DESC"""
            ).fetchall()]

            maintenance = [dict(r) for r in conn.execute(
                """SELECT m.maintenance_id, m.tree_id, m.maintenance_date,
                          m.maintenance_time, m.condition, m.profile_id,
                          p.username AS owner, t.species AS tree_species
                   FROM maintenance m
                   JOIN profiles p ON p.profile_id = m.profile_id
                   LEFT JOIN trees t ON t.tree_id = m.tree_id
                   ORDER BY m.maintenance_id DESC"""
            ).fetchall()]
    except sqlite3.Error as e:
        return jsonify({"error": f"Database error: {e}"}), 500

    for u in users:
        u["admin"] = bool(u["admin"])

    return jsonify({"users": users, "trees": trees, "maintenance": maintenance}), 200


@app.route("/api/admin/users/<int:user_id>", methods=["DELETE"])
@admin_required
def admin_delete_user(user_id):
    if user_id == current_profile_id():
        return jsonify({"error": "You can't delete your own admin account here."}), 400
    try:
        with closing(get_db()) as conn:
            conn.execute("DELETE FROM profiles WHERE profile_id = ?", (user_id,))
            conn.commit()
    except sqlite3.Error as e:
        return jsonify({"error": f"Database error: {e}"}), 500
    return jsonify({"message": "User deleted."}), 200


@app.route("/api/admin/trees/<int:tree_id>", methods=["DELETE"])
@admin_required
def admin_delete_tree(tree_id):
    try:
        with closing(get_db()) as conn:
            conn.execute("DELETE FROM trees WHERE tree_id = ?", (tree_id,))
            conn.commit()
    except sqlite3.Error as e:
        return jsonify({"error": f"Database error: {e}"}), 500
    return jsonify({"message": "Tree deleted."}), 200


@app.route("/api/admin/maintenance/<int:maint_id>", methods=["DELETE"])
@admin_required
def admin_delete_maintenance(maint_id):
    try:
        with closing(get_db()) as conn:
            conn.execute("DELETE FROM maintenance WHERE maintenance_id = ?", (maint_id,))
            conn.commit()
    except sqlite3.Error as e:
        return jsonify({"error": f"Database error: {e}"}), 500
    return jsonify({"message": "Maintenance record deleted."}), 200


# ---------------------------------------------------------------------
# Boot
# ---------------------------------------------------------------------

init_db()

if __name__ == "__main__":
    debug = os.environ.get("FLASK_DEBUG") == "1"
    app.run(debug=debug)