/**
 * @fileoverview Farcaster API service layer.
 *
 * Wraps the Neynar API (v2) for cast publishing, engagement, search,
 * feeds, and user lookup.
 */

import axios, { AxiosInstance } from 'axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FarcasterConfig {
  signerUuid: string;
  neynarApiKey: string;
  fid?: number;
}

export interface CastOptions {
  text: string;
  embeds?: string[];
  replyTo?: string;
  channelId?: string;
}

export interface CastResult {
  hash: string;
  authorFid: number;
  text: string;
  timestamp?: string;
  reactions?: { likes: number; recasts: number };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class FarcasterService {
  private client: AxiosInstance | null = null;
  private config: FarcasterConfig;
  private running = false;

  constructor(config: FarcasterConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (!this.config.neynarApiKey) {
      throw new Error(
        'Farcaster: no Neynar API key provided. Set NEYNAR_API_KEY or provide neynarApiKey in config.',
      );
    }
    if (!this.config.signerUuid) {
      throw new Error(
        'Farcaster: no signer UUID provided. Set FARCASTER_SIGNER_UUID or provide signerUuid in config.',
      );
    }

    this.client = axios.create({
      baseURL: 'https://api.neynar.com/v2',
      headers: {
        'api_key': this.config.neynarApiKey,
        'Content-Type': 'application/json',
      },
    });

    this.running = true;
  }

  async shutdown(): Promise<void> {
    this.client = null;
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  // -- Casting --

  async publishCast(text: string, options?: { embeds?: string[]; replyTo?: string; channelId?: string }): Promise<CastResult> {
    const client = this.requireClient();
    const body: Record<string, unknown> = {
      signer_uuid: this.config.signerUuid,
      text,
    };

    if (options?.embeds?.length) {
      body.embeds = options.embeds.map((url) => ({ url }));
    }
    if (options?.replyTo) {
      body.parent = options.replyTo;
    }
    if (options?.channelId) {
      body.channel_id = options.channelId;
    }

    const response = await client.post('/farcaster/cast', body);
    const cast = response.data?.cast ?? response.data;
    return {
      hash: cast.hash,
      authorFid: cast.author?.fid ?? this.config.fid ?? 0,
      text: cast.text ?? text,
      timestamp: cast.timestamp,
    };
  }

  async reply(parentHash: string, text: string): Promise<CastResult> {
    return this.publishCast(text, { replyTo: parentHash });
  }

  // -- Engagement --

  async likeCast(castHash: string): Promise<void> {
    const client = this.requireClient();
    await client.post('/farcaster/reaction', {
      signer_uuid: this.config.signerUuid,
      reaction_type: 'like',
      target: castHash,
    });
  }

  async recast(castHash: string): Promise<void> {
    const client = this.requireClient();
    await client.post('/farcaster/reaction', {
      signer_uuid: this.config.signerUuid,
      reaction_type: 'recast',
      target: castHash,
    });
  }

  // -- Search --

  async searchCasts(query: string, limit?: number): Promise<CastResult[]> {
    const client = this.requireClient();
    const response = await client.get('/farcaster/cast/search', {
      params: { q: query, limit: limit ?? 10 },
    });

    const casts = response.data?.result?.casts ?? response.data?.casts ?? [];
    return casts.map((c: any) => ({
      hash: c.hash,
      authorFid: c.author?.fid ?? 0,
      text: c.text,
      timestamp: c.timestamp,
      reactions: c.reactions ? {
        likes: c.reactions.likes_count ?? c.reactions.likes?.length ?? 0,
        recasts: c.reactions.recasts_count ?? c.reactions.recasts?.length ?? 0,
      } : undefined,
    }));
  }

  // -- Feed --

  async getFeed(type?: 'following' | 'trending', limit?: number): Promise<CastResult[]> {
    const client = this.requireClient();
    const response = await client.get('/farcaster/feed', {
      params: { feed_type: type ?? 'following', limit: limit ?? 20 },
    });

    const casts = response.data?.casts ?? [];
    return casts.map((c: any) => ({
      hash: c.hash,
      authorFid: c.author?.fid ?? 0,
      text: c.text,
      timestamp: c.timestamp,
      reactions: c.reactions ? {
        likes: c.reactions.likes_count ?? c.reactions.likes?.length ?? 0,
        recasts: c.reactions.recasts_count ?? c.reactions.recasts?.length ?? 0,
      } : undefined,
    }));
  }

  // -- Cast Retrieval --

  async getCast(hash: string): Promise<CastResult | null> {
    const client = this.requireClient();
    try {
      const response = await client.get('/farcaster/cast', {
        params: { identifier: hash, type: 'hash' },
      });
      const c = response.data?.cast ?? response.data;
      if (!c) return null;
      return {
        hash: c.hash,
        authorFid: c.author?.fid ?? 0,
        text: c.text,
        timestamp: c.timestamp,
        reactions: c.reactions ? {
          likes: c.reactions.likes_count ?? c.reactions.likes?.length ?? 0,
          recasts: c.reactions.recasts_count ?? c.reactions.recasts?.length ?? 0,
        } : undefined,
      };
    } catch {
      return null;
    }
  }

  async deleteCast(hash: string): Promise<void> {
    const client = this.requireClient();
    await client.delete('/farcaster/cast', {
      data: {
        signer_uuid: this.config.signerUuid,
        target_hash: hash,
      },
    });
  }

  // -- Users --

  async getUserByFid(fid: number): Promise<{ fid: number; username: string; displayName: string } | null> {
    const client = this.requireClient();
    try {
      const response = await client.get('/farcaster/user', {
        params: { fid },
      });
      const user = response.data?.user ?? response.data;
      if (!user) return null;
      return {
        fid: user.fid,
        username: user.username ?? '',
        displayName: user.display_name ?? user.username ?? '',
      };
    } catch {
      return null;
    }
  }

  async getMe(): Promise<{ fid: number; username: string; displayName: string } | null> {
    if (this.config.fid) {
      return this.getUserByFid(this.config.fid);
    }
    return null;
  }

  // -- Internal --

  private requireClient(): AxiosInstance {
    if (!this.client) throw new Error('Farcaster service not initialized');
    return this.client;
  }
}
