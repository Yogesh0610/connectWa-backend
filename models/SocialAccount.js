import mongoose from 'mongoose';

const socialAccountSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  platform: {
    type: String,
    enum: ['linkedin', 'facebook', 'instagram', 'twitter'],
    required: true,
  },

  // Profile or company page account
  account_type: {
    type: String,
    enum: ['profile', 'page', 'company'],
    default: 'profile',
  },

  account_id: { type: String, required: true }, // platform-native ID
  account_name: { type: String },
  account_username: { type: String },
  profile_picture: { type: String },

  // OAuth tokens
  access_token: { type: String },
  refresh_token: { type: String },
  token_expires_at: { type: Date },

  // LinkedIn-specific
  linkedin_urn: { type: String }, // urn:li:person:XXX or urn:li:organization:XXX

  // Sub-pages / company pages accessible via this account
  pages: [{
    page_id:       { type: String },
    page_name:     { type: String },
    page_picture:  { type: String },
    access_token:  { type: String },
    linkedin_urn:  { type: String },
    account_type:  { type: String, enum: ['page', 'company'], default: 'page' },
    platform:      { type: String },
  }],

  is_active:  { type: Boolean, default: true },
  deleted_at: { type: Date, default: null },
}, { timestamps: true });

socialAccountSchema.index({ user_id: 1, platform: 1 });
socialAccountSchema.index({ user_id: 1, is_active: 1 });
socialAccountSchema.index({ user_id: 1, account_id: 1, platform: 1 }, { unique: true });

export const SocialAccount = mongoose.model('SocialAccount', socialAccountSchema);
