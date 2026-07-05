import { PercentRing } from "./Ring.jsx";
import { MonthPicker, MemberPicker, prettyDate, TypeTag } from "./Shared.jsx";
import { clubMonth, upcomingMeetings, leaderboards, monthLabel, memberName } from "../lib/stats.js";

export default function Dashboard({ model, mk, months, setMonth, today, go }) {
  const club = clubMonth(model, mk);
  const upcoming = upcomingMeetings(model, today, 3);
  const eb = leaderboards(model, mk).monthEB.slice(0, 5);

  return (
    <div className="page">
      <section className="hero card">
        <div className="hero__head">
          <p className="eyebrow">Club attendance · {monthLabel(mk)}</p>
          <MonthPicker options={months} value={mk} onChange={setMonth} />
        </div>
        <div className="hero__body">
          <PercentRing pct={club.targetPct} size={180}>
            <span className="ring-big">{club.targetPct}%</span>
            <span className="ring-sub">of target</span>
          </PercentRing>
          <div className="hero__stats">
            <div className="stat">
              <span className="stat__num">{club.completeCount}</span>
              <span className="stat__label">members completed this month ({club.required} of {club.required} credits)</span>
            </div>
            <div className="stat">
              <span className="stat__num">{club.lackingCount}</span>
              <span className="stat__label">members still need credits</span>
            </div>
            <div className="stat">
              <span className="stat__num">{club.rawCredits}</span>
              <span className="stat__label">total credits recorded this month</span>
            </div>
          </div>
        </div>
        <p className="hero__foot">
          This month's requirement is <strong>{club.required} attendance credit{club.required === 1 ? "" : "s"}</strong> per
          member (the number of Monday meetings scheduled, up to {model.required}).
          The big circle shows how close all {club.activeCount} active members are, together,
          to reaching it. Credits above the requirement are welcome extra participation.
        </p>
      </section>

      <section className="card">
        <h2>Check my attendance</h2>
        <p className="muted">Type your nickname or name, then tap it to see your own record.</p>
        <MemberPicker members={model.activeMembers} onPick={(id) => go(`#/members/${id}`)} />
      </section>

      <section className="card">
        <h2>Next events</h2>
        {upcoming.length === 0 ? (
          <p className="muted">No upcoming events are recorded yet. Add the next meeting to the Meetings tab of the sheet.</p>
        ) : (
          <ul className="event-list">
            {upcoming.map((mt) => (
              <li key={mt.meeting_id}>
                <div>
                  <strong>{mt.activity_title}</strong>
                  <span className="muted">{prettyDate(mt.date)}{mt.location ? ` · ${mt.location}` : ""}</span>
                </div>
                <TypeTag type={mt.meeting_type} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <div className="card__head">
          <h2>Early Bird · {monthLabel(mk)}</h2>
          <a href="#/leaders" onClick={(e) => { e.preventDefault(); go("#/leaders"); }}>All leaderboards →</a>
        </div>
        {eb.length === 0 ? (
          <p className="muted">
            No Early Bird awards recorded for this month yet. The first {model.slots} members
            to arrive at each regular Monday meeting earn one.
          </p>
        ) : (
          <ol className="board">
            {eb.map((e) => (
              <li key={e.member.member_id}>
                <span className="board__rank">{e.rank}</span>
                <button className="board__name" onClick={() => go(`#/members/${e.member.member_id}`)}>
                  {memberName(e.member).nickname}
                </button>
                <span className="board__value">{e.value} 🐦</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
