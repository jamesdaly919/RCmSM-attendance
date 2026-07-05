import { SegmentRing } from "./Ring.jsx";
import { MonthPicker, MemberPicker, StatusChip, prettyDate, TypeTag } from "./Shared.jsx";
import {
  memberMonth, memberYearCredits, memberMeetingsAttended, upcomingMeetings,
  monthKey, monthLabel, memberName,
} from "../lib/stats.js";

export default function MemberPage({ model, memberId, mk, months, setMonth, today, go }) {
  const member = model.memberById.get(memberId);

  if (!member) {
    return (
      <div className="page">
        <section className="card">
          <h2>Find a member</h2>
          <p className="muted">Search by nickname or name to see attendance progress.</p>
          <MemberPicker members={model.members} onPick={(id) => go(`#/members/${id}`)} />
          <ul className="member-index">
            {model.members.map((m) => (
              <li key={m.member_id}>
                <button onClick={() => go(`#/members/${m.member_id}`)}>
                  <strong>{memberName(m).nickname}</strong> <span>{memberName(m).full}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  const n = memberName(member);
  const stat = memberMonth(model, memberId, mk);
  const inactive = (member.active_status || "").toLowerCase() === "inactive";
  const ebMonth = model.ebMonthly.get(memberId)?.get(mk) || 0;
  const ebYear = model.ebYearly.get(memberId) || 0;
  const yearCredits = memberYearCredits(model, memberId);
  const next = upcomingMeetings(model, today, 1)[0];

  const attendedThisMonth = memberMeetingsAttended(model, memberId)
    .filter((mt) => monthKey(mt.date) === mk);

  // Yearly strip: every month of the Rotary year so far
  const strip = months.slice().reverse().map((key) => ({
    key,
    stat: memberMonth(model, memberId, key),
  }));

  return (
    <div className="page">
      <section className="card member-hero">
        <div className="member-hero__head">
          <div>
            <p className="eyebrow">Member</p>
            <h1>{n.nickname}</h1>
            <p className="muted">{n.full}{inactive ? " · Inactive" : ""}</p>
          </div>
          <MonthPicker options={months} value={mk} onChange={setMonth} />
        </div>

        <div className="member-hero__ring">
          <SegmentRing earned={stat.credits} required={stat.required} size={210}>
            <span className="ring-big">
              {Math.min(stat.credits, stat.required)}<small>/{stat.required}</small>
            </span>
            <span className="ring-sub">{monthLabel(mk)}</span>
          </SegmentRing>
          <StatusChip stat={stat} />
          {stat.status === "needs" && (
            <p className="member-hero__hint">
              {stat.remaining} more Monday meeting{stat.remaining > 1 ? "s" : ""} or makeup
              activit{stat.remaining > 1 ? "ies" : "y"} will complete this month.
            </p>
          )}
          {stat.status === "exceeded" && (
            <p className="member-hero__hint">Went {stat.extra} beyond the requirement — thank you for the extra service!</p>
          )}
        </div>

        <div className="member-hero__grid">
          <div className="stat"><span className="stat__num">{stat.regular}</span><span className="stat__label">regular meetings</span></div>
          <div className="stat"><span className="stat__num">{stat.makeup}</span><span className="stat__label">makeup / special</span></div>
          <div className="stat"><span className="stat__num">{ebMonth}</span><span className="stat__label">Early Bird this month</span></div>
          <div className="stat"><span className="stat__num">{ebYear}</span><span className="stat__label">Early Bird this Rotary year</span></div>
        </div>

        {next && (
          <p className="member-hero__next">
            Next chance to attend: <strong>{next.activity_title}</strong> · {prettyDate(next.date)}
          </p>
        )}
      </section>

      <section className="card">
        <h2>Attended in {monthLabel(mk)}</h2>
        {attendedThisMonth.length === 0 ? (
          <p className="muted">Nothing recorded for this month yet.</p>
        ) : (
          <ul className="event-list">
            {attendedThisMonth.map((mt) => (
              <li key={mt.meeting_id}>
                <div>
                  <strong>{mt.activity_title}</strong>
                  <span className="muted">{prettyDate(mt.date)}</span>
                </div>
                <TypeTag type={mt.meeting_type} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Rotary year {monthKey(model.ryStart).slice(0, 4)}–{monthKey(model.ryEnd).slice(2, 4) ? model.ryEnd.slice(2, 4) : ""}</h2>
        <p className="muted">{yearCredits} total credits · {ebYear} Early Bird awards so far</p>
        <ul className="year-strip">
          {strip.map(({ key, stat: s }) => (
            <li key={key} className={`year-strip__month year-strip__month--${s.status}`}>
              <span className="year-strip__label">{monthLabel(key).slice(0, 3)}</span>
              <span className="year-strip__value">
                {s.status === "needs" ? `${s.credits}/${s.required}` : s.status === "exceeded" ? `✓ +${s.extra}` : "✓"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
