import axios from "axios";
import FormData from "form-data";
import { MetaAd } from "../../../models/MetaAd.js";
import { MetaAdSet } from "../../../models/MetaAdSet.js";

class MetaCreativeService {
  constructor() {
    this.apiVersion = "v21.0";
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
  }

  // ── Upload image → image_hash ─────────────────────────────────────────────
  async uploadImage(adAccountId, accessToken, imageBuffer, mimeType = "image/jpeg") {
    const form = new FormData();
    form.append("filename", imageBuffer, { contentType: mimeType, filename: "ad_image.jpg" });
    form.append("access_token", accessToken);

    const res = await axios.post(
      `${this.baseUrl}/${adAccountId}/adimages`,
      form,
      { headers: form.getHeaders() }
    );

    const imageData = Object.values(res.data.images)[0];
    return { hash: imageData.hash, url: imageData.url };
  }

  // ── Upload video → video_id ───────────────────────────────────────────────
  async uploadVideo(adAccountId, accessToken, videoBuffer) {
    const form = new FormData();
    form.append("source", videoBuffer, { contentType: "video/mp4", filename: "ad_video.mp4" });
    form.append("access_token", accessToken);

    const res = await axios.post(
      `https://graph-video.facebook.com/${this.apiVersion}/${adAccountId}/advideos`,
      form,
      { headers: form.getHeaders() }
    );

    return { video_id: res.data.id };
  }

  // ── Build object_story_spec from flat payload ─────────────────────────────
  // Accepts a flat payload (as sent by the frontend) with these fields:
  //   format, page_id, instagram_actor_id, primary_text, headline,
  //   description, call_to_action, link_url, image_hash, video_id,
  //   lead_gen_form_id, carousel_cards[]
  _buildObjectStorySpec(payload) {
    const {
      format = "SINGLE_IMAGE",
      page_id,
      instagram_actor_id,
      primary_text,
      headline,
      description,
      call_to_action = "LEARN_MORE",
      link_url,
      image_hash,
      video_id,
      lead_gen_form_id,
      carousel_cards = [],
    } = payload;

    const base = {
      page_id,
      ...(instagram_actor_id && { instagram_actor_id }),
    };

    const ctaValue = lead_gen_form_id ? { lead_gen_form_id } : undefined;

    if (format === "SINGLE_VIDEO") {
      return {
        ...base,
        video_data: {
          video_id,
          message: primary_text,
          title: headline,
          ...(description && { link_description: description }),
          call_to_action: {
            type: call_to_action,
            ...(ctaValue && { value: ctaValue }),
          },
        },
      };
    }

    if (format === "CAROUSEL") {
      return {
        ...base,
        link_data: {
          message: primary_text,
          link: link_url || `https://www.facebook.com/${page_id}`,
          child_attachments: carousel_cards.map((card) => ({
            image_hash: card.image_hash,
            name: card.headline,
            description: card.description || "",
            link: card.link_url || link_url,
            call_to_action: { type: card.call_to_action || call_to_action },
          })),
          ...(call_to_action && { multi_share_end_card: false }),
        },
      };
    }

    // SINGLE_IMAGE (default) — also used for Lead Generation (with lead_gen_form_id)
    return {
      ...base,
      link_data: {
        ...(image_hash && { image_hash }),
        message: primary_text,
        name: headline,
        ...(description && { description }),
        link: link_url || `https://www.facebook.com/${page_id}`,
        call_to_action: {
          type: call_to_action,
          ...(ctaValue && { value: ctaValue }),
        },
      },
    };
  }

  // ── Create ad creative on Meta ────────────────────────────────────────────
  async createCreative(adAccountId, accessToken, creativeName, payload) {
    const object_story_spec = this._buildObjectStorySpec(payload);

    console.log(`[MetaCreative] Creating creative "${creativeName}" format=${payload.format || "SINGLE_IMAGE"}`);

    const res = await axios.post(
      `${this.baseUrl}/${adAccountId}/adcreatives`,
      { name: creativeName, object_story_spec },
      { params: { access_token: accessToken } }
    );

    return res.data.id; // meta_creative_id
  }

  // ── Create full Ad (creative → ad) ───────────────────────────────────────
  // Accepts a FLAT payload from the frontend/controller — no nested `creative` key.
  // Required: name, adset_id, page_id, primary_text, call_to_action
  // Optional: format, headline, description, link_url, image_hash, video_id,
  //           lead_gen_form_id, carousel_cards, instagram_actor_id, status
  async createAd(userId, adsetDbId, payload) {
    const adset = await MetaAdSet.findById(adsetDbId)
      .populate("ad_account_id")
      .populate("campaign_id");

    if (!adset) throw new Error("Ad Set not found");

    const token     = adset.ad_account_id.meta_access_token;
    const accountId = adset.ad_account_id.meta_ad_account_id;

    const { name, status = "PAUSED" } = payload;

    // Create creative using flat payload fields
    const meta_creative_id = await this.createCreative(accountId, token, `${name} - Creative`, payload);

    // Create the ad
    const adPayload = {
      name,
      adset_id: adset.meta_adset_id,
      creative: { creative_id: meta_creative_id },
      status,
    };
    console.log(`[MetaCreative] Creating ad "${name}" → adset ${adset.meta_adset_id}`);

    const res = await axios.post(
      `${this.baseUrl}/${accountId}/ads`,
      adPayload,
      { params: { access_token: token } }
    );

    // Save to DB
    const ad = await MetaAd.create({
      user_id:        userId,
      ad_account_id:  adset.ad_account_id._id,
      campaign_id:    adset.campaign_id._id,
      adset_id:       adsetDbId,
      meta_ad_id:     res.data.id,
      meta_adset_id:  adset.meta_adset_id,
      name,
      status,
      creative: {
        meta_creative_id,
        format:        payload.format || "SINGLE_IMAGE",
        page_id:       payload.page_id,
        primary_text:  payload.primary_text,
        headline:      payload.headline,
        description:   payload.description,
        call_to_action: payload.call_to_action,
        link_url:      payload.link_url,
        image_hash:    payload.image_hash,
        lead_gen_form_id: payload.lead_gen_form_id,
      },
      is_synced:      true,
      last_synced_at: new Date(),
    });

    return ad;
  }
}

export const metaCreativeService = new MetaCreativeService();
