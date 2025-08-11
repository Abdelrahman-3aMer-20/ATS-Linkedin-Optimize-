const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const LinkedInAnalysis = require('../models/LinkedInAnalysis'); // Use your actual path

// --- Helper functions ---

// Generate improvement tips based on score thresholds and analysis details
function getImprovementTips(analysis) {
  const tips = [];

  if (analysis.analysis.headline.score < 70) {
    tips.push({
      area: 'Headline',
      tip: 'Your headline could be more impactful. Include relevant keywords and make it more compelling.',
      example: 'e.g. "Full-Stack Developer | React, Node.js | Building Scalable Web Applications"'
    });
  }
  if (analysis.analysis.summary.score < 70) {
    tips.push({
      area: 'Summary',
      tip: 'Add a compelling summary with keywords, achievements, and a call-to-action.',
      example: 'e.g. "Start with your value proposition and include specific achievements."'
    });
  }
  if (!analysis.analysis.experience.hasQuantifiableResults) {
    tips.push({
      area: 'Experience',
      tip: 'Include numbers, percentages, and measurable outcomes in your experience.',
      example: 'e.g. "Increased user engagement by 35% through React optimization."'
    });
  }
  if (analysis.analysis.skills.count < 10) {
    tips.push({
      area: 'Skills',
      tip: 'Add more technical skills relevant to your target role.',
      example: 'e.g. "Add skills like React, Node.js, Python, AWS, etc."'
    });
  }
  if (analysis.analysis.engagement.connectionCount < 500) {
    tips.push({
      area: 'Engagement',
      tip: 'Connect with professionals in your industry to increase visibility.',
      example: 'e.g. "Aim for 500+ connections for better profile visibility."'
    });
  }

  return tips;
}

// Generate score improvement info (for new schema)
function getScoreImprovements(comparisonData) {
  if (!comparisonData || typeof comparisonData.beforeScore !== 'number' || typeof comparisonData.afterScore !== 'number') {
    return null;
  }
  const diff = comparisonData.afterScore - comparisonData.beforeScore;
  if (diff === 0) return null;
  return {
    before: comparisonData.beforeScore,
    after: comparisonData.afterScore,
    improvedBy: diff
  };
}

// --- Endpoint: Get latest LinkedIn analysis report for logged-in user ---

router.get('/api/linkedin/report', async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Fetch the latest analysis for the user
    const analysis = await LinkedInAnalysis.findOne({ userId })
      .sort({ createdAt: -1 })
      .lean();

if (req.user && req.user.plan === 'free') {
   const { sendUpsellEmail } = require('../utils/email');
   await sendUpsellEmail(req.user.email, req.user.firstName, analysis.optimizationScore, analysis._id);
}


    if (!analysis) {
      return res.status(404).json({ error: 'No analysis found for user.' });
    }

    // Prepare the report
    const report = {
      generatedAt: new Date(),
      userId: analysis.userId,
      profileUrl: analysis.profileUrl,
      scores: {
        headline: analysis.analysis.headline.score,
        summary: analysis.analysis.summary.score,
        experience: analysis.analysis.experience.score,
        skills: analysis.analysis.skills.score,
        engagement: analysis.analysis.engagement.score,
        optimization: analysis.optimizationScore
      },
      suggestions: analysis.suggestions || [],
      improvementTips: getImprovementTips(analysis),
      optimizedContent: analysis.optimizedContent || {},
      comparison: analysis.comparisonData || {},
      scoreImprovements: getScoreImprovements(analysis.comparisonData),
      exportable: {
        summary: `
          <h2>LinkedIn Profile Analysis Report</h2>
          <ul>
            <li><strong>Headline Score:</strong> ${analysis.analysis.headline.score}</li>
            <li><strong>Summary Score:</strong> ${analysis.analysis.summary.score}</li>
            <li><strong>Experience Score:</strong> ${analysis.analysis.experience.score}</li>
            <li><strong>Skills Score:</strong> ${analysis.analysis.skills.score}</li>
            <li><strong>Engagement Score:</strong> ${analysis.analysis.engagement.score}</li>
            <li><strong>Optimization Score:</strong> ${analysis.optimizationScore}</li>
          </ul>
          ${
            getScoreImprovements(analysis.comparisonData)
              ? `<h3>Score Improvement</h3>
                <ul>
                  <li>
                    <strong>Before:</strong> ${analysis.comparisonData.beforeScore} <br/>
                    <strong>After:</strong> ${analysis.comparisonData.afterScore} <br/>
                    <strong>Improved by:</strong> ${getScoreImprovements(analysis.comparisonData).improvedBy > 0 ? '+' : ''}${getScoreImprovements(analysis.comparisonData).improvedBy}
                  </li>
                </ul>`
              : ''
          }
          <h3>Improvement Tips</h3>
          <ul>
            ${getImprovementTips(analysis)
              .map(
                tip =>
                  `<li><strong>${tip.area}:</strong> ${tip.tip}<br/><em>${tip.example}</em></li>`
              )
              .join('')}
          </ul>
          ${
            analysis.optimizedContent && (
              analysis.optimizedContent.headline ||
              analysis.optimizedContent.summary ||
              (Array.isArray(analysis.optimizedContent.experienceDescriptions) && analysis.optimizedContent.experienceDescriptions.length)
            )
              ? `<h3>Optimized Content Suggestions</h3>
                <ul>
                  ${analysis.optimizedContent.headline ? `<li><strong>Headline:</strong> ${analysis.optimizedContent.headline}</li>` : ''}
                  ${analysis.optimizedContent.summary ? `<li><strong>Summary:</strong> ${analysis.optimizedContent.summary}</li>` : ''}
                  ${
                    Array.isArray(analysis.optimizedContent.experienceDescriptions) && analysis.optimizedContent.experienceDescriptions.length
                      ? `<li><strong>Experience:</strong><ul>${analysis.optimizedContent.experienceDescriptions.map(desc => `<li>${desc}</li>`).join('')}</ul></li>`
                      : ''
                  }
                  ${
                    Array.isArray(analysis.optimizedContent.skillsToAdd) && analysis.optimizedContent.skillsToAdd.length
                      ? `<li><strong>Skills to Add:</strong> ${analysis.optimizedContent.skillsToAdd.join(', ')}</li>`
                      : ''
                  }
                </ul>`
              : ''
          }
        `
      }
    };

if (req.user && req.user.plan === 'free') {
  report.suggestions = report.suggestions.slice(0, 2); 
  report.improvementTips = report.improvementTips.slice(0, 1); 
  report.locked = true;
   report.message = "Upgrade to Basic or Pro to see full suggestions & tips!";
}

    return res.json(report);
  } catch (err) {
    console.error('Error generating LinkedIn report:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

