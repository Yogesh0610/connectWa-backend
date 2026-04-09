import { SocialPost } from '../../models/SocialPost.js';
import { SocialAccount } from '../../models/SocialAccount.js';
import { linkedInService } from './social-linkedin.service.js';
import { metaSocialPostService } from './social-meta-post.service.js';
import { twitterService } from './social-twitter.service.js';

class SocialPostService {
  // ── Publish one target ────────────────────────────────────────────────────────

  async _publishTarget(post, target) {
    const account = await SocialAccount.findById(target.social_account_id);
    if (!account || !account.is_active) {
      throw new Error(`Social account not found or inactive`);
    }

    const token = account.access_token;
    const { content, hashtags = [], link_url, media = [] } = post;
    const imageUrls = media.filter(m => m.type === 'image').map(m => m.url);

    // ── LinkedIn ──────────────────────────────────────────────────────────────
    if (target.platform === 'linkedin') {
      await linkedInService.refreshTokenIfNeeded(account);
      const authorUrn = target.linkedin_urn || account.linkedin_urn;

      // Upload images if any (LinkedIn needs URNs)
      const mediaUrns = [];
      for (const url of imageUrls) {
        // For URL-based images we'd need to download first; skip if no buffer available
        // In production, use the stored buffer from upload
        try {
          const imgRes = await fetch(url);
          const buf = Buffer.from(await imgRes.arrayBuffer());
          const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
          const urn = await linkedInService.uploadImage(token, authorUrn, buf, mimeType);
          mediaUrns.push(urn);
        } catch (err) {
          console.warn(`[SocialPost] LinkedIn image upload failed:`, err.message);
        }
      }

      const postId = await linkedInService.createPost(token, authorUrn, {
        content, hashtags, link_url, media_urns: mediaUrns,
      });
      return { platform_post_id: postId };
    }

    // ── Facebook Page ─────────────────────────────────────────────────────────
    if (target.platform === 'facebook') {
      // Find the page's access token
      const page = account.pages?.find(p => p.page_id === target.account_id);
      const pageToken = page?.access_token || token;
      const postId = await metaSocialPostService.createFacebookPost(pageToken, target.account_id, {
        content, hashtags, link_url, image_urls: imageUrls,
      });
      return { platform_post_id: postId };
    }

    // ── Instagram ─────────────────────────────────────────────────────────────
    if (target.platform === 'instagram') {
      const page = account.pages?.find(p => p.page_id === target.account_id);
      const pageToken = page?.access_token || token;
      const postId = await metaSocialPostService.createInstagramPost(pageToken, target.account_id, {
        content, hashtags, image_url: imageUrls[0],
      });
      return { platform_post_id: postId };
    }

    // ── Twitter ───────────────────────────────────────────────────────────────
    if (target.platform === 'twitter') {
      const freshToken = await twitterService.ensureFreshToken(account);
      const tweetId = await twitterService.createTweet(freshToken, { content, hashtags, link_url });
      return { platform_post_id: tweetId };
    }

    throw new Error(`Unsupported platform: ${target.platform}`);
  }

  // ── Publish now ──────────────────────────────────────────────────────────────

  async publishNow(postDbId) {
    const post = await SocialPost.findById(postDbId);
    if (!post) throw new Error('Post not found');
    if (post.status === 'published') throw new Error('Post already published');

    post.status = 'publishing';
    await post.save();

    let successCount = 0;
    let failCount = 0;

    for (const target of post.targets) {
      if (target.status === 'published') { successCount++; continue; }
      try {
        const result = await this._publishTarget(post, target);
        target.status           = 'published';
        target.published_at     = new Date();
        target.platform_post_id = result.platform_post_id;
        successCount++;
      } catch (err) {
        console.error(`[SocialPost] Failed to post to ${target.platform}:`, err.message);
        target.status        = 'failed';
        target.error_message = err.message;
        failCount++;
      }
    }

    post.status       = failCount === 0 ? 'published' : successCount > 0 ? 'partially_published' : 'failed';
    post.published_at = successCount > 0 ? new Date() : undefined;
    await post.save();
    return post;
  }

  // ── Refresh analytics for a published post ────────────────────────────────────

  async refreshAnalytics(postDbId) {
    const post = await SocialPost.findById(postDbId);
    if (!post || !['published', 'partially_published'].includes(post.status)) return;

    for (const target of post.targets) {
      if (target.status !== 'published' || !target.platform_post_id) continue;
      const account = await SocialAccount.findById(target.social_account_id);
      if (!account) continue;

      try {
        let stats = {};
        if (target.platform === 'linkedin') {
          stats = await linkedInService.getPostAnalytics(account.access_token, target.platform_post_id);
        } else if (target.platform === 'twitter') {
          const freshToken = await twitterService.ensureFreshToken(account);
          stats = await twitterService.getTweetMetrics(freshToken, target.platform_post_id);
        } else if (target.platform === 'facebook') {
          const page = account.pages?.find(p => p.page_id === target.account_id);
          const tok = page?.access_token || account.access_token;
          const [basic, insights] = await Promise.all([
            metaSocialPostService.getPostAnalytics(tok, target.platform_post_id),
            metaSocialPostService.getPagePostInsights(tok, target.platform_post_id),
          ]);
          stats = { ...basic, ...insights };
        }
        Object.assign(target.analytics, stats);
      } catch (err) {
        console.warn(`[SocialPost] Analytics refresh failed for ${target.platform}:`, err.message);
      }
    }

    await post.save();
    return post;
  }
}

export const socialPostService = new SocialPostService();
