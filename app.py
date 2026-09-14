import os

from flask import Flask, request, jsonify, session, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash
import mysql.connector
from mysql.connector import Error

app = Flask(__name__, static_folder="static", static_url_path="")

# Change this in production — e.g. set the SECRET_KEY environment variable.
app.secret_key = os.environ.get("SECRET_KEY", "change-this-secret-key")

# MySQL connection settings. Override with environment variables so you
# never have to hardcode real credentials in this file.
DB_CONFIG = {
    "host": os.environ.get("DB_HOST", "localhost"),
    "port": int(os.environ.get("DB_PORT", 3306)),
    "user": os.environ.get("DB_USER", "root"),
    "password": "vansh",  # TEMP: hardcoded for local testing — move back to env var later
    "database": os.environ.get("DB_NAME", "Profiles"),
}


def get_db_connection():
    # TEMP DEBUG — remove once the connection issue is fixed
    print("DB_CONFIG in use:", {**DB_CONFIG, "password": "***" if DB_CONFIG["password"] else "(EMPTY)"})
    return mysql.connector.connect(**DB_CONFIG)


# ---------------------------------------------------------------------
# Static pages
# ---------------------------------------------------------------------

@app.route("/")
def index():
    return send_from_directory(app.static_folder, "login.html")


@app.route("/<path:filename>")
def serve_page(filename):
    return send_from_directory(app.static_folder, filename)


# ---------------------------------------------------------------------
# Auth API
# ---------------------------------------------------------------------

@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify({"error": "Username and password are required."}), 400

    hashed_password = generate_password_hash(password)

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO profiles (username, password, admin) VALUES (%s, %s, %s)",
            (username, hashed_password, False),
        )
        conn.commit()
        cursor.close()
        conn.close()
    except mysql.connector.IntegrityError:
        return jsonify({"error": "That username is already taken."}), 409
    except Error as e:
        return jsonify({"error": f"Database error: {e}"}), 500

    return jsonify({"message": "Registered successfully."}), 201


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT profile_id, username, password, admin FROM profiles WHERE username = %s",
            (username,),
        )
        row = cursor.fetchone()
        cursor.close()
        conn.close()
    except Error as e:
        return jsonify({"error": f"Database error: {e}"}), 500

    if not row or not check_password_hash(row["password"], password):
        return jsonify({"error": "Invalid username or password."}), 401

    session["profile_id"] = row["profile_id"]
    session["username"] = row["username"]
    session["admin"] = bool(row["admin"])

    return jsonify(
        {
            "message": "Login successful.",
            "username": row["username"],
            "admin": bool(row["admin"]),
        }
    ), 200


@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Logged out."}), 200

    
@app.route("/api/whoami", methods=["GET"])
def whoami():
    if "username" not in session:
        return jsonify({"authenticated": False}), 200
    return jsonify(
        {
            "authenticated": True,
            "username": session["username"],
            "admin": session.get("admin", False),
        }
    ), 200


if __name__ == "__main__":
    app.run(debug=True)