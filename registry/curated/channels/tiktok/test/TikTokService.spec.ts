/**
 * Unit tests for TikTokService (TikTok API for Business wrapper).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mock fns so vi.mock factory can reference them
const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn().mockReturnValue({
      get: mockGet,
      post: mockPost,
    }),
  },
}));

import { TikTokService, type TikTokConfig } from '../src/TikTokService';

const TEST_CONFIG: TikTokConfig = {
  accessToken: 'test-access-token-123',
  username: 'testuser',
  password: 'testpass',
};

describe('TikTokService', () => {
  let service: TikTokService;

  beforeEach(() => {
    service = new TikTokService(TEST_CONFIG);
    mockGet.mockReset();
    mockPost.mockReset();
  });

  describe('lifecycle', () => {
    it('should not be running initially', () => {
      expect(service.isRunning).toBe(false);
    });

    it('should initialize and mark as running', async () => {
      await service.initialize();
      expect(service.isRunning).toBe(true);
    });

    it('should be idempotent on double initialize', async () => {
      await service.initialize();
      await service.initialize();
      expect(service.isRunning).toBe(true);
    });

    it('should shutdown cleanly', async () => {
      await service.initialize();
      await service.shutdown();
      expect(service.isRunning).toBe(false);
    });

    it('should no-op shutdown when not running', async () => {
      await service.shutdown();
      expect(service.isRunning).toBe(false);
    });
  });

  describe('uploadVideo', () => {
    it('should upload a video via two-step process', async () => {
      await service.initialize();

      mockPost
        .mockResolvedValueOnce({
          data: { data: { publish_id: 'pub-init-1' } },
        })
        .mockResolvedValueOnce({
          data: {
            data: {
              publish_id: 'pub-final-1',
              share_url: 'https://tiktok.com/@user/video/123',
            },
          },
        });

      const result = await service.uploadVideo({
        videoUrl: 'https://example.com/video.mp4',
        caption: 'Test video',
      });

      expect(result.id).toBe('pub-final-1');
      expect(result.caption).toBe('Test video');
      expect(result.shareUrl).toBe('https://tiktok.com/@user/video/123');

      // Verify init call
      expect(mockPost).toHaveBeenCalledWith('/post/publish/inbox/video/init/', expect.objectContaining({
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: 'https://example.com/video.mp4',
        },
      }));

      // Verify publish call
      expect(mockPost).toHaveBeenCalledWith('/post/publish/video/init/', expect.objectContaining({
        post_info: expect.objectContaining({
          title: 'Test video',
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_comment: false,
          disable_duet: false,
          disable_stitch: false,
        }),
      }));
    });

    it('should append hashtags to caption', async () => {
      await service.initialize();
      mockPost
        .mockResolvedValueOnce({ data: { data: { publish_id: 'p1' } } })
        .mockResolvedValueOnce({ data: { data: { publish_id: 'p2' } } });

      await service.uploadVideo({
        videoUrl: 'https://example.com/video.mp4',
        caption: 'My video',
        hashtags: ['fyp', '#viral'],
      });

      expect(mockPost).toHaveBeenCalledWith('/post/publish/video/init/', expect.objectContaining({
        post_info: expect.objectContaining({
          title: 'My video #fyp #viral',
        }),
      }));
    });

    it('should use custom privacy level', async () => {
      await service.initialize();
      mockPost
        .mockResolvedValueOnce({ data: { data: {} } })
        .mockResolvedValueOnce({ data: { data: {} } });

      await service.uploadVideo({
        videoUrl: 'https://example.com/video.mp4',
        caption: 'Private',
        privacyLevel: 'SELF_ONLY',
      });

      expect(mockPost).toHaveBeenCalledWith('/post/publish/video/init/', expect.objectContaining({
        post_info: expect.objectContaining({
          privacy_level: 'SELF_ONLY',
        }),
      }));
    });

    it('should pass disable flags and cover timestamp', async () => {
      await service.initialize();
      mockPost
        .mockResolvedValueOnce({ data: { data: {} } })
        .mockResolvedValueOnce({ data: { data: {} } });

      await service.uploadVideo({
        videoUrl: 'https://example.com/video.mp4',
        caption: 'Test',
        disableComment: true,
        disableDuet: true,
        disableStitch: true,
        coverTimestampMs: 5000,
      });

      expect(mockPost).toHaveBeenCalledWith('/post/publish/video/init/', expect.objectContaining({
        post_info: expect.objectContaining({
          disable_comment: true,
          disable_duet: true,
          disable_stitch: true,
          video_cover_timestamp_ms: 5000,
        }),
      }));
    });

    it('should fall back to init publish_id when final publish_id is missing', async () => {
      await service.initialize();
      mockPost
        .mockResolvedValueOnce({ data: { data: { publish_id: 'init-only-id' } } })
        .mockResolvedValueOnce({ data: { data: {} } });

      const result = await service.uploadVideo({
        videoUrl: 'https://example.com/video.mp4',
        caption: 'Test',
      });

      expect(result.id).toBe('init-only-id');
    });

    it('should throw when not initialized', async () => {
      await expect(
        service.uploadVideo({
          videoUrl: 'https://example.com/video.mp4',
          caption: 'Test',
        }),
      ).rejects.toThrow('TikTokService not initialized');
    });
  });

  describe('getTrendingHashtags', () => {
    it('should fetch trending hashtags', async () => {
      await service.initialize();
      mockPost.mockResolvedValueOnce({
        data: {
          data: {
            hashtags: [
              { hashtag_name: 'fyp', id: 'h1', video_count: 1000, view_count: 50000 },
              { name: 'trending', id: 'h2', video_count: 500 },
            ],
          },
        },
      });

      const trends = await service.getTrendingHashtags(10);
      expect(trends).toHaveLength(2);
      expect(trends[0].type).toBe('hashtag');
      expect(trends[0].name).toBe('fyp');
      expect(trends[0].id).toBe('h1');
      expect(trends[0].videoCount).toBe(1000);
      expect(trends[0].viewCount).toBe(50000);
      expect(trends[1].name).toBe('trending');
    });

    it('should cap maxResults at 100', async () => {
      await service.initialize();
      mockPost.mockResolvedValueOnce({ data: { data: { hashtags: [] } } });

      await service.getTrendingHashtags(200);
      expect(mockPost).toHaveBeenCalledWith('/research/hashtag/query/', {
        max_count: 100,
      });
    });

    it('should default to 20 max results', async () => {
      await service.initialize();
      mockPost.mockResolvedValueOnce({ data: { data: { hashtags: [] } } });

      await service.getTrendingHashtags();
      expect(mockPost).toHaveBeenCalledWith('/research/hashtag/query/', {
        max_count: 20,
      });
    });
  });

  describe('getTrendingSounds', () => {
    it('should fetch trending sounds', async () => {
      await service.initialize();
      mockPost.mockResolvedValueOnce({
        data: {
          data: {
            sounds: [
              { title: 'Popular Song', id: 's1', video_count: 2000 },
            ],
          },
        },
      });

      const trends = await service.getTrendingSounds(5);
      expect(trends).toHaveLength(1);
      expect(trends[0].type).toBe('sound');
      expect(trends[0].name).toBe('Popular Song');
      expect(trends[0].id).toBe('s1');
    });

    it('should handle music key in response', async () => {
      await service.initialize();
      mockPost.mockResolvedValueOnce({
        data: {
          data: {
            music: [
              { name: 'Alt Song', id: 's2' },
            ],
          },
        },
      });

      const trends = await service.getTrendingSounds(5);
      expect(trends).toHaveLength(1);
      expect(trends[0].name).toBe('Alt Song');
    });
  });

  describe('searchVideos', () => {
    it('should search videos by keyword', async () => {
      await service.initialize();
      mockPost.mockResolvedValueOnce({
        data: {
          data: {
            videos: [
              {
                id: 'v1',
                title: 'Fun Video',
                video_description: 'A fun video',
                create_time: 1706745600,
                view_count: 100,
                like_count: 10,
                comment_count: 5,
                share_count: 2,
              },
            ],
          },
        },
      });

      const videos = await service.searchVideos({ query: 'fun' });
      expect(videos).toHaveLength(1);
      expect(videos[0].id).toBe('v1');
      expect(videos[0].title).toBe('Fun Video');
      expect(videos[0].caption).toBe('A fun video');
      expect(videos[0].metrics?.views).toBe(100);
      expect(videos[0].metrics?.likes).toBe(10);
    });

    it('should send correct search body', async () => {
      await service.initialize();
      mockPost.mockResolvedValueOnce({ data: { data: { videos: [] } } });

      await service.searchVideos({ query: 'cooking', maxResults: 5, cursor: 10 });
      expect(mockPost).toHaveBeenCalledWith('/research/video/query/', {
        query: {
          and: [{ operation: 'IN', field_name: 'keyword', field_values: ['cooking'] }],
        },
        max_count: 5,
        cursor: 10,
      });
    });

    it('should cap maxResults at 100', async () => {
      await service.initialize();
      mockPost.mockResolvedValueOnce({ data: { data: { videos: [] } } });

      await service.searchVideos({ query: 'test', maxResults: 200 });
      expect(mockPost).toHaveBeenCalledWith('/research/video/query/', expect.objectContaining({
        max_count: 100,
      }));
    });
  });

  describe('searchUsers', () => {
    it('should search users by keyword', async () => {
      await service.initialize();
      mockPost.mockResolvedValueOnce({
        data: {
          data: {
            users: [
              {
                id: 'u1',
                username: 'creator1',
                display_name: 'Creator One',
                avatar_url: 'https://example.com/avatar.jpg',
                follower_count: 500,
                following_count: 100,
                likes_count: 10000,
                video_count: 30,
              },
            ],
          },
        },
      });

      const users = await service.searchUsers('creator');
      expect(users).toHaveLength(1);
      expect(users[0].id).toBe('u1');
      expect(users[0].username).toBe('creator1');
      expect(users[0].displayName).toBe('Creator One');
      expect(users[0].followerCount).toBe(500);
      expect(users[0].likeCount).toBe(10000);
    });
  });

  describe('getVideoAnalytics', () => {
    it('should fetch analytics for a video', async () => {
      await service.initialize();
      mockPost.mockResolvedValueOnce({
        data: {
          data: {
            videos: [
              {
                view_count: 5000,
                like_count: 200,
                comment_count: 50,
                share_count: 20,
              },
            ],
          },
        },
      });

      const analytics = await service.getVideoAnalytics('vid-1');
      expect(analytics.videoId).toBe('vid-1');
      expect(analytics.metrics.views).toBe(5000);
      expect(analytics.metrics.likes).toBe(200);
      expect(analytics.metrics.comments).toBe(50);
      expect(analytics.metrics.shares).toBe(20);
    });

    it('should return zero metrics when video data is empty', async () => {
      await service.initialize();
      mockPost.mockResolvedValueOnce({ data: { data: { videos: [{}] } } });

      const analytics = await service.getVideoAnalytics('vid-empty');
      expect(analytics.metrics.views).toBe(0);
      expect(analytics.metrics.likes).toBe(0);
    });

    it('should handle missing videos array', async () => {
      await service.initialize();
      mockPost.mockResolvedValueOnce({ data: { data: {} } });

      const analytics = await service.getVideoAnalytics('vid-none');
      expect(analytics.metrics.views).toBe(0);
    });
  });

  describe('getCreatorAnalytics', () => {
    it('should fetch creator-level analytics', async () => {
      await service.initialize();
      mockGet.mockResolvedValueOnce({
        data: {
          data: {
            user: {
              follower_count: 10000,
              following_count: 500,
              likes_count: 50000,
              video_count: 200,
            },
          },
        },
      });

      const analytics = await service.getCreatorAnalytics();
      expect(analytics.followerCount).toBe(10000);
      expect(analytics.followingCount).toBe(500);
      expect(analytics.likeCount).toBe(50000);
      expect(analytics.videoCount).toBe(200);
    });

    it('should return zero values when user data is empty', async () => {
      await service.initialize();
      mockGet.mockResolvedValueOnce({ data: { data: { user: {} } } });

      const analytics = await service.getCreatorAnalytics();
      expect(analytics.followerCount).toBe(0);
      expect(analytics.followingCount).toBe(0);
    });
  });

  describe('likeVideo', () => {
    it('should like a video by ID', async () => {
      await service.initialize();
      mockPost.mockResolvedValueOnce({ data: {} });

      await service.likeVideo('vid-1');
      expect(mockPost).toHaveBeenCalledWith('/video/like/', { video_id: 'vid-1' });
    });

    it('should throw when not initialized', async () => {
      await expect(service.likeVideo('vid-1')).rejects.toThrow('TikTokService not initialized');
    });
  });

  describe('commentOnVideo', () => {
    it('should post a comment on a video', async () => {
      await service.initialize();
      mockPost.mockResolvedValueOnce({
        data: { data: { comment_id: 'comment-abc' } },
      });

      const result = await service.commentOnVideo('vid-1', 'Great video!');
      expect(result.commentId).toBe('comment-abc');
      expect(mockPost).toHaveBeenCalledWith('/video/comment/', {
        video_id: 'vid-1',
        text: 'Great video!',
      });
    });

    it('should return empty string when comment_id is missing', async () => {
      await service.initialize();
      mockPost.mockResolvedValueOnce({ data: { data: {} } });

      const result = await service.commentOnVideo('vid-1', 'Test');
      expect(result.commentId).toBe('');
    });
  });

  describe('getRecommendedVideos', () => {
    it('should fetch recommended (For You) videos', async () => {
      await service.initialize();
      mockPost.mockResolvedValueOnce({
        data: {
          data: {
            videos: [
              { id: 'rv1', title: 'Recommended', view_count: 999 },
              { id: 'rv2', title: 'Also Recommended', view_count: 888 },
            ],
          },
        },
      });

      const videos = await service.getRecommendedVideos(5);
      expect(videos).toHaveLength(2);
      expect(videos[0].id).toBe('rv1');
      expect(videos[0].metrics?.views).toBe(999);
    });

    it('should cap maxResults at 20', async () => {
      await service.initialize();
      mockPost.mockResolvedValueOnce({ data: { data: { videos: [] } } });

      await service.getRecommendedVideos(50);
      expect(mockPost).toHaveBeenCalledWith('/video/list/', expect.objectContaining({
        max_count: 20,
      }));
    });
  });

  describe('getMe', () => {
    it('should return current user info', async () => {
      await service.initialize();
      mockGet.mockResolvedValueOnce({
        data: {
          data: {
            user: {
              open_id: 'user-123',
              username: 'myuser',
              display_name: 'My User',
              avatar_url: 'https://example.com/avatar.jpg',
              follower_count: 1500,
              following_count: 200,
              likes_count: 8000,
              video_count: 75,
            },
          },
        },
      });

      const me = await service.getMe();
      expect(me.id).toBe('user-123');
      expect(me.username).toBe('myuser');
      expect(me.displayName).toBe('My User');
      expect(me.avatarUrl).toBe('https://example.com/avatar.jpg');
      expect(me.followerCount).toBe(1500);
      expect(me.videoCount).toBe(75);
    });

    it('should throw when not initialized', async () => {
      await expect(service.getMe()).rejects.toThrow('TikTokService not initialized');
    });
  });
});
