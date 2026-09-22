import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { createServer } from "vite";
import { attendanceCredit, buildModel, memberMonth } from "../src/lib/stats.js";

const members = [
  { member_id: "M049", nickname: "FAITH", first_name: "Jamesie", last_name: "Yap", active_status: "Active" },
  { member_id: "M037", nickname: "MARCY", first_name: "Marcelina", last_name: "Perez", active_status: "Active" },
  { member_id: "M020", nickname: "TINA", first_name: "Cristina", last_name: "Imperio", active_status: "Active" },
];
const meetings = [
  { meeting_id: "20260907-REG", date: "2026-09-07", meeting_type: "regular", activity_title: "Regular Meeting", credit_value: "1" },
  { meeting_id: "20260914-REG", date: "2026-09-14", meeting_type: "regular", activity_title: "Regular Meeting", credit_value: "1" },
  { meeting_id: "20260921-REG", date: "2026-09-21", meeting_type: "regular", activity_title: "Regular Meeting", credit_value: "1" },
  { meeting_id: "20260928-REG", date: "2026-09-28", meeting_type: "regular", activity_title: "Regular Meeting", credit_value: "1" },
  { meeting_id: "20260919-RCKALIBO", date: "2026-09-19", meeting_type: "makeup", activity_title: "RC Kalibo Induction", credit_value: "2" },
  { meeting_id: "20260920-RCBORACAY", date: "2026-09-20", meeting_type: "makeup", activity_title: "RC Boracay Induction", credit_value: "2" },
];
const attendance = [
  { meeting_id: "20260907-REG", member_id: "M049", credit_given: "1" },
  { meeting_id: "20260914-REG", member_id: "M049", credit_given: "1" },
  ...["M049", "M037"].flatMap((member_id) =>
    ["20260919-RCKALIBO", "20260920-RCBORACAY"].map((meeting_id) =>
      ({ meeting_id, member_id, credit_given: "2" }))),
  { meeting_id: "20260920-RCBORACAY", member_id: "M020", credit_given: "2" },
];

test("meeting default, attendance override, and zero credits stay distinct", () => {
  const meeting = { credit_value: "2" };
  assert.equal(attendanceCredit({ credit_given: "" }, meeting), 2);
  assert.equal(attendanceCredit({ credit_given: "1" }, meeting), 1);
  assert.equal(attendanceCredit({ credit_given: "0" }, meeting), 0);
});

test("September two-credit events feed member totals and the monthly goal report", async () => {
  const model = buildModel({
    settings: { monthly_required_attendance: 4, early_bird_slots_per_regular_meeting: 10,
      current_rotary_year_start: "2026-07-01", current_rotary_year_end: "2027-06-30" },
    members, meetings, attendance, earlybird: [], reports: [],
  });
  assert.equal(memberMonth(model, "M049", "2026-09").credits, 6);
  assert.equal(memberMonth(model, "M037", "2026-09").credits, 4);
  assert.equal(memberMonth(model, "M020", "2026-09").credits, 2);

  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { monthlyAttendanceReport } = await vite.ssrLoadModule("/src/components/AttendanceReportPage.jsx");
    const report = monthlyAttendanceReport(model, "2026-09", "2026-09-22");
    const goal = (id) => report.memberGoals.find((item) => item.member.member_id === id);
    assert.equal(goal("M049").makeupCreditsUsed, 2);
    assert.equal(goal("M049").extra.length, 1);
    assert.equal(goal("M037").makeupCreditsUsed, 4);
    assert.deepEqual(goal("M037").used.map((row) => row.appliedCredits), [2, 2]);
    assert.equal(goal("M020").makeupCreditsUsed, 2);
    assert.equal(report.completedWeekCount, 3);
    assert.equal(report.weeks[3].absentMembers.length, 0);
    assert.equal(report.weeks[3].completedMeetings.length, 0);
    assert.equal(report.required, 4); // Upcoming week still sets the full-month goal.
    assert.equal(report.average, 2 / 3); // Future week's zero is not averaged in.
    const meetingDay = monthlyAttendanceReport(model, "2026-09", "2026-09-28");
    assert.equal(meetingDay.completedWeekCount, 3); // Count only after the date passes.
    const afterMeeting = monthlyAttendanceReport(model, "2026-09", "2026-09-29");
    assert.equal(afterMeeting.completedWeekCount, 4);
    assert.equal(afterMeeting.weeks[3].absentMembers.length, 3);
  } finally {
    await vite.close();
  }
});

test("Apps Script uses the meeting value when EntryPad credit is blank", () => {
  const context = vm.createContext({});
  vm.runInContext(readFileSync(new URL("../apps-script/setup-sheet.gs", import.meta.url), "utf8"), context);
  assert.equal(context.attendanceCreditValue_("", { credit_value: 2 }), 2);
  assert.equal(context.attendanceCreditValue_(1, { credit_value: 2 }), 1);
  assert.equal(context.attendanceCreditValue_(0, { credit_value: 2 }), 0);
});
