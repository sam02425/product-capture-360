/**
 * Product Capture 360 - Utility Functions
 * Common utility functions used across the application
 */

/**
 * Throttle function execution
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Debounce function execution
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

/**
 * Validate bounding box coordinates
 * @param {Object} bbox - Bounding box {x, y, width, height}
 * @param {number} maxWidth - Maximum width (image or canvas width)
 * @param {number} maxHeight - Maximum height (image or canvas height)
 * @returns {Object} {valid: boolean, errors: string[]}
 */
function validateBoundingBox(bbox, maxWidth, maxHeight) {
    const errors = [];

    // Check required properties
    if (!bbox || typeof bbox !== 'object') {
        return { valid: false, errors: ['Bounding box is required'] };
    }

    if (bbox.x === undefined || bbox.y === undefined ||
        bbox.width === undefined || bbox.height === undefined) {
        return { valid: false, errors: ['Missing required bbox properties'] };
    }

    // Check for valid numbers
    if (isNaN(bbox.x) || isNaN(bbox.y) || isNaN(bbox.width) || isNaN(bbox.height)) {
        errors.push('Coordinates must be numbers');
    }

    // Check for negative dimensions
    if (bbox.width <= 0) errors.push('Width must be positive');
    if (bbox.height <= 0) errors.push('Height must be positive');

    // Check bounds
    if (bbox.x < 0) errors.push('X coordinate out of bounds (< 0)');
    if (bbox.y < 0) errors.push('Y coordinate out of bounds (< 0)');
    if (bbox.x + bbox.width > maxWidth) errors.push('Box extends beyond right edge');
    if (bbox.y + bbox.height > maxHeight) errors.push('Box extends beyond bottom edge');

    return {
        valid: errors.length === 0,
        errors: errors
    };
}

/**
 * Show toast notification
 * @param {string} message - Message to display
 * @param {string} type - Type: 'success', 'warning', 'error', 'info'
 */
function showToast(message, type = 'info') {
    const colors = {
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444',
        info: '#3b82f6'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${colors[type] || colors.info};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        font-size: 14px;
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
    `;

    document.body.appendChild(toast);

    // Auto-remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Show loading overlay for async operations
 * @param {string} message - Loading message to display
 * @returns {Object} Control object with hide() and updateMessage() methods
 */
function showLoadingOverlay(message = 'Loading...') {
    // Remove existing overlay if present
    const existing = document.getElementById('loadingOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'loadingOverlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 10001;
        backdrop-filter: blur(4px);
    `;

    overlay.innerHTML = `
        <div style="
            background: #1e293b;
            padding: 32px 48px;
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 20px;
            border: 1px solid #334155;
        ">
            <div style="
                width: 48px;
                height: 48px;
                border: 4px solid #334155;
                border-top-color: #3b82f6;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            "></div>
            <div id="loadingMessage" style="
                color: #f1f5f9;
                font-size: 16px;
                font-weight: 500;
            ">${message}</div>
        </div>
        <style>
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
        </style>
    `;

    document.body.appendChild(overlay);

    return {
        hide: () => {
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.3s ease-out';
            setTimeout(() => overlay.remove(), 300);
        },
        updateMessage: (newMessage) => {
            const messageEl = document.getElementById('loadingMessage');
            if (messageEl) messageEl.textContent = newMessage;
        }
    };
}

/**
 * Deep clone an object
 * @param {*} obj - Object to clone
 * @returns {*} Cloned object
 */
function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => deepClone(item));
    if (obj instanceof Object) {
        const clonedObj = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                clonedObj[key] = deepClone(obj[key]);
            }
        }
        return clonedObj;
    }
}

/**
 * Generate a unique ID
 * @returns {string} Unique ID
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Clamp a number between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number} Interpolated value
 */
function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Calculate distance between two points
 * @param {Object} p1 - Point 1 {x, y}
 * @param {Object} p2 - Point 2 {x, y}
 * @returns {number} Distance
 */
function distance(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Format file size to human-readable string
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Format date to ISO string
 * @param {Date} date - Date object
 * @returns {string} Formatted date string
 */
function formatDate(date) {
    return date.toISOString().split('T')[0];
}

/**
 * Parse query string parameters
 * @param {string} queryString - Query string
 * @returns {Object} Parsed parameters
 */
function parseQueryString(queryString) {
    const params = {};
    const pairs = (queryString[0] === '?' ? queryString.substr(1) : queryString).split('&');
    for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i].split('=');
        params[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || '');
    }
    return params;
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        throttle,
        debounce,
        validateBoundingBox,
        showToast,
        showLoadingOverlay,
        deepClone,
        generateId,
        clamp,
        lerp,
        distance,
        formatFileSize,
        formatDate,
        parseQueryString
    };
}
