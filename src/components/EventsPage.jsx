import { useEffect, useMemo, useState } from "react";
import { MonthPicker, prettyDate, TypeTag } from "./Shared.jsx";
import { monthKey, monthLabel, memberName, isCancelled, isProject } from "../lib/stats.js";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

function EventCard({
  meeting,
  model,
  today,
  go,
  expanded,
  onToggle,
  showAttendance = true,
  showEarlyBirds = true,
}) {
  const cancelled = isCancelled(meeting);
  const count = model.meetingAttendance.get(meeting.meeting_id) || 0;
  const birds = model.ebByMeeting.get(meeting.meeting_id) || [];
  const isRegular = (meeting.meeting_type || "").toLowerCase() === "regular";
  const attendeeIds = new Set(
    model.attendance
      .filter((row) => row.meeting_id === meeting.meeting_id && row.member_id)
      .map((row) => row.member_id)
  );
  const attendees = [...attendeeIds]
    .map((id) => model.memberById.get(id))
    .filter(Boolean)
    .sort(byName);
  const absent = model.activeMembers
    .filter((member) => !attendeeIds.has(member.member_id))
    .sort(byName);
  const completed = meeting.date < today;
  const detailsId = `event-details-${meeting.meeting_id}`;
  const Summary = onToggle ? "button" : "div";

  return (
    <article className={"event-card" + (cancelled ? " event-card--cancelled" : "")}>
      <Summary
        className="event-card__summary"
        {...(onToggle ? {
          type: "button",
          "aria-expanded": expanded,
          "aria-controls": detailsId,
          onClick: onToggle,
        } : {})}
      >
        <div className="event-card__top">
          <div>
            <strong>{meeting.activity_title}</strong>
            <span className="muted">
              {prettyDate(meeting.date)}
              {meeting.location ? ` · ${meeting.location}` : ""}
            </span>
          </div>
          <div className="event-card__tags">
            {cancelled && <span className="typetag typetag--cancelled">Cancelled</span>}
            {!cancelled && isProject(meeting) && <span className="typetag typetag--project">Project</span>}
            <TypeTag type={meeting.meeting_type} />
          </div>
        </div>
        {cancelled ? (
          <p className="event-card__count">
            This event was cancelled—it doesn’t count toward anyone’s attendance.
          </p>
        ) : (
          <p className="event-card__count">
            {count} attendee{count === 1 ? "" : "s"} recorded
            {meeting.credit_value && meeting.credit_value !== "1"
              ? ` · worth ${meeting.credit_value} credits`
              : ""}
          </p>
        )}
        {onToggle && (
          <span className="event-card__expand">
            {expanded ? "Hide details" : "Show attendees & absences"}
          </span>
        )}
      </Summary>

      {expanded && (
        <div id={detailsId}>
          {meeting.notes && <p className="event-card__notes">{meeting.notes}</p>}
          {showAttendance && (
            <div className="event-roster">
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
                      {completed ? "Absent" : "Not yet recorded"}{" "}
                      <span>{absent.length}</span>
                    </h3>
                    <RosterList
                      members={absent}
                      go={go}
                      emptyText={completed ? "No absences." : "Everyone is already recorded."}
                    />
                  </section>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {!cancelled && showEarlyBirds && (isRegular || birds.length > 0) && (
        <div className="event-card__birds">
          <span className="event-card__birds-label">
            Early Birds{isRegular ? ` (first ${model.slots} to arrive)` : ""}
          </span>
          {birds.length === 0 ? (
            <span className="muted">none recorded yet</span>
          ) : (
            <ol>
              {birds.map((bird) => {
                const member = model.memberById.get(bird.member_id);
                return (
                  <li key={bird.rank + bird.member_id}>
                    <button onClick={() => go(`#/members/${bird.member_id}`)}>
                      {bird.rank}. {member ? memberName(member).nickname : bird.member_id}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </article>
  );
}

function calendarCells(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const cells = Array(firstWeekday).fill(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(`${month}-${String(day).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function CalendarView({ meetings, mk, today, selectedDate, setSelectedDate, model, go }) {
  const meetingsByDate = useMemo(() => {
    const grouped = new Map();
    meetings.forEach((meeting) => {
      if (!grouped.has(meeting.date)) grouped.set(meeting.date, []);
      grouped.get(meeting.date).push(meeting);
    });
    return grouped;
  }, [meetings]);
  const selectedMeetings = meetingsByDate.get(selectedDate) || [];
  const selectedIsPast = selectedDate < today;

  return (
    <>
      <div className="events-calendar" aria-label={`${monthLabel(mk)} activity calendar`}>
        <div className="events-calendar__weekdays">
          {DAY_NAMES.map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="events-calendar__grid">
          {calendarCells(mk).map((date, index) => {
            if (!date) {
              return <span className="events-calendar__blank" key={`blank-${index}`} aria-hidden="true" />;
            }
            const dayMeetings = meetingsByDate.get(date) || [];
            const classNames = [
              "events-calendar__day",
              date === selectedDate ? "events-calendar__day--selected" : "",
              date === today ? "events-calendar__day--today" : "",
              date < today ? "events-calendar__day--past" : "",
              dayMeetings.length ? "events-calendar__day--busy" : "",
            ].filter(Boolean).join(" ");
            return (
              <button
                type="button"
                className={classNames}
                key={date}
                onClick={() => setSelectedDate(date)}
                aria-pressed={date === selectedDate}
                aria-label={`${prettyDate(date)}${dayMeetings.length ? `, ${dayMeetings.length} activities` : ", no activities"}`}
              >
                <span className="events-calendar__number">{Number(date.slice(8))}</span>
                <span className="events-calendar__items">
                  {dayMeetings.slice(0, 2).map((meeting) => (
                    <span
                      className={
                        "events-calendar__item" +
                        (isCancelled(meeting) ? " events-calendar__item--cancelled" : "")
                      }
                      key={meeting.meeting_id}
                    >
                      {meeting.activity_title}
                    </span>
                  ))}
                  {dayMeetings.length > 2 && (
                    <small>+{dayMeetings.length - 2} more</small>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <section className="calendar-selection" aria-live="polite">
        <div className="calendar-selection__head">
          <div>
            <span className="eyebrow">{selectedIsPast ? "Past date" : "Selected date"}</span>
            <h3>{prettyDate(selectedDate)}</h3>
          </div>
          <span className="muted">
            {selectedMeetings.length} activit{selectedMeetings.length === 1 ? "y" : "ies"}
          </span>
        </div>
        {selectedMeetings.length === 0 ? (
          <p className="muted">No meetings or activities are scheduled for this day.</p>
        ) : (
          <div className="calendar-selection__events">
            {selectedMeetings.map((meeting) => (
              <EventCard
                key={meeting.meeting_id}
                meeting={meeting}
                model={model}
                today={today}
                go={go}
                expanded
                showAttendance={selectedIsPast}
                showEarlyBirds={selectedIsPast}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export default function EventsPage({ model, mk, months, setMonth, today, go }) {
  const [mode, setMode] = useState("list");
  const [openEventId, setOpenEventId] = useState(null);
  const meetings = useMemo(
    () => model.meetings
      .filter((meeting) => monthKey(meeting.date) === mk)
      .sort((a, b) =>
        String(a.date || "").localeCompare(String(b.date || "")) ||
        String(a.activity_title || "").localeCompare(String(b.activity_title || ""))
      ),
    [model.meetings, mk]
  );
  const initialDate = monthKey(today) === mk
    ? today
    : (meetings[0]?.date || `${mk}-01`);
  const [selectedDate, setSelectedDate] = useState(initialDate);

  useEffect(() => {
    setOpenEventId(null);
    setSelectedDate(
      monthKey(today) === mk ? today : (meetings[0]?.date || `${mk}-01`)
    );
  }, [mk, meetings, today]);

  return (
    <div className="page">
      <section className="card">
        <div className="card__head events-head">
          <div>
            <h2>Events · {monthLabel(mk)}</h2>
            <div className="view-switcher" role="group" aria-label="Events view">
              <button
                type="button"
                className={mode === "list" ? "view-switcher__button view-switcher__button--on" : "view-switcher__button"}
                aria-pressed={mode === "list"}
                onClick={() => setMode("list")}
              >
                ☰ List
              </button>
              <button
                type="button"
                className={mode === "calendar" ? "view-switcher__button view-switcher__button--on" : "view-switcher__button"}
                aria-pressed={mode === "calendar"}
                onClick={() => setMode("calendar")}
              >
                ▦ Calendar
              </button>
            </div>
          </div>
          <MonthPicker options={months} value={mk} onChange={setMonth} />
        </div>
        <p className="muted">
          {mode === "list"
            ? "Open any scheduled event to see its attendees and absences. Cancelled events are greyed out and don’t count."
            : "Select a day to see its scheduled activities. Past days include attendees, absences, and Early Birds."}
        </p>

        {mode === "calendar" ? (
          <CalendarView
            meetings={meetings}
            mk={mk}
            today={today}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            model={model}
            go={go}
          />
        ) : meetings.length === 0 ? (
          <p className="muted">No meetings or activities recorded for this month yet.</p>
        ) : (
          <ul className="event-cards">
            {meetings.map((meeting) => (
              <li key={meeting.meeting_id}>
                <EventCard
                  meeting={meeting}
                  model={model}
                  today={today}
                  go={go}
                  expanded={openEventId === meeting.meeting_id}
                  onToggle={() => setOpenEventId(
                    openEventId === meeting.meeting_id ? null : meeting.meeting_id
                  )}
                  showAttendance={openEventId === meeting.meeting_id}
                  showEarlyBirds
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
