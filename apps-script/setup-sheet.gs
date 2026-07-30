/**
 * ============================================================
 *  SETUP + ENTRYPAD + REPORTS SCRIPT (v4 · Mutya)
 *  Rotary Club of Mutya ng Santa Maria — Attendance Sheet
 * ============================================================
 *
 *  TWO FUNCTIONS YOU CAN RUN:
 *
 *  ▸ setupWorkbook()  — run ONCE on a fresh, empty Google Sheet.
 *    Builds all tabs with the Mutya roster and July 2026 data
 *    preloaded, plus EntryPad, Reports, and AttendanceReport.
 *
 *  ▸ upgradeSheet()   — run this on a sheet that was set up with an
 *    earlier version. Adds anything missing (new Meetings columns,
 *    Reports tab), rebuilds EntryPad/Lookup and the dropdowns.
 *    Safe to run any time; it never touches your recorded data.
 *
 *  WHAT'S NEW IN v3
 *  ----------------
 *  1. Meetings gains two columns:
 *       status      — set to "cancelled" and the event disappears from
 *                     the app, EntryPad, and everyone's requirements.
 *                     Blank or "scheduled" = normal.
 *       is_project  — set to "yes" for club projects; the app has a
 *                     Projects leaderboard counting these.
 *     The monthly requirement is now dynamic: it equals the number of
 *     scheduled regular meetings that month, capped at 4.
 *
 *  2. Reports tab + doPost(): members can tap "I was there — tell the
 *     admin" in the app when an event is wrongly marked missed. Each
 *     tap becomes a row here (status: new → reviewed → resolved).
 *     TO ACTIVATE: Deploy → New deployment → type "Web app" →
 *     Execute as: Me · Who has access: Anyone → Deploy → copy the
 *     Web app URL → paste it into REPORT_URL in the app's
 *     src/config.js. Full steps are in the README.
 *
 *  (v2 features kept: EntryPad fast recording, searchable name
 *  dropdowns, auto-expanding rows, duplicate protection.)
 *
 *  HOW TO INSTALL
 *  --------------
 *  1. Open the Google Sheet → Extensions → Apps Script.
 *  2. Replace everything in the editor with this whole file. Save.
 *  3. Run setupWorkbook (fresh) or upgradeSheet (existing), authorize
 *     when asked (your account → Advanced → Go to … → Allow).
 */

// ================================================================
//  MENU + SAVE TRIGGER
// ================================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Rotary Tools")
    .addItem("Save EntryPad now", "saveEntryPad")
    .addItem("Clear EntryPad (without saving)", "clearEntryPad")
    .addItem("Refresh sortable EntryPad roster", "refreshEntryPadRoster")
    .addItem("Repair connected member fields", "repairConnectedMemberFields")
    .addItem("Audit member ID continuity", "auditMemberIdContinuity")
    .addItem("Refresh monthly attendance report", "refreshAttendanceReport")
    .addItem("Upgrade sheet to latest version", "upgradeSheet")
    .addToUi();
}

// ================================================================
//  ATTENDANCE REPORTS ("I was there" button in the app)
//  The app POSTs here when a member says an event was wrongly
//  marked as missed. Each report becomes a row in the Reports tab.
//  To activate: Deploy → New deployment → Web app →
//  Execute as: Me · Who has access: Anyone → copy the URL into
//  src/config.js (REPORT_URL) in the app code.
// ================================================================

function doPost(e) {
  var out = { ok: false };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName("Reports");
    if (!sh) throw new Error("Reports tab missing — run upgradeSheet.");
    var data = {};
    try { data = JSON.parse(e.postData.contents); } catch (ignored) {}
    var clean = function (v) { return String(v || "").slice(0, 300); };
    var when = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm");
    sh.appendRow([
      when,
      clean(data.member_id),
      clean(data.member_name),
      clean(data.meeting_id),
      clean(data.event_title),
      clean(data.message),
      "new",
    ]);
    out.ok = true;
  } catch (err) {
    out.error = String(err.message || err);
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function onEdit(e) {
  // Fires on every edit: EntryPad SAVE checkbox, and auto meeting IDs.
  try {
    if (!e || !e.range) return;
    var sh = e.range.getSheet();
    var name = sh.getName();
    if (name === "AttendanceReport" && e.range.getA1Notation() === "B1") {
      refreshAttendanceReport();
      return;
    }
    // keep data tabs ahead of their data as they're edited by hand
    if (name === "Meetings" || name === "Attendance" ||
        name === "EarlyBird" || name === "Members" || name === "Reports") {
      ensureSheetCapacity_(sh);
    }
    if (name === "Attendance" || name === "EarlyBird") {
      syncMemberFieldsForEdit_(e);
    }
    if (name === "Attendance" || name === "Members") {
      refreshAttendanceReport();
    }
    if (name === "Members") {
      // Keep the columns present, but do not rewrite the entire attendance
      // history inside a 30-second simple trigger.
      ensureMemberColumns_(e.source);
    }
    if (name === "Meetings") {
      autoMeetingIds_(sh, e.range);
      refreshAttendanceReport();
      return;
    }
    if (name !== "EntryPad") return;
    if (e.range.getA1Notation() !== "B2") return;
    if (e.value !== "TRUE" && e.value !== true) return;
    saveEntryPad();
  } catch (err) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ss.toast("Save failed: " + err.message, "Rotary Tools", 8);
  }
}

// ================================================================
//  AUTO MEETING IDs
//  Fill in date, meeting_type, and activity_title on the Meetings
//  tab and the meeting_id (column A) writes itself:
//    regular            → 20260714-REG
//    makeup/special     → 20260815-COASTAL  (first useful word of the
//                          title, letters/digits only, max 10 chars)
//  If that ID is already taken, a number is appended (…-REG2).
//  You can still type an ID by hand — the script never overwrites
//  a non-empty meeting_id cell.
// ================================================================

function autoMeetingIds_(sh, editedRange) {
  var firstRow = Math.max(editedRange.getRow(), 2);
  var lastRow = editedRange.getLastRow();
  if (lastRow < 2) return;
  var n = lastRow - firstRow + 1;
  var block = sh.getRange(firstRow, 1, n, 4).getValues(); // id, date, type, title

  // all existing ids (for uniqueness)
  var lastDataRow = sh.getLastRow();
  var existing = {};
  if (lastDataRow >= 2) {
    sh.getRange(2, 1, lastDataRow - 1, 1).getValues().forEach(function (r) {
      var v = String(r[0]).trim();
      if (v) existing[v.toUpperCase()] = true;
    });
  }

  var updates = 0;
  for (var i = 0; i < n; i++) {
    if (String(block[i][0]).trim() !== "") continue; // ID already there
    var date = normDate_(block[i][1]);
    var type = String(block[i][2] || "").trim().toLowerCase();
    var title = String(block[i][3] || "").trim();
    if (!date || !type) continue;
    if (type !== "regular" && !title) continue; // makeups need a title first
    var suffix = type === "regular" ? "REG" : suffixFromTitle_(title, type);
    var base = date.replace(/-/g, "") + "-" + suffix;
    var id = base;
    var k = 2;
    while (existing[id.toUpperCase()]) { id = base + k; k++; }
    existing[id.toUpperCase()] = true;
    sh.getRange(firstRow + i, 1).setValue(id);
    updates++;
  }
  if (updates > 0) {
    SpreadsheetApp.getActiveSpreadsheet()
      .toast("meeting_id filled in automatically for " + updates + " row" +
             (updates === 1 ? "" : "s") + ".", "Meetings", 5);
  }
}

function normDate_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v,
      SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), "yyyy-MM-dd");
  }
  var s = String(v || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function suffixFromTitle_(title, type) {
  var words = title.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/)
    .filter(function (w) { return w; });
  var skip = { THE: 1, A: 1, AN: 1, OF: 1, AND: 1, FOR: 1, TO: 1, IN: 1, ON: 1, WITH: 1 };
  var pick = "";
  for (var i = 0; i < words.length; i++) {
    if (!skip[words[i]] && words[i].length >= 3) { pick = words[i]; break; }
  }
  if (!pick) pick = words[0] || type.toUpperCase();
  return pick.slice(0, 10);
}

// ================================================================
//  ENTRYPAD: SAVE
// ================================================================

var PAD_FIRST_ROW = 5;
var PAD_LAST_ROW = 154; // room for 150 members

