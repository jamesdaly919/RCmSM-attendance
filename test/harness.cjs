// Mock Google Sheets harness that executes the REAL setup-sheet.gs code.
// Verifies the EntryPad save contract:
//   1. Happy path: rows saved, pad cleared, confirmation written.
//   2. Failure BEFORE/DURING the append -> pad is NOT cleared (ticks kept).
//   3. Failure during housekeeping (post-save) -> rows saved AND pad cleared.
//   4. Re-ticking SAVE after scenario 3 -> duplicates skipped, no double rows.
"use strict";
const fs = require("fs");
const SRC = fs.readFileSync(__dirname + "/../apps-script/setup-sheet.gs", "utf8").replace(/\r\n/g, "\n");

// ---------- minimal Sheets mock ----------
function colFromLetter(s) {
  let n = 0;
  for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
function makeChainProxy(target) {
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (typeof prop === "symbol") return undefined;
      return function () { return makeChainProxy(t); }; // unknown methods: chainable no-op
    },
  });
}
class Range {
  constructor(sheet, row, col, numRows, numCols) {
    Object.assign(this, { sheet, row, col, numRows, numCols });
  }
  getRow() { return this.row; }
  getColumn() { return this.col; }
  getLastRow() { return this.row + this.numRows - 1; }
  getLastColumn() { return this.col + this.numCols - 1; }
  getA1Notation() { return "R" + this.row + "C" + this.col; }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const rowArr = [];
      for (let c = 0; c < this.numCols; c++) rowArr.push(this.sheet._get(this.row + r, this.col + c));
      out.push(rowArr);
    }
    return out;
  }
  getValue() { return this.sheet._get(this.row, this.col); }
  getDisplayValue() { const v = this.getValue(); return v == null ? "" : String(v); }
  setValues(vals) {
    if (this.sheet._failOnWrite) throw new Error(this.sheet._failOnWrite);
    if (vals.length !== this.numRows || vals[0].length !== this.numCols) {
      throw new Error("setValues shape mismatch on " + this.sheet.name);
    }
    for (let r = 0; r < this.numRows; r++)
      for (let c = 0; c < this.numCols; c++) this.sheet._set(this.row + r, this.col + c, vals[r][c]);
    return this;
  }
  setValue(v) {
    if (this.sheet._failOnWrite) throw new Error(this.sheet._failOnWrite);
    for (let r = 0; r < this.numRows; r++)
      for (let c = 0; c < this.numCols; c++) this.sheet._set(this.row + r, this.col + c, v);
    return this;
  }
  clearContent() {
    for (let r = 0; r < this.numRows; r++)
      for (let c = 0; c < this.numCols; c++) this.sheet._set(this.row + r, this.col + c, "");
    return this;
  }
}
function range(sheet, row, col, numRows, numCols) {
  return makeChainProxy(new Range(sheet, row, col, numRows, numCols));
}
class Sheet {
  constructor(name, rows) {
    this.name = name;
    this.data = rows.map((r) => r.slice()); // array of row arrays
    this.maxRows = 1000;
    this._failOnWrite = null;
  }
  _width() { return this.data.reduce((m, r) => Math.max(m, r.length), 1); }
  _get(r, c) {
    const row = this.data[r - 1];
    const v = row ? row[c - 1] : undefined;
    return v === undefined ? "" : v;
  }
  _set(r, c, v) {
    while (this.data.length < r) this.data.push([]);
    const row = this.data[r - 1];
    while (row.length < c) row.push("");
    row[c - 1] = v;
  }
  getName() { return this.name; }
  getLastRow() {
    for (let i = this.data.length; i >= 1; i--)
      if (this.data[i - 1].some((v) => v !== "" && v !== undefined && v !== null)) return i;
    return 0;
  }
  getLastColumn() {
    let m = 1;
    this.data.forEach((row) => {
      for (let i = row.length; i >= 1; i--)
        if (row[i - 1] !== "" && row[i - 1] !== undefined) { m = Math.max(m, i); break; }
    });
    return m;
  }
  getMaxRows() { return this.maxRows; }
  insertRowsAfter(_after, n) { this.maxRows += n; return this; }
  getRange(a, b, c, d) {
    if (typeof a === "string") {
      const m = a.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
      const c1 = colFromLetter(m[1]), r1 = +m[2];
      const c2 = m[3] ? colFromLetter(m[3]) : c1, r2 = m[4] ? +m[4] : r1;
      return range(this, r1, c1, r2 - r1 + 1, c2 - c1 + 1);
    }
    return range(this, a, b, c === undefined ? 1 : c, d === undefined ? 1 : d);
  }
  getRangeList() { throw new Error("getRangeList not needed in these scenarios"); }
  getFilter() { return null; }
}
class Spreadsheet {
  constructor(sheets) { this.sheets = sheets; this.toasts = []; this._failInsertSheet = null; }
  getSheetByName(n) { return this.sheets[n] ? makeChainProxy(this.sheets[n]) : null; }
  insertSheet(n) {
    if (this._failInsertSheet) throw new Error(this._failInsertSheet);
    const sh = new Sheet(n, [[]]);
    this.sheets[n] = sh;
    return makeChainProxy(sh);
  }
  deleteSheet() {}
  getSpreadsheetTimeZone() { return "Asia/Manila"; }
  toast(msg, title) { this.toasts.push((title ? title + ": " : "") + msg); }
  getRange(a1) { // cross-sheet like "Lookup!F2:F"
    const [sheetName] = a1.split("!");
    return range(this.sheets[sheetName] || new Sheet(sheetName, [[]]), 1, 1, 1, 1);
  }
  getSheets() { return Object.values(this.sheets).map(makeChainProxy); }
}

