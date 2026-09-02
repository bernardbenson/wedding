/**
 * Nutrition math — pure functions, no DOM.
 * Units: weight in lb, height in inches. Calories in kcal, macros in grams.
 */
(function() {
    const F = window.Fitness = window.Fitness || {};

    const LB_TO_KG = 0.45359237;
    const IN_TO_CM = 2.54;
    const KCAL_PER_LB = 3500;
    const DEFICIT_PCT = 0.22;
    const PROTEIN_PER_LB_GOAL = 0.8;
    const FAT_PCT = 0.27;

    const ACTIVITY = {
        sedentary: { factor: 1.2, label: 'Sedentary (desk job, little walking)' },
        light: { factor: 1.375, label: 'Lightly active (walks, 3 gym days)' },
        moderate: { factor: 1.55, label: 'Moderately active (on feet most of the day)' },
        active: { factor: 1.725, label: 'Very active (physical job or daily training)' }
    };

    function minCalories(sex) {
        return sex === 'female' ? 1200 : 1500;
    }

    /** Mifflin-St Jeor basal metabolic rate. */
    function bmr(p) {
        const kg = Number(p.weightLbs) * LB_TO_KG;
        const cm = Number(p.heightIn) * IN_TO_CM;
        const age = Number(p.age);
        if (!kg || !cm || !age) return 0;
        const base = 10 * kg + 6.25 * cm - 5 * age;
        return Math.round(p.sex === 'female' ? base - 161 : base + 5);
    }

    function tdee(bmrValue, activity) {
        const a = ACTIVITY[activity] || ACTIVITY.light;
        return Math.round(bmrValue * a.factor);
    }

    /**
     * Daily targets for a profile at a given current weight.
     * profile: { sex, age, heightIn, goalWeight, activity }
     */
    function targets(profile, currentWeight) {
        if (!profile) return null;
        const weight = Number(currentWeight) || Number(profile.startWeight);
        const b = bmr({ sex: profile.sex, age: profile.age, heightIn: profile.heightIn, weightLbs: weight });
        if (!b) return null;
        const t = tdee(b, profile.activity);
        const floor = minCalories(profile.sex);
        let calories = Math.round(t * (1 - DEFICIT_PCT) / 10) * 10;
        if (calories < floor) calories = floor;
        const deficit = Math.max(0, t - calories);

        const goal = Number(profile.goalWeight) || weight;
        const protein = Math.round(PROTEIN_PER_LB_GOAL * goal);
        const fat = Math.round(calories * FAT_PCT / 9);
        const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));

        const lossPerWeek = Math.round((deficit * 7 / KCAL_PER_LB) * 10) / 10;
        const remaining = Math.max(0, weight - goal);
        const weeksToGoal = lossPerWeek > 0 ? remaining / lossPerWeek : null;
        const projectedGoalDate = weeksToGoal !== null ? addDays(new Date(), Math.round(weeksToGoal * 7)) : null;

        return {
            bmr: b,
            tdee: t,
            calories: calories,
            deficit: deficit,
            protein: protein,
            fat: fat,
            carbs: carbs,
            lossPerWeek: lossPerWeek,
            lossPerWeekPct: weight ? Math.round(lossPerWeek / weight * 1000) / 10 : 0,
            weeksToGoal: weeksToGoal,
            projectedGoalDate: projectedGoalDate,
            activityLabel: (ACTIVITY[profile.activity] || ACTIVITY.light).label
        };
    }

    function addDays(d, n) {
        const out = new Date(d.getTime());
        out.setDate(out.getDate() + n);
        return out;
    }

    /**
     * Weight trend analysis.
     * entries: [{ date: 'YYYY-MM-DD', lbs }] sorted ascending.
     * Returns { current, avg7, avg7Prev, weeklyRatePct, weeklyRateLbs, suggestion, daysCovered }
     */
    function trend(entries) {
        const list = (entries || []).filter(function(e) { return Number(e.lbs) > 0; });
        if (list.length === 0) return null;

        const latest = list[list.length - 1];
        const latestDate = parseDate(latest.date);

        function avgBetween(fromDaysAgo, toDaysAgo) {
            const vals = list.filter(function(e) {
                const diff = daysBetween(parseDate(e.date), latestDate);
                return diff >= toDaysAgo && diff < fromDaysAgo;
            }).map(function(e) { return Number(e.lbs); });
            if (!vals.length) return null;
            return vals.reduce(function(a, b) { return a + b; }, 0) / vals.length;
        }

        const avg7 = avgBetween(7, 0);
        const avg7Prev = avgBetween(21, 7); // the two weeks before the last 7 days
        const firstDate = parseDate(list[0].date);
        const daysCovered = daysBetween(firstDate, latestDate) + 1;

        let weeklyRateLbs = null;
        let weeklyRatePct = null;
        if (avg7 !== null && avg7Prev !== null) {
            // midpoints are ~10.5 days apart (3.5 vs 14) => 1.5 weeks
            weeklyRateLbs = (avg7 - avg7Prev) / 1.5;
            weeklyRatePct = weeklyRateLbs / avg7Prev * 100;
        }

        let suggestion = null;
        if (weeklyRatePct !== null && daysCovered >= 14 && list.length >= 6) {
            if (weeklyRatePct > -0.25) {
                suggestion = { kind: 'stall', text: 'Weight has been flat for two weeks. Trim about 150 kcal/day, or add a 20-minute walk on rest days.' };
            } else if (weeklyRatePct < -1.25) {
                suggestion = { kind: 'fast', text: 'Losing faster than 1.25% a week. Add about 100 kcal/day (protein or carbs) to protect muscle and energy.' };
            } else {
                suggestion = { kind: 'ok', text: 'Losing at a sustainable pace. Keep the current targets.' };
            }
        }

        return {
            current: Number(latest.lbs),
            currentDate: latest.date,
            avg7: avg7 !== null ? round1(avg7) : null,
            avg7Prev: avg7Prev !== null ? round1(avg7Prev) : null,
            weeklyRateLbs: weeklyRateLbs !== null ? round1(weeklyRateLbs) : null,
            weeklyRatePct: weeklyRatePct !== null ? Math.round(weeklyRatePct * 100) / 100 : null,
            suggestion: suggestion,
            daysCovered: daysCovered
        };
    }

    /** Rolling 7-day average series aligned to entries. */
    function movingAverage(entries, windowDays) {
        windowDays = windowDays || 7;
        const list = (entries || []).slice();
        return list.map(function(e, i) {
            const d = parseDate(e.date);
            const vals = [];
            for (let j = i; j >= 0; j--) {
                if (daysBetween(parseDate(list[j].date), d) >= windowDays) break;
                vals.push(Number(list[j].lbs));
            }
            return { date: e.date, lbs: round1(vals.reduce(function(a, b) { return a + b; }, 0) / vals.length) };
        });
    }

    /** Epley estimated one-rep max. */
    function est1RM(reps, lbs) {
        reps = Number(reps); lbs = Number(lbs);
        if (!reps || !lbs) return 0;
        if (reps === 1) return lbs;
        return Math.round(lbs * (1 + reps / 30));
    }

    // ---------- date helpers (shared) ----------

    function parseDate(s) {
        // 'YYYY-MM-DD' -> local midnight
        const parts = String(s).split('-').map(Number);
        return new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
    }

    function dayKey(d) {
        d = d || new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
    }

    function daysBetween(a, b) {
        const ms = startOfDay(b) - startOfDay(a);
        return Math.round(ms / 86400000);
    }

    function startOfDay(d) {
        return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    }

    function round1(n) {
        return Math.round(n * 10) / 10;
    }

    F.nutrition = {
        ACTIVITY: ACTIVITY,
        DEFICIT_PCT: DEFICIT_PCT,
        bmr: bmr,
        tdee: tdee,
        targets: targets,
        trend: trend,
        movingAverage: movingAverage,
        est1RM: est1RM
    };

    F.dates = {
        parse: parseDate,
        key: dayKey,
        daysBetween: daysBetween,
        addDays: addDays,
        round1: round1
    };
})();
