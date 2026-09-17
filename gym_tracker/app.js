// ==================================================
// CONFIG & GLOBAL STATE
// ==================================================
const STORAGE_KEY = "fitnessTracker_v4";

let state = {
  workouts: [],
  meals: [],
  metrics: [],
  exercises: [],    // preset exercise names
  mealPresets: []   // preset meals
};

let exerciseChart = null;
let weightChart   = null;
let currentMealEditIndex = null; // index in state.meals, or null when not editing
let persistedSnapshot;

// ==================================================
// STORAGE (LOAD / SAVE LOCALSTORAGE)
// ==================================================
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = TrackerData.normalize(JSON.parse(raw));
    else state.exercises = ['Bench press', 'Squat', 'Deadlift', 'Overhead press', 'Lat pulldown', 'Romanian deadlift', 'Dumbbell row'];
    persistedSnapshot = JSON.stringify(state);
  } catch (err) {
    showStorageWarning('Your saved data could not be loaded. Export the original data before making changes.');
    storageBlocked = true;
  }
}


function saveState() {
  if (storageBlocked) throw new Error('Saving blocked to protect unreadable data.');
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    persistedSnapshot = JSON.stringify(state);
  } catch (err) {
    if (persistedSnapshot) state = JSON.parse(persistedSnapshot);
    showStorageWarning('Changes could not be saved. Your previous entries are safe; keep your form open and try again. Browser storage may be full or unavailable.');
    throw err;
  }
}


// ==================================================
// UTILITY FUNCTIONS
// ==================================================
function todayISO() { return TrackerData.localDate(); }


function parseNumber(value) { return TrackerData.number(value); }


function inLastNDays(dateString, n) { return TrackerData.inWindow(dateString, n); }


// ==================================================
// EXERCISE AND FOOD MANAGER (PRESETS + EDIT/DELETE)
// ==================================================
function updateExercisePresetsUI() {
  const workoutSelect   = document.getElementById("exerciseSelectWorkout");
  const dashboardSelect = document.getElementById("exerciseSelectDashboard");
  const listEl          = document.getElementById("exerciseList");

  const selectedWorkout = workoutSelect.value;
  const selectedDashboard = dashboardSelect.value;
  const exercises = [...state.exercises].sort((a, b) => a.localeCompare(b));

  // Workout dropdown
  workoutSelect.innerHTML = '<option value="">Select exercise</option>';
  exercises.forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    workoutSelect.appendChild(opt);
  });

  // Dashboard dropdown
  dashboardSelect.innerHTML = '<option value="">Select exercise</option>';
  exercises.forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    dashboardSelect.appendChild(opt);
  });

  const historical = [...new Set(state.workouts.map(w => w.exercise))].filter(n => !exercises.includes(n));
  historical.forEach(name => dashboardSelect.add(new Option(name + ' (archived)', name)));
  workoutSelect.value = selectedWorkout;
  dashboardSelect.value = selectedDashboard;
  // List in Manage section
  listEl.innerHTML = "";
  if (!exercises.length) {
    listEl.innerHTML = '<li class="muted">No exercises yet. Add some above.</li>';
  } else {
    exercises.forEach(name => {
      const li = document.createElement("li");
      li.dataset.name = name;
      li.innerHTML = `
        <span class="exercise-list-name">${escapeHTML(name)}</span>
        <span class="exercise-list-actions">
          <button type="button" data-action="edit" data-name="${escapeHTML(name)}">Edit</button>
          <button type="button" class="delete" data-action="delete" data-name="${escapeHTML(name)}">Delete</button>
        </span>
      `;
      listEl.appendChild(li);
    });
  }
}

function addExerciseName(name) {
  const clean = (name || "").trim();
  if (!clean) return;
  if (!state.exercises.some(n => n.toLowerCase() === clean.toLowerCase())) {
    state.exercises.push(clean);
    saveState();
    updateExercisePresetsUI();
  }
}

