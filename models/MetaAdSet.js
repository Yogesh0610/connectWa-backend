import mongoose from "mongoose";

const metaAdSetSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ad_account_id: { type: mongoose.Schema.Types.ObjectId, ref: "AdAccount", required: true },
    campaign_id: { type: mongoose.Schema.Types.ObjectId, ref: "MetaCampaign", required: true },
    meta_adset_id: { type: String, unique: true, sparse: true },
    meta_campaign_id: { type: String },

    name: { type: String, required: true },
    status: {
      type: String,
      enum: ["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"],
      default: "PAUSED",
    },

    // Budget
    daily_budget: { type: Number },
    lifetime_budget: { type: Number },
    bid_amount: { type: Number },
    billing_event: {
      type: String,
      enum: ["IMPRESSIONS", "LINK_CLICKS", "APP_INSTALLS", "NONE"],
      default: "IMPRESSIONS",
    },
    optimization_goal: {
      type: String,
      enum: ["LEAD_GENERATION", "LINK_CLICKS", "IMPRESSIONS", "REACH", "CONVERSIONS"],
      default: "LEAD_GENERATION",
    },

    // Schedule
    start_time: { type: Date },
    end_time: { type: Date },

    // Targeting
    targeting: {
      age_min: { type: Number, default: 18 },
      age_max: { type: Number, default: 65 },
      genders: { type: [Number], default: [] }, // 1=male, 2=female
      geo_locations: {
        countries: [String],
        cities: [{ key: String, name: String, radius: Number, distance_unit: String }],
        regions: [{ key: String, name: String }],
      },
      interests: [{ id: String, name: String }],
      behaviors: [{ id: String, name: String }],
      custom_audiences: [{ id: String, name: String }],
      excluded_custom_audiences: [{ id: String, name: String }],
      languages: [Number],
      device_platforms: { type: [String], default: ["mobile", "desktop"] },
      publisher_platforms: { type: [String], default: ["facebook", "instagram"] },
      facebook_positions: { type: [String], default: ["feed", "right_hand_column"] },
      instagram_positions: { type: [String], default: ["stream"] },
    },

    // Lead form
    promoted_object: {
      page_id: String,
      lead_gen_form_id: String,
      pixel_id: String,
    },

    is_synced: { type: Boolean, default: false },
    sync_error: { type: String },
    last_synced_at: { type: Date },

    stats: {
      impressions: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
      leads: { type: Number, default: 0 },
      spend: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

export const MetaAdSet = mongoose.model("MetaAdSet", metaAdSetSchema);