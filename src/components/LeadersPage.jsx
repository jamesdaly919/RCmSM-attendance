import { useState } from "react";
import { MonthPicker } from "./Shared.jsx";
import { leaderboards, monthLabel, memberName } from "../lib/stats.js";

const BOARDS = [
  {
    key: "monthCredits", label: "Attendance", period: "month", unit: "credits",
    caption: "Who earned the most attendance credits",
  },
  {
    key: "yearCredits", label: "Attendance", period: "year", unit: "credits",
    caption: "Who earned the most attendance credits",
  },
  {
    key: "monthProjects", label: "Projects", period: "month", unit: "projects",
    caption: "Who joined the most club projects",
  },
  {
    key: "yearProjects", label: "Projects", period: "year", unit: "projects",
    caption: "Who joined the most club projects",
  },
  {
    key: "monthEB", label: "Early Bird", period: "month", unit: "awards",
    caption: "Who was among the first 10 to arrive most often",
  },
  {
    key: "yearEB", label: "Early Bird", period: "year", unit: "awards",
    caption: "Who was among the first 10 to arrive most often",
  },
];

const MEDALS = { 1: "🥇", 2: "🥈", 3: "🥉" };

export default function LeadersPage({ model, mk, months, setMonth, go }) {
  const [activeKey, setActiveKey] = useState("monthCredits");
  const board = BOARDS.find((b) => b.key === activeKey);
  const boards = leaderboards(model, mk);
  const list = boards[activeKey].slice(0, 20);
  const isMonthly = board.period === "month";
  const periodText = isMonthly
    ? monthLabel(mk)
    : `Rotary year ${model.ryStart.slice(0, 4)}–${model.ryEnd.slice(2, 4)}`;

  return (
    <div className="page">
      <section className="card">
        <div className="card__head">
          <h2>Leaderboards</h2>
          {isMonthly && <MonthPicker options={months} value={mk} onChange={setMonth} />}
        </div>

        <div className="board-tabs" role="tablist">
          {BOARDS.map((b) => (
            <button
              key={b.key}
              role="tab"
              aria-selected={activeKey === b.key}
              className={activeKey === b.key ? "board-tab board-tab--on" : "board-tab"}
              onClick={() => setActiveKey(b.key)}
            >
              {b.label}
              <small>{b.period === "month" ? "this month" : "this year"}</small>
            </button>
          ))}
        </div>

        <p className="board-caption">
          {board.caption} in <strong>{periodText}</strong>.
          The number on the right is their total. 🥇🥈🥉 mark the top three.
          Tap a name to see that member's full record.
        </p>

        {list.length === 0 ? (
          <p className="muted">Nothing recorded here yet for this period.</p>
        ) : (
          <ol className="board board--tall">
            {list.map((e) => (
              <li key={e.member.member_id}>
                {MEDALS[e.rank] ? (
                  <span className="board__medal" aria-label={`Rank ${e.rank}`}>{MEDALS[e.rank]}</span>
                ) : (
                  <span className="board__rank">{e.rank}</span>
                )}
                <button className="board__name" onClick={() => go(`#/members/${e.member.member_id}`)}>
                  {memberName(e.member).nickname}
                  <small>{memberName(e.member).full}</small>
                </button>
                <span className="board__value">
                  {e.value} <small>{board.unit}</small>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
