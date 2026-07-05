/**
 * ============================================================
 *  SETUP + ENTRYPAD SCRIPT (v2)
 *  Rotary Club of Mutya ng Santa Maria — Attendance Sheet
 * ============================================================
 *
 *  TWO FUNCTIONS YOU CAN RUN:
 *
 *  ▸ setupWorkbook()   — run ONCE on a fresh sheet. Renames the old
 *    grid to a reference tab, creates Settings / Members / Meetings /
 *    Attendance / EarlyBird with your July 2026 data migrated, then
 *    builds the Lookup + EntryPad tabs described below.
 *
 *  ▸ upgradeEntryPad() — run this instead if you ALREADY ran the v1
 *    setup earlier. It adds (or rebuilds) the Lookup and EntryPad
 *    tabs and upgrades the dropdowns on Attendance and EarlyBird so
 *    you can type a NICKNAME or NAME, not just an ID.
 *
 *  WHAT'S NEW IN v2
 *  ----------------
 *  1. "Lookup" tab (hidden): builds a searchable label per member,
 *     e.g.  AIDA · MARIA AIDA ABAYA · M001
 *     and per event, e.g.  2026-07-06 · Induction · 20260706-REG.
 *     Labels come from live formulas, so new members/events appear
 *     in every dropdown automatically.
 *
 *  2. Smarter dropdowns on Attendance + EarlyBird: start typing a
 *     nickname, a surname, or an ID and Sheets suggests the matching
 *     label. Picking the label is enough — the web app understands
 *     labels, plain IDs, nicknames, and full names.
 *
 *  3. "EntryPad" tab — the fast way to record a whole meeting:
 *       · pick the event in the yellow cell at the top
 *       · tick the checkbox beside each member who attended
 *       · (regular meetings) type Early Bird ranks 1–10 in the EB column
 *       · tick the green SAVE checkbox
 *     Everything is copied to the Attendance / EarlyBird tabs
 *     (duplicates are skipped automatically) and the pad clears
 *     itself, ready for the next event. Works on phones too.
 *     There is also a menu: Rotary Tools → Save EntryPad now.
 *
 *  HOW TO INSTALL
 *  --------------
 *  1. Open the Google Sheet → Extensions → Apps Script.
 *  2. Replace everything in the editor with this whole file. Save.
 *  3. Pick setupWorkbook (fresh sheet) or upgradeEntryPad (already
 *     set up) in the dropdown, click Run, and authorize when asked
 *     (your account → Advanced → Go to … → Allow).
 *  4. IMPORTANT for the SAVE checkbox: it uses the onEdit trigger,
 *     which activates automatically once the script is saved —
 *     nothing else to configure.
 */

// ================================================================
//  MENU + SAVE TRIGGER
// ================================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Rotary Tools")
    .addItem("Save EntryPad now", "saveEntryPad")
    .addItem("Clear EntryPad (without saving)", "clearEntryPad")
    .addItem("Rebuild EntryPad & Lookup", "upgradeEntryPad")
    .addToUi();
}

