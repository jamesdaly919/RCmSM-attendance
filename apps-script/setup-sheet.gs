/**
 * ============================================================
 *  SETUP + ENTRYPAD + REPORTS SCRIPT (v5 · Mutya)
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
 *  WHAT'S NEW IN v5
 *  ----------------
 *  EDIT A MEETING AFTER THE FACT. Rotary Tools → "Edit a meeting
 *  (date / type / title)…" opens a dialog where the admin picks any
 *  existing meeting and changes its date, type, and/or title — even
 *  after attendance has been recorded. The meeting_id is regenerated
 *  from the new values and every matching row in Attendance,
 *  EarlyBird, and Reports is moved to the new ID automatically, so
 *  history stays connected.
 *
 *  Editing the DATE cell directly on the Meetings tab now also works:
 *  the script notices the ID's date part no longer matches, rewrites
 *  the ID (keeping its suffix), and moves all connected rows with it.
 *  (Type/title edits made directly on the tab intentionally do NOT
 *  rename the ID — hand-typed custom IDs are preserved. Use the
 *  dialog when you want the ID to follow a new type or title.)
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
    .addItem("Edit a meeting (date / type / title)…", "editMeetingDialog")
    .addItem("Sort meetings, attendance, and Early Bird", "sortMeetingsAndAttendance")
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
    if (name === "Attendance") {
      enforceAttendanceModeForEdit_(e);
      sortAttendanceByMeetingDate_(sh);
      applyAttendanceModeRules_(e.source);
    }
    if (name === "EarlyBird") {
      sortEarlyBirdByMeetingDate_(sh);
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
      syncMeetingIdsWithDates_(sh, e.range, e.source);
      sortMeetingsByDate_(sh);
      refreshAttendanceReport();
      return;
    }
    if (name !== "EntryPad") return;
    if (e.range.getA1Notation() === "B1") {
      updateEntryPadModeState_(e.source, sh);
      return;
    }
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
//  EDIT A MEETING (v5)
//  Rotary Tools → "Edit a meeting (date / type / title)…" lets the
//  admin fix a meeting AFTER attendance has already been recorded.
//  The meeting_id is regenerated from the new date/type/title and
//  every row that points at the old ID — in Attendance, EarlyBird,
//  and Reports — is moved to the new ID, so nothing is orphaned.
//
//  Date edits typed directly into the Meetings tab are handled too:
//  syncMeetingIdsWithDates_ (called from onEdit) notices that the
//  ID's YYYYMMDD part no longer matches the date cell, rewrites the
//  ID keeping its suffix, and cascades the change the same way.
// ================================================================

function editMeetingDialog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var meetings = tableObjects_(ss.getSheetByName("Meetings"))
    .filter(function (m) { return String(m.meeting_id || "").trim() !== ""; })
    .map(function (m) {
      return {
        id: String(m.meeting_id).trim(),
        date: normDate_(m.date) || "",
        type: String(m.meeting_type || "").trim().toLowerCase() || "regular",
        title: String(m.activity_title || "").trim(),
      };
    })
    .sort(function (a, b) {
      return (b.date || "").localeCompare(a.date || "") || a.id.localeCompare(b.id);
    });
  if (meetings.length === 0) {
    SpreadsheetApp.getUi().alert("No meetings found on the Meetings tab.");
    return;
  }
  var html = [
    '<!DOCTYPE html><html><head><base target="_top"><style>',
    'body{font-family:Arial,Helvetica,sans-serif;font-size:13px;margin:12px;color:#1E2A3A;}',
    'label{display:block;margin-top:10px;font-weight:bold;}',
    'select,input{width:100%;box-sizing:border-box;padding:6px;margin-top:3px;font-size:13px;}',
    '#note{margin-top:10px;padding:8px;background:#EAF1FB;border-radius:4px;font-size:12px;}',
    '#msg{margin-top:10px;white-space:pre-wrap;font-size:12px;}',
    'button{margin-top:14px;padding:8px 18px;font-weight:bold;cursor:pointer;}',
    '</style></head><body>',
    '<label>Meeting to edit</label><select id="meeting"></select>',
    '<label>New date</label><input type="date" id="date">',
    '<label>New type</label><select id="type">',
    '<option value="regular">regular</option>',
    '<option value="makeup">makeup</option>',
    '<option value="special">special</option></select>',
    '<label>New title</label><input type="text" id="title">',
    '<div id="note">The meeting ID is regenerated from the new values. Every ',
    'Attendance, Early Bird, and report row that points at the old ID follows ',
    'it automatically, so recorded attendance is never lost.</div>',
    '<button id="apply" onclick="apply()">Apply change</button>',
    '<div id="msg"></div>',
    '<scr' + 'ipt>',
    'var MEETINGS=' + JSON.stringify(meetings) + ';',
    'var sel=document.getElementById("meeting");',
    'MEETINGS.forEach(function(m,i){var o=document.createElement("option");',
    'o.value=i;o.textContent=(m.date||"no date")+" \\u00B7 "+(m.title||"Untitled")+" \\u00B7 "+m.id;',
    'sel.appendChild(o);});',
    'function fill(){var m=MEETINGS[sel.value];',
    'document.getElementById("date").value=m.date;',
    'document.getElementById("type").value=m.type==="makeup"||m.type==="special"?m.type:"regular";',
    'document.getElementById("title").value=m.title;}',
    'sel.onchange=fill;',
    'function apply(){var m=MEETINGS[sel.value];',
    'var btn=document.getElementById("apply");var msg=document.getElementById("msg");',
    'btn.disabled=true;btn.textContent="Working\\u2026";msg.textContent="";',
    'google.script.run.withSuccessHandler(function(res){',
    'msg.style.color="#1B5E20";msg.textContent=res;',
    'btn.disabled=false;btn.textContent="Apply change";',
    '}).withFailureHandler(function(err){',
    'msg.style.color="#B00020";msg.textContent=String(err&&err.message?err.message:err);',
    'btn.disabled=false;btn.textContent="Apply change";',
    '}).applyMeetingEdit({id:m.id,',
    'date:document.getElementById("date").value,',
    'type:document.getElementById("type").value,',
    'title:document.getElementById("title").value});}',
    'fill();',
    '</scr' + 'ipt></body></html>',
  ].join('');
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(430).setHeight(480),
    "Edit a meeting"
  );
}

// Called from the dialog. Payload: {id, date (yyyy-mm-dd), type, title}.
function applyMeetingEdit(payload) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName("Meetings");
    if (!sh) throw new Error("Meetings tab not found.");
    var oldId = String(payload && payload.id || "").trim();
    var date = String(payload && payload.date || "").trim();
    var type = String(payload && payload.type || "").trim().toLowerCase();
    var title = String(payload && payload.title || "").trim();
    if (!oldId) throw new Error("No meeting selected.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error("Pick a date (YYYY-MM-DD).");
    }
    if (["regular", "makeup", "special"].indexOf(type) < 0) {
      throw new Error("Type must be regular, makeup, or special.");
    }
    if (type !== "regular" && !title) {
      throw new Error("Makeup/special meetings need a title.");
    }
    if (!title) title = "Regular Meeting";

    // find the row + collect the other IDs for uniqueness
    var lastRow = sh.getLastRow();
    var ids = sh.getRange(2, 1, Math.max(lastRow - 1, 1), 1).getValues();
    var row = 0;
    var existing = {};
    for (var i = 0; i < ids.length; i++) {
      var v = String(ids[i][0]).trim();
      if (!v) continue;
      if (v === oldId && !row) { row = i + 2; continue; }
      existing[v.toUpperCase()] = true;
    }
    if (!row) {
      throw new Error('Meeting "' + oldId +
        '" was not found — close and reopen the dialog, then try again.');
    }

    var suffix = type === "regular" ? "REG" : suffixFromTitle_(title, type);
    var base = date.replace(/-/g, "") + "-" + suffix;
    var newId = base;
    var k = 2;
    while (existing[newId.toUpperCase()]) { newId = base + k; k++; }

    // write the meeting row (date as plain text so labels never show a
    // raw date serial number), then move every connected row to the new ID
    sh.getRange(row, 2).setNumberFormat("@");
    sh.getRange(row, 1, 1, 4).setValues([[newId, date, type, title]]);
    var counts = { Attendance: 0, EarlyBird: 0, Reports: 0 };
    if (newId !== oldId) counts = renameMeetingReferences_(ss, oldId, newId);

    cleanNonRegularAttendanceModes_(ss);
    sortMeetingsByDate_(sh);
    sortAttendanceByMeetingDate_(ss.getSheetByName("Attendance"));
    sortEarlyBirdByMeetingDate_(ss.getSheetByName("EarlyBird"));
    applyAttendanceModeRules_(ss);
    refreshAttendanceReport();
    SpreadsheetApp.flush();

    var msg = newId === oldId
      ? "✔ Meeting updated. The ID " + oldId + " did not need to change."
      : "✔ Meeting updated: " + oldId + " → " + newId + ". Moved " +
        counts.Attendance + " Attendance, " + counts.EarlyBird +
        " Early Bird, and " + counts.Reports + " report row(s) to the new ID.";
    msg += " Close and reopen this dialog to edit another meeting.";
    ss.toast(msg, "Rotary Tools", 10);
    return msg;
  } finally {
    lock.releaseLock();
  }
}

// onEdit helper: if the DATE cell of a meeting that already has an ID is
// changed, rewrite the ID's YYYYMMDD part (keeping the suffix) and move
// every connected Attendance/EarlyBird/Reports row to the new ID.
function syncMeetingIdsWithDates_(sh, editedRange, ss) {
  var DATE_COL = 2;
  if (editedRange.getColumn() > DATE_COL || editedRange.getLastColumn() < DATE_COL) return;
  var firstRow = Math.max(editedRange.getRow(), 2);
  var lastRow = editedRange.getLastRow();
  if (lastRow < firstRow) return;
  var n = lastRow - firstRow + 1;
  var block = sh.getRange(firstRow, 1, n, 2).getValues(); // id, date

  var existing = {};
  sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues()
    .forEach(function (r) {
      var v = String(r[0]).trim();
      if (v) existing[v.toUpperCase()] = true;
    });

  var messages = [];
  for (var i = 0; i < n; i++) {
    var id = String(block[i][0]).trim();
    if (!/^\d{8}-/.test(id)) continue; // blank or hand-typed non-dated ID
    var date = normDate_(block[i][1]);
    if (!date) {
      if (String(block[i][1]).trim() !== "") {
        messages.push("⚠ Could not read the new date for " + id +
          " — type it as YYYY-MM-DD. The ID was not changed.");
      }
      continue;
    }
    var prefix = date.replace(/-/g, "");
    if (id.slice(0, 8) === prefix) continue; // already in sync
    delete existing[id.toUpperCase()];
    var base = prefix + id.slice(8);
    var newId = base;
    var k = 2;
    while (existing[newId.toUpperCase()]) { newId = base + k; k++; }
    existing[newId.toUpperCase()] = true;
    // keep the date stored as plain text so labels never show a serial number
    sh.getRange(firstRow + i, 2).setNumberFormat("@").setValue(date);
    sh.getRange(firstRow + i, 1).setValue(newId);
    var counts = renameMeetingReferences_(ss, id, newId);
    messages.push("✔ Meeting date changed: " + id + " → " + newId +
      ". Moved " + counts.Attendance + " Attendance, " + counts.EarlyBird +
      " Early Bird, and " + counts.Reports + " report row(s) with it.");
  }
  if (messages.length > 0) {
    cleanNonRegularAttendanceModes_(ss);
    sortAttendanceByMeetingDate_(ss.getSheetByName("Attendance"));
    sortEarlyBirdByMeetingDate_(ss.getSheetByName("EarlyBird"));
    applyAttendanceModeRules_(ss);
    ss.toast(messages.join("\n"), "Rotary Tools", 10);
  }
}

// Moves every row that references oldId (exact ID or a label containing
// it) to newId across Attendance, EarlyBird, and Reports. Also clears a
// stale EntryPad event selection so nothing is saved under the old ID.
function renameMeetingReferences_(ss, oldId, newId) {
  var counts = { Attendance: 0, EarlyBird: 0, Reports: 0 };
  Object.keys(counts).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return;
    var headers = sheetHeaders_(sh);
    var col = headers.indexOf("meeting_id") + 1;
    if (!col) return;
    var range = sh.getRange(2, col, sh.getLastRow() - 1, 1);
    var values = range.getValues();
    var changed = false;
    values.forEach(function (rowArr) {
      var raw = String(rowArr[0] || "");
      var id = extractMeetingId_(raw) || raw.trim();
      if (id !== oldId) return;
      rowArr[0] = raw.indexOf(oldId) >= 0 ? raw.split(oldId).join(newId) : newId;
      counts[name]++;
      changed = true;
    });
    if (changed) range.setValues(values);
  });
  var pad = ss.getSheetByName("EntryPad");
  if (pad) {
    var label = String(pad.getRange("B1").getValue() || "");
    if (extractMeetingId_(label) === oldId) {
      pad.getRange("B1").clearContent();
      pad.getRange("C2").setValue(
        "Event was renamed to " + newId + " — pick it again from the list.");
    }
  }
  return counts;
}

function sortMeetingsAndAttendance() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  sortMeetingsByDate_(ss.getSheetByName("Meetings"));
  sortAttendanceByMeetingDate_(ss.getSheetByName("Attendance"));
  sortEarlyBirdByMeetingDate_(ss.getSheetByName("EarlyBird"));
  ss.toast("Meetings, Attendance, and Early Bird sorted by meeting date.", "Rotary Tools", 5);
}

function sortMeetingsByDate_(sh) {
  if (!sh || sh.getLastRow() < 3) return;
  var width = sh.getLastColumn();
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, width).getValues();
  rows.sort(function (a, b) {
    var ad = normDate_(a[1]) || "9999-99-99";
    var bd = normDate_(b[1]) || "9999-99-99";
    return ad.localeCompare(bd) || String(a[0] || "").localeCompare(String(b[0] || ""));
  });
  sh.getRange(2, 1, rows.length, width).setValues(rows);
}

function sortAttendanceByMeetingDate_(sh) {
  if (!sh || sh.getLastRow() < 3) return;
  var headers = sheetHeaders_(sh);
  var meetingIdx = headers.indexOf("meeting_id");
  var nickIdx = headers.indexOf("member_nickname");
  var nameIdx = headers.indexOf("member_name");
  var idIdx = headers.indexOf("member_id");
  if (meetingIdx < 0) return;
  var width = sh.getLastColumn();
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, width).getValues();
  rows.sort(function (a, b) {
    var aid = extractMeetingId_(a[meetingIdx]) || String(a[meetingIdx] || "");
    var bid = extractMeetingId_(b[meetingIdx]) || String(b[meetingIdx] || "");
    return aid.localeCompare(bid) ||
      String(a[nickIdx] || "").localeCompare(String(b[nickIdx] || "")) ||
      String(a[nameIdx] || "").localeCompare(String(b[nameIdx] || "")) ||
      String(a[idIdx] || "").localeCompare(String(b[idIdx] || ""));
  });
  sh.getRange(2, 1, rows.length, width).setValues(rows);
}

function sortEarlyBirdByMeetingDate_(sh) {
  if (!sh || sh.getLastRow() < 3) return;
  var headers = sheetHeaders_(sh);
  var meetingIdx = headers.indexOf("meeting_id");
  var rankIdx = headers.indexOf("rank");
  var nickIdx = headers.indexOf("member_nickname");
  var nameIdx = headers.indexOf("member_name");
  var idIdx = headers.indexOf("member_id");
  if (meetingIdx < 0) return;
  var width = sh.getLastColumn();
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, width).getValues();
  rows.sort(function (a, b) {
    var aid = extractMeetingId_(a[meetingIdx]) || String(a[meetingIdx] || "");
    var bid = extractMeetingId_(b[meetingIdx]) || String(b[meetingIdx] || "");
    return aid.localeCompare(bid) ||
      ((parseInt(a[rankIdx], 10) || 999) - (parseInt(b[rankIdx], 10) || 999)) ||
      String(a[nickIdx] || "").localeCompare(String(b[nickIdx] || "")) ||
      String(a[nameIdx] || "").localeCompare(String(b[nameIdx] || "")) ||
      String(a[idIdx] || "").localeCompare(String(b[idIdx] || ""));
  });
  sh.getRange(2, 1, rows.length, width).setValues(rows);
}

// ================================================================
//  ENTRYPAD: SAVE
// ================================================================

var PAD_FIRST_ROW = 5;
var PAD_LAST_ROW = 154; // room for 150 members
var ATTENDANCE_MODES = ["In-person", "Online"];

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
  var values = pad.getRange(PAD_FIRST_ROW, 1, n, 8).getValues();
  // Present, Nickname, Full name, Member ID, Mode, EB, Credit, Notes

  var missingModes = [];
  values.forEach(function (row) {
    if (row[0] !== true) return;
    var mode = normalizeAttendanceMode_(row[4]);
    if (isRegular && !mode) {
      missingModes.push(String(row[1] || row[2] || row[3] || "Unknown member"));
    }
  });
  if (missingModes.length > 0) {
    finishPad_(
      pad,
      status,
      "⚠ Choose In-person or Online for every checked member. Missing: " +
        missingModes.slice(0, 5).join(", ") +
        (missingModes.length > 5 ? " +" + (missingModes.length - 5) + " more" : "") +
        ". Nothing was saved."
    );
    return;
  }

  // 3. What already exists (to skip duplicates)?
  ensureMemberColumns_(ss);
  ensureAttendanceModeColumn_(ss);
  cleanNonRegularAttendanceModes_(ss);
  applyAttendanceModeRules_(ss);
  var att = ss.getSheetByName("Attendance");
  var eb = ss.getSheetByName("EarlyBird");
  var memberIndex = buildMemberIndex_(ss);
  var existingAttendance = existingAttendanceRows_(att);
  var ebHeaders = sheetHeaders_(eb);
  var existingEB = existingPairs_(
    eb, ebHeaders.indexOf("meeting_id") + 1, ebHeaders.indexOf("member_id") + 1
  );                                                        // meeting|member
  var existingRanks = existingMeetingValues_(eb, 1, 2);   // meeting|rank

  var attRows = [], ebRows = [], modeUpdates = [];
  var skippedDup = 0, skippedBad = 0, ebIgnored = 0;

  for (var i = 0; i < values.length; i++) {
    var present = values[i][0] === true;
    var memberId = String(values[i][3] || "").trim();
    var attendanceMode = isRegular ? normalizeAttendanceMode_(values[i][4]) : "";
    var ebRank = String(values[i][5] || "").trim();
    var credit = String(values[i][6] || "").trim();
    var notes = String(values[i][7] || "").trim();
    if (!present) {
      if (ebRank) ebIgnored++; // rank typed but not marked present
      continue;
    }
    var member = memberForRef_(memberIndex, memberId);
    if (!member) { skippedBad++; continue; }
    memberId = member.id;

    var pairKey = meetingId + "|" + memberId;
    if (existingAttendance.pairs[pairKey]) {
      var existing = existingAttendance.pairs[pairKey];
      if (normalizeAttendanceMode_(existing.mode) !== attendanceMode) {
        modeUpdates.push({ row: existing.row, mode: attendanceMode });
        existing.mode = attendanceMode;
      } else {
        skippedDup++;
      }
    } else {
      attRows.push([
        meetingId,
        member.nickname,
        member.name,
        memberId,
        attendanceMode,
        credit === "" ? "1" : credit,
        notes
      ]);
      existingAttendance.pairs[pairKey] = { row: null, mode: attendanceMode };
    }

    if (ebRank !== "") {
      if (!isRegular) {
        ebIgnored++;
      } else if (existingEB[pairKey] || existingRanks[meetingId + "|" + ebRank]) {
        ebIgnored++;
      } else {
        ebRows.push([meetingId, ebRank, member.nickname, member.name, memberId, ""]);
        existingEB[pairKey] = true;
        existingRanks[meetingId + "|" + ebRank] = true;
      }
    }
  }

  // 4. Append (growing the sheets first if they're near their row limit).
  if (attRows.length > 0) {
    ensureRows_(att, attRows.length);
    att.getRange(att.getLastRow() + 1, 1, attRows.length, 7).setValues(attRows);
  }
  if (modeUpdates.length > 0) {
    var byMode = {};
    modeUpdates.forEach(function (update) {
      if (!byMode[update.mode]) byMode[update.mode] = [];
      byMode[update.mode].push(
        att.getRange(update.row, existingAttendance.modeCol).getA1Notation()
      );
    });
    Object.keys(byMode).forEach(function (mode) {
      att.getRangeList(byMode[mode]).setValue(mode);
    });
  }
  if (ebRows.length > 0) {
    ensureRows_(eb, ebRows.length);
    eb.getRange(eb.getLastRow() + 1, 1, ebRows.length, 6).setValues(ebRows);
  }

  // 4b. Keep every tab comfortably ahead of its data.
  ensureCapacity_(ss);
  sortAttendanceByMeetingDate_(att);
  sortEarlyBirdByMeetingDate_(eb);
  applyAttendanceModeRules_(ss);
  refreshAttendanceReport();

  // 5. Clear the pad + report.
  clearPadRows_(pad);
  var when = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "MMM d, HH:mm");
  var msg = "✔ Saved " + attRows.length + " attendance row" + (attRows.length === 1 ? "" : "s");
  if (modeUpdates.length > 0) {
    msg += " + updated mode on " + modeUpdates.length + " existing row" +
      (modeUpdates.length === 1 ? "" : "s");
  }
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
  pad.getRange(PAD_FIRST_ROW, 5, n, 4).clearContent();    // Mode, EB, Credit, Notes
}

function normalizeAttendanceMode_(value) {
  var mode = String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (mode === "online") return "Online";
  if (mode === "in-person" || mode === "in person" || mode === "inperson") {
    return "In-person";
  }
  return "";
}

function updateEntryPadModeState_(ss, pad) {
  if (!pad) return;
  var label = String(pad.getRange("B1").getValue() || "");
  var meetingId = extractMeetingId_(label);
  var meeting = meetingId ? findMeeting_(ss, meetingId) : null;
  var regular = meeting && String(meeting.type || "").toLowerCase() === "regular";
  var range = pad.getRange(PAD_FIRST_ROW, 5, PAD_LAST_ROW - PAD_FIRST_ROW + 1, 1);
  if (regular) {
    range.setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(ATTENDANCE_MODES, true).setAllowInvalid(false).build())
      .setBackground("#FFF8E1").setNote("Required for regular meetings.");
    pad.getRange("A3").setValue("Attendance mode is required for regular meetings. EB rank 1–10. Credit blank = 1.");
  } else {
    range.clearContent().clearDataValidations().setBackground("#EEEEEE")
      .setNote("Not used for makeup or special meetings.");
    pad.getRange("A3").setValue("Attendance mode is only recorded for regular meetings. EB rank is also regular-only. Credit blank = 1.");
  }
}

function enforceAttendanceModeForEdit_(e) {
  var sh = e.range.getSheet();
  var headers = sheetHeaders_(sh);
  var modeCol = headers.indexOf("attendance_mode") + 1;
  var meetingCol = headers.indexOf("meeting_id") + 1;
  var touchesMode = e.range.getColumn() <= modeCol && e.range.getLastColumn() >= modeCol;
  var touchesMeeting = e.range.getColumn() <= meetingCol && e.range.getLastColumn() >= meetingCol;
  if (!modeCol || !meetingCol || (!touchesMode && !touchesMeeting)) return;
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(ATTENDANCE_MODES, true).setAllowInvalid(false).build();
  var first = Math.max(2, e.range.getRow());
  var last = e.range.getLastRow();
  for (var row = first; row <= last; row++) {
    var meetingId = extractMeetingId_(sh.getRange(row, meetingCol).getValue()) ||
      String(sh.getRange(row, meetingCol).getValue() || "").trim();
    var meeting = findMeeting_(e.source, meetingId);
    var cell = sh.getRange(row, modeCol);
    if (!meeting || String(meeting.type || "").toLowerCase() !== "regular") {
      cell.clearContent().clearDataValidations().setBackground("#EEEEEE")
        .setNote("Attendance mode is only used for regular meetings.");
    } else {
      cell.setDataValidation(rule).setBackground("#FFF8E1")
        .setNote("Choose In-person or Online for this regular meeting.");
      var normalized = normalizeAttendanceMode_(cell.getValue());
      if (normalized) cell.setValue(normalized);
    }
  }
}

function cleanNonRegularAttendanceModes_(ss) {
  var sh = ss.getSheetByName("Attendance");
  if (!sh || sh.getLastRow() < 2) return;
  var headers = sheetHeaders_(sh);
  var meetingCol = headers.indexOf("meeting_id") + 1;
  var modeCol = headers.indexOf("attendance_mode") + 1;
  if (!meetingCol || !modeCol) return;
  var meetingValues = sh.getRange(2, meetingCol, sh.getLastRow() - 1, 1).getValues();
  var modes = sh.getRange(2, modeCol, sh.getLastRow() - 1, 1).getValues();
  var typeByMeeting = meetingTypeMap_(ss);
  var changed = false;
  modes.forEach(function (row, i) {
    var id = extractMeetingId_(meetingValues[i][0]) || String(meetingValues[i][0] || "").trim();
    if (typeByMeeting[id] !== "regular" && row[0] !== "") {
      row[0] = "";
      changed = true;
    }
  });
  if (changed) sh.getRange(2, modeCol, modes.length, 1).setValues(modes);
}

function applyAttendanceModeRules_(ss) {
  var sh = ss.getSheetByName("Attendance");
  if (!sh) return;
  var headers = sheetHeaders_(sh);
  var meetingCol = headers.indexOf("meeting_id") + 1;
  var modeCol = headers.indexOf("attendance_mode") + 1;
  if (!meetingCol || !modeCol) return;
  var count = Math.max(sh.getMaxRows() - 1, 1);
  sh.getRange(2, modeCol, count, 1).clearDataValidations().setBackground("#EEEEEE")
    .setNote("Attendance mode is only used for regular meetings.");
  if (sh.getLastRow() < 2) return;
  var ids = sh.getRange(2, meetingCol, sh.getLastRow() - 1, 1).getValues();
  var typeByMeeting = meetingTypeMap_(ss);
  var regularRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(ATTENDANCE_MODES, true).setAllowInvalid(false).build();
  var rules = [];
  var backgrounds = [];
  var notes = [];
  ids.forEach(function (row) {
    var id = extractMeetingId_(row[0]) || String(row[0] || "").trim();
    if (typeByMeeting[id] === "regular") {
      rules.push([regularRule]);
      backgrounds.push(["#FFF8E1"]);
      notes.push(["Choose In-person or Online for this regular meeting."]);
    } else {
      rules.push([null]);
      backgrounds.push(["#EEEEEE"]);
      notes.push(["Attendance mode is only used for regular meetings."]);
    }
  });
  sh.getRange(2, modeCol, ids.length, 1)
    .setDataValidations(rules)
    .setBackgrounds(backgrounds)
    .setNotes(notes);
}

function existingAttendanceRows_(sheet) {
  var out = { pairs: {}, modeCol: 0 };
  var last = sheet.getLastRow();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function (header) { return String(header).trim().toLowerCase(); });
  var meetingCol = headers.indexOf("meeting_id") + 1;
  var memberCol = headers.indexOf("member_id") + 1;
  out.modeCol = headers.indexOf("attendance_mode") + 1;
  if (last < 2 || !meetingCol || !memberCol || !out.modeCol) return out;
  var data = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
  data.forEach(function (row, index) {
    var meeting = extractMeetingId_(row[meetingCol - 1]) ||
      String(row[meetingCol - 1] || "").trim();
    var member = extractMemberId_(row[memberCol - 1]) ||
      String(row[memberCol - 1] || "").trim();
    if (meeting && member && !out.pairs[meeting + "|" + member]) {
      out.pairs[meeting + "|" + member] = {
        row: index + 2,
        mode: row[out.modeCol - 1]
      };
    }
  });
  return out;
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

function meetingTypeMap_(ss) {
  var out = {};
  tableObjects_(ss.getSheetByName("Meetings")).forEach(function (meeting) {
    var id = String(meeting.meeting_id || "").trim();
    if (id) out[id] = String(meeting.meeting_type || "").trim().toLowerCase();
  });
  return out;
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
  ensureAttendanceModeColumn_(ss);
  cleanNonRegularAttendanceModes_(ss);
  ensureReportsTab_(ss);
  ensureAttendanceReportTab_(ss);
  var addedSettings = ensureSettings_(ss);
  // refresh dropdowns that were previously only set at first setup:
  dropdown_(ss.getSheetByName("EarlyBird"), 2, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]); // rank
  dropdown_(ss.getSheetByName("Members"), 6, ["Active", "Inactive", "Honorary"]);
  buildLookup_(ss);
  buildEntryPad_(ss);
  applySmartValidations_(ss);
  applyAttendanceModeRules_(ss);
  var repair = repairConnectedMemberFields_(ss);
  var audit = auditMemberIdContinuity_(ss);
  ensureCapacity_(ss);
  sortMeetingsByDate_(ss.getSheetByName("Meetings"));
  sortAttendanceByMeetingDate_(ss.getSheetByName("Attendance"));
  sortEarlyBirdByMeetingDate_(ss.getSheetByName("EarlyBird"));
  applyAttendanceModeRules_(ss);
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
  applyAttendanceModeRules_(ss);
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

function sheetHeaders_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(function (header) { return String(header).trim().toLowerCase(); });
}

function moveNamedColumn_(sh, header, targetColumn) {
  var headers = sheetHeaders_(sh);
  var current = headers.indexOf(header) + 1;
  if (!current || current === targetColumn) return;
  sh.moveColumns(sh.getRange(1, current, sh.getMaxRows(), 1), targetColumn);
}

// Both encoder tabs put nickname before full name and authoritative member ID.
function ensureMemberColumns_(ss) {
  ["Attendance", "EarlyBird"].forEach(function (sheetName) {
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return;
    var headers = sheetHeaders_(sh);
    var idCol = headers.indexOf("member_id") + 1;
    if (!idCol) return;

    // Migrate the short-lived surname-only version in place.
    if (headers[idCol] === "member_last_name") {
      sh.getRange(1, idCol + 1).setValue("member_name");
    }
    headers = sheetHeaders_(sh);
    if (headers.indexOf("member_name") < 0) {
      sh.insertColumnAfter(idCol);
      sh.getRange(1, idCol + 1).setValue("member_name");
    }
    headers = sheetHeaders_(sh);
    if (headers.indexOf("member_nickname") < 0) {
      var nameCol = headers.indexOf("member_name") + 1;
      sh.insertColumnAfter(nameCol);
      sh.getRange(1, nameCol + 1).setValue("member_nickname");
    }

    if (sheetName === "Attendance") {
      moveNamedColumn_(sh, "member_nickname", 2);
      moveNamedColumn_(sh, "member_name", 3);
      moveNamedColumn_(sh, "member_id", 4);
    } else if (sheetName === "EarlyBird") {
      moveNamedColumn_(sh, "member_nickname", 3);
      moveNamedColumn_(sh, "member_name", 4);
      moveNamedColumn_(sh, "member_id", 5);
    }

    headers = sheetHeaders_(sh);
    ["member_nickname", "member_name", "member_id"].forEach(function (header) {
      var col = headers.indexOf(header) + 1;
      sh.getRange(1, col).setValue(header)
        .setFontWeight("bold").setBackground("#17458F").setFontColor("#FFFFFF");
    });
    sh.setColumnWidth(headers.indexOf("member_nickname") + 1, 140);
    sh.setColumnWidth(headers.indexOf("member_name") + 1, 190);
    sh.setColumnWidth(headers.indexOf("member_id") + 1, 90);
  });
}

function ensureAttendanceModeColumn_(ss) {
  var sh = ss.getSheetByName("Attendance");
  if (!sh) return 0;
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(function (header) { return String(header).trim().toLowerCase(); });
  var modeCol = headers.indexOf("attendance_mode") + 1;
  if (!modeCol) {
    var idCol = headers.indexOf("member_id") + 1;
    if (!idCol) throw new Error("Attendance member_id column is missing.");
    sh.insertColumnAfter(idCol);
    modeCol = idCol + 1;
    sh.getRange(1, modeCol).setValue("attendance_mode")
      .setFontWeight("bold").setBackground("#17458F").setFontColor("#FFFFFF");
  }
  moveNamedColumn_(sh, "attendance_mode", 5);
  modeCol = sheetHeaders_(sh).indexOf("attendance_mode") + 1;
  dropdownAllowBlank_(sh, modeCol, ATTENDANCE_MODES);
  sh.setColumnWidth(modeCol, 125);
  return modeCol;
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
  var headers = sheetHeaders_(sh);
  idCol = headers.indexOf("member_id") + 1;
  var nameCol = headers.indexOf("member_name") + 1;
  var nicknameCol = headers.indexOf("member_nickname") + 1;
  var index = buildMemberIndex_(ss);
  var ids = sh.getRange(2, idCol, lastRow - 1, 1).getValues();
  var names = sh.getRange(2, nameCol, lastRow - 1, 1).getValues();
  var nicknames = sh.getRange(2, nicknameCol, lastRow - 1, 1).getValues();
  var connected = ids.map(function (idRow, indexRow) {
    var row = [idRow[0], names[indexRow][0], nicknames[indexRow][0]];
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
    var fields = [member.id, member.name, member.nickname];
    if (String(row[0]) === fields[0] &&
        String(row[1]) === fields[1] &&
        String(row[2]) === fields[2]) {
      stats.alreadyCorrect++;
    } else {
      stats.filled++;
    }
    return fields;
  });
  sh.getRange(2, idCol, connected.length, 1).setValues(connected.map(function (row) { return [row[0]]; }));
  sh.getRange(2, nameCol, connected.length, 1).setValues(connected.map(function (row) { return [row[1]]; }));
  sh.getRange(2, nicknameCol, connected.length, 1).setValues(connected.map(function (row) { return [row[2]]; }));
  return stats;
}

function syncMemberFieldsForEdit_(e) {
  var sh = e.range.getSheet();
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim().toLowerCase(); });
  var idCol = headers.indexOf("member_id") + 1;
  var nameCol = headers.indexOf("member_name") + 1;
  var nicknameCol = headers.indexOf("member_nickname") + 1;
  if (!idCol || !nameCol || !nicknameCol) return;
  var editedColumns = [idCol, nameCol, nicknameCol].filter(function (col) {
    return e.range.getColumn() <= col && e.range.getLastColumn() >= col;
  });
  if (editedColumns.length === 0) return;
  var firstRow = Math.max(2, e.range.getRow());
  var lastRow = e.range.getLastRow();
  if (lastRow < firstRow) return;
  var index = buildMemberIndex_(e.source);
  var count = lastRow - firstRow + 1;
  var ids = sh.getRange(firstRow, idCol, count, 1).getValues();
  var names = sh.getRange(firstRow, nameCol, count, 1).getValues();
  var nicknames = sh.getRange(firstRow, nicknameCol, count, 1).getValues();
  var rows = ids.map(function (row, indexRow) {
    return [row[0], names[indexRow][0], nicknames[indexRow][0]];
  });
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
  sh.getRange(firstRow, idCol, connected.length, 1)
    .setValues(connected.map(function (row) { return [row[0]]; }));
  sh.getRange(firstRow, nameCol, connected.length, 1)
    .setValues(connected.map(function (row) { return [row[1]]; }));
  sh.getRange(firstRow, nicknameCol, connected.length, 1)
    .setValues(connected.map(function (row) { return [row[2]]; }));
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
  var memberNames = {};
  tableObjects_(ss.getSheetByName("Members")).forEach(function (member) {
    var status = String(member.active_status || "Active").trim().toLowerCase();
    var id = String(member.member_id || "").trim();
    if (id && status === "active") {
      eligible[id] = true;
      memberNames[id] = String(member.nickname || "").trim() ||
        ([member.last_name, member.first_name].filter(String).join(", ")) || id;
    }
  });

  function assignedWeek_(meeting) {
    var value = parseInt(String(meeting.report_week || "").trim(), 10);
    return value >= 1 && value <= 4 ? value - 1 : -1;
  }
  function meetingLabel_(meeting) {
    return String(meeting.activity_title || "Untitled") + " (" +
      normDate_(meeting.date) + "; " + String(meeting.meeting_id || "") + ")";
  }
  function nameList_(ids) {
    var names = ids.map(function (id) { return memberNames[id] || id; }).sort();
    return names.length ? names.map(function (name) { return "• " + name; }).join("\n") : "None";
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

  var regularByWeek = [{}, {}, {}, {}];
  var regularMeetingIds = {};
  var makeupMeetingIds = {};
  for (var assignmentWeek = 0; assignmentWeek < 4; assignmentWeek++) {
    regularMeetings[assignmentWeek].forEach(function (meeting) {
      var id = String(meeting.meeting_id || "").trim();
      regularByWeek[assignmentWeek][id] = true;
      regularMeetingIds[id] = true;
    });
  }
  other.forEach(function (meeting) {
    makeupMeetingIds[String(meeting.meeting_id || "").trim()] = meeting;
  });

  var present = [{}, {}, {}, {}];
  var onSite = [{}, {}, {}, {}];
  var online = [{}, {}, {}, {}];
  var modeMissing = [{}, {}, {}, {}];
  var regularByMember = {};
  var makeupByMember = {};
  var makeupAttendees = {};
  var modeTotals = { inPerson: 0, online: 0, unrecorded: 0 };
  var memberIndex = buildMemberIndex_(ss);
  var seenPairs = {};
  tableObjects_(ss.getSheetByName("Attendance")).forEach(function (row) {
    var member = memberForRef_(memberIndex, row.member_id);
    if (!member || !eligible[member.id]) return;
    var rawMeeting = String(row.meeting_id || "").trim();
    var meetingId = extractMeetingId_(rawMeeting) || rawMeeting;
    var creditText = String(row.credit_given == null ? "" : row.credit_given).trim();
    var hasCredit = creditText === "" || (parseFloat(creditText) || 0) > 0;
    var pair = meetingId + "|" + member.id;
    if (seenPairs[pair]) return;
    seenPairs[pair] = true;
    for (var week = 0; week < 4; week++) {
      if (!regularByWeek[week][meetingId]) continue;
      present[week][member.id] = true;
      if (!regularByMember[member.id]) regularByMember[member.id] = {};
      regularByMember[member.id][meetingId] = true;
      var mode = normalizeAttendanceMode_(row.attendance_mode);
      if (mode === "In-person") { onSite[week][member.id] = true; modeTotals.inPerson++; }
      else if (mode === "Online") { online[week][member.id] = true; modeTotals.online++; }
      else { modeMissing[week][member.id] = true; modeTotals.unrecorded++; }
    }
    if (hasCredit && makeupMeetingIds[meetingId]) {
      if (!makeupByMember[member.id]) makeupByMember[member.id] = [];
      makeupByMember[member.id].push(meetingId);
      if (!makeupAttendees[meetingId]) makeupAttendees[meetingId] = {};
      makeupAttendees[meetingId][member.id] = true;
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
    ["Members on-site"],
    ["Members online"],
    ["Mode not recorded"],
    ["Members present"],
    ["Members absent"],
  ];
  var totalPresent = 0;
  var scheduledWeekCount = 0;
  for (var i = 0; i < 4; i++) {
    if (regularMeetings[i].length === 0) {
      for (var emptyRow = 1; emptyRow < rows.length; emptyRow++) rows[emptyRow].push("—");
      continue;
    }
    scheduledWeekCount++;
    var presentCount = Object.keys(present[i]).length;
    var absentIds = Object.keys(eligible).filter(function (id) {
      return !present[i][id];
    }).length;
    rows[1].push(Object.keys(onSite[i]).length);
    rows[2].push(Object.keys(online[i]).length);
    rows[3].push(Object.keys(modeMissing[i]).length);
    rows[4].push(presentCount);
    rows[5].push(absentIds);
    totalPresent += presentCount;
  }
  var average = scheduledWeekCount ? totalPresent / scheduledWeekCount : 0;
  var activeCount = Object.keys(eligible).length;
  var rate = activeCount ? average / activeCount : 0;
  var required = Math.min(4, regular.length);
  var makeupUsed = {};
  var goalRows = [["MEMBER MONTHLY GOAL", "Regular", "Makeup used", "Result", "Makeup meeting(s) used"]];
  Object.keys(eligible).sort(function (a, b) {
    return (memberNames[a] || a).localeCompare(memberNames[b] || b);
  }).forEach(function (id) {
    var regularCount = Math.min(required, Object.keys(regularByMember[id] || {}).length);
    var needed = Math.max(0, required - regularCount);
    var available = (makeupByMember[id] || []).sort(function (a, b) {
      return normDate_(makeupMeetingIds[a].date).localeCompare(normDate_(makeupMeetingIds[b].date));
    });
    var used = available.slice(0, needed);
    used.forEach(function (meetingId) {
      if (!makeupUsed[meetingId]) makeupUsed[meetingId] = {};
      makeupUsed[meetingId][id] = true;
    });
    goalRows.push([
      memberNames[id] || id,
      regularCount,
      used.length,
      Math.min(required, regularCount + used.length) + "/" + required,
      used.map(function (meetingId) { return meetingLabel_(makeupMeetingIds[meetingId]); }).join("\n") || "—"
    ]);
  });

  sh.getRange("A3:E500").clearContent().clearFormat();
  sh.getRange(3, 1, rows.length, 5).setValues(rows);
  sh.getRange("A3:E3").setFontWeight("bold").setBackground("#17458F").setFontColor("#FFFFFF");
  sh.getRange(4, 1, rows.length - 1, 1).setFontWeight("bold");
  sh.getRange(7, 1, 2, 5).setBackground("#EAF1FB");
  var summaryStart = rows.length + 5;
  sh.getRange(summaryStart, 1, 6, 2).setValues([
    ["Average Attendance for the Month", average],
    ["Average Attendance Rate", rate],
    ["Scheduled reporting weeks", scheduledWeekCount],
    ["Regular on-site records", modeTotals.inPerson],
    ["Regular online records", modeTotals.online],
    ["Regular mode not recorded", modeTotals.unrecorded],
  ]);
  sh.getRange(summaryStart, 1, 6, 1).setFontWeight("bold");
  sh.getRange(summaryStart, 2).setNumberFormat("0.0");
  sh.getRange(summaryStart + 1, 2).setNumberFormat("0.0%");
  sh.setColumnWidth(1, 250);
  sh.setColumnWidths(2, 4, 150);
  sh.getRange(3, 1, rows.length, 5).setBorder(true, true, true, true, true, true);
  sh.getRange(summaryStart, 1, 6, 2).setBorder(true, true, true, true, true, true);

  var detailRows = [["REGULAR MEETING AUDIT — WHERE EACH WEEKLY NUMBER COMES FROM", "", "", "", ""]];
  for (var detailWeek = 0; detailWeek < 4; detailWeek++) {
    var regularLabels = regularMeetings[detailWeek].map(meetingLabel_).join("\n") || "Not scheduled";
    detailRows.push(["Week " + (detailWeek + 1), "Regular meeting(s)", regularLabels, "", ""]);
    detailRows.push(["", "On-site (" + Object.keys(onSite[detailWeek]).length + ")", nameList_(Object.keys(onSite[detailWeek])), "", ""]);
    detailRows.push(["", "Online (" + Object.keys(online[detailWeek]).length + ")", nameList_(Object.keys(online[detailWeek])), "", ""]);
    detailRows.push(["", "Absent (" + (activeCount - Object.keys(present[detailWeek]).length) + ")",
      nameList_(Object.keys(eligible).filter(function (id) { return !present[detailWeek][id]; })), "", ""]);
  }
  if (warnings.length > 0) {
    detailRows.push(["SETUP WARNINGS", "", warnings.join("\n"), "", ""]);
  }
  var detailStart = summaryStart + 8;
  sh.getRange(detailStart, 1, detailRows.length, 5).setValues(detailRows);
  sh.getRange(detailStart, 1, 1, 5).setFontWeight("bold").setBackground("#17458F").setFontColor("#FFFFFF");
  sh.getRange(detailStart + 1, 1, detailRows.length - 1, 3).setWrap(true).setVerticalAlignment("top");

  var goalStart = detailStart + detailRows.length + 2;
  sh.getRange(goalStart, 1, goalRows.length, 5).setValues(goalRows);
  sh.getRange(goalStart, 1, 1, 5).setFontWeight("bold").setBackground("#17458F").setFontColor("#FFFFFF");
  sh.getRange(goalStart + 1, 1, goalRows.length - 1, 5).setWrap(true).setVerticalAlignment("top");
  sh.getRange(goalStart, 1, goalRows.length, 5).setBorder(true, true, true, true, true, true);

  var makeupRows = [["MAKEUP MEETING TRANSPARENCY", "Meeting / date", "Attended", "Did not attend", "Counts as monthly makeup"]];
  other.forEach(function (meeting) {
    var meetingId = String(meeting.meeting_id || "").trim();
    var attendees = Object.keys(makeupAttendees[meetingId] || {});
    var absentees = Object.keys(eligible).filter(function (id) { return !makeupAttendees[meetingId] || !makeupAttendees[meetingId][id]; });
    var counting = Object.keys(makeupUsed[meetingId] || {}).map(function (id) {
      return "• " + (memberNames[id] || id) + " — counts toward monthly goal";
    }).join("\n") || "None (attendees already met the goal or no credited attendance)";
    var calendarWeek = Math.min(4, Math.floor((parseInt(normDate_(meeting.date).slice(8, 10), 10) - 1) / 7) + 1);
    makeupRows.push(["Calendar Week " + calendarWeek, meetingLabel_(meeting), nameList_(attendees), nameList_(absentees), counting]);
  });
  if (other.length === 0) makeupRows.push(["—", "No makeup/special meetings scheduled", "—", "—", "—"]);
  var makeupStart = goalStart + goalRows.length + 2;
  sh.getRange(makeupStart, 1, makeupRows.length, 5).setValues(makeupRows);
  sh.getRange(makeupStart, 1, 1, 5).setFontWeight("bold").setBackground("#D9A514").setFontColor("#1E2A3A");
  sh.getRange(makeupStart + 1, 1, makeupRows.length - 1, 5).setWrap(true).setVerticalAlignment("top");
  sh.getRange(makeupStart, 1, makeupRows.length, 5).setBorder(true, true, true, true, true, true);
  sh.setColumnWidth(2, 190);
  sh.setColumnWidth(3, 280);
  sh.setColumnWidth(4, 280);
  sh.setColumnWidth(5, 340);
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
  sh.getRange("B1:H1").merge();
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
  sh.getRange("C2:H2").merge();
  sh.getRange("C2").setValue("Pick the event, tick attendees, then SAVE.").setFontStyle("italic");
  sh.getRange("A3").setValue("Attendance mode is required for regular meetings. EB rank 1–10. Credit blank = 1.")
    .setFontSize(9).setFontColor("#666666");
  sh.getRange("A3:H3").merge();

  // Table headers
  sh.getRange("A4:H4").setValues([[
    "Present", "Nickname", "Full name (Last, First)", "Member ID",
    "Attendance mode", "EB rank", "Credit", "Notes"
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
      String(row[nickIdx] || "").trim(),
      String(row[lastIdx] || "").trim() + ", " +
        [row[firstIdx], row[middleIdx]].map(function (value) {
          return String(value || "").trim();
        }).filter(String).join(" "),
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
      .requireValueInList(ATTENDANCE_MODES, true)
      .setAllowInvalid(false)
      .build()
  );
  sh.getRange(PAD_FIRST_ROW, 6, n, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(["1","2","3","4","5","6","7","8","9","10"], true)
      .setAllowInvalid(false)
      .build()
  );
  sh.setColumnWidth(1, 64);
  sh.setColumnWidth(2, 140);
  sh.setColumnWidth(3, 190);
  sh.setColumnWidth(4, 90);
  sh.setColumnWidth(5, 125);
  sh.setColumnWidth(6, 70);
  sh.setColumnWidth(7, 60);
  sh.setColumnWidth(8, 180);
  sh.getRange(PAD_FIRST_ROW, 2, n, 3).protect()
    .setDescription("Member fields come from the Members tab — sort, but don't type here.")
    .setWarningOnly(true);
  sh.getRange(4, 1, n + 1, 8).createFilter();
  updateEntryPadModeState_(ss, sh);
}

function refreshEntryPadRoster() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  buildLookup_(ss);
  buildEntryPad_(ss);
  ss.toast(
    "EntryPad roster refreshed. Nickname is first for faster encoding.",
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

  var attHeaders = sheetHeaders_(att);
  var ebHeaders = sheetHeaders_(eb);
  smartDrop_(att, attHeaders.indexOf("meeting_id") + 1, meetingSource,
    "Type the meeting title, date, or ID.");
  smartDrop_(att, attHeaders.indexOf("member_nickname") + 1, nicknameSource,
    "Type or pick a nickname.");
  smartDrop_(att, attHeaders.indexOf("member_name") + 1, nameSource,
    "Type or pick a full name (last name first).");
  smartDrop_(att, attHeaders.indexOf("member_id") + 1, idSource,
    "Type or pick a member ID.");
  smartDrop_(eb, ebHeaders.indexOf("meeting_id") + 1, meetingSource,
    "Type the meeting title, date, or ID.");
  smartDrop_(eb, ebHeaders.indexOf("member_id") + 1, idSource,
    "Type or pick a member ID.");
  smartDrop_(eb, ebHeaders.indexOf("member_name") + 1, nameSource,
    "Type or pick a full name (last name first).");
  smartDrop_(eb, ebHeaders.indexOf("member_nickname") + 1, nicknameSource,
    "Type or pick a nickname.");
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
  ensureAttendanceModeColumn_(ss);
  ensureReportsTab_(ss);
  ensureAttendanceReportTab_(ss);
  buildLookup_(ss);
  buildEntryPad_(ss);
  applySmartValidations_(ss);
  applyAttendanceModeRules_(ss);
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
    return [pair[0], "", "", pair[1], "", "1", ""];
  });
  writeTable_(sh,
    ["meeting_id", "member_nickname", "member_name", "member_id",
     "attendance_mode", "credit_given", "notes"],
    rows);
  backfillMemberFields_(ss, sh, 4);
  dropdownAllowBlank_(sh, 5, ATTENDANCE_MODES);
  sh.setColumnWidth(2, 140);
  sh.setColumnWidth(3, 190);
}

function buildEarlyBird_(ss) {
  var sh = ss.insertSheet("EarlyBird");
  writeTable_(sh,
    ["meeting_id", "rank", "member_nickname", "member_name", "member_id", "notes"],
    []);
  dropdown_(sh, 2, ["1","2","3","4","5","6","7","8","9","10"]);
  sh.setColumnWidth(3, 140);
  sh.setColumnWidth(4, 190);
  sh.setColumnWidth(5, 90);
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
