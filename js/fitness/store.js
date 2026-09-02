/**
 * Fitness store — local cache + offline queue + GitHub sync
 *
 * Records: { id, type, date, updatedAt, deleted, summary, data }
 * Files (in the data repo): profile.json, weights.json, measurements.json,
 *   workouts/YYYY-MM.json, meals/YYYY-MM.json — each { records: [...] }.
 * Merge rule: last-write-wins by updatedAt; deletions are tombstones.
 */
(function() {
    const F = window.Fitness = window.Fitness || {};

    const CACHE_KEY = 'fitness_cache_v1';
    const QUEUE_KEY = 'fitness_queue_v1';
    const RETRY_MS = 30000;
    const RESYNC_AFTER_MS = 60000;

    let records = {};        // id -> record
    let fileShas = {};       // path -> blob sha last seen/written
    let queue = new Set();   // ids with unsynced changes
    let lastSyncAt = 0;

    let status = 'idle';
    let statusMessage = '';
    let inflight = false;
    let pendingSync = false;
    let retryTimer = null;
    let flushTimer = null;
    let started = false;

    const listeners = { change: [], status: [] };

    // ---------- pub/sub ----------

    function on(event, fn) {
        (listeners[event] || (listeners[event] = [])).push(fn);
        return function() { off(event, fn); };
    }

    function off(event, fn) {
        listeners[event] = (listeners[event] || []).filter(function(f) { return f !== fn; });
    }

    function emit(event, payload) {
        (listeners[event] || []).slice().forEach(function(fn) {
            try { fn(payload); } catch (e) { console.error('Fitness store listener error', e); }
        });
    }

    function setStatus(next, message) {
        status = next;
        statusMessage = message || '';
        emit('status', getStatus());
    }

    function getStatus() {
        return { status: status, message: statusMessage, pending: queue.size, lastSyncAt: lastSyncAt, hasToken: F.api.hasToken() };
    }

    // ---------- persistence ----------

    function loadCache() {
        try {
            const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
            if (cache && cache.records) {
                records = cache.records;
                fileShas = cache.fileShas || {};
                lastSyncAt = cache.lastSyncAt || 0;
            }
            const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
            queue = new Set(Array.isArray(q) ? q : []);
        } catch (e) {
            records = {}; fileShas = {}; queue = new Set(); lastSyncAt = 0;
        }
    }

    function saveCache() {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ records: records, fileShas: fileShas, lastSyncAt: lastSyncAt }));
            localStorage.setItem(QUEUE_KEY, JSON.stringify(Array.from(queue)));
        } catch (e) {
            console.warn('Fitness cache not saved', e);
        }
    }

    // ---------- record helpers ----------

    function fileFor(rec) {
        const month = String(rec.date || '').slice(0, 7) || 'undated';
        switch (rec.type) {
            case 'profile': return 'profile.json';
            case 'weight': return 'weights.json';
            case 'measurement': return 'measurements.json';
            case 'workout': return 'workouts/' + month + '.json';
            case 'meal': return 'meals/' + month + '.json';
            default: return 'other/' + rec.type + '.json';
        }
    }

    function recordsForFile(path) {
        return Object.values(records)
            .filter(function(r) { return fileFor(r) === path; })
            .sort(function(a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    }

    function normalize(r) {
        if (!r || !r.id || !r.type) return null;
        return {
            id: String(r.id),
            type: String(r.type),
            date: r.date ? String(r.date) : '',
            updatedAt: Number(r.updatedAt) || 0,
            deleted: r.deleted ? 1 : 0,
            summary: r.summary ? String(r.summary) : '',
            data: r.data === undefined ? null : r.data
        };
    }

    /** Merge a list of remote/imported records. Returns true when anything changed. */
    function merge(list) {
        let changed = false;
        (list || []).forEach(function(raw) {
            const rec = normalize(raw);
            if (!rec) return;
            const local = records[rec.id];
            if (!local || rec.updatedAt > local.updatedAt) {
                records[rec.id] = rec;
                changed = true;
            }
        });
        return changed;
    }

    // ---------- public read API ----------

    function get(id) {
        const r = records[id];
        return r && !r.deleted ? r : null;
    }

    function all(type) {
        return Object.values(records)
            .filter(function(r) { return !r.deleted && (!type || r.type === type); })
            .sort(function(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.id < b.id ? -1 : 1); });
    }

    function byDate(type, date) {
        return all(type).filter(function(r) { return r.date === date; });
    }

    // ---------- public write API ----------

    function put(type, id, date, data, summary) {
        const rec = {
            id: String(id),
            type: type,
            date: date || '',
            updatedAt: Date.now(),
            deleted: 0,
            summary: summary || '',
            data: data
        };
        records[rec.id] = rec;
        queue.add(rec.id);
        saveCache();
        emit('change', { type: type, id: rec.id });
        scheduleFlush();
        return rec;
    }

    function remove(id) {
        const rec = records[id];
        if (!rec) return;
        rec.deleted = 1;
        rec.updatedAt = Date.now();
        queue.add(rec.id);
        saveCache();
        emit('change', { type: rec.type, id: rec.id });
        scheduleFlush();
    }

    function scheduleFlush() {
        clearTimeout(flushTimer);
        flushTimer = setTimeout(function() { sync({ pull: false }); }, 800);
    }

    // ---------- sync ----------

    async function sync(opts) {
        opts = opts || {};
        if (!started) return;
        if (!F.api.hasToken()) { setStatus('auth', 'No GitHub token on this device yet.'); return; }
        if (inflight) { pendingSync = true; return; }

        inflight = true;
        clearTimeout(retryTimer);
        setStatus('syncing');

        try {
            if (opts.pull !== false) await pull();
            await flush();
            lastSyncAt = Date.now();
            saveCache();
            setStatus('synced');
        } catch (err) {
            handleSyncError(err);
        } finally {
            inflight = false;
            if (pendingSync) { pendingSync = false; sync({ pull: false }); }
        }
    }

    async function pull() {
        const tree = await F.api.listTree();
        let changed = false;

        // Forget shas of files that no longer exist remotely
        Object.keys(fileShas).forEach(function(path) {
            if (!tree[path]) delete fileShas[path];
        });

        const paths = Object.keys(tree).filter(function(path) { return fileShas[path] !== tree[path]; });
        for (const path of paths) {
            const file = await F.api.readFile(path);
            if (!file) continue;
            let parsed = null;
            try { parsed = JSON.parse(file.text); } catch (e) { console.warn('Bad JSON in', path); continue; }
            if (parsed && Array.isArray(parsed.records) && merge(parsed.records)) changed = true;
            fileShas[path] = file.sha;
        }

        if (changed) {
            saveCache();
            emit('change', { type: '*', id: null });
        }
    }

    async function flush() {
        if (queue.size === 0) return;

        const byPath = {};
        Array.from(queue).forEach(function(id) {
            const rec = records[id];
            if (!rec) { queue.delete(id); return; }
            const path = fileFor(rec);
            (byPath[path] = byPath[path] || []).push(rec);
        });

        for (const path of Object.keys(byPath)) {
            await writePath(path, byPath[path], true);
            byPath[path].forEach(function(rec) { queue.delete(rec.id); });
            saveCache();
        }
        emit('status', getStatus());
    }

    async function writePath(path, changedRecs, allowRetry) {
        const text = JSON.stringify({ records: recordsForFile(path) }, null, 2) + '\n';
        const message = commitMessage(path, changedRecs);
        try {
            const result = await F.api.writeFile(path, text, fileShas[path], message);
            if (result.sha) fileShas[path] = result.sha;
        } catch (err) {
            if (allowRetry && F.api.isConflict(err)) {
                // Someone else wrote this file: pull it, merge, and retry once.
                const file = await F.api.readFile(path);
                if (file) {
                    try {
                        const parsed = JSON.parse(file.text);
                        if (parsed && Array.isArray(parsed.records) && merge(parsed.records)) {
                            emit('change', { type: '*', id: null });
                        }
                    } catch (e) { /* ignore bad remote JSON, overwrite */ }
                    fileShas[path] = file.sha;
                } else {
                    delete fileShas[path];
                }
                return writePath(path, changedRecs, false);
            }
            throw err;
        }
    }

    function commitMessage(path, recs) {
        const summaries = recs.map(function(r) { return r.deleted ? ('remove ' + r.id) : (r.summary || r.id); });
        let msg = summaries.join('; ');
        if (msg.length > 60) msg = msg.slice(0, 57) + '...';
        return path + ': ' + msg;
    }

    function handleSyncError(err) {
        console.error('Fitness sync error', err);
        if (F.api.isAuthError(err)) {
            setStatus('auth', err.status === 404 ? 'Token cannot see the data repo' : 'GitHub token rejected');
            return;
        }
        if (F.api.isNetworkError(err) || !navigator.onLine) {
            setStatus('offline', 'Offline — changes are queued');
        } else {
            setStatus('error', err.message || 'Sync failed');
        }
        clearTimeout(retryTimer);
        retryTimer = setTimeout(function() { sync(); }, RETRY_MS);
    }

    // ---------- lifecycle ----------

    function onOnline() { sync(); }

    function onVisibility() {
        if (document.visibilityState === 'visible' && Date.now() - lastSyncAt > RESYNC_AFTER_MS) sync();
    }

    function start() {
        if (started) return;
        started = true;
        loadCache();
        window.addEventListener('online', onOnline);
        document.addEventListener('visibilitychange', onVisibility);
        emit('change', { type: '*', id: null });
        if (F.api.hasToken()) sync();
        else setStatus('auth', 'No GitHub token on this device yet.');
    }

    function stop() {
        started = false;
        window.removeEventListener('online', onOnline);
        document.removeEventListener('visibilitychange', onVisibility);
        clearTimeout(retryTimer);
        clearTimeout(flushTimer);
        inflight = false;
        pendingSync = false;
        setStatus('idle');
    }

    // ---------- token management ----------

    async function connect(token) {
        F.api.setToken(token);
        if (!token) {
            fileShas = {};
            saveCache();
            setStatus('auth', 'Token removed from this device');
            return null;
        }
        // Force a full re-read of every file with the new credentials
        fileShas = {};
        saveCache();
        const info = await F.api.checkAccess();
        await sync();
        return info;
    }

    // ---------- export / import ----------

    function exportJSON() {
        return JSON.stringify({
            exportedAt: new Date().toISOString(),
            repo: F.api.repo(),
            records: Object.values(records)
        }, null, 2);
    }

    function importJSON(text) {
        const parsed = JSON.parse(text);
        const list = Array.isArray(parsed) ? parsed : (parsed && parsed.records) || [];
        let count = 0;
        list.forEach(function(raw) {
            const rec = normalize(raw);
            if (!rec) return;
            const local = records[rec.id];
            if (!local || rec.updatedAt > local.updatedAt) {
                records[rec.id] = rec;
                queue.add(rec.id);
                count++;
            }
        });
        saveCache();
        if (count) {
            emit('change', { type: '*', id: null });
            scheduleFlush();
        }
        return count;
    }

    /** Wipe every record (tombstones everything) — used by the "reset all data" action. */
    function resetAll() {
        Object.values(records).forEach(function(rec) {
            if (!rec.deleted) {
                rec.deleted = 1;
                rec.updatedAt = Date.now();
                queue.add(rec.id);
            }
        });
        saveCache();
        emit('change', { type: '*', id: null });
        scheduleFlush();
    }

    F.store = {
        start: start,
        stop: stop,
        on: on,
        off: off,
        get: get,
        all: all,
        byDate: byDate,
        put: put,
        remove: remove,
        sync: sync,
        connect: connect,
        getStatus: getStatus,
        exportJSON: exportJSON,
        importJSON: importJSON,
        resetAll: resetAll,
        fileFor: fileFor
    };
})();
