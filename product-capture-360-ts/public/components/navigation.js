/**
 * Product Capture 360 - Unified Navigation Component
 * Shared navigation system for consistent UX across all pages
 */

(function() {
  'use strict';

  // Navigation configuration - Simplified professional navigation
  const NAV_ITEMS = [
    { label: '🏠 Home', href: '/', id: 'home' },
    { label: '📷 Camera', href: '/image-collector.html', id: 'camera' },
    { label: '📝 Annotator', href: '/annotator.html', id: 'annotator' },
    { label: '🤖 Batch AI', href: '/batch-annotator.html', id: 'batch-ai' },
    { label: '📋 Logs', href: '/logs.html', id: 'logs' }
  ];

  /**
   * Create navigation header HTML
   * @param {Object} options - Configuration options
   * @param {string} options.title - Page title
   * @param {string} options.subtitle - Page subtitle
   * @param {string} options.activePage - Active page ID
   * @returns {string} HTML string
   */
  function createNavigationHTML(options = {}) {
    const {
      title = 'Product Capture 360',
      subtitle = 'Professional 360° Product Photography System',
      activePage = 'home'
    } = options;

    const navButtons = NAV_ITEMS.map(item => {
      const isActive = item.id === activePage;
      if (isActive) {
        return `<button style="cursor: pointer; padding: 0.625rem 1rem; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); border: 1px solid #818cf8; border-radius: 8px; color: #ffffff; font-weight: 600; font-size: 0.875rem; box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3); white-space: nowrap;" aria-label="${item.label}">
          ${item.label}
        </button>`;
      } else {
        return `<button onclick="window.location.href='${item.href}'" style="cursor: pointer; padding: 0.625rem 1rem; background: #1e293b; border: 1px solid #334155; border-radius: 8px; color: #cbd5e1; font-weight: 500; font-size: 0.875rem; transition: all 0.2s ease; white-space: nowrap;" onmouseover="this.style.background='#334155'; this.style.color='#f1f5f9'; this.style.borderColor='#475569';" onmouseout="this.style.background='#1e293b'; this.style.color='#cbd5e1'; this.style.borderColor='#334155';" aria-label="${item.label}">
          ${item.label}
        </button>`;
      }
    }).join('\n          ');

    return `
      <div class="app-header" style="background: #0f172a; border-bottom: 1px solid #334155; padding: 1rem 1.5rem; margin-bottom: 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1.5rem; max-width: 1400px; margin: 0 auto;">
          <div style="display: flex; align-items: center; gap: 1.25rem;">
            <div style="width: 70px; height: 70px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border-radius: 16px; display: flex; align-items: center; justify-content: center; padding: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(99, 102, 241, 0.3);">
              <img src="/eyeai_logo.png" alt="EYEai Logo" style="width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));">
            </div>
            <div>
              <h1 style="margin: 0; font-size: 1.875rem; font-weight: 700; color: #f1f5f9;">${title}</h1>
              <p style="margin: 5px 0 0 0; font-size: 0.875rem; color: #94a3b8; font-weight: 400;">${subtitle}</p>
            </div>
          </div>
          <nav style="display: flex; gap: 0.5rem; flex-wrap: wrap;" aria-label="Main navigation">
            ${navButtons}
          </nav>
        </div>
      </div>
    `;
  }

  /**
   * Inject navigation into the page
   * @param {Object} options - Configuration options
   */
  function initNavigation(options = {}) {
    // Check if navigation should be auto-injected
    const targetElement = options.target || document.querySelector('[data-navigation]');

    if (targetElement) {
      const navHTML = createNavigationHTML(options);
      targetElement.innerHTML = navHTML;
    }

    // Add current page highlighting
    highlightCurrentPage();
  }

  /**
   * Highlight current page in navigation
   */
  function highlightCurrentPage() {
    const currentPath = window.location.pathname;
    const currentHash = window.location.hash;

    NAV_ITEMS.forEach(item => {
      const buttons = document.querySelectorAll(`.nav-btn[onclick*="${item.href}"]`);
      buttons.forEach(button => {
        // Check if this is the current page
        const isCurrentPage =
          (item.href === '/' && currentPath === '/') ||
          (item.href !== '/' && (currentPath.includes(item.href) ||
           (item.href.includes('#') && currentHash && item.href.includes(currentHash))));

        if (isCurrentPage) {
          button.classList.add('active');
        }
      });
    });
  }

  /**
   * Update page metadata
   * @param {Object} options - Page metadata
   */
  function updatePageMetadata(options = {}) {
    const {
      title = 'Product Capture 360',
      description = 'Professional 360° Product Photography System'
    } = options;

    // Update document title
    document.title = title;

    // Update or create meta description
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.name = 'description';
      document.head.appendChild(metaDesc);
    }
    metaDesc.content = description;
  }

  /**
   * Load required stylesheets
   */
  function loadStylesheets() {
    const stylesheets = [
      '/styles/design-system.css',
      '/styles/components.css'
    ];

    stylesheets.forEach(href => {
      // Check if already loaded
      if (document.querySelector(`link[href="${href}"]`)) {
        return;
      }

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    });
  }

  // Export to global scope
  window.ProductCapture360 = window.ProductCapture360 || {};
  window.ProductCapture360.Navigation = {
    init: initNavigation,
    createHTML: createNavigationHTML,
    highlightCurrentPage: highlightCurrentPage,
    updatePageMetadata: updatePageMetadata,
    loadStylesheets: loadStylesheets
  };

  // Auto-initialize if data attribute is present
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (document.querySelector('[data-navigation]')) {
        initNavigation();
      }
      loadStylesheets();
    });
  } else {
    if (document.querySelector('[data-navigation]')) {
      initNavigation();
    }
    loadStylesheets();
  }
})();