function onEdit(e) {
  // Fires when the SAVE checkbox on EntryPad is ticked.
  try {
    if (!e || !e.range) return;
    var sh = e.range.getSheet();
    if (sh.getName() !== "EntryPad") return;
    if (e.range.getA1Notation() !== "B2") return;
    if (e.value !== "TRUE" && e.value !== true) return;
    saveEntryPad();
  } catch (err) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ss.toast("Save failed: " + err.message, "EntryPad", 8);
  }
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
  var isRegular = String(meeting.type).toLowerCase() === "regular";

  // 2. Read the pad rows.
  var n = PAD_LAST_ROW - PAD_FIRST_ROW + 1;
  var values = pad.getRange(PAD_FIRST_ROW, 1, n, 5).getValues(); // Present, Member, EB, Credit, Notes

  // 3. What already exists (to skip duplicates)?
  var att = ss.getSheetByName("Attendance");
  var eb = ss.getSheetByName("EarlyBird");
  var existingPairs = existingPairs_(att, 1, 2);          // meeting|member
  var existingEB = existingPairs_(eb, 1, 3);              // meeting|member
  var existingRanks = existingMeetingValues_(eb, 1, 2);   // meeting|rank

  var attRows = [], ebRows = [];
  var skippedDup = 0, skippedBad = 0, ebIgnored = 0;

  for (var i = 0; i < values.length; i++) {
    var present = values[i][0] === true;
    var memberLabel = String(values[i][1] || "");
    var ebRank = String(values[i][2] || "").trim();
    var credit = String(values[i][3] || "").trim();
    var notes = String(values[i][4] || "").trim();
    if (!present) {
      if (ebRank) ebIgnored++; // rank typed but not marked present
      continue;
    }
    var memberId = extractMemberId_(memberLabel);
    if (!memberId) { skippedBad++; continue; }

    var pairKey = meetingId + "|" + memberId;
    if (existingPairs[pairKey]) {
      skippedDup++;
    } else {
      attRows.push([meetingId, memberId, credit === "" ? "1" : credit, notes]);
      existingPairs[pairKey] = true;
    }

    if (ebRank !== "") {
      if (!isRegular) {
        ebIgnored++;
      } else if (existingEB[pairKey] || existingRanks[meetingId + "|" + ebRank]) {
        ebIgnored++;
      } else {
        ebRows.push([meetingId, ebRank, memberId, ""]);
        existingEB[pairKey] = true;
        existingRanks[meetingId + "|" + ebRank] = true;
      }
    }
  }

  // 4. Append (growing the sheets first if they're near their row limit).
  if (attRows.length > 0) {
    ensureRows_(att, attRows.length);
    att.getRange(att.getLastRow() + 1, 1, attRows.length, 4).setValues(attRows);
  }
  if (ebRows.length > 0) {
    ensureRows_(eb, ebRows.length);
    eb.getRange(eb.getLastRow() + 1, 1, ebRows.length, 4).setValues(ebRows);
  }

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
  pad.getRange(PAD_FIRST_ROW, 3, n, 3).clearContent();    // EB, Credit, Notes
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
  var data = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 4).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]) === meetingId) {
      return { id: meetingId, date: data[i][1], type: data[i][2], title: data[i][3] };
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

function upgradeEntryPad() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ["Members", "Meetings", "Attendance", "EarlyBird"].forEach(function (name) {
    if (!ss.getSheetByName(name)) {
      throw new Error('Tab "' + name + '" is missing. Run setupWorkbook first.');
    }
  });
  buildLookup_(ss);
  buildEntryPad_(ss);
  applySmartValidations_(ss);
  SpreadsheetApp.flush();
  try {
    SpreadsheetApp.getUi().alert(
      "EntryPad is ready!\n\n" +
      "· Record a meeting: open the EntryPad tab, pick the event, tick attendees, " +
      "type Early Bird ranks if any, then tick SAVE.\n" +
      "· Attendance & EarlyBird dropdowns now accept nicknames and names too."
    );
  } catch (ignored) {}
}

function buildLookup_(ss) {
  var old = ss.getSheetByName("Lookup");
  if (old) ss.deleteSheet(old);
  var sh = ss.insertSheet("Lookup");
  sh.getRange("A1:D1").setValues([["member_label", "member_id", "meeting_label", "meeting_id"]])
    .setFontWeight("bold");
  // Live formulas: new members/events show up in dropdowns automatically.
  sh.getRange("A2").setFormula(
    '=ARRAYFORMULA(IF(Members!A2:A="",,Members!E2:E&" · "&Members!C2:C&" "&Members!B2:B&" · "&Members!A2:A))'
  );
  sh.getRange("B2").setFormula('=ARRAYFORMULA(IF(Members!A2:A="",,Members!A2:A))');
  sh.getRange("C2").setFormula(
    '=ARRAYFORMULA(IF(Meetings!A2:A="",,Meetings!B2:B&" · "&Meetings!D2:D&" · "&Meetings!A2:A))'
  );
  sh.getRange("D2").setFormula('=ARRAYFORMULA(IF(Meetings!A2:A="",,Meetings!A2:A))');
  sh.hideSheet();
}

function buildEntryPad_(ss) {
  var old = ss.getSheetByName("EntryPad");
  if (old) ss.deleteSheet(old);
  var sh = ss.insertSheet("EntryPad", 0); // first position — it's the daily tab

  // Header area
  sh.getRange("A1").setValue("Event:").setFontWeight("bold");
  sh.getRange("B1:E1").merge();
  sh.getRange("B1")
    .setBackground("#FFF3CC")
    .setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInRange(ss.getRange("Lookup!C2:C"), true)
        .setAllowInvalid(false)
        .setHelpText("Pick the meeting or activity. Type part of its title or date to search.")
        .build()
    );
  sh.getRange("A2").setValue("Tick to SAVE →").setFontWeight("bold");
  sh.getRange("B2").insertCheckboxes().setBackground("#D7F2DC");
  sh.getRange("C2:E2").merge();
  sh.getRange("C2").setValue("Pick the event, tick attendees, then tick SAVE.").setFontStyle("italic");
  sh.getRange("A3").setValue("EB rank = Early Bird order of arrival (1–10), regular meetings only. Credit blank = 1.")
    .setFontSize(9).setFontColor("#666666");
  sh.getRange("A3:E3").merge();

  // Table headers
  sh.getRange("A4:E4").setValues([["Present", "Member", "EB rank", "Credit", "Notes"]])
    .setFontWeight("bold").setBackground("#17458F").setFontColor("#FFFFFF");
  sh.setFrozenRows(4);

  var n = PAD_LAST_ROW - PAD_FIRST_ROW + 1;
  sh.getRange(PAD_FIRST_ROW, 1, n, 1).insertCheckboxes();
  sh.getRange(PAD_FIRST_ROW, 2, 1, 1).setFormula('=ARRAYFORMULA(Lookup!A2:A' + (n + 1) + ')');
  sh.getRange(PAD_FIRST_ROW, 3, n, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(["1","2","3","4","5","6","7","8","9","10"], true)
      .setAllowInvalid(false)
      .build()
  );
  sh.setColumnWidth(1, 64);
  sh.setColumnWidth(2, 320);
  sh.setColumnWidth(3, 70);
  sh.setColumnWidth(4, 60);
  sh.setColumnWidth(5, 180);
  sh.getRange(PAD_FIRST_ROW, 2, n, 1).protect()
    .setDescription("Member labels come from the Members tab — don't type here.")
    .setWarningOnly(true);
}

