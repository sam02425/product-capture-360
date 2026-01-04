/**
 * Product Capture 360 - Unified Navigation Component
 * Shared navigation system for consistent UX across all pages
 */

(function() {
  'use strict';

  // Navigation configuration
  const NAV_ITEMS = [
    { label: '🏠 Home', href: '/', id: 'home' },
    { label: '📷 Camera', href: '/image-collector.html', id: 'camera' },
    { label: '🎨 Augment', href: '/image-collector.html#augment-section', id: 'augment' },
    { label: '⚙️ Generate', href: '/image-collector.html#generate-section', id: 'generate' },
    { label: '📦 Versions', href: '/image-collector.html#versions-section', id: 'versions' },
    { label: '📝 Annotator', href: '/annotator.html', id: 'annotator' },
    { label: '🤖 Batch AI', href: '/batch-annotator.html', id: 'batch-ai' },
    { label: '📚 Docs', href: '/annotation-docs.html', id: 'docs' },
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
      const activeClass = item.id === activePage ? 'active' : '';
      return `<button class="nav-btn ${activeClass}" onclick="window.location.href='${item.href}'" aria-label="${item.label}">
        ${item.label}
      </button>`;
    }).join('\n          ');

    return `
      <div class="app-header">
        <div class="header-content">
          <div class="header-branding">
            <img src="/eyeai_logo.png" alt="EYEai Logo" class="header-logo">
            <div>
              <h1 class="header-title">${title}</h1>
              <p class="header-subtitle">${subtitle}</p>
            </div>
          </div>
          <nav class="header-nav" aria-label="Main navigation">
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
