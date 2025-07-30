import mongoose from 'mongoose';

const CommentSchema = new mongoose.Schema({
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
  text: { 
    type: String, 
    required: true, 
    trim: true,
    maxlength: [1000, 'Comment must be less than 1000 characters']
  },
  parentId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Comment',
    default: null 
  },
  likes: { 
    type: Number, 
    default: 0 
  },
  tags: [{
    username: { type: String, trim: true }
  }],
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Indexes for better performance
CommentSchema.index({ contentId: 1, createdAt: -1 });
CommentSchema.index({ userId: 1 });
CommentSchema.index({ parentId: 1 });

// Update the updatedAt field on save
CommentSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  if (this.isModified('text') && !this.isNew) {
    this.isEdited = true;
    this.editedAt = new Date();
  }
  next();
});

// Virtual for reply count
CommentSchema.virtual('replyCount', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'parentId',
  count: true
});

// Ensure virtual fields are serialized
CommentSchema.set('toJSON', { virtuals: true });
CommentSchema.set('toObject', { virtuals: true });

export const Comment = mongoose.models.Comment || mongoose.model('Comment', CommentSchema);