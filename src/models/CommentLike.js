import mongoose from 'mongoose';

const CommentLikeSchema = new mongoose.Schema({
    commentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now }
});

// Ensure one like per user per comment
CommentLikeSchema.index({ commentId: 1, userId: 1 }, { unique: true });

export const CommentLike = mongoose.models.CommentLike || mongoose.model('CommentLike', CommentLikeSchema);
