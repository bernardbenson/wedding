/**
 * Admin Dashboard JavaScript
 * Bernard Benson & Roselyn Marilla Wedding Website
 *
 * Handles admin authentication and RSVP data display
 * Password validation is done server-side via Google Apps Script
 */

(function() {
    // ==============================================
    // CONFIGURATION
    // ==============================================

    // Configuration loaded from config.js (not tracked in git)
    const GOOGLE_SCRIPT_URL = CONFIG.GOOGLE_SCRIPT_URL;

    // Session storage keys
    const SESSION_KEY = 'wedding_admin_session';
    const PASSWORD_KEY = 'wedding_admin_pwd';

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

    // Dashboard elements
    const dashboardSection = document.getElementById('dashboardSection');
    const logoutBtn = document.getElementById('logoutBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const refreshText = document.getElementById('refreshText');
    const refreshSpinner = document.getElementById('refreshSpinner');

    // Stats elements
    const totalResponsesEl = document.getElementById('totalResponses');
    const attendingEl = document.getElementById('attending');
    const notAttendingEl = document.getElementById('notAttending');
    const totalGuestsEl = document.getElementById('totalGuests');

    // Table elements
    const rsvpTableBody = document.getElementById('rsvpTableBody');
    const emptyState = document.getElementById('emptyState');
    const errorState = document.getElementById('errorState');
    const errorMessage = document.getElementById('errorMessage');

    // ==============================================
    // INITIALIZATION
    // ==============================================

    function init() {
        // Check for existing session
        if (isLoggedIn()) {
            showDashboard();
            loadRSVPs();
        }

        // Event listeners
        loginForm.addEventListener('submit', handleLogin);
        logoutBtn.addEventListener('click', handleLogout);
        refreshBtn.addEventListener('click', loadRSVPs);
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

        // Show loading
        loginText.classList.add('hidden');
        loginSpinner.classList.remove('hidden');
        loginError.textContent = '';

        try {
            // Validate password by attempting to fetch data from Google Apps Script
            const data = await fetchRSVPData(password);

            // If we get here without error, password is valid
            setLoggedIn(password);
            showDashboard();
            displayRSVPs(data.rsvps || []);
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
            // Hide loading
            loginText.classList.remove('hidden');
            loginSpinner.classList.add('hidden');
        }
    }

    function handleLogout() {
        clearSession();
        showLogin();
        passwordInput.value = '';
    }

    function showLogin() {
        loginSection.classList.remove('hidden');
        dashboardSection.classList.add('hidden');
    }

    function showDashboard() {
        loginSection.classList.add('hidden');
        dashboardSection.classList.remove('hidden');
    }

    // ==============================================
    // DATA LOADING
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
            // Session expired, redirect to login
            clearSession();
            showLogin();
            return;
        }

        // Show loading state
        refreshText.classList.add('hidden');
        refreshSpinner.classList.remove('hidden');
        refreshBtn.disabled = true;

        try {
            const data = await fetchRSVPData(password);
            displayRSVPs(data.rsvps || []);

            // Hide error state
            errorState.classList.add('hidden');
        } catch (error) {
            console.error('Error loading RSVPs:', error);

            if (error.message === 'Invalid password') {
                // Password no longer valid, log out
                clearSession();
                showLogin();
                return;
            }

            showErrorState(error.message || 'Failed to load RSVPs. Please check your configuration.');
        } finally {
            // Hide loading state
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
            clearSession();
            showLogin();
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
            // Reload the RSVP list
            loadRSVPs();
        } catch (error) {
            console.error('Delete error:', error);
            alert('Failed to delete RSVP: ' + (error.message || 'Unknown error') + '\n\nMake sure you redeployed the Google Apps Script with the new code.');
        }
    }

    // Expose deleteRSVP to global scope for onclick handlers
    window.deleteRSVP = deleteRSVP;

    // ==============================================
    // DISPLAY FUNCTIONS
    // ==============================================

    function displayRSVPs(rsvps) {
        // Calculate statistics
        const total = rsvps.reduce((sum, r) => sum + (parseInt(r.guests) || 1), 0);
        const attendingCount = rsvps.filter(r => r.attending === 'yes').length;
        const notAttendingCount = rsvps.filter(r => r.attending === 'no').length;
        const guestCount = rsvps
            .filter(r => r.attending === 'yes')
            .reduce((sum, r) => sum + (parseInt(r.guests) || 1), 0);

        // Update stats
        totalResponsesEl.textContent = total;
        attendingEl.textContent = attendingCount;
        notAttendingEl.textContent = notAttendingCount;
        totalGuestsEl.textContent = guestCount;

        // Check for empty state
        if (total === 0) {
            rsvpTableBody.innerHTML = '';
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');

        // Build table rows
        const rows = rsvps.map((rsvp, index) => {
            const date = formatDate(rsvp.timestamp);
            const attendingClass = rsvp.attending === 'yes'
                ? 'rsvp-table__status--yes'
                : 'rsvp-table__status--no';
            const attendingText = rsvp.attending === 'yes' ? 'Yes' : 'No';
            const rowId = rsvp.id || index;

            return `
                <tr data-row-id="${rowId}">
                    <td>${escapeHtml(date)}</td>
                    <td>${escapeHtml(rsvp.name || '-')}</td>
                    <td>${escapeHtml(rsvp.email || '-')}</td>
                    <td>${escapeHtml(rsvp.phone || '-')}</td>
                    <td class="${attendingClass}">${attendingText}</td>
                    <td>${rsvp.attending === 'yes' ? escapeHtml(rsvp.guests || '1') : '-'}</td>
                    <td>${escapeHtml(rsvp.dietary || '-')}</td>
                    <td>${escapeHtml(rsvp.message || '-')}</td>
                    <td>
                        <button class="btn btn--delete" data-row-id="${rowId}" data-email="${escapeHtml(rsvp.email || '')}">Delete</button>
                    </td>
                </tr>
            `;
        }).join('');

        rsvpTableBody.innerHTML = rows;

        // Attach delete event listeners
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

        // Reset stats
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