function handleExerciseListClick(event) {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  const name   = btn.dataset.name;
  if (!name) return;

  if (action === "edit") {
    const newName = prompt("Rename exercise:", name);
    if (!newName) return;
    const clean = newName.trim();
    if (!clean || clean === name) return;
    if (state.exercises.includes(clean)) {
      notify("An exercise with that name already exists.");
      return;
    }

    // Update exercises list
    state.exercises = state.exercises.map(n => n === name ? clean : n);
    // Update existing workouts using this exercise
    state.workouts = state.workouts.map(w =>
      w.exercise === name ? { ...w, exercise: clean } : w
    );
    saveState();
    updateExercisePresetsUI();
    renderSummaryAndCharts();
  }

  if (action === "delete") {
    const usedCount = state.workouts.filter(w => w.exercise === name).length;
    const warning = usedCount
      ? `Delete "${name}"? Your ${usedCount} logged workout set(s) will be kept in history.`
      : `Delete "${name}" from your exercise list?`;

    if (!confirm(warning)) return;

    state.exercises = state.exercises.filter(n => n !== name);

    saveState();
    updateExercisePresetsUI();
    renderSummaryAndCharts();
  }
}

function updateMealPresetsUI() {
  const select = document.getElementById("mealPresetSelect");
  if (!select) return;

  select.innerHTML = '<option value="">None</option>';

  state.mealPresets.forEach((preset, index) => {
    const opt = document.createElement("option");
    opt.value = String(index); // index into array
    opt.textContent = preset.name;
    select.appendChild(opt);
  });
}

function handleMealPresetChange(event) {
  const idx = event.target.value;
  if (idx === "") return;

  const preset = state.mealPresets[Number(idx)];
  if (!preset) return;

  const form = document.getElementById("mealForm");
  if (!form) return;

  form.food.value     = preset.name || "";
  form.calories.value = preset.calories ?? "";
  form.protein.value  = preset.protein ?? "";
  form.carbs.value    = preset.carbs ?? "";
  form.fat.value      = preset.fat ?? "";
}

function handleSaveMealPreset(showAlert = true) {
  const entry = readMealForm();
  if (!entry) return;

  const name = entry.food;
  if (!name) {
    notify("Enter a description before saving as a preset.");
    return;
  }

  const calories = entry.calories;
  const protein  = entry.protein;
  const carbs    = entry.carbs;
  const fat      = entry.fat;

  const existingIndex = state.mealPresets.findIndex(p => p.name === name);
  const preset = { name, calories, protein, carbs, fat };

  if (existingIndex >= 0) {
    state.mealPresets[existingIndex] = preset;
  } else {
    state.mealPresets.push(preset);
  }

  saveState();
  updateMealPresetsUI();
  if (showAlert) notify("Preset saved.");
}

function handleSaveMealAndPreset() {
  const entry = readMealForm();
  if (!entry) return;
  if (!entry.food) { notify('Add a description to name your preset.'); return; }
  handleSaveMealPreset(false);
  handleMealSubmit({ preventDefault() {} });
}


function readMealForm() {
  const form = document.getElementById("mealForm");
  if (!form || !form.reportValidity()) return null;

  return {
    date:     form.mealDate.value || todayISO(),
    meal:     form.mealType.value || "Meal",
    food:     form.food.value.trim(),
    calories: parseNumber(form.calories.value) || 0,
    protein:  parseNumber(form.protein.value) || 0,
    carbs:    parseNumber(form.carbs.value) || 0,
    fat:      parseNumber(form.fat.value) || 0
  };
}

function renderMealLog() {
  const listEl  = document.getElementById("mealLogList");
  const filterInput = document.getElementById("mealLogDateFilter");
  if (!listEl || !filterInput) return;

  let filterDate = filterInput.value;
  if (!filterDate) {
    filterDate = todayISO();
    filterInput.value = filterDate;
  }

  const mealsForDay = state.meals
    .map((meal, index) => ({ ...meal, index }))
    .filter(m => m.date === filterDate);

  if (!mealsForDay.length) {
    listEl.innerHTML = '<li class="muted">No meals logged for this day yet.</li>';
    return;
  }

  listEl.innerHTML = mealsForDay.map(m => {
    const kcal   = m.calories ?? 0;
    const prot   = m.protein ?? 0;
    const carbs  = m.carbs ?? 0;
    const fat    = m.fat ?? 0;
    const mealLabel = m.meal || "Meal";

    return `
      <li data-index="${m.index}">
        <div class="meal-log-main">
          <div class="meal-log-title">${escapeHTML(mealLabel)}: ${escapeHTML(m.food || "(no description)")}</div>
          <div class="meal-log-sub">
            ${kcal} kcal · ${prot}P / ${carbs}C / ${fat}F
          </div>
        </div>
        <div class="meal-log-actions">
          <button type="button" data-action="edit">Edit</button>
          <button type="button" class="delete" data-action="delete">Delete</button>
        </div>
      </li>
    `;
  }).join("");
}

