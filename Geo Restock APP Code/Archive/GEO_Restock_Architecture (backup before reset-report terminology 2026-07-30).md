# GEO Restock — Architecture Reference

*Paste this into a new conversation to bring Claude up to speed on how the app is built. Written for Mitch, who works primarily by voice and isn't a coder — no need to read code to follow this. Reflects the app in its current, working, launched state as of 2026-07-11.*

---

## Who I am / how I work

- **Mitchell Conklin ("Mitch")** — geothermal HVAC tech at GeoTherm, Rochester NY. Self-taught builder, not a professional coder.
- **GitHub:** `LaryBird12` · **Mac user:** `drwheelersmac` (M4 Pro MacBook Pro, 64 GB; Windows 11 via Parallels) · **Email:** `conklinm1@yahoo.com`
- **Working style:** voice-to-text primary — parse phonetically/generously, expect typos and run-on dictation. **Lock the design in conversation before writing any code.** For hands-on setup work (Firebase console, terminal steps), go **one step at a time and pause for confirmation** before the next step. Keep responses tight and token-efficient, not padded.

---

## What GEO Restock is

A mobile web app (PWA — installs to the phone home screen like a real app, no App Store) that replaces paper trailer-inventory sheets for the shop's field crews. Techs use it to log what they used off the trailer/cases stock, flag warehouse items that are running low, and generate a weekly reorder list for the shop.

It's built as **one single HTML file** — no framework (no React, no build step, nothing to compile). That's a deliberate choice: it's simple to reason about, simple to deploy (just push a file), and fast to load on a phone in the field.

## The data pipeline, end to end

```
Excel master workbook (Geo Master Inventory.xlsm)
        │  Power Query + VBA export macro
        ▼
GeothermParts.json   ← the entire parts catalog, lives next to the app
        │
        ▼
index.html (the app) ──reads catalog on load──► renders categories/items
        │
        ├── writes "what's been used" / "what's flagged low" ──► Firebase Realtime Database (live, shared across phones)
        │
        └── images referenced by URL ──► GitHub repo (raw.githubusercontent.com), one JPG per part
        
index.html + GeothermParts.json + images ──► pushed to GitHub ──► Netlify auto-deploys ──► live URL
```

**In plain terms:** the master list of parts lives in an Excel workbook. When it changes, you export it to a JSON file. That JSON file *is* the catalog the app reads — it has no other database for part info. The *only* thing stored live in Firebase is which items each team has logged as used, and which items are flagged for reorder. Everything else (name, vendor, min/max quantities, image) comes from the JSON file.

### Key locations
- **Project folder:** `/Users/drwheelersmac/Dropbox/GEOTHERM/Huge Nerd Stuff/Geotherm_Inventory_App`
- **Repo (public):** `github.com/LaryBird12/geo-images` — `code/` folder = the app, `images/` folder = ~350 normalized 400×400 JPGs
- **Hosting:** Netlify (`monumental-llama-1a6fa4.netlify.app`), publish directory = `code`, auto-deploys every time you push to GitHub
- **Firebase project:** `geo-restock` — Realtime Database at `https://geo-restock-default-rtdb.firebaseio.com`
- **Image URL pattern:** `raw.githubusercontent.com/LaryBird12/geo-images/main/images/{Master Record ID}.jpg`

## The files that make up the app (`code/` folder)

| File | What it does |
|---|---|
| `index.html` | The entire app — layout, styling, and all behavior in one file (~950 lines). This is the only file you'd ever need to change to add or tweak a feature. |
| `GeothermParts.json` | The parts catalog. One entry per part: description, vendor, min/max quantities, image link, which category/team stock it belongs to. |
| `sw.js` | The "service worker" — a background script that caches the app, the catalog, and every part image on the phone, so the app keeps working with no signal (e.g., in a basement or rural job site). |
| `manifest.json` | Tells the phone how to install the app as a home-screen icon (name, icon images, full-screen behavior). |
| Logo.png, icon-*.png | Branding images used on the splash screen and home-screen icon. |

## How data is organized in Firebase (the live/shared part)

Two things live in the shared database, and nothing else does:

1. **`teams/{team}/usage/{part id}`** — what a specific team (Gold, Cobalt, Titanium) has logged as used off the trailer or cases. A number for "count as you go" items, or `true` for "refill to a level" items.
2. **`shopReorder/{part id}`** — one shared list, not tied to any team, of parts flagged as below the shop's minimum stock. Any team or the warehouse-pull mode can add to this. This is what becomes the weekly reorder report.

There's also a hidden **Test** team that writes to its own usage bucket and never touches the real reorder list — used for trying things out without messing up real data.

## How someone actually uses it (the screens)

