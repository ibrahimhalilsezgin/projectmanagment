const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const treeKill = require('tree-kill');

const projectsFile = path.join(__dirname, '../projects.json');
const runningProcesses = {};

const getProject = (id) => {
    try {
        const data = fs.readFileSync(projectsFile, 'utf8');
        const projects = JSON.parse(data);
        return projects.find(p => p.id === id);
    } catch (err) {
        return null;
    }
};



const getRunningApps = (id) => {
    if (!runningProcesses[id]) runningProcesses[id] = {};
    return runningProcesses[id];
};

const updateProjectStatus = (id) => {
    try {
        const data = fs.readFileSync(projectsFile, 'utf8');
        const projects = JSON.parse(data);
        const project = projects.find(p => p.id === id);
        if (project) {
            const apps = getRunningApps(id);
            const isRunning = Object.keys(apps).length > 0;
            project.status = isRunning ? 'running' : 'stopped';
            fs.writeFileSync(projectsFile, JSON.stringify(projects, null, 2));
        }
    } catch (err) {
        console.error('Error updating status:', err);
    }
}

router.post('/:id/start', (req, res) => {
    const { id } = req.params;
    const { appName = 'default' } = req.body || {};

    const apps = getRunningApps(id);
    if (apps[appName]) {
        return res.status(400).json({ error: `Process ${appName} already running` });
    }

    const project = getProject(id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const io = req.app.get('io');

    startProject(id, project, io, appName);
    res.json({ success: true });
});

const startProject = (id, project, io, appName) => {
    let command = 'npm';
    let args = ['start'];
    let cwd = project.path;

    const configPath = path.join(project.path, 'nodemanager.json');
    try {
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

            // Multi-app config
            if (config.apps && Array.isArray(config.apps)) {
                const appConfig = config.apps.find(a => a.name === appName);
                if (appConfig) {
                    if (appConfig.command) command = appConfig.command;
                    if (appConfig.args) args = appConfig.args;
                    if (appConfig.path) cwd = path.join(project.path, appConfig.path);
                } else if (appName === 'default' && config.apps.length > 0) {
                    // Default to first app if 'default' requested but config has apps
                    // But strictly, frontend should pass appName if apps exist.
                    // Fallback: use first app config
                    const first = config.apps[0];
                    command = first.command || command;
                    args = first.args || args;
                    if (first.path) cwd = path.join(project.path, first.path);
                }
            }
            // Legacy/Single Config
            else {
                if (config.command) command = config.command;
                if (config.args) args = config.args;
            }
        }
    } catch (e) {
        console.error('Failed to read config, using default:', e);
    }

    // console.log(`Starting ${appName} in ${cwd}: ${command} ${args.join(' ')}`);
    const child = spawn(command, args, { cwd, shell: true });

    child.stdout.on('data', (data) => {
        io.emit(`log:${id}:${appName}`, data.toString());
        // For backward compatibility (if single app)
        if (appName === 'default') io.emit(`log:${id}`, data.toString());
    });

    child.stderr.on('data', (data) => {
        io.emit(`log:${id}:${appName}`, data.toString());
        if (appName === 'default') io.emit(`log:${id}`, data.toString());
    });

    child.on('error', (err) => {
        const msg = `Failed to start process ${appName}: ${err.message}`;
        console.error(msg);
        io.emit(`log:${id}:${appName}`, msg);
        if (appName === 'default') io.emit(`log:${id}`, msg);
    });

    child.on('close', (code) => {
        const msg = `Process ${appName} exited with code ${code}`;
        io.emit(`log:${id}:${appName}`, msg);
        if (appName === 'default') io.emit(`log:${id}`, msg);

        const currentApps = getRunningApps(id);
        delete currentApps[appName];
        updateProjectStatus(id);
    });

    getRunningApps(id)[appName] = { process: child, startTime: Date.now() };
    updateProjectStatus(id);
};


router.post('/:id/stop', async (req, res) => {
    const { id } = req.params;
    const { appName = 'default' } = req.body || {};

    const apps = getRunningApps(id);
    const processInfo = apps[appName];

    if (!processInfo) {
        return res.status(400).json({ error: `Process ${appName} not running` });
    }

    treeKill(processInfo.process.pid, 'SIGTERM', (err) => {
        if (err) console.error('Failed to kill process:', err);
        res.json({ success: true });
    });
});

router.post('/:id/kill', async (req, res) => {
    const { id } = req.params;
    const { appName = 'default' } = req.body || {};

    const apps = getRunningApps(id);
    const processInfo = apps[appName];

    if (!processInfo) {
        return res.status(400).json({ error: `Process ${appName} not running` });
    }

    treeKill(processInfo.process.pid, 'SIGKILL', (err) => {
        if (err) console.error('Failed to kill process:', err);
        res.json({ success: true });
    });
});

router.post('/:id/restart', (req, res) => {
    const { id } = req.params;
    const { appName = 'default' } = req.body || {};

    const project = getProject(id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const io = req.app.get('io');

    const apps = getRunningApps(id);
    const processInfo = apps[appName];

    if (processInfo) {
        treeKill(processInfo.process.pid, 'SIGTERM', (err) => {
            if (err) console.error('Failed to stop for restart:', err);

            setTimeout(() => {
                if (!apps[appName]) {
                    startProject(id, project, io, appName);
                } else {
                    delete apps[appName]; // Cleanup
                    startProject(id, project, io, appName);
                }
            }, 1000);
        });
        res.json({ success: true, message: 'Restarting...' });
    } else {
        startProject(id, project, io, appName);
        res.json({ success: true, message: 'Started' });
    }
});


const pidusage = require('pidusage');

router.get('/:id/stats', async (req, res) => {
    const { id } = req.params;
    const apps = getRunningApps(id);
    const stats = {};
    const pids = [];
    const appMap = {}; // pid -> appName

    for (const [name, info] of Object.entries(apps)) {
        pids.push(info.process.pid);
        appMap[info.process.pid] = name;
        stats[name] = {
            running: true,
            uptime: Date.now() - info.startTime,
            cpu: 0,
            memory: 0
        };
    }

    if (pids.length === 0) {
        return res.json({ running: false, apps: {} });
    }

    try {
        const usages = await pidusage(pids);
        // Usages is object { pid: { cpu, memory, ... } }
        for (const [pid, usage] of Object.entries(usages)) {
            const name = appMap[pid];
            if (stats[name]) {
                stats[name].cpu = usage.cpu;
                stats[name].memory = usage.memory;
            }
        }
        res.json({ running: true, apps: stats });
    } catch (e) {
        console.error("Stats error:", e);
        // Fallback if pidusage fails (e.g. process just died)
        res.json({ running: true, apps: stats });
    }
});

module.exports = router;
