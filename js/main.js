/**
 * Main JavaScript for Wedding Website
 * Bernard Benson & Roselyn Marilla
 */

// ==============================================
// COUNTDOWN TIMER
// ==============================================
const weddingDate = new Date('May 18, 2026 17:00:00').getTime();

function updateCountdown() {
    const now = new Date().getTime();
    const distance = weddingDate - now;

    // Calculate time units
    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    // Update DOM elements
    const daysEl = document.getElementById('days');
    const hoursEl = document.getElementById('hours');
    const minutesEl = document.getElementById('minutes');
    const secondsEl = document.getElementById('seconds');

    if (daysEl && hoursEl && minutesEl && secondsEl) {
        if (distance > 0) {
            daysEl.textContent = days;
            hoursEl.textContent = hours.toString().padStart(2, '0');
            minutesEl.textContent = minutes.toString().padStart(2, '0');
            secondsEl.textContent = seconds.toString().padStart(2, '0');
        } else {
            // Wedding day has passed
            daysEl.textContent = '0';
            hoursEl.textContent = '00';
            minutesEl.textContent = '00';
            secondsEl.textContent = '00';
        }
    }
}

// Initialize countdown
if (document.getElementById('countdown')) {
    updateCountdown();
    setInterval(updateCountdown, 1000);
}

// ==============================================
// MOBILE NAVIGATION
// ==============================================
const navToggle = document.getElementById('navToggle');
const navMenu = document.getElementById('navMenu');
const navOverlay = document.getElementById('navOverlay');

function openNav() {
    navMenu.classList.add('nav-menu--open');
    navOverlay.classList.add('nav-overlay--visible');
    document.body.style.overflow = 'hidden';
}

function closeNav() {
    navMenu.classList.remove('nav-menu--open');
    navOverlay.classList.remove('nav-overlay--visible');
    document.body.style.overflow = '';
}

if (navToggle) {
    navToggle.addEventListener('click', () => {
        if (navMenu.classList.contains('nav-menu--open')) {
            closeNav();
        } else {
            openNav();
        }
    });
}

if (navOverlay) {
    navOverlay.addEventListener('click', closeNav);
}

// Close nav on link click (mobile)
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', closeNav);
});

// ==============================================
// NAVBAR SCROLL BEHAVIOR
// ==============================================
const navbar = document.getElementById('navbar');

function handleScroll() {
    if (!navbar) return;

    const hero = document.getElementById('hero');
    const scrollPosition = window.scrollY;

    // If there's a hero section, handle transparency
    if (hero) {
        const heroHeight = hero.offsetHeight;
        if (scrollPosition > heroHeight - 100) {
            navbar.classList.remove('navbar--transparent');
        } else {
            navbar.classList.add('navbar--transparent');
        }
    }
}

// Check if we're on the home page (has hero section)
if (document.getElementById('hero')) {
    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Initial check
} else {
    // On other pages, remove transparent class immediately
    if (navbar) {
        navbar.classList.remove('navbar--transparent');
    }
}

// ==============================================
// SCROLL ANIMATIONS (Intersection Observer)
// ==============================================
const animateOnScroll = () => {
    const elements = document.querySelectorAll('.animate-on-scroll');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in');
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });

    elements.forEach(el => observer.observe(el));
};

// Initialize animations when DOM is ready
document.addEventListener('DOMContentLoaded', animateOnScroll);

// ==============================================
// SMOOTH SCROLL FOR ANCHOR LINKS
// ==============================================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('href');
        const target = document.querySelector(targetId);
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});
