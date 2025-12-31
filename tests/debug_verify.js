const PROJECT_PATH = 'c:/Users/ibrahim/Desktop/projectmanagment/tests/dummy';
const BASE_URL = 'http://localhost:3000';
const fs = require('fs');
const path = require('path');
const io = require('socket.io-client');

async function run() {
    try {
        const customScriptPath = path.join(PROJECT_PATH, 'custom.js');
        fs.writeFileSync(customScriptPath, "console.log('Running custom script!'); setInterval(() => {}, 1000);");

        let projectId;
        const listRes = await fetch(`${BASE_URL}/projects`);
        const projects = await listRes.json();
        const existing = projects.find(p => p.path === PROJECT_PATH);

        if (existing) projectId = existing.id;
        else {
            const addRes = await fetch(`${BASE_URL}/projects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Dummy App', path: PROJECT_PATH })
            });
            projectId = (await addRes.json()).id;
        }

        console.log('Setting config...');
        await fetch(`${BASE_URL}/projects/${projectId}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: 'node', args: ['custom.js'] })
        });

        const socket = io(BASE_URL);
        socket.on(`log:${projectId}`, (data) => console.log('LOG:', data));
        socket.on(`log:${projectId}:default`, (data) => console.log('LOG[default]:', data));

        console.log('Starting process...');
        await fetch(`${BASE_URL}/process/${projectId}/stop`, { method: 'POST' });
        await new Promise(r => setTimeout(r, 1000));
        await fetch(`${BASE_URL}/process/${projectId}/start`, { method: 'POST' });

        await new Promise(r => setTimeout(r, 3000));

        const stats = await (await fetch(`${BASE_URL}/process/${projectId}/stats`)).json();
        console.log('Stats:', stats);

        socket.disconnect();

    } catch (e) {
        console.error('Failed:', e);
    }
}

run();
