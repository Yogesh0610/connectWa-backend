import axios from 'axios';
import FormData from 'form-data';

const GRAPH = 'https://graph.facebook.com/v21.0';

class MetaSocialPostService {
  // ── Facebook Page Post ────────────────────────────────────────────────────────

  async createFacebookPost(pageAccessToken, pageId, { content, hashtags = [], link_url, image_urls = [] }) {
    const message = hashtags.length
      ? `${content}\n\n${hashtags.map(h => (h.startsWith('#') ? h : `#${h}`)).join(' ')}`
      : content;

    let postId;

    if (image_urls.length > 0) {
      // Multi-photo post: upload each as unpublished photo, then batch
      if (image_urls.length === 1) {
        const res = await axios.post(`${GRAPH}/${pageId}/photos`, {
          url:          image_urls[0],
          message,
          access_token: pageAccessToken,
        });
        postId = res.data.post_id || res.data.id;
      } else {
        // Upload photos as attached_media
        const photoIds = await Promise.all(image_urls.map(async (url) => {
          const r = await axios.post(`${GRAPH}/${pageId}/photos`, {
            url,
            published:    false,
            access_token: pageAccessToken,
          });
          return { media_fbid: r.data.id };
        }));

        const res = await axios.post(`${GRAPH}/${pageId}/feed`, {
          message,
          attached_media: photoIds,
          access_token:   pageAccessToken,
        });
        postId = res.data.id;
      }
    } else if (link_url) {
      const res = await axios.post(`${GRAPH}/${pageId}/feed`, {
        message,
        link:         link_url,
        access_token: pageAccessToken,
      });
      postId = res.data.id;
    } else {
      const res = await axios.post(`${GRAPH}/${pageId}/feed`, {
        message,
        access_token: pageAccessToken,
      });
      postId = res.data.id;
    }

    return postId;
  }

  // ── Instagram Post (via Meta Graph API) ───────────────────────────────────────
  // Requires Instagram Business Account linked to a Facebook Page

  async createInstagramPost(pageAccessToken, igAccountId, { content, hashtags = [], image_url }) {
    if (!image_url) throw new Error('Instagram posts require an image');

    const caption = hashtags.length
      ? `${content}\n\n${hashtags.map(h => (h.startsWith('#') ? h : `#${h}`)).join(' ')}`
      : content;

    // Step 1: Create media container
    const containerRes = await axios.post(`${GRAPH}/${igAccountId}/media`, {
      image_url,
      caption,
      access_token: pageAccessToken,
    });

    // Step 2: Publish
    const publishRes = await axios.post(`${GRAPH}/${igAccountId}/media_publish`, {
      creation_id:  containerRes.data.id,
      access_token: pageAccessToken,
    });

    return publishRes.data.id;
  }

  // ── Analytics ─────────────────────────────────────────────────────────────────

  async getPostAnalytics(pageAccessToken, postId) {
    try {
      const res = await axios.get(`${GRAPH}/${postId}`, {
        params: {
          fields:       'likes.summary(true),comments.summary(true),shares',
          access_token: pageAccessToken,
        },
      });
      return {
        likes:    res.data.likes?.summary?.total_count    || 0,
        comments: res.data.comments?.summary?.total_count || 0,
        shares:   res.data.shares?.count                 || 0,
      };
    } catch {
      return { likes: 0, comments: 0, shares: 0 };
    }
  }

  async getPagePostInsights(pageAccessToken, postId) {
    try {
      const res = await axios.get(`${GRAPH}/${postId}/insights`, {
        params: {
          metric:       'post_impressions,post_clicks',
          access_token: pageAccessToken,
        },
      });
      const metrics = {};
      (res.data.data || []).forEach(m => { metrics[m.name] = m.values?.[0]?.value || 0; });
      return {
        impressions: metrics.post_impressions || 0,
        clicks:      metrics.post_clicks      || 0,
      };
    } catch {
      return { impressions: 0, clicks: 0 };
    }
  }
}

export const metaSocialPostService = new MetaSocialPostService();
