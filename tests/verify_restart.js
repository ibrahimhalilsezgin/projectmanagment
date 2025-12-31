const PROJECT_PATH = 'c:/Users/ibrahim/Desktop/projectmanagment/tests/dummy';
const BASE_URL = 'http://localhost:3000';

async function run() {
    try {
        // 1. Add/Get Project
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

        // 2. Start Process if not running
        const statsBefore = await (await fetch(`${BASE_URL}/process/${projectId}/stats`)).json();
        if (!statsBefore.running) {
            console.log('Starting process...');
            await fetch(`${BASE_URL}/process/${projectId}/start`, { method: 'POST' });
            await new Promise(r => setTimeout(r, 2000));
        }

        // 3. Restart Process
        console.log('Restarting process...');
        const restartRes = await fetch(`${BASE_URL}/process/${projectId}/restart`, { method: 'POST' });
        console.log('Restart response:', await restartRes.json());

        // Wait for restart (stop + start delay)
        await new Promise(r => setTimeout(r, 3000));

        const finalStats = await (await fetch(`${BASE_URL}/process/${projectId}/stats`)).json();
        console.log('Final Stats:', finalStats);

        if (!finalStats.running) throw new Error('Process should be running after restart');

        console.log('Restart Verification Successful!');

    } catch (e) {
        console.error('Verification Failed:', e);
        process.exit(1);
    }
}

run();
