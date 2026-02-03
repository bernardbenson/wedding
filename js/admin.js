/**
 * Admin Dashboard JavaScript
 * Bernard Benson & Roselyn Marilla Wedding Website
 *
 * Handles admin authentication and RSVP data display
 */

(function() {
    // ==============================================
    // CONFIGURATION
    // ==============================================

    // Replace this URL with your deployed Google Apps Script web app URL
    const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwQRbEMsrPBDqizEoJitC7_MqNRnnASjvmoQbDdxA8i8aDcHlGEFlPnBDzW3_RdmYA7MA/exec';

    // Admin password (in production, this should be validated server-side)
    // This is a simple client-side check; the real security is in the Apps Script
    const ADMIN_PASSWORD = 'wedding2026';

    // Session storage key
    const SESSION_KEY = 'wedding_admin_session';

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
        return sessionStorage.getItem(SESSION_KEY) === 'true';
    }

    function setLoggedIn(value) {
        if (value) {
            sessionStorage.setItem(SESSION_KEY, 'true');
        } else {
            sessionStorage.removeItem(SESSION_KEY);
        }
    }

    async function handleLogin(e) {
        e.preventDefault();

        const password = passwordInput.value;

        // Show loading
        loginText.classList.add('hidden');
        loginSpinner.classList.remove('hidden');
        loginError.textContent = '';

        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 500));

        // Validate password
        if (password === ADMIN_PASSWORD) {
            setLoggedIn(true);
            showDashboard();
            loadRSVPs();
        } else {
            loginError.textContent = 'Invalid password. Please try again.';
            passwordInput.value = '';
            passwordInput.focus();
        }

        // Hide loading
        loginText.classList.remove('hidden');
        loginSpinner.classList.add('hidden');
    }

    function handleLogout() {
        setLoggedIn(false);
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

    async function loadRSVPs() {
        // Show loading state
        refreshText.classList.add('hidden');
        refreshSpinner.classList.remove('hidden');
        refreshBtn.disabled = true;

        try {
            // Check if Google Script URL is configured
            if (GOOGLE_SCRIPT_URL === 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE') {
                // Demo mode - use sample data
                console.log('Demo mode - using sample data');
                await new Promise(resolve => setTimeout(resolve, 1000));
                const sampleData = getSampleData();
                displayRSVPs(sampleData);
            } else {
                // Fetch from Google Sheets
                const url = `${GOOGLE_SCRIPT_URL}?password=${encodeURIComponent(ADMIN_PASSWORD)}`;
                const response = await fetch(url);
                const data = await response.json();

                if (data.error) {
                    throw new Error(data.error);
                }

                displayRSVPs(data.rsvps || []);
            }

            // Hide error state
            errorState.classList.add('hidden');
        } catch (error) {
            console.error('Error loading RSVPs:', error);
            showErrorState(error.message || 'Failed to load RSVPs. Please check your configuration.');
        } finally {
            // Hide loading state
            refreshText.classList.remove('hidden');
            refreshSpinner.classList.add('hidden');
            refreshBtn.disabled = false;
        }
    }

    // ==============================================
    // DISPLAY FUNCTIONS
    // ==============================================

    function displayRSVPs(rsvps) {
        // Calculate statistics
        const total = rsvps.length;
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
        const rows = rsvps.map(rsvp => {
            const date = formatDate(rsvp.timestamp);
            const attendingClass = rsvp.attending === 'yes'
                ? 'rsvp-table__status--yes'
                : 'rsvp-table__status--no';
            const attendingText = rsvp.attending === 'yes' ? 'Yes' : 'No';

            return `
                <tr>
                    <td>${escapeHtml(date)}</td>
                    <td>${escapeHtml(rsvp.name || '-')}</td>
                    <td>${escapeHtml(rsvp.email || '-')}</td>
                    <td class="${attendingClass}">${attendingText}</td>
                    <td>${rsvp.attending === 'yes' ? escapeHtml(rsvp.guests || '1') : '-'}</td>
                    <td>${escapeHtml(rsvp.dietary || '-')}</td>
                    <td>${escapeHtml(rsvp.message || '-')}</td>
                </tr>
            `;
        }).join('');

        rsvpTableBody.innerHTML = rows;
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

    // Sample data for demo mode
    function getSampleData() {
        return [
            {
                timestamp: new Date().toISOString(),
                name: 'John Smith',
                email: 'john@example.com',
                attending: 'yes',
                guests: '2',
                dietary: 'None',
                message: 'Congratulations! So excited for you both!'
            },
            {
                timestamp: new Date(Date.now() - 86400000).toISOString(),
                name: 'Sarah Johnson',
                email: 'sarah@example.com',
                attending: 'yes',
                guests: '1',
                dietary: 'Vegetarian',
                message: 'Can\'t wait to celebrate with you!'
            },
            {
                timestamp: new Date(Date.now() - 172800000).toISOString(),
                name: 'Mike Davis',
                email: 'mike@example.com',
                attending: 'no',
                guests: '0',
                dietary: '',
                message: 'Sorry we can\'t make it. Wishing you all the best!'
            },
            {
                timestamp: new Date(Date.now() - 259200000).toISOString(),
                name: 'Emily Wilson',
                email: 'emily@example.com',
                attending: 'yes',
                guests: '3',
                dietary: 'Gluten-free',
                message: 'The whole family is coming!'
            }
        ];
    }

    // ==============================================
    // START
    // ==============================================
    init();
})();
