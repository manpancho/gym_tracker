// ==================================================
// CONFIG & GLOBAL STATE
// ==================================================
const STORAGE_KEY = "fitnessTracker_v4";
const TARGET_PROTEIN = 120;        // g/day
const TARGET_CALORIES = 1800;      // kcal/day
const MAINTENANCE_CALORIES = 2200; // kcal/day

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

// ==================================================
// STORAGE (LOAD / SAVE LOCALSTORAGE)
// ==================================================
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        state.workouts = parsed.workouts || [];
        state.meals    = parsed.meals || [];
        state.metrics  = parsed.metrics || [];
        state.mealPresets = parsed.mealPresets || [];

        // If exercises field exists, trust it (so delete/rename works).
        // If it's missing (old version), derive once from workouts.
        if ("exercises" in parsed) {
          state.exercises = parsed.exercises || [];
        } else {
          const fromWorkouts = new Set(
            state.workouts
              .map(w => (w.exercise || "").trim())
              .filter(Boolean)
          );
          state.exercises = Array.from(fromWorkouts);
        }
      }
    }
  } catch (err) {
    console.error("Error loading state:", err);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error("Error saving state:", err);
  }
}


// ==================================================
// UTILITY FUNCTIONS
// ==================================================
function todayISO() {
  // Returns YYYY-MM-DD in the user's local timezone
  return new Date().toLocaleDateString("en-CA");
}

function parseNumber(value) {
  const num = Number(value);
  return isNaN(num) ? null : num;
}

function inLastNDays(dateString, n) {
  if (!dateString) return false;
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return false;

  const today = new Date();
  today.setHours(0,0,0,0);
  const cutoff = new Date(today.getTime() - (n - 1) * 24 * 60 * 60 * 1000);

  d.setHours(0,0,0,0);
  return d >= cutoff && d <= today;
}


// ==================================================
// EXERCISE AND FOOD MANAGER (PRESETS + EDIT/DELETE)
// ==================================================
function updateExercisePresetsUI() {
  const workoutSelect   = document.getElementById("exerciseSelectWorkout");
  const dashboardSelect = document.getElementById("exerciseSelectDashboard");
  const listEl          = document.getElementById("exerciseList");

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

  // List in Manage section
  listEl.innerHTML = "";
  if (!exercises.length) {
    listEl.innerHTML = '<li class="muted">No exercises yet. Add some above.</li>';
  } else {
    exercises.forEach(name => {
      const li = document.createElement("li");
      li.dataset.name = name;
      li.innerHTML = `
        <span class="exercise-list-name">${name}</span>
        <span class="exercise-list-actions">
          <button type="button" data-action="edit" data-name="${name}">Edit</button>
          <button type="button" class="delete" data-action="delete" data-name="${name}">Delete</button>
        </span>
      `;
      listEl.appendChild(li);
    });
  }
}

function addExerciseName(name) {
  const clean = (name || "").trim();
  if (!clean) return;
  if (!state.exercises.includes(clean)) {
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
      alert("An exercise with that name already exists.");
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
      ? `Delete "${name}"? This will also remove ${usedCount} logged workout set(s) for this exercise.`
      : `Delete "${name}" from your exercise list?`;

    if (!confirm(warning)) return;

    state.exercises = state.exercises.filter(n => n !== name);
    if (usedCount) {
      state.workouts = state.workouts.filter(w => w.exercise !== name);
    }
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
    alert("Enter a description before saving as a preset.");
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
  if (showAlert) alert("Preset saved.");
}

function handleSaveMealAndPreset() {
  const form = document.getElementById("mealForm");
  const entry = readMealForm();
  if (!entry) return;

  if (!entry.calories && !entry.protein && !entry.carbs && !entry.fat) {
    alert("Enter at least calories or macros.");
    return;
  }

  // 1) Save meal to log as new
  currentMealEditIndex = null;
  state.meals.push(entry);

  // 2) Save as preset too (no duplicate alert)
  handleSaveMealPreset(false);

  saveState();
  form.reset();
  setDefaultDateInputs();
  renderSummaryAndCharts();
  renderMealLog();
  alert("Meal and preset saved.");
}



function readMealForm() {
  const form = document.getElementById("mealForm");
  if (!form) return null;

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
          <div class="meal-log-title">${mealLabel}: ${m.food || "(no description)"}</div>
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
    alert("Please select an exercise from the dropdown.");
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

  if (!entry.reps || !entry.weight) {
    alert("Please enter reps and weight.");
    return;
  }

  addExerciseName(exerciseName);

  state.workouts.push(entry);
  saveState();
  form.reset();
  renderSummaryAndCharts();
}

function handleMealSubmit(event) {
  event.preventDefault();
  const form = document.getElementById("mealForm");
  const entry = readMealForm();
  if (!entry) return;

  if (!entry.calories && !entry.protein && !entry.carbs && !entry.fat) {
    alert("Enter at least calories or macros.");
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
    currentMealEditIndex = null;
  } else {
    // New meal
    state.meals.push(entry);
  }

  saveState();
  form.reset();
  setDefaultDateInputs();
  renderSummaryAndCharts();
  renderMealLog();
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
    alert("Enter at least one metric.");
    return;
  }

  state.metrics.push(entry);
  saveState();
  form.reset();
  renderSummaryAndCharts();
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
    avgCalories:  meals.length ? totalCals    / dayCount : null,
    avgProtein:   meals.length ? totalProtein / dayCount : null,
    avgCarbs:     meals.length ? totalCarbs   / dayCount : null,
    avgFat:       meals.length ? totalFat     / dayCount : null,
    avgVolume:    workouts.length ? totalVolume / dayCount : null,
    avgBodyweight: bwCount ? bwSum / bwCount : null
  };
}

