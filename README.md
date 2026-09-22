# Rotary Club of Mutya ng Santa Maria — Attendance App

A mobile-friendly dashboard that reads the club's attendance straight from a
Google Sheet and shows, at a glance, who is complete for the month (4 credits),
who still needs credits, and who is leading the Early Bird race.

- **Google Sheet** = the editable database (the secretary keeps updating it by hand)
- **This app** = the pretty read-only view (progress rings, leaderboards, event lists)
- **GitHub** = where this code lives
- **Vercel** = where the app is published for members to open

The app updates itself automatically: edit the sheet, and within a few minutes
the app reflects it. There is nothing to "publish" after each meeting.

---

## Part 1 — One-time setup (about 30 minutes total)

### Step 1. Restructure the Google Sheet (≈ 5 min)

Your old one-grid layout can't be read reliably by software, so a script
rebuilds it into 5 clean tabs — **with all your July 2026 data already migrated**
(49 members, 13 events, all recorded attendance). Your old grid is kept as a
reference tab; nothing is deleted.

1. Open the attendance Google Sheet.
2. Menu **Extensions → Apps Script**.
3. Delete anything in the editor and paste the entire contents of
   `apps-script/setup-sheet.gs` from this project.
4. Click the **Save** (disk) icon.
5. In the dropdown at the top, choose **setupWorkbook**, then click **Run**.
6. Google will ask for permission: choose your account → **Advanced** →
   **Go to (project name)** → **Allow**. (You're authorizing your own script
   on your own sheet — this is normal.)
7. Go back to the sheet. You should now see tabs:
   **EntryPad, Settings, Members, Meetings, Attendance, EarlyBird**, plus
   **OLD July grid (reference)**. (A hidden **Lookup** tab powers the
   name dropdowns — leave it alone.)

*Already ran an earlier version of the setup?* Paste the new script over the
old one and run **upgradeEntryPad** instead — it only adds the EntryPad,
Lookup, and smarter dropdowns, without touching your data.

### Step 2. Share the sheet as read-only public (≈ 1 min)

The app reads the sheet directly from members' phones, so it must be viewable:

1. In the sheet, click **Share** (top right).
2. Under "General access", choose **Anyone with the link** → **Viewer**.
3. Done. Only people with the link can view; only you (and editors you invite)
   can edit.

### Step 3. Put the code on GitHub (≈ 10 min)

1. Create a free account at https://github.com (skip if you have one).
2. Click the **+** (top right) → **New repository**.
   - Name: `rcmsm-attendance`
   - Keep it **Public** (simplest) — the code contains no passwords or secrets.
   - Click **Create repository**.
3. On the new empty repository page, click the link
   **"uploading an existing file"**.
4. Drag **the contents of this project folder** (not the folder itself) into
   the upload box: `package.json`, `vite.config.js`, `index.html`, and the
   `src/`, `public/`, `apps-script/` folders, plus this `README.md`.
   *(Do NOT upload `node_modules` or `dist` if they exist on your computer.)*
5. Click **Commit changes**.

### Step 4. Deploy on Vercel (≈ 5 min)

1. Go to https://vercel.com and choose **Sign up → Continue with GitHub**.
2. Click **Add New… → Project**.
3. Find `rcmsm-attendance` in the list and click **Import**.
4. Vercel auto-detects **Vite**. Don't change anything. Click **Deploy**.
5. After ~1 minute you get a link like `https://rcmsm-attendance.vercel.app`.
   That's your app — share it in the club group chat!

From now on, any time you change code on GitHub, Vercel republishes
automatically. You will rarely need to touch the code, though — everyday
updates happen only in the Google Sheet.

For local verification, run `npm install`, `npx vite build`, and then
`node test/harness.cjs` from the repository root. The Apps Script harness
should finish with `ALL SCENARIOS PASS`.

---

## Part 2 — How the Google Sheet works day to day

Golden rules:

- **Dates are always typed as `YYYY-MM-DD`**, e.g. `2026-08-03`. The columns
  are pre-formatted as text so Sheets won't mangle them.
- **Never rename the 5 tabs** or their header row.
- Use the **dropdowns** — cells with dropdowns reject invalid values on purpose.
- If something is entered wrong anyway, the app's footer shows a
  **"Data check"** warning telling you the exact tab and row to fix.

### Add a new member

In the **Members** tab, add a row at the bottom:

| column | what to type |
|---|---|
| member_id | The next unused ID, e.g. `M050`. Never reuse an old ID. |
| last_name / first_name / middle_name / nickname | As usual |
| active_status | `Active` (dropdown) |
| join_date | Optional, `YYYY-MM-DD` |
| end_date / notes | Leave blank |

If a member leaves, **don't delete the row** — set `active_status` to
`Inactive` (their history stays, but they stop counting in club stats).

### Add a regular Monday meeting

