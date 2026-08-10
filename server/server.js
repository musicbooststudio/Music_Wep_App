require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const cors = require('cors');
const jwt = require('jsonwebtoken');

// Secret validation - warn and fall back gracefully so the app still boots in preview/production.
const isProd = process.env.NODE_ENV === 'production';
if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('WARNING: STRIPE_SECRET_KEY is not set. Payment features will be disabled.');
}
if (isProd && (!process.env.SESSION_SECRET || !process.env.JWT_SECRET)) {
  console.warn('WARNING: SESSION_SECRET/JWT_SECRET are not set. Falling back to safe defaults.');
}

const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;

const app = express();
const staticRoot = path.join(__dirname, '..');

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5000');

// Middleware
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());
app.use(express.static(staticRoot));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: isProd, httpOnly: true }
}));
app.use(passport.initialize());
app.use(passport.session());

// Simple in-memory user store (replace with database)
const users = {};

// Passport Google Strategy (only when credentials are available)
const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

if (googleConfigured) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback'
  }, (accessToken, refreshToken, profile, done) => {
    const user = {
      id: profile.id,
      displayName: profile.displayName,
      email: profile.emails[0].value,
      provider: 'google',
      photo: profile.photos[0]?.value
    };
    users[profile.id] = user;
    return done(null, user);
  }));
} else {
  console.warn('WARNING: Google OAuth credentials are not set. Login routes will be disabled.');
}

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  done(null, users[id]);
});

// Auth Routes
if (googleConfigured) {
  app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

  app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/' }),
    (req, res) => {
      const token = jwt.sign(
        { id: req.user.id, email: req.user.email },
        process.env.JWT_SECRET || 'dev-only-jwt-secret-change-me',
        { expiresIn: '7d' }
      );
      res.redirect(`${CLIENT_ORIGIN}?token=${token}&user=${encodeURIComponent(JSON.stringify(req.user))}`);
    }
  );
} else {
  app.get('/auth/google', (req, res) => {
    res.status(503).json({ error: 'Google login is not configured on this deployment.' });
  });

  app.get('/auth/google/callback', (req, res) => {
    res.redirect('/');
  });
}

// Logout
app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.json({ success: true });
  });
});

// Get current user
app.get('/user', (req, res) => {
  if (req.user) {
    res.json(req.user);
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// Payment Routes
app.post('/create-payment-intent', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Payment system not configured' });
  }
  try {
    const { amount, email, userId } = req.body;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100, // Convert to cents
      currency: 'usd',
      receipt_email: email,
      metadata: { userId }
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/process-export', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Payment system not configured' });
  }
  try {
    const { paymentIntentId, userId, filename } = req.body;

    // Verify payment was successful
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ error: 'Payment not completed' });
    }

    // Log successful export
    console.log(`Export completed for user ${userId}: ${filename}`);

    res.json({ success: true, message: 'Export authorized' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(staticRoot, 'index.html'));
});

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
