
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const API_URL = 'http://localhost:3000';

async function testActions() {
    console.log("1. Get Project ID...");
    const projects = await (await fetch(`${API_URL}/projects`)).json();
    const project = projects.find(p => p.name === "FileTestProject");
    if (!project) throw new Error("FileTestProject not found. Run verify_files.js first.");
    const id = project.id;
    console.log(`Project ID: ${id}`);

    // --- Create Folder ---
    console.log("2. Create Folder 'test_folder'...");
    const resCreate = await fetch(`${API_URL}/projects/${id}/files/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentPath: '.', name: 'test_folder', type: 'directory' })
    });
    if (!resCreate.ok) throw new Error("Create Folder failed: " + await resCreate.text());
    console.log("Created folder.");

    // --- Create File ---
    console.log("3. Create File 'test_folder/hello.txt'...");
    const resCreateFile = await fetch(`${API_URL}/projects/${id}/files/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentPath: 'test_folder', name: 'hello.txt', type: 'file' })
    });
    if (!resCreateFile.ok) throw new Error("Create File failed: " + await resCreateFile.text());
    console.log("Created file.");

    // --- Upload Zip (Manual prep for unzip test) ---
    console.log("4. Prepare Zip file...");
    const zip = new AdmZip();
    zip.addFile("inside_zip.txt", Buffer.from("I was inside the zip!"));
    const zipPath = path.join(project.path, 'archive.zip');
    zip.writeZip(zipPath); // Direct write to dummy fs (cheating slightly, but tests integration logic mostly)

    // --- Unzip ---
    console.log("5. Unzip 'archive.zip'...");
    const resUnzip = await fetch(`${API_URL}/projects/${id}/files/unzip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: 'archive.zip' })
    });
    if (!resUnzip.ok) throw new Error("Unzip failed: " + await resUnzip.text());
    console.log("Unzipped.");

    // Check if extracted
    const extractedPath = path.join(project.path, 'inside_zip.txt');
    if (!fs.existsSync(extractedPath)) throw new Error("Extracted file not found!");


    // --- Delete ---
    console.log("6. Bulk Delete...");
    const itemsToDelete = ['test_folder', 'archive.zip', 'inside_zip.txt'];
    const resDelete = await fetch(`${API_URL}/projects/${id}/files/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToDelete, currentPath: '.' })
    });

    if (!resDelete.ok) throw new Error("Delete failed: " + await resDelete.text());
    const delResult = await resDelete.json();
    console.log("Deleted:", delResult);

    if (delResult.deleted.length !== 3) throw new Error("Not all items deleted");

    console.log("SUCCESS: All actions verified.");
}

testActions().catch(e => {
    console.error(e);
    process.exit(1);
});
