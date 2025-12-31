const PROJECT_PATH = 'c:/Users/ibrahim/Desktop/projectmanagment/tests/dummy';
const BASE_URL = 'http://localhost:3000';

async function run() {
    try {
        // 1. Add/Get Project (reuse if exists)
        let projectId;
        const listRes = await fetch(`${BASE_URL}/projects`);
        const projects = await listRes.json();
        const existing = projects.find(p => p.path === PROJECT_PATH);

        if (existing) {
            projectId = existing.id;
            console.log('Using existing project:', projectId);
        } else {
            const addRes = await fetch(`${BASE_URL}/projects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Dummy App', path: PROJECT_PATH })
            });
            const project = await addRes.json();
            projectId = project.id;
            console.log('Project added:', projectId);
        }

        // 2. Start Process
        console.log('Starting process...');
        await fetch(`${BASE_URL}/process/${projectId}/start`, { method: 'POST' });

        await new Promise(r => setTimeout(r, 2000));

        // 3. Kill Process
        console.log('Killing process...');
        const killRes = await fetch(`${BASE_URL}/process/${projectId}/kill`, { method: 'POST' });

        if (!killRes.ok) {
            throw new Error(`Kill failed: ${killRes.status} ${killRes.statusText}`);
        }

        console.log('Kill response:', await killRes.json());

        // Wait a bit
        await new Promise(r => setTimeout(r, 1000));

        const finalStatsRes = await fetch(`${BASE_URL}/process/${projectId}/stats`);
        const finalStats = await finalStatsRes.json();
        console.log('Final Stats:', finalStats);

        if (finalStats.running) throw new Error('Process should be stopped after kill');

        console.log('Kill Verification Successful!');

    } catch (e) {
        console.error('Verification Failed:', e);
        process.exit(1);
    }
}

run();
