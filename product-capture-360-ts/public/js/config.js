/**
 * Product Capture 360 - Configuration
 * Centralized configuration for the annotation tool
 */

const CONFIG = {
    // API Configuration
    API: {
        BASE_URL: window.location.origin,
        ENDPOINTS: {
            AUTO_ANNOTATE: '/api/auto-annotate',
            SEGMENT_SAM2: '/api/segment/sam2',
            FILE: '/api/file'
        },
        TIMEOUT: 30000 // 30 seconds
    },

    // Performance Settings
    PERFORMANCE: {
        THROTTLE_MS: 16,           // 60fps throttle for mouse events
        DEBOUNCE_MS: 300,          // Debounce delay
        MAX_HISTORY_SIZE: 50,      // Undo/redo history limit
        RENDER_BATCH_SIZE: 100     // Annotations to render per batch
    },

    // AI Configuration
    AI: {
        DEFAULT_CONFIDENCE: 0.5,   // Default AI confidence threshold
        MIN_CONFIDENCE: 0.1,       // Minimum confidence (10%)
        MAX_CONFIDENCE: 0.95,      // Maximum confidence (95%)
        CONFIDENCE_STEP: 0.05,     // Confidence adjustment step
        ENGINES: {
            YOLO: 'yolo',
            SAM2: 'sam2',
            GEMINI: 'gemini'
        }
    },

    // Canvas Settings
    CANVAS: {
        MIN_ZOOM: 0.1,
        MAX_ZOOM: 10,
        ZOOM_STEP: 0.05,           // 5% zoom per scroll
        DEFAULT_ZOOM: 1,
        HANDLE_SIZE: 6,            // Resize handle size in pixels
        SELECTION_TOLERANCE: 8     // Click tolerance for selection
    },

    // Annotation Settings
    ANNOTATION: {
        MIN_BOX_SIZE: 10,          // Minimum bbox size in pixels
        DEFAULT_LABEL: 'Abasolo_Whiskey_750ml',
        COLORS: {
            PRIMARY: '#3b82f6',
            SUCCESS: '#10b981',
            WARNING: '#f59e0b',
            ERROR: '#ef4444',
            INFO: '#3b82f6'
        },
        POLYGON_MAX_POINTS: 100,   // Maximum polygon vertices
        ELLIPSE_APPROXIMATION_POINTS: 32 // Points to approximate ellipse
    },

    // UI Settings
    UI: {
        TOAST_DURATION: 3000,      // Toast notification duration (ms)
        LOADING_Z_INDEX: 10001,    // Loading overlay z-index
        TOAST_Z_INDEX: 10000,      // Toast notification z-index
        TRANSITION_DURATION: 300   // Animation duration (ms)
    },

    // Validation Settings
    VALIDATION: {
        COORDINATE_PRECISION: 6,   // Decimal places for normalized coords
        ALLOW_NEGATIVE_COORDS: false,
        REQUIRE_LABEL: true
    },

    // Export Settings
    EXPORT: {
        FORMATS: {
            YOLO: 'yolo',
            COCO: 'coco',
            VOC: 'voc',
            MOT: 'mot'
        },
        DEFAULT_FORMAT: 'yolo',
        INCLUDE_METADATA: true
    },

    // Storage Settings
    STORAGE: {
        PROGRESS_KEY: 'annotation_progress',
        SETTINGS_KEY: 'annotation_settings',
        AUTO_SAVE_INTERVAL: 60000  // Auto-save every 60 seconds
    },

    // Tool Types
    TOOLS: {
        BBOX: 'bbox',
        SELECT: 'select',
        POLYGON: 'polygon',
        ELLIPSE: 'ellipse',
        MASK: 'mask'
    },

    // Feature Flags
    FEATURES: {
        ENABLE_TRACKING: true,
        ENABLE_KEYPOINTS: true,
        ENABLE_MASK_DRAWING: true,
        ENABLE_VIDEO_EXTRACTION: true,
        ENABLE_AUTO_SAVE: false    // Disabled by default
    }
};

// Freeze configuration to prevent modifications
Object.freeze(CONFIG);
Object.freeze(CONFIG.API);
Object.freeze(CONFIG.PERFORMANCE);
Object.freeze(CONFIG.AI);
Object.freeze(CONFIG.CANVAS);
Object.freeze(CONFIG.ANNOTATION);
Object.freeze(CONFIG.UI);
Object.freeze(CONFIG.VALIDATION);
Object.freeze(CONFIG.EXPORT);
Object.freeze(CONFIG.STORAGE);
Object.freeze(CONFIG.TOOLS);
Object.freeze(CONFIG.FEATURES);

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