// ---------- fixture ----------
function buildWorld() {
  const members = [
    ["member_id", "last_name", "first_name", "middle_name", "nickname", "active_status"],
    ["M001", "ABAYA", "MARIA AIDA", "P", "AIDA", "Active"],
    ["M002", "ALEX", "MYLA GRACE", "M", "MYLA", "Active"],
    ["M003", "BAUTISTA", "EMILIANA", "G", "MELY", "Active"],
  ];
  const meetings = [
    ["meeting_id", "date", "meeting_type", "activity_title", "location", "credit_value", "notes", "status", "is_project", "report_week"],
    ["20260817-REG", "2026-08-17", "regular", "Regular Meeting", "", "1", "", "", "", ""],
  ];
  const attendance = [
    ["meeting_id", "member_nickname", "member_name", "member_id", "attendance_mode", "credit_given", "notes"],
  ];
  const earlybird = [["meeting_id", "rank", "member_nickname", "member_name", "member_id", "notes"]];
  const reports = [["timestamp", "member_id", "member_name", "meeting_id", "event_title", "message", "status"]];
  const pad = [];
  pad.push(["Event:", "2026-08-17 · Regular Meeting · 20260817-REG"]); // row1 (B1 label)
  pad.push(["Tick to SAVE →", true, ""]); // row2: B2 checkbox ticked, C2 status
  pad.push(["note"]); // row3
  pad.push(["Present", "Nickname", "Full name", "Member ID", "Attendance mode", "EB rank", "Credit", "Notes"]); // row4
  // rows 5..154
  const roster = [
    [true, "AIDA", "ABAYA, MARIA AIDA P", "M001", "In-person", "1", "", ""],
    [true, "MYLA", "ALEX, MYLA GRACE M", "M002", "Online", "", "", ""],
    [true, "MELY", "BAUTISTA, EMILIANA G", "M003", "In-person", "", "", "late"],
  ];
  for (let i = 0; i < 150; i++) pad.push(roster[i] ? roster[i].slice() : [false, "", "", "", "", "", "", ""]);
  return new Spreadsheet({
    Members: new Sheet("Members", members),
    Meetings: new Sheet("Meetings", meetings),
    Attendance: new Sheet("Attendance", attendance),
    EarlyBird: new Sheet("EarlyBird", earlybird),
    Reports: new Sheet("Reports", reports),
    EntryPad: new Sheet("EntryPad", pad),
    Lookup: new Sheet("Lookup", [[]]),
  });
}

