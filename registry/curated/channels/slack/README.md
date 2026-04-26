# Slack Channel Extension

Bidirectional Slack messaging for AgentOS via `@slack/bolt`.

## What It Provides

- `slackChannelSendMessage`
- `slackChannelSendMedia`
- `slackChannel`

## Runtime Status

- This is a curated channel pack.
- Channels stay opt-in because they can connect, poll, or receive webhooks.
- Enable it through `createCuratedManifest({ channels: ['slack'] })` or a custom extension manifest.

## Required Secrets

- `slack.botToken`
- `slack.signingSecret`
- `slack.appToken`

## Source of Truth

- `manifest.json` defines the exported tools and messaging-channel descriptor.
- `src/` contains the adapter and tool implementations.
