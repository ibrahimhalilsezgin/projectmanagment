
const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:3000';

async function testManagedCreation() {
    console.log("1. Create Managed Project 'ManagedApp'...");

    // Cleanup first if exists
    // (In real test we might deleting via API, but let's just create new name)
    const testName = `ManagedApp_${Date.now()}`;

    const res = await fetch(`${API_URL}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: testName,
            createManaged: true
        })
    });

    if (!res.ok) throw new Error("Creation failed: " + await res.text());

    const project = await res.json();
    console.log("Created:", project);

    if (!project.path.includes('managed_projects')) {
        throw new Error(`Path '${project.path}' does not look managed (should contain 'managed_projects')`);
    }

    // Verify file system
    const indexJs = path.join(project.path, 'index.js');
    const packageJson = path.join(project.path, 'package.json');

    if (!fs.existsSync(project.path)) throw new Error("Project directory does not exist on disk");
    if (!fs.existsSync(indexJs)) throw new Error("index.js missing");
    if (!fs.existsSync(packageJson)) throw new Error("package.json missing");

    console.log("Files verified on disk.");

    // Clean up
    console.log("2. Deleting Project...");
    const resDel = await fetch(`${API_URL}/projects/${project.id}`, { method: 'DELETE' });
    if (!resDel.ok) throw new Error("Delete failed");

    // Check if files deleted? Not required by current delete logic (it only removes from JSON).
    // Future enhancement: Delete actual files if managed? 
    // Current requirement doesn't specify deep delete given safety concerns.
    // So if JSON removal works, we are good for now.

    // We can manually clean up the folder for test hygiene
    try {
        fs.rmSync(project.path, { recursive: true, force: true });
        console.log("Cleaned up managed folder.");
    } catch (e) {
        console.warn("Manual cleanup failed:", e);
    }

    console.log("SUCCESS: Managed Creation verified.");
}

testManagedCreation().catch(e => {
    console.error(e);
    process.exit(1);
});
