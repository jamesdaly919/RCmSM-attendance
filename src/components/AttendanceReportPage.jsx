import { MonthPicker, prettyDate } from "./Shared.jsx";
import { attendanceCredit, isCancelled, memberName, monthKey, monthLabel, todayInManila } from "../lib/stats.js";

const WEEK_LABELS = ["Week 1", "Week 2", "Week 3", "Week 4"];

function explicitWeek(meeting) {
  const value = Number.parseInt(meeting.report_week, 10);
  return value >= 1 && value <= 4 ? value - 1 : null;
}

function attendanceMode(value) {
  const mode = String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (mode === "online") return "Online";
  if (["in-person", "in person", "inperson"].includes(mode)) return "In-person";
  return "";
}

function displayName(member) {
  const name = memberName(member);
  return name.nickname ? `${name.nickname} — ${name.full}` : name.full;
}

function sortMembers(a, b) {
  return displayName(a).localeCompare(displayName(b));
}

function uniqueMembers(rows, activeIds, memberById) {
  return [...new Set(rows.map((row) => row.member_id).filter((id) => activeIds.has(id)))]
    .map((id) => memberById.get(id)).filter(Boolean).sort(sortMembers);
}

export function monthlyAttendanceReport(model, mk, today = todayInManila()) {
  const eligibleMembers = model.members
    .filter((member) => (member.active_status || "Active").trim().toLowerCase() === "active")
    .sort(sortMembers);
  const activeIds = new Set(eligibleMembers.map((member) => member.member_id));
  const meetings = model.meetings
    .filter((meeting) => !isCancelled(meeting) && monthKey(meeting.date) === mk)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) ||
      String(a.meeting_id).localeCompare(String(b.meeting_id)));
  const regular = meetings.filter((meeting) =>
    String(meeting.meeting_type).toLowerCase() === "regular");
  const makeups = meetings.filter((meeting) =>
    String(meeting.meeting_type).toLowerCase() !== "regular");
  const weeks = WEEK_LABELS.map((label, index) => ({
    label, index, regularMeetings: [], completedMeetings: [], onSite: [], online: [], modeMissing: [],
    presentMembers: [], absentMembers: [],
  }));
  const warnings = [];
  const usedWeeks = new Set();

  regular.filter((meeting) => explicitWeek(meeting) != null).forEach((meeting) => {
    const index = explicitWeek(meeting);
    weeks[index].regularMeetings.push(meeting);
    usedWeeks.add(index);
  });
  regular.filter((meeting) => explicitWeek(meeting) == null).forEach((meeting) => {
    const index = WEEK_LABELS.findIndex((_, candidate) => !usedWeeks.has(candidate));
    if (index < 0) {
      warnings.push(`${meeting.activity_title} (${meeting.date}) is a fifth regular meeting and is excluded from the four-column report.`);
      return;
    }
    weeks[index].regularMeetings.push(meeting);
    usedWeeks.add(index);
  });

  const seenPairs = new Set();
  weeks.forEach((week) => {
    week.completedMeetings = week.regularMeetings.filter((meeting) => meeting.date < today);
    const ids = new Set(week.completedMeetings.map((meeting) => meeting.meeting_id));
    const rows = model.attendance.filter((row) => {
      const pair = `${row.meeting_id}|${row.member_id}`;
      if (!ids.has(row.meeting_id) || !activeIds.has(row.member_id) || seenPairs.has(pair)) return false;
      seenPairs.add(pair);
      return true;
    });
    week.presentMembers = uniqueMembers(rows, activeIds, model.memberById);
    const presentIds = new Set(week.presentMembers.map((member) => member.member_id));
    week.absentMembers = week.completedMeetings.length
      ? eligibleMembers.filter((member) => !presentIds.has(member.member_id)) : [];
    week.onSite = uniqueMembers(rows.filter((row) => attendanceMode(row.attendance_mode) === "In-person"), activeIds, model.memberById);
    week.online = uniqueMembers(rows.filter((row) => attendanceMode(row.attendance_mode) === "Online"), activeIds, model.memberById);
    week.modeMissing = uniqueMembers(rows.filter((row) => !attendanceMode(row.attendance_mode)), activeIds, model.memberById);
  });

  const required = Math.min(4, regular.length);
  const regularIds = new Set(regular.map((meeting) => meeting.meeting_id));
  const makeupById = new Map(makeups.map((meeting) => [meeting.meeting_id, meeting]));
  const memberGoals = eligibleMembers.map((member) => {
    const memberRows = model.attendance.filter((row) => row.member_id === member.member_id);
    const regularAttended = new Set(memberRows.filter((row) => regularIds.has(row.meeting_id)).map((row) => row.meeting_id));
    const makeupRows = [...new Map(memberRows
      .filter((row) => makeupById.has(row.meeting_id) && attendanceCredit(row, makeupById.get(row.meeting_id)) > 0)
      .map((row) => [row.meeting_id, row])).values()]
      .sort((a, b) => String(makeupById.get(a.meeting_id).date).localeCompare(String(makeupById.get(b.meeting_id).date)));
    const regularCredits = Math.min(required, regularAttended.size);
    let remaining = Math.max(0, required - regularCredits);
    const used = [], extra = [];
    makeupRows.forEach((row) => {
      const awarded = attendanceCredit(row, makeupById.get(row.meeting_id));
      const appliedCredits = Math.min(remaining, awarded);
      if (appliedCredits > 0) used.push({ ...row, appliedCredits });
      else extra.push(row);
      remaining -= appliedCredits;
    });
    return { member, regular: regularCredits, used, extra,
      makeupCreditsUsed: used.reduce((sum, row) => sum + row.appliedCredits, 0) };
  });
  const goalByPair = new Map(memberGoals.flatMap((goal) =>
    goal.used.map((row) => [`${row.meeting_id}|${row.member_id}`, row.appliedCredits])));
  const makeupDetails = makeups.map((meeting) => {
    const rows = model.attendance.filter((row) => row.meeting_id === meeting.meeting_id && activeIds.has(row.member_id));
    const attendees = uniqueMembers(rows, activeIds, model.memberById);
    const attendeeIds = new Set(attendees.map((member) => member.member_id));
    return {
      meeting,
      isUpcoming: meeting.date >= today,
      calendarWeek: Math.min(4, Math.floor((Number(String(meeting.date).slice(8, 10)) - 1) / 7) + 1),
      attendees: attendees.map((member) => ({
        member,
        creditsUsed: goalByPair.get(`${meeting.meeting_id}|${member.member_id}`) || 0,
      })),
      absent: meeting.date >= today ? [] : eligibleMembers.filter((member) => !attendeeIds.has(member.member_id)),
    };
  });

  const completed = weeks.filter((week) => week.completedMeetings.length);
  const average = completed.length
    ? completed.reduce((sum, week) => sum + week.presentMembers.length, 0) / completed.length : 0;
  return {
    eligibleMembers, weeks, warnings, required, memberGoals, makeupDetails, average,
    percentage: eligibleMembers.length ? average / eligibleMembers.length * 100 : 0,
    completedWeekCount: completed.length,
    modeTotals: {
      inPerson: weeks.reduce((sum, week) => sum + week.onSite.length, 0),
      online: weeks.reduce((sum, week) => sum + week.online.length, 0),
      unrecorded: weeks.reduce((sum, week) => sum + week.modeMissing.length, 0),
    },
  };
}

