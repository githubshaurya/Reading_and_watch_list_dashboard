import mongoose from 'mongoose';

const contentItemSchema = new mongoose.Schema({
  // Core content fields
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  url: {
    type: String,
    required: true,
    index: true
  },
  summary: {
    type: String,
    trim: true
  },
  content: String, // Full content if available
  
  // Linking support
  linkedUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  
  // Content metadata
  metadata: {
    domain: String,
    author: String,
    publishDate: Date,
    tags: [String],
    language: String,
    wordCount: Number,
    readingTime: Number, // in minutes
    images: [String], // URLs to images
    contentType: {
      type: String,
      enum: ['article', 'blog', 'news', 'paper', 'video', 'podcast', 'other'],
      default: 'article'
    }
  },
  
  // Extension-specific data
  extensionData: {
    score: {
      type: Number,
      min: 0,
      max: 1
    },
    contentType: String,
    submittedAt: Date,
    analysisData: {
      topics: [String],
      sentiment: {
        type: String,
        enum: ['positive', 'negative', 'neutral']
      },
      complexity: {
        type: String,
        enum: ['beginner', 'intermediate', 'advanced']
      }
    }
  },
  
  // Social features
  likes: {
    type: Number,
    default: 0,
    index: true
  },
  likedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  shares: {
    type: Number,
    default: 0
  },
  summary: String,
  source: String,
  status: String,
  extensionData: {
    score: Number,
    summary: String,
    analyzedAt: Date,
    model: String
  },
  metadata: {
    domain: String,
    readingTime: Number
  },
  createdAt: Date,
  lastViewed: Date,
  comments: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    content: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  qualityScore: {
    type: Number,
    min: 0,
    max: 100
  },
  isFromExtension: {
    type: Boolean,
    default: false
  },
  isQualified: {
    type: Boolean,
    default: false,
    index: true // NEW: Index for qualified posts query
  },
  
  // Organization
  collections: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Collection'
  }],
  tags: [String],
  
  // Status and moderation
  status: {
    type: String,
    enum: ['active', 'archived', 'deleted', 'pending', 'flagged'],
    default: 'active'
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  
  // Analytics
  views: {
    type: Number,
    default: 0
  },
  clickThroughs: {
    type: Number,
    default: 0
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  lastViewedAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

// Compound indexes for performance
contentItemSchema.index({ userId: 1, status: 1, createdAt: -1 });
contentItemSchema.index({ userId: 1, isQualified: 1, createdAt: -1 });
contentItemSchema.index({ linkedUserId: 1, status: 1, createdAt: -1 });
contentItemSchema.index({ url: 1, userId: 1 }, { unique: true });
contentItemSchema.index({ 'metadata.domain': 1 });
contentItemSchema.index({ 'extensionData.score': 1 });
contentItemSchema.index({ likes: -1 });
contentItemSchema.index({ createdAt: -1 });

// Virtual for like count
contentItemSchema.virtual('likeCount').get(function() {
  return this.likes || 0;
});

// Virtual for comment count
contentItemSchema.virtual('commentCount').get(function() {
  return this.comments ? this.comments.length : 0;
});

// Virtual for domain extraction
contentItemSchema.virtual('domain').get(function() {
  if (this.metadata?.domain) return this.metadata.domain;
  try {
    return new URL(this.url).hostname;
  } catch {
    return 'unknown';
  }
});

// Virtual for reading time estimation
contentItemSchema.virtual('estimatedReadingTime').get(function() {
  if (this.metadata?.readingTime) return this.metadata.readingTime;
  if (this.metadata?.wordCount) {
    return Math.ceil(this.metadata.wordCount / 200); // 200 WPM average
  }
  // Estimate from summary length
  const words = this.summary ? this.summary.split(' ').length : 0;
  return Math.max(1, Math.ceil(words / 200));
});

// Method to check if user has liked this content
contentItemSchema.methods.isLikedBy = function(userId) {
  return this.likedBy && this.likedBy.some(id => id.toString() === userId.toString());
};

// NEW: Static method to get user's qualified posts
contentItemSchema.statics.getUserQualifiedPosts = function(userId, limit = 20) {
  return this.find({ 
    userId, 
    isQualified: true, 
    status: 'active' 
  })
  .sort({ createdAt: -1 })
  .limit(limit)
  .lean();
};

// NEW: Static method to get user's all posts
contentItemSchema.statics.getUserAllPosts = function(userId, limit = 20) {
  return this.find({ 
    userId, 
    status: 'active' 
  })
  .sort({ createdAt: -1 })
  .limit(limit)
  .lean();
};

// NEW: Static method to get post counts
contentItemSchema.statics.getUserPostCounts = async function(userId) {
  const [total, qualified] = await Promise.all([
    this.countDocuments({ userId, status: 'active' }),
    this.countDocuments({ userId, status: 'active', isQualified: true })
  ]);
  return { total, qualified };
};

// Method to toggle like
contentItemSchema.methods.toggleLike = async function(userId) {
  const isLiked = this.isLikedBy(userId);
  
  if (isLiked) {
    this.likedBy = this.likedBy.filter(id => id.toString() !== userId.toString());
    this.likes = Math.max(0, this.likes - 1);
  } else {
    this.likedBy.push(userId);
    this.likes = (this.likes || 0) + 1;
  }
  
  return this.save();
};

// Method to increment view count
contentItemSchema.methods.incrementViews = function() {
  this.views = (this.views || 0) + 1;
  this.lastViewedAt = new Date();
  return this.save();
};

// Method to get public data
contentItemSchema.methods.getPublicData = function() {
  return {
    id: this._id,
    title: this.title,
    url: this.url,
    summary: this.summary,
    domain: this.domain,
    likes: this.likes,
    shares: this.shares,
    views: this.views,
    commentCount: this.commentCount,
    estimatedReadingTime: this.estimatedReadingTime,
    metadata: {
      contentType: this.metadata?.contentType,
      tags: this.metadata?.tags,
      publishDate: this.metadata?.publishDate
    },
    extensionData: this.extensionData,
    createdAt: this.createdAt,
    isPublic: this.isPublic,
    isFeatured: this.isFeatured
  };
};

// Static method to find content for feed
contentItemSchema.statics.findForFeed = function(options = {}) {
  const {
    userId,
    linkedUserId,
    status = 'active',
    isPublic = true,
    limit = 20,
    skip = 0,
    sortBy = 'createdAt',
    sortOrder = -1
  } = options;

  const query = { status };
  
  if (isPublic) query.isPublic = true;
  
  if (userId || linkedUserId) {
    query.$or = [];
    if (userId) query.$or.push({ userId });
    if (linkedUserId) query.$or.push({ linkedUserId });
  }

  return this.find(query)
    .populate('userId', 'username displayName profile.avatar')
    .sort({ [sortBy]: sortOrder })
    .limit(limit)
    .skip(skip);
};

// Static method to find high-quality content (from commented code)
contentItemSchema.statics.findHighQuality = function(threshold = 0.7, limit = 20) {
  return this.find({ 
    'extensionData.score': { $gte: threshold },
    status: 'active'
  })
    .sort({ 'extensionData.score': -1, createdAt: -1 })
    .limit(limit)
    .populate('userId', 'username displayName profile.avatar');
};

// Static method to get content stats by user (from commented code)
contentItemSchema.statics.getContentStats = async function(userId) {
  const stats = await this.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId), status: 'active' } },
    {
      $group: {
        _id: '$metadata.contentType',
        count: { $sum: 1 },
        avgScore: { $avg: '$extensionData.score' },
        totalLikes: { $sum: '$likes' },
        totalViews: { $sum: '$views' }
      }
    }
  ]);
  
  return stats;
};

