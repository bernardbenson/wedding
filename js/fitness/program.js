/**
 * Training program — 9 months, 3 full-gym sessions per week, full body.
 * Phase boundaries scale to the plan length set in the profile.
 */
(function() {
    const F = window.Fitness = window.Fitness || {};

    // inc = weight to add when you hit the top of the rep range on every set
    const EXERCISES = {
        goblet_squat:      { name: 'Goblet Squat', cat: 'lower', inc: 5, cue: 'Dumbbell at chest, elbows inside knees, sit between your heels.', swap: 'Leg press' },
        back_squat:        { name: 'Barbell Back Squat', cat: 'lower', inc: 10, cue: 'Brace, break at hips and knees together, drive the floor away.', swap: 'Hack squat or leg press' },
        leg_press:         { name: 'Leg Press', cat: 'lower', inc: 10, cue: 'Feet mid-platform, lower until thighs pass 90°, don’t lock knees.', swap: 'Goblet squat' },
        hack_squat:        { name: 'Hack Squat', cat: 'lower', inc: 10, cue: 'Full depth, knees track over toes.', swap: 'Leg press' },
        db_rdl:            { name: 'Dumbbell Romanian Deadlift', cat: 'lower', inc: 5, cue: 'Push hips back, soft knees, dumbbells brush the thighs.', swap: 'Leg curl' },
        bb_rdl:            { name: 'Barbell Romanian Deadlift', cat: 'lower', inc: 10, cue: 'Bar close to legs, hinge until hamstrings load, squeeze glutes up.', swap: 'Dumbbell RDL' },
        deadlift:          { name: 'Trap-Bar or Conventional Deadlift', cat: 'lower', inc: 10, cue: 'Chest up, bar tight, push the floor away, hips and shoulders rise together.', swap: 'Barbell RDL' },
        hip_thrust:        { name: 'Barbell Hip Thrust', cat: 'lower', inc: 10, cue: 'Chin tucked, ribs down, pause one second at the top.', swap: 'Glute bridge' },
        walking_lunge:     { name: 'Walking Lunge', cat: 'lower', inc: 5, cue: 'Long step, back knee kisses the floor, torso tall.', swap: 'Split squat' },
        split_squat:       { name: 'Bulgarian Split Squat', cat: 'lower', inc: 5, cue: 'Rear foot on bench, front shin vertical, control the descent.', swap: 'Walking lunge' },
        leg_curl:          { name: 'Seated or Lying Leg Curl', cat: 'lower', inc: 5, cue: 'Slow 3-second lowering.', swap: 'Dumbbell RDL' },
        db_bench:          { name: 'Dumbbell Bench Press', cat: 'upper', inc: 5, cue: 'Shoulder blades pinned, elbows 45°, press up and slightly in.', swap: 'Machine chest press' },
        bench_bb:          { name: 'Barbell Bench Press', cat: 'upper', inc: 5, cue: 'Feet planted, bar to lower chest, drive with the legs.', swap: 'Dumbbell bench' },
        incline_db_press:  { name: 'Incline Dumbbell Press', cat: 'upper', inc: 5, cue: 'Bench at 30°, dumbbells over the collarbones at the top.', swap: 'Incline machine press' },
        db_shoulder_press: { name: 'Seated Dumbbell Shoulder Press', cat: 'upper', inc: 5, cue: 'Ribs down, press to lockout without shrugging.', swap: 'Machine shoulder press' },
        ohp:               { name: 'Barbell Overhead Press', cat: 'upper', inc: 5, cue: 'Squeeze glutes, bar path straight up, head through at the top.', swap: 'Dumbbell shoulder press' },
        cable_row:         { name: 'Seated Cable Row', cat: 'upper', inc: 5, cue: 'Chest tall, pull elbows to hips, pause and squeeze.', swap: 'Chest-supported row' },
        bb_row:            { name: 'Barbell Row', cat: 'upper', inc: 10, cue: 'Hinge to 45°, pull to the belly button, no jerking.', swap: 'Chest-supported row' },
        lat_pulldown:      { name: 'Lat Pulldown', cat: 'upper', inc: 5, cue: 'Lean back slightly, drive elbows down, full stretch at the top.', swap: 'Assisted pull-up' },
        face_pull:         { name: 'Cable Face Pull', cat: 'upper', inc: 5, cue: 'Rope to the forehead, elbows high, pause with thumbs back.', swap: 'Rear-delt fly' },
        lateral_raise:     { name: 'Dumbbell Lateral Raise', cat: 'upper', inc: 5, cue: 'Lead with elbows, stop at shoulder height.', swap: 'Cable lateral raise' },
        farmer_carry:      { name: 'Farmer Carry', cat: 'core', inc: 10, cue: 'Heavy dumbbells, tall posture, short quick steps, 40 metres per set.', swap: 'Suitcase carry' },
        plank:             { name: 'Plank', cat: 'core', inc: 0, cue: 'Squeeze glutes, tuck ribs, breathe. Hold for time.', swap: 'Dead bug' },
        cable_crunch:      { name: 'Cable Crunch', cat: 'core', inc: 5, cue: 'Round the spine, exhale hard, hips still.', swap: 'Decline crunch' },
        hanging_knee_raise:{ name: 'Hanging Knee Raise', cat: 'core', inc: 0, cue: 'Curl pelvis up, no swinging. Use captain’s chair if needed.', swap: 'Reverse crunch' },
        ab_wheel:          { name: 'Ab Wheel Rollout', cat: 'core', inc: 0, cue: 'Tuck hips, roll only as far as you can stay flat.', swap: 'Plank' }
    };

    // ex: exercise id, sets, reps: display string, restSec, timed: reps are seconds
    const WORKOUTS = {
        p1a: { name: 'Full Body A', short: 'A', exercises: [
            { ex: 'goblet_squat', sets: 3, reps: '10–12', rest: 90 },
            { ex: 'db_bench', sets: 3, reps: '10–12', rest: 90 },
            { ex: 'cable_row', sets: 3, reps: '10–12', rest: 90 },
            { ex: 'db_rdl', sets: 3, reps: '10–12', rest: 90 },
            { ex: 'plank', sets: 3, reps: '30–45 s', rest: 60, timed: true }
        ]},
        p1b: { name: 'Full Body B', short: 'B', exercises: [
            { ex: 'leg_press', sets: 3, reps: '10–12', rest: 90 },
            { ex: 'lat_pulldown', sets: 3, reps: '10–12', rest: 90 },
            { ex: 'db_shoulder_press', sets: 3, reps: '10–12', rest: 90 },
            { ex: 'walking_lunge', sets: 3, reps: '10 / leg', rest: 90 },
            { ex: 'cable_crunch', sets: 3, reps: '12–15', rest: 60 }
        ]},
        p2a: { name: 'Squat Day', short: 'A', exercises: [
            { ex: 'back_squat', sets: 4, reps: '8–10', rest: 120 },
            { ex: 'db_bench', sets: 3, reps: '8–10', rest: 90 },
            { ex: 'cable_row', sets: 3, reps: '8–10', rest: 90 },
            { ex: 'leg_curl', sets: 3, reps: '10–12', rest: 60 },
            { ex: 'plank', sets: 3, reps: '45 s', rest: 60, timed: true }
        ]},
        p2b: { name: 'Hinge Day', short: 'B', exercises: [
            { ex: 'bb_rdl', sets: 4, reps: '8–10', rest: 120 },
            { ex: 'lat_pulldown', sets: 3, reps: '8–10', rest: 90 },
            { ex: 'ohp', sets: 3, reps: '8–10', rest: 90 },
            { ex: 'split_squat', sets: 3, reps: '10 / leg', rest: 90 },
            { ex: 'hanging_knee_raise', sets: 3, reps: '10–12', rest: 60 }
        ]},
        p2c: { name: 'Push / Pull Day', short: 'C', exercises: [
            { ex: 'bench_bb', sets: 4, reps: '8–10', rest: 120 },
            { ex: 'bb_row', sets: 4, reps: '8–10', rest: 120 },
            { ex: 'hip_thrust', sets: 3, reps: '10–12', rest: 90 },
            { ex: 'face_pull', sets: 3, reps: '12–15', rest: 60 },
            { ex: 'farmer_carry', sets: 3, reps: '40 m', rest: 90 }
        ]},
        p3a: { name: 'Heavy Squat + Bench', short: 'A', exercises: [
            { ex: 'back_squat', sets: 4, reps: '6–8', rest: 150 },
            { ex: 'bench_bb', sets: 4, reps: '6–8', rest: 150 },
            { ex: 'cable_row', sets: 3, reps: '10–12', rest: 60, superset: 'face_pull' },
            { ex: 'face_pull', sets: 3, reps: '12–15', rest: 60 },
            { ex: 'leg_curl', sets: 3, reps: '10–12', rest: 60 },
            { ex: 'ab_wheel', sets: 3, reps: '8–12', rest: 60 }
        ]},
        p3b: { name: 'Heavy Deadlift + Press', short: 'B', exercises: [
            { ex: 'deadlift', sets: 4, reps: '5–6', rest: 180 },
            { ex: 'ohp', sets: 4, reps: '6–8', rest: 120 },
            { ex: 'lat_pulldown', sets: 3, reps: '10–12', rest: 60, superset: 'lateral_raise' },
            { ex: 'lateral_raise', sets: 3, reps: '12–15', rest: 60 },
            { ex: 'split_squat', sets: 3, reps: '10 / leg', rest: 90 },
            { ex: 'hanging_knee_raise', sets: 3, reps: '12–15', rest: 60 }
        ]},
        p3c: { name: 'Hips + Upper Volume', short: 'C', exercises: [
            { ex: 'hip_thrust', sets: 4, reps: '8–10', rest: 120 },
            { ex: 'incline_db_press', sets: 4, reps: '8–10', rest: 90 },
            { ex: 'bb_row', sets: 4, reps: '6–8', rest: 120 },
            { ex: 'leg_press', sets: 3, reps: '10–12', rest: 90 },
            { ex: 'farmer_carry', sets: 3, reps: '40 m', rest: 90 }
        ]},
        p4a: { name: 'Maintain A', short: 'A', exercises: [
            { ex: 'back_squat', sets: 3, reps: '8–12', rest: 120 },
            { ex: 'bench_bb', sets: 3, reps: '8–12', rest: 120 },
            { ex: 'cable_row', sets: 3, reps: '10–12', rest: 60 },
            { ex: 'leg_curl', sets: 3, reps: '10–12', rest: 60 },
            { ex: 'plank', sets: 3, reps: '45–60 s', rest: 60, timed: true }
        ]},
        p4b: { name: 'Maintain B', short: 'B', exercises: [
            { ex: 'bb_rdl', sets: 3, reps: '8–12', rest: 120 },
            { ex: 'ohp', sets: 3, reps: '8–12', rest: 90 },
            { ex: 'lat_pulldown', sets: 3, reps: '10–12', rest: 60 },
            { ex: 'split_squat', sets: 3, reps: '10 / leg', rest: 90 },
            { ex: 'hanging_knee_raise', sets: 3, reps: '12–15', rest: 60 }
        ]},
        p4c: { name: 'Maintain C', short: 'C', exercises: [
            { ex: 'hip_thrust', sets: 3, reps: '10–12', rest: 90 },
            { ex: 'incline_db_press', sets: 3, reps: '8–12', rest: 90 },
            { ex: 'bb_row', sets: 3, reps: '8–12', rest: 90 },
            { ex: 'face_pull', sets: 3, reps: '12–15', rest: 60 },
            { ex: 'farmer_carry', sets: 3, reps: '40 m', rest: 90 }
        ]}
    };

    // endFrac: phase ends at this fraction of the total plan length
    const PHASES = [
        {
            id: 1, name: 'Foundation', endFrac: 0.20,
            focus: 'Learn the movements, build the habit, get out of breath a little.',
            scheme: '3 sets × 10–12 · RPE 6–7 (2–3 reps left in the tank)',
            workouts: ['p1a', 'p1b'],
            finisher: '10 min incline treadmill walk (3.0 mph, 8–10% grade) or easy bike.',
            steps: 8000,
            tips: ['Same weight every set. When all sets hit 12 clean reps, add the listed increment next time.', 'Two off-day walks of 20–30 minutes. Sleep 7+ hours.']
        },
        {
            id: 2, name: 'Build', endFrac: 0.50,
            focus: 'Barbell compounds come in. Push the weights up week over week.',
            scheme: '3–4 sets × 8–10 · RPE 7–8',
            workouts: ['p2a', 'p2b', 'p2c'],
            finisher: '12–15 min zone-2 bike or rower, or 6 rounds of 1 min hard / 1 min easy.',
            steps: 9000,
            tips: ['First two weeks on a new barbell lift: start light and add weight each session until it feels like an 8.', 'Log every set. Beat last session by a rep or the increment.']
        },
        {
            id: 3, name: 'Intensify', endFrac: 0.82,
            focus: 'Heavier compounds, supersets on accessories, short brutal finishers.',
            scheme: 'Compounds 4 × 6–8 · accessories 3 × 10–12 (supersets)',
            workouts: ['p3a', 'p3b', 'p3c'],
            finisher: '10–12 min metcon: 5 rounds of 250 m row + 15 kettlebell swings, rest as needed.',
            steps: 10000,
            tips: ['Rest a full 2–3 minutes on the heavy lifts. Speed matters on the finisher, not the lifts.', 'If a lift stalls two sessions in a row, drop 10% and build back up.']
        },
        {
            id: 4, name: 'Peak & Maintain', endFrac: 1.0,
            focus: 'Hold the strength you built, keep the routine, arrive rested.',
            scheme: '3 sets × 8–12 · RPE 7. Final week: half the sets.',
            workouts: ['p4a', 'p4b', 'p4c'],
            finisher: '10 min steady cardio of your choice.',
            steps: 10000,
            tips: ['Final week is a deload: half the sets, same weights, and no finishers.', 'Calories can rise toward maintenance over the last 2–3 weeks.']
        }
    ];

    const D = F.dates;

    function planLengthWeeks(profile) {
        if (!profile || !profile.startDate || !profile.endDate) return 39;
        const days = D.daysBetween(D.parse(profile.startDate), D.parse(profile.endDate));
        return Math.max(4, Math.ceil(days / 7));
    }

    function phaseBounds(profile) {
        const total = planLengthWeeks(profile);
        let start = 1;
        return PHASES.map(function(p) {
            const end = p.id === PHASES.length ? total : Math.max(start, Math.round(total * p.endFrac));
            const out = Object.assign({}, p, { startWeek: start, endWeek: end, weeks: end - start + 1 });
            start = end + 1;
            return out;
        });
    }

    /** 1-based week number of `date` in the plan, clamped. Returns 0 before the start. */
    function weekNumber(profile, date) {
        if (!profile || !profile.startDate) return 1;
        const diff = D.daysBetween(D.parse(profile.startDate), date || new Date());
        if (diff < 0) return 0;
        return Math.min(planLengthWeeks(profile), Math.floor(diff / 7) + 1);
    }

    function phaseForWeek(profile, week) {
        const bounds = phaseBounds(profile);
        if (week < 1) return bounds[0];
        for (const p of bounds) if (week <= p.endWeek) return p;
        return bounds[bounds.length - 1];
    }

    function isDeloadWeek(profile, week) {
        return week === planLengthWeeks(profile);
    }

    function workoutDays(profile) {
        const days = profile && Array.isArray(profile.workoutDays) && profile.workoutDays.length ? profile.workoutDays : [1, 3, 5];
        return days.map(Number).sort();
    }

    /** Date of the Monday-based week start for a plan week. */
    function weekStartDate(profile, week) {
        return D.addDays(D.parse(profile.startDate), (week - 1) * 7);
    }

    /**
     * The scheduled workout for a date, or null on a rest day / outside the plan.
     * Returns { id, workout, phase, week, sessionIndex, deload, setsMultiplier }.
     */
    function workoutForDate(profile, date) {
        if (!profile || !profile.startDate) return null;
        date = date || new Date();
        const week = weekNumber(profile, date);
        if (week < 1) return null;
        const end = D.parse(profile.endDate || profile.startDate);
        if (D.daysBetween(end, date) > 0) return null;

        const days = workoutDays(profile);
        if (!days.includes(date.getDay())) return null;

        const phase = phaseForWeek(profile, week);
        const phaseStart = weekStartDate(profile, phase.startWeek);

        // Count scheduled sessions from the phase start up to (not including) this date
        let index = 0;
        const cursor = new Date(phaseStart.getTime());
        while (D.daysBetween(cursor, date) > 0) {
            if (days.includes(cursor.getDay())) index++;
            cursor.setDate(cursor.getDate() + 1);
        }

        const id = phase.workouts[index % phase.workouts.length];
        const deload = isDeloadWeek(profile, week);
        return {
            id: id,
            workout: WORKOUTS[id],
            phase: phase,
            week: week,
            sessionIndex: index,
            deload: deload,
            setsMultiplier: deload ? 0.5 : 1
        };
    }

    /** All scheduled sessions in a plan week: [{ date, key, ...workoutForDate }] */
    function sessionsForWeek(profile, week) {
        if (!profile || !profile.startDate) return [];
        const start = weekStartDate(profile, week);
        const out = [];
        for (let i = 0; i < 7; i++) {
            const d = D.addDays(start, i);
            const w = workoutForDate(profile, d);
            if (w) out.push(Object.assign({ date: d, key: D.key(d) }, w));
        }
        return out;
    }

    /** Seven day objects for the calendar week containing `date` (starting Monday). */
    function calendarWeek(profile, date) {
        date = date || new Date();
        const dow = (date.getDay() + 6) % 7; // Monday = 0
        const monday = D.addDays(date, -dow);
        const out = [];
        for (let i = 0; i < 7; i++) {
            const d = D.addDays(monday, i);
            out.push({ date: d, key: D.key(d), scheduled: workoutForDate(profile, d) });
        }
        return out;
    }

    function effectiveSets(exercise, multiplier) {
        return Math.max(1, Math.ceil(exercise.sets * (multiplier || 1)));
    }

    /** Parse a rep-range string like '8–10' into { low, high } (null if timed/distance). */
    function repRange(reps) {
        const m = String(reps).match(/^(\d+)\s*[–-]\s*(\d+)$/);
        if (m) return { low: Number(m[1]), high: Number(m[2]) };
        const single = String(reps).match(/^(\d+)/);
        if (single && !/[a-z]/i.test(reps)) return { low: Number(single[1]), high: Number(single[1]) };
        return null;
    }

    F.program = {
        EXERCISES: EXERCISES,
        WORKOUTS: WORKOUTS,
        PHASES: PHASES,
        planLengthWeeks: planLengthWeeks,
        phaseBounds: phaseBounds,
        weekNumber: weekNumber,
        phaseForWeek: phaseForWeek,
        isDeloadWeek: isDeloadWeek,
        workoutDays: workoutDays,
        weekStartDate: weekStartDate,
        workoutForDate: workoutForDate,
        sessionsForWeek: sessionsForWeek,
        calendarWeek: calendarWeek,
        effectiveSets: effectiveSets,
        repRange: repRange
    };
})();