function saveEntryPad() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pad = ss.getSheetByName("EntryPad");
  if (!pad) throw new Error("EntryPad tab not found. Run upgradeEntryPad first.");
  var status = pad.getRange("C2");

  // 1. Which event?
  var eventLabel = String(pad.getRange("B1").getValue() || "");
  var meetingId = extractMeetingId_(eventLabel);
  if (!meetingId) {
    finishPad_(pad, status, "⚠ Pick an event in the yellow cell first — nothing was saved.");
    return;
  }
  var meeting = findMeeting_(ss, meetingId);
  if (!meeting) {
    finishPad_(pad, status, "⚠ Event \"" + meetingId + "\" is not in the Meetings tab — nothing was saved.");
    return;
  }
  if (meeting.cancelled) {
    finishPad_(pad, status, "⚠ \"" + meeting.title + "\" is marked cancelled — nothing was saved.");
    return;
  }
  var isRegular = String(meeting.type).toLowerCase() === "regular";

  // 2. Read the pad rows.
  var n = PAD_LAST_ROW - PAD_FIRST_ROW + 1;
  var values = pad.getRange(PAD_FIRST_ROW, 1, n, 7).getValues();
  // Present, Full name (last first), Nickname, Member ID, EB, Credit, Notes

  // 3. What already exists (to skip duplicates)?
  ensureMemberColumns_(ss);
  var att = ss.getSheetByName("Attendance");
  var eb = ss.getSheetByName("EarlyBird");
  var memberIndex = buildMemberIndex_(ss);
  var existingPairs = existingPairs_(att, 1, 2);          // meeting|member
  var existingEB = existingPairs_(eb, 1, 3);              // meeting|member
  var existingRanks = existingMeetingValues_(eb, 1, 2);   // meeting|rank

  var attRows = [], ebRows = [];
  var skippedDup = 0, skippedBad = 0, ebIgnored = 0;

  for (var i = 0; i < values.length; i++) {
    var present = values[i][0] === true;
    var memberId = String(values[i][3] || "").trim();
    var ebRank = String(values[i][4] || "").trim();
    var credit = String(values[i][5] || "").trim();
    var notes = String(values[i][6] || "").trim();
    if (!present) {
      if (ebRank) ebIgnored++; // rank typed but not marked present
      continue;
    }
    var member = memberForRef_(memberIndex, memberId);
    if (!member) { skippedBad++; continue; }
    memberId = member.id;

    var pairKey = meetingId + "|" + memberId;
    if (existingPairs[pairKey]) {
      skippedDup++;
    } else {
      attRows.push([
        meetingId,
        memberId,
        member.name,
        member.nickname,
        credit === "" ? "1" : credit,
        notes
      ]);
      existingPairs[pairKey] = true;
    }

    if (ebRank !== "") {
      if (!isRegular) {
        ebIgnored++;
      } else if (existingEB[pairKey] || existingRanks[meetingId + "|" + ebRank]) {
        ebIgnored++;
      } else {
        ebRows.push([meetingId, ebRank, memberId, member.name, member.nickname, ""]);
        existingEB[pairKey] = true;
        existingRanks[meetingId + "|" + ebRank] = true;
      }
    }
  }

  // 4. Append (growing the sheets first if they're near their row limit).
  if (attRows.length > 0) {
    ensureRows_(att, attRows.length);
    att.getRange(att.getLastRow() + 1, 1, attRows.length, 6).setValues(attRows);
  }
  if (ebRows.length > 0) {
    ensureRows_(eb, ebRows.length);
    eb.getRange(eb.getLastRow() + 1, 1, ebRows.length, 6).setValues(ebRows);
  }

  // 4b. Keep every tab comfortably ahead of its data.
  ensureCapacity_(ss);
  refreshAttendanceReport();

  // 5. Clear the pad + report.
  clearPadRows_(pad);
  var when = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "MMM d, HH:mm");
  var msg = "✔ Saved " + attRows.length + " attendance row" + (attRows.length === 1 ? "" : "s");
  if (ebRows.length > 0) msg += " + " + ebRows.length + " Early Bird" + (ebRows.length === 1 ? "" : "s");
  msg += " for " + meeting.title + " (" + when + ").";
  if (skippedDup > 0) msg += " Skipped " + skippedDup + " already recorded.";
  if (ebIgnored > 0) msg += " Ignored " + ebIgnored + " EB rank" + (ebIgnored === 1 ? "" : "s") +
    (isRegular ? " (not marked present or rank already taken)." : " (event is not a regular meeting).");
  if (skippedBad > 0) msg += " " + skippedBad + " row(s) had an unreadable member label.";
  finishPad_(pad, status, msg);
}

function clearEntryPad() {
  var pad = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("EntryPad");
  if (!pad) return;
  clearPadRows_(pad);
  finishPad_(pad, pad.getRange("C2"), "EntryPad cleared — nothing was saved.");
}

// ---- capacity management ----
// Google Sheets tabs start with 1,000 rows and DO NOT grow by themselves
// when you type in the last row. These helpers keep every data tab at
// least 200 rows ahead of its data, growing in 500-row chunks. New rows
// inherit the dropdowns and formatting of the row above them, so nothing
// breaks as the sheet grows over the years. The Attendance tab is the
// fast-growing one (~400+ rows per month for this club), so it is topped
// up on every EntryPad save; the others are topped up whenever they are
// edited and whenever upgradeSheet runs.

var CAPACITY_CUSHION = 200;
var CAPACITY_CHUNK = 500;

function ensureSheetCapacity_(sh) {
  if (!sh) return;
  var free = sh.getMaxRows() - sh.getLastRow();
  if (free < CAPACITY_CUSHION) {
    sh.insertRowsAfter(sh.getMaxRows(), CAPACITY_CHUNK);
  }
}

function ensureCapacity_(ss) {
  ["Members", "Meetings", "Attendance", "EarlyBird", "Reports", "Lookup", "AttendanceReport"]
    .forEach(function (name) { ensureSheetCapacity_(ss.getSheetByName(name)); });
}

// ---- save helpers ----

function ensureRows_(sheet, extraRowsNeeded) {
  // Google Sheets tabs have a fixed number of rows (1000 by default).
  // Before appending, make sure there's room — and add a 200-row cushion
  // so we don't do this on every save. New rows inherit the dropdowns
  // and formatting from the rows above them.
  var needed = sheet.getLastRow() + extraRowsNeeded;
  var max = sheet.getMaxRows();
  if (needed >= max) {
    sheet.insertRowsAfter(max, needed - max + 200);
  }
}

function finishPad_(pad, statusCell, message) {
  pad.getRange("B2").setValue(false); // uncheck SAVE
  statusCell.setValue(message);
  SpreadsheetApp.getActiveSpreadsheet().toast(message, "EntryPad", 8);
}

function clearPadRows_(pad) {
  var n = PAD_LAST_ROW - PAD_FIRST_ROW + 1;
  var falses = [];
  for (var i = 0; i < n; i++) falses.push([false]);
  pad.getRange(PAD_FIRST_ROW, 1, n, 1).setValues(falses); // untick Present
  pad.getRange(PAD_FIRST_ROW, 5, n, 3).clearContent();    // EB, Credit, Notes
}

function extractMemberId_(text) {
  var m = String(text).match(/M\d{3,}/i);
  return m ? m[0].toUpperCase() : null;
}

function extractMeetingId_(text) {
  var m = String(text).match(/\d{8}-[A-Za-z0-9]+/);
  return m ? m[0] : null;
}

function findMeeting_(ss, meetingId) {
  var sh = ss.getSheetByName("Meetings");
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h).trim().toLowerCase();
  });
  var statusIdx = headers.indexOf("status"); // may be -1 on old sheets
  var data = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), lastCol).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]) === meetingId) {
      return {
        id: meetingId,
        date: data[i][1],
        type: data[i][2],
        title: data[i][3],
        cancelled: statusIdx >= 0 &&
          String(data[i][statusIdx]).trim().toLowerCase() === "cancelled",
      };
    }
  }
  return null;
}

function existingPairs_(sheet, colA, colB) {
  var out = {};
  var last = sheet.getLastRow();
  if (last < 2) return out;
  var data = sheet.getRange(2, 1, last - 1, Math.max(colA, colB)).getValues();
  for (var i = 0; i < data.length; i++) {
    var a = extractMeetingId_(data[i][colA - 1]) || String(data[i][colA - 1]).trim();
    var b = extractMemberId_(data[i][colB - 1]) || String(data[i][colB - 1]).trim();
    if (a && b) out[a + "|" + b] = true;
  }
  return out;
}

function existingMeetingValues_(sheet, meetingCol, valueCol) {
  var out = {};
  var last = sheet.getLastRow();
  if (last < 2) return out;
  var data = sheet.getRange(2, 1, last - 1, Math.max(meetingCol, valueCol)).getValues();
  for (var i = 0; i < data.length; i++) {
    var a = extractMeetingId_(data[i][meetingCol - 1]) || String(data[i][meetingCol - 1]).trim();
    var v = String(data[i][valueCol - 1]).trim();
    if (a && v) out[a + "|" + v] = true;
  }
  return out;
}

