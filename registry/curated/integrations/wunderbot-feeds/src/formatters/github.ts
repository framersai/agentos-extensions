import type { APIEmbed } from 'discord.js';

export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
  author: { login: string; avatar_url: string };
}

export function formatGitHubReleaseEmbed(
  repo: string,
  release: GitHubRelease,
  brandColor: number,
): APIEmbed {
  const tag = release.tag_name;
  const title = release.name || tag;
  const body = (release.body || 'No changelog provided.').slice(0, 1500);
  const published = new Date(release.published_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });

  return {
    title: `📦 New Release: ${repo.split('/')[1]} ${tag}`,
    description: `**${title}**\n\n${body}`,
    url: release.html_url,
    color: brandColor,
    fields: [
      { name: 'Repo', value: `[${repo}](https://github.com/${repo})`, inline: true },
      { name: 'Published', value: published, inline: true },
    ],
    footer: { text: 'Powered by Rabbit Hole | rabbithole.inc' },
  };
}
