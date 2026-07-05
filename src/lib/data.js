import { SHEET_ID, TABS, DEFAULTS } from "../config.js";
import { csvToObjects } from "./csv.js";
import { SAMPLE } from "./sampleData.js";

function tabURL(tabName) {
  return (
    "https://docs.google.com/spreadsheets/d/" +
    SHEET_ID +
    "/gviz/tq?tqx=out:csv&sheet=" +
    encodeURIComponent(tabName) +
    "&headers=1"
  );
}

async function fetchTab(tabName) {
  const res = await fetch(tabURL(tabName), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Could not load the "${tabName}" tab (HTTP ${res.status}).`);
  }
  const text = await res.text();
  // If the sheet is not shared publicly, Google returns an HTML login page
  // instead of CSV. Detect that and give a clear message.
  if (text.trimStart().startsWith("<")) {
    throw new Error(
      `The "${tabName}" tab returned a sign-in page instead of data. ` +
        `The Google Sheet is probably not shared as "Anyone with the link → Viewer".`
    );
  }
  return csvToObjects(text);
}

export async function loadAll() {
  const [settingsRows, members, meetings, attendance, earlybird] =
    await Promise.all([
      fetchTab(TABS.settings),
      fetchTab(TABS.members),
      fetchTab(TABS.meetings),
      fetchTab(TABS.attendance),
      fetchTab(TABS.earlyBird),
    ]);
  // Reports tab is optional (older sheets may not have it yet).
  const reports = await fetchTab(TABS.reports).catch(() => []);
  return normalize({ settingsRows, members, meetings, attendance, earlybird, reports });
}

export function loadSample() {
  return normalize({
    settingsRows: SAMPLE.settings,
    members: SAMPLE.members,
    meetings: SAMPLE.meetings,
    attendance: SAMPLE.attendance,
    earlybird: SAMPLE.earlybird,
    reports: [],
  });
}

function normalize({ settingsRows, members, meetings, attendance, earlybird, reports }) {
  const settings = { ...DEFAULTS };
  for (const r of settingsRows) {
    if (r.setting_key) settings[r.setting_key] = r.setting_value;
  }
  settings.monthly_required_attendance =
    parseInt(settings.monthly_required_attendance, 10) || 4;
  settings.early_bird_slots_per_regular_meeting =
    parseInt(settings.early_bird_slots_per_regular_meeting, 10) || 10;

  return { settings, members, meetings, attendance, earlybird, reports: reports || [] };
}
