
const fs = require('fs');
const path = require('path');

// Boundary for multipart data
const boundary = '--------------------------735323031399963166993862';

async function testUpload() {
    console.log("1. Get Project ID...");
    const projects = await (await fetch('http://localhost:3000/projects')).json();
    const project = projects.find(p => p.name === "FileTestProject");
    if (!project) throw new Error("FileTestProject not found. Run verify_files.js first or create it.");

    const id = project.id;
    console.log(`Project ID: ${id}`);

    // Create a dummy file to upload
    const dummyFile = path.join(__dirname, 'upload_test.txt');
    fs.writeFileSync(dummyFile, 'This is a test upload file content.');

    console.log("2. Uploading file...");

    // Construct multipart body manually because native FormData in Node < 20 might act weird or require polyfill
    // But let's try native FormData first if we are on modern Node.
    // If it fails, we fall back to manual body construction.

    try {
        const fileContent = fs.readFileSync(dummyFile);

        // Manual Multipart Body Construction
        let body = `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="files"; filename="upload_test.txt"\r\n`;
        body += `Content-Type: text/plain\r\n\r\n`;
        body += fileContent + `\r\n`;
        body += `--${boundary}--`;

        const res = await fetch(`http://localhost:3000/projects/${id}/files/upload?path=.`, {
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
            },
            body: body
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Upload failed (${res.status}): ${text.substring(0, 200)}...`);
        }

        const json = await res.json();
        console.log("Upload Response:", json);
        if (!json.files.includes('upload_test.txt')) throw new Error("Response missing filename");

        // Verify existence
        const files = await (await fetch(`http://localhost:3000/projects/${id}/files?path=.`)).json();
        if (!files.find(f => f.name === 'upload_test.txt')) throw new Error("Uploaded file not found in directory listing");

        console.log("SUCCESS: Upload verified.");

    } finally {
        if (fs.existsSync(dummyFile)) fs.unlinkSync(dummyFile);
    }
}

testUpload().catch(e => {
    console.error(e);
    process.exit(1);
});