// ---------- load the real script with mocks in scope ----------
function loadScript(ss, log) {
  const validationBuilder = () => makeChainProxy({ build: () => ({}) });
  const SpreadsheetApp = makeChainProxy({
    getActiveSpreadsheet: () => ss,
    flush: () => log.push("FLUSH"),
    newDataValidation: validationBuilder,
    getUi: () => makeChainProxy({ alert: () => {} }),
  });
  const Utilities = {
    formatDate: (d, tz, fmt) => {
      const iso = new Date(d).toISOString();
      if (fmt === "yyyy-MM-dd") return iso.slice(0, 10);
      if (fmt === "yyyy-MM") return iso.slice(0, 7);
      return "Aug 18, 12:00";
    },
  };
  const ContentService = makeChainProxy({ createTextOutput: () => makeChainProxy({}) });
  const HtmlService = makeChainProxy({ createHtmlOutput: () => makeChainProxy({}) });
  const LockService = { getDocumentLock: () => ({ waitLock: () => {}, releaseLock: () => {} }), getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) };
  const PropertiesService = { getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }) };
  const ScriptApp = { getProjectTriggers: () => [], newTrigger: () => makeChainProxy({}) };
  // Evaluate the real file; function declarations land on `api` via explicit capture.
  const factory = new Function(
    "SpreadsheetApp", "Utilities", "ContentService", "HtmlService", "LockService", "PropertiesService", "ScriptApp",
    SRC + "\nreturn { saveEntryPad: saveEntryPad, clearPadRows_: clearPadRows_, " +
      "earlyBirdSlotsFor_: earlyBirdSlotsFor_, enforceEarlyBirdSlotCaps_: enforceEarlyBirdSlotCaps_ };"
  );
  return factory(SpreadsheetApp, Utilities, ContentService, HtmlService, LockService, PropertiesService, ScriptApp);
}

// ---------- assertions ----------
let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log("  PASS  " + label);
  else { failures++; console.log("  FAIL  " + label + (extra ? "  [" + extra + "]" : "")); }
}
function padTicks(ss) {
  const pad = ss.sheets.EntryPad;
  let n = 0;
  for (let r = 5; r <= 154; r++) if (pad._get(r, 1) === true) n++;
  return n;
}
function attRows(ss) { return ss.sheets.Attendance.getLastRow() - 1; }
function status(ss) { return String(ss.sheets.EntryPad._get(2, 3)); }

// Scenario 1: happy path
{
  console.log("Scenario 1 — normal save:");
  const ss = buildWorld();
  const log = [];
  const api = loadScript(ss, log);
  api.saveEntryPad();
  check("3 attendance rows written", attRows(ss) === 3, "got " + attRows(ss));
  check("pad fully cleared (0 ticks left)", padTicks(ss) === 0, padTicks(ss) + " ticks");
  check("confirmation shows Saved 3", /Saved 3 attendance rows/.test(status(ss)), status(ss));
  const flushBeforeClearOrder = log.indexOf("FLUSH") !== -1;
  check("writes flushed before pad cleared", flushBeforeClearOrder);
}

// Scenario 2: the WRITE to Attendance fails -> pad must keep all ticks
{
  console.log("Scenario 2 — append to Attendance fails mid-save:");
  const ss = buildWorld();
  const api = loadScript(ss, []);
  ss.sheets.Attendance._failOnWrite = "quota burp";
  let threw = false;
  try { api.saveEntryPad(); } catch (e) { threw = true; }
  check("error propagated (onEdit would toast 'Save failed')", threw);
  check("NO attendance rows written", attRows(ss) === 0, "got " + attRows(ss));
  check("pad NOT cleared — all 3 ticks intact", padTicks(ss) === 3, padTicks(ss) + " ticks");
  check("modes/EB/credit/notes intact", ss.sheets.EntryPad._get(5, 5) === "In-person" && ss.sheets.EntryPad._get(7, 8) === "late");
}

