/* Pure data helpers shared by the application and regression tests. */
(function (root) {
  const localDate = (date = new Date()) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  const number = value => value === null || value === undefined || String(value).trim() === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(new Date(value + 'T12:00:00').getTime()) && localDate(new Date(value + 'T12:00:00')) === value;
  function inWindow(value, days, now = new Date()) {
    if (!validDate(value)) return false;
    const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - (days - 1));
    return value >= localDate(cutoff) && value <= localDate(now);
  }
  function normalize(input) {
    if (!input || typeof input !== 'object' || !['workouts', 'meals', 'metrics'].every(key => Array.isArray(input[key]))) throw Error('Not a Gym and Nutrition Tracker backup.');
    const data = JSON.parse(JSON.stringify(input));
    for (const key of ['exercises', 'mealPresets']) if (data[key] !== undefined && !Array.isArray(data[key])) throw Error('Invalid ' + key);
    const numeric = (item, keys, nullable = false) => keys.forEach(key => {
      if (nullable && (item[key] === null || item[key] === undefined)) { item[key] = null; return; }
      if (typeof item[key] !== 'number' || !Number.isFinite(item[key]) || item[key] < 0) throw Error('Invalid ' + key);
    });
    const text = value => typeof value === 'string';
    for (const key of ['workouts', 'meals', 'metrics']) data[key].forEach(item => {
      if (!item || !validDate(item.date)) throw Error('Invalid entry date.');
      if (key === 'workouts') {
        if (!text(item.exercise) || !item.exercise.trim()) throw Error('Invalid exercise.');
        numeric(item, ['weight', 'reps', 'setNumber']); numeric(item, ['rpe'], true);
        // Older versions saved an omitted RPE as zero.
        if (item.rpe === 0) item.rpe = null;
        if (!Number.isInteger(item.reps) || item.reps < 1 || !Number.isInteger(item.setNumber) || item.setNumber < 1 || (item.rpe !== null && (item.rpe < 1 || item.rpe > 10))) throw Error('Invalid set.');
      } else if (key === 'meals') {
        if (!text(item.food) || !text(item.meal)) throw Error('Invalid meal.');
        numeric(item, ['calories', 'protein', 'carbs', 'fat']);
      } else {
        numeric(item, ['bodyweight', 'sleepHours', 'steps', 'energy'], true);
        if (item.bodyweight === 0) item.bodyweight = null;
        if (item.energy === 0) item.energy = null;
        if (item.sleepHours > 24 || item.energy > 10) throw Error('Invalid metrics.');
      }
    });
    data.exercises ??= [...new Set(data.workouts.map(w => w.exercise))];
    if (!data.exercises.every(text)) throw Error('Invalid exercise names.');
    data.mealPresets ??= [];
    data.mealPresets.forEach(p => { if (!p || !text(p.name)) throw Error('Invalid preset.'); numeric(p, ['calories', 'protein', 'carbs', 'fat']); });
    data.goals ??= { calories: null, protein: null };
    if (!data.goals || typeof data.goals !== 'object' || Array.isArray(data.goals)) throw Error('Invalid targets.');
    numeric(data.goals, ['calories', 'protein'], true);
    const daily = new Map();
    data.metrics.forEach(item => {
      const previous = daily.get(item.date) || { date: item.date };
      Object.entries(item).forEach(([key, value]) => { if (value !== null || previous[key] === undefined) previous[key] = value; });
      daily.set(item.date, previous);
    });
    data.metrics = [...daily.values()];
    return data;
  }
  const api = { localDate, number, validDate, inWindow, normalize };
  if (typeof module !== 'undefined') module.exports = api; else root.TrackerData = api;
})(globalThis);
