import mongoose from "mongoose";

const googleAdSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ad_account_id: { type: mongoose.Schema.Types.ObjectId, ref: "GoogleAdAccount", required: true },
    campaign_id: { type: mongoose.Schema.Types.ObjectId, ref: "GoogleCampaign", required: true },
    adgroup_id: { type: mongoose.Schema.Types.ObjectId, ref: "GoogleAdGroup", required: true },

    google_ad_id: { type: String, unique: true, sparse: true },
    google_adgroup_id: { type: String },
    google_customer_id: { type: String },

    name: { type: String, required: true },
    ad_type: {
      type: String,
      enum: [
        "RESPONSIVE_SEARCH_AD",       // RSA - Search
        "EXPANDED_TEXT_AD",           // Legacy Search
        "RESPONSIVE_DISPLAY_AD",      // Display
        "CALL_AD",                    // Call only
        "LEAD_FORM_AD",               // Lead form
        "PERFORMANCE_MAX_AD",         // PMax asset group
      ],
      required: true,
    },
    status: {
      type: String,
      enum: ["ENABLED", "PAUSED", "REMOVED"],
      default: "PAUSED",
    },

    // RSA fields
    rsa: {
      headlines: [
        {
          text: String,              // max 30 chars
          pinned_field: String,      // HEADLINE_1, HEADLINE_2, HEADLINE_3
        },
      ],
      descriptions: [
        {
          text: String,              // max 90 chars
          pinned_field: String,      // DESCRIPTION_1, DESCRIPTION_2
        },
      ],
      final_urls: [String],
      path1: String,                 // max 15 chars
      path2: String,                 // max 15 chars
    },

    // Display / Responsive Display Ad
    display: {
      headlines: [{ text: String }],         // short headlines max 30 chars
      long_headline: String,                 // max 90 chars
      descriptions: [{ text: String }],      // max 90 chars
      business_name: String,                 // max 25 chars
      final_urls: [String],
      marketing_images: [{ asset_id: String, url: String }],
      logo_images: [{ asset_id: String, url: String }],
      square_marketing_images: [{ asset_id: String, url: String }],
      call_to_action_text: String,
    },

    // Lead Form Extension (attached to campaign/adgroup)
    lead_form: {
      google_lead_form_id: String,
      form_name: String,
      call_to_action: {
        type: String,
        enum: ["LEARN_MORE", "GET_QUOTE", "APPLY_NOW", "SIGN_UP", "CONTACT_US", "SUBSCRIBE", "DOWNLOAD", "BOOK_NOW", "GET_OFFER"],
        default: "LEARN_MORE",
      },
      call_to_action_description: String,    // max 200 chars
      headline: String,                       // max 30 chars
      description: String,                    // max 200 chars
      privacy_policy_url: String,
      questions: [
        {
          type: String,                       // FULL_NAME, EMAIL, PHONE_NUMBER, CITY etc.
          is_required: { type: Boolean, default: false },
          custom_question_text: String,
          custom_question_answers: [String],
        },
      ],
      delivery_methods: {
        webhook: {
          advertiser_webhook_url: String,
          google_secret: String,
        },
      },
      background_image_asset: String,
    },

    // PMax Asset Group
    pmax: {
      asset_group_id: String,
      final_urls: [String],
      headlines: [String],
      long_headlines: [String],
      descriptions: [String],
      business_name: String,
      images: [{ asset_id: String, type: String }],
      logos: [{ asset_id: String }],
      videos: [{ asset_id: String, url: String }],
      call_to_action: String,
    },

    is_synced: { type: Boolean, default: false },
    sync_error: { type: String },
    last_synced_at: { type: Date },

    stats: {
      impressions: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
      conversions: { type: Number, default: 0 },
      spend_micros: { type: Number, default: 0 },
      ctr: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

export const GoogleAd = mongoose.model("GoogleAd", googleAdSchema);