// ==================================================
// FORM HANDLERS (WORKOUT / MEALS / METRICS / EXERCISES)
// ==================================================
function handleWorkoutSubmit(event) {
  event.preventDefault();
  const form = event.target;

  const exerciseName = form.exerciseWorkout.value;
  if (!exerciseName) {
    notify("Please select an exercise from the dropdown.");
    return;
  }

  const entry = {
    date:        form.workoutDate.value || todayISO(),
    muscleGroup: form.muscleGroup.value || "Other",
    exercise:    exerciseName,
    setNumber:   parseNumber(form.setNumber.value) || 1,
    weight:      parseNumber(form.weight.value) || 0,
    reps:        parseNumber(form.reps.value) || 0,
    rpe:         parseNumber(form.rpe.value)
  };

  if (entry.reps < 1 || entry.weight < 0) {
    notify("Please enter reps and weight.");
    return;
  }

  addExerciseName(exerciseName);

  if (currentSetEditIndex !== null) state.workouts[currentSetEditIndex] = entry;
  else state.workouts.push(entry);
  saveState();
  currentSetEditIndex = null;
  document.getElementById('workoutLogDate').value = entry.date;
  form.setNumber.value = entry.setNumber + 1;
  document.getElementById('saveSetBtn').textContent = '+ Save set';
  document.getElementById('cancelSetEdit').hidden = true;
  renderSummaryAndCharts();
  notify('Set saved. Ready for the next one.');
}

function handleMealSubmit(event) {
  event.preventDefault();
  const form = document.getElementById("mealForm");
  const entry = readMealForm();
  if (!entry) return;

  if (!entry.calories && !entry.protein && !entry.carbs && !entry.fat) {
    notify("Enter at least calories or macros.");
    return;
  }

  if (currentMealEditIndex !== null) {
    // Update existing meal
    if (
      currentMealEditIndex >= 0 &&
      currentMealEditIndex < state.meals.length
    ) {
      state.meals[currentMealEditIndex] = entry;
    }
  } else {
    // New meal
    state.meals.push(entry);
  }

  saveState();
  currentMealEditIndex = null;
  form.reset();
  form.mealDate.value = entry.date;
  document.getElementById("mealLogDateFilter").value = entry.date;
  setMealEditUI(false);
  setDefaultDateInputs();
  renderSummaryAndCharts();
  renderMealLog();
  notify("Meal saved.");
}



function handleMetricsSubmit(event) {
  event.preventDefault();
  const form = event.target;

  const entry = {
    date:       form.metricsDate.value || todayISO(),
    bodyweight: parseNumber(form.bodyweight.value),
    sleepHours: parseNumber(form.sleepHours.value),
    steps:      parseNumber(form.steps.value),
    energy:     parseNumber(form.energy.value)
  };

  if (
    entry.bodyweight === null &&
    entry.sleepHours === null &&
    entry.steps === null &&
    entry.energy === null
  ) {
    notify("Enter at least one metric.");
    return;
  }

  const existing = state.metrics.find(m => m.date === entry.date);
  if (existing) Object.keys(entry).forEach(key => { if (entry[key] !== null) existing[key] = entry[key]; });
  else state.metrics.push(entry);
  saveState();
  setDefaultDateInputs();
  renderSummaryAndCharts();
  notify("Daily check-in saved.");
}

function handleExerciseManagerSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const name = form.exerciseName.value;
  addExerciseName(name);
  form.reset();
}

function handleMealLogClick(event) {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;

  const li = btn.closest("li[data-index]");
  if (!li) return;

  const index = Number(li.dataset.index);
  if (Number.isNaN(index) || index < 0 || index >= state.meals.length) return;

  const action = btn.dataset.action;
  const meal   = state.meals[index];

  if (action === "edit") {
    const form = document.getElementById("mealForm");
    if (!form || !meal) return;

    currentMealEditIndex = index;
    setMealEditUI(true);

    form.mealDate.value  = meal.date || todayISO();
    form.mealType.value  = meal.meal || "Meal";
    form.food.value      = meal.food || "";
    form.calories.value  = meal.calories ?? "";
    form.protein.value   = meal.protein ?? "";
    form.carbs.value     = meal.carbs ?? "";
    form.fat.value       = meal.fat ?? "";

    // Scroll to form so it's clear you're editing
    form.scrollIntoView({ behavior: "smooth", block: "start" });

  } else if (action === "delete") {
    const ok = confirm("Delete this meal entry?");
    if (!ok) return;

    // If we were editing this one, cancel edit
    if (currentMealEditIndex === index) {
      currentMealEditIndex = null;
      document.getElementById("mealForm")?.reset();
      setDefaultDateInputs();
    }

    if (currentMealEditIndex !== null && currentMealEditIndex > index) currentMealEditIndex--;
    if (currentMealEditIndex === null) setMealEditUI(false);
    state.meals.splice(index, 1);
    saveState();
    renderMealLog();
    renderSummaryAndCharts();
  }
}

