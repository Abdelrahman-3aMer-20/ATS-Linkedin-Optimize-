const express = require('express');
const rateLimit = require('express-rate-limit');
const { apiAuth } = require('../middleware/auth');
const CVAnalysis = require('../models/CVAnalysis');
const LinkedInAnalysis = require('../models/LinkedInAnalysis');

const router = express.Router();

// API rate limiting (more restrictive than web interface)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each API key to 50 requests per windowMs
  message: {
    error: 'API rate limit exceeded',
    retryAfter: '15 minutes'
  },
  keyGenerator: (req) => req.header('X-API-Key') || req.ip
});

router.use(apiLimiter);
router.use(apiAuth);

// API Documentation endpoint
router.get('/docs', (req, res) => {
  res.json({
    name: 'ATS CV Optimizer API',
    version: '1.0.0',
    description: 'API for CV and LinkedIn profile optimization',
    endpoints: {
      'GET /api/v1/user': 'Get current user information',
      'GET /api/v1/cv/analyses': 'Get CV analysis history',
      'GET /api/v1/cv/analysis/:id': 'Get specific CV analysis',
      'GET /api/v1/linkedin/analyses': 'Get LinkedIn analysis history',
      'GET /api/v1/linkedin/analysis/:id': 'Get specific LinkedIn analysis',
      'POST /api/v1/cv/analyze-text': 'Analyze CV text content',
      'POST /api/v1/linkedin/analyze-content': 'Analyze LinkedIn content'
    },
    authentication: {
      type: 'API Key',
      header: 'X-API-Key',
      note: 'API access requires Pro plan'
    },
    rateLimit: {
      requests: 50,
      window: '15 minutes'
    }
  });
});

// Get current user info
router.get('/user', async (req, res) => {
  try {
    const user = req.user;
    res.json({
      id: user._id,
      email: user.email,
      plan: user.plan,
      usage: user.usage,
      apiKeyCreatedAt: user.apiKeyCreatedAt
    });
  } catch (error) {
    console.error('API get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user information' });
  }
});

// Get CV analyses
router.get('/cv/analyses', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50); // Max 50 per request
    const skip = (page - 1) * limit;

    const analyses = await CVAnalysis.find({ userId: req.userId })
      .select('originalFileName atsScore status createdAt processingTime')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await CVAnalysis.countDocuments({ userId: req.userId });

    res.json({
      data: analyses,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('API get CV analyses error:', error);
    res.status(500).json({ error: 'Failed to fetch CV analyses' });
  }
});

// Get specific CV analysis
router.get('/cv/analysis/:id', async (req, res) => {
  try {
    const analysis = await CVAnalysis.findOne({
      _id: req.params.id,
      userId: req.userId
    }).select('-extractedText'); // Don't include full text in API response

    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    res.json({ data: analysis });
  } catch (error) {
    console.error('API get CV analysis error:', error);
    res.status(500).json({ error: 'Failed to fetch analysis' });
  }
});

// Analyze CV text content via API
router.post('/cv/analyze-text', async (req, res) => {
  try {
    const { text, filename = 'api-upload.txt' } = req.body;
    
    if (!text || text.trim().length < 100) {
      return res.status(400).json({ 
        error: 'Text content is required and must be at least 100 characters' 
      });
    }

    const user = req.user;
    
    if (!user.canPerformAction('cv_scan')) {
      return res.status(403).json({ 
        error: 'CV scan limit reached for your plan',
        usage: user.usage,
        plan: user.plan
      });
    }

    const startTime = Date.now();
    
    // Create CV analysis record
    const cvAnalysis = new CVAnalysis({
      userId: user._id,
      originalFileName: filename,
      fileType: 'txt',
      extractedText: text,
      atsScore: 0,
      status: 'analyzing'
    });

    await cvAnalysis.save();

    // Perform ATS analysis (reuse logic from cv.js)
    const { performATSAnalysis } = require('./cv');
    const analysis = await performATSAnalysis(text);
    
    // Update CV analysis with results
    cvAnalysis.analysis = analysis;
    cvAnalysis.calculateATSScore();
    cvAnalysis.generateSuggestions();
    cvAnalysis.status = 'completed';
    cvAnalysis.processingTime = Date.now() - startTime;
    
    await cvAnalysis.save();

    // Update user usage
    user.usage.cvScans += 1;
    await user.save();

    res.json({
      data: {
        analysisId: cvAnalysis._id,
        atsScore: cvAnalysis.atsScore,
        analysis: cvAnalysis.analysis,
        suggestions: cvAnalysis.suggestions,
        processingTime: cvAnalysis.processingTime
      }
    });

  } catch (error) {
    console.error('API CV text analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze CV text' });
  }
});

// Get LinkedIn analyses
router.get('/linkedin/analyses', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;

    const analyses = await LinkedInAnalysis.find({ userId: req.userId })
      .select('profileUrl optimizationScore status createdAt processingTime')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await LinkedInAnalysis.countDocuments({ userId: req.userId });

    res.json({
      data: analyses,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('API get LinkedIn analyses error:', error);
    res.status(500).json({ error: 'Failed to fetch LinkedIn analyses' });
  }
});

// Get specific LinkedIn analysis
router.get('/linkedin/analysis/:id', async (req, res) => {
  try {
    const analysis = await LinkedInAnalysis.findOne({
      _id: req.params.id,
      userId: req.userId
    });

    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    res.json({ data: analysis });
  } catch (error) {
    console.error('API get LinkedIn analysis error:', error);
    res.status(500).json({ error: 'Failed to fetch analysis' });
  }
});

// Analyze LinkedIn content via API
router.post('/linkedin/analyze-content', async (req, res) => {
  try {
    const { content, headline, summary } = req.body;
    
    if (!content || content.trim().length < 50) {
      return res.status(400).json({ 
        error: 'Content is required and must be at least 50 characters' 
      });
    }

    const user = req.user;
    
    if (!user.canPerformAction('linkedin_scan')) {
      return res.status(403).json({ 
        error: 'LinkedIn scan limit reached for your plan',
        usage: user.usage,
        plan: user.plan
      });
    }

    const startTime = Date.now();
    
    // Create LinkedIn analysis record
    const linkedinAnalysis = new LinkedInAnalysis({
      userId: user._id,
      profileUrl: 'api-content',
      profileData: {
        headline: headline || '',
        summary: summary || content,
        experience: [],
        skills: [],
        education: []
      },
      optimizationScore: 0,
      status: 'analyzing'
    });

    await linkedinAnalysis.save();

    // Perform optimization analysis (reuse logic from linkedin.js)
    const { performLinkedInAnalysis } = require('./linkedin');
    const analysis = await performLinkedInAnalysis(linkedinAnalysis.profileData);
    
    // Update analysis with results
    linkedinAnalysis.analysis = analysis;
    linkedinAnalysis.calculateOptimizationScore();
    linkedinAnalysis.generateSuggestions();
    linkedinAnalysis.status = 'completed';
    linkedinAnalysis.processingTime = Date.now() - startTime;
    
    await linkedinAnalysis.save();

    // Update user usage
    user.usage.linkedinScans += 1;
    await user.save();

    res.json({
      data: {
        analysisId: linkedinAnalysis._id,
        optimizationScore: linkedinAnalysis.optimizationScore,
        analysis: linkedinAnalysis.analysis,
        suggestions: linkedinAnalysis.suggestions,
        processingTime: linkedinAnalysis.processingTime
      }
    });

  } catch (error) {
    console.error('API LinkedIn content analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze LinkedIn content' });
  }
});

// Error handling for API routes
router.use((error, req, res, next) => {
  console.error('API error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

module.exports = router;