// ================================================================
//  LOOKUP + ENTRYPAD + SMART DROPDOWNS (v2 upgrade)
// ================================================================

function upgradeSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ["Members", "Meetings", "Attendance", "EarlyBird"].forEach(function (name) {
    if (!ss.getSheetByName(name)) {
      throw new Error('Tab "' + name + '" is missing. Run setupWorkbook first.');
    }
  });
  ensureMeetingsColumns_(ss);
  ensureMemberColumns_(ss);
  ensureReportsTab_(ss);
  ensureAttendanceReportTab_(ss);
  var addedSettings = ensureSettings_(ss);
  // refresh dropdowns that were previously only set at first setup:
  dropdown_(ss.getSheetByName("EarlyBird"), 2, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]); // rank
  dropdown_(ss.getSheetByName("Members"), 6, ["Active", "Inactive", "Honorary"]);
  buildLookup_(ss);
  buildEntryPad_(ss);
  applySmartValidations_(ss);
  var repair = repairConnectedMemberFields_(ss);
  var audit = auditMemberIdContinuity_(ss);
  ensureCapacity_(ss);
  refreshAttendanceReport();
  SpreadsheetApp.flush();
  ss.toast(
    "Sheet upgrade complete. Filled " + repair.filled +
      " connected member row(s); " + repair.unresolved + " unresolved. " +
      "ID continuity: " + audit.preserved + " preserved, " +
      audit.review + " to review." +
      (addedSettings.length > 0
        ? " Added Settings: " + addedSettings.join(", ") + "."
        : ""),
    "Rotary Tools",
    10
  );
}

// kept for anyone following older instructions
function upgradeEntryPad() { upgradeSheet(); }

var MEMBER_NAME_BACKFILL_KEY = "member_name_backfill_state_v1";
var MEMBER_NAME_BACKFILL_BATCH = 250;

// Starts a resumable migration for the three connected member columns. The
// first small batch runs now; one-shot triggers continue in the background.
// No individual execution rewrites more than MEMBER_NAME_BACKFILL_BATCH rows.
function upgradeMemberNameColumns() {
  repairConnectedMemberFields();
}

// Repairs both tabs immediately. member_id is authoritative: existing IDs are
// never renumbered from row order, and unresolved/ambiguous values are left
// untouched for review instead of being guessed.
function repairConnectedMemberFields() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ["Members", "Attendance", "EarlyBird"].forEach(function (name) {
    if (!ss.getSheetByName(name)) {
      throw new Error('Tab "' + name + '" is missing. Run setupWorkbook first.');
    }
  });
  ensureMemberColumns_(ss);
  buildLookup_(ss);
  applySmartValidations_(ss);
  clearMemberNameBackfillTriggers_();
  PropertiesService.getDocumentProperties().deleteProperty(MEMBER_NAME_BACKFILL_KEY);
  var result = repairConnectedMemberFields_(ss);
  var audit = auditMemberIdContinuity_(ss);
  refreshAttendanceReport();
  var message =
    "Connected fields repaired: " + result.filled + " row(s) filled, " +
    result.alreadyCorrect + " already correct, " + result.unresolved +
    " unresolved. ID audit: " + audit.preserved + " preserved, " +
    audit.review + " to review.";
  ss.toast(message, "Rotary Tools", 12);
  return result;
}

function repairConnectedMemberFields_(ss) {
  ensureMemberColumns_(ss);
  var totals = { filled: 0, alreadyCorrect: 0, unresolved: 0 };
  ["Attendance", "EarlyBird"].forEach(function (sheetName) {
    var sh = ss.getSheetByName(sheetName);
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
      .map(function (h) { return String(h).trim().toLowerCase(); });
    var idCol = headers.indexOf("member_id") + 1;
    var stats = backfillMemberFields_(ss, sh, idCol);
    totals.filled += stats.filled;
    totals.alreadyCorrect += stats.alreadyCorrect;
    totals.unresolved += stats.unresolved;
  });
  SpreadsheetApp.flush();
  return totals;
}

function auditMemberIdContinuity() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = auditMemberIdContinuity_(ss);
  ss.toast(
    "ID continuity audit complete: " + result.preserved + " preserved, " +
      result.newIds + " new, " + result.review + " to review. See MemberIDContinuity.",
    "Rotary Tools",
    12
  );
  return result;
}

function continueMemberNameBackfill_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    var props = PropertiesService.getDocumentProperties();
    var raw = props.getProperty(MEMBER_NAME_BACKFILL_KEY);
    if (!raw) return;

    var state = JSON.parse(raw);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetNames = ["Attendance", "EarlyBird"];
    ensureMemberColumns_(ss);

    while (state.sheetIndex < sheetNames.length) {
      var sh = ss.getSheetByName(sheetNames[state.sheetIndex]);
      var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
        .map(function (h) { return String(h).trim().toLowerCase(); });
      var idCol = headers.indexOf("member_id") + 1;
      var nameCol = headers.indexOf("member_name") + 1;
      var nicknameCol = headers.indexOf("member_nickname") + 1;
      var lastRow = sh.getLastRow();

      if (state.nextRow > lastRow) {
        state.sheetIndex++;
        state.nextRow = 2;
        continue;
      }

      var count = Math.min(MEMBER_NAME_BACKFILL_BATCH, lastRow - state.nextRow + 1);
      var index = buildMemberIndex_(ss);
      var refs = sh.getRange(state.nextRow, idCol, count, 1).getValues();
      var fields = refs.map(function (row) {
        var member = memberForRef_(index, row[0]);
        return member
          ? [member.id, member.name, member.nickname]
          : [String(row[0] || "").trim(), "", ""];
      });
      sh.getRange(state.nextRow, idCol, count, 3).setValues(fields);
      state.nextRow += count;
      state.updated += count;
      props.setProperty(MEMBER_NAME_BACKFILL_KEY, JSON.stringify(state));
      ss.toast(
        "Backfilled " + state.updated + " rows so far. Continuing automatically…",
        "Rotary Tools",
        5
      );
      scheduleMemberNameBackfill_();
      return;
    }

    props.deleteProperty(MEMBER_NAME_BACKFILL_KEY);
    clearMemberNameBackfillTriggers_();
    ss.toast(
      "Connected member-field backfill complete: " + state.updated + " rows checked.",
      "Rotary Tools",
      10
    );
  } finally {
    lock.releaseLock();
  }
}

function scheduleMemberNameBackfill_() {
  ScriptApp.newTrigger("continueMemberNameBackfill_")
    .timeBased()
    .after(15000)
    .create();
}

function clearMemberNameBackfillTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "continueMemberNameBackfill_") {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function ensureMeetingsColumns_(ss) {
  var sh = ss.getSheetByName("Meetings");
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return String(h).trim().toLowerCase();
  });
  var col;

  // status column: blank or "scheduled" = happening; "cancelled" = doesn't count
  col = headers.indexOf("status") + 1;
  if (col === 0) {
    col = lastCol + 1;
    sh.getRange(1, col).setValue("status")
      .setFontWeight("bold").setBackground("#17458F").setFontColor("#FFFFFF");
    lastCol = col;
  }
  dropdownAllowBlank_(sh, col, ["scheduled", "cancelled"]);
  var statusCol = col;

  // is_project column: yes = counts on the Projects leaderboard
  var headers2 = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) {
    return String(h).trim().toLowerCase();
  });
  col = headers2.indexOf("is_project") + 1;
  if (col === 0) {
    col = sh.getLastColumn() + 1;
    sh.getRange(1, col).setValue("is_project")
      .setFontWeight("bold").setBackground("#17458F").setFontColor("#FFFFFF");
  }
  dropdownAllowBlank_(sh, col, ["yes", "no"]);

  // report_week: optional override for the four-column Rotary report.
  // Regular meetings are assigned in date order when this is blank.
  var headers3 = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) {
    return String(h).trim().toLowerCase();
  });
  col = headers3.indexOf("report_week") + 1;
  if (col === 0) {
    col = sh.getLastColumn() + 1;
    sh.getRange(1, col).setValue("report_week")
      .setFontWeight("bold").setBackground("#17458F").setFontColor("#FFFFFF");
  }
  dropdownAllowBlank_(sh, col, ["1", "2", "3", "4"]);
  sh.setColumnWidth(col, 105);

  return statusCol;
}

