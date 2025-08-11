const mongoose = require('mongoose');

const cvAnalysisSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  originalFileName: {
    type: String,
    required: true
  },
  fileType: {
    type: String,
    enum: ['pdf', 'docx'],
    required: true
  },
  extractedText: {
    type: String,
    required: true
  },
  atsScore: {
    type: Number,
    min: 0,
    max: 100,
    required: true
  },
  analysis: {
    keywords: {
      found: [String],
      missing: [String],
      score: Number
    },
    formatting: {
      hasProperSections: Boolean,
      hasContactInfo: Boolean,
      hasSkillsSection: Boolean,
      hasExperienceSection: Boolean,
      score: Number
    },
    content: {
      hasQuantifiableAchievements: Boolean,
      hasRelevantExperience: Boolean,
      hasEducationSection: Boolean,
      wordCount: Number,
      score: Number
    },
    technical: {
      programmingLanguages: [String],
      frameworks: [String],
      tools: [String],
      databases: [String],
      score: Number
    }
  },
  suggestions: [{
    category: {
      type: String,
      enum: ['keywords', 'formatting', 'content', 'technical', 'general']
    },
    priority: {
      type: String,
      enum: ['high', 'medium', 'low']
    },
    title: String,
    description: String,
    impact: Number // Expected score improvement
  }],
  optimizedVersion: {
    text: String,
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
    type: Number, // in milliseconds
    default: 0
  }
}, {
  timestamps: true
});

// Index for efficient queries
cvAnalysisSchema.index({ userId: 1, createdAt: -1 });
cvAnalysisSchema.index({ atsScore: 1 });

// Calculate overall ATS score
cvAnalysisSchema.methods.calculateATSScore = function() {
  const weights = {
    keywords: 0.35,
    formatting: 0.25,
    content: 0.25,
    technical: 0.15
  };
  
  const scores = {
    keywords: this.analysis.keywords.score || 0,
    formatting: this.analysis.formatting.score || 0,
    content: this.analysis.content.score || 0,
    technical: this.analysis.technical.score || 0
  };
  
  this.atsScore = Math.round(
    scores.keywords * weights.keywords +
    scores.formatting * weights.formatting +
    scores.content * weights.content +
    scores.technical * weights.technical
  );
  
  return this.atsScore;
};

// Generate improvement suggestions
cvAnalysisSchema.methods.generateSuggestions = function() {
  const suggestions = [];
  
  // Keywords suggestions
  if (this.analysis.keywords.score < 70) {
    suggestions.push({
      category: 'keywords',
      priority: 'high',
      title: 'Add Missing Keywords',
      description: `Include these important keywords: ${this.analysis.keywords.missing.slice(0, 5).join(', ')}`,
      impact: 15
    });
  }
  
  // Formatting suggestions
  if (!this.analysis.formatting.hasProperSections) {
    suggestions.push({
      category: 'formatting',
      priority: 'high',
      title: 'Improve CV Structure',
      description: 'Add clear sections: Contact Info, Summary, Experience, Skills, Education',
      impact: 12
    });
  }
  
  // Content suggestions
  if (!this.analysis.content.hasQuantifiableAchievements) {
    suggestions.push({
      category: 'content',
      priority: 'medium',
      title: 'Add Quantifiable Achievements',
      description: 'Include numbers, percentages, and measurable results in your experience',
      impact: 10
    });
  }
  
  // Technical suggestions
  if (this.analysis.technical.programmingLanguages.length < 3) {
    suggestions.push({
      category: 'technical',
      priority: 'medium',
      title: 'Expand Technical Skills',
      description: 'Add more relevant programming languages and frameworks',
      impact: 8
    });
  }
  
  this.suggestions = suggestions;
  return suggestions;
};

module.exports = mongoose.model('CVAnalysis', cvAnalysisSchema);
