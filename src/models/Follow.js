import mongoose from 'mongoose';

const FollowSchema = new mongoose.Schema({
  followerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  followeeId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Ensure one follow relationship per pair
FollowSchema.index({ followerId: 1, followeeId: 1 }, { unique: true });

// Additional indexes for better query performance
// FollowSchema.index({ followerId: 1 });
// FollowSchema.index({ followeeId: 1 });
// FollowSchema.index({ createdAt: -1 });

FollowSchema.index({ followerId: 1, createdAt: -1 });
FollowSchema.index({ followeeId: 1, createdAt: -1 });

// Prevent following yourself at schema level
FollowSchema.pre('save', function(next) {
  if (this.followerId.toString() === this.followeeId.toString()) {
    const error = new Error('Cannot follow yourself');
    error.name = 'ValidationError';
    return next(error);
  }
  next();
});

// Static method to get follower count
FollowSchema.statics.getFollowerCount = function(userId) {
  return this.countDocuments({ followeeId: userId });
};

// Static method to get following count
FollowSchema.statics.getFollowingCount = function(userId) {
  return this.countDocuments({ followerId: userId });
};

// Static method to check if user is following another user
FollowSchema.statics.isFollowing = function(followerId, followeeId) {
  return this.exists({ followerId, followeeId });
};

// Static method to get followers list
FollowSchema.statics.getFollowers = function(userId, limit = 50, skip = 0) {
  return this.find({ followeeId: userId })
    .populate('followerId', 'username profile.firstName profile.lastName profile.avatar')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .lean();
};

// Static method to get following list
FollowSchema.statics.getFollowing = function(userId, limit = 50, skip = 0) {
  return this.find({ followerId: userId })
    .populate('followeeId', 'username profile.firstName profile.lastName profile.avatar')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .lean();
};

export const Follow = mongoose.models.Follow || mongoose.model('Follow', FollowSchema);

// import mongoose from 'mongoose';

// const followSchema = new mongoose.Schema({
//   followerId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User',
//     required: true,
//     index: true
//   },
//   followeeId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User',
//     required: true,
//     index: true
//   },
//   createdAt: {
//     type: Date,
//     default: Date.now
//   }
// });

// // Compound index to prevent duplicate follows and optimize queries
// followSchema.index({ followerId: 1, followeeId: 1 }, { unique: true });

// // Indexes for efficient queries
// followSchema.index({ followerId: 1, createdAt: -1 });
// followSchema.index({ followeeId: 1, createdAt: -1 });

// const Follow = mongoose.models.Follow || mongoose.model('Follow', followSchema);

// export { Follow };