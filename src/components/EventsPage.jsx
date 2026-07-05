import { MonthPicker, prettyDate, TypeTag } from "./Shared.jsx";
import { monthKey, monthLabel, memberName } from "../lib/stats.js";

export default function EventsPage({ model, mk, months, setMonth, go }) {
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
        {meetings.length === 0 ? (
          <p className="muted">No meetings or activities recorded for this month yet.</p>
        ) : (
          <ul className="event-cards">
            {meetings.map((mt) => {
              const count = model.meetingAttendance.get(mt.meeting_id) || 0;
              const birds = model.ebByMeeting.get(mt.meeting_id) || [];
              const isRegular = (mt.meeting_type || "").toLowerCase() === "regular";
              return (
                <li key={mt.meeting_id} className="event-card">
                  <div className="event-card__top">
                    <div>
                      <strong>{mt.activity_title}</strong>
                      <span className="muted">
                        {prettyDate(mt.date)}
                        {mt.location ? ` · ${mt.location}` : ""}
                      </span>
                    </div>
                    <TypeTag type={mt.meeting_type} />
                  </div>
                  <p className="event-card__count">
                    {count} attendee{count === 1 ? "" : "s"} recorded
                    {mt.credit_value && mt.credit_value !== "1" ? ` · worth ${mt.credit_value} credits` : ""}
                  </p>
                  {isRegular && (
                    <div className="event-card__birds">
                      <span className="event-card__birds-label">Early Birds</span>
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
