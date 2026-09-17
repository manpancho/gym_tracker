/* Navigation, daily overview, history, and backup controls. */
let storageBlocked = false;
let currentSetEditIndex = null;
let toastTimer;
const byId = id => document.getElementById(id);
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
function notify(message) {
  byId('toast').textContent = message; byId('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { byId('toast').hidden = true; }, 4500);
}
function showStorageWarning(message) { byId('storageWarning').textContent = message; byId('storageWarning').hidden = false; }
const pages = {
  dashboardSection: ['Your overview', 'Small steps. Stronger you. Here’s where you stand.'],
  workoutSection: ['Make it a strong session.', 'One set at a time. Log your training and watch your progress.'],
  mealSection: ['Fuel your everyday.', 'Keep meals simple, track your macros, and find your rhythm.'],
  metricsSection: ['Check in with yourself.', 'Your progress is more than the weight on the bar.'],
  exerciseManagerSection: ['Your exercise library', 'A familiar starting point for every session.'],
  settingsSection: ['Make it yours.', 'Personal targets and a safe home for your progress.']
};
function navigate(target, updateHash = true) {
  if (!pages[target]) target = 'dashboardSection';
  document.querySelectorAll('section.view').forEach(s => s.classList.toggle('active', s.id === target));
  document.querySelectorAll('nav [data-section]').forEach(b => {
    b.classList.toggle('active', b.dataset.section === target);
    if (b.dataset.section === target) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  [byId('pageTitle').textContent, byId('pageSubtitle').textContent] = pages[target];
  if (updateHash) history.replaceState(null, '', '#' + target);
  renderSummaryAndCharts();
  if (target === 'metricsSection') loadMetricsDay();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function setMealEditUI(editing) {
  byId('saveMealBtn').textContent = editing ? 'Save changes' : '+ Save meal';
  byId('saveMealAndPresetBtn').textContent = editing ? 'Update meal + preset' : 'Save meal + preset';
  byId('cancelMealEdit').hidden = !editing;
}
function renderExperience() {
  const today = todayISO();
  byId('todayLabel').textContent = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const meals = state.meals.filter(m => m.date === today), sets = state.workouts.filter(w => w.date === today), metric = state.metrics.find(m => m.date === today);
  const sum = key => meals.reduce((total, m) => total + m[key], 0);
  const targetText = key => state.goals?.[key] ? 'of ' + state.goals[key].toLocaleString() + (key === 'protein' ? ' g target' : ' kcal target') : 'No target set';
  const cards = [
    ['↗', 'WORKOUT', sets.length, 'sets', sets.length ? new Set(sets.map(w => w.exercise)).size + ' exercises logged' : 'Your next set starts here', 'workoutSection'],
    ['◷', 'CALORIES', sum('calories').toLocaleString(), 'kcal', targetText('calories'), 'mealSection'],
    ['◈', 'PROTEIN', sum('protein').toLocaleString(), 'g', targetText('protein'), 'mealSection'],
    ['⌁', 'BODYWEIGHT', metric?.bodyweight ?? '—', 'lbs', metric?.bodyweight ? 'Today’s check-in' : 'Take a moment to check in', 'metricsSection']
  ];
  byId('todayStats').innerHTML = cards.map(([icon, label, value, unit, note, page]) => `<button class="stat-card" data-open="${page}"><div class="stat-label">${label}<span>${icon}</span></div><div class="stat-value">${value}<small>${unit}</small></div><div class="stat-note">${note}<span>↗</span></div></button>`).join('');
  byId('activityWeek').innerHTML = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - 6 + i);
    const date = TrackerData.localDate(d), count = state.workouts.filter(w => w.date === date).length;
    return `<div class="activity-day ${count ? 'done' : ''} ${date === today ? 'today' : ''}" title="${date}: ${count} sets"><span>${d.toLocaleDateString(undefined, { weekday: 'short' })}</span><div>${count ? '✓' : '·'}</div><small>${d.getDate()}</small></div>`;
  }).join('');
  renderWorkoutLog(); renderMealTotals();
}
function renderMealTotals() {
  const meals = state.meals.filter(m => m.date === (byId('mealLogDateFilter').value || todayISO()));
  const totals = ['calories', 'protein', 'carbs', 'fat'].map(k => meals.reduce((n, m) => n + m[k], 0));
  byId('mealTotals').textContent = `${totals[0]} kcal · ${totals[1]} g protein · ${totals[2]} g carbs · ${totals[3]} g fat`;
}
function renderWorkoutLog() {
  const day = byId('workoutLogDate').value || todayISO(); byId('workoutLogDate').value = day;
  const sets = state.workouts.map((w, index) => ({ ...w, index })).filter(w => w.date === day);
  const volume = sets.reduce((n, w) => n + w.weight * w.reps, 0);
  byId('workoutTotals').textContent = `${sets.length} sets · ${volume.toLocaleString()} lbs total volume`;
  byId('workoutLog').innerHTML = sets.length ? sets.map(w => `<li><div class="meal-log-main"><strong>${escapeHTML(w.exercise)}</strong><span class="meal-log-sub">Set ${w.setNumber} · ${w.weight} lbs × ${w.reps} reps${w.rpe ? ' · RPE ' + w.rpe : ''}</span></div><div class="meal-log-actions"><button data-set="${w.index}" data-action="edit">Edit</button><button class="delete" data-set="${w.index}" data-action="delete">Delete</button></div></li>`).join('') : '<li class="empty-state"><strong>Your session starts here.</strong><span>Log a set above and it will appear here.</span></li>';
}
function loadMetricsDay() {
  const f = byId('metricsForm'), metric = state.metrics.find(m => m.date === f.metricsDate.value);
  ['bodyweight', 'sleepHours', 'steps', 'energy'].forEach(k => { f.elements[k].value = metric?.[k] ?? ''; });
}
function cancelSetEdit() {
  currentSetEditIndex = null; byId('workoutForm').reset(); setDefaultDateInputs();
  byId('cancelSetEdit').hidden = true; byId('saveSetBtn').textContent = '+ Save set';
}
window.addEventListener('DOMContentLoaded', () => {
  byId('todayStats').addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) navigate(b.dataset.open); });
  byId('workoutLogDate').addEventListener('change', renderWorkoutLog);
  byId('workoutForm').workoutDate.addEventListener('change', e => { byId('workoutLogDate').value = e.target.value; renderWorkoutLog(); });
  byId('mealLogDateFilter').addEventListener('change', renderMealTotals);
  byId('mealForm').mealDate.addEventListener('change', e => { byId('mealLogDateFilter').value = e.target.value; renderMealLog(); renderMealTotals(); });
  byId('metricsForm').metricsDate.addEventListener('change', loadMetricsDay);
  byId('cancelSetEdit').addEventListener('click', cancelSetEdit);
  byId('cancelMealEdit').addEventListener('click', () => { currentMealEditIndex = null; byId('mealForm').reset(); setDefaultDateInputs(); setMealEditUI(false); });
  byId('exerciseSelectWorkout').addEventListener('change', () => {
    if (currentSetEditIndex !== null) return;
    const f = byId('workoutForm'), prior = state.workouts.filter(w => w.exercise === f.exerciseWorkout.value && w.date === f.workoutDate.value);
    f.setNumber.value = prior.length ? Math.max(...prior.map(w => w.setNumber)) + 1 : 1;
  });
  byId('workoutLog').addEventListener('click', e => {
    const b = e.target.closest('[data-set]'); if (!b) return;
    const index = Number(b.dataset.set), entry = state.workouts[index];
    if (b.dataset.action === 'delete') {
      if (!confirm('Delete this workout set?')) return;
      state.workouts.splice(index, 1);
      if (currentSetEditIndex === index) cancelSetEdit();
      else if (currentSetEditIndex !== null && currentSetEditIndex > index) currentSetEditIndex--;
      saveState(); renderSummaryAndCharts(); notify('Set deleted.'); return;
    }
    currentSetEditIndex = index;
    const f = byId('workoutForm');
    if (![...f.exerciseWorkout.options].some(o => o.value === entry.exercise)) f.exerciseWorkout.add(new Option(entry.exercise, entry.exercise));
    for (const [field, key] of Object.entries({ workoutDate: 'date', exerciseWorkout: 'exercise', muscleGroup: 'muscleGroup', setNumber: 'setNumber', weight: 'weight', reps: 'reps', rpe: 'rpe' })) f.elements[field].value = entry[key] ?? '';
    byId('saveSetBtn').textContent = 'Save changes'; byId('cancelSetEdit').hidden = false;
    f.weight.focus(); f.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  const goals = byId('goalsForm');
  ['calories', 'protein'].forEach(k => { goals.elements[k].value = state.goals?.[k] ?? ''; });
  goals.addEventListener('submit', e => { e.preventDefault(); state.goals = { calories: parseNumber(goals.calories.value), protein: parseNumber(goals.protein.value) }; saveState(); renderSummaryAndCharts(); notify('Daily targets saved.'); });
  byId('exportData').addEventListener('click', () => {
    let contents;
    try { contents = storageBlocked ? localStorage.getItem(STORAGE_KEY) : JSON.stringify(state, null, 2); } catch { contents = JSON.stringify(state, null, 2); }
    const url = URL.createObjectURL(new Blob([contents || '{}'], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'gym-tracker-' + todayISO() + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('Backup exported.');
  });
  byId('importData').addEventListener('click', () => byId('importFile').click());
  byId('importFile').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw Error('Backup is too large (maximum 10 MB).');
      const imported = TrackerData.normalize(JSON.parse(await file.text()));
      if (!confirm(`Replace your current data with ${imported.workouts.length} sets, ${imported.meals.length} meals, and ${imported.metrics.length} check-ins? Export a backup first if you need the current entries.`)) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
      persistedSnapshot = JSON.stringify(imported);
      state = imported; storageBlocked = false; byId('storageWarning').hidden = true;
      currentMealEditIndex = null; setMealEditUI(false); byId('mealForm').reset(); cancelSetEdit();
      updateMealPresetsUI(); renderMealLog(); renderSummaryAndCharts(); loadMetricsDay();
      ['calories', 'protein'].forEach(k => { goals.elements[k].value = state.goals[k] ?? ''; }); notify('Backup imported.');
    } catch (err) { notify('Import failed: ' + err.message); }
    finally { e.target.value = ''; }
  });
  navigate(location.hash.slice(1) || 'dashboardSection', false);
});
