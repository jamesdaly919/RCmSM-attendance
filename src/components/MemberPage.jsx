import { useState } from "react";
import { SegmentRing } from "./Ring.jsx";
import { MonthPicker, MemberPicker, StatusChip, prettyDate, TypeTag } from "./Shared.jsx";
import { REPORT_URL } from "../config.js";
import {
  memberMonth, memberYearCredits, memberYearProjects, memberMeetingsAttended,
  upcomingMeetings, pendingReportSet, isCancelled,
  monthKey, monthLabel, memberName,
} from "../lib/stats.js";

export default function MemberPage({ model, memberId, mk, months, setMonth, today, go }) {
  const member = model.memberById.get(memberId);

  if (!member) {
    return (
      <div className="page">
        <section className="card">
          <h2>Find a member</h2>
          <p className="muted">Type a nickname or name, or tap a name in the list below.</p>
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
  const yearProjects = memberYearProjects(model, memberId);
  const next = upcomingMeetings(model, today, 1)[0];

  // This month's events with attended / missed / upcoming state
  const attendedIds = new Set(
    memberMeetingsAttended(model, memberId).map((mt) => mt.meeting_id)
  );
  const monthEvents = model.meetings
    .filter((mt) => !isCancelled(mt) && monthKey(mt.date) === mk)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((mt) => ({
      mt,
      state: attendedIds.has(mt.meeting_id)
        ? "attended"
        : mt.date >= today // today's event isn't "missed" while the day is still ongoing
        ? "upcoming"
        : "missed",
    }));

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
          <p className="ring-explain">
            Each piece of the circle = 1 attendance credit. This month needs{" "}
            <strong>{stat.required}</strong>. When the circle is full, it turns{" "}
            <strong className="gold-word">gold</strong> — the month is complete.
          </p>
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
          <div className="stat"><span className="stat__num">{stat.regular}</span><span className="stat__label">regular meetings this month</span></div>
          <div className="stat"><span className="stat__num">{stat.makeup}</span><span className="stat__label">makeup / special this month</span></div>
          <div className="stat"><span className="stat__num">{ebMonth}</span><span className="stat__label">Early Bird awards this month</span></div>
          <div className="stat"><span className="stat__num">{ebYear}</span><span className="stat__label">Early Bird this Rotary year</span></div>
        </div>

        {next && (
          <p className="member-hero__next">
            Next chance to attend: <strong>{next.activity_title}</strong> · {prettyDate(next.date)}
          </p>
        )}
      </section>

      <section className="card">
        <h2>{monthLabel(mk)} events</h2>
        <p className="muted">
          ✓ green = attended · ✗ = missed · 🔜 = still coming up. If an event says
          "missed" but you were actually there, tap the red button to tell the admin.
        </p>
        {monthEvents.length === 0 ? (
          <p className="muted">No events recorded for this month yet.</p>
        ) : (
          <ul className="event-check-list">
            {monthEvents.map(({ mt, state }) => (
              <EventRow
                key={mt.meeting_id}
                mt={mt}
                state={state}
                member={member}
                model={model}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Rotary year {model.ryStart.slice(0, 4)}–{model.ryEnd.slice(2, 4)}</h2>
        <p className="muted">
          {yearCredits} attendance credits · {yearProjects} projects · {ebYear} Early
          Bird awards so far. ✓ = that month was completed.
        </p>
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

// One event row with attended/missed/upcoming state and the report flow.
function EventRow({ mt, state, member, model }) {
  const pending = pendingReportSet(model);
  const alreadyReported = pending.has(member.member_id + "|" + mt.meeting_id);
  const [phase, setPhase] = useState(alreadyReported ? "reported" : "idle"); // idle | form | sending | sent | reported
  const [note, setNote] = useState("");

  const icons = { attended: "✓", missed: "✗", upcoming: "🔜" };
  const labels = { attended: "Attended", missed: "Missed", upcoming: "Coming up" };

  async function send() {
    setPhase("sending");
    const payload = {
      member_id: member.member_id,
      member_name: `${memberName(member).nickname} (${memberName(member).full})`,
      meeting_id: mt.meeting_id,
      event_title: `${mt.activity_title} — ${mt.date}`,
      message: note.trim(),
    };
    try {
      await fetch(REPORT_URL, {
        method: "POST",
        mode: "no-cors", // Apps Script web apps don't answer with CORS headers; fire-and-forget
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload),
      });
      setPhase("sent");
    } catch {
      setPhase("idle");
      alert("Could not send the report. Please check your internet connection and try again.");
    }
  }

  return (
    <li className={`event-check event-check--${state}`}>
      <div className="event-check__main">
        <span className={`event-check__mark event-check__mark--${state}`} aria-hidden="true">
          {icons[state]}
        </span>
        <div className="event-check__info">
          <strong>{mt.activity_title}</strong>
          <span className="muted">{prettyDate(mt.date)} · {labels[state]}</span>
        </div>
        <TypeTag type={mt.meeting_type} />
      </div>

      {state === "missed" && REPORT_URL && phase === "idle" && (
        <button className="report-btn" onClick={() => setPhase("form")}>
          I was there — tell the admin
        </button>
      )}
      {state === "missed" && phase === "form" && (
        <div className="report-form">
          <p>This sends a note to the club admin saying you attended{" "}
            <strong>{mt.activity_title}</strong> but it isn't recorded yet.</p>
          <input
            type="text"
            value={note}
            maxLength={200}
            placeholder="Optional: add a short note"
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="report-form__actions">
            <button className="report-btn" onClick={send}>Send to admin</button>
            <button className="report-cancel" onClick={() => setPhase("idle")}>Cancel</button>
          </div>
        </div>
      )}
      {phase === "sending" && <p className="report-status">Sending…</p>}
      {(phase === "sent" || phase === "reported") && (
        <p className="report-status report-status--ok">
          ✓ Reported — the admin will review it. Once fixed, this will show as Attended.
        </p>
      )}
    </li>
  );
}