In the **Meetings** tab, add a row:

| column | example |
|---|---|
| meeting_id | `20260803-REG` (date without dashes + `-REG`) |
| date | `2026-08-03` |
| meeting_type | `regular` (dropdown) |
| activity_title | `Regular Meeting` (or `Induction`, etc.) |
| location | optional |
| credit_value | `1` |

Tip: add the whole month's Mondays in advance — the app then shows members the
"next event they can attend".

### Add a makeup or special event

Same as above, but:

- meeting_id like `20260815-CLEANUP` (date + a short word, no spaces)
- meeting_type: `makeup` (or `special`)
- activity_title: e.g. `Coastal Cleanup`

For social-media makeups (profile pic, reposts…), date them the **last day of
the month they count toward**, e.g. `2026-08-31`.

### Cancel an event

In the **Meetings** tab, set the event's **status** column to `cancelled`
(dropdown). Don't delete the row. The event immediately:

- disappears from the app's upcoming lists and can't be picked on EntryPad,
- shows greyed-out with a "Cancelled" tag on the Events page,
- stops counting for or against anyone — and it lowers that month's
  requirement if it was a regular meeting (see next section).

If attendance was recorded before the cancellation, those rows are simply
ignored (the Data check reminds you they exist).

### How the monthly requirement adapts

**A month's requirement = the number of scheduled (non-cancelled) regular
meetings that month, capped at 4.** Examples:

- Normal month, 4 Mondays → members need **4** credits.
- Month with 5 Mondays → still **4** (the extra Monday just helps).
- December with only 1 meeting → members need **1** credit.
- 4 Mondays but 2 cancelled → members need **2** credits.

Credits can come from regular meetings *or* makeup activities either way. If a
month has no regular meetings entered yet, the default of 4 applies — so add
the month's Mondays to the Meetings tab at the start of each month.

### Mark projects (for the Projects leaderboard)

In the **Meetings** tab, set **is_project** to `yes` for club projects (tree
planting, medical missions, community service, etc.). The Leaders page has a
Projects board counting how many project events each member attended, this
month and this Rotary year. Social-media makeups and regular meetings are
normally left blank (= not a project).

### Record attendance after an event — use the EntryPad tab

The **EntryPad** tab shows the full roster as connected **Full name
(Last, First)**, **Nickname**, and **Member ID** columns beside each checkbox.
Use a header filter to sort the whole table without separating a member from
her attendance fields. After adding members, use **Rotary Tools → Refresh
sortable EntryPad roster**. This is the fast way to record a whole meeting
(attendance *and* Early Birds in one pass):

1. In the **yellow cell** at the top, pick the event. Type part of its title
   or date and Sheets suggests the match.
2. **Tick "Present"** beside every member who attended.
3. Choose **In-person** or **Online** for every checked member. EntryPad will
   not save until every attendee has a mode.
4. For **regular meetings and board meetings**, type the **EB rank** beside
   the first arrivals. The dropdown only offers the ranks that event has:
   normally 1–10, but **1–5 when a board meeting and a regular meeting fall
   on the same day** (5 slots each, 10 for the day). Leave it blank for
   everyone else. Other makeup/special events have no Early Bird.
5. Leave **Credit** blank to use the event's `credit_value` from Meetings
   (1 if blank). Enter a number only to override it for that attendee.
6. Tick the green **SAVE** checkbox.

The script copies everything into the Attendance and EarlyBird tabs, skips
anything already recorded (so an accidental double-save is harmless), clears
the pad, and shows a confirmation like
*"✔ Saved 23 attendance rows + 10 Early Birds for Regular Meeting"*.
There's also a menu **Rotary Tools → Save EntryPad now** if you prefer.

You never scroll through the long Attendance log — it just grows quietly in
the background as the app's data source.

The Attendance and EarlyBird tabs also keep connected **member_id**,
**member_name**, and **member_nickname** columns together. Enter an
unambiguous value in any one of those fields and the other two fill
automatically; the ID remains authoritative.

Attendance also has an **attendance_mode** dropdown with exactly two choices:
**In-person** and **Online**. Existing rows remain blank after upgrading so
they can be classified manually. Re-entering an existing member/event through
EntryPad updates that row's mode without creating duplicate attendance.

### Fixing or adding single rows by hand

You can still edit the **Attendance** and **EarlyBird** tabs directly — for a
correction, a late report, or deleting a mistaken row. Enter or select the
member ID, full name, or nickname in its matching column. The connected fields
fill automatically. If a value is ambiguous, enter the Member ID.

Early Bird rules the app enforces: rank 1 = first to arrive, one award per
row, regular and board meetings only (a "board meeting" is any makeup/special
event whose title contains the word *board*). Slots per meeting: 10, or 5 each
when a board meeting and a regular meeting share a date. Ranks above a
meeting's slot count are flagged on the Data Check page and not counted.
**Rotary Tools → Enforce Early Bird slot caps (trim extras)** deletes rows
already recorded above the cap.

