import mongoose from "mongoose";

const adAccountSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    platform: {
      type: String,
      enum: ["meta", "google"],
      required: true,
    },

    // Meta specific
    meta_ad_account_id: { type: String }, // act_XXXXXXXXX
    meta_ad_account_name: { type: String },
    meta_business_id: { type: String },
    meta_user_id: { type: String },
    meta_access_token: { type: String },  // long-lived user token
    meta_pages: [
      {
        page_id: String,
        page_name: String,
        page_access_token: String,
        instagram_actor_id: String,       // linked IG account
      },
    ],

    // Google specific
    google_customer_id: { type: String },
    google_manager_id: { type: String },
    google_access_token: { type: String },
    google_refresh_token: { type: String },
    google_token_expiry: { type: Date },

    // Common
    name: { type: String, required: true },
    currency: { type: String, default: "USD" },
    timezone: { type: String, default: "UTC" },
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
    },
  },
  { timestamps: true }
);

adAccountSchema.index({ user_id: 1, platform: 1 });
adAccountSchema.index({ meta_ad_account_id: 1 }, { sparse: true });
adAccountSchema.index({ google_customer_id: 1 }, { sparse: true });

export const AdAccount = mongoose.model("AdAccount", adAccountSchema);