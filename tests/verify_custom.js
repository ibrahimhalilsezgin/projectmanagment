const PROJECT_PATH = 'c:/Users/ibrahim/Desktop/projectmanagment/tests/dummy';
const BASE_URL = 'http://localhost:3000';
const fs = require('fs');
const path = require('path');

async function run() {
    try {
        // 1. Create custom script file
        const customScriptPath = path.join(PROJECT_PATH, 'custom.js');
        fs.writeFileSync(customScriptPath, "console.log('Running custom script!'); setInterval(() => {}, 1000);");

        // 2. Add/Get Project
        let projectId;
        const listRes = await fetch(`${BASE_URL}/projects`);
        const projects = await listRes.json();
        const existing = projects.find(p => p.path === PROJECT_PATH);

        if (existing) projectId = existing.id;
        else {
            // ... handling if not exists
            const addRes = await fetch(`${BASE_URL}/projects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Dummy App', path: PROJECT_PATH })
            });
            projectId = (await addRes.json()).id;
        }

        // 3. Set Config
        console.log('Setting config...');
        await fetch(`${BASE_URL}/projects/${projectId}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'node', args: ['custom.js'] })
        });

        // 4. Start Process
        console.log('Starting process...');
        // Ensure stopped first
        await fetch(`${BASE_URL}/process/${projectId}/stop`, { method: 'POST' });
        await new Promise(r => setTimeout(r, 1000));

        await fetch(`${BASE_URL}/process/${projectId}/start`, { method: 'POST' });

        // 5. Verify Logs (manual check or socket io check)
        // For simple verification, we just check if it stays running. 
        // Real verification of "custom script" content would require socket connection in test script.

        await new Promise(r => setTimeout(r, 2000));
        const stats = await (await fetch(`${BASE_URL}/process/${projectId}/stats`)).json();
        console.log('Stats:', stats);

        if (!stats.running) throw new Error('Process failed to start with custom script');

        // Verify nodemanager.json exists
        const configPath = path.join(PROJECT_PATH, 'nodemanager.json');
        if (!fs.existsSync(configPath)) throw new Error('nodemanager.json not created');

        console.log('Custom Script Verification Successful!');

        // Cleanup
        await fetch(`${BASE_URL}/process/${projectId}/stop`, { method: 'POST' });

    } catch (e) {
        console.error('Verification Failed:', e);
        process.exit(1);
    }
}

run();
