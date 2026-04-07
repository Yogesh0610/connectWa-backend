import mongoose from "mongoose";

const metaAdSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ad_account_id: { type: mongoose.Schema.Types.ObjectId, ref: "AdAccount", required: true },
    campaign_id: { type: mongoose.Schema.Types.ObjectId, ref: "MetaCampaign", required: true },
    adset_id: { type: mongoose.Schema.Types.ObjectId, ref: "MetaAdSet", required: true },
    meta_ad_id: { type: String, unique: true, sparse: true },
    meta_adset_id: { type: String },

    name: { type: String, required: true },
    status: {
      type: String,
      enum: ["ACTIVE", "PAUSED", "DELETED", "ARCHIVED"],
      default: "PAUSED",
    },

    // Creative
    creative: {
      meta_creative_id: String,
      format: {
        type: String,
        enum: ["SINGLE_IMAGE", "SINGLE_VIDEO", "CAROUSEL", "COLLECTION"],
        default: "SINGLE_IMAGE",
      },
      // Single image/video
      image_url: String,
      image_hash: String,
      video_id: String,
      // Copy
      primary_text: String,
      headline: String,
      description: String,
      call_to_action: {
        type: String,
        enum: ["LEARN_MORE", "SIGN_UP", "GET_QUOTE", "APPLY_NOW", "CONTACT_US", "DOWNLOAD", "BOOK_NOW"],
        default: "LEARN_MORE",
      },
      // Destination
      link_url: String,
      page_id: String,
      instagram_actor_id: String,
      // Lead form
      lead_gen_form_id: String,
      // Carousel items
      carousel_cards: [
        {
          image_url: String,
          image_hash: String,
          headline: String,
          description: String,
          link_url: String,
          call_to_action: String,
        },
      ],
    },

    is_synced: { type: Boolean, default: false },
    sync_error: { type: String },
    last_synced_at: { type: Date },

    stats: {
      impressions: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
      leads: { type: Number, default: 0 },
      spend: { type: Number, default: 0 },
      ctr: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

export const MetaAd = mongoose.model("MetaAd", metaAdSchema);