// ==================================================
// SUMMARY & SUGGESTIONS (DASHBOARD)
// ==================================================
function computeSummary(nDays) {
  if (!state.workouts.length && !state.meals.length && !state.metrics.length) {
    return null;
  }

  const workouts = state.workouts.filter(w => inLastNDays(w.date, nDays));
  const meals    = state.meals.filter(m => inLastNDays(m.date, nDays));
  const metrics  = state.metrics.filter(m => inLastNDays(m.date, nDays));

  if (!workouts.length && !meals.length && !metrics.length) {
    return null;
  }

  const dateSet = new Set();
  workouts.forEach(w => dateSet.add(w.date));
  meals.forEach(m => dateSet.add(m.date));
  metrics.forEach(m => dateSet.add(m.date));
  const dayCount = dateSet.size || nDays;
  const mealDays = new Set(meals.map(m => m.date)).size;
  const workoutDays = new Set(workouts.map(w => w.date)).size;

  let totalCals = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0;
  meals.forEach(m => {
    totalCals    += m.calories || 0;
    totalProtein += m.protein  || 0;
    totalCarbs   += m.carbs    || 0;
    totalFat     += m.fat      || 0;
  });

  let totalVolume = 0;
  workouts.forEach(w => {
    totalVolume += (w.weight || 0) * (w.reps || 0);
  });

  let bwSum = 0, bwCount = 0;
  metrics.forEach(m => {
    if (m.bodyweight !== null && m.bodyweight !== undefined) {
      bwSum   += m.bodyweight;
      bwCount += 1;
    }
  });

  return {
    nDays,
    dayCount,
    avgCalories:  meals.length ? totalCals    / mealDays : null,
    avgProtein:   meals.length ? totalProtein / mealDays : null,
    avgCarbs:     meals.length ? totalCarbs   / mealDays : null,
    avgFat:       meals.length ? totalFat     / mealDays : null,
    avgVolume:    workouts.length ? totalVolume / workoutDays : null,
    avgBodyweight: bwCount ? bwSum / bwCount : null
  };
}

function buildSuggestions(s) {
  if (!s) return ['Your story starts with one entry. Log a workout, meal, or check-in.'];
  const notes = [s.dayCount + ' days with entries in this ' + s.nDays + '-day window.'];
  if (s.avgCalories !== null) notes.push('Nutrition averages include only days with logged meals. Incomplete days can lower your averages.');
  if (s.avgProtein !== null && state.goals?.protein) notes.push('Average protein: ' + Math.round(s.avgProtein) + ' g compared with your ' + state.goals.protein + ' g target.');
  if (s.avgBodyweight !== null) notes.push('Average bodyweight: ' + s.avgBodyweight.toFixed(1) + ' lbs. Look at the longer trend, not a single day.');
  return notes;
}


function renderSummary() {
  const daysSelect = document.getElementById("summaryDays");
  const nDays = Number(daysSelect.value) || 7;

  const summaryEl = document.getElementById("summaryStats");
  const suggEl    = document.getElementById("suggestionsList");

  const summary = computeSummary(nDays);

  if (!summary) {
    summaryEl.innerHTML = '<p class="muted">No data yet in this window. Log some entries first.</p>';
    suggEl.innerHTML = '<li class="muted">Suggestions will appear here once there’s enough data.</li>';
    return;
  }

  const s = summary;
  const items = [];

  function fmt(val, suffix = "", decimals = 0) {
    return val === null ? "—" : `${val.toFixed(decimals)}${suffix}`;
  }

  items.push({ label: "Calories / logged day", value: fmt(s.avgCalories, " kcal") });
  items.push({ label: "Protein / logged day",  value: fmt(s.avgProtein, " g") });
  items.push({ label: "Volume / training day", value: fmt(s.avgVolume, " lbs", 0) });
  items.push({ label: "Avg bodyweight",     value: fmt(s.avgBodyweight, " lbs", 1) });
  items.push({ label: "Days with data",     value: String(s.dayCount) });

  summaryEl.innerHTML = `
    <div class="summary-grid">
      ${items.map(item => `
        <div class="summary-item">
          <div class="label">${item.label}</div>
          <div class="value">${item.value}</div>
        </div>
      `).join("")}
    </div>
  `;

  const suggestions = buildSuggestions(summary);
  suggEl.innerHTML = suggestions.map(text => `<li>${text}</li>`).join("");

}