0. **Sign In** — real email + password, required before anything else in the app is reachable. See "Who's allowed in" below.
1. **Team select** — pick Gold / Cobalt / Titanium, or a special **Part & Dart** mode for quickly pulling from the shelf and flagging low stock without picking a team.
2. **Trailer Stock / Cases Stock** — browse by category → item → log how much was used (a number) or flag "needs refill" (a checkbox), with a photo of the part to confirm it's the right one.
3. **Restock Report** — per-team summary of everything that's been logged, so whoever's restocking the trailer knows exactly what to grab. Marking an item "received" clears it from the report (with a fun visual confirmation).
4. **Warehouse Stock** — shop-only items (not on the trailer), searchable, flaggable as below minimum.
5. **Weekly Reorder List** — hidden behind a password (admin area, nicknamed "Mitch's Room"), shows everything flagged low across all teams. Screen/print/CSV all pull from one shared dataset: vendor, shop min, order qty, **VEN Case QTY**, and a **Web Link** to the vendor product page (from two newer catalog fields — see "New catalog fields" below). Print comes out as a forced-landscape, one-vendor-per-page report with clean fixed-width columns; CSV includes the same columns plus who flagged each item. If more than one team flags the same item, it shows **all** contributing teams (e.g. "Gold, Titanium"), not just whoever flagged it most recently. Can be reset once the order's placed.
6. **Feedback** — a simple form that opens the tech's email app with a pre-filled message to Mitch, so anyone can flag a bug or a wrong part on the spot.

## Who's allowed in (added 2026-07-11)

The app used to let anyone in silently (anonymous Firebase sign-in, no login screen at all). That's gone. Now:

- **8 named people** have real accounts (email + password), created by Mitch directly in Firebase Console → Authentication → Users. No self-service sign-up exists anywhere in the app.
- **Every screen is gated** behind a real login — Team select, Test mode, Part & Dart, Admin, all of it. Nobody gets past the Sign In screen without a valid account.
- **Enforced in two places at once:** (1) Firebase's Anonymous and Phone sign-in providers are both disabled, so only these 8 email/password accounts can authenticate at all; (2) the database's own Security Rules independently check the signed-in user's email against the same list of 8, so even a stray authenticated session can't read/write unless its email matches.
- **Sign out** lives in the sync-info popup (tap the sync dot, top right) — useful on a shared device.
- **Known gotcha, already fixed once:** disabling a Firebase sign-in provider does *not* retroactively invalidate sessions that already existed before the disable — it only blocks new ones. The app code explicitly checks for and rejects any leftover anonymous session rather than trusting "is someone signed in" alone.

## New catalog fields (added alongside the reorder-report work)

- **`VEN URL`** — a link to the vendor's product page, shown as "Web Link" in the Weekly Reorder List (screen, print, and CSV).
- **`VEN Case QTY`** — the vendor's case/pack size in plain English (e.g. "Box of 50"), shown alongside Shop Min and Order Qty.
- Both are optional per catalog row — the app shows blank/dash gracefully when a part doesn't have them yet (most of the catalog still doesn't, as of this writing).

## Reliability features already built in

- **Works offline.** If a tech is somewhere with no signal, they can still browse the catalog and log usage — it queues locally and syncs automatically once back online. A small dot in the header shows sync status (green = synced, red = pending changes).
- **Manual refresh.** A button re-pulls the latest catalog/images if the Excel workbook has been updated and re-exported.
- **Auto weekly refresh.** The app checks its own age and quietly re-syncs data if it's been more than a week.

## Deploy workflow (how a change goes live)

1. Pause Dropbox sync (the project folder lives inside Dropbox, which can collide with git).
2. Make the change to files in `code/`.
3. From Terminal:
   ```
   cd "/Users/drwheelersmac/Dropbox/GEOTHERM/Huge Nerd Stuff/Geotherm_Inventory_App"
   git add code/ images/
   git commit -m "describe the change"
   git push
   ```
4. Netlify auto-builds in about a minute.
5. On the phone: fully close and reopen the live app tile (may take two tries because of the offline cache), then tap **Refresh Data** in-app if the catalog changed.

There's also a local **TEST server** setup (a "GEO TEST" home-screen tile pointing at the Mac over Wi-Fi) for trying changes before pushing them live — instructions are in `GEO_TEST_Instructions.txt` in the project folder.

## Current status

The app is **live and in use** by the crew, now behind real per-person login (see "Who's allowed in" above) instead of the old anonymous-access model. Repo hygiene is done too — a `.gitignore` now keeps the Excel workbook, local test server script, this architecture doc, and other working files out of the public GitHub repo.

## Known loose ends (not urgent, just noted)

- About 35 warehouse items in the catalog have no minimum quantity set.
- There was an earlier report of offline-logged changes going missing on reconnect — not confirmed reproduced or fixed; worth a deliberate test if it comes up again (toggle airplane mode, log something, reconnect, verify it synced).

---

### Why this document exists

This is a clean architecture snapshot, meant to seed a *new* conversation quickly so Claude understands how the app is put together without re-reading all the code every time. The actual feature discussion — what to build next — happens after this doc is pasted in, as a separate conversation.
