/**
 * RSVP Form JavaScript
 * Bernard Benson & Roselyn Marilla Wedding Website
 *
 * Handles form validation and submission to Google Sheets via Apps Script
 */

(function() {
    // ==============================================
    // CONFIGURATION
    // ==============================================

    // Configuration loaded from config.js (not tracked in git)
    const GOOGLE_SCRIPT_URL = CONFIG.GOOGLE_SCRIPT_URL;

    // ==============================================
    // DOM ELEMENTS
    // ==============================================
    const form = document.getElementById('rsvpForm');
    const submitBtn = document.getElementById('submitBtn');
    const submitText = document.getElementById('submitText');
    const submitSpinner = document.getElementById('submitSpinner');
    const formMessage = document.getElementById('formMessage');
    const successMessage = document.getElementById('successMessage');

    // Form fields
    const nameInput = document.getElementById('name');
    const emailInput = document.getElementById('email');
    const phoneInput = document.getElementById('phone');
    const attendingInputs = document.querySelectorAll('input[name="attending"]');
    const guestsGroup = document.getElementById('guestsGroup');
    const dietaryGroup = document.getElementById('dietaryGroup');

    // Error elements
    const nameError = document.getElementById('nameError');
    const emailError = document.getElementById('emailError');
    const phoneError = document.getElementById('phoneError');
    const attendingError = document.getElementById('attendingError');

    // Exit if form doesn't exist
    if (!form) return;

    // ==============================================
    // EVENT LISTENERS
    // ==============================================

    // Toggle guest/dietary fields based on attendance
    attendingInputs.forEach(input => {
        input.addEventListener('change', function() {
            const isAttending = this.value === 'yes';
            guestsGroup.style.display = isAttending ? 'block' : 'none';
            dietaryGroup.style.display = isAttending ? 'block' : 'none';
        });
    });

    // Clear error on input
    nameInput.addEventListener('input', () => clearError(nameError));
    emailInput.addEventListener('input', () => clearError(emailError));
    phoneInput.addEventListener('input', () => clearError(phoneError));
    attendingInputs.forEach(input => {
        input.addEventListener('change', () => clearError(attendingError));
    });

    // Form submission
    form.addEventListener('submit', handleSubmit);

    // ==============================================
    // FORM HANDLING
    // ==============================================

    async function handleSubmit(e) {
        e.preventDefault();

        // Validate form
        if (!validateForm()) {
            return;
        }

        // Show loading state
        setLoading(true);

        // Gather form data
        const formData = {
            name: nameInput.value.trim(),
            email: emailInput.value.trim(),
            phone: phoneInput.value.trim(),
            attending: document.querySelector('input[name="attending"]:checked').value,
            guests: document.getElementById('guests').value,
            dietary: document.getElementById('dietary').value.trim(),
            message: document.getElementById('message').value.trim(),
            timestamp: new Date().toISOString()
        };

        try {
            // Check if Google Script URL is configured
            if (GOOGLE_SCRIPT_URL === 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE') {
                // Demo mode - simulate success
                console.log('Demo mode - RSVP data:', formData);
                await simulateSubmission();
                showSuccess();
            } else {
                // Submit to Google Sheets
                const response = await fetch(GOOGLE_SCRIPT_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(formData)
                });

                // Since we're using no-cors, we can't read the response
                // Assume success if no error was thrown
                showSuccess();
            }
        } catch (error) {
            console.error('Submission error:', error);
            showError('There was an error submitting your RSVP. Please try again or contact us directly.');
        } finally {
            setLoading(false);
        }
    }

    // ==============================================
    // VALIDATION
    // ==============================================

    function validateForm() {
        let isValid = true;

        // Validate name
        if (!nameInput.value.trim()) {
            showFieldError(nameError, 'Please enter your name');
            isValid = false;
        }

        // Validate email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailInput.value.trim()) {
            showFieldError(emailError, 'Please enter your email address');
            isValid = false;
        } else if (!emailRegex.test(emailInput.value.trim())) {
            showFieldError(emailError, 'Please enter a valid email address');
            isValid = false;
        }

        // Validate phone
        if (!phoneInput.value.trim()) {
            showFieldError(phoneError, 'Please enter your phone number');
            isValid = false;
        }

        // Validate attending selection
        const attendingSelected = document.querySelector('input[name="attending"]:checked');
        if (!attendingSelected) {
            showFieldError(attendingError, 'Please select your attendance');
            isValid = false;
        }

        return isValid;
    }

    // ==============================================
    // UI HELPERS
    // ==============================================

    function setLoading(loading) {
        submitBtn.disabled = loading;
        submitText.classList.toggle('hidden', loading);
        submitSpinner.classList.toggle('hidden', !loading);
    }

    function showFieldError(errorElement, message) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }

    function clearError(errorElement) {
        errorElement.textContent = '';
        errorElement.style.display = 'none';
    }

    function showError(message) {
        formMessage.textContent = message;
        formMessage.className = 'form__error';
        formMessage.style.display = 'block';
        formMessage.style.textAlign = 'center';
        formMessage.style.marginTop = '1rem';
    }

    function showSuccess() {
        form.classList.add('hidden');
        successMessage.classList.remove('hidden');

        // Scroll to success message
        successMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Simulate submission delay for demo mode
    function simulateSubmission() {
        return new Promise(resolve => setTimeout(resolve, 1500));
    }
})();
