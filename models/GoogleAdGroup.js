import mongoose from "mongoose";

const googleAdGroupSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ad_account_id: { type: mongoose.Schema.Types.ObjectId, ref: "GoogleAdAccount", required: true },
    campaign_id: { type: mongoose.Schema.Types.ObjectId, ref: "GoogleCampaign", required: true },

    google_adgroup_id: { type: String, unique: true, sparse: true },
    google_campaign_id: { type: String },
    google_customer_id: { type: String },

    name: { type: String, required: true },
    status: {
      type: String,
      enum: ["ENABLED", "PAUSED", "REMOVED"],
      default: "PAUSED",
    },

    // Bidding
    cpc_bid_micros: { type: Number },
    cpm_bid_micros: { type: Number },
    target_cpa_micros: { type: Number },

    // Ad group type
    ad_group_type: {
      type: String,
      enum: [
        "SEARCH_STANDARD",
        "DISPLAY_STANDARD",
        "SHOPPING_PRODUCT_ADS",
        "HOTEL_ADS",
        "VIDEO_BUMPER",
        "VIDEO_TRUE_VIEW_IN_STREAM",
      ],
      default: "SEARCH_STANDARD",
    },

    // Keywords (for Search)
    keywords: [
      {
        text: String,
        match_type: {
          type: String,
          enum: ["EXACT", "PHRASE", "BROAD"],
          default: "BROAD",
        },
        cpc_bid_micros: Number,
        status: { type: String, default: "ENABLED" },
        google_criterion_id: String,
      },
    ],

    // Audiences (for Display/PMax)
    audiences: [
      {
        criterion_id: String,
        name: String,
        type: String, // USER_LIST, USER_INTEREST, CUSTOM_AFFINITY
      },
    ],

    is_synced: { type: Boolean, default: false },
    sync_error: { type: String },
    last_synced_at: { type: Date },

    stats: {
      impressions: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
      conversions: { type: Number, default: 0 },
      spend_micros: { type: Number, default: 0 },
      average_cpc: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

export const GoogleAdGroup = mongoose.model("GoogleAdGroup", googleAdGroupSchema);