const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const AdmZip = require('adm-zip');

const upload = multer({ dest: path.join(__dirname, '../temp_uploads') });
// Ensure temp dir exists
if (!fs.existsSync(path.join(__dirname, '../temp_uploads'))) {
    try { fs.mkdirSync(path.join(__dirname, '../temp_uploads')); } catch (e) { }
}

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

// Middleware to resolve path safely
const resolvePath = (req, res, next) => {
    const { id } = req.params;
    const relativePath = req.query.path || '.';
    const project = getProject(id);

    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Prevent path traversal
    const safePath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
    const projectRoot = path.normalize(project.path);
    const absolutePath = path.join(projectRoot, safePath);

    console.log(`[Files] Check: Root='${projectRoot}', Abs='${absolutePath}'`);

    // Verify it is still inside project path
    if (!absolutePath.startsWith(projectRoot)) {
        return res.status(403).json({
            error: 'Access denied: Path outside project',
            debug: { absolutePath, projectRoot }
        });
    }

    req.fsPath = absolutePath;
    next();
};

router.get('/:id/files', resolvePath, (req, res) => {
    try {
        if (!fs.existsSync(req.fsPath)) {
            return res.status(404).json({ error: 'Path not found' });
        }

        const stats = fs.statSync(req.fsPath);
        if (!stats.isDirectory()) {
            return res.status(400).json({ error: 'Not a directory' });
        }

        const items = fs.readdirSync(req.fsPath, { withFileTypes: true });
        const result = items.map(item => ({
            name: item.name,
            isDirectory: item.isDirectory(),
            size: item.isDirectory() ? 0 : fs.statSync(path.join(req.fsPath, item.name)).size
        }));

        // Sort: Directories first
        result.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });

        res.json(result);
    } catch (err) {
        console.error('File list error:', err);
        res.status(500).json({ error: 'Failed to list files' });
    }
});

