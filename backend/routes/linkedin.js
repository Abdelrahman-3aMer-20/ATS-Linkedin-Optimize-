const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { body, validationResult } = require('express-validator');
const { auth, requirePlan } = require('../middleware/auth');
const User = require('../models/User');
const LinkedInAnalysis = require('../models/LinkedInAnalysis');

const router = express.Router();

// Analyze LinkedIn profile
router.post('/analyze', auth, requirePlan(['one-time', 'basic', 'pro']), [
  body('profileUrl').isURL().withMessage('Valid LinkedIn URL required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { profileUrl } = req.body;
    const user = req.user;
    
    // Check if user can perform LinkedIn scan
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
      profileUrl: profileUrl,
      optimizationScore: 0,
      status: 'analyzing'
    });

    await linkedinAnalysis.save();

    try {
      // Extract profile data (simplified - in production use proper scraping with rate limits)
      const profileData = await extractLinkedInData(profileUrl);
      
      // Perform optimization analysis
      const analysis = await performLinkedInAnalysis(profileData);
      
      // Update analysis with results
      linkedinAnalysis.profileData = profileData;
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
        analysisId: linkedinAnalysis._id,
        optimizationScore: linkedinAnalysis.optimizationScore,
        analysis: linkedinAnalysis.analysis,
        suggestions: linkedinAnalysis.suggestions,
        processingTime: linkedinAnalysis.processingTime
      });

    } catch (extractError) {
      linkedinAnalysis.status = 'failed';
      await linkedinAnalysis.save();
      
      console.error('LinkedIn extraction error:', extractError);
      return res.status(400).json({ 
        error: 'Failed to analyze LinkedIn profile. Please ensure the URL is correct and the profile is public.',
        details: extractError.message
      });
    }

  } catch (error) {
    console.error('LinkedIn analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze LinkedIn profile' });
  }
});

// Analyze LinkedIn content directly (paste content)
router.post('/analyze-content', auth, requirePlan(['one-time', 'basic', 'pro']), [
  body('content').isLength({ min: 50 }).withMessage('Content must be at least 50 characters'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { content, headline, summary } = req.body;
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
      profileUrl: 'manual-content',
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

    // Perform optimization analysis
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
      analysisId: linkedinAnalysis._id,
      optimizationScore: linkedinAnalysis.optimizationScore,
      analysis: linkedinAnalysis.analysis,
      suggestions: linkedinAnalysis.suggestions,
      processingTime: linkedinAnalysis.processingTime
    });

  } catch (error) {
    console.error('LinkedIn content analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze LinkedIn content' });
  }
});

// Get LinkedIn analysis by ID
router.get('/analysis/:id', auth, async (req, res) => {
  try {
    const analysis = await LinkedInAnalysis.findOne({
      _id: req.params.id,
      userId: req.userId
    });

    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    res.json(analysis);
  } catch (error) {
    console.error('Get LinkedIn analysis error:', error);
    res.status(500).json({ error: 'Failed to fetch analysis' });
  }
});

