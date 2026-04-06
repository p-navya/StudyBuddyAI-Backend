import express from 'express';
console.log('--- SERVER STARTING ---');
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import chatbotRoutes from './routes/chatbotRoutes.js';
import resourceRoutes from './routes/resourceRoutes.js';
import groupRoutes from './routes/groupRoutes.js';
import activityRoutes from './routes/activityRoutes.js';
import quizRoutes from './routes/quizRoutes.js';
import taskRoutes from './routes/taskRoutes.js';
import { supabase } from './config/supabase.js';

// Load environment variables
dotenv.config();

const app = express();

// Middleware - CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    const envOrigins = (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean);

    const allowedOrigins = [
      'http://localhost:5173',
      'https://studybuddy-project.vercel.app',
      'https://grahmind.com',
      'https://www.grahmind.com',
      process.env.FRONTEND_URL,
      ...envOrigins
    ]
      .filter(Boolean)
      .map((o) => o.replace(/\/$/, ''));

    // Normalize origin by removing trailing slash
    const normalizedOrigin = origin.replace(/\/$/, '');

    // Check if origin is allowed (normalize allowed origins too)
    const isAllowed = allowedOrigins.some(allowed => {
      const normalizedAllowed = allowed.replace(/\/$/, '');
      return normalizedOrigin === normalizedAllowed;
    });

    if (isAllowed) {
      // Return the normalized origin (without trailing slash) in the response
      callback(null, normalizedOrigin);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Test Supabase connection
const testConnection = async () => {
  try {
    const { data, error } = await supabase.from('users').select('count').limit(1);
    if (error && error.code !== 'PGRST116') { // PGRST116 = table doesn't exist yet (expected)
      console.log('Supabase connection test:', error.message);
    } else {
      console.log('Supabase connected successfully');
    }
  } catch (error) {
    console.log('Supabase connection:', error.message);
  }
};

testConnection();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/tasks', taskRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'StudyBuddy API is running',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
