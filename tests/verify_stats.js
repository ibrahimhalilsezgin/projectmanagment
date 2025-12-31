
const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:3000';
let projectId = null;

async function testMonitoring() {
    console.log("1. Get Project ID...");
    const projects = await (await fetch(`${API_URL}/projects`)).json();
    let project = projects.find(p => p.name === "ManagedApp" || p.name === "FileTestProject");

    // Create temp if needed
    if (!project) {
        console.log("Creating temp project for stats...");
        const pathVal = path.join(__dirname, 'stats_dummy');
        if (!fs.existsSync(pathVal)) fs.mkdirSync(pathVal);
        fs.writeFileSync(path.join(pathVal, 'package.json'), JSON.stringify({ name: 'stats-test', scripts: { start: 'node index.js' } }));
        fs.writeFileSync(path.join(pathVal, 'index.js'), 'console.log("Stats running..."); setInterval(() => {}, 1000);');

        const res = await fetch(`${API_URL}/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: "StatsTest", path: pathVal })
        });
        project = await res.json();
    }
    projectId = project.id;
    console.log(`Project ID: ${projectId}`);

    console.log("2. Start Process...");
    const startRes = await fetch(`${API_URL}/process/${projectId}/start`, { method: 'POST' });
    if (!startRes.ok && (await startRes.json()).error !== "Process default already running") {
        // It might be running from prev test
        console.log("Start warning:", await startRes.text());
    }

    // Wait for process to spin up and pidusage to register
    console.log("Waiting 2s...");
    await new Promise(r => setTimeout(r, 2000));

    console.log("3. Fetch Stats...");
    const statsRes = await fetch(`${API_URL}/process/${projectId}/stats`);
    const stats = await statsRes.json();
    console.log("Stats Response:", JSON.stringify(stats, null, 2));

    if (!stats.running) throw new Error("Stats say not running!");
    const appStats = Object.values(stats.apps)[0];
    if (appStats.cpu === undefined || appStats.memory === undefined) throw new Error("CPU/Memory missing from stats");

    console.log("Stats verified.");

    console.log("4. Stop Process...");
    await fetch(`${API_URL}/process/${projectId}/stop`, { method: 'POST' });

    console.log("Waiting 1s for stop...");
    await new Promise(r => setTimeout(r, 1000));

    console.log("5. Verify Status is Stopped...");
    const statsRes2 = await fetch(`${API_URL}/process/${projectId}/stats`);
    const stats2 = await statsRes2.json();
    console.log("Stats After Stop:", JSON.stringify(stats2, null, 2));

    if (stats2.running) throw new Error("Still running after stop!");

    console.log("SUCCESS: Monitoring works.");
}

testMonitoring().catch(e => {
    console.error(e);
    process.exit(1);
});
