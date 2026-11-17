# Daily report scheduler

The scheduler is a persistent, one-shot command. It does not keep a Node.js
process alive and it does not use `setInterval`, `setTimeout`, or a web-server
cron loop.

## Manual commands

```powershell
npm run daily-report:run
npm run daily-report:run -- --date=2026-11-15
npm run daily-report:run -- --date=2026-11-15 --dry-run
```

The date is the report date, not the execution date. It must be a valid past
date. Automatic mode reads the saved settings, uses the configured IANA
timezone, and exits non-zero on failure. `--dry-run` calculates the report
without inserting a report row or creating a PDF. Generated PDFs are stored in
the project-root `Generated PDFs` folder.

## Windows Task Scheduler

Create a task with these values:

1. **Trigger:** Daily, `12:15:00 AM`. Enable **Run task as soon as possible
   after a scheduled start is missed**.
2. **Program/script:** `C:\Program Files\nodejs\node.exe`
3. **Arguments:** `node_modules\tsx\dist\cli.mjs daily_data_analysis_and_notification\scripts\daily-report-run.ts`
4. **Start in:** the absolute QueryPilot-X project directory. For this
   checkout, that is
   `E:\B.Sc in SWE\9th semester\1 SE 331 Software Engineering Design Capstone Project  3  41_DS_D2  Md. Mahedi Hassan\capston damo 1\QueryPilot-X`.
5. **Working directory:** the same absolute QueryPilot-X project directory.
6. **Action logging:** redirect output to a log file by using a wrapper such as
   `scripts\daily-report-run.cmd`:

   ```bat
   @echo off
   cd /d "E:\B.Sc in SWE\9th semester\1 SE 331 Software Engineering Design Capstone Project  3  41_DS_D2  Md. Mahedi Hassan\capston damo 1\QueryPilot-X"
   call npm run daily-report:run >> ".local-data\daily-report-scheduler.log" 2>&1
   ```

   For the wrapper, use the wrapper path as **Program/script**, leave
   **Arguments** empty, and keep **Start in** set to the project directory.
7. **Conditions:** on laptops, enable **Wake the computer to run this task**
   if reports must run during sleep. Ensure the account can read/write the
   project and `.local-data` directory.

Do not configure a task automatically from this project. The first automatic
run processes only the previous completed day. Later runs use the persisted
`lastSuccessfulScheduledDate` cursor and process missing dates in chronological
order. A failed date is not skipped and remains retryable.

## Durable retry and deduplication

Migration `005_daily_report_scheduler.sql` adds the SQLite execution ledger.
An atomic transaction claims one execution key, with a lease for stale-process
recovery. The existing unique report `generation_key` prevents duplicate
history rows. A report is successful only after its PDF exists, starts with
`%PDF-`, and has its metadata saved. If a PDF fails, the next run reuses the
existing report row and retries only the PDF.

## Future hosted scheduling

For a future Vercel deployment, use a Vercel Cron request to a protected
one-shot route or command. For Render, use a Render Cron Job. Provider-native
one-shot scheduling is also suitable. The hosted scheduler and the web
application must share the same durable database and PDF storage. The local
`.local-data` SQLite file is not automatically shared by separate hosted
services. This phase does not configure hosted scheduling, Supabase, or email
delivery.
