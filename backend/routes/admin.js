const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const User = require('../models/User');
const CVAnalysis = require('../models/CVAnalysis');
const LinkedInAnalysis = require('../models/LinkedInAnalysis');
const Payment = require('../models/Payment');

const router = express.Router();

// Apply auth and admin middleware to all routes
router.use(auth);
router.use(adminAuth);

// Dashboard stats
router.get('/dashboard', async (req, res) => {
  try {
    const [
      totalUsers,
      activeSubscriptions,
      totalCVAnalyses,
      totalLinkedInAnalyses,
      totalRevenue,
      recentUsers,
      recentPayments
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ plan: { $in: ['basic', 'pro'] }, planStatus: 'active' }),
      CVAnalysis.countDocuments(),
      LinkedInAnalysis.countDocuments(),
      Payment.aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      User.find().sort({ createdAt: -1 }).limit(10).select('firstName lastName email plan createdAt'),
      Payment.find({ status: 'paid' }).sort({ createdAt: -1 }).limit(10).populate('userId', 'firstName lastName email')
    ]);

    const stats = {
      users: {
        total: totalUsers,
        activeSubscriptions,
        growth: 0 // Would calculate from historical data
      },
      analyses: {
        cvTotal: totalCVAnalyses,
        linkedinTotal: totalLinkedInAnalyses,
        totalProcessed: totalCVAnalyses + totalLinkedInAnalyses
      },
      revenue: {
        total: totalRevenue[0]?.total || 0,
        monthly: 0, // Would calculate from current month
        growth: 0 // Would calculate from previous month
      },
      recent: {
        users: recentUsers,
        payments: recentPayments
      }
    };

    res.json(stats);
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// Get all users with pagination
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const plan = req.query.plan || '';

    let query = {};
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } }
      ];
    }
    if (plan) {
      query.plan = plan;
    }

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments(query);

    res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get user details with usage stats
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [cvAnalyses, linkedinAnalyses, payments] = await Promise.all([
      CVAnalysis.find({ userId: user._id }).sort({ createdAt: -1 }).limit(10),
      LinkedInAnalysis.find({ userId: user._id }).sort({ createdAt: -1 }).limit(10),
      Payment.find({ userId: user._id }).sort({ createdAt: -1 }).limit(10)
    ]);

    res.json({
      user,
      activity: {
        cvAnalyses,
        linkedinAnalyses,
        payments
      }
    });
  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

// Update user plan (manual override)
router.patch('/users/:id/plan', async (req, res) => {
  try {
    const { plan, planStatus, planExpiresAt } = req.body;
    
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (plan) user.plan = plan;
    if (planStatus) user.planStatus = planStatus;
    if (planExpiresAt) user.planExpiresAt = new Date(planExpiresAt);

    // Reset usage when changing plan
    user.usage.cvScans = 0;
    user.usage.linkedinScans = 0;
    user.usage.monthlyResetDate = new Date();

    await user.save();

    res.json({ message: 'User plan updated successfully', user });
  } catch (error) {
    console.error('Update user plan error:', error);
    res.status(500).json({ error: 'Failed to update user plan' });
  }
});

// Get all payments with pagination
router.get('/payments', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const status = req.query.status || '';

    let query = {};
    if (status) {
      query.status = status;
    }

    const payments = await Payment.find(query)
      .populate('userId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Payment.countDocuments(query);

    res.json({
      payments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// Get analytics data
router.get('/analytics', async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
    let startDate;
    switch (period) {
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    const [
      userGrowth,
      revenueGrowth,
      analysisVolume,
      planDistribution
    ] = await Promise.all([
      User.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      Payment.aggregate([
        { $match: { createdAt: { $gte: startDate }, status: 'paid' } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            revenue: { $sum: '$amount' }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      CVAnalysis.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            cvCount: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      User.aggregate([
        {
          $group: {
            _id: '$plan',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    res.json({
      userGrowth,
      revenueGrowth,
      analysisVolume,
      planDistribution
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
});

// Export data (CSV format)
router.get('/export/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { startDate, endDate } = req.query;

    let query = {};
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    let data, filename, headers;

    switch (type) {
      case 'users':
        data = await User.find(query).select('-password').lean();
        filename = 'users-export.csv';
        headers = ['Email', 'First Name', 'Last Name', 'Plan', 'Plan Status', 'Created At'];
        break;
      
      case 'payments':
        data = await Payment.find(query).populate('userId', 'email firstName lastName').lean();
        filename = 'payments-export.csv';
        headers = ['User Email', 'Amount', 'Plan', 'Status', 'Created At'];
        break;
      
      default:
        return res.status(400).json({ error: 'Invalid export type' });
    }

    // Convert to CSV
    const csv = convertToCSV(data, type);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);

  } catch (error) {
    console.error('Export data error:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// Helper function to convert data to CSV
function convertToCSV(data, type) {
  if (!data.length) return '';

  let headers, rows;

  switch (type) {
    case 'users':
      headers = ['Email', 'First Name', 'Last Name', 'Plan', 'Plan Status', 'Created At'];
      rows = data.map(user => [
        user.email,
        user.firstName,
        user.lastName,
        user.plan,
        user.planStatus,
        user.createdAt.toISOString()
      ]);
      break;
    
    case 'payments':
      headers = ['User Email', 'Amount', 'Plan', 'Status', 'Created At'];
      rows = data.map(payment => [
        payment.userId?.email || 'N/A',
        payment.amount,
        payment.plan,
        payment.status,
        payment.createdAt.toISOString()
      ]);
      break;
  }

  const csvContent = [headers, ...rows]
    .map(row => row.map(field => `"${field}"`).join(','))
    .join('\n');

  return csvContent;
}

module.exports = router;
