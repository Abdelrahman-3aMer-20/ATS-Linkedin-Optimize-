const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  plan: {
    type: String,
    enum: ['free', 'one-time', 'basic', 'pro'],
    default: 'free'
  },
  planStatus: {
    type: String,
    enum: ['active', 'cancelled', 'expired', 'pending'],
    default: 'active'
  },
  subscriptionId: {
    type: String,
    default: null
  },
  customerId: {
    type: String,
    default: null
  },
  planExpiresAt: {
    type: Date,
    default: null
  },
  usage: {
    cvScans: {
      type: Number,
      default: 0
    },
    linkedinScans: {
      type: Number,
      default: 0
    },
    monthlyResetDate: {
      type: Date,
      default: () => new Date()
    }
  },
  apiKey: {
    type: String,
    default: null
  },
  apiKeyCreatedAt: {
    type: Date,
    default: null
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  lastLoginAt: {
    type: Date,
    default: null
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Generate API key
userSchema.methods.generateApiKey = function() {
  const crypto = require('crypto');
  this.apiKey = `ats_${crypto.randomBytes(32).toString('hex')}`;
  this.apiKeyCreatedAt = new Date();
  return this.apiKey;
};

// Check if user can perform action based on plan
userSchema.methods.canPerformAction = function(action) {
  const now = new Date();
  
  // Check if plan is expired
  if (this.planExpiresAt && now > this.planExpiresAt) {
    return false;
  }
  
  switch (action) {
    case 'cv_scan':
      if (this.plan === 'free') return false;
      if (this.plan === 'one-time') return this.usage.cvScans < 1;
      if (this.plan === 'basic') return this.usage.cvScans < 5;
      if (this.plan === 'pro') return true;
      return false;
      
    case 'linkedin_scan':
      if (this.plan === 'free') return false;
      if (this.plan === 'one-time') return this.usage.linkedinScans < 1;
      if (this.plan === 'basic') return this.usage.linkedinScans < 5;
      if (this.plan === 'pro') return true;
      return false;
      
    case 'pdf_export':
      return this.plan !== 'free';
      
    case 'api_access':
      return this.plan === 'pro';
      
    case 'comparison_view':
      return this.plan === 'pro';
      
    default:
      return false;
  }
};

// Reset monthly usage
userSchema.methods.resetMonthlyUsage = function() {
  const now = new Date();
  const resetDate = new Date(this.usage.monthlyResetDate);
  
  if (now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear()) {
    this.usage.cvScans = 0;
    this.usage.linkedinScans = 0;
    this.usage.monthlyResetDate = now;
  }
};

module.exports = mongoose.model('User', userSchema);
