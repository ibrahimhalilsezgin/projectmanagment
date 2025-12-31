
const http = require('http');

async function testFiles() {
    console.log("1. Add a dummy project for file testing...");
    const project = {
        name: "FileTestProject",
        path: process.cwd().replace(/\\/g, '/') + "/tests/dummy_fs",
    };

    // Create dummy dir
    const fs = require('fs');
    if (!fs.existsSync(project.path)) {
        fs.mkdirSync(project.path, { recursive: true });
        fs.writeFileSync(project.path + "/hello.txt", "Hello World");
        fs.mkdirSync(project.path + "/subdir");
        fs.writeFileSync(project.path + "/subdir/inner.txt", "Inner Content");
    }

    // Add project
    await fetch('http://localhost:3000/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project)
    });

    // Get project ID
    const projects = await (await fetch('http://localhost:3000/projects')).json();
    const p = projects.find(x => x.name === "FileTestProject");
    if (!p) throw new Error("Project not created");
    const id = p.id;

    console.log(`Project ID: ${id}`);

    // Test List Files
    console.log("2. Testing GET /files (list root)...");
    const files = await (await fetch(`http://localhost:3000/projects/${id}/files?path=.`)).json();
    console.log("Files:", files);
    if (!files.find(f => f.name === 'hello.txt')) throw new Error("hello.txt not found");
    if (!files.find(f => f.name === 'subdir' && f.isDirectory)) throw new Error("subdir not found");

    // Test Read File
    console.log("3. Testing GET /files/read (read file)...");
    const fileData = await (await fetch(`http://localhost:3000/projects/${id}/files/read?path=hello.txt`)).json();
    console.log("File Content:", fileData);
    if (fileData.content !== "Hello World") throw new Error("Content mismatch");

    // Test Subdir
    console.log("4. Testing GET /files (subdir)...");
    const subFiles = await (await fetch(`http://localhost:3000/projects/${id}/files?path=subdir`)).json();
    console.log("Subdir Files:", subFiles);
    if (!subFiles.find(f => f.name === 'inner.txt')) throw new Error("inner.txt not found in subdir");

    console.log("SUCCESS: File API verified.");

    // Cleanup
    // await fetch(`http://localhost:3000/projects/${id}`, { method: 'DELETE' });
}

testFiles().catch(e => {
    console.error(e);
    process.exit(1);
});