// Scenario 3: housekeeping (report refresh) fails AFTER save -> saved + cleared + helpful toast
{
  console.log("Scenario 3 — housekeeping fails after the save:");
  const ss = buildWorld();
  delete ss.sheets.AttendanceReport;
  ss._failInsertSheet = "simulated timeout in report refresh";
  const api = loadScript(ss, []);
  let threw = false;
  try { api.saveEntryPad(); } catch (e) { threw = true; console.log("   unexpected:", e.message); }
  check("no error escapes (caught internally)", !threw);
  check("attendance rows still saved", attRows(ss) === 3, "got " + attRows(ss));
  check("pad cleared despite housekeeping failure", padTicks(ss) === 0, padTicks(ss) + " ticks");
  check("confirmation still shows Saved 3", /Saved 3 attendance rows/.test(status(ss)), status(ss));
  check("toast explains tidy-up failed + menu fix", ss.toasts.some((t) => /tidy-up.*did not finish/.test(t)));
}

// Scenario 4: worst case — pad didn't clear (old bug) and admin re-ticks SAVE
{
  console.log("Scenario 4 — re-saving the same pad (duplicate protection):");
  const ss = buildWorld();
  const api = loadScript(ss, []);
  api.saveEntryPad();
  // simulate the admin re-ticking the same three members again
  const pad = ss.sheets.EntryPad;
  [5, 6, 7].forEach((r) => pad._set(r, 1, true));
  pad._set(5, 5, "In-person"); pad._set(6, 5, "Online"); pad._set(7, 5, "In-person");
  api.saveEntryPad();
  check("still exactly 3 attendance rows (no duplicates)", attRows(ss) === 3, "got " + attRows(ss));
  check("second save reports skipped duplicates", /Saved 0 attendance rows.*Skipped 3 already recorded/.test(status(ss)), status(ss));
}


// Scenario 5: validation abort (missing attendance mode) -> nothing saved, nothing cleared
{
  console.log("Scenario 5 — missing mode aborts before anything is written:");
  const ss = buildWorld();
  ss.sheets.EntryPad._set(6, 5, ""); // MYLA ticked but no In-person/Online chosen
  const api = loadScript(ss, []);
  api.saveEntryPad();
  check("no attendance rows written", attRows(ss) === 0, "got " + attRows(ss));
  check("pad NOT cleared — all 3 ticks intact", padTicks(ss) === 3, padTicks(ss) + " ticks");
  check("warning names the member, says nothing saved", /Choose In-person or Online.*MYLA.*Nothing was saved/.test(status(ss)), status(ss));
}

