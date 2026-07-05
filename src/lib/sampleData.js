// Demo data bundled with the app. It mirrors the club's real July 2026
// records at the time the app was built, so the app can be previewed
// before the Google Sheet is connected or when the sheet is unreachable.

export const SAMPLE = {
  settings: [
    { setting_key: "club_name", setting_value: "Rotary Club of Mutya ng Santa Maria" },
    { setting_key: "monthly_required_attendance", setting_value: "4" },
    { setting_key: "early_bird_slots_per_regular_meeting", setting_value: "10" },
    { setting_key: "timezone", setting_value: "Asia/Manila" },
    { setting_key: "current_rotary_year_start", setting_value: "2026-07-01" },
    { setting_key: "current_rotary_year_end", setting_value: "2027-06-30" },
  ],
  members: [
    ["M001","ABAYA","MARIA AIDA","PORCIUNCULA","AIDA"],
    ["M002","ALEX","MYLA GRACE","MENDOZA","MYLA"],
    ["M003","BAUTISTA","EMILIANA","GERONA","MELY"],
    ["M004","BELOSTRINO","IMELDA","NICOLAS","IMEE"],
    ["M005","BUENO","ANNA FRANCHESKA","DIAZ","ANNA"],
    ["M006","BUGAYONG","CONNIE","DIAZ","CONS"],
    ["M007","CAPILI","CHRISTINE JOY","ENRIQUEZ","CJ"],
    ["M008","CAPILI","MA. LOURDES","ENRIQUEZ","LOU"],
    ["M009","COBO","MARY LOU","BALAGTAS","ELOU"],
    ["M010","CORTES","CLAIRE MARIE","GALLARDO","CLAIRE"],
    ["M011","CRUZ","REYLINA","NICOLAS","LINA"],
    ["M012","DALY","MA. KLARISSA","MARTINEZ","KAYE"],
    ["M013","DE GUZMAN","LEONILA","BARTOLO","LEONY"],
    ["M014","DE LOS REYES","CHERRIE ROSE","GALLARDO","CHERRIE"],
    ["M015","DEL ROSARIO","BERNADETTE","FABIAN","DETTE"],
    ["M016","DOMINGO","ANA MARGARITA","GABRIEL","ANA"],
    ["M017","EVANGELISTA","MARIA JENNIFER","RAMOS","JENNY"],
    ["M018","FONTILLAS","MARIA KHRISTINA","MARTINEZ","TIN"],
    ["M019","FRANCISCO","LEONISA","CRUZ","LEONIE"],
    ["M020","IMPERIO","MARIA CRISTINA","DELOS SANTOS","TINA"],
    ["M021","JOSE","MARIA SALOME","CASTRO","SALLY"],
    ["M022","LING","ANNA CLARISSA","ROLDAN","CLARISSE"],
    ["M023","LIZASO","ADORACION","PEREZ","DORIE"],
    ["M024","MACALINAO","NILDA","ANGELES","NILDS"],
    ["M025","MANGIO","CEZ CAMILLE","LO","CAMILLE"],
    ["M026","MANLICLIC","MARIA LUISA","GONZALES","MALU"],
    ["M027","MARIANO","LUISA","DYPANCO","LISA"],
    ["M028","MARTINEZ-FUENTES","MARIA KATRINA","GLORIOSO","KATHY"],
    ["M029","MARTINEZ","SARAH KAITLYN","MENDOZA","SARAH"],
    ["M030","MATEO","EVANGELINE","JOSE","GELYNNE"],
    ["M031","MENDOZA","FAUSTA","ROXAS","BABY"],
    ["M032","MENDOZA","MARIA ALEXANDRA","CATARROJA","XANDRA"],
    ["M033","MENDOZA","MARY ANN","CAPILI","RYANN"],
    ["M034","ORTIZ","ROSALYN","JARAMILLA","SALEEN"],
    ["M035","PADILLA","MARIA LORENA","GALLANO","LORIE"],
    ["M036","PADILLA","PATRICIA ANNE","PARUNGAO","TRICIA"],
    ["M037","PEREZ","MARCELINA","SAN JOSE","MARCY"],
    ["M038","PORCIUNCULA","MA. ASUNCION","CRISTOBAL","MARITA"],
    ["M039","RAMOS","JESSICA MARIE","AZANA","JESSICA"],
    ["M040","RAMOS","RHIAMAR","AZANA","RHIA"],
    ["M041","REYES","CARMELA JOY","V","MELA"],
    ["M042","ROLDAN","ANNABELLE","MAURICIO","ANNIE"],
    ["M043","SAN LUIS","ANGELIQUE","SANTOS","ANGEL"],
    ["M044","SANTOS","SEIDINA","JOLOC","EDEN"],
    ["M045","SEVILLA","STEPFANIE ELLEN","SANTOS","CHAY"],
    ["M046","SORIANO","KIMBERLY RAY","ADVINCULA","KIM"],
    ["M047","YAMBAO","RESLYN","MILLER","RY"],
    ["M048","YAP","ELSIE","SALAZAR","ELSIE"],
    ["M049","YAP","JAMESIE FAITH","SALAZAR","FAITH"],
  ].map(([member_id, last_name, first_name, middle_name, nickname]) => ({
    member_id, last_name, first_name, middle_name, nickname,
    active_status: "Active", join_date: "", end_date: "", notes: "",
  })),
  meetings: [
    ["20260701-TREE","2026-07-01","makeup","Tree Planting",""],
    ["20260704-MEEAA","2026-07-04","makeup","Joint Project MEEAA",""],
    ["20260706-REG","2026-07-06","regular","Induction",""],
    ["20260707-RCSM","2026-07-07","makeup","RC Santa Maria",""],
    ["20260708-GOV","2026-07-08","makeup","Governor's Visit",""],
    ["20260713-REG","2026-07-13","regular","Regular Meeting",""],
    ["20260720-REG","2026-07-20","regular","Regular Meeting",""],
    ["20260725-MOMMY","2026-07-25","makeup","Malusog si Mommy",""],
    ["20260727-REG","2026-07-27","regular","Regular Meeting",""],
    ["20260731-PIC","2026-07-31","makeup","Change of Profile Pic",""],
    ["20260731-REPOST","2026-07-31","makeup","Repost Infographics",""],
    ["20260731-MARKER","2026-07-31","makeup","Photo in Rotary Marker",""],
    ["20260731-RESEARCH","2026-07-31","makeup","Research about Rotary",""],
  ].map(([meeting_id, date, meeting_type, activity_title, location]) => ({
    meeting_id, date, meeting_type, activity_title, location,
    credit_value: "1", notes: "",
  })),
  attendance: buildAttendance(),
  earlybird: [],
};

function buildAttendance() {
  const tree = ["M006","M007","M008","M013","M014","M019","M020","M023","M024","M025","M026","M027","M030","M031","M032","M033","M035","M037","M038","M042","M045","M048","M049"];
  const meeaa = ["M009","M016","M019","M020","M025","M026","M032","M042","M045","M047"];
  const noPic = new Set(["M003","M013","M019","M021","M036"]);
  const rows = [];
  tree.forEach((m) => rows.push(row("20260701-TREE", m)));
  meeaa.forEach((m) => rows.push(row("20260704-MEEAA", m)));
  for (let i = 1; i <= 49; i++) {
    const id = "M" + String(i).padStart(3, "0");
    if (!noPic.has(id)) rows.push(row("20260731-PIC", id));
  }
  return rows;
}

function row(meeting_id, member_id) {
  return { meeting_id, member_id, credit_given: "1", notes: "" };
}
