const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token, authorization denied' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.userId = decoded.userId;
    
    // Get user and attach to request
    const user = await User.findById(req.userId).select('-password');
    if (!user) {
      return res.status(401).json({ error: 'Token is not valid' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Token is not valid' });
  }
};

// API Key authentication middleware
const apiAuth = async (req, res, next) => {
  try {
    const apiKey = req.header('X-API-Key');
    
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }

    const user = await User.findOne({ apiKey }).select('-password');
    if (!user) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    if (!user.canPerformAction('api_access')) {
      return res.status(403).json({ error: 'API access requires Pro plan' });
    }

    req.userId = user._id;
    req.user = user;
    next();
  } catch (error) {
    console.error('API auth middleware error:', error);
    res.status(401).json({ error: 'Invalid API key' });
  }
};

// Admin middleware
const adminAuth = async (req, res, next) => {
  try {
    if (!req.user || !req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (error) {
    console.error('Admin auth middleware error:', error);
    res.status(403).json({ error: 'Admin access required' });
  }
};

// Plan-based access middleware
const requirePlan = (requiredPlans) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userPlan = req.user.plan;
      if (!requiredPlans.includes(userPlan)) {
        return res.status(403).json({ 
          error: `This feature requires one of the following plans: ${requiredPlans.join(', ')}`,
          currentPlan: userPlan
        });
      }

      // Check if plan is expired
      if (req.user.planExpiresAt && new Date() > req.user.planExpiresAt) {
        return res.status(403).json({ 
          error: 'Your plan has expired. Please renew to continue.',
          expired: true
        });
      }

      next();
    } catch (error) {
      console.error('Plan auth middleware error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  };
};

module.exports = { auth, apiAuth, adminAuth, requirePlan };
