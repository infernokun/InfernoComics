/**
 * Inferno Comics - Theme Management
 * Handles dark/light mode toggle with localStorage persistence
 */

const Theme = {
    STORAGE_KEY: 'inferno-theme',
    DARK: 'dark',
    LIGHT: 'light',

    /**
     * Initialize theme from storage or system preference
     */
    init() {
        const savedTheme = localStorage.getItem(this.STORAGE_KEY);
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const theme = savedTheme || (prefersDark ? this.DARK : this.DARK); // Default to dark

        this.apply(theme);
        this.updateToggleUI(theme);

        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem(this.STORAGE_KEY)) {
                const newTheme = e.matches ? this.DARK : this.LIGHT;
                this.apply(newTheme);
                this.updateToggleUI(newTheme);
            }
        });
    },

    /**
     * Toggle between dark and light themes
     */
    toggle() {
        const current = document.documentElement.getAttribute('data-theme') || this.DARK;
        const next = current === this.LIGHT ? this.DARK : this.LIGHT;

        this.apply(next);
        this.save(next);
        this.updateToggleUI(next);
    },

    /**
     * Apply theme to document
     */
    apply(theme) {
        document.documentElement.setAttribute('data-theme', theme);
    },

    /**
     * Save theme preference to localStorage
     */
    save(theme) {
        localStorage.setItem(this.STORAGE_KEY, theme);
    },

    /**
     * Update toggle button UI
     */
    updateToggleUI(theme) {
        const icon = document.getElementById('themeIcon');
        const text = document.getElementById('themeText');

        if (icon && text) {
            if (theme === this.LIGHT) {
                icon.textContent = '\u{1F319}'; // Moon emoji
                text.textContent = 'Dark';
            } else {
                icon.textContent = '\u2600\uFE0F'; // Sun emoji
                text.textContent = 'Light';
            }
        }
    },

    /**
     * Get current theme
     */
    current() {
        return document.documentElement.getAttribute('data-theme') || this.DARK;
    }
};

// Global function for onclick handlers
function toggleTheme() {
    Theme.toggle();
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => Theme.init());