function fmt(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function MemberList({ members, empty = "None" }) {
  if (!members.length) return <span className="muted">{empty}</span>;
  return <ul className="report-member-list">{members.map((member) =>
    <li key={member.member_id}>{displayName(member)}</li>)}</ul>;
}

function MeetingList({ meetings }) {
  if (!meetings.length) return <span className="muted">Not scheduled</span>;
  return <ul className="report-source-list">{meetings.map((meeting) =>
    <li key={meeting.meeting_id}><strong>{meeting.activity_title}</strong> · {prettyDate(meeting.date)} <code>{meeting.meeting_id}</code></li>)}</ul>;
}

export default function AttendanceReportPage({ model, mk, months, setMonth }) {
  const report = monthlyAttendanceReport(model, mk);
  return <div className="page"><section className="card">
    <div className="card__head"><div><span className="eyebrow">Rotary documentation</span><h2>Attendance Report · {monthLabel(mk)}</h2></div>
      <MonthPicker options={months} value={mk} onChange={setMonth} /></div>
    <p className="muted report-intro">Weekly figures come only from scheduled regular meetings. Makeup credits earned anywhere in the same month may fill missing credits toward the {report.required}/{report.required} goal. A two-credit event may fill two gaps, but does not change the weekly on-site, online, or absent figures.</p>
    {report.warnings.length > 0 && <div className="report-warnings"><strong>Report setup needs attention</strong><ul>{report.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}

    <div className="report-table-wrap"><table className="report-table"><thead><tr><th>Regular meeting measure</th>{report.weeks.map((week) =>
      <th key={week.label}>{week.label}<small>{week.regularMeetings.length ? week.regularMeetings.map((meeting) => prettyDate(meeting.date)).join(" / ") : "Not scheduled"}</small></th>)}</tr></thead>
      <tbody>{[
        ["Members on-site", "onSite"], ["Members online", "online"], ["Mode not recorded", "modeMissing"],
        ["Members present", "presentMembers"], ["Members absent", "absentMembers"],
      ].map(([label, key]) => <tr key={key} className={key === "presentMembers" ? "report-table__total" : ""}><th>{label}</th>{report.weeks.map((week) =>
        <td key={week.label}>{week.completedMeetings.length ? week[key].length : week.regularMeetings.length ? "Pending" : "—"}</td>)}</tr>)}</tbody></table></div>

    <div className="report-average"><div><span>Average regular-meeting attendance</span><strong>{report.completedWeekCount ? fmt(report.average) : "—"}</strong><small>across {report.completedWeekCount} completed reporting week{report.completedWeekCount === 1 ? "" : "s"}</small></div>
      <div><span>Average attendance rate</span><strong>{report.completedWeekCount ? `${fmt(report.percentage)}%` : "—"}</strong><small>of {report.eligibleMembers.length} active members</small></div></div>
    <section className="report-mode-summary"><div><span className="eyebrow">Regular meetings only</span><h3>Online vs in-person</h3></div><div className="report-mode-summary__grid">
      <div className="report-mode-card report-mode-card--person"><span>On-site</span><strong>{report.modeTotals.inPerson}</strong></div>
      <div className="report-mode-card report-mode-card--online"><span>Online</span><strong>{report.modeTotals.online}</strong></div>
      <div className="report-mode-card report-mode-card--missing"><span>Mode not recorded</span><strong>{report.modeTotals.unrecorded}</strong></div>
    </div></section>

    <section className="report-evidence"><div className="report-evidence__head"><div><span className="eyebrow">Weekly audit trail</span><h3>Where each regular-meeting number comes from</h3></div></div>
      <div className="report-evidence__grid">{report.weeks.map((week) => <details className="report-week-detail" key={week.label} open={week.index === 0}><summary><strong>{week.label}</strong><span>{week.completedMeetings.length ? `${week.presentMembers.length} present · ${week.absentMembers.length} absent` : week.regularMeetings.length ? "Pending" : "Not scheduled"}</span></summary>
        {week.completedMeetings.length ? <div className="report-week-detail__body"><dl><dt>Meeting</dt><dd><MeetingList meetings={week.completedMeetings} /></dd><dt>On-site ({week.onSite.length})</dt><dd><MemberList members={week.onSite} /></dd><dt>Online ({week.online.length})</dt><dd><MemberList members={week.online} /></dd><dt>Mode missing ({week.modeMissing.length})</dt><dd><MemberList members={week.modeMissing} /></dd><dt>Absent ({week.absentMembers.length})</dt><dd><MemberList members={week.absentMembers} /></dd></dl></div> : <p className="muted report-week-detail__empty">{week.regularMeetings.length ? "This meeting has not happened yet; no attendance or absences are counted." : "No non-cancelled regular meeting is assigned to this reporting week."}</p>}
      </details>)}</div></section>

    <section className="report-section"><div className="report-evidence__head"><div><span className="eyebrow">Monthly goal roster</span><h3>Regular attendance plus makeup credits used</h3></div></div>
      <div className="report-table-wrap"><table className="report-table report-table--roster"><thead><tr><th>Member</th><th>Regular</th><th>Makeup used</th><th>Result</th><th>Specific makeup meeting</th></tr></thead><tbody>{report.memberGoals.map((goal) => {
        const total = Math.min(report.required, goal.regular + goal.makeupCreditsUsed);
        return <tr key={goal.member.member_id}><th>{displayName(goal.member)}</th><td>{goal.regular}</td><td>{goal.makeupCreditsUsed}</td><td><strong>{total}/{report.required}</strong></td><td>{goal.used.length ? <ul className="report-source-list">{goal.used.map((row) => { const meeting = report.makeupDetails.find((detail) => detail.meeting.meeting_id === row.meeting_id)?.meeting; return meeting && <li key={row.meeting_id}><strong>{meeting.activity_title}</strong> · {prettyDate(meeting.date)} · {row.appliedCredits} credit{row.appliedCredits === 1 ? "" : "s"} used <code>{row.meeting_id}</code></li>; })}</ul> : <span className="muted">—</span>}</td></tr>;
      })}</tbody></table></div></section>

    <section className="report-section"><div className="report-evidence__head"><div><span className="eyebrow">Makeup transparency</span><h3>Every makeup/special meeting in the month</h3></div><p className="muted">Calendar week is shown for scheduling context only; credit may fill any missing regular attendance in this month.</p></div>
      <div className="report-makeup-grid">{report.makeupDetails.length ? report.makeupDetails.map((detail) => <article className="report-makeup-card" key={detail.meeting.meeting_id}><header><span>Calendar Week {detail.calendarWeek}</span><h4>{detail.meeting.activity_title}</h4><small>{prettyDate(detail.meeting.date)} · {detail.meeting.meeting_id} · worth {detail.meeting.credit_value || 1} credit{String(detail.meeting.credit_value || 1) === "1" ? "" : "s"}</small></header><div>{detail.isUpcoming ? <p className="muted">Pending — attendance and absences are not counted yet.</p> : <><h5>Attended ({detail.attendees.length})</h5>{detail.attendees.length ? <ul className="report-member-list">{detail.attendees.map(({ member, creditsUsed }) => <li key={member.member_id}>{displayName(member)} <em className={creditsUsed ? "report-counts" : "report-extra"}>{creditsUsed ? `${creditsUsed} credit${creditsUsed === 1 ? "" : "s"} used` : "Extra / goal already met"}</em></li>)}</ul> : <span className="muted">None recorded</span>}<h5>Did not attend ({detail.absent.length})</h5><MemberList members={detail.absent} /></>}</div></article>) : <p className="muted">No makeup or special meetings are scheduled this month.</p>}</div>
    </section>
  </section></div>;
}