// ==================================================
// CHARTS (EXERCISE TREND + WEIGHT TREND)
// ==================================================
function renderCharts() {
  if (typeof Chart === "undefined") {
    document.getElementById("exerciseChart").hidden = true;
    document.getElementById("weightChart").hidden = true;
    document.getElementById("exerciseChartHint").textContent = "Charts are unavailable. Your entries and summaries still work.";
    document.getElementById("weightChartHint").textContent = "Charts are unavailable. Your check-ins are still saved.";
    return;
  }
  renderExerciseChart();
  renderWeightChart();
}

function renderExerciseChart() {
  if (typeof Chart === "undefined") return;
  const exerciseName = document.getElementById("exerciseSelectDashboard").value;
  const hintEl = document.getElementById("exerciseChartHint");
  const ctx    = document.getElementById("exerciseChart").getContext("2d");

  if (!exerciseName) {
    document.getElementById("exerciseChart").hidden = true;
    if (exerciseChart) {
      exerciseChart.destroy();
      exerciseChart = null;
    }
    hintEl.textContent = "Choose an exercise to see how your strength changes over time.";
    return;
  }

  const relevant = state.workouts.filter(w => w.exercise === exerciseName && inLastNDays(w.date, Number(document.getElementById("summaryDays").value)));
  if (!relevant.length) {
    document.getElementById("exerciseChart").hidden = true;
    if (exerciseChart) {
      exerciseChart.destroy();
      exerciseChart = null;
    }
    hintEl.textContent = "No data yet for this exercise.";
    return;
  }

  const byDate = {};
  relevant.forEach(w => {
    const d = w.date;
    const est1rm = (w.weight || 0) * (1 + (w.reps || 0) / 30);
    if (!byDate[d] || est1rm > byDate[d]) {
      byDate[d] = est1rm;
    }
  });

  const dates = Object.keys(byDate).sort((a, b) => new Date(a) - new Date(b));
  const values = dates.map(d => byDate[d]);

  if (exerciseChart) {
    exerciseChart.destroy();
  }

  document.getElementById("exerciseChart").hidden = false;
  exerciseChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: dates,
      datasets: [{
        label: `Est. 1RM (${exerciseName})`,
        data: values,
        borderColor: "#5ed4cd", backgroundColor: "rgba(94,212,205,.08)", fill: true, pointRadius: 4, tension: 0.25
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: "#9ca3af", maxTicksLimit: 6 },
          grid:  { display: false }
        },
        y: {
          ticks: { color: "#9ca3af" },
          grid:  { color: "rgba(55,65,81,0.6)" }
        }
      }
    }
  });

  hintEl.textContent = "Each point is the best estimated 1RM for that day.";
}

function renderWeightChart() {
  const ctx = document.getElementById("weightChart").getContext("2d");

  if (!state.metrics.length) {
    document.getElementById("weightChart").hidden = true;
    document.getElementById("weightChartHint").textContent = "Log your bodyweight to start seeing a trend.";
    if (weightChart) {
      weightChart.destroy();
      weightChart = null;
    }
    return;
  }

  const byDate = {};
  state.metrics.filter(m => inLastNDays(m.date, Number(document.getElementById("summaryDays").value))).forEach(m => {
    if (m.bodyweight !== null && m.bodyweight !== undefined) {
      const d = m.date;
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(m.bodyweight);
    }
  });

  const dates = Object.keys(byDate).sort();
  document.getElementById("weightChartHint").textContent = dates.length ? "Daily bodyweight in lbs, within the selected window." : "No bodyweight entries in this window.";
  if (!dates.length) {
    document.getElementById("weightChart").hidden = true;
    if (weightChart) {
      weightChart.destroy();
      weightChart = null;
    }
    return;
  }

  const values = dates.map(d => {
    const arr = byDate[d];
    const sum = arr.reduce((acc, v) => acc + v, 0);
    return sum / arr.length;
  });

  if (weightChart) {
    weightChart.destroy();
  }

  document.getElementById("weightChart").hidden = false;
  weightChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: dates,
      datasets: [{
        label: "Bodyweight",
        data: values,
        borderColor: "#5ed4cd", backgroundColor: "rgba(94,212,205,.08)", fill: true, pointRadius: 4, tension: 0.25
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: "#9ca3af", maxTicksLimit: 6 },
          grid:  { display: false }
        },
        y: {
          ticks: { color: "#9ca3af" },
          grid:  { color: "rgba(55,65,81,0.6)" }
        }
      }
    }
  });
}