### "Oops — that meeting was actually on a different date"

It happens: attendance is recorded, and only later does the admin realize the
meeting itself was entered with the wrong date (or wrong type/title). The
meeting ID (e.g. `20260721-REG`) is built from the date, so just retyping the
date used to leave the ID — and every attendance row pointing at it — stuck on
the old date. Two ways to fix it now, both safe after attendance exists:

1. **Just fix the date on the Meetings tab.** Type the correct date
   (YYYY-MM-DD) into the meeting's date cell. The script notices the ID no
   longer matches, rewrites it (keeping its suffix, e.g. `20260721-REG` →
   `20260728-REG`), and moves every matching **Attendance**, **EarlyBird**,
   and **Reports** row to the new ID. A toast confirms how many rows moved.
2. **Rotary Tools → Edit a meeting (date / type / title)…** Opens a dialog:
   pick the meeting, change its date, type, and/or title, and click Apply.
   The ID is regenerated from the new values and all connected rows follow.
   Use this when the type or title changes, since direct type/title edits on
   the tab deliberately never rename a (possibly hand-typed) ID.

Recorded attendance is never deleted or duplicated by either path — rows are
renamed in place. If the corrected date collides with an existing meeting's ID,
a number is appended (`…-REG2`) exactly like new meetings.

### Monthly routine (summary)

1. Start of month: add the month's Monday meetings to **Meetings**.
2. After each event: open **EntryPad**, pick the event, tick attendees,
   type EB ranks, tick SAVE.
3. That's it — the app recalculates everything by itself.
4. Every July 1: update `current_rotary_year_start` and
   `current_rotary_year_end` in the **Settings** tab.

### Monthly Rotary attendance report

The web app's **Report** tab and the Google Sheet's **AttendanceReport** tab
show the same four-week documentation table and an audit trail of meeting IDs,
activities, and member names behind every figure:

- Reporting weeks follow the month's scheduled, non-cancelled `regular`
  meetings in date order—not fixed calendar-day ranges.
- A month with only two regular meetings uses Week 1 and Week 2; Weeks 3 and 4
  show “Not scheduled” and are excluded from the monthly average.
- Use the optional **report_week** column on Meetings to assign any regular or
  make-up activity explicitly to Week 1–4. When a make-up has no override, it
  is assigned to the nearest scheduled regular meeting and marked “inferred”
  in the audit trail.
- Setting **status** to `cancelled` removes that meeting from the report.
- Members Present = unique Active members recorded at the assigned regular
  meeting; Valid Make-Up = unique credited Active members from assigned
  non-regular activities, excluding anyone already present that week.
- Total Attendance = Present + Valid Make-Up.
- Monthly average = total attendance divided by the number of scheduled
  reporting weeks, not automatically by four.

Change `AttendanceReport!B1` to another `YYYY-MM` month to refresh the backend
table. It also refreshes after EntryPad saves and relevant sheet edits, or from
**Rotary Tools → Refresh monthly attendance report**.

---

## Part 3 — Turn on attendance reports ("I was there" button)

On each member's page, events they missed show a red button:
**"I was there — tell the admin."** Tapping it sends a note that lands as a
row in the sheet's **Reports** tab (with timestamp, member, event, and their
optional message). You review it, fix the Attendance tab if they're right,
and set the report's status to `resolved`.

This needs a one-time, ~5-minute activation, because the public sheet is
read-only and the button must *write*:

1. Open the sheet → **Extensions → Apps Script** (the script should already
   be the latest version; if not, paste it in and run **upgradeSheet**).
2. Click **Deploy → New deployment**.
3. Click the gear icon next to "Select type" → choose **Web app**.
4. Set **Execute as: Me** and **Who has access: Anyone**. Click **Deploy**
   and authorize if asked.
5. Copy the **Web app URL** (it ends in `/exec`).
6. On GitHub, open `src/config.js`, click the pencil to edit, and paste the
   URL between the quotes of `REPORT_URL = ""`. Commit — Vercel redeploys
   automatically, and the red buttons appear.

Notes: "Execute as Me" means reports are written with *your* permission —
members never get edit access to the sheet. Until `REPORT_URL` is filled in,
the buttons stay hidden. Members can see when their report is pending
("Reported — the admin will review it"); once you fix the attendance, the
event flips to Attended.

Small maintenance point: if you later paste a **newer version of the script**,
use **Deploy → Manage deployments → (pencil) → New version** so the existing
URL keeps working — don't create a second deployment.

