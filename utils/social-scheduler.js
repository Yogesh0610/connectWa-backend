import { SocialPost } from '../models/SocialPost.js';
import { socialPostService } from '../services/social/social-post.service.js';

const RETRY_DELAY_MS = 30 * 60 * 1000; // retry failed posts after 30 min

class SocialScheduler {
  constructor() {
    this.running  = false;
    this.interval = null;
    this.checkIntervalMs = 60_000; // every 60 s
  }

  start() {
    if (this.running) return;
    this.running = true;
    console.log('[SocialScheduler] Started');
    this._check(); // immediate first run
    this.interval = setInterval(() => this._check(), this.checkIntervalMs);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.interval);
    this.interval = null;
    console.log('[SocialScheduler] Stopped');
  }

  async _check() {
    try {
      const now = new Date();
      const retryBefore = new Date(now.getTime() - RETRY_DELAY_MS);

      // 1. Due scheduled posts
      const due = await SocialPost.find({
        status:       'scheduled',
        scheduled_at: { $lte: now },
        deleted_at:   null,
      }).limit(20);

      // 2. Failed posts eligible for retry
      const retryable = await SocialPost.find({
        status:          'failed',
        deleted_at:      null,
        retry_count:     { $lt: 3 },
        $or: [
          { last_attempt_at: { $lte: retryBefore } },
          { last_attempt_at: null },
        ],
      }).limit(10);

      const toProcess = [...due, ...retryable];
      if (!toProcess.length) return;
      console.log(`[SocialScheduler] ${due.length} due, ${retryable.length} retryable`);

      for (const post of toProcess) {
        await SocialPost.findByIdAndUpdate(post._id, {
          status:          'publishing',
          last_attempt_at: now,
          $inc:            { retry_count: post.status === 'failed' ? 1 : 0 },
        });

        socialPostService.publishNow(post._id).catch(async err => {
          console.error(`[SocialScheduler] Failed to publish post ${post._id}:`, err.message);
          const p = await SocialPost.findById(post._id);
          const exhausted = (p?.retry_count || 0) >= (p?.max_retries || 3);
          await SocialPost.findByIdAndUpdate(post._id, { status: 'failed' }).catch(() => {});
          if (exhausted) {
            console.warn(`[SocialScheduler] Post ${post._id} exhausted retries — giving up`);
          }
        });
      }
    } catch (err) {
      console.error('[SocialScheduler] Check error:', err.message);
    }
  }

  // Reset a failed post for manual retry
  async resetForRetry(postId) {
    await SocialPost.findByIdAndUpdate(postId, {
      status:      'scheduled',
      retry_count: 0,
      scheduled_at: new Date(),
      'targets.$[elem].status': 'pending',
    }, { arrayFilters: [{ 'elem.status': 'failed' }] });
  }
}

export default new SocialScheduler();