function renderSummaryAndCharts() {
  updateExercisePresetsUI();
  renderSummary();
  renderCharts();
  renderExperience();
}


// ==================================================
// NAVIGATION & APP INIT
// ==================================================
function setupNav() {
  document.querySelectorAll('nav button[data-section]').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.section)));
  document.querySelectorAll('[data-goto]').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.goto)));
  window.addEventListener('hashchange', () => navigate(location.hash.slice(1), false));
}


function setDefaultDateInputs() {
  const today = todayISO();

  const workoutDate = document.querySelector('input[name="workoutDate"]');
  const mealDate    = document.querySelector('input[name="mealDate"]');
  const metricsDate = document.querySelector('input[name="metricsDate"]');

  // Only set if empty, so you don't overwrite manual back-dated logs
  if (workoutDate && !workoutDate.value) workoutDate.value = today;
  if (mealDate && !mealDate.value)       mealDate.value    = today;
  if (metricsDate && !metricsDate.value) metricsDate.value = today;
}

// INIT
window.addEventListener("DOMContentLoaded", () => {
  loadState();
  setupNav();

  setDefaultDateInputs();

  let lastDate = todayISO();
  setInterval(() => {
    const current = todayISO();
    if (current !== lastDate) {
      document.querySelectorAll('input[type="date"]').forEach(input => { if (input.value === lastDate) input.value = current; });
      lastDate = current;
      setDefaultDateInputs();
      // Optional: if you want the log to follow today by default:
      const filterInput = document.getElementById("mealLogDateFilter");
      if (filterInput && (!filterInput.value || filterInput.value === current)) {
        filterInput.value = current;
        renderMealLog();
      }
      renderSummaryAndCharts();
    }
  }, 60 * 1000);

  updateMealPresetsUI();

  const mealPresetSelect = document.getElementById("mealPresetSelect");
  if (mealPresetSelect) {
    mealPresetSelect.addEventListener("change", handleMealPresetChange);
  }

  const saveMealPresetOnlyBtn = document.getElementById("saveMealPresetOnlyBtn");
  if (saveMealPresetOnlyBtn) {
    saveMealPresetOnlyBtn.addEventListener("click", () => handleSaveMealPreset(true));
  }

  const saveMealAndPresetBtn = document.getElementById("saveMealAndPresetBtn");
  if (saveMealAndPresetBtn) {
    saveMealAndPresetBtn.addEventListener("click", handleSaveMealAndPreset);
  }

  const mealLogDateFilter = document.getElementById("mealLogDateFilter");
  if (mealLogDateFilter) {
    if (!mealLogDateFilter.value) mealLogDateFilter.value = todayISO();
    mealLogDateFilter.addEventListener("change", renderMealLog);
  }

  const mealLogList = document.getElementById("mealLogList");
  if (mealLogList) {
    mealLogList.addEventListener("click", handleMealLogClick);
  }

  document.getElementById("workoutForm")
    .addEventListener("submit", handleWorkoutSubmit);
  document.getElementById("mealForm")
    .addEventListener("submit", handleMealSubmit);
  document.getElementById("metricsForm")
    .addEventListener("submit", handleMetricsSubmit);
  document.getElementById("exerciseManagerForm")
    .addEventListener("submit", handleExerciseManagerSubmit);

  document.getElementById("summaryDays")
    .addEventListener("change", renderSummaryAndCharts);
  document.getElementById("exerciseSelectDashboard")
    .addEventListener("change", renderExerciseChart);
  document.getElementById("exerciseList")
    .addEventListener("click", handleExerciseListClick);

  updateExercisePresetsUI();
  renderSummaryAndCharts();
  renderMealLog();
});
