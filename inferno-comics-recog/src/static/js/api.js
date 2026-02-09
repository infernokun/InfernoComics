/**
 * Inferno Comics - API Utilities
 * Handles API URL construction and common HTTP operations
 */

const API = {
    config: {
        host: '',
        port: '',
        prefix: ''
    },

    /**
     * Initialize API configuration
     * @param {Object} config - Configuration object with flask_host, flask_port, api_url_prefix
     */
    init(config) {
        this.config = {
            host: config.flask_host || window.location.hostname,
            port: config.flask_port || window.location.port,
            prefix: config.api_url_prefix || ''
        };
    },

    /**
     * Build full API URL for an endpoint
     * @param {string} endpoint - API endpoint (e.g., '/evaluation')
     * @returns {string} Full URL
     */
    url(endpoint) {
        const base = window.location.origin;
        const prefix = this.config.prefix.replace(/^\/|\/$/g, '');
        const path = endpoint.replace(/^\//, '');
        return `${base}/${prefix}/${path}`;
    },

    /**
     * Make a GET request
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Fetch options
     * @returns {Promise<Response>}
     */
    async get(endpoint, options = {}) {
        return fetch(this.url(endpoint), {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
    },

    /**
     * Make a POST request
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Request body
     * @param {Object} options - Fetch options
     * @returns {Promise<Response>}
     */
    async post(endpoint, data, options = {}) {
        return fetch(this.url(endpoint), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            body: JSON.stringify(data),
            ...options
        });
    },

    /**
     * Create an EventSource for SSE
     * @param {string} endpoint - API endpoint with query params
     * @returns {EventSource}
     */
    eventSource(endpoint) {
        return new EventSource(this.url(endpoint));
    }
};

/**
 * UI Utilities
 */
const UI = {
    /**
     * Show/hide element
     */
    show(el) {
        if (typeof el === 'string') el = document.getElementById(el);
        if (el) el.style.display = '';
        el?.classList.remove('hidden');
    },

    hide(el) {
        if (typeof el === 'string') el = document.getElementById(el);
        if (el) el.style.display = 'none';
    },

    /**
     * Add/remove classes
     */
    addClass(el, ...classes) {
        if (typeof el === 'string') el = document.getElementById(el);
        if (el) el.classList.add(...classes);
    },

    removeClass(el, ...classes) {
        if (typeof el === 'string') el = document.getElementById(el);
        if (el) el.classList.remove(...classes);
    },

    /**
     * Set text content
     */
    setText(el, text) {
        if (typeof el === 'string') el = document.getElementById(el);
        if (el) el.textContent = text;
    },

    /**
     * Set HTML content
     */
    setHtml(el, html) {
        if (typeof el === 'string') el = document.getElementById(el);
        if (el) el.innerHTML = html;
    },

    /**
     * Set element attribute
     */
    setAttr(el, attr, value) {
        if (typeof el === 'string') el = document.getElementById(el);
        if (el) el.setAttribute(attr, value);
    },

    /**
     * Create element with options
     */
    create(tag, options = {}) {
        const el = document.createElement(tag);
        if (options.class) el.className = options.class;
        if (options.id) el.id = options.id;
        if (options.text) el.textContent = options.text;
        if (options.html) el.innerHTML = options.html;
        if (options.attrs) {
            Object.entries(options.attrs).forEach(([k, v]) => el.setAttribute(k, v));
        }
        return el;
    },

    /**
     * Format file size
     */
    formatSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * Format date/time
     */
    formatDate(dateStr) {
        if (!dateStr) return 'Unknown';
        const date = new Date(dateStr);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    },

    /**
     * Format similarity score
     */
    formatSimilarity(score) {
        return (score * 100).toFixed(2) + '%';
    },

    /**
     * Get color class based on similarity
     */
    getSimilarityClass(score, threshold = 0.25) {
        if (score >= threshold) return 'success';
        if (score >= threshold * 0.5) return 'warning';
        return 'error';
    },

    /**
     * Scroll element into view
     */
    scrollTo(el) {
        if (typeof el === 'string') el = document.getElementById(el);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
};

/**
 * Placeholder/fallback image as data URI
 */
const PLACEHOLDER_IMAGE = 'data:image/svg+xml;base64,' + btoa(`
<svg width="200" height="280" viewBox="0 0 200 280" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="200" height="280" fill="#242432"/>
    <rect x="60" y="100" width="80" height="60" rx="4" stroke="#667eea" stroke-width="2" fill="none"/>
    <circle cx="80" cy="120" r="8" fill="#667eea"/>
    <path d="M60 150 L90 130 L110 145 L140 120 L140 160 L60 160 Z" fill="#667eea" opacity="0.5"/>
    <text x="100" y="200" text-anchor="middle" fill="#707080" font-size="12" font-family="sans-serif">No Image</text>
</svg>
`.trim());

// Legacy support - getApiUrl function
function getApiUrl(endpoint) {
    return API.url(endpoint);
}
