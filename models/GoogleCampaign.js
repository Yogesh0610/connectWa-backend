import mongoose from "mongoose";

const googleCampaignSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    ad_account_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GoogleAdAccount",
      required: true,
    },

    // Google platform IDs
    google_campaign_id: { type: String, unique: true, sparse: true },
    google_customer_id: { type: String },

    name: { type: String, required: true },
    campaign_type: {
      type: String,
      enum: [
        "SEARCH",
        "DISPLAY",
        "PERFORMANCE_MAX",
        "SHOPPING",
        "VIDEO",
        "SMART",
      ],
      required: true,
    },
    status: {
      type: String,
      enum: ["ENABLED", "PAUSED", "REMOVED"],
      default: "PAUSED",
    },

    // Budget
    budget_amount: { type: Number, required: true },  // in micros (1 INR = 1,000,000 micros)
    budget_type: {
      type: String,
      enum: ["DAILY", "TOTAL"],
      default: "DAILY",
    },
    google_budget_id: { type: String },

    // Bidding
    bidding_strategy: {
      type: String,
      enum: [
        "TARGET_CPA",
        "TARGET_ROAS",
        "MAXIMIZE_CONVERSIONS",
        "MAXIMIZE_CONVERSION_VALUE",
        "MANUAL_CPC",
        "ENHANCED_CPC",
        "TARGET_IMPRESSION_SHARE",
      ],
      default: "MAXIMIZE_CONVERSIONS",
    },
    target_cpa_micros: { type: Number },
    target_roas: { type: Number },

    // Schedule
    start_date: { type: String },  // YYYY-MM-DD
    end_date: { type: String },

    // Network settings
    network_settings: {
      target_google_search: { type: Boolean, default: true },
      target_search_network: { type: Boolean, default: true },
      target_content_network: { type: Boolean, default: false },
      target_partner_search_network: { type: Boolean, default: false },
    },

    // Geo targeting
    geo_targets: [
      {
        criterion_id: String,
        name: String,
        type: String, // COUNTRY, CITY, REGION
      },
    ],

    // Language targeting
    language_codes: { type: [String], default: ["en"] },

    // Sync status
    is_synced: { type: Boolean, default: false },
    sync_error: { type: String },
    last_synced_at: { type: Date },

    // Stats (cached)
    stats: {
      impressions: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
      conversions: { type: Number, default: 0 },
      spend_micros: { type: Number, default: 0 },
      ctr: { type: Number, default: 0 },
      average_cpc: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

googleCampaignSchema.index({ ad_account_id: 1 });
googleCampaignSchema.index({ google_campaign_id: 1 }, { sparse: true });

export const GoogleCampaign = mongoose.model("GoogleCampaign", googleCampaignSchema);