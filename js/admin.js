/**
 * Admin App Shell JavaScript
 * Bernard Benson & Roselyn Marilla Wedding Website
 *
 * Handles admin authentication (validated server-side via Google Apps Script),
 * the sidebar/hash router for the post-login app, and the RSVP dashboard panel.
 * The fitness panels are rendered by js/fitness/ui.js.
 */

(function() {
    // ==============================================
    // CONFIGURATION
    // ==============================================

    const GOOGLE_SCRIPT_URL = CONFIG.GOOGLE_SCRIPT_URL;

    // Session storage keys
    const SESSION_KEY = 'wedding_admin_session';
    const PASSWORD_KEY = 'wedding_admin_pwd';

    const PANELS = ['dashboard', 'workouts', 'meals', 'progress', 'profile', 'rsvp'];
    const DEFAULT_PANEL = 'dashboard';

    // ==============================================
    // DOM ELEMENTS
    // ==============================================

    // Login elements
    const loginSection = document.getElementById('loginSection');
    const loginForm = document.getElementById('loginForm');
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('loginError');
    const loginText = document.getElementById('loginText');
    const loginSpinner = document.getElementById('loginSpinner');

    // Shell elements
    const appSection = document.getElementById('appSection');
    const sidebar = document.getElementById('sidebar');
    const sidebarNav = document.getElementById('sidebarNav');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const topbarTitle = document.getElementById('topbarTitle');
    const logoutBtn = document.getElementById('logoutBtn');

    // RSVP dashboard elements
    const refreshBtn = document.getElementById('refreshBtn');
    const refreshText = document.getElementById('refreshText');
    const refreshSpinner = document.getElementById('refreshSpinner');
    const totalResponsesEl = document.getElementById('totalResponses');
    const attendingEl = document.getElementById('attending');
    const notAttendingEl = document.getElementById('notAttending');
    const totalGuestsEl = document.getElementById('totalGuests');
    const rsvpTableBody = document.getElementById('rsvpTableBody');
    const emptyState = document.getElementById('emptyState');
    const errorState = document.getElementById('errorState');
    const errorMessage = document.getElementById('errorMessage');

    let rsvpLoaded = false;
    let currentPanel = null;

    // ==============================================
    // INITIALIZATION
    // ==============================================

    function init() {
        if (isLoggedIn()) {
            showApp();
        }

        loginForm.addEventListener('submit', handleLogin);
        logoutBtn.addEventListener('click', handleLogout);
        refreshBtn.addEventListener('click', loadRSVPs);

        sidebarToggle.addEventListener('click', toggleSidebar);
        sidebarOverlay.addEventListener('click', closeSidebar);
        sidebarNav.addEventListener('click', function(e) {
            if (e.target.closest('.app-sidebar__link')) closeSidebar();
        });
        window.addEventListener('hashchange', route);
    }

    // ==============================================
    // AUTHENTICATION
    // ==============================================

    function isLoggedIn() {
        return sessionStorage.getItem(SESSION_KEY) === 'true' && getStoredPassword();
    }

    function getStoredPassword() {
        return sessionStorage.getItem(PASSWORD_KEY);
    }

    function setLoggedIn(password) {
        sessionStorage.setItem(SESSION_KEY, 'true');
        sessionStorage.setItem(PASSWORD_KEY, password);
    }

    function clearSession() {
        sessionStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(PASSWORD_KEY);
    }

    async function handleLogin(e) {
        e.preventDefault();

        const password = passwordInput.value;

        if (!password) {
            loginError.textContent = 'Please enter a password.';
            return;
        }

        loginText.classList.add('hidden');
        loginSpinner.classList.remove('hidden');
        loginError.textContent = '';

        try {
            // Validate password by attempting to fetch data from Google Apps Script
            const data = await fetchRSVPData(password);

            setLoggedIn(password);
            displayRSVPs(data.rsvps || []);
            rsvpLoaded = true;
            showApp();
        } catch (error) {
            console.error('Login error:', error);
            if (error.message === 'Invalid password') {
                loginError.textContent = 'Invalid password. Please try again.';
            } else {
                loginError.textContent = 'Error connecting to server. Please try again.';
            }
            passwordInput.value = '';
            passwordInput.focus();
        } finally {
            loginText.classList.remove('hidden');
            loginSpinner.classList.add('hidden');
        }
    }

    function handleLogout() {
        clearSession();
        if (window.Fitness && Fitness.ui) Fitness.ui.stop();
        if (window.Fitness && Fitness.store) Fitness.store.stop();
        rsvpLoaded = false;
        currentPanel = null;
        showLogin();
        passwordInput.value = '';
    }

    function showLogin() {
        loginSection.classList.remove('hidden');
        appSection.classList.add('hidden');
        closeSidebar();
    }

    function showApp() {
        loginSection.classList.add('hidden');
        appSection.classList.remove('hidden');
        if (window.Fitness && Fitness.store) Fitness.store.start();
        if (window.Fitness && Fitness.ui) Fitness.ui.start();
        route();
    }

    // Expose a tiny auth surface for the fitness module
    window.AdminAuth = {
        getPassword: getStoredPassword,
        isLoggedIn: isLoggedIn,
        logout: handleLogout
    };

    // ==============================================
    // ROUTER + SIDEBAR
    // ==============================================

    function route() {
        if (!isLoggedIn()) return;

        let name = (location.hash || '').replace('#', '');
        if (!PANELS.includes(name)) {
            name = DEFAULT_PANEL;
            if (location.hash !== '#' + name) {
                history.replaceState(null, '', '#' + name);
            }
        }

        showPanel(name);
    }

    function showPanel(name) {
        document.querySelectorAll('.app-panel').forEach(function(panel) {
            panel.classList.toggle('app-panel--active', panel.id === 'panel-' + name);
        });

        document.querySelectorAll('.app-sidebar__link').forEach(function(link) {
            link.classList.toggle('app-sidebar__link--active', link.dataset.panel === name);
        });

        const panel = document.getElementById('panel-' + name);
        topbarTitle.textContent = panel ? panel.dataset.title : 'Admin';

        const previous = currentPanel;
        currentPanel = name;

        if (name === 'rsvp' && !rsvpLoaded) {
            loadRSVPs();
        }

        if (window.Fitness && Fitness.ui && name !== 'rsvp') {
            Fitness.ui.onPanelShown(name, previous);
        }

        window.scrollTo(0, 0);
    }

    function toggleSidebar() {
        const open = !sidebar.classList.contains('app-sidebar--open');
        sidebar.classList.toggle('app-sidebar--open', open);
        sidebarOverlay.classList.toggle('app-overlay--visible', open);
        sidebarToggle.setAttribute('aria-expanded', String(open));
    }

    function closeSidebar() {
        sidebar.classList.remove('app-sidebar--open');
        sidebarOverlay.classList.remove('app-overlay--visible');
        sidebarToggle.setAttribute('aria-expanded', 'false');
    }

    // ==============================================
    // RSVP DATA LOADING
    // ==============================================

    async function fetchRSVPData(password) {
        const url = `${GOOGLE_SCRIPT_URL}?password=${encodeURIComponent(password)}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        return data;
    }

    async function loadRSVPs() {
        const password = getStoredPassword();

        if (!password) {
            handleLogout();
            return;
        }

        refreshText.classList.add('hidden');
        refreshSpinner.classList.remove('hidden');
        refreshBtn.disabled = true;

        try {
            const data = await fetchRSVPData(password);
            displayRSVPs(data.rsvps || []);
            rsvpLoaded = true;
            errorState.classList.add('hidden');
        } catch (error) {
            console.error('Error loading RSVPs:', error);

            if (error.message === 'Invalid password') {
                handleLogout();
                return;
            }

            showErrorState(error.message || 'Failed to load RSVPs. Please check your configuration.');
        } finally {
            refreshText.classList.remove('hidden');
            refreshSpinner.classList.add('hidden');
            refreshBtn.disabled = false;
        }
    }

    // ==============================================
    // DELETE FUNCTION
    // ==============================================

    async function deleteRSVP(rowId, email) {
        const confirmDelete = confirm(`Are you sure you want to delete the RSVP for "${email || 'this guest'}"?`);

        if (!confirmDelete) return;

        const password = getStoredPassword();
        if (!password) {
            handleLogout();
            return;
        }

        try {
            // Use GET request with query params and follow redirects
            const url = `${GOOGLE_SCRIPT_URL}?password=${encodeURIComponent(password)}&action=delete&rowId=${encodeURIComponent(rowId)}`;
            const response = await fetch(url, {
                method: 'GET',
                redirect: 'follow'
            });

            if (!response.ok) {
                throw new Error('Server returned ' + response.status);
            }

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            alert('RSVP deleted successfully');
            loadRSVPs();
        } catch (error) {
            console.error('Delete error:', error);
            alert('Failed to delete RSVP: ' + (error.message || 'Unknown error') + '\n\nMake sure you redeployed the Google Apps Script with the new code.');
        }
    }

    window.deleteRSVP = deleteRSVP;

    // ==============================================
    // RSVP DISPLAY FUNCTIONS
    // ==============================================

    function displayRSVPs(rsvps) {
        const totalResponses = rsvps.length;
        const attendingCount = rsvps.filter(r => r.attending === 'yes').length;
        const notAttendingCount = rsvps.filter(r => r.attending === 'no').length;

        // Total guests: for each attending RSVP, 1 (self) + plusOne (0 or 1) + kids (0-n)
        const guestCount = rsvps
            .filter(r => r.attending === 'yes')
            .reduce((sum, r) => {
                const plusOne = r.plusOne === 'yes' ? 1 : 0;
                const kids = parseInt(r.kids) || 0;
                const rowTotal = r.guests ? parseInt(r.guests) : (1 + plusOne + kids);
                return sum + rowTotal;
            }, 0);

        totalResponsesEl.textContent = totalResponses;
        attendingEl.textContent = attendingCount;
        notAttendingEl.textContent = notAttendingCount;
        totalGuestsEl.textContent = guestCount;

        if (totalResponses === 0) {
            rsvpTableBody.innerHTML = '';
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');

        const rows = rsvps.map((rsvp, index) => {
            const date = formatDate(rsvp.timestamp);
            const attendingClass = rsvp.attending === 'yes'
                ? 'rsvp-table__status--yes'
                : 'rsvp-table__status--no';
            const attendingText = rsvp.attending === 'yes' ? 'Yes' : 'No';
            const rowId = rsvp.id || index;

            let plusOneText = '-';
            let kidsText = '-';
            let totalText = '-';

            if (rsvp.attending === 'yes') {
                plusOneText = rsvp.plusOne ? (rsvp.plusOne === 'yes' ? 'Yes' : 'No') : '-';
                kidsText = rsvp.kids !== undefined && rsvp.kids !== null ? String(rsvp.kids) : '-';
                const plusOneVal = rsvp.plusOne === 'yes' ? 1 : 0;
                const kidsVal = parseInt(rsvp.kids) || 0;
                totalText = rsvp.guests ? String(rsvp.guests) : String(1 + plusOneVal + kidsVal);
            }

            return `
                <tr data-row-id="${rowId}">
                    <td>${escapeHtml(date)}</td>
                    <td>${escapeHtml(rsvp.name || '-')}</td>
                    <td>${escapeHtml(rsvp.email || '-')}</td>
                    <td>${escapeHtml(rsvp.phone || '-')}</td>
                    <td class="${attendingClass}">${attendingText}</td>
                    <td>${plusOneText}</td>
                    <td>${kidsText}</td>
                    <td>${totalText}</td>
                    <td>${escapeHtml(rsvp.message || '-')}</td>
                    <td>
                        <button class="btn btn--delete" data-row-id="${rowId}" data-email="${escapeHtml(rsvp.email || '')}">Delete</button>
                    </td>
                </tr>
            `;
        }).join('');

        rsvpTableBody.innerHTML = rows;

        rsvpTableBody.querySelectorAll('.btn--delete').forEach(btn => {
            btn.addEventListener('click', function() {
                const rowId = this.getAttribute('data-row-id');
                const email = this.getAttribute('data-email');
                deleteRSVP(rowId, email);
            });
        });
    }

    function showErrorState(message) {
        errorMessage.textContent = message;
        errorState.classList.remove('hidden');
        emptyState.classList.add('hidden');
        rsvpTableBody.innerHTML = '';

        totalResponsesEl.textContent = '-';
        attendingEl.textContent = '-';
        notAttendingEl.textContent = '-';
        totalGuestsEl.textContent = '-';
    }

    // ==============================================
    // UTILITY FUNCTIONS
    // ==============================================

    function formatDate(timestamp) {
        if (!timestamp) return '-';
        try {
            const date = new Date(timestamp);
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
            });
        } catch (e) {
            return timestamp;
        }
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ==============================================
    // START
    // ==============================================
    init();
})();
