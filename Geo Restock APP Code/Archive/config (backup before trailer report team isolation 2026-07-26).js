// ══════════════════════════════════════════════════════════════════════════════
// GEO Restock 2.0 — config.js
// The one config file (GEO_Restock_2_0_Transition_Handoff.md §8). Every value
// the app would otherwise hardcode lives here. It grows as 2.0 is built.
// Mitch reviews by pasting this file back into conversation.
// ══════════════════════════════════════════════════════════════════════════════
// self === window in the page, and self is also defined inside the service
// worker — one config file serves both without duplication.
self.GEO_CONFIG = {

  // ── 1. CONNECTION ADDRESSES ─────────────────────────────────────────────────
  // Firebase: SAME project as 1.0 (reuse locked §8.5) — identity carries over
  // for free. Isolation comes from rootNode below, not from a separate project.
  firebase: {
    apiKey: "AIzaSyDuI7AKeK-iKcTecsxWe44jpgB3TptNxOA",
    authDomain: "geo-restock.firebaseapp.com",
    databaseURL: "https://geo-restock-default-rtdb.firebaseio.com",
    projectId: "geo-restock",
    storageBucket: "geo-restock.firebasestorage.app",
    messagingSenderId: "706685836560",
    appId: "1:706685836560:web:797969cfffa2ac8751d995"
  },
  // Every 2.0 write lives under this node. The 1.0 node ("geo-restock/...") is
  // SACRED and untouched until cutover. (Rules already cover it: the allowlist
  // sits at the database root and cascades — verified go night 2026-07-24.)
  // NAME AMENDED go night: Firebase keys cannot contain periods (. # $ [ ] are
  // forbidden), so Mitch's chosen "geo restock 2.0" becomes "2-0". The illegal
  // dot threw inside the SDK on the iPad's first real login and masqueraded as
  // a catalog-load failure.
  rootNode: "geo restock 2-0",

  // Catalog source. Today: the local export sitting next to index.html.
  // When the GitHub export repo is chosen (open question #7), this becomes
  // that repo's raw URL — one-line change.
  catalogFile: "GeothermParts_2_0.json",

  // ── 2. THE IMAGE RULE ───────────────────────────────────────────────────────
  // Image URL is NOT in the export. The app builds every link:
  // imageBase + Part ID + imageExt  (same source the DB tools use)
  imageBase: "https://raw.githubusercontent.com/LaryBird12/GEO_Restock/main/Images/Parts/",
  imageExt: ".jpg",

  // Warehouse sections suppressed from the Warehouse Stock button because the
  // top-level tiles already cover them. Subtraction rule: everything under the
  // warehouse shows EXCEPT these subtrees. Add a new warehouse section and it
  // appears automatically; it only disappears if its Location ID is listed here.
  // NAMING TRAP, do not "fix": the warehouse section named "Trailer Stock" is a
  // warehouse SHELF AREA staging trailer-bound goods -- not the physical trailer
  // (that's node 5, Geo > Trailer). Both names are correct as they stand.
  warehouseHiddenSections: [70, 81],   // 70 = Cases Stock, 81 = Trailer Stock

  // The Warehouse node the "Warehouse Stock" button drills into. Browsing it
  // works exactly like the tiles above: folders first (Job Stock, Ductwork),
  // then shelves, then parts. Same style as tiles[].locationId.
  warehouseLocationId: 65,             // Geo > Warehouse

  // ── 3. TEAM-TO-BRANCH MAPPING ───────────────────────────────────────────────
  // homeLocationId scopes a team to its division branch of the Locations tree.
  // Geo = 1, Solar = 2, GeoDoctor = 3. Future: krypton → 2 once Solar is built.
  // hidden: true keeps a team off the team-select screen (the way test hides).
  // Button order on the home screen = this object's order (Mitch, 2026-07-24):
  // Gold, Titanium, Cobalt, Krypton — Part & Dart renders just below them.
  teams: {
    gold:     { label: "Gold",     color: "#f59e0b", bg: "#271c00", border: "#4a3500", icon: "🏅", homeLocationId: 1, hidden: false },
    titanium: { label: "Titanium", color: "#94a3b8", bg: "#141820", border: "#2c3348", icon: "⚙️", homeLocationId: 1, hidden: false },
    cobalt:   { label: "Cobalt",   color: "#60a5fa", bg: "#001440", border: "#0c2a6e", icon: "🔷", homeLocationId: 1, hidden: false },
    // Krypton is BACK on the home screen — but its Solar branch is empty, so
    // the button opens the under-construction experience, not team navigation.
    krypton:  { label: "Krypton",  color: "#4ade80", bg: "#06251a", border: "#14532d", icon: "🪐", homeLocationId: 2, hidden: false, underConstruction: true },
    test:     { label: "Test",     color: "#a78bfa", bg: "#1a1530", border: "#2e2350", icon: "🧪", homeLocationId: 1, hidden: true  }
  },

  // Krypton under-construction screen (the final add, 2026-07-24): the button
  // tap is the audio-unlocking gesture. "Coming Soon" for a moment, then the
  // Delete the Ceiling artwork with its song. Files live next to index.html
  // (copied from /Soundtrack) so they ride every deploy.
  krypton: {
    image: "Query the Future 3.jpg",  // FINAL artwork (Mitch, 2026-07-25): portrait 1536x2752, recompressed from the 7.1MB Soundtrack PNG to a 1.3MB full-res JPEG for fast cellular loads
    audio: "Query the Future.mp3",
    comingSoonMs: 1000                // quick flash, then straight into the artwork + song
  },

  // The tiles on the team nav screen — the three top-level trailer compartments
  // (HTML scope lock 2026-07-24: Tools joins Trailer Stock and Case Stock; the
  // ONLY visible change). locationId anchors each tile to its subtree.
  tiles: [
    { label: "Trailer Stock", icon: "🚛", locationId: 6,  bg: "#152a45", border: "#2a4a6c" },
    { label: "Case Stock",    icon: "🧰", locationId: 7,  bg: "#0f2a3a", border: "#1a3a4a" },
    { label: "Tools",         icon: "🛠️", locationId: 63, bg: "#2a2333", border: "#4a3a5c" }
  ],

  // Crew roster for the Tool-flag name picker (Mitch 2026-07-24, revised go
  // night). Identity is captured at ONE moment only — flagging a Tool. Team
  // navigation is OPEN and trust-based: no permission gating, ever.
  // Division-aware: division rides alongside team so the same person can sit
  // on two teams without collision (Valavanis and Sterling are Cobalt/Geo AND
  // Krypton/Solar). CLOSED-WORLD picker: the CURRENT team's members + "Master
  // User" (which reveals a second pick between the two masterUsers below) —
  // no free-text; a name pick is REQUIRED. Teamless Part & Dart shows the
  // whole roster since the app can't narrow it.
  // NOTE: krypton is ROSTER-ONLY today — deliberately absent from `teams`
  // above (no trailer branch, no home-screen button until Mitch says).
  crew: {
    gold:     { division: "Geo",   members: ["Mitchell Conklin", "Rick Nelson"] },
    titanium: { division: "Geo",   members: ["Dan Selvaggio", "Cody Masco"] },
    cobalt:   { division: "Geo",   members: ["Christopher Valavanis", "Benjamin Sterling"] },
    krypton:  { division: "Solar", members: ["Christopher Valavanis", "Benjamin Sterling"] },
    test:     { division: "Geo",   members: [] }
  },
  // Master is a USER TYPE, not a team — no home-screen button, no trailer
  // branch, never in `teams` or `crew`. "Master User" appears in EVERY team's
  // picker and reveals free-text name entry. For the record, the masters:
  // Jesse Cook (owns the company), Jesse Carson (manages all teams). Both came
  // OFF Gold — they were only parked there because the source spreadsheet
  // forced a team column; neither works a trailer.
  masterUsers: ["Jesse Cook", "Jesse Carson"],

  // ── 4. DISPLAY RULES ────────────────────────────────────────────────────────
  // DB keeps honest decimals; the face is friendly. Click-to-edit flips back
  // to raw decimal (governing principle §8.2.4).
  fractions: { "0.25": "¼", "0.5": "½", "0.75": "¾" },
  currency: "$",
  // Stock Type routing — how a part flows when it hits the reorder pipeline.
  stockTypeRouting: { Consumable: "shelf-pull", Nonstock: "purchase-line" },
  // Catalog auto-refresh cadence (was hardcoded 7 days in 1.0).
  autoRefreshDays: 7,
  // Feedback recipient (was hardcoded in 1.0 at line 434).
  levelerEmail: "conklinm1@yahoo.com",
  // Admin room password (was hardcoded in 1.0).
  adminPassword: "geotherm",

  // ── USAGE KEY — LOCKED 2026-07-24 (open question #1 closed) ─────────────────
  // Aggregate by Part ID. Usage is stored PER TEAM (write-time attribution:
  // teams/{team}/usage/{partId} — "Gold used 2, Titanium used 1") and SUMMED
  // AT READ TIME wherever a total matters (Trailer Stock Reset, Weekly
  // Reorder). Aggregation is a read-time rollup, never a write-time collapse —
  // clean totals for ordering, team attribution preserved for Carson's report.
  usageKeyStrategy: "partId per team, read-time rollup"
};