// Keeps three connected member fields together in each attendance data tab:
// member_id, member_name (LAST, FIRST MIDDLE), member_nickname.
function ensureMemberColumns_(ss) {
  ["Attendance", "EarlyBird"].forEach(function (sheetName) {
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return;
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
      .map(function (h) { return String(h).trim().toLowerCase(); });
    var idCol = headers.indexOf("member_id") + 1;
    if (!idCol) return;
    var changed = false;

    // Migrate the short-lived surname-only version in place.
    if (headers[idCol] === "member_last_name") {
      sh.getRange(1, idCol + 1).setValue("member_name");
      headers[idCol] = "member_name";
      changed = true;
    }
    if (headers[idCol] !== "member_name") {
      sh.insertColumnAfter(idCol);
      headers.splice(idCol, 0, "member_name");
      changed = true;
    }
    if (headers[idCol + 1] !== "member_nickname") {
      sh.insertColumnAfter(idCol + 1);
      changed = true;
    }

    sh.getRange(1, idCol + 1, 1, 2)
      .setValues([["member_name", "member_nickname"]])
      .setFontWeight("bold").setBackground("#17458F").setFontColor("#FFFFFF");
    // Inserted columns can inherit the member-ID dropdown, which causes
    // "input must fall within specified range" on valid names.
    if (changed) {
      var validationRows = Math.min(
        sh.getMaxRows() - 1,
        Math.max(sh.getLastRow() - 1 + CAPACITY_CUSHION, CAPACITY_CUSHION)
      );
      sh.getRange(2, idCol + 1, validationRows, 2).clearDataValidations();
    }
    sh.setColumnWidth(idCol + 1, 180);
    sh.setColumnWidth(idCol + 2, 140);
  });
}

function buildMemberIndex_(ss) {
  var sh = ss.getSheetByName("Members");
  var out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim().toLowerCase(); });
  var idIdx = headers.indexOf("member_id");
  var firstIdx = headers.indexOf("first_name");
  var lastIdx = headers.indexOf("last_name");
  var nickIdx = headers.indexOf("nickname");
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();

  function add(ref, member) {
    var key = String(ref || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!key) return;
    if (!Object.prototype.hasOwnProperty.call(out, key)) {
      out[key] = member;
    } else if (out[key] && out[key].id !== member.id) {
      out[key] = null;
    }
  }

  rows.forEach(function (row) {
    var id = String(row[idIdx] || "").trim();
    if (!id) return;
    var first = String(row[firstIdx] || "").trim();
    var last = String(row[lastIdx] || "").trim();
    var nickname = String(row[nickIdx] || "").trim();
    var middleIdx = headers.indexOf("middle_name");
    var middle = middleIdx >= 0 ? String(row[middleIdx] || "").trim() : "";
    var full = [first, middle, last].filter(String).join(" ");
    var name = (last ? last + ", " : "") + [first, middle].filter(String).join(" ");
    var member = {
      id: id, first: first, middle: middle, last: last,
      nickname: nickname, full: full, name: name
    };
    add(id, member);
    add(nickname, member);
    add(last, member);
    add(name, member);
    add(full, member);
    add(last + " " + first, member);
    add(last + ", " + first, member);
  });
  return out;
}

function memberForRef_(index, ref) {
  var raw = String(ref || "").trim();
  if (!raw) return null;
  var id = extractMemberId_(raw);
  var key = String(id || raw).trim().toLowerCase().replace(/\s+/g, " ");
  return index[key] || null;
}

function backfillMemberFields_(ss, sh, idCol) {
  var lastRow = sh.getLastRow();
  var stats = { filled: 0, alreadyCorrect: 0, unresolved: 0 };
  if (lastRow < 2) return stats;
  var index = buildMemberIndex_(ss);
  var existing = sh.getRange(2, idCol, lastRow - 1, 3).getValues();
  var fields = existing.map(function (row) {
    var rawId = String(row[0] || "").trim();
    var member = memberForRef_(index, rawId);
    // Only fall back to name/nickname when the ID cell is blank. A nonblank,
    // unknown ID is preserved for review rather than silently reassigned.
    if (!member && !rawId) {
      member = memberForRef_(index, row[1]) || memberForRef_(index, row[2]);
    }
    if (!member) {
      if (rawId || row[1] || row[2]) stats.unresolved++;
      return row;
    }
    var connected = [member.id, member.name, member.nickname];
    if (String(row[0]) === connected[0] &&
        String(row[1]) === connected[1] &&
        String(row[2]) === connected[2]) {
      stats.alreadyCorrect++;
    } else {
      stats.filled++;
    }
    return connected;
  });
  sh.getRange(2, idCol, fields.length, 3).setValues(fields);
  return stats;
}

function syncMemberFieldsForEdit_(e) {
  var sh = e.range.getSheet();
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim().toLowerCase(); });
  var idCol = headers.indexOf("member_id") + 1;
  var nameCol = headers.indexOf("member_name") + 1;
  var nicknameCol = headers.indexOf("member_nickname") + 1;
  if (!idCol || nameCol !== idCol + 1 || nicknameCol !== idCol + 2) return;
  if (e.range.getColumn() > nicknameCol || e.range.getLastColumn() < idCol) return;
  var firstRow = Math.max(2, e.range.getRow());
  var lastRow = e.range.getLastRow();
  if (lastRow < firstRow) return;
  var index = buildMemberIndex_(e.source);
  var rows = sh.getRange(firstRow, idCol, lastRow - firstRow + 1, 3).getValues();
  var editedStart = e.range.getColumn();
  var editedEnd = e.range.getLastColumn();
  var unresolved = 0;
  var connected = rows.map(function (row) {
    var refs = [];
    if (editedStart <= idCol && editedEnd >= idCol) refs.push(row[0]);
    if (editedStart <= nameCol && editedEnd >= nameCol) refs.push(row[1]);
    if (editedStart <= nicknameCol && editedEnd >= nicknameCol) refs.push(row[2]);
    var nonblankEdited = refs.filter(function (value) {
      return String(value || "").trim() !== "";
    });
    var ref = nonblankEdited[0];
    // Clearing just one connected cell should restore it from the other two.
    // Clearing all three cells together intentionally removes the association.
    if (ref === undefined) {
      var remaining = row.filter(function (value) {
        return String(value || "").trim() !== "";
      });
      if (remaining.length === 0) return row;
      ref = remaining[0];
    }
    var member = memberForRef_(index, ref);
    if (!member) {
      unresolved++;
      return row;
    }
    return [member.id, member.name, member.nickname];
  });
  sh.getRange(firstRow, idCol, connected.length, 3).setValues(connected);
  if (unresolved > 0) {
    e.source.toast(
      unresolved + " member value(s) were ambiguous or not found. Enter the Member ID.",
      "Rotary Tools",
      8
    );
  }
}

