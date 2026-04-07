import mongoose from "mongoose";

const googleAdAccountSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Google OAuth
    google_customer_id: { type: String, required: true },    // 123-456-7890
    google_manager_id: { type: String },                      // MCC account
    google_access_token: { type: String },
    google_refresh_token: { type: String },
    google_token_expiry: { type: Date },

    // Account info
    name: { type: String, required: true },
    currency: { type: String, default: "INR" },
    timezone: { type: String, default: "Asia/Kolkata" },
    is_active: { type: Boolean, default: true },
    connection_method: {
      type: String,
      enum: ["oauth", "manual"],
      default: "oauth",
    },
    last_synced_at: { type: Date },

    // Stats cache
    stats: {
      total_campaigns: { type: Number, default: 0 },
      active_campaigns: { type: Number, default: 0 },
      total_spend: { type: Number, default: 0 },
      total_leads: { type: Number, default: 0 },
      total_impressions: { type: Number, default: 0 },
      total_clicks: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

googleAdAccountSchema.index({ user_id: 1, google_customer_id: 1 }, { unique: true });

export const GoogleAdAccount = mongoose.model("GoogleAdAccount", googleAdAccountSchema);