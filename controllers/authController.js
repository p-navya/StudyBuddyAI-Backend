import { supabase } from '../config/supabase.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { sendWelcomeEmail, sendPasswordResetEmail } from '../services/emailService.js';
import crypto from 'crypto';

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
export const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields (name, email, password)'
      });
    }

    // Check if user already exists (maybeSingle: 0 rows = no error, avoids PGRST116 noise)
    const { data: existingUser, error: lookupError } = await supabase
      .from('users')
      .select('email')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();

    if (lookupError && lookupError.code !== 'PGRST116') {
      console.error('Register lookup error:', lookupError);
    }

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user in Supabase
    const normalizedEmail = email.trim().toLowerCase();

    const { data: user, error } = await supabase
      .from('users')
      .insert([
        {
          name: name.trim(),
          email: normalizedEmail,
          password: hashedPassword,
          role: 'student'
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Register insert error:', error.code, error.message);
      let message = error.message;
      if (error.code === '23505' || /duplicate|unique/i.test(message)) {
        message = 'User already exists with this email';
      } else if (error.code === '42501' || /row-level security|RLS/i.test(message)) {
        message =
          'Registration failed: database permissions. Check Supabase RLS policies allow INSERT on users for the service role.';
      }
      return res.status(400).json({
        success: false,
        message
      });
    }

    // Send welcome email
    if (user) {
      console.log(`📧 Sending welcome email to student: ${normalizedEmail}`);
      sendWelcomeEmail(normalizedEmail, name.trim()).catch((err) =>
        console.error('Failed to send welcome email:', err)
      );
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: 'authenticated', // STANDARD SUPABASE ROLE
        user_role: user.role   // APP-SPECIFIC ROLE
      },
      process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        token,
        user: userWithoutPassword
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find user by email
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .single();

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if password matches
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: 'authenticated', // STANDARD SUPABASE ROLE
        user_role: user.role   // APP-SPECIFIC ROLE
      },
      process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: userWithoutPassword,
        firstLogin: user.first_login || false
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res, next) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, email, role, avatar, first_login, created_at')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        user,
        firstLogin: user.first_login || false
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an email'
      });
    }

    // Find user by email
    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('email', email)
      .single();

    // For security reasons, don't reveal if user exists or not if it's a real prod app, 
    // but here we follow the success pattern.
    if (error || !user) {
      return res.status(200).json({
        success: true,
        message: 'If an account exists, a reset link has been sent.'
      });
    }

    // Generate reset token (in a real app, save this to DB with expiry)
    // For this prototype, we'll generate a random token
    const resetToken = crypto.randomBytes(20).toString('hex');

    // In a real implementation, you'd save resetToken and resetTokenExpire to the user record in Supabase
    // await supabase.from('users').update({ reset_token: resetToken, reset_expire: Date.now() + 3600000 }).eq('id', user.id);

    // Send reset email
    const emailSent = await sendPasswordResetEmail(user.email, resetToken, user.name);

    res.status(200).json({
      success: true,
      message: emailSent ? 'Reset link sent to email' : 'Failed to send email'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
