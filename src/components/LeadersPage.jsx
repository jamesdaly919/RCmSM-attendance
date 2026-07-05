import { useState } from "react";
import { MonthPicker } from "./Shared.jsx";
import { leaderboards, monthLabel, memberName } from "../lib/stats.js";

const BOARDS = [
  { key: "monthCredits", label: "Credits · month", unit: "" },
  { key: "yearCredits", label: "Credits · year", unit: "" },
  { key: "monthEB", label: "Early Bird · month", unit: "🐦" },
  { key: "yearEB", label: "Early Bird · year", unit: "🐦" },
];

export default function LeadersPage({ model, mk, months, setMonth, go }) {
  const [active, setActive] = useState("monthCredits");
  const boards = leaderboards(model, mk);
  const list = boards[active].slice(0, 20);
  const isMonthly = active === "monthCredits" || active === "monthEB";
  const unit = BOARDS.find((b) => b.key === active).unit;

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
              aria-selected={active === b.key}
              className={active === b.key ? "board-tab board-tab--on" : "board-tab"}
              onClick={() => setActive(b.key)}
            >
              {b.label}
            </button>
          ))}
        </div>
        <p className="muted">
          {isMonthly ? monthLabel(mk) : `Rotary year ${model.ryStart.slice(0, 4)}–${model.ryEnd.slice(2, 4)}`}
        </p>
        {list.length === 0 ? (
          <p className="muted">Nothing recorded here yet.</p>
        ) : (
          <ol className="board board--tall">
            {list.map((e) => (
              <li key={e.member.member_id}>
                <span className={"board__rank" + (e.rank <= 3 ? " board__rank--top" : "")}>{e.rank}</span>
                <button className="board__name" onClick={() => go(`#/members/${e.member.member_id}`)}>
                  {memberName(e.member).nickname}
                  <small>{memberName(e.member).full}</small>
                </button>
                <span className="board__value">{e.value} {unit}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
