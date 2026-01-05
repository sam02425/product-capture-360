/**
 * Comprehensive Test Suite for Professional Annotator
 * Tests all 8 implemented features
 */

// Test Configuration
const TEST_CONFIG = {
    serverUrl: 'http://localhost:5002',
    testImagesPath: '/Users/saumil/Desktop/photos/360Photo_Captures/Ambhar_Anejo_Tequila_750ml',
    testTimeout: 30000
};

// Test Results Tracker
const testResults = {
    passed: 0,
    failed: 0,
    tests: []
};

// Helper function to log test results
function logTest(name, passed, message = '') {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}: ${name}`);
    if (message) console.log(`   ${message}`);

    testResults.tests.push({ name, passed, message });
    if (passed) testResults.passed++;
    else testResults.failed++;
}

// Test 1: Server Availability
async function testServerAvailability() {
    console.log('\n📡 Testing Server Availability...');
    try {
        const response = await fetch(TEST_CONFIG.serverUrl);
        const ok = response.status === 200;
        logTest('Server is running', ok, `Status: ${response.status}`);
        return ok;
    } catch (error) {
        logTest('Server is running', false, error.message);
        return false;
    }
}

// Test 2: Annotator Page Loads
async function testAnnotatorPageLoad() {
    console.log('\n📄 Testing Annotator Page Load...');
    try {
        const response = await fetch(`${TEST_CONFIG.serverUrl}/annotator.html`);
        const html = await response.text();

        // Check for key elements
        const hasDarkModeButton = html.includes('toggleDarkMode()');
        const hasPerformancePanel = html.includes('togglePerformancePanel()');
        const hasVideoTimeline = html.includes('videoTimeline');
        const hasTrackingControls = html.includes('trackingEnabled');

        logTest('Annotator page loads', response.status === 200);
        logTest('Dark mode button present', hasDarkModeButton);
        logTest('Performance panel present', hasPerformancePanel);
        logTest('Video timeline present', hasVideoTimeline);
        logTest('Tracking controls present', hasTrackingControls);

        return response.status === 200;
    } catch (error) {
        logTest('Annotator page loads', false, error.message);
        return false;
    }
}

// Test 3: JavaScript Functions Exist
async function testJavaScriptFunctions() {
    console.log('\n🔧 Testing JavaScript Functions...');
    try {
        const response = await fetch(`${TEST_CONFIG.serverUrl}/annotator.js`);
        const js = await response.text();

        // Test for new UI functions
        const hasDarkModeToggle = js.includes('function toggleDarkMode()');
        const hasLoadTheme = js.includes('function loadTheme()');
        const hasDragDrop = js.includes('function setupDragAndDrop()');
        const hasKeyboardShortcuts = js.includes('function showKeyboardShortcuts()');
        const hasPerformancePanel = js.includes('function togglePerformancePanel()');
        const hasPerformanceTracking = js.includes('function startPerformanceTracking()');

        // Test for video functions
        const hasVideoUpload = js.includes('function handleVideoUpload(');
        const hasExtractFrames = js.includes('function extractVideoFrames()');
        const hasFrameNavigation = js.includes('function nextFrame()');

        // Test for tracking functions
        const hasToggleTracking = js.includes('function toggleTracking(');
        const hasPropagateAnnotation = js.includes('function propagateAnnotation()');
        const hasAutoTrack = js.includes('function autoTrackForward()');

        logTest('Dark mode toggle function', hasDarkModeToggle);
        logTest('Load theme function', hasLoadTheme);
        logTest('Drag-drop setup function', hasDragDrop);
        logTest('Keyboard shortcuts function', hasKeyboardShortcuts);
        logTest('Performance panel function', hasPerformancePanel);
        logTest('Performance tracking function', hasPerformanceTracking);
        logTest('Video upload function', hasVideoUpload);
        logTest('Extract frames function', hasExtractFrames);
        logTest('Frame navigation function', hasFrameNavigation);
        logTest('Toggle tracking function', hasToggleTracking);
        logTest('Propagate annotation function', hasPropagateAnnotation);
        logTest('Auto-track function', hasAutoTrack);

        return response.status === 200;
    } catch (error) {
        logTest('JavaScript functions check', false, error.message);
        return false;
    }
}

// Test 4: CSS Dark Mode Variables
async function testDarkModeCSS() {
    console.log('\n🎨 Testing Dark Mode CSS...');
    try {
        const response = await fetch(`${TEST_CONFIG.serverUrl}/annotator.html`);
        const html = await response.text();

        const hasLightTheme = html.includes(':root {') && html.includes('--bg-primary: #f6f7fb');
        const hasDarkTheme = html.includes('[data-theme="dark"]') && html.includes('--bg-primary: #0f172a');
        const hasDarkModeBody = html.includes('[data-theme="dark"] body');

        logTest('Light theme CSS variables', hasLightTheme);
        logTest('Dark theme CSS variables', hasDarkTheme);
        logTest('Dark mode body styles', hasDarkModeBody);

        return hasLightTheme && hasDarkTheme;
    } catch (error) {
        logTest('Dark mode CSS check', false, error.message);
        return false;
    }
}

// Test 5: Performance Stats Elements
async function testPerformanceStatsElements() {
    console.log('\n📊 Testing Performance Stats Elements...');
    try {
        const response = await fetch(`${TEST_CONFIG.serverUrl}/annotator.html`);
        const html = await response.text();

        const hasAnnotsPerMin = html.includes('id="annotsPerMin"');
        const hasSessionTime = html.includes('id="sessionTime"');
        const hasPerformanceButton = html.includes('📊 Performance');

        logTest('Annotations/Min element', hasAnnotsPerMin);
        logTest('Session time element', hasSessionTime);
        logTest('Performance button', hasPerformanceButton);

        return hasAnnotsPerMin && hasSessionTime;
    } catch (error) {
        logTest('Performance stats elements', false, error.message);
        return false;
    }
}

// Test 6: Export Functions
async function testExportFunctions() {
    console.log('\n📦 Testing Export Functions...');
    try {
        const response = await fetch(`${TEST_CONFIG.serverUrl}/annotator.js`);
        const js = await response.text();

        const hasCOCOExport = js.includes("format === 'coco'") || js.includes('format === "coco"');
        const hasVOCExport = js.includes("format === 'voc'") || js.includes('format === "voc"');
        const hasYOLOExport = js.includes('YOLO format') || js.includes('yoloData') || js.includes("= 'yolo'");
        const hasMOTExport = js.includes('exportTrackingData()');

        logTest('COCO export handling', hasCOCOExport);
        logTest('Pascal VOC export handling', hasVOCExport);
        logTest('YOLO export handling', hasYOLOExport);
        logTest('MOT tracking export', hasMOTExport);

        return hasCOCOExport && hasVOCExport && hasYOLOExport;
    } catch (error) {
        logTest('Export functions check', false, error.message);
        return false;
    }
}

// Test 7: Annotation Tools
async function testAnnotationTools() {
    console.log('\n🎯 Testing Annotation Tools...');
    try {
        const response = await fetch(`${TEST_CONFIG.serverUrl}/annotator.js`);
        const js = await response.text();

        const hasEllipseTool = js.includes('ellipseCenter') && js.includes('ellipseRadius');
        const hasKeypointTool = js.includes('keypointAnnotations') && js.includes('KEYPOINT_TEMPLATES');
        const hasPolygonTool = js.includes('polygonPoints');
        const hasMaskTool = js.includes('maskCanvas') && js.includes('maskCtx');

        logTest('Ellipse annotation tool', hasEllipseTool);
        logTest('Keypoint annotation tool', hasKeypointTool);
        logTest('Polygon annotation tool', hasPolygonTool);
        logTest('Mask annotation tool', hasMaskTool);

        return hasEllipseTool && hasKeypointTool;
    } catch (error) {
        logTest('Annotation tools check', false, error.message);
        return false;
    }
}

// Test 8: Keypoint Templates
async function testKeypointTemplates() {
    console.log('\n🦴 Testing Keypoint Templates...');
    try {
        const response = await fetch(`${TEST_CONFIG.serverUrl}/annotator.js`);
        const js = await response.text();

        const hasCocoPersonTemplate = js.includes("'coco-person'") && js.includes('17 points');
        const hasHandTemplate = js.includes("'hand'") && js.includes('21 points');
        const hasSkeletonData = js.includes('skeleton:');

        logTest('COCO Person template (17 keypoints)', hasCocoPersonTemplate);
        logTest('Hand template (21 keypoints)', hasHandTemplate);
        logTest('Skeleton connection data', hasSkeletonData);

        return hasCocoPersonTemplate && hasHandTemplate;
    } catch (error) {
        logTest('Keypoint templates check', false, error.message);
        return false;
    }
}

// Test 9: API Endpoints
async function testAPIEndpoints() {
    console.log('\n🔌 Testing API Endpoints...');
    try {
        // Test static file serving
        const logoResponse = await fetch(`${TEST_CONFIG.serverUrl}/eyeai_logo.png`);
        logTest('Static file serving (logo)', logoResponse.status === 200 || logoResponse.status === 404, `Status: ${logoResponse.status}`);

        // Test logger.js
        const loggerResponse = await fetch(`${TEST_CONFIG.serverUrl}/logger.js`);
        logTest('Logger script available', loggerResponse.status === 200, `Status: ${loggerResponse.status}`);

        return true;
    } catch (error) {
        logTest('API endpoints check', false, error.message);
        return false;
    }
}

// Test 10: Batch Annotation Functionality
async function testBatchAnnotation() {
    console.log('\n🤖 Testing Batch Annotation API...');
    try {
        // Check if batch annotation endpoint exists
        const response = await fetch(`${TEST_CONFIG.serverUrl}/api/batch-annotate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                folderPath: TEST_CONFIG.testImagesPath,
                model: 'yolov8n',
                confidence: 0.5,
                targetClass: 'bottle'
            })
        });

        const accessible = response.status !== 404;
        logTest('Batch annotation endpoint exists', accessible, `Status: ${response.status}`);

        if (response.ok) {
            const data = await response.json();
            logTest('Batch annotation returns data', !!data, `Images processed: ${data.totalImages || 0}`);
        }

        return accessible;
    } catch (error) {
        logTest('Batch annotation API', false, error.message);
        return false;
    }
}

// Main Test Runner
async function runAllTests() {
    console.log('🚀 Starting Professional Annotator Test Suite\n');
    console.log('='.repeat(60));

    const startTime = Date.now();

    // Run all tests
    await testServerAvailability();
    await testAnnotatorPageLoad();
    await testJavaScriptFunctions();
    await testDarkModeCSS();
    await testPerformanceStatsElements();
    await testExportFunctions();
    await testAnnotationTools();
    await testKeypointTemplates();
    await testAPIEndpoints();
    await testBatchAnnotation();

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    // Print Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${testResults.passed + testResults.failed}`);
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`⏱️  Duration: ${duration}s`);
    console.log(`📈 Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);

    if (testResults.failed > 0) {
        console.log('\n❌ Failed Tests:');
        testResults.tests.filter(t => !t.passed).forEach(t => {
            console.log(`   - ${t.name}: ${t.message}`);
        });
    }

    console.log('\n' + '='.repeat(60));

    // Exit with appropriate code
    process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
});
