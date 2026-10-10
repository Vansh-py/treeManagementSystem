# treeManagementSystem


# 🌲 Forest Dashboard

A lightweight web dashboard for tracking tree plantations and maintenance records, built with **Flask** + **SQLite** + vanilla JavaScript. No build step, no external database server, no npm — just Python and a browser.

![Python](https://img.shields.io/badge/Python-3.9%2B-blue)
![Flask](https://img.shields.io/badge/Flask-3.x-green)
![SQLite](https://img.shields.io/badge/SQLite-3-lightgrey)
![License](https://img.shields.io/badge/license-MIT-brightgreen)

---

## ✨ Features

- 🔐 **Authentication** — register, login, logout, session-based auth with hashed passwords
- 🌱 **Tree management** — add trees, view details by ID, delete your own trees
- 🛠️ **Maintenance logging** — record height, date, time and condition; tree fields auto-sync
- 📊 **Dashboard stats** — monthly/yearly tree counts with bar and line charts
- 👤 **User profile** — view account details, stats, change email/password, delete account
- 🛡️ **Admin panel** — first registered user becomes admin; delete any user, tree, or maintenance record
- 🌓 **Light / dark theme** — auto-detects system preference, persists choice
- 🍞 **Toasts + confirm modals** — no more `alert()` / `confirm()`
- 📱 **Responsive layout** — works on mobile and desktop

---

## 🖼️ Screenshots

> Add your own screenshots here. Suggested shots:
> - `docs/login.png` — login screen
> - `docs/dashboard.png` — dashboard with charts
> - `docs/tree-detail.png` — tree detail card
> - `docs/admin.png` — admin panel
> - `docs/dark-mode.png` — dark theme

---

## 🚀 Quick Start

### Requirements

- Python **3.9+**
- pip (bundled with Python)

### 1. Clone / download

```bash
git clone https://github.com/Vansh-py/treeManagementSystem.git
cd forest-dashboard
