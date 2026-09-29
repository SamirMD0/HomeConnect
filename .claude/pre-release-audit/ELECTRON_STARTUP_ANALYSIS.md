# Electron startup investigation

## Evidence and root-cause limits

The retained installed diagnostic at `C:/Users/User/AppData/Roaming/home-connect/logs/startup-diagnostics.json` records 2026-09-26T07:56:43.995Z: development Express backend not ready within 45 seconds at 127.0.0.1:3001; backend port not listening, frontend port listening. That branch does **not spawn a backend**. It waits for an externally started dev service. `npm run dev:electron` is the supported launcher and starts/waits for services before Electron. A direct development Electron launch without its backend reproduces the missing-server condition.

This identifies the failed startup dependency in the retained incident, but does not prove why the backend was absent or why the user's second launch succeeded. No complete first-run stdout/process timeline survived. Do not claim antivirus, PostgreSQL wake-up, migration delay, or a surviving process as the historical root cause without evidence.

The audit also observed one initial compiled-process timeout before backend output, followed by successful runs after rebuilding/instrumenting. A bare Electron Node-mode probe completes in 119 ms. Later application imports/health finish in seconds. This does **not** establish a unique cause for the initial compiled stall. Reboot/cold-cache timing and Windows tracing remain open; the 45-second timeout has not been increased.

## Actual sequence

Production: single-instance lock → Electron ready/CSP/IPC → monitor → compiled entry/port checks → spawn the same executable with ELECTRON_RUN_AS_NODE=1 → load environment before imports → import application → listen loopback → health queries PostgreSQL → strict healthy/connected response → static frontend server → main window → close monitor.

Development: supported dev launcher starts external backend/Vite and waits; Electron verifies their readiness and opens main window. Electron does not own those external services.

Migrations, Prisma generation and TypeScript compilation do not run inside the production Electron boot path. Packaging/dev-launcher preparation is separate. Installed schema maintenance/setup must complete independently. Health is not a migration-consistency check.

## Changes made and why

- Append-only sanitized per-attempt startup timeline, elapsed monotonic times plus UTC; optional backend environment/import milestones. No secret values logged; JWT refresh secret redaction added. Log-write failure does not crash startup.
- Health accepts only 2xx and expected healthy/connected JSON; unrelated HTML/404 is not accepted. AbortSignal stops readiness when owned backend exits/errors. Existing DATABASE_UNAVAILABLE error fast-fails.
- Missing compiled entry/occupied backend port reported before spawning. Direct dev launch without backend reports how to start the supported launcher immediately.
- Failed attempt cleans owned frontend/backend before Retry. Retry cannot overlap a boot. Before-quit awaits cleanup, and main window is created before monitor closes to avoid window-all-closed race.
- Production CSP was observed blocking the monitor's inline script. Electron can report file responses in the header hook, contrary to its former comment. File responses retain their own monitor policy; main HTTP renderer remains script-src 'self', no unsafe-eval/inline scripts. Removed unsupported frame-ancestors from the monitor's meta policy. Regression test added.
- Loopback ports and user-data path are configurable for isolated audit instances. Default production ports remain 3001/3002.

## Completed compiled-app checks

Four-test run passed in 34.8 seconds: normal launch/restart/health/close; missing development backend; unavailable database followed by successful Retry; missing JWT early exit. Each shutdown verified owned ports closed. Startup readiness unit tests additionally cover delayed health, fatal database response, abort, wrong 404 and unrelated 200.

First process login: 8,467 ms. Restart login: 4,373 ms. These measurements include window rendering/automation and are not OS-reboot cold/warm benchmarks. Evidence: electron-compiled.json, electron-timings-compiled.json; local JSONL timelines under e2e/.runtime/electron-*/logs.

## Packaged application

Normal-port production frontend/backend and Electron main compiled successfully. Local NSIS installer/unpacked app built in 277.720 seconds with publishing disabled. Installer is unsigned; no installed application was overwritten.

First packaged test run: 3 passed / 2 failed. The first executable launch consumed a large part of the test's 90s total budget; the harness ended the process before its whole backend deadline could be observed. DB failure guidance appeared at 33.556s after boot, after the harness's 30s expectation. That timeline shows environment loaded at 1.533s and application imports complete at 28.165s: the delay in that run is before server listening, not a migration or database query. The underlying cold-load delay (disk/AV/module loading versus other scheduling) remains unproven.

Harness correction only: total scenario 150s to cover executable launch, two startup cycles and cleanup; unavailable-DB guidance wait 60s to observe the app's unchanged 45s deadline. No production deadline increase and no automatic retry hiding the first report.

Final packaged rerun: **5/5 passed in 49.5s**, including foreign-port conflict with listener preserved. Login first process 6,798 ms, restart 5,397 ms. These later launches benefited from prior execution and must not be called OS-cold benchmarks. evidence/electron.json is the final run; electron-packaged-first.json preserves the first failure. First-run traces remain under ignored e2e/.runtime/packaged-first-artifacts; final traces/screenshots under test-results-electron.

Printer availability, actual installed upgrade, OS-reboot first launch and the historical second-run explanation remain uncertified. Thus successful retry does not close the user's original first-run incident.
