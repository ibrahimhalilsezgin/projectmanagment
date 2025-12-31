const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const projectsFile = path.join(__dirname, '../projects.json');

const getProjects = () => {
    try {
        const data = fs.readFileSync(projectsFile, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
};

const saveProjects = (projects) => {
    fs.writeFileSync(projectsFile, JSON.stringify(projects, null, 2));
};

router.get('/', (req, res) => {
    res.json(getProjects());
});

const MANAGED_DIR = path.join(__dirname, '../../managed_projects');
if (!fs.existsSync(MANAGED_DIR)) {
    try { fs.mkdirSync(MANAGED_DIR, { recursive: true }); } catch (e) { }
}

router.post('/', (req, res) => {
    const { name, path: projectPath, createManaged } = req.body;

    if (!name) return res.status(400).json({ error: 'Name is required' });

    let finalPath = projectPath;

    if (createManaged) {
        // Sanitize name for folder
        const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
        finalPath = path.join(MANAGED_DIR, safeName);

        if (fs.existsSync(finalPath)) {
            return res.status(400).json({ error: 'Project with this name already exists in managed storage' });
        }

        try {
            fs.mkdirSync(finalPath, { recursive: true });
            // Initialize basic package.json
            fs.writeFileSync(path.join(finalPath, 'package.json'), JSON.stringify({
                name: safeName,
                version: "1.0.0",
                description: "Managed by Node Manager",
                main: "index.js",
                scripts: {
                    "start": "node index.js"
                },
                keywords: [],
                author: "",
                license: "ISC"
            }, null, 2));
            // Create index.js
            fs.writeFileSync(path.join(finalPath, 'index.js'), 'console.log("Hello from Managed Project!");\nsetInterval(() => console.log("Running..."), 5000);');
        } catch (e) {
            return res.status(500).json({ error: 'Failed to create project directory: ' + e.message });
        }
    } else {
        if (!projectPath) return res.status(400).json({ error: 'Path is required for import' });
    }

    const projects = getProjects();
    const newProject = {
        id: Date.now().toString(),
        name,
        path: finalPath,
        status: 'stopped'
    };
    projects.push(newProject);
    saveProjects(projects);
    res.json(newProject);
});

router.delete('/:id', (req, res) => {
    const { id } = req.params;
    let projects = getProjects();
    projects = projects.filter(p => p.id !== id);
    saveProjects(projects);
    res.json({ success: true });
});

router.get('/:id/config', (req, res) => {
    const { id } = req.params;
    const projects = getProjects();
    const project = projects.find(p => p.id === id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const configPath = path.join(project.path, 'nodemanager.json');
    try {
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            res.json(config);
        } else {
            res.json({ command: 'npm', args: ['start'] }); // Default
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to read config' });
    }
});

router.post('/:id/config', (req, res) => {
    const { id } = req.params;
    const { command, args } = req.body;
    const projects = getProjects();
    const project = projects.find(p => p.id === id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const configPath = path.join(project.path, 'nodemanager.json');
    try {
        fs.writeFileSync(configPath, JSON.stringify({ command, args }, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save config' });
    }
});

module.exports = router;
