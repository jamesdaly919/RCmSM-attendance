import { useState } from "react";
import { memberMonth, requiredForMonth, memberName, monthLabel } from "../lib/stats.js";

/*
 * Attendance at a glance
 * ----------------------
 * Groups every ACTIVE member into tiers by how many credits they have
 * earned in the selected month, from complete (required/required) down
 * to 0. Tiers adapt to the month's dynamic requirement, so a December
 * with 1 required meeting shows just 1/1 and 0/1.
 *
 * Members with MORE than the requirement still sit in the top (green)
 * tier — extra credits are celebrated on the leaderboards, not here.
 *
 * The complete tier starts collapsed (it is usually the longest list);
 * every incomplete tier is always open, because those are the names
 * the club actually needs to see. Tap any name to open that member's page.
 */
export default function AtAGlance({ model, mk, go }) {
  const required = requiredForMonth(model, mk);

  // Build one bucket per possible credit count: required, required-1, … 0.
  const tiers = [];
  for (let n = required; n >= 0; n--) tiers.push({ n, members: [] });

  for (const m of model.activeMembers) {
    const stat = memberMonth(model, m.member_id, mk);
    const capped = Math.max(0, Math.min(required, Math.floor(stat.credits)));
    tiers[required - capped].members.push(m);
  }

  // Alphabetical by nickname inside each tier.
  for (const t of tiers) {
    t.members.sort((a, b) =>
      memberName(a).nickname.localeCompare(memberName(b).nickname)
    );
  }

  return (
    <section className="card glance">
      <h2>Attendance at a glance</h2>
      <p className="muted">
        Everyone's progress toward the {required}-credit requirement for {monthLabel(mk)}.
        Tap a name to open that member's record.
      </p>
      {tiers.map((t) => (
        <GlanceTier
          key={t.n}
          n={t.n}
          required={required}
          members={t.members}
          go={go}
        />
      ))}
    </section>
  );
}

function tierClass(n, required) {
  if (n >= required) return "glance-tier--full";   // green — complete
  if (n === 0) return "glance-tier--zero";          // red — nothing yet
  // in-between tiers: closer to done = warmer green-ish, further = amber
  return n / required >= 0.5 ? "glance-tier--near" : "glance-tier--far";
}

function GlanceTier({ n, required, members, go }) {
  const complete = n >= required;
  // The (usually huge) complete tier starts collapsed; the rest stay open.
  const [open, setOpen] = useState(!complete);

  return (
    <div className={`glance-tier ${tierClass(n, required)}`}>
      <div className="glance-tier__head">
        <span className="glance-tier__badge">{n}/{required}</span>
        <span className="glance-tier__label">
          {complete
            ? "Complete — thank you!"
            : n === 0
              ? "No credits yet this month"
              : `Needs ${required - n} more credit${required - n === 1 ? "" : "s"}`}
        </span>
        <span className="glance-tier__count">
          {members.length} member{members.length === 1 ? "" : "s"}
        </span>
        {complete && members.length > 0 && (
          <button
            className="glance-tier__toggle"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Hide names" : "Show names"}
          </button>
        )}
      </div>

      {members.length === 0 ? (
        <p className="glance-tier__empty muted">Nobody in this group.</p>
      ) : open ? (
        <div className="glance-tier__names">
          {members.map((m) => {
            const name = memberName(m);
            return (
              <button
                key={m.member_id}
                className="glance-chip"
                title={name.full}
                onClick={() => go(`#/members/${m.member_id}`)}
              >
                {name.nickname}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
