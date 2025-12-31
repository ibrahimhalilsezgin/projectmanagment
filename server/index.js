const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const app = express();
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});
const port = 3000;

app.set('io', io);

app.use(cors());
app.use(bodyParser.json());

const projectsFile = path.join(__dirname, 'projects.json'); // New
const projectsRoutes = require('./routes/projects'); // Renamed from projectsRouter
const gitRoutes = require('./routes/git'); // Renamed from gitRouter
const processRoutes = require('./routes/process'); // Renamed from processRouter
const filesRoutes = require('./routes/files'); // New

const authRoutes = require('./routes/auth');
const authenticateToken = require('./middleware/auth');

app.use('/auth', authRoutes);

// Protected Routes
app.use('/projects', authenticateToken, projectsRoutes);
app.use('/projects', authenticateToken, filesRoutes);
app.use('/git', authenticateToken, gitRoutes);
app.use('/process', authenticateToken, processRoutes);

app.get('/', (req, res) => {
    res.send('Server is running!');
});

server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    console.log("Files routes loaded.");
});
