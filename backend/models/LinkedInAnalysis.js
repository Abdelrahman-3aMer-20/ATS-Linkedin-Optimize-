const mongoose = require('mongoose');

const linkedinAnalysisSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  profileUrl: {
    type: String,
    required: true
  },
  profileData: {
    headline: String,
    summary: String,
    experience: [{
      title: String,
      company: String,
      duration: String,
      description: String
    }],
    skills: [String],
    education: [{
      school: String,
      degree: String,
      field: String
    }],
    connections: Number,
    profileViews: Number
  },
  optimizationScore: {
    type: Number,
    min: 0,
    max: 100,
    required: true
  },
  analysis: {
    headline: {
      hasKeywords: Boolean,
      isCompelling: Boolean,
      length: Number,
      score: Number
    },
    summary: {
      hasCallToAction: Boolean,
      hasKeywords: Boolean,
      hasAchievements: Boolean,
      length: Number,
      score: Number
    },
    experience: {
      hasQuantifiableResults: Boolean,
      hasRelevantKeywords: Boolean,
      isWellStructured: Boolean,
      count: Number,
      score: Number
    },
    skills: {
      hasRelevantSkills: Boolean,
      hasTechnicalSkills: Boolean,
      count: Number,
      score: Number
    },
    engagement: {
      hasRecentActivity: Boolean,
      hasRecommendations: Boolean,
      connectionCount: Number,
      score: Number
    }
  },
  suggestions: [{
    category: {
      type: String,
      enum: ['headline', 'summary', 'experience', 'skills', 'engagement', 'general']
    },
    priority: {
      type: String,
      enum: ['high', 'medium', 'low']
    },
    title: String,
    description: String,
    impact: Number,
    example: String
  }],
  optimizedContent: {
    headline: String,
    summary: String,
    experienceDescriptions: [String],
    skillsToAdd: [String],
    generatedAt: Date
  },
  comparisonData: {
    beforeScore: Number,
    afterScore: Number,
    improvements: [String]
  },
  status: {
    type: String,
    enum: ['analyzing', 'completed', 'failed'],
    default: 'analyzing'
  },
  processingTime: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for efficient queries
linkedinAnalysisSchema.index({ userId: 1, createdAt: -1 });
linkedinAnalysisSchema.index({ optimizationScore: 1 });

// Calculate LinkedIn optimization score
linkedinAnalysisSchema.methods.calculateOptimizationScore = function() {
  const weights = {
    headline: 0.25,
    summary: 0.25,
    experience: 0.25,
    skills: 0.15,
    engagement: 0.10
  };
  
  const scores = {
    headline: this.analysis.headline.score || 0,
    summary: this.analysis.summary.score || 0,
    experience: this.analysis.experience.score || 0,
    skills: this.analysis.skills.score || 0,
    engagement: this.analysis.engagement.score || 0
  };
  
  this.optimizationScore = Math.round(
    scores.headline * weights.headline +
    scores.summary * weights.summary +
    scores.experience * weights.experience +
    scores.skills * weights.skills +
    scores.engagement * weights.engagement
  );
  
  return this.optimizationScore;
};

// Generate LinkedIn optimization suggestions
linkedinAnalysisSchema.methods.generateSuggestions = function() {
  const suggestions = [];
  
  // Headline suggestions
  if (this.analysis.headline.score < 70) {
    suggestions.push({
      category: 'headline',
      priority: 'high',
      title: 'Optimize Your Headline',
      description: 'Include relevant keywords and make it more compelling',
      impact: 15,
      example: 'Full-Stack Developer | React, Node.js | Building Scalable Web Applications'
    });
  }
  
  // Summary suggestions
  if (this.analysis.summary.score < 70) {
    suggestions.push({
      category: 'summary',
      priority: 'high',
      title: 'Improve Your Summary',
      description: 'Add a compelling summary with keywords, achievements, and call-to-action',
      impact: 18,
      example: 'Start with your value proposition and include specific achievements'
    });
  }
  
  // Experience suggestions
  if (!this.analysis.experience.hasQuantifiableResults) {
    suggestions.push({
      category: 'experience',
      priority: 'medium',
      title: 'Add Quantifiable Results',
      description: 'Include numbers, percentages, and measurable outcomes in your experience',
      impact: 12,
      example: 'Increased user engagement by 35% through React optimization'
    });
  }
  
  // Skills suggestions
  if (this.analysis.skills.count < 10) {
    suggestions.push({
      category: 'skills',
      priority: 'medium',
      title: 'Add More Relevant Skills',
      description: 'Add technical skills relevant to your target role',
      impact: 8,
      example: 'Add skills like React, Node.js, Python, AWS, etc.'
    });
  }
  
  // Engagement suggestions
  if (this.analysis.engagement.connectionCount < 500) {
    suggestions.push({
      category: 'engagement',
      priority: 'low',
      title: 'Grow Your Network',
      description: 'Connect with professionals in your industry to increase visibility',
      impact: 5,
      example: 'Aim for 500+ connections for better profile visibility'
    });
  }
  
  this.suggestions = suggestions;
  return suggestions;
};

module.exports = mongoose.model('LinkedInAnalysis', linkedinAnalysisSchema);
