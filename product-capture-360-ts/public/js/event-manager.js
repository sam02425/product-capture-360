/**
 * Product Capture 360 - Event Manager
 * Centralized event listener management with automatic cleanup
 */

class EventManager {
    constructor() {
        this.listeners = new Map();
        this.listenerCounter = 0;
    }

    /**
     * Add an event listener with automatic tracking
     * @param {Element} element - DOM element
     * @param {string} event - Event name
     * @param {Function} handler - Event handler function
     * @param {Object} options - Event listener options
     * @returns {number} Listener ID for removal
     */
    add(element, event, handler, options = {}) {
        if (!element || !event || !handler) {
            console.error('EventManager: Missing required parameters');
            return null;
        }

        const listenerId = ++this.listenerCounter;

        element.addEventListener(event, handler, options);

        this.listeners.set(listenerId, {
            element,
            event,
            handler,
            options
        });

        return listenerId;
    }

    /**
     * Remove a specific event listener by ID
     * @param {number} listenerId - Listener ID returned from add()
     * @returns {boolean} True if removed successfully
     */
    remove(listenerId) {
        const listener = this.listeners.get(listenerId);

        if (!listener) {
            console.warn(`EventManager: Listener ${listenerId} not found`);
            return false;
        }

        const { element, event, handler, options } = listener;
        element.removeEventListener(event, handler, options);
        this.listeners.delete(listenerId);

        return true;
    }

    /**
     * Remove all listeners from a specific element
     * @param {Element} element - DOM element
     * @returns {number} Number of listeners removed
     */
    removeFromElement(element) {
        let removed = 0;

        for (const [id, listener] of this.listeners.entries()) {
            if (listener.element === element) {
                this.remove(id);
                removed++;
            }
        }

        return removed;
    }

    /**
     * Remove all listeners for a specific event type
     * @param {string} event - Event name
     * @returns {number} Number of listeners removed
     */
    removeByEvent(event) {
        let removed = 0;

        for (const [id, listener] of this.listeners.entries()) {
            if (listener.event === event) {
                this.remove(id);
                removed++;
            }
        }

        return removed;
    }

    /**
     * Remove all event listeners
     * @returns {number} Number of listeners removed
     */
    removeAll() {
        const count = this.listeners.size;

        for (const [id, listener] of this.listeners.entries()) {
            const { element, event, handler, options } = listener;
            element.removeEventListener(event, handler, options);
        }

        this.listeners.clear();
        this.listenerCounter = 0;

        return count;
    }

    /**
     * Get count of active listeners
     * @returns {number} Number of active listeners
     */
    getCount() {
        return this.listeners.size;
    }

    /**
     * Get listener details by ID
     * @param {number} listenerId - Listener ID
     * @returns {Object|null} Listener details
     */
    getListener(listenerId) {
        const listener = this.listeners.get(listenerId);
        return listener ? { ...listener } : null;
    }

    /**
     * Get all listeners for debugging
     * @returns {Array} Array of listener details
     */
    getAllListeners() {
        const result = [];
        for (const [id, listener] of this.listeners.entries()) {
            result.push({
                id,
                element: listener.element.tagName || 'unknown',
                event: listener.event,
                hasHandler: !!listener.handler
            });
        }
        return result;
    }

    /**
     * Add a one-time event listener
     * @param {Element} element - DOM element
     * @param {string} event - Event name
     * @param {Function} handler - Event handler function
     * @param {Object} options - Event listener options
     * @returns {number} Listener ID
     */
    once(element, event, handler, options = {}) {
        const wrappedHandler = (...args) => {
            handler.apply(element, args);
            this.remove(listenerId);
        };

        const listenerId = this.add(element, event, wrappedHandler, options);
        return listenerId;
    }

    /**
     * Add a delegated event listener
     * @param {Element} parent - Parent element
     * @param {string} selector - Child selector
     * @param {string} event - Event name
     * @param {Function} handler - Event handler function
     * @returns {number} Listener ID
     */
    delegate(parent, selector, event, handler) {
        const wrappedHandler = (e) => {
            const target = e.target.closest(selector);
            if (target && parent.contains(target)) {
                handler.call(target, e);
            }
        };

        return this.add(parent, event, wrappedHandler);
    }
}

// Create global instance
const eventManager = new EventManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EventManager, eventManager };
}