// Produces a read-only audit trail against the original 49-member Mutya
// baseline embedded in this script. It never changes IDs or member records.
function auditMemberIdContinuity_(ss) {
  function clean(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }
  function identity(last, first, middle, nickname) {
    var name = (clean(last) ? clean(last) + ", " : "") +
      [clean(first), clean(middle)].filter(String).join(" ");
    return name + (clean(nickname) ? " (" + clean(nickname) + ")" : "");
  }
  function comparisonKey(last, first) {
    return (clean(last) + "|" + clean(first)).toUpperCase();
  }
  function referenceCounts(sheetName) {
    var counts = {};
    tableObjects_(ss.getSheetByName(sheetName)).forEach(function (row) {
      var raw = clean(row.member_id);
      var id = extractMemberId_(raw) || raw;
      if (id) counts[id] = (counts[id] || 0) + 1;
    });
    return counts;
  }

  var baseline = {};
  MEMBERS_.forEach(function (member) {
    baseline[member[0]] = {
      identity: identity(member[1], member[2], member[3], member[4]),
      key: comparisonKey(member[1], member[2])
    };
  });

  var currentById = {};
  var blankIdRows = 0;
  tableObjects_(ss.getSheetByName("Members")).forEach(function (member) {
    var id = clean(member.member_id);
    if (!id) {
      blankIdRows++;
      return;
    }
    if (!currentById[id]) currentById[id] = [];
    currentById[id].push({
      identity: identity(
        member.last_name, member.first_name, member.middle_name, member.nickname
      ),
      key: comparisonKey(member.last_name, member.first_name)
    });
  });

  var attendanceCounts = referenceCounts("Attendance");
  var earlyBirdCounts = referenceCounts("EarlyBird");
  var ids = Object.keys(baseline).concat(Object.keys(currentById))
    .filter(function (id, index, all) { return all.indexOf(id) === index; })
    .sort();
  var rows = [];
  var result = { preserved: 0, newIds: 0, review: 0 };

  ids.forEach(function (id) {
    var oldMember = baseline[id];
    var current = currentById[id] || [];
    var status;
    var currentIdentity = current.map(function (member) {
      return member.identity;
    }).join(" | ");

    if (current.length > 1) {
      status = "DUPLICATE ID — REVIEW";
      result.review++;
    } else if (!oldMember) {
      status = "NEW ID (after original baseline)";
      result.newIds++;
    } else if (current.length === 0) {
      status = "ORIGINAL ID MISSING — REVIEW";
      result.review++;
    } else if (oldMember.key !== current[0].key) {
      status = "ID PRESENT; MEMBER NAME CHANGED — REVIEW";
      result.review++;
    } else {
      status = "PRESERVED";
      result.preserved++;
    }
    rows.push([
      id,
      oldMember ? oldMember.identity : "",
      currentIdentity,
      status,
      attendanceCounts[id] || 0,
      earlyBirdCounts[id] || 0
    ]);
  });

  Object.keys(attendanceCounts).concat(Object.keys(earlyBirdCounts))
    .filter(function (id, index, all) {
      return all.indexOf(id) === index && !currentById[id];
    })
    .sort()
    .forEach(function (id) {
      if (baseline[id]) return; // already represented as an original missing ID
      rows.push([
        id, "", "", "DATA ROW REFERENCES ID MISSING FROM MEMBERS — REVIEW",
        attendanceCounts[id] || 0, earlyBirdCounts[id] || 0
      ]);
      result.review++;
    });

  if (blankIdRows > 0) {
    rows.push([
      "(blank)", "", "", blankIdRows + " Members row(s) have no ID — REVIEW", 0, 0
    ]);
    result.review += blankIdRows;
  }

  var sh = ss.getSheetByName("MemberIDContinuity") || ss.insertSheet("MemberIDContinuity");
  if (sh.getFilter()) sh.getFilter().remove();
  sh.clear();
  writeTable_(sh, [
    "member_id", "original_baseline_identity", "current_identity",
    "continuity_status", "attendance_rows", "earlybird_rows"
  ], rows);
  sh.getRange(1, 1, 1, 6).setNote(
    "Generated " + Utilities.formatDate(
      new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm"
    ) + ". This audit never edits member IDs."
  );
  sh.setColumnWidth(1, 95);
  sh.setColumnWidth(2, 260);
  sh.setColumnWidth(3, 260);
  sh.setColumnWidth(4, 310);
  sh.setColumnWidths(5, 2, 110);
  if (rows.length > 0) {
    sh.getRange(1, 1, rows.length + 1, 6).createFilter();
    var statuses = sh.getRange(2, 4, rows.length, 1).getValues();
    statuses.forEach(function (row, index) {
      var color = row[0] === "PRESERVED" ? "#E7F6EA" :
        String(row[0]).indexOf("NEW ID") === 0 ? "#EAF1FB" : "#FFF2CC";
      sh.getRange(index + 2, 4).setBackground(color);
    });
  }
  return result;
}

function dropdownAllowBlank_(sheet, col, values) {
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true)
    .setAllowInvalid(true) // blank cells are fine
    .build();
  sheet.getRange(2, col, sheet.getMaxRows() - 1, 1).setDataValidation(rule);
}

// Adds any Settings rows that are missing (new keys introduced by later
// script versions). NEVER changes a value that already exists — the club's
// own numbers always win. Returns the list of keys it added.
function ensureSettings_(ss) {
  var sh = ss.getSheetByName("Settings");
  if (!sh) return [];
  var wanted = [
    ["club_name", "Rotary Club of Mutya ng Santa Maria"],
    ["monthly_required_attendance", "4"],
    ["monthly_required_percent", "50"],
    ["club_goal_percent", "50"],
    ["early_bird_slots_per_regular_meeting", "10"],
    ["timezone", "Asia/Manila"],
    ["current_rotary_year_start", "2026-07-01"],
    ["current_rotary_year_end", "2027-06-30"],
  ];
  var last = sh.getLastRow();
  var have = {};
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) {
      var k = String(r[0]).trim();
      if (k) have[k] = true;
    });
  }
  var added = [];
  wanted.forEach(function (pair) {
    if (!have[pair[0]]) {
      sh.appendRow(pair);
      added.push(pair[0]);
    }
  });
  return added;
}

function ensureReportsTab_(ss) {
  if (ss.getSheetByName("Reports")) return;
  var sh = ss.insertSheet("Reports");
  writeTable_(sh,
    ["timestamp", "member_id", "member_name", "meeting_id", "event_title", "message", "status"],
    []);
  dropdown_(sh, 7, ["new", "reviewed", "resolved"]);
  sh.setColumnWidth(3, 240);
  sh.setColumnWidth(5, 240);
  sh.setColumnWidth(6, 280);
}

// ================================================================
//  MONTHLY ROTARY ATTENDANCE REPORT
//  Mirrors the four-week form used for club documentation.
// ================================================================

function ensureAttendanceReportTab_(ss) {
  var sh = ss.getSheetByName("AttendanceReport");
  if (sh) return sh;
  sh = ss.insertSheet("AttendanceReport");
  sh.getRange("A1").setValue("Report month (YYYY-MM)").setFontWeight("bold");
  sh.getRange("B1").setValue(
    Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM")
  ).setBackground("#FFF2CC").setNumberFormat("@");
  sh.getRange("A2").setValue(
    "Weeks follow scheduled regular meetings. report_week (1–4) can override an assignment."
  ).setFontStyle("italic").setFontColor("#5F6B7A");
  sh.getRange("A2:E2").merge();
  sh.setFrozenRows(2);
  return sh;
}

function tableObjects_(sh) {
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var headers = values.shift().map(function (value) {
    return String(value || "").trim().toLowerCase();
  });
  return values.map(function (row) {
    var out = {};
    headers.forEach(function (header, index) {
      if (header) out[header] = row[index];
    });
    return out;
  });
}

