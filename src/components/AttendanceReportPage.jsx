import { MonthPicker, prettyDate } from "./Shared.jsx";
import { isCancelled, memberName, monthKey, monthLabel } from "../lib/stats.js";

const WEEK_LABELS = ["Week 1", "Week 2", "Week 3", "Week 4"];

function explicitWeek(meeting) {
  const value = Number.parseInt(meeting.report_week, 10);
  return value >= 1 && value <= 4 ? value - 1 : null;
}

function hasCredit(row) {
  if (row.credit_given === "" || row.credit_given == null) return true;
  return (Number.parseFloat(row.credit_given) || 0) > 0;
}

function nameSort(a, b) {
  return memberName(a).full.localeCompare(memberName(b).full);
}

function dateDistance(a, b) {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`));
}

function uniqueMembers(rows, activeIds, memberById) {
  return [...new Set(
    rows
      .map((row) => row.member_id)
      .filter((memberId) => memberId && activeIds.has(memberId))
  )]
    .map((memberId) => memberById.get(memberId))
    .filter(Boolean)
    .sort(nameSort);
}

export function monthlyAttendanceReport(model, mk) {
  const eligibleMembers = model.members.filter((member) => {
    const status = (member.active_status || "Active").trim().toLowerCase();
    return status === "active";
  });
  const activeIds = new Set(eligibleMembers.map((member) => member.member_id));
  const weeks = WEEK_LABELS.map((label, index) => ({
    index,
    label,
    regularMeetings: [],
    makeupMeetings: [],
    inferredMakeups: [],
    presentMembers: [],
    makeupMembers: [],
    present: 0,
    validMakeup: 0,
    total: 0,
  }));
  const warnings = [];

  const meetings = model.meetings
    .filter((meeting) => !isCancelled(meeting) && monthKey(meeting.date) === mk)
    .sort((a, b) =>
      String(a.date || "").localeCompare(String(b.date || "")) ||
      String(a.meeting_id || "").localeCompare(String(b.meeting_id || ""))
    );
  const regular = meetings.filter(
    (meeting) => (meeting.meeting_type || "").toLowerCase() === "regular"
  );
  const other = meetings.filter(
    (meeting) => (meeting.meeting_type || "").toLowerCase() !== "regular"
  );

  const usedWeeks = new Set();
  regular.filter((meeting) => explicitWeek(meeting) != null).forEach((meeting) => {
    const index = explicitWeek(meeting);
    weeks[index].regularMeetings.push(meeting);
    usedWeeks.add(index);
  });
  regular.filter((meeting) => explicitWeek(meeting) == null).forEach((meeting) => {
    const index = WEEK_LABELS.findIndex((_, candidate) => !usedWeeks.has(candidate));
    if (index < 0) {
      warnings.push(`${meeting.activity_title} (${meeting.date}) is a fifth regular meeting and does not fit the four-column form.`);
      return;
    }
    weeks[index].regularMeetings.push(meeting);
    usedWeeks.add(index);
  });

  other.forEach((meeting) => {
    let index = explicitWeek(meeting);
    let inferred = false;
    if (index == null) {
      const scheduled = weeks.filter((week) => week.regularMeetings.length > 0);
      if (scheduled.length === 0) {
        warnings.push(`${meeting.activity_title} has no scheduled regular meeting to attach its make-up credit to.`);
        return;
      }
      index = scheduled
        .map((week) => ({
          index: week.index,
          distance: Math.min(...week.regularMeetings.map(
            (regularMeeting) => dateDistance(meeting.date, regularMeeting.date)
          )),
        }))
        .sort((a, b) => a.distance - b.distance || a.index - b.index)[0].index;
      inferred = true;
    }
    if (weeks[index].regularMeetings.length === 0) {
      warnings.push(`${meeting.activity_title} is assigned to ${WEEK_LABELS[index]}, which has no scheduled regular meeting.`);
      return;
    }
    weeks[index].makeupMeetings.push(meeting);
    if (inferred) weeks[index].inferredMakeups.push(meeting.meeting_id);
  });

  weeks.forEach((week) => {
    if (week.regularMeetings.length === 0) return;
    const regularIds = new Set(week.regularMeetings.map((meeting) => meeting.meeting_id));
    const makeupIds = new Set(week.makeupMeetings.map((meeting) => meeting.meeting_id));
    const presentRows = model.attendance.filter((row) => regularIds.has(row.meeting_id));
    const makeupRows = model.attendance.filter(
      (row) => makeupIds.has(row.meeting_id) && hasCredit(row)
    );
    week.presentMembers = uniqueMembers(presentRows, activeIds, model.memberById);
    const presentIds = new Set(week.presentMembers.map((member) => member.member_id));
    week.makeupMembers = uniqueMembers(
      makeupRows.filter((row) => !presentIds.has(row.member_id)),
      activeIds,
      model.memberById
    );
    week.present = week.presentMembers.length;
    week.validMakeup = week.makeupMembers.length;
    week.total = week.present + week.validMakeup;
  });

  const scheduledWeeks = weeks.filter((week) => week.regularMeetings.length > 0);
  const total = scheduledWeeks.reduce((sum, week) => sum + week.total, 0);
  const average = scheduledWeeks.length ? total / scheduledWeeks.length : 0;
  const percentage = eligibleMembers.length
    ? (average / eligibleMembers.length) * 100
    : 0;

  return {
    weeks,
    warnings,
    average,
    percentage,
    activeMembers: eligibleMembers.length,
    scheduledWeekCount: scheduledWeeks.length,
  };
}

function fmt(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function MemberNames({ members }) {
  if (members.length === 0) return <span className="muted">None recorded</span>;
  return (
    <span>
      {members.map((member) => memberName(member).full || memberName(member).nickname).join(", ")}
    </span>
  );
}

function MeetingSources({ meetings, inferredIds = [] }) {
  if (meetings.length === 0) return <span className="muted">None</span>;
  return (
    <ul className="report-source-list">
      {meetings.map((meeting) => (
        <li key={meeting.meeting_id}>
          <strong>{meeting.activity_title}</strong> · {prettyDate(meeting.date)}
          <code>{meeting.meeting_id}</code>
          {inferredIds.includes(meeting.meeting_id) && (
            <small>Week inferred from nearest scheduled meeting</small>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function AttendanceReportPage({ model, mk, months, setMonth }) {
  const report = monthlyAttendanceReport(model, mk);

  return (
    <div className="page">
      <section className="card">
        <div className="card__head">
          <div>
            <span className="eyebrow">Rotary documentation</span>
            <h2>Attendance Report · {monthLabel(mk)}</h2>
          </div>
          <MonthPicker options={months} value={mk} onChange={setMonth} />
        </div>

        <p className="muted report-intro">
          Each column represents a scheduled, non-cancelled regular meeting from the
          Meetings tab. Months with fewer meetings use fewer reporting weeks, and the
          monthly average divides only by those scheduled weeks. Set a meeting’s
          optional <code>report_week</code> to 1–4 when its assignment needs overriding.
        </p>

        {report.warnings.length > 0 && (
          <div className="report-warnings">
            <strong>Report setup needs attention</strong>
            <ul>{report.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
          </div>
        )}

        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                <th scope="col">Attendance measure</th>
                {report.weeks.map((week) => (
                  <th scope="col" key={week.label}>
                    {week.label}
                    <small>
                      {week.regularMeetings.length
                        ? week.regularMeetings.map((meeting) => prettyDate(meeting.date)).join(" / ")
                        : "Not scheduled"}
                    </small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Members Present</th>
                {report.weeks.map((week) => <td key={week.label}>{week.regularMeetings.length ? week.present : "—"}</td>)}
              </tr>
              <tr>
                <th scope="row">Members with Valid Make-Up</th>
                {report.weeks.map((week) => <td key={week.label}>{week.regularMeetings.length ? week.validMakeup : "—"}</td>)}
              </tr>
              <tr className="report-table__total">
                <th scope="row">Total Attendance</th>
                {report.weeks.map((week) => <td key={week.label}>{week.regularMeetings.length ? week.total : "—"}</td>)}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="report-average">
          <div>
            <span>Average Attendance for the Month</span>
            <strong>{fmt(report.average)}</strong>
            <small>members across {report.scheduledWeekCount} scheduled week{report.scheduledWeekCount === 1 ? "" : "s"}</small>
          </div>
          <div>
            <span>Average Attendance Rate</span>
            <strong>{fmt(report.percentage)}%</strong>
            <small>of {report.activeMembers} active members</small>
          </div>
        </div>

        <section className="report-evidence">
          <div className="report-evidence__head">
            <div>
              <span className="eyebrow">Audit trail</span>
              <h3>Where each number comes from</h3>
            </div>
            <p className="muted">Meeting IDs match the Meetings and Attendance sheet rows.</p>
          </div>
          <div className="report-evidence__grid">
            {report.weeks.map((week) => (
              <details className="report-week-detail" key={week.label} open={week.index === 0}>
                <summary>
                  <strong>{week.label}</strong>
                  <span>{week.regularMeetings.length ? `${week.total} total` : "Not scheduled"}</span>
                </summary>
                {week.regularMeetings.length ? (
                  <div className="report-week-detail__body">
                    <dl>
                      <dt>Scheduled regular meeting</dt>
                      <dd><MeetingSources meetings={week.regularMeetings} /></dd>
                      <dt>Present ({week.present})</dt>
                      <dd><MemberNames members={week.presentMembers} /></dd>
                      <dt>Make-up activities</dt>
                      <dd>
                        <MeetingSources
                          meetings={week.makeupMeetings}
                          inferredIds={week.inferredMakeups}
                        />
                      </dd>
                      <dt>Valid make-up members ({week.validMakeup})</dt>
                      <dd><MemberNames members={week.makeupMembers} /></dd>
                    </dl>
                  </div>
                ) : (
                  <p className="muted report-week-detail__empty">
                    No non-cancelled regular meeting is assigned to this reporting week,
                    so it is excluded from the monthly average.
                  </p>
                )}
              </details>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}
