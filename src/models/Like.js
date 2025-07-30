import mongoose from 'mongoose';

const LikeSchema = new mongoose.Schema({
  contentId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'ContentItem', 
    required: true 
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Ensure one like per user per content
LikeSchema.index({ contentId: 1, userId: 1 }, { unique: true });

// Additional indexes for better query performance
LikeSchema.index({ contentId: 1 });
LikeSchema.index({ userId: 1 });
LikeSchema.index({ createdAt: -1 });

// Static method to get like count for content
LikeSchema.statics.getLikeCount = function(contentId) {
  return this.countDocuments({ contentId });
};

// Static method to check if user liked content
LikeSchema.statics.isLikedBy = function(contentId, userId) {
  return this.exists({ contentId, userId });
};

// Static method to get users who liked content
LikeSchema.statics.getLikers = function(contentId, limit = 50, skip = 0) {
  return this.find({ contentId })
    .populate('userId', 'username profile.firstName profile.lastName profile.avatar')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .lean();
};

// Static method to get content liked by user
LikeSchema.statics.getLikedContent = function(userId, limit = 50, skip = 0) {
  return this.find({ userId })
    .populate('contentId')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .lean();
};

export const Like = mongoose.models.Like || mongoose.model('Like', LikeSchema);