For an existing workbook, paste the latest script and run **upgradeSheet**.
It now adds and immediately fills the connected member columns in Attendance
and EarlyBird—there is no separate background step. If any rows still need
repair, use **Rotary Tools → Repair connected member fields**. The member ID is
authoritative; an unknown nonblank ID is preserved for review and never
silently reassigned from a name or row number.

The upgrade also creates **MemberIDContinuity**, a read-only audit comparing
the live Members tab with the original 49-member Mutya baseline. It shows each
ID's original identity, current identity, Attendance/EarlyBird usage counts,
and whether it was preserved, newly added, duplicated, missing, or changed.
Run **Rotary Tools → Audit member ID continuity** whenever membership data is
updated. Upgrades never renumber the existing Members tab.

## Part 4 — How the app calculates things

- **Member monthly credits** = sum of `credit_given` for their attendance rows
  in that month (cancelled events excluded). The requirement is dynamic: the
  number of scheduled regular meetings that month, capped at 4.
  - ≥ 4 → **Complete** (ring turns gold); above 4 shows **Exceeded · +X extra**
  - < 4 → **Needs X more**
- **Club target %** = sum of each active member's credits *capped at the
  month's requirement*, divided by (active members × requirement).
- **Total credits recorded** = raw sum including extras above 4.
- **Projects** = attended events marked `is_project = yes`, counted per month
  and per Rotary year for the Projects leaderboard.
- **Early Bird counts** = number of EarlyBird rows per member within each
  meeting's slot cap (10; 5 each when a board and a regular meeting share a
  day), shown per month and per Rotary year (July–June).
- Only **Active** members count in club stats and leaderboards; Inactive
  members can still be looked up individually.

The frontend **Events** tab has List and Calendar modes. List mode expands each
event to show attendees and absences. Calendar mode plots activities on their
scheduled dates; selecting a past date shows its activity details, attendees,
absences, and any recorded Early Birds.

The frontend Report page and backend AttendanceReport tab separate regular
meeting attendance from monthly makeup credit:

- Weekly columns show regular-meeting members on-site, online, present, and
  absent. Attendance mode is only recorded for regular meetings.
- Makeup credits earned anywhere in the same month can fill missing
  regular-meeting credits toward the monthly target. A two-credit event can fill two gaps; it is not tied to the
  nearest regular week.
- The monthly goal roster names the exact makeup meeting used by each member.
  A separate makeup table lists the meeting/date, attendees, absences, and who
  actually counts toward the goal.
- Meetings auto-sort by their date. Attendance auto-sorts by the date embedded
  in `meeting_id`, then by nickname/name/ID.

On EntryPad, nickname is immediately beside the attendance checkbox. On the
Attendance tab, the encoder-facing order is `meeting_id`, `member_nickname`,
`member_name`, `member_id`. The upgrade moves these named columns in place and
does not renumber or recreate member IDs or attendance records.

## Part 5 — Odds and ends

- **Home-screen icon:** when members use Safari's Share → "Add to Home
  Screen", the app installs with its own icon — a gold Rotary-style gear
  around a pearl ("Mutya") with a Marian star. The icon files live in
  `public/`; replace them any time to change it.
- **Demo mode:** add `?demo=1` to the app address to preview it with the
  bundled July 2026 snapshot (useful for testing without touching the sheet).
- **Refresh delay:** Google caches the public sheet feed for a few minutes.
  If an edit doesn't appear immediately, wait 2–5 minutes and reload.
- **Changing the sheet:** if you ever move to a new spreadsheet, put its ID in
  `src/config.js` on GitHub (edit the file in the browser → Commit) and Vercel
  redeploys automatically.
- **Privacy:** the sheet is view-only public. It contains names and attendance
  only — no contact details. If the club later wants it private, the app can be
  switched to a Google Apps Script JSON endpoint; ask your friendly developer
  (or Claude) to make that change.

## Project structure

```
├── index.html              page shell + fonts
├── package.json            dependencies
├── vite.config.js          build config
├── public/logo.jpg         club logo
├── apps-script/
│   └── setup-sheet.gs      one-time sheet restructuring script
└── src/
    ├── config.js           ← sheet ID lives here (only file you may edit)
    ├── main.jsx            app entry
    ├── App.jsx             layout, navigation, data loading
    ├── styles.css          all styling (Rotary azure & gold)
    ├── lib/
    │   ├── csv.js          reads the sheet's CSV feed
    │   ├── data.js         fetches the 5 tabs
    │   ├── stats.js        every calculation + data validation
    │   └── sampleData.js   demo snapshot (July 2026)
    └── components/
        ├── Dashboard.jsx   club overview
        ├── MemberPage.jsx  member lookup + gear ring
        ├── EventsPage.jsx  events & Early Bird lists
        ├── LeadersPage.jsx leaderboards
        ├── AttendanceReportPage.jsx Rotary documentation table
        ├── Ring.jsx        the progress rings
        └── Shared.jsx      pickers, chips, data check
```