function refreshAttendanceReport() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ensureAttendanceReportTab_(ss);
  var month = String(sh.getRange("B1").getDisplayValue() || "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    month = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM");
    sh.getRange("B1").setValue(month);
  }

  var eligible = {};
  tableObjects_(ss.getSheetByName("Members")).forEach(function (member) {
    var status = String(member.active_status || "Active").trim().toLowerCase();
    var id = String(member.member_id || "").trim();
    if (id && status === "active") eligible[id] = true;
  });

  function assignedWeek_(meeting) {
    var value = parseInt(String(meeting.report_week || "").trim(), 10);
    return value >= 1 && value <= 4 ? value - 1 : -1;
  }
  function dayNumber_(date) {
    return Math.floor(new Date(date + "T00:00:00Z").getTime() / 86400000);
  }
  function meetingLabel_(meeting) {
    return String(meeting.activity_title || "Untitled") + " (" +
      normDate_(meeting.date) + "; " + String(meeting.meeting_id || "") + ")";
  }

  var allMeetings = tableObjects_(ss.getSheetByName("Meetings")).filter(function (meeting) {
    var date = normDate_(meeting.date);
    if (!date || date.slice(0, 7) !== month) return false;
    return String(meeting.status || "").trim().toLowerCase() !== "cancelled";
  }).sort(function (a, b) {
    return normDate_(a.date).localeCompare(normDate_(b.date)) ||
      String(a.meeting_id || "").localeCompare(String(b.meeting_id || ""));
  });
  var regular = allMeetings.filter(function (meeting) {
    return String(meeting.meeting_type || "").trim().toLowerCase() === "regular";
  });
  var other = allMeetings.filter(function (meeting) {
    return String(meeting.meeting_type || "").trim().toLowerCase() !== "regular";
  });
  var regularMeetings = [[], [], [], []];
  var makeupMeetings = [[], [], [], []];
  var inferredMakeups = [{}, {}, {}, {}];
  var usedWeeks = {};
  var warnings = [];

  regular.filter(function (meeting) {
    return assignedWeek_(meeting) >= 0;
  }).forEach(function (meeting) {
    var week = assignedWeek_(meeting);
    regularMeetings[week].push(meeting);
    usedWeeks[week] = true;
  });
  regular.filter(function (meeting) {
    return assignedWeek_(meeting) < 0;
  }).forEach(function (meeting) {
    var week = -1;
    for (var candidate = 0; candidate < 4; candidate++) {
      if (!usedWeeks[candidate]) { week = candidate; break; }
    }
    if (week < 0) {
      warnings.push(meetingLabel_(meeting) + " is a fifth regular meeting and is excluded.");
      return;
    }
    regularMeetings[week].push(meeting);
    usedWeeks[week] = true;
  });

  other.forEach(function (meeting) {
    var week = assignedWeek_(meeting);
    var inferred = false;
    if (week < 0) {
      var closest = null;
      for (var candidate = 0; candidate < 4; candidate++) {
        regularMeetings[candidate].forEach(function (regularMeeting) {
          var distance = Math.abs(
            dayNumber_(normDate_(meeting.date)) - dayNumber_(normDate_(regularMeeting.date))
          );
          if (!closest || distance < closest.distance ||
              (distance === closest.distance && candidate < closest.week)) {
            closest = { week: candidate, distance: distance };
          }
        });
      }
      if (!closest) {
        warnings.push(meetingLabel_(meeting) + " has no regular meeting to attach to.");
        return;
      }
      week = closest.week;
      inferred = true;
    }
    if (regularMeetings[week].length === 0) {
      warnings.push(meetingLabel_(meeting) + " is assigned to Week " + (week + 1) +
        ", which has no regular meeting.");
      return;
    }
    makeupMeetings[week].push(meeting);
    if (inferred) inferredMakeups[week][String(meeting.meeting_id || "")] = true;
  });

  var regularByWeek = [{}, {}, {}, {}];
  var makeupByWeek = [{}, {}, {}, {}];
  for (var assignmentWeek = 0; assignmentWeek < 4; assignmentWeek++) {
    regularMeetings[assignmentWeek].forEach(function (meeting) {
      regularByWeek[assignmentWeek][String(meeting.meeting_id || "").trim()] = true;
    });
    makeupMeetings[assignmentWeek].forEach(function (meeting) {
      makeupByWeek[assignmentWeek][String(meeting.meeting_id || "").trim()] = true;
    });
  }

  var present = [{}, {}, {}, {}];
  var makeup = [{}, {}, {}, {}];
  var memberIndex = buildMemberIndex_(ss);
  var memberNames = {};
  Object.keys(memberIndex).forEach(function (key) {
    var member = memberIndex[key];
    if (member && member.id) memberNames[member.id] = member.name || member.nickname || member.id;
  });
  tableObjects_(ss.getSheetByName("Attendance")).forEach(function (row) {
    var member = memberForRef_(memberIndex, row.member_id);
    if (!member || !eligible[member.id]) return;
    var rawMeeting = String(row.meeting_id || "").trim();
    var meetingId = extractMeetingId_(rawMeeting) || rawMeeting;
    var creditText = String(row.credit_given == null ? "" : row.credit_given).trim();
    var hasCredit = creditText === "" || (parseFloat(creditText) || 0) > 0;
    for (var week = 0; week < 4; week++) {
      if (regularByWeek[week][meetingId]) present[week][member.id] = true;
      if (hasCredit && makeupByWeek[week][meetingId]) makeup[week][member.id] = true;
    }
  });

  var rows = [
    ["Attendance measure"].concat([0, 1, 2, 3].map(function (week) {
      if (regularMeetings[week].length === 0) return "Week " + (week + 1) + " — Not scheduled";
      var dates = regularMeetings[week].map(function (meeting) {
        return normDate_(meeting.date);
      }).join(" / ");
      return "Week " + (week + 1) + " — " + dates;
    })),
    ["Members Present"],
    ["Members with Valid Make-Up"],
    ["Total Attendance"],
  ];
  var total = 0;
  var scheduledWeekCount = 0;
  for (var i = 0; i < 4; i++) {
    if (regularMeetings[i].length === 0) {
      rows[1].push("—");
      rows[2].push("—");
      rows[3].push("—");
      continue;
    }
    scheduledWeekCount++;
    var presentCount = Object.keys(present[i]).length;
    var makeupCount = Object.keys(makeup[i]).filter(function (id) {
      return !present[i][id];
    }).length;
    rows[1].push(presentCount);
    rows[2].push(makeupCount);
    rows[3].push(presentCount + makeupCount);
    total += presentCount + makeupCount;
  }
  var average = scheduledWeekCount ? total / scheduledWeekCount : 0;
  var activeCount = Object.keys(eligible).length;
  var rate = activeCount ? average / activeCount : 0;

  sh.getRange("A3:E40").clearContent().clearFormat();
  sh.getRange(3, 1, rows.length, 5).setValues(rows);
  sh.getRange("A3:E3").setFontWeight("bold").setBackground("#17458F").setFontColor("#FFFFFF");
  sh.getRange("A4:A6").setFontWeight("bold");
  sh.getRange("A6:E6").setFontWeight("bold").setBackground("#EAF1FB");
  sh.getRange("A8:B10").setValues([
    ["Average Attendance for the Month", average],
    ["Average Attendance Rate", rate],
    ["Scheduled reporting weeks", scheduledWeekCount],
  ]);
  sh.getRange("A8:A10").setFontWeight("bold");
  sh.getRange("B8").setNumberFormat("0.0");
  sh.getRange("B9").setNumberFormat("0.0%");
  sh.setColumnWidth(1, 250);
  sh.setColumnWidths(2, 4, 95);
  sh.getRange("A3:E6").setBorder(true, true, true, true, true, true);
  sh.getRange("A8:B10").setBorder(true, true, true, true, true, true);

  var detailRows = [["AUDIT TRAIL — WHERE EACH NUMBER COMES FROM", "", "", "", ""]];
  for (var detailWeek = 0; detailWeek < 4; detailWeek++) {
    var regularLabels = regularMeetings[detailWeek].map(meetingLabel_).join("\n") || "Not scheduled";
    var presentNames = Object.keys(present[detailWeek]).map(function (id) {
      return memberNames[id] || id;
    }).sort().join(", ") || "None recorded";
    var makeupLabels = makeupMeetings[detailWeek].map(function (meeting) {
      var id = String(meeting.meeting_id || "");
      return meetingLabel_(meeting) + (inferredMakeups[detailWeek][id] ? " [week inferred]" : "");
    }).join("\n") || "None";
    var validMakeupNames = Object.keys(makeup[detailWeek]).filter(function (id) {
      return !present[detailWeek][id];
    }).map(function (id) {
      return memberNames[id] || id;
    }).sort().join(", ") || "None recorded";
    detailRows.push(["Week " + (detailWeek + 1), "Regular meeting(s)", regularLabels, "", ""]);
    detailRows.push(["", "Present (" + Object.keys(present[detailWeek]).length + ")", presentNames, "", ""]);
    detailRows.push(["", "Make-up activities", makeupLabels, "", ""]);
    detailRows.push(["", "Valid make-up members (" +
      Object.keys(makeup[detailWeek]).filter(function (id) {
        return !present[detailWeek][id];
      }).length + ")", validMakeupNames, "", ""]);
  }
  if (warnings.length > 0) {
    detailRows.push(["SETUP WARNINGS", "", warnings.join("\n"), "", ""]);
  }
  sh.getRange(12, 1, detailRows.length, 5).setValues(detailRows);
  sh.getRange("A12:E12").setFontWeight("bold").setBackground("#17458F").setFontColor("#FFFFFF");
  sh.getRange(13, 1, detailRows.length - 1, 3).setWrap(true).setVerticalAlignment("top");
  sh.setColumnWidth(2, 190);
  sh.setColumnWidth(3, 520);
  return sh;
}

function buildLookup_(ss) {
  var old = ss.getSheetByName("Lookup");
  if (old) ss.deleteSheet(old);
  var sh = ss.insertSheet("Lookup");
  sh.getRange("A1:G1").setValues([[
    "member_label", "member_id", "member_name", "last_name",
    "nickname", "meeting_label", "meeting_id"
  ]]).setFontWeight("bold");
  // Live formulas: new members/events show up in dropdowns automatically.
  // Members are SORTED by last name (then first name), so the EntryPad
  // roster and all name dropdowns stay alphabetical no matter where a
  // new member's row is added on the Members tab.
  sh.getRange("A2").setFormula(
    '=SORT(FILTER({Members!E2:E&" · "&Members!C2:C&" "&Members!B2:B&" · "&Members!A2:A, ' +
    'Members!A2:A, Members!B2:B&", "&Members!C2:C&IF(Members!D2:D="",""," "&Members!D2:D), ' +
    'Members!B2:B, Members!E2:E}, Members!A2:A<>""), 4, TRUE, 3, TRUE)'
  );

  // Event labels skip cancelled events so they can't be picked on EntryPad.
  var meetings = ss.getSheetByName("Meetings");
  var headers = meetings.getRange(1, 1, 1, meetings.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim().toLowerCase(); });
  var statusIdx = headers.indexOf("status");
  var cancelledTest = "";
  if (statusIdx >= 0) {
    var letter = columnLetter_(statusIdx + 1);
    cancelledTest = '+(LOWER(Meetings!' + letter + '2:' + letter + ')="cancelled")';
  }
  sh.getRange("F2").setFormula(
    '=ARRAYFORMULA(IF((Meetings!A2:A="")' + cancelledTest +
    ',,Meetings!B2:B&" · "&Meetings!D2:D&" · "&Meetings!A2:A))'
  );
  sh.getRange("G2").setFormula('=ARRAYFORMULA(IF(Meetings!A2:A="",,Meetings!A2:A))');
  sh.hideSheet();
}

