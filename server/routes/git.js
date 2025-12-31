const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const projectsFile = path.join(__dirname, '../projects.json');

const getProject = (id) => {
    try {
        const data = fs.readFileSync(projectsFile, 'utf8');
        const projects = JSON.parse(data);
        return projects.find(p => p.id === id);
    } catch (err) {
        return null;
    }
};

const runGitCommand = (cmd, cwd, res) => {
    exec(cmd, { cwd }, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: error.message, stderr });
        }
        res.json({ stdout, stderr });
    });
};

router.post('/:id/pull', (req, res) => {
    const project = getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    runGitCommand('git pull', project.path, res);
});

router.post('/:id/push', (req, res) => {
    const project = getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    runGitCommand('git push', project.path, res);
});

router.get('/:id/status', (req, res) => {
    const project = getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    runGitCommand('git status', project.path, res);
});

module.exports = router;
