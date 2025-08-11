const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lemonSqueezyOrderId: {
    type: String,
    required: true,
    unique: true
  },
  lemonSqueezyCustomerId: {
    type: String,
    required: true
  },
  lemonSqueezySubscriptionId: {
    type: String,
    default: null
  },
  productName: {
    type: String,
    required: true
  },
  variantName: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'USD'
  },
  paymentType: {
    type: String,
    enum: ['one-time', 'subscription'],
    required: true
  },
  plan: {
    type: String,
    enum: ['one-time', 'basic', 'pro'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded', 'cancelled'],
    default: 'pending'
  },
  subscriptionStatus: {
    type: String,
    enum: ['active', 'cancelled', 'expired', 'past_due', 'unpaid'],
    default: null
  },
  billingCycle: {
    type: String,
    enum: ['monthly', 'yearly'],
    default: null
  },
  currentPeriodStart: {
    type: Date,
    default: null
  },
  currentPeriodEnd: {
    type: Date,
    default: null
  },
  webhookData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  refundAmount: {
    type: Number,
    default: 0
  },
  refundReason: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ lemonSqueezyOrderId: 1 });
paymentSchema.index({ lemonSqueezySubscriptionId: 1 });
paymentSchema.index({ status: 1 });

// Check if payment is active
paymentSchema.methods.isActive = function() {
  if (this.paymentType === 'one-time') {
    return this.status === 'paid';
  }
  
  if (this.paymentType === 'subscription') {
    return this.subscriptionStatus === 'active' && 
           this.currentPeriodEnd && 
           new Date() < this.currentPeriodEnd;
  }
  
  return false;
};

// Get plan limits based on payment
paymentSchema.methods.getPlanLimits = function() {
  const limits = {
    'one-time': {
      cvScans: 1,
      linkedinScans: 1,
      pdfExport: true,
      apiAccess: false,
      comparisonView: false
    },
    'basic': {
      cvScans: 5,
      linkedinScans: 5,
      pdfExport: true,
      apiAccess: false,
      comparisonView: false
    },
    'pro': {
      cvScans: -1, // unlimited
      linkedinScans: -1, // unlimited
      pdfExport: true,
      apiAccess: true,
      comparisonView: true
    }
  };
  
  return limits[this.plan] || limits['one-time'];
};

module.exports = mongoose.model('Payment', paymentSchema);