// Static method to get trending content
contentItemSchema.statics.getTrending = function(timeframe = 7, limit = 10) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - timeframe);
  
  return this.find({
    status: 'active',
    isPublic: true,
    createdAt: { $gte: cutoffDate }
  })
    .sort({ 
      likes: -1, 
      views: -1, 
      'extensionData.score': -1 
    })
    .limit(limit)
    .populate('userId', 'username displayName profile.avatar');
};

// Pre-save hooks
contentItemSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Extract domain if not set
  if (!this.metadata?.domain && this.url) {
    try {
      this.metadata = this.metadata || {};
      this.metadata.domain = new URL(this.url).hostname;
    } catch (error) {
      // Ignore URL parsing errors
    }
  }
  
  next();
});

// Analytics tracking post-save hook
contentItemSchema.post('save', async function(doc, next) {
  try {
    // Track new content creation
    if (this.isNew) {
      console.log(`📊 New content created: "${doc.title}" by user ${doc.userId}`);
      
      // Basic analytics tracking - you can expand this
      const analytics = {
        event: 'content_created',
        contentId: doc._id,
        userId: doc.userId,
        contentType: doc.metadata?.contentType || 'article',
        domain: doc.domain,
        isFromExtension: !!doc.extensionData?.score,
        timestamp: new Date()
      };
      
      // Log analytics (in production, send to analytics service)
      console.log('📈 Analytics:', JSON.stringify(analytics, null, 2));
    }
    
    // Track significant engagement milestones
    if (!this.isNew) {
      const milestones = [10, 50, 100, 500, 1000];
      const previousLikes = this.getChanges()?.likes?.from || 0;
      const currentLikes = doc.likes || 0;
      
      const milestone = milestones.find(m => previousLikes < m && currentLikes >= m);
      if (milestone) {
        console.log(`🎯 Milestone reached: ${milestone} likes for "${doc.title}"`);
      }
    }
    
    next();
  } catch (error) {
    console.error('Analytics tracking error:', error);
    next(); // Don't fail the save operation
  }
});

const ContentItem = mongoose.models.ContentItem || mongoose.model('ContentItem', contentItemSchema);

export { ContentItem };