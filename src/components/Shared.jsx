import { useMemo, useState } from "react";
import { monthLabel, memberName } from "../lib/stats.js";

export function MonthPicker({ options, value, onChange }) {
  return (
    <label className="month-picker">
      <span className="visually-hidden">Month</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((mk) => (
          <option key={mk} value={mk}>{monthLabel(mk)}</option>
        ))}
      </select>
    </label>
  );
}

export function StatusChip({ stat }) {
  if (stat.status === "exceeded")
    return <span className="chip chip--gold">Exceeded · +{stat.extra} extra</span>;
  if (stat.status === "complete")
    return <span className="chip chip--gold">Complete</span>;
  return <span className="chip chip--needs">Needs {stat.remaining} more</span>;
}

export function MemberPicker({ members, onPick, placeholder = "Search your name or nickname…" }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return members
      .filter((m) => {
        const hay = [m.nickname, m.first_name, m.last_name, m.middle_name]
          .join(" ")
          .toLowerCase();
        return hay.includes(needle);
      })
      .slice(0, 8);
  }, [q, members]);
  return (
    <div className="member-picker">
      <input
        type="search"
        value={q}
        placeholder={placeholder}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search members"
      />
      {q.trim() !== "" && (
        <ul className="member-picker__results">
          {results.length === 0 && <li className="member-picker__empty">No member found. Check the spelling, or ask the secretary to add you to the Members tab.</li>}
          {results.map((m) => {
            const n = memberName(m);
            return (
              <li key={m.member_id}>
                <button onClick={() => { setQ(""); onPick(m.member_id); }}>
                  <strong>{n.nickname}</strong>
                  <span>{n.full}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function DataCheck({ issues }) {
  const [open, setOpen] = useState(false);
  if (issues.length === 0) {
    return <p className="datacheck datacheck--ok">Data check: everything in the sheet looks good ✓</p>;
  }
  return (
    <div className="datacheck datacheck--warn">
      <button onClick={() => setOpen(!open)}>
        ⚠ Data check: {issues.length} thing{issues.length > 1 ? "s" : ""} in the sheet need
        {issues.length > 1 ? "" : "s"} attention {open ? "▲" : "▼"}
      </button>
      {open && (
        <ul>
          {issues.map((it, i) => (
            <li key={i}><strong>{it.where}:</strong> {it.msg}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function prettyDate(dateStr) {
  const [y, m, d] = (dateStr || "").split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-PH", {
    weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

export function TypeTag({ type }) {
  const t = (type || "").toLowerCase();
  const label = t === "regular" ? "Regular" : t === "special" ? "Special" : "Makeup";
  return <span className={`typetag typetag--${t || "makeup"}`}>{label}</span>;
}
