import type { APIEmbed } from 'discord.js';

export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
  author: { login: string; avatar_url: string };
}

/** Strip HTML tags and clean up GitHub release body for Discord. */
function cleanReleaseBody(raw: string): string {
  if (!raw) return '';

  let text = raw;

  // Strip HTML tags (e.g. <small>, <br>, <h2>, etc.)
  text = text.replace(/<[^>]+>/g, '');

  // Clean up common GitHub changelog patterns
  // Remove "Full Changelog: https://..." lines
  text = text.replace(/\*?\*?Full Changelog\*?\*?:?\s*https?:\/\/\S+/gi, '');

  // Remove commit SHA references like (abc1234)
  text = text.replace(/\([\da-f]{7,40}\)/g, '');

  // Clean up excessive blank lines
  text = text.replace(/\n{3,}/g, '\n\n');

  // Trim and limit
  text = text.trim();

  // If body is just a version heading with nothing else, simplify
  if (text.split('\n').filter((l) => l.trim()).length <= 1) {
    return '';
  }

  return text;
}

export function formatGitHubReleaseEmbed(
  repo: string,
  release: GitHubRelease,
  brandColor: number,
): APIEmbed {
  const tag = release.tag_name;
  const title = release.name || tag;
  const body = cleanReleaseBody(release.body);
  const published = new Date(release.published_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });

  // Build description: title + cleaned changelog
  const descParts: string[] = [];
  if (title !== tag) descParts.push(`**${title}**`);
  if (body) {
    // Truncate to 1200 chars to leave room for fields
    descParts.push(body.length > 1200 ? body.slice(0, 1197) + '...' : body);
  }
  if (descParts.length === 0) descParts.push('New release published.');

  return {
    title: `📦 New Release: ${repo.split('/')[1]} ${tag}`,
    description: descParts.join('\n\n'),
    url: release.html_url,
    color: brandColor,
    fields: [
      { name: 'Repo', value: `[${repo}](https://github.com/${repo})`, inline: true },
      { name: 'Published', value: published, inline: true },
    ],
    footer: { text: 'Powered by Rabbit Hole | rabbithole.inc' },
  };
}
