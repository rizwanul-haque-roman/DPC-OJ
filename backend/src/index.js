const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // handle form data too

// Health check (put BEFORE routes)
app.get('/', (req, res) => {
  res.json({ message: 'Online Judge API running' });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/problems', require('./routes/problems'));
app.use('/api/submissions', require('./routes/submissions'));
app.use('/api/contests', require('./routes/contests'));
app.use('/api/profiles', require('./routes/profiles'));
app.use('/api/admin/dashboard', require('./routes/adminDashboard'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/learn',    require('./routes/learn'));
app.use('/api/admin', require('./routes/adminLearning'));
app.use('/api/admin', require('./routes/adminLearningPractice'));

// 404 handler (after all routes)
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler (must have 4 params)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});