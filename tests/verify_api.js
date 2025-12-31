const PROJECT_PATH = 'c:/Users/ibrahim/Desktop/projectmanagment/tests/dummy';
const BASE_URL = 'http://localhost:3000';

async function run() {
    try {
        // 1. Add Project
        console.log('Adding project...');
        const addRes = await fetch(`${BASE_URL}/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Dummy App', path: PROJECT_PATH })
        });
        const project = await addRes.json();
        console.log('Project added:', project);

        if (!project.id) throw new Error('No project ID returned');

        // 2. Start Process
        console.log('Starting process...');
        const startRes = await fetch(`${BASE_URL}/process/${project.id}/start`, { method: 'POST' });
        console.log('Start response:', await startRes.json());

        // Wait a bit
        await new Promise(r => setTimeout(r, 2000));

        // 3. Get Stats
        console.log('Getting stats...');
        const statsRes = await fetch(`${BASE_URL}/process/${project.id}/stats`);
        const stats = await statsRes.json();
        console.log('Stats:', stats);

        if (!stats.running) throw new Error('Process should be running');

        // 4. Stop Process
        console.log('Stopping process...');
        const stopRes = await fetch(`${BASE_URL}/process/${project.id}/stop`, { method: 'POST' });
        console.log('Stop response:', await stopRes.json());

        // Wait a bit
        await new Promise(r => setTimeout(r, 1000));

        const finalStatsRes = await fetch(`${BASE_URL}/process/${project.id}/stats`);
        const finalStats = await finalStatsRes.json();
        console.log('Final Stats:', finalStats);

        if (finalStats.running) throw new Error('Process should be stopped');

        console.log('Verification Successful!');

    } catch (e) {
        console.error('Verification Failed:', e);
        process.exit(1);
    }
}

run();