// Get user's LinkedIn analysis history
router.get('/history', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const analyses = await LinkedInAnalysis.find({ userId: req.userId })
      .select('profileUrl optimizationScore status createdAt processingTime')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await LinkedInAnalysis.countDocuments({ userId: req.userId });

    res.json({
      analyses,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get LinkedIn history error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Generate optimized LinkedIn content
router.post('/optimize/:id', auth, requirePlan(['basic', 'pro']), async (req, res) => {
  try {
    const analysis = await LinkedInAnalysis.findOne({
      _id: req.params.id,
      userId: req.userId
    });

    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    if (analysis.optimizedContent && analysis.optimizedContent.headline) {
      return res.json({ optimizedContent: analysis.optimizedContent });
    }

    // Generate optimized content based on suggestions
    const optimizedContent = await generateOptimizedLinkedInContent(analysis);
    
    analysis.optimizedContent = {
      ...optimizedContent,
      generatedAt: new Date()
    };
    
    await analysis.save();

    res.json({ optimizedContent });
  } catch (error) {
    console.error('Optimize LinkedIn error:', error);
    res.status(500).json({ error: 'Failed to optimize LinkedIn content' });
  }
});

// Compare before and after (Pro feature)
router.get('/compare/:id', auth, requirePlan(['pro']), async (req, res) => {
  try {
    const analysis = await LinkedInAnalysis.findOne({
      _id: req.params.id,
      userId: req.userId
    });

    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    if (!analysis.optimizedContent || !analysis.optimizedContent.headline) {
      return res.status(400).json({ error: 'Optimized content not available. Please optimize first.' });
    }

    // Calculate comparison metrics
    const beforeScore = analysis.optimizationScore;
    
    // Create optimized profile data for comparison
    const optimizedProfileData = {
      ...analysis.profileData,
      headline: analysis.optimizedContent.headline,
      summary: analysis.optimizedContent.summary
    };
    
    const afterAnalysis = await performLinkedInAnalysis(optimizedProfileData);
    const afterScore = Math.round(
      afterAnalysis.headline.score * 0.25 +
      afterAnalysis.summary.score * 0.25 +
      afterAnalysis.experience.score * 0.25 +
      afterAnalysis.skills.score * 0.15 +
      afterAnalysis.engagement.score * 0.10
    );

    const improvements = [];
    if (afterAnalysis.headline.score > analysis.analysis.headline.score) {
      improvements.push('Improved headline optimization');
    }
    if (afterAnalysis.summary.score > analysis.analysis.summary.score) {
      improvements.push('Enhanced summary content');
    }
    if (afterAnalysis.skills.score > analysis.analysis.skills.score) {
      improvements.push('Better skills presentation');
    }

    const comparisonData = {
      beforeScore,
      afterScore,
      improvement: afterScore - beforeScore,
      improvements,
      beforeAnalysis: analysis.analysis,
      afterAnalysis
    };

    // Save comparison data
    analysis.comparisonData = {
      beforeScore,
      afterScore,
      improvements
    };
    await analysis.save();

    res.json(comparisonData);
  } catch (error) {
    console.error('Compare LinkedIn error:', error);
    res.status(500).json({ error: 'Failed to generate comparison' });
  }
});

// LinkedIn Analysis Logic
async function extractLinkedInData(profileUrl) {
  // Simplified extraction - in production, use proper LinkedIn API or scraping service
  // This is a mock implementation for demo purposes
  
  try {
    // For demo purposes, we'll return mock data
    // In production, you'd implement proper scraping with rate limits and error handling
    return {
      headline: "Software Developer at Tech Company",
      summary: "Experienced software developer with 3+ years in web development. Skilled in JavaScript, React, and Node.js.",
      experience: [
        {
          title: "Software Developer",
          company: "Tech Company",
          duration: "2021 - Present",
          description: "Developed web applications using React and Node.js"
        }
      ],
      skills: ["JavaScript", "React", "Node.js", "HTML", "CSS"],
      education: [
        {
          school: "University",
          degree: "Bachelor's",
          field: "Computer Science"
        }
      ],
      connections: 250,
      profileViews: 45
    };
  } catch (error) {
    throw new Error('Failed to extract LinkedIn profile data');
  }
}

async function performLinkedInAnalysis(profileData) {
  const analysis = {
    headline: analyzeHeadline(profileData.headline || ''),
    summary: analyzeSummary(profileData.summary || ''),
    experience: analyzeExperience(profileData.experience || []),
    skills: analyzeSkills(profileData.skills || []),
    engagement: analyzeEngagement(profileData)
  };

  return analysis;
}

function analyzeHeadline(headline) {
  const hasKeywords = /developer|engineer|programmer|software|technical|react|javascript|python|java/i.test(headline);
  const isCompelling = headline.length > 20 && /\||at|specializing|expert/i.test(headline);
  const length = headline.length;
  
  let score = 0;
  if (hasKeywords) score += 40;
  if (isCompelling) score += 30;
  if (length >= 50 && length <= 120) score += 30;

  return { hasKeywords, isCompelling, length, score };
}

function analyzeSummary(summary) {
  const hasCallToAction = /contact|connect|reach out|let's talk/i.test(summary);
  const hasKeywords = /developer|engineer|experience|skilled|expert|passionate/i.test(summary);
  const hasAchievements = /\d+%|\d+ years|increased|improved|built|developed/i.test(summary);
  const length = summary.length;
  
  let score = 0;
  if (hasCallToAction) score += 20;
  if (hasKeywords) score += 30;
  if (hasAchievements) score += 30;
  if (length >= 200 && length <= 2000) score += 20;

  return { hasCallToAction, hasKeywords, hasAchievements, length, score };
}

function analyzeExperience(experience) {
  const hasQuantifiableResults = experience.some(exp => 
    /\d+%|\d+\+|increased|improved|reduced|built \d+/i.test(exp.description || '')
  );
  const hasRelevantKeywords = experience.some(exp => 
    /developer|engineer|software|technical|programming/i.test(exp.title || '')
  );
  const isWellStructured = experience.length > 0 && experience.every(exp => 
    exp.title && exp.company && exp.duration
  );
  const count = experience.length;
  
  let score = 0;
  if (hasQuantifiableResults) score += 30;
  if (hasRelevantKeywords) score += 30;
  if (isWellStructured) score += 25;
  if (count >= 2) score += 15;

  return { hasQuantifiableResults, hasRelevantKeywords, isWellStructured, count, score };
}

function analyzeSkills(skills) {
  const techSkills = ['javascript', 'python', 'java', 'react', 'node.js', 'angular', 'vue', 'typescript'];
  const hasRelevantSkills = skills.some(skill => 
    techSkills.some(tech => skill.toLowerCase().includes(tech))
  );
  const hasTechnicalSkills = skills.length >= 5;
  const count = skills.length;
  
  let score = 0;
  if (hasRelevantSkills) score += 40;
  if (hasTechnicalSkills) score += 30;
  if (count >= 10) score += 30;

  return { hasRelevantSkills, hasTechnicalSkills, count, score };
}

function analyzeEngagement(profileData) {
  const hasRecentActivity = true; // Mock - would check actual activity
  const hasRecommendations = true; // Mock - would check recommendations
  const connectionCount = profileData.connections || 0;
  
  let score = 0;
  if (hasRecentActivity) score += 30;
  if (hasRecommendations) score += 30;
  if (connectionCount >= 500) score += 40;
  else if (connectionCount >= 100) score += 20;

  return { hasRecentActivity, hasRecommendations, connectionCount, score };
}

async function generateOptimizedLinkedInContent(analysis) {
  try {
    // Validate input
    if (!analysis || !analysis.profileData || !analysis.analysis) {
      throw new Error('Invalid analysis data provided');
    }

    const originalData = analysis.profileData;
    
    // Generate optimized headline with null checks
    let optimizedHeadline = originalData.headline || '';
    if (analysis.analysis.headline && analysis.analysis.headline.score < 70) {
      const skills = (originalData.skills && Array.isArray(originalData.skills)) 
        ? originalData.skills.slice(0, 3).join(', ') 
        : 'JavaScript, React, Node.js';
      optimizedHeadline = `Full-Stack Developer | ${skills} | Building Scalable Web Applications`;
    }
    
    // Generate optimized summary with null checks
    let optimizedSummary = originalData.summary || '';
    if (analysis.analysis.summary && analysis.analysis.summary.score < 70) {
      const experienceYears = (originalData.experience && Array.isArray(originalData.experience)) 
        ? originalData.experience.length 
        : 2;
      const skillsList = (originalData.skills && Array.isArray(originalData.skills)) 
        ? originalData.skills.slice(0, 5).join(', ') 
        : 'JavaScript, React, Node.js, Python, SQL';
        
      optimizedSummary = `Passionate software developer with ${experienceYears}+ years of experience in web development. 

Specialized in: ${skillsList}

Key achievements:
• Developed and maintained scalable web applications
• Improved application performance and user experience
• Collaborated with cross-functional teams to deliver high-quality solutions

Let's connect to discuss opportunities in software development!`;
    }
    
    // Generate skills to add with null checks
    const currentSkills = (originalData.skills && Array.isArray(originalData.skills)) 
      ? originalData.skills 
      : [];
    const skillsToAdd = [
      'Problem Solving', 'Team Collaboration', 'Agile Development', 
      'Code Review', 'Technical Documentation', 'API Development'
    ].filter(skill => !currentSkills.includes(skill)).slice(0, 5);

    return {
      headline: optimizedHeadline,
      summary: optimizedSummary,
      skillsToAdd
    };
  } catch (error) {
    console.error('Error generating optimized LinkedIn content:', error);
    throw new Error('Failed to generate optimized content: ' + error.message);
  }
}

module.exports = router;