function columnLetter_(col) {
  var letter = "";
  while (col > 0) {
    var rem = (col - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}

function buildEntryPad_(ss) {
  var old = ss.getSheetByName("EntryPad");
  if (old) ss.deleteSheet(old);
  var sh = ss.insertSheet("EntryPad", 0); // first position — it's the daily tab

  // Header area
  sh.getRange("A1").setValue("Event:").setFontWeight("bold");
  sh.getRange("B1:G1").merge();
  sh.getRange("B1")
    .setBackground("#FFF3CC")
    .setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInRange(ss.getRange("Lookup!F2:F"), true)
        .setAllowInvalid(false)
        .setHelpText("Pick the meeting or activity. Type part of its title or date to search.")
        .build()
    );
  sh.getRange("A2").setValue("Tick to SAVE →").setFontWeight("bold");
  sh.getRange("B2").insertCheckboxes().setBackground("#D7F2DC");
  sh.getRange("C2:G2").merge();
  sh.getRange("C2").setValue("Pick the event, tick attendees, then tick SAVE.").setFontStyle("italic");
  sh.getRange("A3").setValue("EB rank = Early Bird order of arrival (1–10), regular meetings only. Credit blank = 1.")
    .setFontSize(9).setFontColor("#666666");
  sh.getRange("A3:G3").merge();

  // Table headers
  sh.getRange("A4:G4").setValues([[
    "Present", "Full name (Last, First)", "Nickname", "Member ID", "EB rank", "Credit", "Notes"
  ]])
    .setFontWeight("bold").setBackground("#17458F").setFontColor("#FFFFFF");
  sh.setFrozenRows(4);

  var n = PAD_LAST_ROW - PAD_FIRST_ROW + 1;
  sh.getRange(PAD_FIRST_ROW, 1, n, 1).insertCheckboxes();

  var members = ss.getSheetByName("Members");
  var memberHeaders = members.getRange(1, 1, 1, members.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim().toLowerCase(); });
  var idIdx = memberHeaders.indexOf("member_id");
  var lastIdx = memberHeaders.indexOf("last_name");
  var firstIdx = memberHeaders.indexOf("first_name");
  var middleIdx = memberHeaders.indexOf("middle_name");
  var nickIdx = memberHeaders.indexOf("nickname");
  var memberRows = members.getRange(
    2, 1, Math.max(members.getLastRow() - 1, 1), members.getLastColumn()
  ).getValues().map(function (row) {
    return [
      String(row[lastIdx] || "").trim() + ", " +
        [row[firstIdx], row[middleIdx]].map(function (value) {
          return String(value || "").trim();
        }).filter(String).join(" "),
      String(row[nickIdx] || "").trim(),
      String(row[idIdx] || "").trim()
    ];
  }).filter(function (row) {
    return row[2] !== "";
  }).sort(function (a, b) {
    return a[0].localeCompare(b[0]) ||
      a[1].localeCompare(b[1]) ||
      a[2].localeCompare(b[2]);
  }).slice(0, n);
  if (memberRows.length > 0) {
    sh.getRange(PAD_FIRST_ROW, 2, memberRows.length, 3).setValues(memberRows);
  }

  sh.getRange(PAD_FIRST_ROW, 5, n, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(["1","2","3","4","5","6","7","8","9","10"], true)
      .setAllowInvalid(false)
      .build()
  );
  sh.setColumnWidth(1, 64);
  sh.setColumnWidth(2, 180);
  sh.setColumnWidth(3, 130);
  sh.setColumnWidth(4, 90);
  sh.setColumnWidth(5, 70);
  sh.setColumnWidth(6, 60);
  sh.setColumnWidth(7, 180);
  sh.getRange(PAD_FIRST_ROW, 2, n, 3).protect()
    .setDescription("Member fields come from the Members tab — sort, but don't type here.")
    .setWarningOnly(true);
  sh.getRange(4, 1, n + 1, 7).createFilter();
}

function refreshEntryPadRoster() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  buildLookup_(ss);
  buildEntryPad_(ss);
  ss.toast(
    "EntryPad roster refreshed. Sort by full name (last first), nickname, or ID.",
    "Rotary Tools",
    8
  );
}

function applySmartValidations_(ss) {
  // Each member field gets suggestions from the matching Lookup column.
  // Invalid values are allowed so onEdit can resolve typed IDs/names and
  // explain ambiguous nicknames instead of rejecting the edit.
  var att = ss.getSheetByName("Attendance");
  var eb = ss.getSheetByName("EarlyBird");
  var idSource = ss.getRange("Lookup!B2:B");
  var nameSource = ss.getRange("Lookup!C2:C");
  var nicknameSource = ss.getRange("Lookup!E2:E");
  var meetingSource = ss.getRange("Lookup!F2:G");

  smartDrop_(att, 1, meetingSource, "Type the meeting title, date, or ID.");
  smartDrop_(att, 2, idSource, "Type or pick a member ID.");
  smartDrop_(att, 3, nameSource, "Type or pick a full name (last name first).");
  smartDrop_(att, 4, nicknameSource, "Type or pick a nickname.");
  smartDrop_(eb, 1, meetingSource, "Type the meeting title, date, or ID.");
  smartDrop_(eb, 3, idSource, "Type or pick a member ID.");
  smartDrop_(eb, 4, nameSource, "Type or pick a full name (last name first).");
  smartDrop_(eb, 5, nicknameSource, "Type or pick a nickname.");
}

function smartDrop_(sheet, col, sourceRange, help) {
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(sourceRange, true)
    .setAllowInvalid(true) // old plain-ID rows stay valid; app resolves both
    .setHelpText(help)
    .build();
  var rows = Math.min(
    sheet.getMaxRows() - 1,
    Math.max(sheet.getLastRow() - 1 + CAPACITY_CUSHION, CAPACITY_CUSHION)
  );
  sheet.getRange(2, col, rows, 1).setDataValidation(rule);
}

// ================================================================
//  ONE-TIME SETUP (same as v1, now also builds EntryPad)
// ================================================================

function setupWorkbook() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var wanted = ["Settings", "Members", "Meetings", "Attendance", "EarlyBird"];
  for (var i = 0; i < wanted.length; i++) {
    if (ss.getSheetByName(wanted[i])) {
      throw new Error(
        'A tab named "' + wanted[i] + '" already exists — setup already ran. ' +
        "If you only want the new EntryPad, run upgradeEntryPad instead."
      );
    }
  }

  var old = ss.getSheets()[0];
  if (old && wanted.indexOf(old.getName()) === -1) {
    old.setName("Original sheet (reference)");
  }

  buildSettings_(ss);
  buildMembers_(ss);
  buildMeetings_(ss);
  buildAttendance_(ss);
  buildEarlyBird_(ss);
  ensureMeetingsColumns_(ss);
  ensureReportsTab_(ss);
  ensureAttendanceReportTab_(ss);
  buildLookup_(ss);
  buildEntryPad_(ss);
  applySmartValidations_(ss);
  auditMemberIdContinuity_(ss);
  refreshAttendanceReport();

  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert(
    "Done! The Mutya attendance tabs, sortable EntryPad, connected member-name " +
    "columns, and AttendanceReport tab are ready with the existing July data."
  );
}

// ---------------------------------------------------------- builders

function writeTable_(sheet, headers, rows) {
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight("bold")
    .setBackground("#17458F")
    .setFontColor("#FFFFFF");
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

function textColumn_(sheet, col) {
  sheet.getRange(2, col, sheet.getMaxRows() - 1, 1).setNumberFormat("@");
}

function dropdown_(sheet, col, values) {
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, col, sheet.getMaxRows() - 1, 1).setDataValidation(rule);
}

function buildSettings_(ss) {
  var sh = ss.insertSheet("Settings");
  writeTable_(sh, ["setting_key", "setting_value"], [
    ["club_name", "Rotary Club of Mutya ng Santa Maria"],
    ["monthly_required_attendance", "4"],
    ["monthly_required_percent", "50"],
    ["club_goal_percent", "50"],
    ["early_bird_slots_per_regular_meeting", "10"],
    ["timezone", "Asia/Manila"],
    ["current_rotary_year_start", "2026-07-01"],
    ["current_rotary_year_end", "2027-06-30"],
  ]);
  textColumn_(sh, 2);
}

