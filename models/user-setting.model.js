import mongoose from 'mongoose';

const userSettingSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  ai_model: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "AIModel",
    default: null
  },
  is_show_phone_no: {
    type: Boolean,
    default: false
  },
  api_key: {
    type: String,
    default: null
  },
  notification_tone: {
    type: String,
    default: 'default'
  },
  notifications_enabled: {
    type: Boolean,
    default: true
  },
  theme_color: {
    type: String,
    default: '#128C7E'
  },
  user_bubble_color: {
    type: String,
    default: '#DCF8C6'
  },
  contact_bubble_color: {
    type: String,
    default: '#FFFFFF'
  },
  bg_color: {
    type: String,
    default: '#E5DDD5'
  },
  bg_image: {
    type: String,
    default: null
  },
  user_text_color: {
    type: String,
    default: '#000000'
  },
  contact_text_color: {
    type: String,
    default: '#000000'
  },
  call_automation_settings: {
    auto_call_on_permission_grant: { type: Boolean, default: true },
    call_delay_seconds: { type: Number, default: 30 },
    max_retry_attempts: { type: Number, default: 3 }
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'user_settings'
});

// userSettingSchema.index({ user_id: 1 });

export default mongoose.model('UserSetting', userSettingSchema);
