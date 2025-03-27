(async function() {
    console.log("🔹 Loading settings.js and cssContains.js...");

    // Load settings.js
    await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "/Users/stephanehamel/Documents/CleanedIn/extension/settings.js"; // Replace with actual path
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });

    // Load cssContains.js
    await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "/Users/stephanehamel/Documents/CleanedIn/extension/cssContains.js"; // Replace with actual path
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });

    console.log("✅ settings.js and cssContains.js loaded!");

    // Ensure the function is available
    if (typeof document.querySelectorAllContains !== "function") {
        console.error("❌ querySelectorAllContains() is not available! Check if cssContains.js is loaded.");
        return;
    }

    // Run tests
    runUnitTests();
})();

function runUnitTests() {
    console.log("🔍 Running unit tests...");

    settings.forEach(setting => {
        if (setting.selector) {
            console.log(`🔹 Testing selector: ${setting.selector}`);

            try {
                let elements = document.querySelectorAllContains(setting.selector);
                console.log(`✅ Found ${elements.length} elements for: ${setting.selector}`);

                // Highlight found elements
                elements.forEach(el => {
                    el.style.border = "2px solid red"; // Visual feedback
                    el.style.backgroundColor = "rgba(255, 0, 0, 0.2)";
                });

            } catch (error) {
                console.error(`❌ Error with selector ${setting.selector}:`, error);
            }
        }
    });

    console.log("✅ Unit tests completed.");
}