function buildMembers_(ss) {
  var sh = ss.insertSheet("Members");
  var data = MEMBERS_.map(function (m) {
    return [m[0], m[1], m[2], m[3], m[4], "Active", "", "", ""];
  });
  writeTable_(sh,
    ["member_id", "last_name", "first_name", "middle_name", "nickname",
     "active_status", "join_date", "end_date", "notes"],
    data);
  textColumn_(sh, 7);
  textColumn_(sh, 8);
  dropdown_(sh, 6, ["Active", "Inactive", "Honorary"]);
}

function buildMeetings_(ss) {
  var sh = ss.insertSheet("Meetings");
  var data = MEETINGS_.map(function (m) {
    // m = [id, date, type, title, is_project]
    return [m[0], m[1], m[2], m[3], "", "1", "", "", m[4] || "", ""];
  });
  writeTable_(sh,
    ["meeting_id", "date", "meeting_type", "activity_title",
     "location", "credit_value", "notes", "status", "is_project", "report_week"],
    data);
  textColumn_(sh, 2);
  dropdown_(sh, 3, ["regular", "makeup", "special"]);
}

function buildAttendance_(ss) {
  var sh = ss.insertSheet("Attendance");
  var rows = ATTENDANCE_.map(function (pair) {
    return [pair[0], pair[1], "", "", "1", ""];
  });
  writeTable_(sh,
    ["meeting_id", "member_id", "member_name", "member_nickname", "credit_given", "notes"],
    rows);
  backfillMemberFields_(ss, sh, 2);
  sh.setColumnWidth(3, 180);
  sh.setColumnWidth(4, 140);
}

function buildEarlyBird_(ss) {
  var sh = ss.insertSheet("EarlyBird");
  writeTable_(sh,
    ["meeting_id", "rank", "member_id", "member_name", "member_nickname", "notes"],
    []);
  dropdown_(sh, 2, ["1","2","3","4","5","6","7","8","9","10"]);
  sh.setColumnWidth(4, 180);
  sh.setColumnWidth(5, 140);
}

// ---------------------------------------------------------- data

var MEMBERS_ = [
  ["M001","ABAYA","MARIA AIDA","PORCIUNCULA","AIDA"],
  ["M002","ALEX","MYLA GRACE","MENDOZA","MYLA"],
  ["M003","BAUTISTA","EMILIANA","GERONA","MELY"],
  ["M004","BELOSTRINO","IMELDA","NICOLAS","IMEE"],
  ["M005","BUENO","ANNA FRANCHESKA","DIAZ","ANNA"],
  ["M006","BUGAYONG","CONNIE","DIAZ","CONS"],
  ["M007","CAPILI","CHRISTINE JOY","ENRIQUEZ","CJ"],
  ["M008","CAPILI","MA. LOURDES","ENRIQUEZ","LOU"],
  ["M009","COBO","MARY LOU","BALAGTAS","ELOU"],
  ["M010","CORTES","CLAIRE MARIE","GALLARDO","CLAIRE"],
  ["M011","CRUZ","REYLINA","NICOLAS","LINA"],
  ["M012","DALY","MA. KLARISSA","MARTINEZ","KAYE"],
  ["M013","DE GUZMAN","LEONILA","BARTOLO","LEONY"],
  ["M014","DE LOS REYES","CHERRIE ROSE","GALLARDO","CHERRIE"],
  ["M015","DEL ROSARIO","BERNADETTE","FABIAN","DETTE"],
  ["M016","DOMINGO","ANA MARGARITA","GABRIEL","ANA"],
  ["M017","EVANGELISTA","MARIA JENNIFER","RAMOS","JENNY"],
  ["M018","FONTILLAS","MARIA KHRISTINA","MARTINEZ","TIN"],
  ["M019","FRANCISCO","LEONISA","CRUZ","LEONIE"],
  ["M020","IMPERIO","MARIA CRISTINA","DELOS SANTOS","TINA"],
  ["M021","JOSE","MARIA SALOME","CASTRO","SALLY"],
  ["M022","LING","ANNA CLARISSA","ROLDAN","CLARISSE"],
  ["M023","LIZASO","ADORACION","PEREZ","DORIE"],
  ["M024","MACALINAO","NILDA","ANGELES","NILDS"],
  ["M025","MANGIO","CEZ CAMILLE","LO","CAMILLE"],
  ["M026","MANLICLIC","MARIA LUISA","GONZALES","MALU"],
  ["M027","MARIANO","LUISA","DYPANCO","LISA"],
  ["M028","MARTINEZ-FUENTES","MARIA KATRINA","GLORIOSO","KATHY"],
  ["M029","MARTINEZ","SARAH KAITLYN","MENDOZA","SARAH"],
  ["M030","MATEO","EVANGELINE","JOSE","GELYNNE"],
  ["M031","MENDOZA","FAUSTA","ROXAS","BABY"],
  ["M032","MENDOZA","MARIA ALEXANDRA","CATARROJA","XANDRA"],
  ["M033","MENDOZA","MARY ANN","CAPILI","RYANN"],
  ["M034","ORTIZ","ROSALYN","JARAMILLA","SALEEN"],
  ["M035","PADILLA","MARIA LORENA","GALLANO","LORIE"],
  ["M036","PADILLA","PATRICIA ANNE","PARUNGAO","TRICIA"],
  ["M037","PEREZ","MARCELINA","SAN JOSE","MARCY"],
  ["M038","PORCIUNCULA","MA. ASUNCION","CRISTOBAL","MARITA"],
  ["M039","RAMOS","JESSICA MARIE","AZANA","JESSICA"],
  ["M040","RAMOS","RHIAMAR","AZANA","RHIA"],
  ["M041","REYES","CARMELA JOY","V","MELA"],
  ["M042","ROLDAN","ANNABELLE","MAURICIO","ANNIE"],
  ["M043","SAN LUIS","ANGELIQUE","SANTOS","ANGEL"],
  ["M044","SANTOS","SEIDINA","JOLOC","EDEN"],
  ["M045","SEVILLA","STEPFANIE ELLEN","SANTOS","CHAY"],
  ["M046","SORIANO","KIMBERLY RAY","ADVINCULA","KIM"],
  ["M047","YAMBAO","RESLYN","MILLER","RY"],
  ["M048","YAP","ELSIE","SALAZAR","ELSIE"],
  ["M049","YAP","JAMESIE FAITH","SALAZAR","FAITH"]
];

var MEETINGS_ = [
  // [id, date, type, title, is_project] — adjust "yes" flags anytime in the sheet
  ["20260701-TREE","2026-07-01","makeup","Tree Planting","yes"],
  ["20260704-MEEAA","2026-07-04","makeup","Joint Project MEEAA","yes"],
  ["20260706-REG","2026-07-06","regular","Induction",""],
  ["20260707-RCSM","2026-07-07","makeup","RC Santa Maria",""],
  ["20260708-GOV","2026-07-08","makeup","Governor's Visit",""],
  ["20260713-REG","2026-07-13","regular","Regular Meeting",""],
  ["20260720-REG","2026-07-20","regular","Regular Meeting",""],
  ["20260725-MOMMY","2026-07-25","makeup","Malusog si Mommy","yes"],
  ["20260727-REG","2026-07-27","regular","Regular Meeting",""],
  ["20260731-PIC","2026-07-31","makeup","Change of Profile Pic",""],
  ["20260731-REPOST","2026-07-31","makeup","Repost Infographics",""],
  ["20260731-MARKER","2026-07-31","makeup","Photo in Rotary Marker",""],
  ["20260731-RESEARCH","2026-07-31","makeup","Research about Rotary",""]
];

var ATTENDANCE_ = buildAttendanceData_();

function buildAttendanceData_() {
  var tree = ["M006","M007","M008","M013","M014","M019","M020","M023","M024",
              "M025","M026","M027","M030","M031","M032","M033","M035","M037",
              "M038","M042","M045","M048","M049"];
  var meeaa = ["M009","M016","M019","M020","M025","M026","M032","M042","M045","M047"];
  var noPic = { "M003":1, "M013":1, "M019":1, "M021":1, "M036":1 };
  var rows = [];
  tree.forEach(function (m) { rows.push(["20260701-TREE", m]); });
  meeaa.forEach(function (m) { rows.push(["20260704-MEEAA", m]); });
  for (var i = 1; i <= 49; i++) {
    var id = "M" + ("00" + i).slice(-3);
    if (!noPic[id]) rows.push(["20260731-PIC", id]);
  }
  return rows;
}
