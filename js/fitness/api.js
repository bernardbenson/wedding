/**
 * Fitness data API — GitHub Contents API client
 *
 * Reads and writes JSON files in a private GitHub repo (CONFIG.FITNESS_REPO)
 * using a fine-grained personal access token scoped to that one repo.
 * The token is stored per device in localStorage and never committed.
 */
(function() {
    const F = window.Fitness = window.Fitness || {};

    const TOKEN_KEY = 'fitness_gh_token';
    const API_BASE = 'https://api.github.com';

    let defaultBranch = null;

    class ApiError extends Error {
        constructor(message, status) {
            super(message);
            this.name = 'ApiError';
            this.status = status;
        }
    }

    function repo() {
        const cfg = typeof CONFIG !== 'undefined' ? CONFIG : {};
        return String(cfg.FITNESS_REPO || '').trim().replace(/^\/+|\/+$/g, '');
    }

    function getToken() {
        try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
    }

    function setToken(token) {
        try {
            if (token) localStorage.setItem(TOKEN_KEY, token.trim());
            else localStorage.removeItem(TOKEN_KEY);
        } catch (e) { /* storage unavailable */ }
        defaultBranch = null;
    }

    function hasToken() {
        return Boolean(getToken());
    }

    // ---------- low-level request ----------

    async function request(method, path, body, opts) {
        opts = opts || {};
        const token = getToken();
        if (!token) throw new ApiError('No GitHub token on this device', 401);
        if (!repo()) throw new ApiError('CONFIG.FITNESS_REPO is not set', 0);

        const headers = {
            'Authorization': 'Bearer ' + token,
            'Accept': opts.accept || 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        };
        if (body) headers['Content-Type'] = 'application/json';

        const response = await fetch(API_BASE + path, {
            method: method,
            headers: headers,
            body: body ? JSON.stringify(body) : undefined,
            cache: 'no-store'
        });

        if (response.status === 404 && opts.allow404) return null;
        if (response.status === 409 && opts.allow409) return null;

        if (!response.ok) {
            let message = '';
            try { message = (await response.json()).message || ''; } catch (e) { /* ignore */ }
            throw new ApiError(message || ('GitHub responded ' + response.status), response.status);
        }

        if (response.status === 204) return null;
        return response.json();
    }

    // ---------- helpers ----------

    function utf8ToBase64(str) {
        const bytes = new TextEncoder().encode(str);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    }

    function base64ToUtf8(b64) {
        const binary = atob(b64.replace(/\n/g, ''));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    }

    // ---------- public operations ----------

    /** Verify the token can see the repo. Returns { fullName, defaultBranch, canWrite }. */
    async function checkAccess() {
        const info = await request('GET', '/repos/' + repo());
        defaultBranch = info.default_branch || 'main';
        return {
            fullName: info.full_name,
            defaultBranch: defaultBranch,
            isPrivate: Boolean(info.private),
            canWrite: Boolean(info.permissions && (info.permissions.push || info.permissions.admin))
        };
    }

    async function branch() {
        if (!defaultBranch) {
            try { await checkAccess(); } catch (e) { defaultBranch = 'main'; if (e.status === 401 || e.status === 403 || e.status === 404) throw e; }
        }
        return defaultBranch;
    }

    /** Map of path -> blob sha for every .json file in the repo. Empty repo -> {}. */
    async function listTree() {
        const ref = await branch();
        const tree = await request('GET', '/repos/' + repo() + '/git/trees/' + encodeURIComponent(ref) + '?recursive=1', null, { allow404: true, allow409: true });
        const files = {};
        if (tree && Array.isArray(tree.tree)) {
            tree.tree.forEach(function(entry) {
                if (entry.type === 'blob' && /\.json$/.test(entry.path)) files[entry.path] = entry.sha;
            });
        }
        return files;
    }

    /** Returns { sha, text } or null when the file does not exist. */
    async function readFile(path) {
        const ref = await branch();
        const data = await request('GET', '/repos/' + repo() + '/contents/' + encodePath(path) + '?ref=' + encodeURIComponent(ref), null, { allow404: true });
        if (!data) return null;
        return { sha: data.sha, text: base64ToUtf8(data.content || '') };
    }

    /** Create or update a file. Pass the current sha when updating. Returns { sha }. */
    async function writeFile(path, text, sha, message) {
        const ref = await branch();
        const body = {
            message: message || ('Update ' + path),
            content: utf8ToBase64(text),
            branch: ref
        };
        if (sha) body.sha = sha;
        const data = await request('PUT', '/repos/' + repo() + '/contents/' + encodePath(path), body);
        return { sha: data && data.content ? data.content.sha : null };
    }

    function encodePath(path) {
        return path.split('/').map(encodeURIComponent).join('/');
    }

    function isAuthError(err) {
        return err && (err.status === 401 || err.status === 403 || err.status === 404) && err.name === 'ApiError';
    }

    function isConflict(err) {
        return err && err.name === 'ApiError' && (err.status === 409 || err.status === 422);
    }

    function isNetworkError(err) {
        return err instanceof TypeError || (err && err.name === 'ApiError' && err.status === 0);
    }

    F.api = {
        ApiError: ApiError,
        repo: repo,
        getToken: getToken,
        setToken: setToken,
        hasToken: hasToken,
        checkAccess: checkAccess,
        listTree: listTree,
        readFile: readFile,
        writeFile: writeFile,
        isAuthError: isAuthError,
        isConflict: isConflict,
        isNetworkError: isNetworkError
    };
})();
