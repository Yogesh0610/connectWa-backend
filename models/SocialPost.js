import mongoose from 'mongoose';

const socialPostSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Internal label
  title: { type: String },

  // Post content
  content:          { type: String, required: true },
  link_url:         { type: String },
  link_title:       { type: String },
  link_description: { type: String },
  hashtags:         [String],

  // Uploaded media files
  media: [{
    type:              { type: String, enum: ['image', 'video'] },
    url:               String,   // CDN / public URL
    original_filename: String,
  }],

  // Per-platform publish targets
  targets: [{
    social_account_id: { type: mongoose.Schema.Types.ObjectId, ref: 'SocialAccount' },
    platform:     { type: String, enum: ['linkedin', 'facebook', 'instagram', 'twitter'] },
    account_type: { type: String, enum: ['profile', 'page', 'company'] },
    account_id:   String,
    account_name: String,
    linkedin_urn: String,

    // Per-target state
    status: {
      type: String,
      enum: ['pending', 'published', 'failed'],
      default: 'pending',
    },
    published_at:    { type: Date },
    platform_post_id: String,  // ID of the post on the platform
    error_message:   String,

    // Platform asset IDs (LinkedIn media URN etc.)
    platform_media_ids: [String],

    analytics: {
      likes:       { type: Number, default: 0 },
      comments:    { type: Number, default: 0 },
      shares:      { type: Number, default: 0 },
      impressions: { type: Number, default: 0 },
      clicks:      { type: Number, default: 0 },
    },
  }],

  // Overall post status
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'publishing', 'published', 'partially_published', 'failed'],
    default: 'draft',
  },

  scheduled_at: { type: Date },
  published_at: { type: Date },
  deleted_at:   { type: Date, default: null },
}, { timestamps: true });

socialPostSchema.index({ user_id: 1, status: 1, createdAt: -1 });
socialPostSchema.index({ status: 1, scheduled_at: 1 });

export const SocialPost = mongoose.model('SocialPost', socialPostSchema);
