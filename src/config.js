// ============================================================
//  APP CONFIGURATION
//  This is the ONLY file you should ever need to edit.
// ============================================================

// The ID of your Google Sheet.
// It's the long code in the sheet's web address:
// https://docs.google.com/spreadsheets/d/  <THIS PART>  /edit
export const SHEET_ID = "1q1PLCsV2ASGMBCvX7EJLvZdGjKgMZdd59Yj7AuBmUaQ";

// The names of the tabs in the Google Sheet.
// Only change these if you rename the tabs in the sheet itself.
export const TABS = {
  settings: "Settings",
  members: "Members",
  meetings: "Meetings",
  attendance: "Attendance",
  earlyBird: "EarlyBird",
};

// Fallback values used if the Settings tab is missing a row.
export const DEFAULTS = {
  club_name: "Rotary Club of Mutya ng Santa Maria",
  monthly_required_attendance: 4,
  early_bird_slots_per_regular_meeting: 10,
  timezone: "Asia/Manila",
  current_rotary_year_start: "2026-07-01",
  current_rotary_year_end: "2027-06-30",
};
