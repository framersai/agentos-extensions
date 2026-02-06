/**
 * @file SolanaProvider.ts
 * @description Solana on-chain anchor provider (Wunderland-compatible).
 *
 * Publishes AgentOS anchor records via the `anchor_post` instruction of the
 * Wunderland Solana program (content_hash + manifest_hash).
 *
 * Proof level: `publicly-timestamped`
 *
 * Required runtime dependency: `@solana/web3.js`
 * Optional runtime dependency (only if using base58 secret keys): `bs58`
 *
 * @module @framers/agentos-ext-anchor-providers
 */

import type { AnchorProvider, AnchorRecord, AnchorProviderResult, ProofLevel } from '@framers/agentos';
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import type { BaseProviderConfig } from '../types.js';
import { resolveBaseConfig } from '../types.js';
import { hashCanonicalAnchor } from '../utils/serialization.js';

export interface SolanaProviderConfig extends BaseProviderConfig {
  /** JSON-RPC endpoint URL. */
  rpcUrl: string;
  /** Wunderland on-chain program ID. */
  programId: string;

  /**
   * Registrar signer used for immutable agent registration (initialize_config / initialize_agent).
   *
   * If `autoInitializeAgent` is enabled and the agent identity is missing, the provider will
   * require a registrar signer and will register the agent programmatically.
   */
  registrarSecretKeyJson?: number[];
  registrarKeypairPath?: string;
  registrarPrivateKeyBase58?: string;

  /**
   * Signer secret key (Solana Keypair secretKey bytes) as a JSON number array.
   * Example: the contents of a Solana CLI keypair file.
   */
  signerSecretKeyJson?: number[];

  /** Path to Solana keypair JSON file (array of numbers). */
  signerKeypairPath?: string;

  /** Base58-encoded signer secret key bytes (64 bytes). */
  signerPrivateKeyBase58?: string;

  /** Solana cluster label used only for `externalRef` formatting. */
  cluster?: 'devnet' | 'testnet' | 'mainnet-beta' | 'localnet';

  /** Commitment level (e.g. 'confirmed', 'finalized'). Default: 'confirmed'. */
  commitment?: string;

  /**
   * If true, automatically initializes the agent (initialize_agent) when missing.
   *
   * Note: With immutable-agent enforcement, `initialize_agent` is registrar-gated, so auto-init
   * requires registrar signer configuration.
   *
   * Default: true
   */
  autoInitializeAgent?: boolean;

  /** Display name used when auto-initializing the agent. Default: 'AgentOS'. */
  agentDisplayName?: string;

  /**
   * HEXACO traits (u16 0-1000) used when auto-initializing the agent.
   * Order: [H, E, X, A, C, O]
   */
  agentHexacoTraits?: [number, number, number, number, number, number];
}

const DEFAULT_HEXACO: [number, number, number, number, number, number] = [800, 450, 650, 750, 850, 700];

function instructionDiscriminator(methodName: string): Buffer {
  return createHash('sha256')
    .update(`global:${methodName}`)
    .digest()
    .subarray(0, 8);
}

function decodeProgramConfigRegistrar(data: Buffer): Buffer {
  // Anchor discriminator (8) + registrar pubkey (32) + bump (1)
  const offset = 8;
  return data.subarray(offset, offset + 32);
}

function encodeName32(displayName: string): Buffer {
  const bytes = Buffer.alloc(32, 0);
  Buffer.from(displayName, 'utf-8').copy(bytes, 0, 0, Math.min(displayName.length, 32));
  return bytes;
}

