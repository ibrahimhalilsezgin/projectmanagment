
const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:3000';

async function testEditor() {
    console.log("1. Get Project ID...");
    const projects = await (await fetch(`${API_URL}/projects`)).json();
    const project = projects.find(p => p.name === "FileTestProject");
    if (!project) {
        console.error("FileTestProject not found. Run verify_files.js first (or manually create it).");
        // Fallback: Create it if missing for robustness
        const newProj = await fetch(`${API_URL}/projects`, {
            method: 'POST', body: JSON.stringify({ name: "FileTestProject", path: path.join(__dirname, 'dummy_fs') }), headers: { 'Content-Type': 'application/json' }
        });
        if (!newProj.ok) throw new Error("Could not create test project");
        const p = await newProj.json();
        return runTest(p.id, p.path);
    }
    await runTest(project.id, project.path);
}

async function runTest(id, projectPath) {
    console.log(`Project ID: ${id}`);

    // --- Create Test File ---
    const testFile = 'editor_test.txt';
    const initialContent = 'Initial Content';

    console.log("2. Creating test file via API...");
    // Reuse create API
    await fetch(`${API_URL}/projects/${id}/files/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentPath: '.', name: testFile, type: 'file' })
    });

    // Reset content manually (create makes empty file)
    // Actually, create makes empty. Let's write initial content using our NEW write API.

    console.log("3. Write Content (Save)...");
    const resWrite = await fetch(`${API_URL}/projects/${id}/files/write`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: testFile, content: initialContent })
    });

    if (!resWrite.ok) throw new Error("Write failed: " + await resWrite.text());
    console.log("Write success.");

    // --- Verify Content ---
    console.log("4. Read Content (Verify)...");
    const resRead = await fetch(`${API_URL}/projects/${id}/files/read?path=${testFile}`);
    const data = await resRead.json();

    if (data.content !== initialContent) throw new Error(`Content mismatch! Expected '${initialContent}', got '${data.content}'`);
    console.log("Read verified.");

    // --- Modify and Save Again ---
    console.log("5. Modify Content...");
    const newContent = "Updated Content via Editor API";
    const resUpdate = await fetch(`${API_URL}/projects/${id}/files/write`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: testFile, content: newContent })
    });
    if (!resUpdate.ok) throw new Error("Update failed");

    const resRead2 = await fetch(`${API_URL}/projects/${id}/files/read?path=${testFile}`);
    const data2 = await resRead2.json();

    if (data2.content !== newContent) throw new Error("Update verification failed");
    console.log("Update verified.");

    console.log("SUCCESS: Editor API works.");
}

testEditor().catch(e => {
    console.error(e);
    process.exit(1);
});
