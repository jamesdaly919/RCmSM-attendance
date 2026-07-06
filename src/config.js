// ============================================================
//  APP CONFIGURATION
//  This is the ONLY file you should ever need to edit.
// ============================================================

// The ID of your Google Sheet.
// It's the long code in the sheet's web address:
// https://docs.google.com/spreadsheets/d/  <THIS PART>  /edit
export const SHEET_ID = "https://script.google.com/macros/s/AKfycbw4F3Xg2h2pv8jBolj6Y4CtjDBV_p_GNrvQdmpCQYk9rTm3a0r9qO3_9kObglXihyWe-g/exec";

// The names of the tabs in the Google Sheet.
// Only change these if you rename the tabs in the sheet itself.
export const TABS = {
  settings: "Settings",
  members: "Members",
  meetings: "Meetings",
  attendance: "Attendance",
  earlyBird: "EarlyBird",
  reports: "Reports",
};

// The "I actually attended" report button posts to this Apps Script
// Web App URL. Leave "" to hide the feature. See the README section
// "Turn on attendance reports" for how to get this URL (5 minutes).
export const REPORT_URL = "";

// Fallback values used if the Settings tab is missing a row.
export const DEFAULTS = {
  club_name: "Rotary Club of Mutya ng Santa Maria",
  monthly_required_attendance: 4,
  early_bird_slots_per_regular_meeting: 10,
  timezone: "Asia/Manila",
  current_rotary_year_start: "2026-07-01",
  current_rotary_year_end: "2027-06-30",
};
