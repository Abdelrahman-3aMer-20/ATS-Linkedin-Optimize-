const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const puppeteer = require('puppeteer');
const { body, validationResult } = require('express-validator');
const { auth, requirePlan } = require('../middleware/auth');
const User = require('../models/User');
const CVAnalysis = require('../models/CVAnalysis');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || 
        file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and DOCX files are allowed'), false);
    }
  }
});

// Upload and analyze CV
router.post('/analyze', auth, requirePlan(['one-time', 'basic', 'pro']), upload.single('cv'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const user = req.user;
    
    // Check if user can perform CV scan
    if (!user.canPerformAction('cv_scan')) {
      return res.status(403).json({ 
        error: 'CV scan limit reached for your plan',
        usage: user.usage,
        plan: user.plan
      });
    }

    const startTime = Date.now();
    
    // Extract text from file
    let extractedText = '';
    const fileType = req.file.mimetype === 'application/pdf' ? 'pdf' : 'docx';
    
    try {
      if (fileType === 'pdf') {
        const pdfData = await pdfParse(req.file.buffer);
        extractedText = pdfData.text;
      } else {
        const docxData = await mammoth.extractRawText({ buffer: req.file.buffer });
        extractedText = docxData.value;
      }
    } catch (parseError) {
      console.error('File parsing error:', parseError);
      return res.status(400).json({ error: 'Failed to parse file. Please ensure it\'s a valid PDF or DOCX file.' });
    }

    if (!extractedText.trim()) {
      return res.status(400).json({ error: 'No text content found in the file' });
    }

    // Create CV analysis record
    const cvAnalysis = new CVAnalysis({
      userId: user._id,
      originalFileName: req.file.originalname,
      fileType: fileType,
      extractedText: extractedText,
      atsScore: 0,
      status: 'analyzing'
    });

    await cvAnalysis.save();

if (req.user.plan === 'free') {
   const { sendUpsellEmail } = require('../utils/email');
   await sendUpsellEmail(req.user.email, req.user.firstName, cvAnalysis.atsScore, cvAnalysis._id);
}

    // Perform ATS analysis
    const analysis = await performATSAnalysis(extractedText);
    
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

if (req.user && req.user.plan === 'free') {
  cvAnalysis.suggestions = cvAnalysis.suggestions.slice(0, 2); 
  if (cvAnalysis.analysis.keywords) {
    cvAnalysis.analysis.keywords.missing = cvAnalysis.analysis.keywords.missing.slice(0, 3);
    cvAnalysis.analysis.keywords.found = cvAnalysis.analysis.keywords.found.slice(0, 3);
  }
  cvAnalysis.locked = true;
}
       
    res.json({
      analysisId: cvAnalysis._id,
      atsScore: cvAnalysis.atsScore,
      analysis: cvAnalysis.analysis,
      suggestions: cvAnalysis.suggestions,
      processingTime: cvAnalysis.processingTime,
      locked: cvAnalysis.locked || false
    });

  } catch (error) {
    console.error('CV analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze CV' });
  }
});

// Get CV analysis by ID
router.get('/analysis/:id', auth, async (req, res) => {
  try {
    const analysis = await CVAnalysis.findOne({
      _id: req.params.id,
      userId: req.userId
    });

    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

if (req.user && req.user.plan === 'free') {
  analysis.suggestions = analysis.suggestions.slice(0, 2);
  if (analysis.analysis.keywords) {
    analysis.analysis.keywords.missing = analysis.analysis.keywords.missing.slice(0, 3);
    analysis.analysis.keywords.found = analysis.analysis.keywords.found.slice(0, 3);
  }
  analysis.locked = true;
}

    res.json(analysis);
  } catch (error) {
    console.error('Get analysis error:', error);
    res.status(500).json({ error: 'Failed to fetch analysis' });
  }
});

