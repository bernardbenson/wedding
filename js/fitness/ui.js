/**
 * Fitness UI — renders the Dashboard, Workouts, Meals, Progress and Profile panels
 * from the store, and wires their interactions.
 */
(function() {
    const F = window.Fitness = window.Fitness || {};
    const S = F.store, P = F.program, N = F.nutrition, M = F.meals, D = F.dates;

    const CHART_ACCENT = '#A68B4B';
    const CHART_CONTEXT = '#C4C2B8';
    const CHART_GRID = '#F0EDE7';
    const CHART_TEXT = '#8B8B7B';

    const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const ui = {
        panel: null,
        workoutDate: null,       // 'YYYY-MM-DD' selected in Workouts
        weekOffset: 0,           // weeks from the current calendar week in Workouts
        adhocWorkout: 'p1a',
        mealsDate: null,
        mealSearch: '',
        swaps: {},               // dateKey -> slot -> offset
        progressRange: 90
    };

    const charts = {};
    let unsubs = [];
    let started = false;
    let eventsBound = false;
    let toastTimer = null;

    // ==============================================
    // Lifecycle
    // ==============================================

    function start() {
        if (started) return;
        started = true;
        ui.workoutDate = D.key();
        ui.mealsDate = D.key();
        unsubs.push(S.on('change', function() { renderCurrent(); }));
        unsubs.push(S.on('status', renderSyncPill));
        bindEvents();
        renderSyncPill(S.getStatus());
    }

    function stop() {
        started = false;
        unsubs.forEach(function(fn) { fn(); });
        unsubs = [];
        destroyCharts();
        ['dashboard', 'workouts', 'meals', 'progress', 'profile'].forEach(function(name) {
            const el = panelEl(name);
            if (el) el.innerHTML = '';
        });
    }

    function onPanelShown(name) {
        ui.panel = name;
        render(name);
    }

    function renderCurrent() {
        if (started && ui.panel) render(ui.panel);
    }

    function render(name) {
        switch (name) {
            case 'dashboard': return renderDashboard();
            case 'workouts': return renderWorkouts();
            case 'meals': return renderMeals();
            case 'progress': return renderProgress();
            case 'profile': return renderProfile();
        }
    }

    function panelEl(name) {
        return document.getElementById('panel-' + name);
    }

    // ==============================================
    // Data helpers
    // ==============================================

    function profile() {
        const rec = S.get('profile');
        return rec ? rec.data : null;
    }

    function weights() {
        return S.all('weight').map(function(r) { return { id: r.id, date: r.date, lbs: Number(r.data && r.data.lbs) }; })
            .filter(function(w) { return w.lbs > 0; });
    }

    function currentWeight(p) {
        const w = weights();
        if (w.length) return w[w.length - 1].lbs;
        return p ? Number(p.startWeight) : 0;
    }

    function targetsFor(p) {
        if (!p) return null;
        return N.targets(p, currentWeight(p));
    }

    function workoutLog(dateKey) {
        return S.get('wo-' + dateKey);
    }

    function mealsOn(dateKey) {
        return S.byDate('meal', dateKey);
    }

    function dayTotals(dateKey) {
        return mealsOn(dateKey).reduce(function(t, r) {
            const d = r.data || {};
            t.kcal += Number(d.kcal) || 0; t.p += Number(d.protein) || 0; t.c += Number(d.carbs) || 0; t.f += Number(d.fat) || 0;
            return t;
        }, { kcal: 0, p: 0, c: 0, f: 0 });
    }

    function completedLogs() {
        return S.all('workout').filter(function(r) { return r.data && r.data.completed; });
    }

    /** Planned vs done per plan week up to the current one. */
    function adherenceByWeek(p) {
        const total = P.planLengthWeeks(p);
        const current = Math.max(1, Math.min(total, P.weekNumber(p, new Date())));
        const logs = completedLogs();
        const out = [];
        for (let w = 1; w <= current; w++) {
            const start = P.weekStartDate(p, w);
            const startKey = D.key(start), endKey = D.key(D.addDays(start, 6));
            const planned = P.sessionsForWeek(p, w).length;
            const done = logs.filter(function(r) { return r.date >= startKey && r.date <= endKey; }).length;
            out.push({ week: w, planned: planned, done: done, startKey: startKey });
        }
        return out;
    }

    function streak(adherence) {
        const todayKey = D.key();
        let count = 0;
        for (let i = adherence.length - 1; i >= 0; i--) {
            const a = adherence[i];
            const weekEnded = D.key(D.addDays(D.parse(a.startKey), 6)) < todayKey;
            if (i === adherence.length - 1 && !weekEnded) {
                if (a.planned && a.done >= a.planned) { count++; }
                continue;
            }
            if (a.planned && a.done >= a.planned) count++;
            else break;
        }
        return count;
    }

    /** Most recent logged performance of an exercise strictly before dateKey. */
    function lastPerformance(exId, dateKey) {
        const logs = S.all('workout').filter(function(r) { return r.date < dateKey && r.data && Array.isArray(r.data.exercises); });
        for (let i = logs.length - 1; i >= 0; i--) {
            const ex = logs[i].data.exercises.find(function(e) { return e.ex === exId && e.sets && e.sets.some(function(s) { return s.lbs || s.reps; }); });
            if (ex) return { date: logs[i].date, sets: ex.sets };
        }
        return null;
    }

    function progressionHint(exercise, last) {
        if (!last) return null;
        const meta = P.EXERCISES[exercise.ex];
        const range = P.repRange(exercise.reps);
        const done = last.sets.filter(function(s) { return Number(s.reps) > 0; });
        const summary = 'Last (' + fmtShort(last.date) + '): ' + setsSummary(last.sets);
        if (!range || !done.length || !meta.inc) return { text: summary, bump: null };
        const allTop = done.every(function(s) { return Number(s.reps) >= range.high; });
        const lbs = Math.max.apply(null, done.map(function(s) { return Number(s.lbs) || 0; }));
        if (allTop && lbs > 0) {
            return { text: summary + ' — every set hit ' + range.high + '. Go ' + (lbs + meta.inc) + ' lb today.', bump: lbs + meta.inc };
        }
        return { text: summary, bump: null };
    }

    function setsSummary(sets) {
        const done = (sets || []).filter(function(s) { return s.reps || s.lbs; });
        if (!done.length) return '—';
        const groups = {};
        done.forEach(function(s) {
            const key = (s.reps || '?') + '@' + (s.lbs || 0);
            groups[key] = (groups[key] || 0) + 1;
        });
        return Object.keys(groups).map(function(k) {
            const parts = k.split('@');
            return groups[k] + '×' + parts[0] + (Number(parts[1]) ? ' @ ' + parts[1] + ' lb' : '');
        }).join(', ');
    }

    // ==============================================
    // Formatting helpers
    // ==============================================

    function esc(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    function fmtShort(dateKey) {
        return D.parse(dateKey).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function fmtLong(dateKey) {
        return D.parse(dateKey).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    }

    function fmtMed(dateKey) {
        return D.parse(dateKey).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }

    function fmtDateObj(d) {
        return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
    }

    function n1(v) {
        return v === null || v === undefined || isNaN(v) ? '—' : (Math.round(v * 10) / 10).toString();
    }

    function signed(v, unit) {
        if (v === null || v === undefined || isNaN(v)) return '—';
        const r = Math.round(v * 10) / 10;
        return (r > 0 ? '+' : '') + r + (unit || '');
    }

    function pct(part, whole) {
        if (!whole) return 0;
        return Math.max(0, Math.min(100, Math.round(part / whole * 100)));
    }

    function toast(message, isError) {
        const el = document.getElementById('toast');
        if (!el) return;
        el.textContent = message;
        el.classList.toggle('toast--error', Boolean(isError));
        el.classList.remove('hidden');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function() { el.classList.add('hidden'); }, 2800);
    }

    function statTile(value, label, delta, deltaClass) {
        return '<div class="stat-card stat-card--compact">' +
            '<span class="stat-card__number">' + value + '</span>' +
            '<span class="stat-card__label">' + esc(label) + '</span>' +
            (delta ? '<span class="stat-card__delta ' + (deltaClass || '') + '">' + delta + '</span>' : '') +
            '</div>';
    }

    function setupCard() {
        return '<div class="fx-cta">' +
            '<div><strong>Set up your profile to start the plan.</strong>' +
            '<div class="fx-small fx-muted">Your stats set the calorie targets, the schedule and the phase dates. Nothing is stored in the website code.</div></div>' +
            '<a href="#profile" class="btn btn--primary btn--sm">Open Profile</a></div>';
    }

    function tokenCard() {
        const st = S.getStatus();
        if (st.hasToken && st.status !== 'auth') return '';
        return '<div class="fx-cta">' +
            '<div><strong>Connect your data repo.</strong>' +
            '<div class="fx-small fx-muted">' + esc(st.message || 'Add a GitHub token so your logs sync across devices.') + ' Until then, everything is saved in this browser only.</div></div>' +
            '<a href="#profile" class="btn btn--gold-outline btn--sm">Profile &amp; Sync</a></div>';
    }

    // ==============================================
    // Sync pill
    // ==============================================

    function renderSyncPill(st) {
        st = st || S.getStatus();
        const labels = {
            idle: '', syncing: 'Syncing', synced: 'Synced', offline: 'Offline', error: 'Sync error', auth: 'Not connected'
        };
        let text = labels[st.status] || '';
        if (st.pending && st.status !== 'syncing') text += (text ? ' · ' : '') + st.pending + ' queued';
        ['syncPill', 'syncPillMobile'].forEach(function(id) {
            const el = document.getElementById(id);
            if (!el) return;
            el.className = 'sync-pill sync-pill--' + st.status;
            el.textContent = text || 'Local only';
            el.title = st.message || text;
        });
        if (ui.panel === 'profile') {
            const box = document.getElementById('syncStatusBox');
            if (box) box.innerHTML = syncStatusHtml(st);
        }
    }

    // ==============================================
    // Dashboard
    // ==============================================

    function renderDashboard() {
        const el = panelEl('dashboard');
        const p = profile();
        if (!p) {
            el.innerHTML = '<div class="panel-header"><div><h1 class="panel-title">Dashboard</h1><p class="panel-subtitle">Nine months. Three sessions a week. One number going down.</p></div></div>' +
                setupCard() + tokenCard() + planOverviewHtml(null);
            destroyCharts();
            return;
        }

        const today = new Date();
        const todayKey = D.key(today);
        const total = P.planLengthWeeks(p);
        const week = P.weekNumber(p, today);
        const phase = P.phaseForWeek(p, Math.max(1, week));
        const daysLeft = D.daysBetween(today, D.parse(p.endDate));
        const t = targetsFor(p);
        const w = weights();
        const trend = N.trend(w);
        const cw = currentWeight(p);
        const change = w.length ? cw - Number(p.startWeight) : 0;
        const toGoal = cw - Number(p.goalWeight);
        const adherence = adherenceByWeek(p);
        const thisWeek = adherence[adherence.length - 1] || { planned: 0, done: 0 };
        const stk = streak(adherence);
        const totals = dayTotals(todayKey);

        let headline;
        if (week < 1) headline = 'Plan starts ' + fmtLong(p.startDate);
        else if (daysLeft < 0) headline = 'Plan complete — ' + Math.abs(daysLeft) + ' days past your end date';
        else headline = 'Phase ' + phase.id + ' · ' + esc(phase.name) + ' · Week ' + week + ' of ' + total + ' · ' + daysLeft + ' days left';

        let html = '<div class="panel-header"><div><h1 class="panel-title">' + (p.name ? 'Hi, ' + esc(p.name.split(' ')[0]) : 'Dashboard') + '</h1>' +
            '<p class="panel-subtitle">' + headline + '</p></div>' +
            '<div class="panel-actions">' + weighInFormHtml(todayKey) + '</div></div>';

        html += tokenCard();

        html += '<div class="stats-grid stats-grid--compact">' +
            statTile(n1(cw) + '<small style="font-size:1rem"> lb</small>', 'Current weight', trend && trend.avg7 ? '7-day avg ' + n1(trend.avg7) : (w.length ? 'logged ' + fmtShort(w[w.length - 1].date) : 'from profile')) +
            statTile(signed(change, ''), 'Since start', 'from ' + n1(p.startWeight) + ' lb', change < 0 ? 'stat-card__delta--good' : '') +
            statTile(n1(Math.max(0, toGoal)), 'To goal', 'goal ' + n1(p.goalWeight) + ' lb' + (t && t.projectedGoalDate && toGoal > 0 ? ' · est. ' + fmtDateObj(t.projectedGoalDate) : '')) +
            statTile(thisWeek.done + '<small style="font-size:1rem">/' + thisWeek.planned + '</small>', 'Workouts this week', stk ? stk + '-week streak' : 'no streak yet', stk ? 'stat-card__delta--good' : '') +
            statTile(totals.kcal.toLocaleString(), 'Calories today', t ? 'target ' + t.calories.toLocaleString() : '', t && totals.kcal > t.calories * 1.1 ? 'stat-card__delta--bad' : '') +
            statTile(totals.p + '<small style="font-size:1rem"> g</small>', 'Protein today', t ? 'target ' + t.protein + ' g' : '', t && totals.p >= t.protein ? 'stat-card__delta--good' : '') +
            '</div>';

        if (trend && trend.suggestion) {
            html += '<div class="fx-note"><strong>Trend: </strong>' + esc(trend.suggestion.text) +
                (trend.weeklyRateLbs !== null ? ' <span class="fx-muted">(' + signed(trend.weeklyRateLbs, ' lb') + '/week, ' + signed(trend.weeklyRatePct, '%') + ')</span>' : '') + '</div>';
        }

        html += '<div class="fx-grid-2" style="margin-top: var(--spacing-md)">';
        html += todayCardHtml(p, today);
        html += '<div class="fx-card"><div class="fx-card__title">This week <small>' + esc(phase.scheme) + '</small></div>' + weekStripHtml(p, today) +
            '<p class="fx-small fx-muted" style="margin-top: var(--spacing-sm)">Off days: ' + phase.steps.toLocaleString() + ' steps. Finisher after each session: ' + esc(phase.finisher) + '</p></div>';
        html += '</div>';

        html += '<div class="fx-grid-2" style="margin-top: var(--spacing-md)">';
        html += '<div class="fx-card"><div class="fx-card__title">Weight trend <small>last 90 days</small></div>' +
            (w.length ? '<div class="chart-box"><canvas id="dashWeightChart"></canvas></div>' : '<div class="fx-empty"><p>No weigh-ins yet.</p><p>Log your first weight above. Mornings, after the bathroom, before food.</p></div>') + '</div>';
        html += '<div class="fx-card"><div class="fx-card__title">Sessions per week <small>completed vs planned</small></div>' +
            (adherence.length ? '<div class="chart-box"><canvas id="dashAdherenceChart"></canvas></div>' : '<div class="fx-empty"><p>The plan hasn’t started yet.</p></div>') + '</div>';
        html += '</div>';

        el.innerHTML = html;

        destroyCharts();
        if (w.length) weightChart('dashWeightChart', w, p, 90);
        if (adherence.length) adherenceChart('dashAdherenceChart', adherence.slice(-16));
    }

    function weighInFormHtml(todayKey) {
        const existing = S.get('weight-' + todayKey);
        return '<form id="weightForm" class="form-inline" autocomplete="off">' +
            '<input type="hidden" name="date" value="' + todayKey + '">' +
            '<div class="form__group"><label class="form__label--small" for="weightInput">Today’s weight (lb)</label>' +
            '<input id="weightInput" class="form__input form__input--sm" type="number" step="0.1" min="50" max="700" name="lbs" placeholder="e.g. 212.4" value="' + (existing ? esc(existing.data.lbs) : '') + '" required style="width:130px"></div>' +
            '<button type="submit" class="btn btn--primary btn--sm">' + (existing ? 'Update' : 'Log') + '</button></form>';
    }

    function todayCardHtml(p, today) {
        const todayKey = D.key(today);
        const sched = P.workoutForDate(p, today);
        const log = workoutLog(todayKey);
        let html = '<div class="fx-card">';

        if (log && log.data.completed) {
            html += '<div class="fx-card__title">Today <span class="badge badge--good">Completed</span></div>' +
                '<p><strong>' + esc(log.data.workoutName || log.data.workoutId) + '</strong></p>' +
                '<p class="fx-small fx-muted" style="margin-top:4px">' + esc(log.summary) + (log.data.durationMin ? ' · ' + log.data.durationMin + ' min' : '') + '</p>' +
                '<div style="margin-top: var(--spacing-sm)"><a href="#workouts" class="btn btn--ghost btn--sm" data-action="open-workout" data-date="' + todayKey + '">View log</a></div>';
        } else if (sched) {
            const wk = sched.workout;
            html += '<div class="fx-card__title">Today · ' + esc(wk.name) + (sched.deload ? ' <span class="badge">Deload</span>' : '') + '</div>' +
                '<div class="workout-meta"><span>Phase ' + sched.phase.id + '</span><span>' + esc(sched.phase.scheme) + '</span></div>' +
                '<ul style="list-style:none; line-height:1.9">' + wk.exercises.map(function(e) {
                    return '<li><strong>' + esc(P.EXERCISES[e.ex].name) + '</strong> <span class="fx-muted">' + P.effectiveSets(e, sched.setsMultiplier) + ' × ' + esc(e.reps) + '</span></li>';
                }).join('') + '</ul>' +
                '<div style="margin-top: var(--spacing-sm)"><a href="#workouts" class="btn btn--primary btn--sm" data-action="open-workout" data-date="' + todayKey + '">' + (log ? 'Continue logging' : 'Log this workout') + '</a></div>';
        } else {
            const next = nextSession(p, today);
            const phase = P.phaseForWeek(p, Math.max(1, P.weekNumber(p, today)));
            html += '<div class="fx-card__title">Today · Rest day</div>' +
                '<p>Walk ' + phase.steps.toLocaleString() + ' steps, stretch, sleep well.</p>' +
                (next ? '<p class="fx-small fx-muted" style="margin-top:6px">Next session: ' + fmtMed(next.key) + ' — ' + esc(next.workout.name) + '</p>' : '') +
                '<div style="margin-top: var(--spacing-sm)"><a href="#workouts" class="btn btn--ghost btn--sm" data-action="open-workout" data-date="' + todayKey + '">Log an extra session</a></div>';
        }
        return html + '</div>';
    }

    function nextSession(p, from) {
        for (let i = 1; i <= 14; i++) {
            const d = D.addDays(from, i);
            const s = P.workoutForDate(p, d);
            if (s) return Object.assign({ key: D.key(d) }, s);
        }
        return null;
    }

    function weekStripHtml(p, anchor) {
        const todayKey = D.key();
        return '<div class="week-strip">' + P.calendarWeek(p, anchor).map(function(day) {
            const log = workoutLog(day.key);
            const done = log && log.data.completed;
            const cls = ['day-chip'];
            if (day.key === todayKey) cls.push('day-chip--today');
            if (done) cls.push('day-chip--done');
            if (!day.scheduled && !done) cls.push('day-chip--rest');
            const label = done ? (log.data.workoutShort || 'Done') : (day.scheduled ? day.scheduled.workout.short : 'Rest');
            return '<div class="' + cls.join(' ') + '" title="' + fmtMed(day.key) + '"><span class="day-chip__dow">' + DOW[day.date.getDay()] + '</span>' +
                '<span class="day-chip__label">' + esc(label) + '</span></div>';
        }).join('') + '</div>';
    }

    // ==============================================
    // Workouts
    // ==============================================

    function renderWorkouts() {
        const el = panelEl('workouts');
        const p = profile();
        if (!p) {
            el.innerHTML = '<div class="panel-header"><div><h1 class="panel-title">Workouts</h1></div></div>' + setupCard() + planOverviewHtml(null);
            return;
        }

        const today = new Date();
        const week = P.weekNumber(p, today);
        const total = P.planLengthWeeks(p);
        const phase = P.phaseForWeek(p, Math.max(1, week));

        let html = '<div class="panel-header"><div><h1 class="panel-title">Workouts</h1>' +
            '<p class="panel-subtitle">Phase ' + phase.id + ' · ' + esc(phase.name) + ' · Week ' + Math.max(0, week) + ' of ' + total + '</p></div>' +
            '<div class="panel-actions"><label class="form__label--small" for="workoutDatePicker" style="margin:0">Jump to date</label>' +
            '<input type="date" id="workoutDatePicker" class="form__input form__input--sm" value="' + ui.workoutDate + '" style="width:auto"></div></div>';

        html += phaseTrackHtml(p, week);

        // Week tiles
        const anchor = D.addDays(today, ui.weekOffset * 7);
        const days = P.calendarWeek(p, anchor);
        const todayKey = D.key(today);
        html += '<div class="fx-card"><div class="fx-card__title">' +
            '<span>Week of ' + fmtShort(days[0].key) + '</span>' +
            '<span class="panel-actions"><button class="btn btn--ghost btn--xs" data-action="week-prev">‹ Prev</button>' +
            '<button class="btn btn--ghost btn--xs" data-action="week-today">This week</button>' +
            '<button class="btn btn--ghost btn--xs" data-action="week-next">Next ›</button></span></div>' +
            '<div class="workout-list">' + days.filter(function(d) { return d.scheduled || workoutLog(d.key); }).map(function(d) {
                const log = workoutLog(d.key);
                const name = log ? (log.data.workoutName || log.data.workoutId) : d.scheduled.workout.name;
                let status, cls = '';
                if (log && log.data.completed) { status = 'Completed · ' + esc(log.summary); cls = 'workout-tile__status--done'; }
                else if (log) status = 'In progress';
                else if (d.key < todayKey) status = 'Missed — you can still log it';
                else if (d.key === todayKey) status = 'Today';
                else status = 'Scheduled';
                return '<div class="workout-tile' + (d.key === ui.workoutDate ? ' workout-tile--selected' : '') + '" data-action="select-date" data-date="' + d.key + '" role="button" tabindex="0">' +
                    '<div class="workout-tile__date">' + fmtMed(d.key) + (d.scheduled && d.scheduled.deload ? ' · Deload' : '') + '</div>' +
                    '<div class="workout-tile__name">' + esc(name) + '</div>' +
                    '<div class="workout-tile__status ' + cls + '">' + status + '</div></div>';
            }).join('') + '</div></div>';

        html += workoutDetailHtml(p, ui.workoutDate);
        html += historyHtml();
        html += planOverviewHtml(p);

        el.innerHTML = html;
    }

    function phaseTrackHtml(p, week) {
        const bounds = P.phaseBounds(p);
        const total = P.planLengthWeeks(p);
        return '<div class="fx-card"><div class="fx-card__title">Plan timeline <small>' + total + ' weeks · ' + fmtShort(p.startDate) + ' → ' + fmtShort(p.endDate) + '</small></div>' +
            '<div class="phase-track">' + bounds.map(function(b) {
                let cls = 'phase-track__seg';
                let style = 'flex:' + b.weeks + ';';
                if (week > b.endWeek) cls += ' phase-track__seg--done';
                else if (week >= b.startWeek) { cls += ' phase-track__seg--current'; style += '--pct:' + Math.round((week - b.startWeek + 1) / b.weeks * 100) + '%;'; }
                return '<div class="' + cls + '" style="' + style + '" title="Phase ' + b.id + ': ' + esc(b.name) + '"></div>';
            }).join('') + '</div>' +
            '<div class="phase-legend">' + bounds.map(function(b) {
                const current = week >= b.startWeek && week <= b.endWeek;
                return '<div class="phase-legend__item' + (current ? ' phase-legend__item--current' : '') + '"><strong>' + b.id + '. ' + esc(b.name) + '</strong><span>Weeks ' + b.startWeek + '–' + b.endWeek + ' · ' + esc(b.scheme) + '</span></div>';
            }).join('') + '</div></div>';
    }

    function workoutDetailHtml(p, dateKey) {
        const date = D.parse(dateKey);
        const sched = P.workoutForDate(p, date);
        const log = workoutLog(dateKey);
        const workoutId = log ? log.data.workoutId : (sched ? sched.id : ui.adhocWorkout);
        const workout = P.WORKOUTS[workoutId];
        const multiplier = log ? 1 : (sched ? sched.setsMultiplier : 1);
        const phase = sched ? sched.phase : P.phaseForWeek(p, Math.max(1, P.weekNumber(p, date)));

        let html = '<div class="fx-card" id="workoutDetail"><div class="fx-card__title"><span>' + fmtLong(dateKey) +
            (log && log.data.completed ? ' <span class="badge badge--good">Completed</span>' : '') +
            (sched && sched.deload ? ' <span class="badge">Deload · half the sets</span>' : '') + '</span>';

        if (!sched && !log) {
            html += '<span class="fx-small fx-muted">Rest day — logging an extra session</span></div>' +
                '<div class="form__group" style="max-width:320px"><label class="form__label--small" for="adhocWorkout">Workout</label>' +
                '<select id="adhocWorkout" class="form__select form__select--sm">' + Object.keys(P.WORKOUTS).map(function(id) {
                    return '<option value="' + id + '"' + (id === workoutId ? ' selected' : '') + '>' + esc(P.WORKOUTS[id].name) + ' (' + id.toUpperCase().slice(0, 2) + ')</option>';
                }).join('') + '</select></div>';
        } else {
            html += '<span class="fx-small fx-muted">' + esc(workout.name) + '</span></div>' +
                '<div class="workout-meta"><span>' + esc(phase.scheme) + '</span><span>Rest: compounds 90–120 s, accessories 60 s</span><span>Finisher: ' + esc(phase.finisher) + '</span></div>';
        }

        html += '<form id="workoutForm" autocomplete="off" data-workout-id="' + workoutId + '" data-date="' + dateKey + '">';
        workout.exercises.forEach(function(e, i) {
            const meta = P.EXERCISES[e.ex];
            const logged = log && log.data.exercises && log.data.exercises[i] && log.data.exercises[i].ex === e.ex ? log.data.exercises[i] : null;
            const nSets = logged && logged.sets.length ? logged.sets.length : P.effectiveSets(e, multiplier);
            const last = lastPerformance(e.ex, dateKey);
            const hint = progressionHint(e, last);
            const timed = Boolean(e.timed);

            html += '<div class="exercise"><div class="exercise__head"><span class="exercise__name">' + (i + 1) + '. ' + esc(meta.name) +
                (e.superset ? ' <span class="badge badge--muted">superset with next</span>' : '') + '</span>' +
                '<span class="exercise__scheme">' + nSets + ' × ' + esc(e.reps) + ' · rest ' + e.rest + ' s</span></div>' +
                '<div class="exercise__cue">' + esc(meta.cue) + ' <span class="fx-muted">Swap: ' + esc(meta.swap) + '.</span></div>' +
                (hint ? '<div class="exercise__hint">' + esc(hint.text) + '</div>' : '');

            html += '<div class="set-grid"><span class="set-grid__head">Set</span><span class="set-grid__head">' + (timed ? 'Seconds' : 'Reps') + '</span><span class="set-grid__head">' + (meta.inc ? 'Weight (lb)' : 'Weight / notes') + '</span><span class="set-grid__head">✓</span>';
            for (let s = 0; s < nSets; s++) {
                const prev = logged && logged.sets[s] ? logged.sets[s] : null;
                let lbs = prev ? prev.lbs : '';
                if (!prev && last) {
                    const lastSet = last.sets[s] || last.sets[last.sets.length - 1];
                    lbs = hint && hint.bump ? hint.bump : (lastSet && lastSet.lbs ? lastSet.lbs : '');
                }
                html += '<span class="set-grid__num">' + (s + 1) + '</span>' +
                    '<input type="number" inputmode="decimal" min="0" step="1" name="reps-' + i + '-' + s + '" value="' + esc(prev ? prev.reps : '') + '" placeholder="' + esc(e.reps) + '">' +
                    '<input type="number" inputmode="decimal" min="0" step="2.5" name="lbs-' + i + '-' + s + '" value="' + esc(lbs) + '" placeholder="lb">' +
                    '<input type="checkbox" class="set-grid__check" name="done-' + i + '-' + s + '"' + (prev && prev.done ? ' checked' : '') + '>';
            }
            html += '</div></div>';
        });

        html += '<div class="form-grid" style="margin-top: var(--spacing-md)">' +
            '<div class="form__group"><label class="form__label--small" for="durationMin">Duration (min)</label><input id="durationMin" class="form__input form__input--sm" type="number" min="0" name="durationMin" value="' + esc(log && log.data.durationMin ? log.data.durationMin : '') + '"></div>' +
            '<div class="form__group" style="grid-column: span 2"><label class="form__label--small" for="workoutNotes">Notes</label><input id="workoutNotes" class="form__input form__input--sm" type="text" name="notes" placeholder="How did it feel? Anything to change next time?" value="' + esc(log && log.data.notes ? log.data.notes : '') + '"></div>' +
            '</div>' +
            '<div class="panel-actions" style="margin-top: var(--spacing-md)">' +
            '<button type="submit" class="btn btn--primary btn--sm">Save workout</button>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-action="check-all">Check all sets</button>' +
            (log ? '<button type="button" class="btn btn--danger-outline btn--sm" data-action="delete-workout" data-id="' + log.id + '">Delete log</button>' : '') +
            '<span class="fx-small fx-muted">Tick a set when it’s done. Saving with any set ticked marks the session complete.</span></div>' +
            '</form></div>';
        return html;
    }

    function historyHtml() {
        const logs = S.all('workout').slice().reverse().slice(0, 12);
        if (!logs.length) return '';
        return '<div class="fx-card"><div class="fx-card__title">Recent sessions</div><div class="fx-table fx-table--scroll"><table><thead><tr><th>Date</th><th>Workout</th><th>Sets</th><th class="num">Volume (lb)</th><th class="num">Min</th><th></th></tr></thead><tbody>' +
            logs.map(function(r) {
                const d = r.data || {};
                const sets = (d.exercises || []).reduce(function(n, e) { return n + (e.sets || []).filter(function(s) { return s.done; }).length; }, 0);
                const vol = (d.exercises || []).reduce(function(n, e) { return n + (e.sets || []).reduce(function(m, s) { return m + (Number(s.reps) || 0) * (Number(s.lbs) || 0); }, 0); }, 0);
                return '<tr><td>' + fmtMed(r.date) + '</td><td>' + esc(d.workoutName || d.workoutId) + (d.completed ? '' : ' <span class="badge badge--muted">partial</span>') + '</td>' +
                    '<td>' + sets + '</td><td class="num">' + vol.toLocaleString() + '</td><td class="num">' + (d.durationMin || '—') + '</td>' +
                    '<td><button class="btn btn--ghost btn--xs" data-action="select-date" data-date="' + r.date + '">Open</button></td></tr>';
            }).join('') + '</tbody></table></div></div>';
    }

    function planOverviewHtml(p) {
        const bounds = p ? P.phaseBounds(p) : P.PHASES.map(function(ph, i) {
            const prevEnd = i === 0 ? 0 : Math.round(39 * P.PHASES[i - 1].endFrac);
            return Object.assign({}, ph, { startWeek: prevEnd + 1, endWeek: Math.round(39 * ph.endFrac) });
        });
        return '<div class="fx-card"><div class="fx-card__title">The full program <small>3 days a week · full body · double progression</small></div>' +
            '<p class="fx-small fx-muted">Progression rule: when every set reaches the top of the rep range, add the exercise’s increment next session (5 lb upper body, 10 lb lower body). Same weight across all sets. If you miss the bottom of the range on two sets, stay put.</p>' +
            bounds.map(function(b) {
                return '<details class="fx-details"><summary>Phase ' + b.id + ' — ' + esc(b.name) + ' <span class="fx-small fx-muted">weeks ' + b.startWeek + '–' + b.endWeek + '</span></summary>' +
                    '<p class="fx-small" style="margin: 6px 0">' + esc(b.focus) + '</p>' +
                    '<div class="workout-meta"><span>' + esc(b.scheme) + '</span><span>Finisher: ' + esc(b.finisher) + '</span><span>Steps: ' + b.steps.toLocaleString() + '/day</span></div>' +
                    '<ul class="fx-small" style="margin: 0 0 8px 18px">' + b.tips.map(function(t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
                    '<div class="fx-grid-2">' + b.workouts.map(function(id) {
                        const wk = P.WORKOUTS[id];
                        return '<div><strong>' + esc(wk.name) + '</strong><ul class="fx-small" style="list-style:none; line-height:1.8">' + wk.exercises.map(function(e) {
                            return '<li>' + esc(P.EXERCISES[e.ex].name) + ' <span class="fx-muted">' + e.sets + ' × ' + esc(e.reps) + '</span></li>';
                        }).join('') + '</ul></div>';
                    }).join('') + '</div></details>';
            }).join('') + '</div>';
    }

    function saveWorkout(form) {
        const p = profile();
        const dateKey = form.dataset.date;
        const workoutId = form.dataset.workoutId;
        const workout = P.WORKOUTS[workoutId];
        const fd = new FormData(form);
        const exercises = [];
        let anyDone = false;

        workout.exercises.forEach(function(e, i) {
            const sets = [];
            for (let s = 0; s < 12; s++) {
                if (!fd.has('reps-' + i + '-' + s)) break;
                const reps = fd.get('reps-' + i + '-' + s);
                const lbs = fd.get('lbs-' + i + '-' + s);
                const done = fd.get('done-' + i + '-' + s) === 'on';
                if (done) anyDone = true;
                sets.push({ reps: reps === '' ? null : Number(reps), lbs: lbs === '' ? null : Number(lbs), done: done });
            }
            exercises.push({ ex: e.ex, sets: sets });
        });

        const sched = P.workoutForDate(p, D.parse(dateKey));
        const summary = exercises.slice(0, 3).map(function(ex) {
            const done = ex.sets.filter(function(s) { return s.done && (s.reps || s.lbs); });
            if (!done.length) return null;
            const top = done.reduce(function(best, s) { return (Number(s.lbs) || 0) >= (Number(best.lbs) || 0) ? s : best; }, done[0]);
            return P.EXERCISES[ex.ex].name.split(' ').slice(-2).join(' ') + ' ' + done.length + '×' + (top.reps || '?') + (top.lbs ? '@' + top.lbs : '');
        }).filter(Boolean).join(', ') || workout.name;

        S.put('workout', 'wo-' + dateKey, dateKey, {
            workoutId: workoutId,
            workoutName: workout.name,
            workoutShort: workout.short,
            week: sched ? sched.week : P.weekNumber(p, D.parse(dateKey)),
            phaseId: sched ? sched.phase.id : null,
            exercises: exercises,
            durationMin: Number(fd.get('durationMin')) || null,
            notes: String(fd.get('notes') || '').trim(),
            completed: anyDone
        }, summary);

        toast(anyDone ? 'Workout saved — nice work.' : 'Saved as in progress.');
    }

    // ==============================================
    // Meals
    // ==============================================

    function renderMeals() {
        const el = panelEl('meals');
        const p = profile();
        const dateKey = ui.mealsDate;
        const t = targetsFor(p);
        const totals = dayTotals(dateKey);
        const todayKey = D.key();

        let html = '<div class="panel-header"><div><h1 class="panel-title">Meals</h1>' +
            '<p class="panel-subtitle">' + fmtLong(dateKey) + (dateKey === todayKey ? ' · today' : '') + '</p></div>' +
            '<div class="panel-actions"><button class="btn btn--ghost btn--xs" data-action="meals-prev">‹ Prev</button>' +
            '<button class="btn btn--ghost btn--xs" data-action="meals-today">Today</button>' +
            '<button class="btn btn--ghost btn--xs" data-action="meals-next">Next ›</button></div></div>';

        if (!p) html += setupCard();

        // Targets
        html += '<div class="fx-card"><div class="fx-card__title">Daily targets' + (t ? ' <small>' + t.calories.toLocaleString() + ' kcal · ' + (Math.round(t.deficit)).toLocaleString() + ' kcal below maintenance · about ' + n1(t.lossPerWeek) + ' lb/week</small>' : '') + '</div>';
        if (t) {
            html += macroRow('Calories', totals.kcal, t.calories, ' kcal') + macroRow('Protein', totals.p, t.protein, ' g') + macroRow('Carbs', totals.c, t.carbs, ' g') + macroRow('Fat', totals.f, t.fat, ' g');
        } else {
            html += '<p class="fx-muted fx-small">Targets appear once your profile is saved.</p>';
        }
        html += '</div>';

        html += '<div class="fx-grid-2">';

        // Plan for the day
        const plan = M.planForDate(p, D.parse(dateKey), t ? t.calories : null);
        const swaps = ui.swaps[dateKey] || {};
        html += '<div class="fx-card"><div class="fx-card__title">Today’s plan <small>portions ×' + plan.factor + ' · ' + plan.total.toLocaleString() + ' kcal</small></div>';
        M.SLOTS.forEach(function(slot) {
            let meal = plan[slot];
            if (swaps[slot]) {
                const options = M.bySlot(slot);
                const idx = (options.findIndex(function(m) { return m.id === meal.id; }) + swaps[slot]) % options.length;
                meal = M.scaleMeal(options[idx], plan.factor);
            }
            const already = mealsOn(dateKey).some(function(r) { return r.data && r.data.mealId === meal.id; });
            html += '<div class="meal-slot"><span class="meal-slot__label">' + M.SLOT_LABELS[slot] + '</span>' +
                '<div class="meal-slot__body"><div class="meal-slot__name">' + esc(meal.name) + (already ? ' <span class="badge badge--good">logged</span>' : '') + '</div>' +
                '<div class="meal-slot__macros">' + meal.kcal + ' kcal · P ' + meal.p + ' · C ' + meal.c + ' · F ' + meal.f + (meal.prep ? ' · ' + esc(meal.prep) : '') + '</div>' +
                '<div class="meal-card__ingredients">' + meal.ing.map(function(i) { return esc(i[1] + ' ' + i[0]); }).join(', ') + '</div></div>' +
                '<div class="meal-slot__actions"><button class="btn btn--primary btn--xs" data-action="log-meal" data-meal="' + meal.id + '" data-slot="' + slot + '">Log</button>' +
                '<button class="btn btn--ghost btn--xs" data-action="swap-meal" data-slot="' + slot + '">Swap</button></div></div>';
        });
        html += '</div>';

        // Logged + quick add
        const logged = mealsOn(dateKey);
        html += '<div class="fx-card"><div class="fx-card__title">Logged <small>' + totals.kcal.toLocaleString() + ' kcal · ' + totals.p + ' g protein</small></div>';
        if (logged.length) {
            html += '<div>' + logged.map(function(r) {
                const d = r.data || {};
                return '<div class="logged-item"><div><div>' + esc(d.name) + '</div><div class="logged-item__meta">' + esc(M.SLOT_LABELS[d.slot] || d.slot || '') + ' · ' + (d.kcal || 0) + ' kcal · P ' + (d.protein || 0) + ' · C ' + (d.carbs || 0) + ' · F ' + (d.fat || 0) + '</div></div>' +
                    '<button class="btn btn--ghost btn--xs" data-action="remove-meal" data-id="' + r.id + '">Remove</button></div>';
            }).join('') + '</div>';
        } else {
            html += '<p class="fx-muted fx-small">Nothing logged yet. Use the plan on the left, the library below, or quick-add.</p>';
        }
        html += '<form id="quickMealForm" autocomplete="off" style="margin-top: var(--spacing-md)"><label class="form__label--small">Quick add</label><div class="form-inline">' +
            '<div class="form__group" style="flex:2"><input class="form__input form__input--sm" name="name" placeholder="What did you eat?" required></div>' +
            '<div class="form__group" style="min-width:90px"><input class="form__input form__input--sm" type="number" min="0" name="kcal" placeholder="kcal" required></div>' +
            '<div class="form__group" style="min-width:90px"><input class="form__input form__input--sm" type="number" min="0" name="protein" placeholder="protein g"></div>' +
            '<div class="form__group" style="min-width:110px"><select class="form__select form__select--sm" name="slot">' + M.SLOTS.map(function(s) { return '<option value="' + s + '">' + M.SLOT_LABELS[s] + '</option>'; }).join('') + '</select></div>' +
            '<button type="submit" class="btn btn--primary btn--sm">Add</button></div></form>';
        html += '</div></div>';

        // Library
        html += '<div class="fx-card" style="margin-top: var(--spacing-md)"><div class="fx-card__title"><span>Meal library</span><input id="mealSearch" class="form__input form__input--sm" placeholder="Search meals or ingredients" value="' + esc(ui.mealSearch) + '" style="max-width:280px"></div>' +
            '<div id="mealLibrary">' + libraryHtml(plan.factor) + '</div></div>';

        // Grocery list
        const anchor = D.parse(dateKey);
        const monday = D.addDays(anchor, -((anchor.getDay() + 6) % 7));
        const list = M.groceryList(p, monday, t ? t.calories : null);
        html += '<div class="fx-card"><div class="fx-card__title">Grocery list <small>week of ' + fmtShort(D.key(monday)) + ' · base quantities, scale ×' + plan.factor + '</small></div>' +
            '<ul class="grocery-list">' + list.map(function(item) {
                return '<li><strong>' + esc(item.item) + '</strong> <span>' + esc(item.qtys.join(' + ')) + ' · ' + item.days + (item.days === 1 ? ' meal' : ' meals') + ' · ' + esc(item.aisle) + '</span></li>';
            }).join('') + '</ul></div>';

        el.innerHTML = html;
    }

    function macroRow(label, value, target, unit) {
        const over = value > target * 1.1;
        return '<div class="macro-row"><span class="macro-row__label">' + label + '</span>' +
            '<div class="bar"><div class="bar__fill' + (over ? ' bar__fill--over' : '') + '" style="width:' + pct(value, target) + '%"></div></div>' +
            '<span class="macro-row__value">' + Math.round(value).toLocaleString() + ' / ' + Math.round(target).toLocaleString() + unit + '</span></div>';
    }

    function libraryHtml(factor) {
        const meals = M.search(ui.mealSearch);
        if (!meals.length) return '<p class="fx-muted fx-small">No meals match.</p>';
        return '<div class="meal-library">' + meals.map(function(m) {
            const s = M.scaleMeal(m, factor);
            return '<div class="meal-card"><span class="meal-card__slot">' + M.SLOT_LABELS[m.slot] + '</span><span class="meal-card__name">' + esc(m.name) + '</span>' +
                '<span class="meal-card__macros">' + s.kcal + ' kcal · P ' + s.p + ' · C ' + s.c + ' · F ' + s.f + '</span>' +
                '<span class="meal-card__ingredients">' + m.ing.map(function(i) { return esc(i[1] + ' ' + i[0]); }).join(', ') + '</span>' +
                '<div class="meal-card__actions"><button class="btn btn--primary btn--xs" data-action="log-meal" data-meal="' + m.id + '" data-slot="' + m.slot + '">Log</button></div></div>';
        }).join('') + '</div>';
    }

    function logMeal(mealId, slot) {
        const p = profile();
        const t = targetsFor(p);
        const meal = M.byId(mealId);
        if (!meal) return;
        const s = M.scaleMeal(meal, M.scaleFactor(t ? t.calories : null));
        const dateKey = ui.mealsDate;
        const id = 'meal-' + dateKey + '-' + slot + '-' + Date.now().toString(36);
        S.put('meal', id, dateKey, { slot: slot, mealId: meal.id, name: s.name, kcal: s.kcal, protein: s.p, carbs: s.c, fat: s.f }, s.name + ' (' + s.kcal + ' kcal)');
        toast('Logged ' + s.name);
    }

    function quickAddMeal(form) {
        const fd = new FormData(form);
        const name = String(fd.get('name') || '').trim();
        const kcal = Number(fd.get('kcal')) || 0;
        const protein = Number(fd.get('protein')) || 0;
        const slot = String(fd.get('slot') || 'snack');
        if (!name) return;
        const dateKey = ui.mealsDate;
        const id = 'meal-' + dateKey + '-' + slot + '-' + Date.now().toString(36);
        S.put('meal', id, dateKey, { slot: slot, mealId: null, name: name, kcal: kcal, protein: protein, carbs: 0, fat: 0 }, name + ' (' + kcal + ' kcal)');
        toast('Added ' + name);
    }

    // ==============================================
    // Progress
    // ==============================================

    function renderProgress() {
        const el = panelEl('progress');
        const p = profile();
        const w = weights();
        const trend = N.trend(w);
        const t = targetsFor(p);
        const todayKey = D.key();

        let html = '<div class="panel-header"><div><h1 class="panel-title">Progress</h1><p class="panel-subtitle">Weight, measurements, strength and how well the calories are landing.</p></div>' +
            '<div class="panel-actions"><button class="btn btn--ghost btn--sm" data-action="export">Export JSON</button>' +
            '<button class="btn btn--ghost btn--sm" data-action="import">Import JSON</button><input type="file" id="importFile" accept="application/json,.json" class="hidden"></div></div>';

        if (!p) html += setupCard();

        if (p) {
            const cw = currentWeight(p);
            html += '<div class="stats-grid stats-grid--compact">' +
                statTile(n1(p.startWeight), 'Start weight', fmtShort(p.startDate)) +
                statTile(n1(cw), 'Current', trend ? 'logged ' + fmtShort(trend.currentDate) : '') +
                statTile(signed(w.length ? cw - Number(p.startWeight) : 0, ''), 'Change (lb)', w.length && Number(p.startWeight) ? signed((cw - Number(p.startWeight)) / Number(p.startWeight) * 100, '%') : '', cw < Number(p.startWeight) ? 'stat-card__delta--good' : '') +
                statTile(trend && trend.weeklyRateLbs !== null ? signed(trend.weeklyRateLbs, '') : '—', 'lb / week', trend && trend.weeklyRatePct !== null ? signed(trend.weeklyRatePct, '%') + ' of bodyweight' : 'needs 2+ weeks of data') +
                statTile(t && t.projectedGoalDate && cw > Number(p.goalWeight) ? fmtDateObj(t.projectedGoalDate).replace(/, \d{4}$/, '') : (cw <= Number(p.goalWeight) ? 'Reached' : '—'), 'Goal ETA', 'at ' + (t ? n1(t.lossPerWeek) : '—') + ' lb/week') +
                '</div>';
        }

        // Weight chart
        html += '<div class="fx-card"><div class="fx-card__title"><span>Weight</span><span class="panel-actions">' +
            [30, 90, 180, 0].map(function(r) {
                return '<button class="btn btn--xs ' + (ui.progressRange === r ? 'btn--primary' : 'btn--ghost') + '" data-action="range" data-range="' + r + '">' + (r ? r + ' days' : 'All') + '</button>';
            }).join('') + '</span></div>' +
            (w.length ? '<div class="chart-box chart-box--tall"><canvas id="progressWeightChart"></canvas></div>' : '<div class="fx-empty"><p>No weigh-ins yet.</p></div>') +
            '<form id="weightForm" class="form-inline" autocomplete="off" style="margin-top: var(--spacing-md)">' +
            '<div class="form__group" style="max-width:170px"><label class="form__label--small" for="pwDate">Date</label><input id="pwDate" class="form__input form__input--sm" type="date" name="date" value="' + todayKey + '" max="' + todayKey + '" required></div>' +
            '<div class="form__group" style="max-width:150px"><label class="form__label--small" for="pwLbs">Weight (lb)</label><input id="pwLbs" class="form__input form__input--sm" type="number" step="0.1" min="50" max="700" name="lbs" required></div>' +
            '<button type="submit" class="btn btn--primary btn--sm">Log weight</button></form></div>';

        html += '<div class="fx-grid-2">';

        // Weigh-in table
        html += '<div class="fx-card"><div class="fx-card__title">Weigh-ins <small>' + w.length + ' entries</small></div>' +
            (w.length ? '<div class="fx-table" style="max-height:360px; overflow:auto"><table><thead><tr><th>Date</th><th class="num">lb</th><th class="num">7-day avg</th><th></th></tr></thead><tbody>' +
                (function() {
                    const avg = N.movingAverage(w, 7);
                    return w.map(function(e, i) {
                        return '<tr><td>' + fmtMed(e.date) + '</td><td class="num">' + n1(e.lbs) + '</td><td class="num fx-muted">' + n1(avg[i].lbs) + '</td>' +
                            '<td><button class="btn btn--ghost btn--xs" data-action="delete-record" data-id="' + e.id + '">✕</button></td></tr>';
                    }).reverse().join('');
                })() + '</tbody></table></div>' : '<p class="fx-muted fx-small">Weigh in most mornings; the 7-day average is the number that matters.</p>') + '</div>';

        // Measurements
        const meas = S.all('measurement');
        html += '<div class="fx-card"><div class="fx-card__title">Measurements <small>inches · every 2 weeks</small></div>' +
            '<form id="measurementForm" class="form-inline" autocomplete="off">' +
            '<div class="form__group"><label class="form__label--small">Date</label><input class="form__input form__input--sm" type="date" name="date" value="' + todayKey + '" max="' + todayKey + '" required></div>' +
            '<div class="form__group"><label class="form__label--small">Waist</label><input class="form__input form__input--sm" type="number" step="0.1" min="15" max="80" name="waistIn" required></div>' +
            '<div class="form__group"><label class="form__label--small">Chest</label><input class="form__input form__input--sm" type="number" step="0.1" min="15" max="80" name="chestIn"></div>' +
            '<div class="form__group"><label class="form__label--small">Hips</label><input class="form__input form__input--sm" type="number" step="0.1" min="15" max="80" name="hipsIn"></div>' +
            '<button type="submit" class="btn btn--primary btn--sm">Save</button></form>' +
            (meas.length ? '<div class="fx-table" style="margin-top: var(--spacing-sm)"><table><thead><tr><th>Date</th><th class="num">Waist</th><th class="num">Chest</th><th class="num">Hips</th><th></th></tr></thead><tbody>' +
                meas.slice().reverse().map(function(r) {
                    const d = r.data || {};
                    return '<tr><td>' + fmtMed(r.date) + '</td><td class="num">' + n1(d.waistIn) + '</td><td class="num">' + n1(d.chestIn) + '</td><td class="num">' + n1(d.hipsIn) + '</td>' +
                        '<td><button class="btn btn--ghost btn--xs" data-action="delete-record" data-id="' + r.id + '">✕</button></td></tr>';
                }).join('') + '</tbody></table></div>' : '<p class="fx-muted fx-small" style="margin-top: var(--spacing-sm)">Waist at the navel, relaxed. The tape often moves before the scale does.</p>') + '</div>';

        html += '</div>';

        // Strength PRs
        html += '<div class="fx-card"><div class="fx-card__title">Strength <small>best set per exercise · estimated 1RM (Epley)</small></div>' + strengthHtml() + '</div>';

        // Calorie adherence heat strip
        if (t) {
            html += '<div class="fx-card"><div class="fx-card__title">Calorie adherence <small>last 12 weeks</small></div>' + heatStripHtml(t) +
                '<div class="chart-legend" style="margin-top: var(--spacing-xs)"><span><i style="background:#EFECE6"></i>no log</span><span><i style="background:#E9DFC9"></i>under 60%</span><span><i style="background:#D9C69A"></i>60–90%</span><span><i style="background:var(--color-gold-dark)"></i>on target (90–110%)</span><span><i style="background:var(--status-bad)"></i>over 110%</span></div></div>';
        }

        html += '<div class="fx-card"><div class="fx-card__title">Danger zone</div><p class="fx-small fx-muted">Removes every record (as deletions, so other devices follow). Export first.</p>' +
            '<button class="btn btn--danger-outline btn--sm" data-action="reset-data" style="margin-top: var(--spacing-xs)">Delete all fitness data</button></div>';

        el.innerHTML = html;

        destroyCharts();
        if (w.length) weightChart('progressWeightChart', w, p, ui.progressRange);
    }

    function strengthHtml() {
        const logs = S.all('workout');
        const best = {};
        logs.forEach(function(r) {
            (r.data && r.data.exercises || []).forEach(function(ex) {
                (ex.sets || []).forEach(function(s) {
                    if (!s.lbs || !s.reps) return;
                    const e1 = N.est1RM(s.reps, s.lbs);
                    const cur = best[ex.ex];
                    if (!cur || e1 > cur.e1) best[ex.ex] = { e1: e1, reps: s.reps, lbs: s.lbs, date: r.date, sessions: (cur ? cur.sessions : 0) };
                });
                if (best[ex.ex]) best[ex.ex].sessions++;
            });
        });
        const ids = Object.keys(best).sort(function(a, b) { return best[b].e1 - best[a].e1; });
        if (!ids.length) return '<p class="fx-muted fx-small">Log a few workouts with weights and your bests show up here.</p>';
        return '<div class="fx-table fx-table--scroll"><table><thead><tr><th>Exercise</th><th>Best set</th><th class="num">Est. 1RM</th><th>When</th><th class="num">Sessions</th></tr></thead><tbody>' +
            ids.map(function(id) {
                const b = best[id];
                return '<tr><td>' + esc(P.EXERCISES[id] ? P.EXERCISES[id].name : id) + '</td><td>' + b.reps + ' × ' + b.lbs + ' lb</td><td class="num">' + b.e1 + '</td><td>' + fmtMed(b.date) + '</td><td class="num">' + b.sessions + '</td></tr>';
            }).join('') + '</tbody></table></div>';
    }

    function heatStripHtml(t) {
        const cells = [];
        const today = new Date();
        for (let i = 83; i >= 0; i--) {
            const key = D.key(D.addDays(today, -i));
            const totals = dayTotals(key);
            let cls = 'heat-cell';
            let title = fmtMed(key) + ': ';
            if (!totals.kcal) { title += 'no log'; }
            else {
                const ratio = totals.kcal / t.calories;
                title += totals.kcal.toLocaleString() + ' kcal (' + Math.round(ratio * 100) + '%)';
                if (ratio > 1.1) cls += ' heat-cell--over';
                else if (ratio >= 0.9) cls += ' heat-cell--l4';
                else if (ratio >= 0.6) cls += ' heat-cell--l2';
                else cls += ' heat-cell--l1';
            }
            cells.push('<div class="' + cls + '" title="' + esc(title) + '"></div>');
        }
        return '<div class="heat-strip">' + cells.join('') + '</div>';
    }

    // ==============================================
    // Profile & Sync
    // ==============================================

    function renderProfile() {
        const el = panelEl('profile');
        const p = profile() || {};
        const todayKey = D.key();
        const defaultEnd = D.key(addMonths(new Date(), 9));
        const heightIn = Number(p.heightIn) || 0;
        const feet = heightIn ? Math.floor(heightIn / 12) : '';
        const inches = heightIn ? Math.round((heightIn % 12) * 10) / 10 : '';
        const days = P.workoutDays(p);
        const st = S.getStatus();

        let html = '<div class="panel-header"><div><h1 class="panel-title">Profile &amp; Sync</h1><p class="panel-subtitle">Your numbers drive the targets. Your token keeps every device in step.</p></div></div>';

        // Sync card
        html += '<div class="fx-card"><div class="fx-card__title"><span>Data sync</span><span class="fx-small fx-muted">' + esc(F.api.repo() || 'no repo configured') + '</span></div>' +
            '<div id="syncStatusBox">' + syncStatusHtml(st) + '</div>' +
            '<form id="tokenForm" class="form-inline" autocomplete="off" style="margin-top: var(--spacing-sm)">' +
            '<div class="form__group" style="flex:3"><label class="form__label--small" for="tokenInput">' + (st.hasToken ? 'Replace token' : 'GitHub fine-grained token') + '</label>' +
            '<input id="tokenInput" class="form__input form__input--sm" type="password" name="token" placeholder="github_pat_…" autocomplete="off"></div>' +
            '<button type="submit" class="btn btn--primary btn--sm">Connect</button>' +
            (st.hasToken ? '<button type="button" class="btn btn--ghost btn--sm" data-action="sync-now">Sync now</button><button type="button" class="btn btn--danger-outline btn--sm" data-action="forget-token">Forget token</button>' : '') +
            '</form>' +
            '<details class="fx-details" style="margin-top: var(--spacing-sm)"><summary>How to create the token</summary><ol class="fx-small" style="margin: 8px 0 0 18px; line-height:1.8">' +
            '<li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener" style="color: var(--color-gold-dark)">github.com/settings/personal-access-tokens/new</a>.</li>' +
            '<li>Name it (e.g. “fitness tracker – phone”). Pick the longest expiration you’re comfortable with.</li>' +
            '<li>Repository access: <strong>Only select repositories</strong> → choose <strong>' + esc(F.api.repo()) + '</strong>.</li>' +
            '<li>Permissions → Repository permissions → <strong>Contents: Read and write</strong>. Leave everything else at No access.</li>' +
            '<li>Generate, copy, paste it above. It’s stored only in this browser; repeat once per device.</li></ol></details></div>';

        // Profile form
        html += '<div class="fx-card"><div class="fx-card__title">Your profile</div>' +
            '<form id="profileForm" autocomplete="off"><div class="form-grid">' +
            field('name', 'First name', 'text', p.name || '', 'placeholder="Bernard"') +
            '<div class="form__group"><label class="form__label--small" for="pf-sex">Sex (for the BMR formula)</label><select id="pf-sex" class="form__select form__select--sm" name="sex">' +
            '<option value="male"' + (p.sex !== 'female' ? ' selected' : '') + '>Male</option><option value="female"' + (p.sex === 'female' ? ' selected' : '') + '>Female</option></select></div>' +
            field('age', 'Age', 'number', p.age || '', 'min="16" max="90" required') +
            '<div class="form__group"><label class="form__label--small">Height</label><div class="form-inline">' +
            '<input class="form__input form__input--sm" type="number" name="feet" min="3" max="8" placeholder="ft" value="' + feet + '" required style="width:80px">' +
            '<input class="form__input form__input--sm" type="number" name="inches" min="0" max="11.9" step="0.5" placeholder="in" value="' + inches + '" required style="width:80px"></div></div>' +
            field('startWeight', 'Starting weight (lb)', 'number', p.startWeight || '', 'step="0.1" min="50" max="700" required') +
            field('goalWeight', 'Goal weight (lb)', 'number', p.goalWeight || '', 'step="0.1" min="50" max="700" required') +
            '<div class="form__group"><label class="form__label--small" for="pf-activity">Activity outside the gym</label><select id="pf-activity" class="form__select form__select--sm" name="activity">' +
            Object.keys(N.ACTIVITY).map(function(k) { return '<option value="' + k + '"' + ((p.activity || 'light') === k ? ' selected' : '') + '>' + esc(N.ACTIVITY[k].label) + '</option>'; }).join('') + '</select></div>' +
            field('startDate', 'Plan start', 'date', p.startDate || todayKey, 'required') +
            field('endDate', 'Plan end', 'date', p.endDate || defaultEnd, 'required') +
            '</div>' +
            '<div class="form__group" style="margin-top: var(--spacing-sm)"><label class="form__label--small">Workout days</label><div class="day-picker">' +
            [1, 2, 3, 4, 5, 6, 0].map(function(d) { return '<label><input type="checkbox" name="workoutDays" value="' + d + '"' + (days.includes(d) ? ' checked' : '') + '><span>' + DOW[d] + '</span></label>'; }).join('') +
            '</div><p class="fx-small fx-muted" style="margin-top:6px">Three days with a rest day between each is the plan. Pick more only if you’ll really show up.</p></div>' +
            '<div class="fx-card__title" style="margin-top: var(--spacing-md)">Computed targets <small>update as you type</small></div><div id="targetsPreview">' + targetsPreviewHtml(p) + '</div>' +
            '<div class="panel-actions" style="margin-top: var(--spacing-md)"><button type="submit" class="btn btn--primary btn--sm">Save profile</button>' +
            '<span class="fx-small fx-muted">Saving with a new start date re-aligns the phases and the meal rotation.</span></div></form></div>';

        html += '<div class="fx-card"><div class="fx-card__title">How the numbers work</div><ul class="fx-small" style="margin-left:18px; line-height:1.8">' +
            '<li><strong>Maintenance</strong> = Mifflin-St Jeor BMR × activity factor.</li>' +
            '<li><strong>Calorie target</strong> = maintenance − 22%, never below 1,500 kcal (1,200 for women). About 0.5–1% of bodyweight per week.</li>' +
            '<li><strong>Protein</strong> 0.8 g per lb of goal weight, <strong>fat</strong> 27% of calories, <strong>carbs</strong> fill the rest.</li>' +
            '<li>The dashboard re-checks the two-week trend and tells you when to trim or add calories.</li></ul></div>';

        el.innerHTML = html;
        destroyCharts();
    }

    function field(name, label, type, value, extra) {
        return '<div class="form__group"><label class="form__label--small" for="pf-' + name + '">' + esc(label) + '</label>' +
            '<input id="pf-' + name + '" class="form__input form__input--sm" type="' + type + '" name="' + name + '" value="' + esc(value) + '" ' + (extra || '') + '></div>';
    }

    function syncStatusHtml(st) {
        const map = {
            idle: ['badge--muted', 'Idle'], syncing: ['', 'Syncing…'], synced: ['badge--good', 'Synced'],
            offline: ['', 'Offline'], error: ['badge--muted', 'Error'], auth: ['badge--muted', st.hasToken ? 'Token rejected' : 'No token on this device']
        };
        const m = map[st.status] || map.idle;
        return '<p><span class="badge ' + m[0] + '">' + m[1] + '</span> <span class="fx-small fx-muted">' + esc(st.message || (st.lastSyncAt ? 'Last sync ' + new Date(st.lastSyncAt).toLocaleTimeString() : '')) +
            (st.pending ? ' · ' + st.pending + ' change' + (st.pending === 1 ? '' : 's') + ' waiting' : '') + '</span></p>';
    }

    function targetsPreviewHtml(p) {
        const t = p && p.age && p.heightIn && p.startWeight ? N.targets(p, currentWeight(p)) : null;
        if (!t) return '<p class="fx-muted fx-small">Fill in age, height and weights to see targets.</p>';
        return '<div class="targets-preview">' +
            '<div><strong>' + t.tdee.toLocaleString() + '</strong><span>maintenance kcal</span></div>' +
            '<div><strong>' + t.calories.toLocaleString() + '</strong><span>daily target kcal</span></div>' +
            '<div><strong>' + t.protein + ' g</strong><span>protein</span></div>' +
            '<div><strong>' + t.carbs + ' g</strong><span>carbs</span></div>' +
            '<div><strong>' + t.fat + ' g</strong><span>fat</span></div>' +
            '<div><strong>' + n1(t.lossPerWeek) + ' lb</strong><span>per week (' + n1(t.lossPerWeekPct) + '%)</span></div>' +
            '<div><strong>' + (t.projectedGoalDate ? fmtDateObj(t.projectedGoalDate) : '—') + '</strong><span>goal ETA</span></div>' +
            '</div>';
    }

    function profileFromForm(form) {
        const fd = new FormData(form);
        const feet = Number(fd.get('feet')) || 0;
        const inches = Number(fd.get('inches')) || 0;
        return {
            name: String(fd.get('name') || '').trim(),
            sex: fd.get('sex') === 'female' ? 'female' : 'male',
            age: Number(fd.get('age')) || 0,
            heightIn: feet * 12 + inches,
            startWeight: Number(fd.get('startWeight')) || 0,
            goalWeight: Number(fd.get('goalWeight')) || 0,
            activity: String(fd.get('activity') || 'light'),
            startDate: String(fd.get('startDate') || D.key()),
            endDate: String(fd.get('endDate') || ''),
            workoutDays: fd.getAll('workoutDays').map(Number),
            units: 'lb'
        };
    }

    function saveProfile(form) {
        const p = profileFromForm(form);
        if (!p.endDate || p.endDate <= p.startDate) { toast('The end date has to be after the start date.', true); return; }
        if (!p.workoutDays.length) p.workoutDays = [1, 3, 5];
        S.put('profile', 'profile', p.startDate, p, 'Profile: ' + p.startWeight + ' → ' + p.goalWeight + ' lb');
        if (!weights().length && p.startWeight) {
            S.put('weight', 'weight-' + p.startDate, p.startDate, { lbs: p.startWeight }, p.startWeight + ' lb');
        }
        toast('Profile saved.');
    }

    function addMonths(d, n) {
        const out = new Date(d.getTime());
        out.setMonth(out.getMonth() + n);
        return out;
    }

    // ==============================================
    // Charts
    // ==============================================

    function chartAvailable() {
        return typeof window.Chart !== 'undefined';
    }

    function destroyCharts() {
        Object.keys(charts).forEach(function(id) {
            try { charts[id].destroy(); } catch (e) { /* ignore */ }
            delete charts[id];
        });
    }

    function chartFallback(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (canvas && canvas.parentNode) canvas.parentNode.innerHTML = '<div class="fx-empty"><p>Charts couldn’t load.</p><p>The Chart.js script from cdnjs is blocked or offline.</p></div>';
    }

    function weightChart(canvasId, w, p, rangeDays) {
        if (!chartAvailable()) return chartFallback(canvasId);
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        let entries = w;
        if (rangeDays) {
            const cutoff = D.key(D.addDays(new Date(), -rangeDays));
            entries = w.filter(function(e) { return e.date >= cutoff; });
            if (entries.length < 2) entries = w.slice(-2);
        }
        const avg = N.movingAverage(w, 7);
        const avgByDate = {};
        avg.forEach(function(a) { avgByDate[a.date] = a.lbs; });

        // Daily axis from first to last entry, nulls where nothing was logged
        const first = D.parse(entries[0].date);
        const last = D.parse(entries[entries.length - 1].date);
        const byDate = {};
        entries.forEach(function(e) { byDate[e.date] = e.lbs; });
        const labels = [], daily = [], rolling = [], goal = [];
        const goalLbs = p ? Number(p.goalWeight) : null;
        for (let d = new Date(first.getTime()); d <= last; d.setDate(d.getDate() + 1)) {
            const key = D.key(d);
            labels.push(key);
            daily.push(byDate[key] !== undefined ? byDate[key] : null);
            rolling.push(byDate[key] !== undefined ? avgByDate[key] : null);
            goal.push(goalLbs || null);
        }

        const datasets = [
            { label: 'Daily weigh-in', data: daily, borderColor: CHART_CONTEXT, backgroundColor: CHART_CONTEXT, pointRadius: 3, pointHoverRadius: 5, showLine: false, spanGaps: true },
            { label: '7-day average', data: rolling, borderColor: CHART_ACCENT, backgroundColor: CHART_ACCENT, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.3, spanGaps: true }
        ];
        if (goalLbs) datasets.push({ label: 'Goal', data: goal, borderColor: CHART_TEXT, borderDash: [4, 4], borderWidth: 1, pointRadius: 0, pointHoverRadius: 0 });

        charts[canvasId] = new Chart(canvas, {
            type: 'line',
            data: { labels: labels, datasets: datasets },
            options: baseOptions({
                scales: {
                    x: { grid: { display: false }, ticks: { color: CHART_TEXT, maxTicksLimit: 7, maxRotation: 0, callback: function(v) { return fmtShort(this.getLabelForValue(v)); } } },
                    y: { grid: { color: CHART_GRID }, ticks: { color: CHART_TEXT, maxTicksLimit: 6 }, title: { display: false } }
                },
                plugins: {
                    legend: { display: true, position: 'top', align: 'start', labels: { usePointStyle: true, boxWidth: 8, color: CHART_TEXT, font: { family: 'Josefin Sans', size: 11 } } },
                    tooltip: { callbacks: { title: function(items) { return fmtMed(items[0].label); }, label: function(item) { return item.dataset.label + ': ' + n1(item.parsed.y) + ' lb'; } } }
                },
                interaction: { mode: 'index', intersect: false }
            })
        });
    }

    function adherenceChart(canvasId, adherence) {
        if (!chartAvailable()) return chartFallback(canvasId);
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const maxPlanned = Math.max(3, Math.max.apply(null, adherence.map(function(a) { return Math.max(a.planned, a.done); })));

        charts[canvasId] = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: adherence.map(function(a) { return 'W' + a.week; }),
                datasets: [
                    { label: 'Planned', data: adherence.map(function(a) { return a.planned; }), backgroundColor: '#EFECE6', borderRadius: 4, borderSkipped: false, barPercentage: 0.55, categoryPercentage: 0.9, grouped: false, order: 2 },
                    { label: 'Completed', data: adherence.map(function(a) { return a.done; }), backgroundColor: CHART_ACCENT, borderRadius: 4, borderSkipped: 'bottom', barPercentage: 0.55, categoryPercentage: 0.9, grouped: false, order: 1 }
                ]
            },
            options: baseOptions({
                scales: {
                    x: { grid: { display: false }, ticks: { color: CHART_TEXT, maxRotation: 0 } },
                    y: { beginAtZero: true, max: maxPlanned, grid: { color: CHART_GRID }, ticks: { color: CHART_TEXT, stepSize: 1 } }
                },
                plugins: {
                    legend: { display: true, position: 'top', align: 'start', labels: { usePointStyle: true, boxWidth: 8, color: CHART_TEXT, font: { family: 'Josefin Sans', size: 11 } } },
                    tooltip: { callbacks: { title: function(items) { const a = adherence[items[0].dataIndex]; return 'Week ' + a.week + ' · from ' + fmtShort(a.startKey); }, label: function(item) { const a = adherence[item.dataIndex]; return item.dataset.label === 'Completed' ? a.done + ' of ' + a.planned + ' sessions' : a.planned + ' planned'; } } }
                }
            })
        });
    }

    function baseOptions(extra) {
        const base = {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 300 },
            font: { family: 'Josefin Sans' },
            plugins: { legend: { display: false } }
        };
        Chart.defaults.font.family = 'Josefin Sans';
        Chart.defaults.color = CHART_TEXT;
        return deepMerge(base, extra || {});
    }

    function deepMerge(a, b) {
        const out = Object.assign({}, a);
        Object.keys(b).forEach(function(k) {
            if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') out[k] = deepMerge(a[k], b[k]);
            else out[k] = b[k];
        });
        return out;
    }

    // ==============================================
    // Events
    // ==============================================

    function bindEvents() {
        if (eventsBound) return;
        eventsBound = true;
        const main = document.getElementById('appMain');

        main.addEventListener('click', function(e) {
            const target = e.target.closest('[data-action]');
            if (!target || !main.contains(target)) return;
            const action = target.dataset.action;

            switch (action) {
                case 'open-workout':
                    ui.workoutDate = target.dataset.date;
                    ui.weekOffset = 0;
                    return; // the href="#workouts" does the navigation
                case 'select-date':
                    ui.workoutDate = target.dataset.date;
                    renderWorkouts();
                    scrollToEl('workoutDetail');
                    break;
                case 'week-prev': ui.weekOffset -= 1; renderWorkouts(); break;
                case 'week-next': ui.weekOffset += 1; renderWorkouts(); break;
                case 'week-today': ui.weekOffset = 0; ui.workoutDate = D.key(); renderWorkouts(); break;
                case 'check-all':
                    document.querySelectorAll('#workoutForm .set-grid__check').forEach(function(cb) { cb.checked = true; });
                    break;
                case 'delete-workout':
                    if (confirm('Delete this workout log?')) { S.remove(target.dataset.id); toast('Workout log deleted.'); }
                    break;
                case 'meals-prev': ui.mealsDate = D.key(D.addDays(D.parse(ui.mealsDate), -1)); renderMeals(); break;
                case 'meals-next': ui.mealsDate = D.key(D.addDays(D.parse(ui.mealsDate), 1)); renderMeals(); break;
                case 'meals-today': ui.mealsDate = D.key(); renderMeals(); break;
                case 'log-meal': logMeal(target.dataset.meal, target.dataset.slot); break;
                case 'swap-meal': {
                    const swaps = ui.swaps[ui.mealsDate] = ui.swaps[ui.mealsDate] || {};
                    swaps[target.dataset.slot] = (swaps[target.dataset.slot] || 0) + 1;
                    renderMeals();
                    break;
                }
                case 'remove-meal': S.remove(target.dataset.id); break;
                case 'delete-record':
                    if (confirm('Delete this entry?')) S.remove(target.dataset.id);
                    break;
                case 'range': ui.progressRange = Number(target.dataset.range); renderProgress(); break;
                case 'export': exportData(); break;
                case 'import': {
                    const input = document.getElementById('importFile');
                    if (input) input.click();
                    break;
                }
                case 'reset-data':
                    if (confirm('Delete ALL fitness data? Export first if you want a copy.') && confirm('Really delete everything? This syncs to every device.')) {
                        S.resetAll();
                        toast('All fitness data deleted.');
                    }
                    break;
                case 'sync-now': S.sync(); break;
                case 'forget-token':
                    if (confirm('Forget the GitHub token on this device? Your data stays in the repo and in this browser.')) {
                        S.connect('').then(function() { renderProfile(); });
                    }
                    break;
            }
        });

        main.addEventListener('submit', function(e) {
            const form = e.target;
            if (!form || !form.id) return;
            switch (form.id) {
                case 'weightForm': e.preventDefault(); saveWeight(form); break;
                case 'workoutForm': e.preventDefault(); saveWorkout(form); break;
                case 'quickMealForm': e.preventDefault(); quickAddMeal(form); break;
                case 'measurementForm': e.preventDefault(); saveMeasurement(form); break;
                case 'profileForm': e.preventDefault(); saveProfile(form); break;
                case 'tokenForm': e.preventDefault(); connectToken(form); break;
            }
        });

        main.addEventListener('input', function(e) {
            const t = e.target;
            if (t.id === 'mealSearch') {
                ui.mealSearch = t.value;
                const lib = document.getElementById('mealLibrary');
                const tt = targetsFor(profile());
                if (lib) lib.innerHTML = libraryHtml(M.scaleFactor(tt ? tt.calories : null));
            } else if (t.form && t.form.id === 'profileForm') {
                const preview = document.getElementById('targetsPreview');
                if (preview) preview.innerHTML = targetsPreviewHtml(profileFromForm(t.form));
            }
        });

        main.addEventListener('change', function(e) {
            const t = e.target;
            if (t.id === 'workoutDatePicker' && t.value) {
                ui.workoutDate = t.value;
                const diff = D.daysBetween(new Date(), D.parse(t.value));
                const todayDow = (new Date().getDay() + 6) % 7;
                const targetDow = (D.parse(t.value).getDay() + 6) % 7;
                ui.weekOffset = Math.round((diff + todayDow - targetDow) / 7);
                renderWorkouts();
                scrollToEl('workoutDetail');
            } else if (t.id === 'adhocWorkout') {
                ui.adhocWorkout = t.value;
                renderWorkouts();
                scrollToEl('workoutDetail');
            } else if (t.id === 'importFile' && t.files && t.files[0]) {
                importData(t.files[0]);
            }
        });

        main.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('workout-tile')) e.target.click();
        });
    }

    function scrollToEl(id) {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function saveWeight(form) {
        const fd = new FormData(form);
        const date = String(fd.get('date') || D.key());
        const lbs = Math.round(Number(fd.get('lbs')) * 10) / 10;
        if (!lbs) return;
        S.put('weight', 'weight-' + date, date, { lbs: lbs }, lbs + ' lb');
        toast('Logged ' + lbs + ' lb for ' + fmtShort(date));
    }

    function saveMeasurement(form) {
        const fd = new FormData(form);
        const date = String(fd.get('date') || D.key());
        const data = { waistIn: Number(fd.get('waistIn')) || null, chestIn: Number(fd.get('chestIn')) || null, hipsIn: Number(fd.get('hipsIn')) || null };
        if (!data.waistIn && !data.chestIn && !data.hipsIn) return;
        S.put('measurement', 'meas-' + date, date, data, 'Waist ' + (data.waistIn || '—') + ' in');
        toast('Measurements saved.');
    }

    async function connectToken(form) {
        const input = form.querySelector('input[name="token"]');
        const token = (input.value || '').trim();
        if (!token) { toast('Paste a token first.', true); return; }
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true; btn.textContent = 'Checking…';
        try {
            const info = await S.connect(token);
            if (info && !info.canWrite) toast('Connected, but the token cannot write to ' + info.fullName + '.', true);
            else toast('Connected to ' + (info ? info.fullName : F.api.repo()) + '.');
            renderProfile();
        } catch (err) {
            F.api.setToken('');
            toast(err.status === 404 ? 'Token works but cannot see ' + F.api.repo() + '. Check repository access.' : (err.message || 'GitHub rejected the token.'), true);
            renderProfile();
        }
    }

    function exportData() {
        const blob = new Blob([S.exportJSON()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'fitness-export-' + D.key() + '.json';
        document.body.appendChild(a);
        a.click();
        setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
    }

    function importData(file) {
        const reader = new FileReader();
        reader.onload = function() {
            try {
                const count = S.importJSON(String(reader.result));
                toast(count ? 'Imported ' + count + ' record' + (count === 1 ? '' : 's') + '.' : 'Nothing new to import.');
            } catch (e) {
                toast('That file isn’t a valid export.', true);
            }
        };
        reader.readAsText(file);
    }

    F.ui = {
        start: start,
        stop: stop,
        onPanelShown: onPanelShown,
        render: render
    };
})();
