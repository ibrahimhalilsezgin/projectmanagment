const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname, '../users.json');
const JWT_SECRET = 'your-secret-key-change-this-in-production'; // TODO: use env var

router.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    try {
        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        const user = users.find(u => u.username === username);

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = bcrypt.compareSync(password, user.passwordHash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, username: user.username });
    } catch (e) {
        console.error('Login error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

const authenticateToken = require('../middleware/auth');

router.post('/change-password', authenticateToken, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const username = req.user.username;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current and new password required' });
    }

    try {
        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        const userIndex = users.findIndex(u => u.username === username);

        if (userIndex === -1) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[userIndex];
        const validPassword = bcrypt.compareSync(currentPassword, user.passwordHash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid current password' });
        }

        const newHash = bcrypt.hashSync(newPassword, 10);
        users[userIndex].passwordHash = newHash;

        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        res.json({ message: 'Password updated successfully' });
    } catch (e) {
        console.error('Change password error:', e);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
