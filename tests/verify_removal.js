const BASE_URL = 'http://localhost:3000';

async function run() {
    try {
        console.log('Adding project to remove...');
        const addRes = await fetch(`${BASE_URL}/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Temp Project', path: 'C:/Temp/Project' })
        });
        const project = await addRes.json();
        const id = project.id;
        console.log(`Added project ${id}`);

        // Verify it's in the list
        let projects = await (await fetch(`${BASE_URL}/projects`)).json();
        if (!projects.find(p => p.id === id)) throw new Error('Project not added');

        // Delete it
        console.log(`Deleting project ${id}...`);
        await fetch(`${BASE_URL}/projects/${id}`, { method: 'DELETE' });

        // Verify it's gone
        projects = await (await fetch(`${BASE_URL}/projects`)).json();
        if (projects.find(p => p.id === id)) throw new Error('Project not deleted');

        console.log('Project Removal Verification Successful!');

    } catch (e) {
        console.error('Verification Failed:', e);
        process.exit(1);
    }
}

run();