function parseSolExternalRef(externalRef: string): { cluster?: string; postPda?: string; txSignature?: string } | null {
  // Format: sol:<cluster>:<postPda>:<txSignature>
  const parts = externalRef.split(':');
  if (parts.length < 4) return null;
  const [prefix, cluster, postPda, txSignature] = parts;
  if (prefix !== 'sol' && prefix !== 'solana') return null;
  return { cluster, postPda, txSignature };
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function canonicalizeSolanaManifest(anchor: AnchorRecord): string {
  // Deterministic (sorted keys) is achieved by constructing object literal in stable order.
  return JSON.stringify({
    anchorId: anchor.id,
    eventCount: anchor.eventCount,
    merkleRoot: anchor.merkleRoot,
    schema: 'agentos.solana-anchor-manifest.v1',
    sequenceFrom: anchor.sequenceFrom,
    sequenceTo: anchor.sequenceTo,
    signature: anchor.signature,
    timestamp: anchor.timestamp,
  });
}

export class SolanaProvider implements AnchorProvider {
  readonly id = 'solana';
  readonly name = 'Solana On-Chain Anchor (Wunderland)';
  readonly proofLevel: ProofLevel = 'publicly-timestamped';

  private readonly config: SolanaProviderConfig;
  private readonly baseConfig: Required<BaseProviderConfig>;

  constructor(config: SolanaProviderConfig) {
    this.config = {
      cluster: 'devnet',
      commitment: 'confirmed',
      autoInitializeAgent: true,
      agentDisplayName: 'AgentOS',
      ...config,
    };
    this.baseConfig = resolveBaseConfig(config);
  }

  async publish(anchor: AnchorRecord): Promise<AnchorProviderResult> {
    const publishedAt = new Date().toISOString();

    try {
      if (!this.config.rpcUrl) {
        throw new Error('Missing required config: rpcUrl');
      }
      if (!this.config.programId) {
        throw new Error('Missing required config: programId');
      }

      const hasSigner =
        (this.config.signerSecretKeyJson && this.config.signerSecretKeyJson.length > 0) ||
        !!this.config.signerKeypairPath ||
        !!this.config.signerPrivateKeyBase58;
      if (!hasSigner) {
        throw new Error(
          'Missing signer configuration. Provide one of: signerSecretKeyJson, signerKeypairPath, signerPrivateKeyBase58.',
        );
      }
      if (this.config.signerKeypairPath && !existsSync(this.config.signerKeypairPath)) {
        throw new Error(`signerKeypairPath does not exist: ${this.config.signerKeypairPath}`);
      }

      const web3 = await this.loadWeb3();
      const signer = await this.loadSigner(web3);
      const connection = new web3.Connection(this.config.rpcUrl, this.config.commitment);

      const programId = new web3.PublicKey(this.config.programId);

      // ── Derive agent PDA ────────────────────────────────────────────────
      const [agentPda] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from('agent'), signer.publicKey.toBuffer()],
        programId,
      );

      // ── Ensure agent exists (optional auto-init) ────────────────────────
      let agentInfo = await connection.getAccountInfo(agentPda, this.config.commitment);
      if (!agentInfo && this.config.autoInitializeAgent) {
        const registrar = await this.loadRegistrarSigner(web3);
        const [configPda] = web3.PublicKey.findProgramAddressSync([Buffer.from('config')], programId);

        // Ensure config exists (initialize_config)
        let cfgInfo = await connection.getAccountInfo(configPda, this.config.commitment);
        if (!cfgInfo) {
          const loaderId = new web3.PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
          const [programDataPda] = web3.PublicKey.findProgramAddressSync([programId.toBuffer()], loaderId);
          const initConfigIx = new web3.TransactionInstruction({
            programId,
            keys: [
              { pubkey: configPda, isSigner: false, isWritable: true },
              { pubkey: programDataPda, isSigner: false, isWritable: false },
              { pubkey: registrar.publicKey, isSigner: true, isWritable: true },
              { pubkey: web3.SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            data: instructionDiscriminator('initialize_config'),
          });
          const initConfigTx = new web3.Transaction().add(initConfigIx);
          try {
            await web3.sendAndConfirmTransaction(connection, initConfigTx, [registrar]);
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            // If another process initialized the config concurrently, proceed to verify it.
            if (!msg.toLowerCase().includes('already in use')) {
              throw e;
            }
          }
          cfgInfo = await connection.getAccountInfo(configPda, this.config.commitment);
        }

        if (!cfgInfo) {
          throw new Error('ProgramConfig not found and could not be initialized.');
        }

        const cfgData = Buffer.from(cfgInfo.data);
        if (cfgData.length < 8 + 32 + 1) {
          throw new Error(`ProgramConfig account data too small (${cfgData.length} bytes).`);
        }
        const onChainRegistrar = new web3.PublicKey(decodeProgramConfigRegistrar(cfgData)).toBase58();
        if (onChainRegistrar !== registrar.publicKey.toBase58()) {
          throw new Error(
            `Program registrar mismatch. On-chain registrar=${onChainRegistrar}, configured registrar=${registrar.publicKey.toBase58()}`,
          );
        }

        const displayName = this.config.agentDisplayName || 'AgentOS';
        const traits = this.config.agentHexacoTraits || DEFAULT_HEXACO;

        const initData = Buffer.alloc(8 + 32 + 12);
        instructionDiscriminator('initialize_agent').copy(initData, 0);
        encodeName32(displayName).copy(initData, 8);
        for (let i = 0; i < 6; i++) {
          const val = traits[i];
          if (val < 0 || val > 1000) {
            throw new Error(`Invalid agentHexacoTraits[${i}] value: ${val} (expected 0..1000)`);
          }
          initData.writeUInt16LE(val, 8 + 32 + i * 2);
        }

        const ix = new web3.TransactionInstruction({
          programId,
          keys: [
            { pubkey: configPda, isSigner: false, isWritable: false },
            { pubkey: agentPda, isSigner: false, isWritable: true },
            // agent_authority (unchecked, does not sign)
            { pubkey: signer.publicKey, isSigner: false, isWritable: false },
            { pubkey: registrar.publicKey, isSigner: true, isWritable: true },
            { pubkey: web3.SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data: initData,
        });

        const tx = new web3.Transaction().add(ix);
        await web3.sendAndConfirmTransaction(connection, tx, [registrar]);
        agentInfo = await connection.getAccountInfo(agentPda, this.config.commitment);
      }

      if (!agentInfo) {
        throw new Error(
          'AgentIdentity not found. Register this agent authority with the registrar (initialize_agent) or enable autoInitializeAgent with registrar signer configuration.',
        );
      }

      // total_posts is at offset 8 + 32 + 32 + 12 + 1 + 8 = 93
      const agentData = Buffer.from(agentInfo.data);
      if (agentData.length < 97) {
        throw new Error(`AgentIdentity account data too small (${agentData.length} bytes).`);
      }
      const postIndex = agentData.readUInt32LE(93);

      const indexBuf = Buffer.alloc(4);
      indexBuf.writeUInt32LE(postIndex);
      const [postPda] = web3.PublicKey.findProgramAddressSync(
        [Buffer.from('post'), agentPda.toBuffer(), indexBuf],
        programId,
      );

      // ── Hashes ──────────────────────────────────────────────────────────
      const contentHashHex = await hashCanonicalAnchor(anchor);
      const manifestHashHex = sha256Hex(canonicalizeSolanaManifest(anchor));

      const contentHash = Buffer.from(contentHashHex, 'hex');
      const manifestHash = Buffer.from(manifestHashHex, 'hex');

      if (contentHash.length !== 32 || manifestHash.length !== 32) {
        throw new Error('Computed hashes are not 32 bytes.');
      }

      const data = Buffer.concat([
        instructionDiscriminator('anchor_post'),
        contentHash,
        manifestHash,
      ]);

      const postIx = new web3.TransactionInstruction({
        programId,
        keys: [
          { pubkey: postPda, isSigner: false, isWritable: true },
          { pubkey: agentPda, isSigner: false, isWritable: true },
          { pubkey: signer.publicKey, isSigner: true, isWritable: true },
          { pubkey: web3.SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
      });

      const postTx = new web3.Transaction().add(postIx);
      const txSignature = await web3.sendAndConfirmTransaction(connection, postTx, [signer]);

      return {
        providerId: this.id,
        success: true,
        publishedAt,
        externalRef: `sol:${this.config.cluster}:${postPda.toBase58()}:${txSignature}`,
        metadata: {
          cluster: this.config.cluster,
          commitment: this.config.commitment,
          postPda: postPda.toBase58(),
          agentPda: agentPda.toBase58(),
          postIndex,
          txSignature,
        },
      };
    } catch (e: unknown) {
      return {
        providerId: this.id,
        success: false,
        publishedAt,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  async verify(anchor: AnchorRecord): Promise<boolean> {
    try {
      if (!anchor.externalRef) return false;
      const parsed = parseSolExternalRef(anchor.externalRef);
      if (!parsed?.postPda) return false;

      const web3 = await this.loadWeb3();
      const connection = new web3.Connection(this.config.rpcUrl, this.config.commitment);
      const postKey = new web3.PublicKey(parsed.postPda);

      const postInfo = await connection.getAccountInfo(postKey, this.config.commitment);
      if (!postInfo) return false;

      const data = Buffer.from(postInfo.data);
      // discriminator (8) + agent (32) + post_index (4)
      const offset = 8 + 32 + 4;
      if (data.length < offset + 64) return false;

      const onChainContentHash = data.subarray(offset, offset + 32);
      const onChainManifestHash = data.subarray(offset + 32, offset + 64);

      const expectedContentHash = Buffer.from(await hashCanonicalAnchor(anchor), 'hex');
      const expectedManifestHash = Buffer.from(sha256Hex(canonicalizeSolanaManifest(anchor)), 'hex');

      return onChainContentHash.equals(expectedContentHash) && onChainManifestHash.equals(expectedManifestHash);
    } catch {
      return false;
    }
  }

  async dispose(): Promise<void> {
    // No persistent resources.
  }

  private async loadWeb3(): Promise<any> {
    const moduleName: string = '@solana/web3.js';
    try {
      return await import(moduleName);
    } catch (e: unknown) {
      throw new Error(
        'SolanaProvider requires @solana/web3.js at runtime. ' +
        'Install it in your project to enable Solana anchoring.',
      );
    }
  }

  private async loadSigner(web3: any): Promise<any> {
    if (this.config.signerSecretKeyJson && this.config.signerSecretKeyJson.length > 0) {
      return web3.Keypair.fromSecretKey(Uint8Array.from(this.config.signerSecretKeyJson));
    }

    if (this.config.signerKeypairPath) {
      if (!existsSync(this.config.signerKeypairPath)) {
        throw new Error(`signerKeypairPath does not exist: ${this.config.signerKeypairPath}`);
      }
      const raw = JSON.parse(readFileSync(this.config.signerKeypairPath, 'utf-8')) as number[];
      return web3.Keypair.fromSecretKey(Uint8Array.from(raw));
    }

    if (this.config.signerPrivateKeyBase58) {
      const bs58 = await this.loadBs58();
      const secretKey = (bs58.decode as (input: string) => Uint8Array)(this.config.signerPrivateKeyBase58);
      return web3.Keypair.fromSecretKey(secretKey);
    }

    throw new Error(
      'Missing signer configuration. Provide one of: signerSecretKeyJson, signerKeypairPath, signerPrivateKeyBase58.',
    );
  }

  private async loadRegistrarSigner(web3: any): Promise<any> {
    if (this.config.registrarSecretKeyJson && this.config.registrarSecretKeyJson.length > 0) {
      return web3.Keypair.fromSecretKey(Uint8Array.from(this.config.registrarSecretKeyJson));
    }

    if (this.config.registrarKeypairPath) {
      if (!existsSync(this.config.registrarKeypairPath)) {
        throw new Error(`registrarKeypairPath does not exist: ${this.config.registrarKeypairPath}`);
      }
      const raw = JSON.parse(readFileSync(this.config.registrarKeypairPath, 'utf-8')) as number[];
      return web3.Keypair.fromSecretKey(Uint8Array.from(raw));
    }

    if (this.config.registrarPrivateKeyBase58) {
      const bs58 = await this.loadBs58();
      const secretKey = (bs58.decode as (input: string) => Uint8Array)(this.config.registrarPrivateKeyBase58);
      return web3.Keypair.fromSecretKey(secretKey);
    }

    throw new Error(
      'Missing registrar signer configuration. Provide one of: registrarSecretKeyJson, registrarKeypairPath, registrarPrivateKeyBase58.',
    );
  }

  private async loadBs58(): Promise<any> {
    const moduleName: string = 'bs58';
    try {
      const mod = await import(moduleName);
      return (mod as any).default ?? mod;
    } catch {
      throw new Error('signerPrivateKeyBase58 requires the optional dependency "bs58" at runtime.');
    }
  }
}
