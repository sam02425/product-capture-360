/**
 * Product Capture 360 - Coordinate Utilities
 * Handles coordinate transformations and conversions
 */

/**
 * Convert canvas coordinates to normalized coordinates [0-1]
 * @param {Object} bbox - Bounding box in canvas coordinates {x, y, width, height}
 * @param {HTMLImageElement} image - Image element
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @returns {Object} Normalized bounding box [0-1]
 */
function canvasToNormalized(bbox, image, canvas) {
    if (!image || !canvas) return bbox;

    const scaleX = image.naturalWidth / canvas.width;
    const scaleY = image.naturalHeight / canvas.height;

    return {
        x: bbox.x * scaleX / image.naturalWidth,
        y: bbox.y * scaleY / image.naturalHeight,
        width: bbox.width * scaleX / image.naturalWidth,
        height: bbox.height * scaleY / image.naturalHeight
    };
}

/**
 * Convert normalized coordinates [0-1] to canvas coordinates
 * @param {Object} normalized - Normalized bounding box [0-1]
 * @param {HTMLImageElement} image - Image element
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @returns {Object} Bounding box in canvas coordinates
 */
function normalizedToCanvas(normalized, image, canvas) {
    if (!image || !canvas) return normalized;

    const scaleX = canvas.width / image.naturalWidth;
    const scaleY = canvas.height / image.naturalHeight;

    return {
        x: normalized.x * image.naturalWidth * scaleX,
        y: normalized.y * image.naturalHeight * scaleY,
        width: normalized.width * image.naturalWidth * scaleX,
        height: normalized.height * image.naturalHeight * scaleY
    };
}

/**
 * Convert normalized coordinates [0-1] to pixel coordinates
 * @param {Object} normalized - Normalized coordinates {x, y, width, height}
 * @param {number} imageWidth - Original image width
 * @param {number} imageHeight - Original image height
 * @returns {Object} Pixel coordinates
 */
function normalizedToPixels(normalized, imageWidth, imageHeight) {
    return {
        x: normalized.x * imageWidth,
        y: normalized.y * imageHeight,
        width: normalized.width * imageWidth,
        height: normalized.height * imageHeight
    };
}

/**
 * Convert pixel coordinates to normalized [0-1]
 * @param {Object} pixels - Pixel coordinates {x, y, width, height}
 * @param {number} imageWidth - Original image width
 * @param {number} imageHeight - Original image height
 * @returns {Object} Normalized coordinates [0-1]
 */
function pixelsToNormalized(pixels, imageWidth, imageHeight) {
    return {
        x: pixels.x / imageWidth,
        y: pixels.y / imageHeight,
        width: pixels.width / imageWidth,
        height: pixels.height / imageHeight
    };
}

/**
 * Convert bounding box to center format (x_center, y_center, width, height)
 * @param {Object} bbox - Bounding box {x, y, width, height}
 * @returns {Object} Center format bounding box
 */
function bboxToCenter(bbox) {
    return {
        x_center: bbox.x + bbox.width / 2,
        y_center: bbox.y + bbox.height / 2,
        width: bbox.width,
        height: bbox.height
    };
}

/**
 * Convert center format to corner format (x, y, width, height)
 * @param {Object} center - Center format {x_center, y_center, width, height}
 * @returns {Object} Corner format bounding box
 */
function centerToBbox(center) {
    return {
        x: center.x_center - center.width / 2,
        y: center.y_center - center.height / 2,
        width: center.width,
        height: center.height
    };
}

/**
 * Convert bounding box to corner points (xmin, ymin, xmax, ymax)
 * @param {Object} bbox - Bounding box {x, y, width, height}
 * @returns {Object} Corner points {xmin, ymin, xmax, ymax}
 */
function bboxToCorners(bbox) {
    return {
        xmin: bbox.x,
        ymin: bbox.y,
        xmax: bbox.x + bbox.width,
        ymax: bbox.y + bbox.height
    };
}

/**
 * Convert corner points to bounding box
 * @param {Object} corners - Corner points {xmin, ymin, xmax, ymax}
 * @returns {Object} Bounding box {x, y, width, height}
 */
function cornersToBbox(corners) {
    return {
        x: corners.xmin,
        y: corners.ymin,
        width: corners.xmax - corners.xmin,
        height: corners.ymax - corners.ymin
    };
}

/**
 * Apply zoom and pan transformations to coordinates
 * @param {Object} point - Point {x, y}
 * @param {number} zoom - Zoom level
 * @param {Object} pan - Pan offset {x, y}
 * @returns {Object} Transformed point
 */
function applyTransform(point, zoom, pan) {
    return {
        x: point.x * zoom + pan.x,
        y: point.y * zoom + pan.y
    };
}

/**
 * Remove zoom and pan transformations from coordinates
 * @param {Object} point - Transformed point {x, y}
 * @param {number} zoom - Zoom level
 * @param {Object} pan - Pan offset {x, y}
 * @returns {Object} Original point
 */
function removeTransform(point, zoom, pan) {
    return {
        x: (point.x - pan.x) / zoom,
        y: (point.y - pan.y) / zoom
    };
}

/**
 * Normalize polygon points to [0-1] range
 * @param {Array} points - Array of {x, y} points
 * @param {HTMLImageElement} image - Image element
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @returns {Array} Normalized points
 */
function normalizePolygon(points, image, canvas) {
    if (!image || !canvas || !points) return points;

    const scaleX = image.naturalWidth / canvas.width;
    const scaleY = image.naturalHeight / canvas.height;

    return points.map(p => ({
        x: (p.x * scaleX) / image.naturalWidth,
        y: (p.y * scaleY) / image.naturalHeight
    }));
}

/**
 * Denormalize polygon points from [0-1] to canvas coordinates
 * @param {Array} normalizedPoints - Array of normalized {x, y} points
 * @param {HTMLImageElement} image - Image element
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @returns {Array} Canvas coordinate points
 */
function denormalizePolygon(normalizedPoints, image, canvas) {
    if (!image || !canvas || !normalizedPoints) return normalizedPoints;

    const scaleX = canvas.width / image.naturalWidth;
    const scaleY = canvas.height / image.naturalHeight;

    return normalizedPoints.map(p => ({
        x: p.x * image.naturalWidth * scaleX,
        y: p.y * image.naturalHeight * scaleY
    }));
}

/**
 * Calculate bounding box from polygon points
 * @param {Array} points - Array of {x, y} points
 * @returns {Object} Bounding box {x, y, width, height}
 */
function polygonToBbox(points) {
    if (!points || points.length === 0) return null;

    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);

    return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys)
    };
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        canvasToNormalized,
        normalizedToCanvas,
        normalizedToPixels,
        pixelsToNormalized,
        bboxToCenter,
        centerToBbox,
        bboxToCorners,
        cornersToBbox,
        applyTransform,
        removeTransform,
        normalizePolygon,
        denormalizePolygon,
        polygonToBbox
    };
}
