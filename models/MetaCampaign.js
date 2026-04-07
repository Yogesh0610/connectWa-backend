import mongoose from "mongoose";

const metaCampaignSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    ad_account_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdAccount",
      required: true,
    },
    meta_campaign_id: { type: String, unique: true, sparse: true }, // Meta platform ID
    name: { type: String, required: true },
    objective: {
      type: String,
      enum: [
        "OUTCOME_LEADS",
        "OUTCOME_SALES",
        "OUTCOME_ENGAGEMENT",
        "OUTCOME_AWARENESS",
        "OUTCOME_TRAFFIC",
        "OUTCOME_APP_PROMOTION",
      ],
      required: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"],
      default: "PAUSED",
    },
    special_ad_categories: {
      type: [String],
      default: [],
    },
    daily_budget: { type: Number },       // in cents
    lifetime_budget: { type: Number },    // in cents
    bid_strategy: {
      type: String,
      enum: ["LOWEST_COST_WITHOUT_CAP", "LOWEST_COST_WITH_BID_CAP", "COST_CAP", "MINIMUM_ROAS"],
      default: "LOWEST_COST_WITHOUT_CAP",
    },
    start_time: { type: Date },
    end_time: { type: Date },

    // Sync status
    is_synced: { type: Boolean, default: false },
    sync_error: { type: String },
    last_synced_at: { type: Date },

    // Stats (cached from Meta)
    stats: {
      impressions: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
      leads: { type: Number, default: 0 },
      spend: { type: Number, default: 0 },
      cpl: { type: Number, default: 0 }, // cost per lead
    },
  },
  { timestamps: true }
);

metaCampaignSchema.index({ ad_account_id: 1 });
metaCampaignSchema.index({ meta_campaign_id: 1 }, { sparse: true });

export const MetaCampaign = mongoose.model("MetaCampaign", metaCampaignSchema);