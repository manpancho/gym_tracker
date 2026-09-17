# Gym and Nutrition Tracker

A personal fitness dashboard built with **HTML, CSS, and vanilla JavaScript**. Log workouts, meals, and recovery metrics in one responsive, accessible front-end application.

[Live site](https://gym-and-macro-tracker.netlify.app/) · [GitHub repository](https://github.com/manpancho/gym_tracker)

## What you can do

- See today's sets, calories, protein, and bodyweight alongside a seven-day training calendar.
- Log sets with weight, reps, and optional RPE; keep your exercise and weight ready for the next set.
- Review, edit, and delete workout sets by date, including zero-weight/bodyweight sets.
- Manage exercise names without losing historical sets when an exercise is removed.
- Log meals, reuse presets, edit entries, and see daily macro totals.
- Save or update one bodyweight/recovery check-in per day. Blank fields preserve existing values.
- Explore estimated 1RM and bodyweight charts over 7, 14, or 30 days.
- Set optional calorie/protein targets and export/import validated JSON backups.

## Run locally

Open `index.html` directly, or use Node.js for a consistent local preview:

```sh
npm start
```

Visit `http://127.0.0.1:4173`. No build step or application package installation is required. Chart.js 4.4.8 is loaded from a pinned CDN URL; logging, summaries, and backups still work if charts cannot load.

## Project structure

```text
index.html                  Application structure and forms
gym_tracker/
  style_gym.css             Theme, components, responsive layouts
  data.js                   Date/number helpers and backup validation
  app.js                    Existing tracking flows, storage, summaries, charts
  experience.js             Navigation, overview, workout history, targets, backups
tools/
  serve.cjs                 Local static preview server
  check.cjs                 Dependency-free data regression checks
  browser-check.cjs         Browser flow and responsive regression checks
```

## Data and calculations

- Data remains in `localStorage` under the existing `fitnessTracker_v4` key. There are no accounts, server database, or device synchronization.
- Browser data belongs to the site's origin. Your live site's records will not automatically appear in a localhost preview. Export from the original site and import into the preview to move data.
- Export before clearing browser storage, changing browsers, or importing a replacement backup. Import validates records before asking to replace current data.
- Unreadable stored data is left untouched, with saving blocked and the original data available to export. Failed writes display a warning and roll back in-memory changes so retrying does not duplicate entries.
- Nutrition averages use only days with meals; volume averages use only training days. Partially logged days can still lower nutrition averages. Missing check-in fields are not treated as zero.
- Older repeated check-ins for the same day are consolidated, retaining the latest nonblank values. Legacy zero bodyweight/RPE/energy values are treated as missing. Legitimate zero sleep and steps remain zero.
- Estimated 1RM uses the existing Epley formula: `weight × (1 + reps / 30)`. Each day shows its highest estimate. These are estimates, not measured maximums.
- Insights describe your logs and chosen targets; they do not assume a calorie deficit or prescribe training volume.

## Verification

```sh
npm test
```

This checks blank/zero values, date boundaries, invalid backups, and legacy check-in migration.

For the optional browser suite, install Playwright as a development tool (`npm install --no-save playwright`), ensure Microsoft Edge is installed, start the preview server, and run:

```sh
npm run test:browser
```

The browser suite uses isolated temporary browser data. It checks workout/meal creation and edits, preset reuse, persistence, non-destructive exercise removal, targets, backup import/export, save failures, corrupt storage, unavailable charts, and all views at 320px and 390px widths. It also captures desktop and mobile screenshots (ignored by Git).

## Design and development

The interface uses a teal and gray palette, a desktop sidebar, scrollable mobile navigation, visible keyboard focus, labeled inputs, save announcements, reduced-motion support, and useful empty states. Existing tracking flows were improved rather than replaced with a new framework.

Developed iteratively with AI-assisted code review, debugging, UI/UX iteration, and regression testing. This is a **client-side/front-end project**. Cloud authentication, synchronization, and PWA functionality remain future work.