function buildSuggestions(summary) {
  if (!summary) return ["Not enough data yet to generate suggestions."];

  const s = summary;
  const suggestions = [];

  if (s.avgProtein !== null) {
    if (s.avgProtein < TARGET_PROTEIN * 0.9) {
      suggestions.push(
        `Average protein (~${s.avgProtein.toFixed(0)} g) is below your target (${TARGET_PROTEIN} g). ` +
        `Consider adding a higher-protein meal or shake.`
      );
    } else if (s.avgProtein > TARGET_PROTEIN * 1.1) {
      suggestions.push(
        `Average protein (~${s.avgProtein.toFixed(0)} g) is above your target. ` +
        `This is fine if digestion and recovery feel good.`
      );
    } else {
      suggestions.push(
        `Protein intake (~${s.avgProtein.toFixed(0)} g) is within your target range. Keep it consistent.`
      );
    }
  }

  if (s.avgCalories !== null) {
    const deficit = MAINTENANCE_CALORIES - s.avgCalories;
    if (deficit > 700) {
      suggestions.push(
        `Average calories (~${s.avgCalories.toFixed(0)} kcal) are likely putting you in a large deficit ` +
        `(~${deficit.toFixed(0)} kcal vs estimated maintenance ${MAINTENANCE_CALORIES}). ` +
        `Consider increasing calories slightly to support recovery.`
      );
    } else if (deficit < 200) {
      suggestions.push(
        `Average calories (~${s.avgCalories.toFixed(0)} kcal) are close to or above maintenance. ` +
        `If fat loss is a goal, consider tightening the deficit a bit.`
      );
    } else {
      suggestions.push(
        `Calorie intake (~${s.avgCalories.toFixed(0)} kcal) suggests a moderate deficit. ` +
        `This is generally sustainable for slow cutting or recomposition.`
      );
    }
  }

  if (s.avgVolume !== null) {
    if (s.avgVolume < 2000) {
      suggestions.push(
        `Average training volume (~${s.avgVolume.toFixed(0)} total lbs per day) is on the lower side. ` +
        `If you feel good, you could experiment with adding a set or another exercise.`
      );
    } else if (s.avgVolume > 6000) {
      suggestions.push(
        `Average training volume (~${s.avgVolume.toFixed(0)} total lbs per day) is quite high. ` +
        `Monitor fatigue and consider a deload week if recovery feels poor.`
      );
    } else {
      suggestions.push(
        `Training volume (~${s.avgVolume.toFixed(0)} total lbs per day) is in a moderate range. ` +
        `Focus on progressive overload and good form.`
      );
    }
  }

  if (s.avgBodyweight !== null) {
    suggestions.push(
      `Average bodyweight over the window is about ${s.avgBodyweight.toFixed(1)} lbs. ` +
      `Compare this with your goal trend (up, down, or stable).`
    );
  }

  return suggestions.length ? suggestions : ["Not enough data yet to generate suggestions."];
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

  items.push({ label: "Avg calories / day", value: fmt(s.avgCalories, " kcal") });
  items.push({ label: "Avg protein / day",  value: fmt(s.avgProtein, " g") });
  items.push({ label: "Avg training volume / day", value: fmt(s.avgVolume, " lbs", 0) });
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

  renderCharts();
}


// ==================================================
// CHARTS (EXERCISE TREND + WEIGHT TREND)
// ==================================================
function renderCharts() {
  renderExerciseChart();
  renderWeightChart();
}

function renderExerciseChart() {
  const exerciseName = document.getElementById("exerciseSelectDashboard").value;
  const hintEl = document.getElementById("exerciseChartHint");
  const ctx    = document.getElementById("exerciseChart").getContext("2d");

  if (!exerciseName) {
    if (exerciseChart) {
      exerciseChart.destroy();
      exerciseChart = null;
    }
    hintEl.textContent = "Choose an exercise to see how your strength changes over time.";
    return;
  }

  const relevant = state.workouts.filter(w => w.exercise === exerciseName);
  if (!relevant.length) {
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

  exerciseChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: dates,
      datasets: [{
        label: `Est. 1RM (${exerciseName})`,
        data: values,
        tension: 0.25
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
    if (weightChart) {
      weightChart.destroy();
      weightChart = null;
    }
    return;
  }

  const byDate = {};
  state.metrics.forEach(m => {
    if (m.bodyweight !== null && m.bodyweight !== undefined) {
      const d = m.date;
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(m.bodyweight);
    }
  });

  const dates = Object.keys(byDate).sort((a, b) => new Date(a) - new Date(b));
  if (!dates.length) {
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

  weightChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: dates,
      datasets: [{
        label: "Bodyweight",
        data: values,
        tension: 0.25
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
}


// ==================================================
// NAVIGATION & APP INIT
// ==================================================
function setupNav() {
  const buttons  = document.querySelectorAll("nav button[data-section]");
  const sections = document.querySelectorAll("section.view");

  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-section");
      buttons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      sections.forEach(sec => {
        if (sec.id === target) {
          sec.classList.add("active");
        } else {
          sec.classList.remove("active");
        }
      });

      if (target === "dashboardSection") {
        renderSummaryAndCharts();
      } else if (target === "exerciseManagerSection") {
        updateExercisePresetsUI();
      }
    });
  });
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
      lastDate = current;
      setDefaultDateInputs();
      // Optional: if you want the log to follow today by default:
      const filterInput = document.getElementById("mealLogDateFilter");
      if (filterInput && (!filterInput.value || filterInput.value === current)) {
        filterInput.value = current;
        renderMealLog();
      }
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
