# Setting up HomeConnect on a new business PC

For the person sitting at the new machine. No development tools are needed —
do **not** clone the repository or install Node.js.

Everything here is safe to repeat. Nothing in this guide deletes data.

---

## What you need

- The file `HomeConnect-Setup-Bundle-<version>.zip`
- PostgreSQL 18 (x64) installed, and the password chosen for the `postgres` user
- About 20 minutes

Unzip the bundle to the Desktop. It contains the installer, two PowerShell
scripts, and this checklist.

---

## 1. Check PostgreSQL is installed

Press Start, type **Services**, open it, and look for a service whose name
begins `postgresql-x64`.

- **Not there?** Install PostgreSQL 18 (x64) first. Write down the password you
  set for the `postgres` user and the port (usually 5432 or 5433).
- **There but Stopped?** Right-click it and choose Start. The setup script will
  also try to start it for you.

---

## 2. Run the setup script

Right-click **`Setup-HomeConnect.ps1`** → **Run with PowerShell**.

It will:

1. confirm PostgreSQL is running,
2. ask once for the `postgres` password (it is not shown as you type),
3. create the `homeconnect` database **if it does not already exist**,
4. generate the app's security keys,
5. write the configuration to `%APPDATA%\home-connect\config\production.env`,
6. test the connection and print a summary.

If the port is not 5433, run it with the right one:

```powershell
.\Setup-HomeConnect.ps1 -Port 5432
```

If it cannot find `psql.exe`, pass its location:

```powershell
.\Setup-HomeConnect.ps1 -PsqlPath "D:\Program Files\PostgreSQL\18\bin\psql.exe"
```

> **If a step fails**, the script prints `FAILED:` followed by `WHAT TO DO:`.
> Follow that line. If it still fails, copy the whole window and send it.

**A note on passwords containing `@`:** this used to break the connection
silently. The script now encodes it for you — nothing to do.

---

## 3. Install HomeConnect

Run `HomeConnect-Setup-<version>.exe` and follow the installer. Choose the
install folder if asked, and let it create the desktop shortcut.

---

## 4. First start

Start HomeConnect from the desktop shortcut.

- A startup window appears with a checklist. Every step should turn green.
- **If a step turns red**, the window states what happened and what to do. Use
  **Copy Diagnostics** and send the text if the fix does not work.

Then create the first **administrator** account when prompted.

---

## 5. Apply database updates

Sign in as the administrator and open **Settings → Maintenance**.

- If it says *"The database is up to date"*, you are finished.
- If updates or repairs are listed, read what each one does, type `APPLY`,
  enter your account password, and press **Apply**.

A verified backup is taken automatically before anything changes. If the backup
cannot be taken, nothing is applied — that is deliberate.

---

## Moving an existing shop to this PC

1. On the **old** PC: Settings → Backup → **Create backup now**. Copy the
   `.backup` file to a USB stick.
2. Do steps 1–4 above on the new PC.
3. On the **new** PC: Settings → Backup → **Import external backup**, choose the
   file, then **Restore**.
4. Open Settings → Maintenance and apply anything pending.

Keep the old PC untouched until the new one is confirmed working.

---

## If something goes wrong

1. Settings → Maintenance → **Export Diagnostics**. This produces a `.zip`
   containing no passwords and no customer data.
2. Send that file along with what you were doing at the time.

If the app will not start at all, use **Copy Diagnostics** on the startup window
instead.
