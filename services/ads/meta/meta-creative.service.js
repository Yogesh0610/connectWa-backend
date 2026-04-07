import axios from "axios";
import FormData from "form-data";
import { MetaAd } from "../../../models/MetaAd.js";
import { MetaAdSet } from "../../../models/MetaAdSet.js";
import { AdAccount } from "../../../models/AdAccount.js";

class MetaCreativeService {
  constructor() {
    this.apiVersion = "v19.0";
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
  }

  // Upload image to Meta → get image_hash
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

  // Upload video to Meta
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

  // Create ad creative
  async createCreative(adAccountId, accessToken, creativePayload) {
    const {
      name,
      format,
      page_id,
      instagram_actor_id,
      primary_text,
      headline,
      description,
      call_to_action,
      link_url,
      image_hash,
      video_id,
      lead_gen_form_id,
      carousel_cards,
    } = creativePayload;

    let object_story_spec = {};

    if (format === "SINGLE_IMAGE") {
      object_story_spec = {
        page_id,
        ...(instagram_actor_id && { instagram_actor_id }),
        link_data: {
          image_hash,
          message: primary_text,
          name: headline,
          description,
          link: link_url || `https://www.facebook.com/${page_id}`,
          call_to_action: {
            type: call_to_action,
            ...(lead_gen_form_id && { value: { lead_gen_form_id } }),
          },
        },
      };
    } else if (format === "SINGLE_VIDEO") {
      object_story_spec = {
        page_id,
        ...(instagram_actor_id && { instagram_actor_id }),
        video_data: {
          video_id,
          message: primary_text,
          title: headline,
          call_to_action: {
            type: call_to_action,
            ...(lead_gen_form_id && { value: { lead_gen_form_id } }),
          },
        },
      };
    } else if (format === "CAROUSEL") {
      object_story_spec = {
        page_id,
        link_data: {
          message: primary_text,
          link: link_url,
          child_attachments: carousel_cards.map((card) => ({
            image_hash: card.image_hash,
            name: card.headline,
            description: card.description,
            link: card.link_url || link_url,
            call_to_action: { type: card.call_to_action || call_to_action },
          })),
        },
      };
    }

    const res = await axios.post(
      `${this.baseUrl}/${adAccountId}/adcreatives`,
      { name, object_story_spec },
      { params: { access_token: accessToken } }
    );

    return res.data.id; // meta_creative_id
  }

  // Create full Ad (creative + ad)
  async createAd(userId, adsetDbId, payload) {
    const adset = await MetaAdSet.findById(adsetDbId)
      .populate({ path: "ad_account_id" })
      .populate({ path: "campaign_id" });

    if (!adset) throw new Error("Ad Set not found");

    const token = adset.ad_account_id.meta_access_token;
    const accountId = adset.ad_account_id.meta_ad_account_id;

    const { name, status = "PAUSED", creative: creativePayload } = payload;

    // Create creative on Meta
    const meta_creative_id = await this.createCreative(accountId, token, creativePayload);

    // Create ad
    const res = await axios.post(
      `${this.baseUrl}/${accountId}/ads`,
      {
        name,
        adset_id: adset.meta_adset_id,
        creative: { creative_id: meta_creative_id },
        status,
      },
      { params: { access_token: token } }
    );

    // Save to DB
    const ad = await MetaAd.create({
      user_id: userId,
      ad_account_id: adset.ad_account_id._id,
      campaign_id: adset.campaign_id._id,
      adset_id: adsetDbId,
      meta_ad_id: res.data.id,
      meta_adset_id: adset.meta_adset_id,
      name,
      status,
      creative: {
        meta_creative_id,
        ...creativePayload,
      },
      is_synced: true,
      last_synced_at: new Date(),
    });

    return ad;
  }
}

export const metaCreativeService = new MetaCreativeService();