router.get('/:id/files/read', resolvePath, (req, res) => {
    try {
        if (!fs.existsSync(req.fsPath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Basic check for text file (or just try reading as utf8)
        // If it's binary, it might send garbage.
        // For MVP, assume text or limit size.
        const content = fs.readFileSync(req.fsPath, 'utf8');
        res.json({ content });
    } catch (err) {
        console.error('File read error:', err);
        res.status(500).json({ error: 'Failed to read file' });
    }
});

router.post('/:id/files/upload', upload.array('files'), resolvePath, (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const targetDir = req.fsPath;

        // resolvePath sets req.fsPath based on query.path. 
        // If uploading to directory, that's fine.
        // We should verify targetDir is indeed a directory.
        if (fs.existsSync(targetDir) && !fs.statSync(targetDir).isDirectory()) {
            // If user pointed to a file as "path", maybe they meant "parent of", or it's an error.
            // For now assume path MUST be the target folder.
            return res.status(400).json({ error: 'Target path is not a directory' });
        }

        const movedFiles = [];
        req.files.forEach(file => {
            const targetPath = path.join(targetDir, file.originalname);

            // Basic security: don't allow overwriting outside target via weird filenames if multer didn't catch it
            // file.originalname *should* be safe-ish but let's be careful.
            if (path.dirname(targetPath) !== targetDir) {
                // Skip if filename tries to traverse
                return;
            }

            fs.renameSync(file.path, targetPath);
            movedFiles.push(file.originalname);
        });

        res.json({ message: `Uploaded ${movedFiles.length} files`, files: movedFiles });

    } catch (err) {
        console.error('Upload error:', err);
        // Clean up temp files if possible (fs.renameSync moves them, so maybe only on error)
        res.status(500).json({ error: 'Failed to process uploads' });
    }
});

// Helper for security check, reusing logic but without middleware overhead if we want manual calls, 
// BUT we should reuse `resolvePath` middleware for consistent checks, just hijacking req.query.path if needed
// Or just replicate checks. Replicating checks is safer for custom bodies.

// DELETE /:id/files/delete
router.post('/:id/files/delete', (req, res) => {
    const { id } = req.params;
    const { items, currentPath } = req.body; // items: ['rel/path/1', 'rel/path/2'] relative to currentPath or project root?
    // Let's assume items are filenames in 'currentPath'.

    if (!items || !Array.isArray(items)) return res.status(400).json({ error: 'Items array required' });

    const project = getProject(id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const projectRoot = path.normalize(project.path);

    // Resolve base directory
    const safeBase = path.normalize(currentPath || '.').replace(/^(\.\.[\/\\])+/, '');
    const absoluteBase = path.join(projectRoot, safeBase);

    if (!absoluteBase.startsWith(projectRoot)) {
        return res.status(403).json({ error: 'Access denied: Path outside project' });
    }

    const deleted = [];
    const errors = [];

    items.forEach(paramName => {
        // paramName usually just filename if we send currentPath separately
        const safeName = path.normalize(paramName).replace(/^(\.\.[\/\\])+/, '');
        const targetPath = path.join(absoluteBase, safeName);

        if (!targetPath.startsWith(projectRoot)) {
            errors.push(`${paramName}: Access Denied`);
            return;
        }

        try {
            if (fs.existsSync(targetPath)) {
                fs.rmSync(targetPath, { recursive: true, force: true });
                deleted.push(paramName);
            } else {
                errors.push(`${paramName}: Not found`);
            }
        } catch (e) {
            errors.push(`${paramName}: ${e.message}`);
        }
    });

    res.json({ deleted, errors });
});

// POST /:id/files/unzip
router.post('/:id/files/unzip', (req, res) => {
    const { id } = req.params;
    const { filePath } = req.body; // Relative path to zip file

    if (!filePath) return res.status(400).json({ error: 'File path required' });

    const project = getProject(id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const projectRoot = path.normalize(project.path);

    const safeRel = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
    const absoluteZipPath = path.join(projectRoot, safeRel);

    if (!absoluteZipPath.startsWith(projectRoot)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(absoluteZipPath)) return res.status(404).json({ error: 'Zip file not found' });

    try {
        const zip = new AdmZip(absoluteZipPath);
        const targetDir = path.dirname(absoluteZipPath); // Extract to same folder
        zip.extractAllTo(targetDir, true);
        res.json({ message: 'Extracted successfully' });
    } catch (e) {
        console.error('Unzip error:', e);
        res.status(500).json({ error: 'Failed to unzip: ' + e.message });
    }
});

// POST /:id/files/create
router.post('/:id/files/create', (req, res) => {
    const { id } = req.params;
    const { parentPath, name, type } = req.body; // type: 'file' | 'directory'

    if (!name || !type) return res.status(400).json({ error: 'Name and type required' });

    const project = getProject(id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const projectRoot = path.normalize(project.path);

    const safeParent = path.normalize(parentPath || '.').replace(/^(\.\.[\/\\])+/, '');
    const safeName = path.normalize(name).replace(/^(\.\.[\/\\])+/, '');

    const absoluteTarget = path.join(projectRoot, safeParent, safeName);

    // Security check
    if (!absoluteTarget.startsWith(projectRoot)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    if (fs.existsSync(absoluteTarget)) {
        return res.status(400).json({ error: 'Item already exists' });
    }

    try {
        if (type === 'directory') {
            fs.mkdirSync(absoluteTarget, { recursive: true });
        } else {
            fs.writeFileSync(absoluteTarget, '');
        }
        res.json({ message: 'Created successfully', name: safeName });
    } catch (e) {
        res.status(500).json({ error: 'Creation failed: ' + e.message });
    }
});

// PUT /:id/files/write
router.put('/:id/files/write', (req, res) => {
    const { id } = req.params;
    const { path: filePath, content } = req.body;

    if (!filePath || content === undefined) return res.status(400).json({ error: 'Path and content required' });

    const project = getProject(id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const projectRoot = path.normalize(project.path);

    const safeRel = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
    const absoluteTarget = path.join(projectRoot, safeRel);

    if (!absoluteTarget.startsWith(projectRoot)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    try {
        // Ensure parent dir exists? OR fail if not? usually editing existing file so dir exists.
        // If creating new via editor, we might need mkdir.
        // Let's assume directory exists for now as we usually open existing files.
        fs.writeFileSync(absoluteTarget, content, 'utf8');
        res.json({ message: 'File saved' });
    } catch (e) {
        res.status(500).json({ error: 'Save failed: ' + e.message });
    }
});

module.exports = router;