// Get user's CV analysis history
router.get('/history', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const analyses = await CVAnalysis.find({ userId: req.userId })
      .select('originalFileName atsScore status createdAt processingTime')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await CVAnalysis.countDocuments({ userId: req.userId });

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
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Generate optimized CV content
router.post('/optimize/:id', auth, requirePlan(['basic', 'pro']), async (req, res) => {
  try {
    const analysis = await CVAnalysis.findOne({
      _id: req.params.id,
      userId: req.userId
    });

    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    if (analysis.optimizedVersion && analysis.optimizedVersion.text) {
      return res.json({ optimizedContent: analysis.optimizedVersion.text });
    }

    // Generate optimized content based on suggestions
    const optimizedContent = await generateOptimizedContent(analysis);
    
    analysis.optimizedVersion = {
      text: optimizedContent,
      generatedAt: new Date()
    };
    
    await analysis.save();

    res.json({ optimizedContent });
  } catch (error) {
    console.error('Optimize CV error:', error);
    res.status(500).json({ error: 'Failed to optimize CV' });
  }
});

// Export CV as PDF
router.post('/export/:id', auth, requirePlan(['one-time', 'basic', 'pro']), async (req, res) => {
  try {
    const { useOptimized = false } = req.body;
    
    const analysis = await CVAnalysis.findOne({
      _id: req.params.id,
      userId: req.userId
    });

    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    let contentToExport = analysis.extractedText;
    if (useOptimized && analysis.optimizedVersion && analysis.optimizedVersion.text) {
      contentToExport = analysis.optimizedVersion.text;
    }

    // Generate PDF using Puppeteer
    const pdfBuffer = await generatePDF(contentToExport, req.user);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="optimized-cv-${analysis._id}.pdf"`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Export PDF error:', error);
    res.status(500).json({ error: 'Failed to export PDF' });
  }
});

// Compare before and after (Pro feature)
router.get('/compare/:id', auth, requirePlan(['pro']), async (req, res) => {
  try {
    const analysis = await CVAnalysis.findOne({
      _id: req.params.id,
      userId: req.userId
    });

    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }

    if (!analysis.optimizedVersion || !analysis.optimizedVersion.text) {
      return res.status(400).json({ error: 'Optimized version not available. Please optimize first.' });
    }

    // Calculate comparison metrics
    const beforeScore = analysis.atsScore;
    const afterAnalysis = await performATSAnalysis(analysis.optimizedVersion.text);
    const afterScore = Math.round(
      afterAnalysis.keywords.score * 0.35 +
      afterAnalysis.formatting.score * 0.25 +
      afterAnalysis.content.score * 0.25 +
      afterAnalysis.technical.score * 0.15
    );

    const improvements = [];
    if (afterAnalysis.keywords.score > analysis.analysis.keywords.score) {
      improvements.push('Improved keyword optimization');
    }
    if (afterAnalysis.content.score > analysis.analysis.content.score) {
      improvements.push('Enhanced content quality');
    }
    if (afterAnalysis.technical.score > analysis.analysis.technical.score) {
      improvements.push('Better technical skills presentation');
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
    console.error('Compare CV error:', error);
    res.status(500).json({ error: 'Failed to generate comparison' });
  }
});

// ATS Analysis Logic
async function performATSAnalysis(text) {
  const analysis = {
    keywords: await analyzeKeywords(text),
    formatting: analyzeFormatting(text),
    content: analyzeContent(text),
    technical: analyzeTechnicalSkills(text)
  };

  return analysis;
}

async function analyzeKeywords(text) {
  const commonTechKeywords = [
    'javascript', 'python', 'java', 'react', 'node.js', 'angular', 'vue',
    'typescript', 'html', 'css', 'sql', 'mongodb', 'postgresql', 'mysql',
    'aws', 'docker', 'kubernetes', 'git', 'agile', 'scrum', 'rest', 'api',
    'microservices', 'cloud', 'devops', 'ci/cd', 'testing', 'unit testing',
    'integration testing', 'tdd', 'bdd', 'redux', 'express', 'spring',
    'django', 'flask', 'laravel', 'php', 'c++', 'c#', '.net', 'ruby',
    'rails', 'go', 'rust', 'scala', 'kotlin', 'swift', 'ios', 'android',
    'mobile', 'responsive', 'bootstrap', 'tailwind', 'sass', 'less',
    'webpack', 'babel', 'npm', 'yarn', 'jenkins', 'github', 'gitlab',
    'jira', 'confluence', 'slack', 'team collaboration', 'leadership',
    'problem solving', 'debugging', 'optimization', 'performance',
    'security', 'authentication', 'authorization', 'oauth', 'jwt'
  ];

  const textLower = text.toLowerCase();
  const found = commonTechKeywords.filter(keyword => 
    textLower.includes(keyword.toLowerCase())
  );
  
  const missing = commonTechKeywords.filter(keyword => 
    !textLower.includes(keyword.toLowerCase())
  ).slice(0, 10); // Top 10 missing keywords

  const score = Math.min(100, (found.length / 20) * 100); // Score based on found keywords

  return { found, missing, score };
}

function analyzeFormatting(text) {
  const hasContactInfo = /email|phone|linkedin|github/i.test(text);
  const hasSkillsSection = /skills|technologies|technical/i.test(text);
  const hasExperienceSection = /experience|work|employment|position/i.test(text);
  const hasProperSections = hasContactInfo && hasSkillsSection && hasExperienceSection;

  let score = 0;
  if (hasContactInfo) score += 25;
  if (hasSkillsSection) score += 25;
  if (hasExperienceSection) score += 25;
  if (hasProperSections) score += 25;

  return {
    hasProperSections,
    hasContactInfo,
    hasSkillsSection,
    hasExperienceSection,
    score
  };
}

function analyzeContent(text) {
  const hasQuantifiableAchievements = /\d+%|\d+\+|increased|improved|reduced|achieved/i.test(text);
  const hasRelevantExperience = /developer|engineer|programmer|software|technical/i.test(text);
  const hasEducationSection = /education|degree|university|college|bachelor|master/i.test(text);
  const wordCount = text.split(/\s+/).length;

  let score = 0;
  if (hasQuantifiableAchievements) score += 30;
  if (hasRelevantExperience) score += 30;
  if (hasEducationSection) score += 20;
  if (wordCount >= 300 && wordCount <= 800) score += 20;

  return {
    hasQuantifiableAchievements,
    hasRelevantExperience,
    hasEducationSection,
    wordCount,
    score
  };
}

function analyzeTechnicalSkills(text) {
  const programmingLanguages = ['javascript', 'python', 'java', 'typescript', 'c++', 'c#', 'php', 'ruby', 'go']
    .filter(lang => text.toLowerCase().includes(lang));
  
  const frameworks = ['react', 'angular', 'vue', 'node.js', 'express', 'django', 'flask', 'spring', 'laravel']
    .filter(fw => text.toLowerCase().includes(fw));
  
  const tools = ['git', 'docker', 'kubernetes', 'aws', 'jenkins', 'jira', 'webpack']
    .filter(tool => text.toLowerCase().includes(tool));
  
  const databases = ['mongodb', 'postgresql', 'mysql', 'redis', 'elasticsearch']
    .filter(db => text.toLowerCase().includes(db));

  const totalSkills = programmingLanguages.length + frameworks.length + tools.length + databases.length;
  const score = Math.min(100, (totalSkills / 10) * 100);

  return {
    programmingLanguages,
    frameworks,
    tools,
    databases,
    score
  };
}

async function generateOptimizedContent(analysis) {
  // This is a simplified optimization - in production, you'd use AI/ML
  let optimized = analysis.extractedText;
  
  // Add missing keywords strategically
  const missingKeywords = analysis.analysis.keywords.missing.slice(0, 5);
  if (missingKeywords.length > 0) {
    optimized += `\n\nAdditional Technical Skills: ${missingKeywords.join(', ')}`;
  }
  
  // Improve formatting suggestions
  if (!analysis.analysis.formatting.hasSkillsSection) {
    optimized += '\n\nTECHNICAL SKILLS\n' + analysis.analysis.technical.programmingLanguages.join(', ');
  }
  
  return optimized;
}

async function generatePDF(content, user) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; margin: 40px; }
        h1, h2 { color: #333; }
        .header { text-align: center; margin-bottom: 30px; }
        .content { white-space: pre-wrap; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Optimized Resume</h1>
        <p>Generated by ATS CV Optimizer for ${user.firstName} ${user.lastName}</p>
      </div>
      <div class="content">${content}</div>
    </body>
    </html>
  `;
  
  await page.setContent(html);
  const pdfBuffer = await page.pdf({ 
    format: 'A4',
    margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' }
  });
  
  await browser.close();
  return pdfBuffer;
}

module.exports = router;