// Scenario 6: Early Bird slot rule — board + regular on the same day = 5 each
{
  console.log("Scenario 6 — Early Bird slots (board + regular share a day):");
  const ss = buildWorld();
  const mt = ss.sheets.Meetings;
  mt.data.push(["20260817-BOARDAUG", "2026-08-17", "makeup", "RC Mutya Board Meeting August", "", "1", "", "", "", ""]);
  mt.data.push(["20260824-REG", "2026-08-24", "regular", "Regular Meeting", "", "1", "", "", "", ""]);
  mt.data.push(["20260907-BOARDSEPT", "2026-09-07", "makeup", "Board Meeting for September", "", "1", "", "", "", ""]);
  mt.data.push(["20260905-GRANTS", "2026-09-05", "makeup", "TRF Grants Seminar", "", "1", "", "", "", ""]);
  mt.data.push(["20260907-MASS", "2026-09-07", "makeup", "Mass", "", "1", "", "", "", ""]);
  const api = loadScript(ss, []);
  check("regular sharing a day with a board meeting → 5", api.earlyBirdSlotsFor_(ss, "20260817-REG") === 5, api.earlyBirdSlotsFor_(ss, "20260817-REG"));
  check("board sharing a day with a regular meeting → 5", api.earlyBirdSlotsFor_(ss, "20260817-BOARDAUG") === 5, api.earlyBirdSlotsFor_(ss, "20260817-BOARDAUG"));
  check("regular alone on its day → 10", api.earlyBirdSlotsFor_(ss, "20260824-REG") === 10, api.earlyBirdSlotsFor_(ss, "20260824-REG"));
  check("board alone on its day → 10", api.earlyBirdSlotsFor_(ss, "20260907-BOARDSEPT") === 10, api.earlyBirdSlotsFor_(ss, "20260907-BOARDSEPT"));
  check("other makeup event → 0 (no Early Bird)", api.earlyBirdSlotsFor_(ss, "20260905-GRANTS") === 0, api.earlyBirdSlotsFor_(ss, "20260905-GRANTS"));
  check("Mass on a board day → still 0 (not a board/regular)", api.earlyBirdSlotsFor_(ss, "20260907-MASS") === 0);

  // Save the regular meeting pad with ranks 1, 6, and 5 → 6 is refused (cap 5)
  const pad = ss.sheets.EntryPad;
  pad._set(6, 6, "6"); pad._set(7, 6, "5");
  api.saveEntryPad();
  const eb = ss.sheets.EarlyBird;
  check("2 Early Bird rows saved (ranks 1 and 5)", eb.getLastRow() - 1 === 2, "got " + (eb.getLastRow() - 1));
  check("rank 6 refused with slot explanation", /Ignored 1 EB rank above 5.*share this day/.test(status(ss)), status(ss));

  // Board meeting on the pad: EB now accepted, mode not required
  pad._set(1, 2, "2026-08-17 · RC Mutya Board Meeting August · 20260817-BOARDAUG");
  [5, 6, 7].forEach((r) => pad._set(r, 1, true));
  pad._set(5, 5, ""); pad._set(6, 5, ""); pad._set(7, 5, "");
  pad._set(5, 6, "1"); pad._set(6, 6, "2"); pad._set(7, 6, "");
  api.saveEntryPad();
  check("board meeting: 3 attendance + 2 Early Bird saved", attRows(ss) === 6 && eb.getLastRow() - 1 === 4,
    attRows(ss) + " att / " + (eb.getLastRow() - 1) + " eb");
  check("board confirmation mentions Early Birds", /\+ 2 Early Birds/.test(status(ss)), status(ss));
}

// Scenario 7: trimming pre-existing rows above the cap (the July 13 situation)
{
  console.log("Scenario 7 — enforceEarlyBirdSlotCaps_ trims ranks above the cap:");
  const ss = buildWorld();
  ss.sheets.Meetings.data.push(["20260817-BOARDAUG", "2026-08-17", "makeup", "RC Mutya Board Meeting August", "", "1", "", "", "", ""]);
  ss.sheets.Meetings.data.push(["20260824-REG", "2026-08-24", "regular", "Regular Meeting", "", "1", "", "", "", ""]);
  const eb = ss.sheets.EarlyBird;
  for (let r = 1; r <= 10; r++) eb.data.push(["20260817-REG", String(r), "X", "X", "M001", ""]);
  for (let r = 1; r <= 10; r++) eb.data.push(["20260817-BOARDAUG", String(r), "X", "X", "M002", ""]);
  for (let r = 1; r <= 10; r++) eb.data.push(["20260824-REG", String(r), "X", "X", "M003", ""]);
  const api = loadScript(ss, []);
  const res = api.enforceEarlyBirdSlotCaps_(ss);
  check("10 rows removed (5 from each shared-day meeting)", res.removed === 10, "removed " + res.removed);
  const left = eb.getRange(2, 1, eb.getLastRow() - 1, 2).getValues();
  const count = (id) => left.filter((r) => r[0] === id).length;
  const maxRank = (id) => Math.max(...left.filter((r) => r[0] === id).map((r) => +r[1]));
  check("shared-day regular keeps ranks 1–5", count("20260817-REG") === 5 && maxRank("20260817-REG") === 5);
  check("shared-day board keeps ranks 1–5", count("20260817-BOARDAUG") === 5 && maxRank("20260817-BOARDAUG") === 5);
  check("solo regular keeps all 10", count("20260824-REG") === 10);
  check("second run is a no-op", api.enforceEarlyBirdSlotCaps_(ss).removed === 0);
}

console.log(failures === 0 ? "\nALL SCENARIOS PASS" : "\n" + failures + " FAILURE(S)");
process.exit(failures === 0 ? 0 : 1);