function applySmartValidations_(ss) {
  // Attendance + EarlyBird: member and meeting columns accept BOTH the
  // plain ID and the searchable label. Typing a nickname or surname
  // brings up suggestions.
  var att = ss.getSheetByName("Attendance");
  var eb = ss.getSheetByName("EarlyBird");
  // Open-ended ranges (no row number) so the dropdowns keep working no
  // matter how many members or events accumulate over the years.
  var memberSource = ss.getRange("Lookup!A2:B");   // labels + ids
  var meetingSource = ss.getRange("Lookup!C2:D");

  smartDrop_(att, 1, meetingSource, "Type the meeting title, date, or ID.");
  smartDrop_(att, 2, memberSource, "Type a nickname, name, or member ID.");
  smartDrop_(eb, 1, meetingSource, "Type the meeting title, date, or ID.");
  smartDrop_(eb, 3, memberSource, "Type a nickname, name, or member ID.");
}

function smartDrop_(sheet, col, sourceRange, help) {
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(sourceRange, true)
    .setAllowInvalid(true) // old plain-ID rows stay valid; app resolves both
    .setHelpText(help)
    .build();
  sheet.getRange(2, col, sheet.getMaxRows() - 1, 1).setDataValidation(rule);
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
    old.setName("OLD July grid (reference)");
  }

  buildSettings_(ss);
  buildMembers_(ss);
  buildMeetings_(ss);
  buildAttendance_(ss);
  buildEarlyBird_(ss);
  buildLookup_(ss);
  buildEntryPad_(ss);
  applySmartValidations_(ss);

  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert(
    "Done! The 5 data tabs are ready with your July data migrated, and the " +
    "EntryPad tab is set up for fast attendance recording.\n\n" +
    "Your old grid is kept as 'OLD July grid (reference)'."
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
  dropdown_(sh, 6, ["Active", "Inactive"]);
}

function buildMeetings_(ss) {
  var sh = ss.insertSheet("Meetings");
  var data = MEETINGS_.map(function (m) {
    return [m[0], m[1], m[2], m[3], "", "1", ""];
  });
  writeTable_(sh,
    ["meeting_id", "date", "meeting_type", "activity_title",
     "location", "credit_value", "notes"],
    data);
  textColumn_(sh, 2);
  dropdown_(sh, 3, ["regular", "makeup", "special"]);
}

function buildAttendance_(ss) {
  var sh = ss.insertSheet("Attendance");
  var rows = ATTENDANCE_.map(function (pair) {
    return [pair[0], pair[1], "1", ""];
  });
  writeTable_(sh, ["meeting_id", "member_id", "credit_given", "notes"], rows);
}

function buildEarlyBird_(ss) {
  var sh = ss.insertSheet("EarlyBird");
  writeTable_(sh, ["meeting_id", "rank", "member_id", "notes"], []);
  dropdown_(sh, 2, ["1","2","3","4","5","6","7","8","9","10"]);
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
  ["20260701-TREE","2026-07-01","makeup","Tree Planting"],
  ["20260704-MEEAA","2026-07-04","makeup","Joint Project MEEAA"],
  ["20260706-REG","2026-07-06","regular","Induction"],
  ["20260707-RCSM","2026-07-07","makeup","RC Santa Maria"],
  ["20260708-GOV","2026-07-08","makeup","Governor's Visit"],
  ["20260713-REG","2026-07-13","regular","Regular Meeting"],
  ["20260720-REG","2026-07-20","regular","Regular Meeting"],
  ["20260725-MOMMY","2026-07-25","makeup","Malusog si Mommy"],
  ["20260727-REG","2026-07-27","regular","Regular Meeting"],
  ["20260731-PIC","2026-07-31","makeup","Change of Profile Pic"],
  ["20260731-REPOST","2026-07-31","makeup","Repost Infographics"],
  ["20260731-MARKER","2026-07-31","makeup","Photo in Rotary Marker"],
  ["20260731-RESEARCH","2026-07-31","makeup","Research about Rotary"]
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
