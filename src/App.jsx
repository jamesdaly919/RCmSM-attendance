import { useEffect, useMemo, useState } from "react";
import { loadAll, loadSample } from "./lib/data.js";
import { buildModel, todayInManila, monthKey, monthOptions, validate } from "./lib/stats.js";
import { DataCheck } from "./components/Shared.jsx";
import Dashboard from "./components/Dashboard.jsx";
import MemberPage from "./components/MemberPage.jsx";
import EventsPage from "./components/EventsPage.jsx";
import LeadersPage from "./components/LeadersPage.jsx";

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const go = (h) => { window.location.hash = h; };
  return [hash, go];
}

export default function App() {
  const [state, setState] = useState({ loading: true, error: null, raw: null, demo: false });
  const [hash, go] = useHashRoute();

  const wantDemo = new URLSearchParams(window.location.search).has("demo");

  useEffect(() => {
    let alive = true;
    if (wantDemo) {
      setState({ loading: false, error: null, raw: loadSample(), demo: true });
      return;
    }
    loadAll()
      .then((raw) => alive && setState({ loading: false, error: null, raw, demo: false }))
      .catch((err) => alive && setState({ loading: false, error: err.message, raw: null, demo: false }));
    return () => { alive = false; };
  }, [wantDemo]);

  const model = useMemo(() => (state.raw ? buildModel(state.raw) : null), [state.raw]);
  const today = model ? todayInManila(model.settings.timezone) : todayInManila();
  const months = useMemo(() => (model ? monthOptions(model, today) : []), [model, today]);
  const issues = useMemo(() => (model ? validate(model) : []), [model]);

  const [mk, setMonth] = useState(null);
  const currentMk = mk && months.includes(mk) ? mk : (months.includes(monthKey(today)) ? monthKey(today) : months[0]);

  if (state.loading) {
    return (
      <div className="loading">
        <img src="/logo.jpg" alt="" width="220" />
        <p>Loading attendance…</p>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="loading">
        <img src="/logo.jpg" alt="" width="220" />
        <div className="error-box">
          <h1>Couldn't reach the Google Sheet</h1>
          <p>{state.error}</p>
          <p>Things to check:</p>
          <ol>
            <li>The sheet is shared as <strong>Anyone with the link → Viewer</strong>.</li>
            <li>The five tabs exist and are named exactly: Settings, Members, Meetings, Attendance, EarlyBird.</li>
            <li>The SHEET_ID in <code>src/config.js</code> matches your sheet's address.</li>
          </ol>
          <button onClick={() => { window.location.search = "?demo=1"; }}>
            Preview the app with demo data instead
          </button>
        </div>
      </div>
    );
  }

  const route = hash.replace(/^#\//, "");
  const [section, param] = route.split("/");

  let page;
  const shared = { model, mk: currentMk, months, setMonth, today, go };
  if (section === "members") page = <MemberPage {...shared} memberId={param} />;
  else if (section === "events") page = <EventsPage {...shared} />;
  else if (section === "leaders") page = <LeadersPage {...shared} />;
  else page = <Dashboard {...shared} />;

  const navItems = [
    ["#/", "Club", section === "" || section === undefined],
    ["#/members", "Members", section === "members"],
    ["#/events", "Events", section === "events"],
    ["#/leaders", "Leaders", section === "leaders"],
  ];

  return (
    <div className="app">
      <header className="topbar">
        <button className="topbar__brand" onClick={() => go("#/")}>
          <img src="/logo.jpg" alt="Rotary Club of Mutya ng Santa Maria" />
        </button>
        {state.demo && <span className="demo-badge">Demo data</span>}
      </header>

      <main>{page}</main>

      <footer className="foot">
        <DataCheck issues={issues} />
        <p className="foot__note">
          Data comes straight from the club's Google Sheet · updates within a few minutes of editing ·
          Rotary year {model.ryStart} to {model.ryEnd}
        </p>
      </footer>

      <nav className="tabbar">
        {navItems.map(([href, label, on]) => (
          <button key={href} className={on ? "tabbar__item tabbar__item--on" : "tabbar__item"}
            onClick={() => go(href)}>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
