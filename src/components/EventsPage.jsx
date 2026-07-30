import { useState } from "react";
import { MonthPicker, prettyDate, TypeTag } from "./Shared.jsx";
import { monthKey, monthLabel, memberName, isCancelled, isProject } from "../lib/stats.js";

function byName(a, b) {
  return memberName(a).full.localeCompare(memberName(b).full);
}

function RosterList({ members, go, emptyText }) {
  if (members.length === 0) {
    return <p className="muted event-roster__empty">{emptyText}</p>;
  }
  return (
    <ul className="event-roster__names">
      {members.map((member) => {
        const name = memberName(member);
        return (
          <li key={member.member_id}>
            <button onClick={() => go(`#/members/${member.member_id}`)}>
              <span>{name.full || name.nickname}</span>
              {name.nickname && name.nickname !== name.full && <small>{name.nickname}</small>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default function EventsPage({ model, mk, months, setMonth, today, go }) {
  const [openEventId, setOpenEventId] = useState(null);
  const meetings = model.meetings
    .filter((mt) => monthKey(mt.date) === mk)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return (
    <div className="page">
      <section className="card">
        <div className="card__head">
          <h2>Events · {monthLabel(mk)}</h2>
          <MonthPicker options={months} value={mk} onChange={setMonth} />
        </div>
        <p className="muted">
          Every meeting and activity this month. Click an event to see who attended
          and whose attendance has not been recorded. Cancelled events are greyed out
          and don't count for anyone.
        </p>
        {meetings.length === 0 ? (
          <p className="muted">No meetings or activities recorded for this month yet.</p>
        ) : (
          <ul className="event-cards">
            {meetings.map((mt) => {
              const cancelled = isCancelled(mt);
              const count = model.meetingAttendance.get(mt.meeting_id) || 0;
              const birds = model.ebByMeeting.get(mt.meeting_id) || [];
              const isRegular = (mt.meeting_type || "").toLowerCase() === "regular";
              const expanded = openEventId === mt.meeting_id;
              const attendeeIds = new Set(
                model.attendance
                  .filter((row) => row.meeting_id === mt.meeting_id && row.member_id)
                  .map((row) => row.member_id)
              );
              const attendees = [...attendeeIds]
                .map((id) => model.memberById.get(id))
                .filter(Boolean)
                .sort(byName);
              const notRecorded = model.activeMembers
                .filter((member) => !attendeeIds.has(member.member_id))
                .sort(byName);
              const completed = mt.date < today;

              return (
                <li
                  key={mt.meeting_id}
                  className={"event-card" + (cancelled ? " event-card--cancelled" : "")}
                >
                  <button
                    type="button"
                    className="event-card__summary"
                    aria-expanded={expanded}
                    aria-controls={`event-roster-${mt.meeting_id}`}
                    onClick={() => setOpenEventId(expanded ? null : mt.meeting_id)}
                  >
                    <div className="event-card__top">
                      <div>
                        <strong>{mt.activity_title}</strong>
                        <span className="muted">
                          {prettyDate(mt.date)}
                          {mt.location ? ` · ${mt.location}` : ""}
                        </span>
                      </div>
                      <div className="event-card__tags">
                        {cancelled && <span className="typetag typetag--cancelled">Cancelled</span>}
                        {!cancelled && isProject(mt) && <span className="typetag typetag--project">Project</span>}
                        <TypeTag type={mt.meeting_type} />
                      </div>
                    </div>
                    {cancelled ? (
                      <p className="event-card__count">
                        This event was cancelled — it doesn't count toward anyone's attendance.
                      </p>
                    ) : (
                      <p className="event-card__count">
                        {count} attendee{count === 1 ? "" : "s"} recorded
                        {mt.credit_value && mt.credit_value !== "1" ? ` · worth ${mt.credit_value} credits` : ""}
                      </p>
                    )}
                    <span className="event-card__expand">
                      {expanded ? "Hide names" : "Show names"}
                    </span>
                  </button>

                  {expanded && (
                    <div className="event-roster" id={`event-roster-${mt.meeting_id}`}>
                      {cancelled ? (
                        <p className="muted event-roster__cancelled">
                          No attendance is expected for a cancelled event.
                        </p>
                      ) : (
                        <>
                          <section>
                            <h3>Attended <span>{attendees.length}</span></h3>
                            <RosterList
                              members={attendees}
                              go={go}
                              emptyText="No attendees recorded."
                            />
                          </section>
                          <section>
                            <h3>
                              {completed ? "Didn't attend" : "Not yet recorded"}{" "}
                              <span>{notRecorded.length}</span>
                            </h3>
                            <RosterList
                              members={notRecorded}
                              go={go}
                              emptyText={completed ? "Everyone attended." : "Everyone is already recorded."}
                            />
                          </section>
                        </>
                      )}
                    </div>
                  )}

                  {!cancelled && isRegular && (
                    <div className="event-card__birds">
                      <span className="event-card__birds-label">
                        Early Birds (first {model.slots} to arrive)
                      </span>
                      {birds.length === 0 ? (
                        <span className="muted">none recorded yet</span>
                      ) : (
                        <ol>
                          {birds.map((b) => {
                            const m = model.memberById.get(b.member_id);
                            return (
                              <li key={b.rank + b.member_id}>
                                <button onClick={() => go(`#/members/${b.member_id}`)}>
                                  {b.rank}. {m ? memberName(m).nickname : b.member_id}
                                </button>
                              </li>
                            );
                          })}
                        </ol>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
