// src/models/User.js
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      'Please enter a valid email address'
    ]
  },
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    lowercase: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters long'],
    maxlength: [20, 'Username must be less than 20 characters long'],
    match: [
      /^[a-zA-Z0-9_]+$/,
      'Username can only contain letters, numbers, and underscores'
    ]
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long']
  },
  
  // Extension-specific fields
  extensionUserId: {
    type: String,
    unique: true,
    sparse: true, // Allows null values while maintaining uniqueness
    index: true
  },
  isExtensionUser: {
    type: Boolean,
    default: false
  },
  
  profile: {
    firstName: {
      type: String,
      trim: true,
      maxlength: [50, 'First name must be less than 50 characters']
    },
    lastName: {
      type: String,
      trim: true,
      maxlength: [50, 'Last name must be less than 50 characters']
    },
    bio: {
      type: String,
      trim: true,
      maxlength: [500, 'Bio must be less than 500 characters']
    },
    avatar: {
      type: String,
      trim: true
    }
  },
  preferences: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'system'
    },
    emailNotifications: {
      type: Boolean,
      default: true
    },
    contentNotifications: {
      type: Boolean,
      default: true
    },
    // Extension-specific preferences
    autoShare: {
      type: Boolean,
      default: true
    },
    qualityThreshold: {
      type: Number,
      min: 0,
      max: 1
    }
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: {
    type: String,
    select: false
  },
  emailVerificationExpires: {
    type: Date,
    select: false
  },
  passwordResetToken: {
    type: String,
    select: false
  },
  passwordResetExpires: {
    type: Date,
    select: false
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  // Extension linking fields
  linkedAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    sparse: true
  },
  isLinked: {
    type: Boolean,
    default: false
  },
  hasLinkedExtension: {
    type: Boolean,
    default: false
  },
  loginCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.emailVerificationToken;
      delete ret.emailVerificationExpires;
      delete ret.passwordResetToken;
      delete ret.passwordResetExpires;
      return ret;
    }
  }
});

// Indexes for better query performance
// userSchema.index({ email: 1 });
// userSchema.index({ username: 1 });
// userSchema.index({ extensionUserId: 1 });
// userSchema.index({ createdAt: -1 });
// userSchema.index({ lastLogin: -1 });

// Pre-save middleware to increment login count
userSchema.pre('save', function(next) {
  if (this.isModified('lastLogin') && !this.isNew) {
    this.loginCount += 1;
  }
  next();
});

// Instance methods
userSchema.methods.getPublicProfile = function() {
  return {
    id: this._id,
    username: this.username,
    displayName: this.profile.firstName || this.username,
    profile: this.profile,
    createdAt: this.createdAt,
    isExtensionUser: this.isExtensionUser
  };
};

userSchema.methods.getFullName = function() {
  if (this.profile.firstName && this.profile.lastName) {
    return `${this.profile.firstName} ${this.profile.lastName}`;
  }
  return this.profile.firstName || this.username;
};

// Static methods
userSchema.statics.findByEmailOrUsername = function(identifier) {
  const cleanIdentifier = identifier.toLowerCase().trim();
  return this.findOne({
    $or: [
      { email: cleanIdentifier },
      { username: cleanIdentifier }
    ]
  });
};

userSchema.statics.findByExtensionId = function(extensionUserId) {
  return this.findOne({ extensionUserId });
};

userSchema.statics.isEmailTaken = async function(email, excludeId = null) {
  const query = { email: email.toLowerCase().trim() };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const user = await this.findOne(query);
  return !!user;
};

userSchema.statics.isUsernameTaken = async function(username, excludeId = null) {
  const query = { username: username.toLowerCase().trim() };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const user = await this.findOne(query);
  return !!user;
};

// Static method to find user by any identifier
userSchema.statics.findByAnyId = function(identifier) {
  return this.findOne({
    $or: [
      { _id: mongoose.Types.ObjectId.isValid(identifier) ? identifier : null },
      { username: identifier },
      { email: identifier },
      { extensionUserId: identifier },
      { userId: identifier }
    ]
  });
};

// Pre-save hook to update timestamps
userSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Pre-save hook to generate username for extension users
userSchema.pre('save', function(next) {
  if (this.isNew && this.isExtensionUser && !this.username) {
    const base = this.displayName
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 15) || 'reader';
    
    const timestamp = Date.now().toString().slice(-4);
    this.username = `${base}${timestamp}`;
  }
  next();
});


export const User = mongoose.models.User || mongoose.model('User', userSchema);