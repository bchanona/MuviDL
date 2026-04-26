export type MediaSource = 'youtube' | 'facebook' | 'instagram' | 'tiktok';

export interface SourceConfig {
  name: MediaSource;
  displayName: string;
  patterns: RegExp[];
  aliases: string[];
  requiresAuth: boolean;
}

export const SOURCE_CONFIGS: Record<MediaSource, SourceConfig> = {
  youtube: {
    name: 'youtube',
    displayName: 'YouTube',
    patterns: [
      /youtube\.com\/watch\?v=[\w-]+/i,
      /youtu\.be\/[\w-]+/i,
      /youtube\.com\/shorts\/[\w-]+/i,
      /youtube\.com\/playlist\?list=[\w-]+/i,
      /youtube\.com\/live\/[\w-]+/i,
    ],
    aliases: ['youtube.com', 'youtu.be', 'music.youtube.com'],
    requiresAuth: false,
  },
  facebook: {
    name: 'facebook',
    displayName: 'Facebook',
    patterns: [
      /facebook\.com\/[\w.-]+\/videos\/\d+/i,
      /facebook\.com\/watch\/\?[\w.-]+/i,
      /fb\.watch\/[\w-]+/i,
      /facebook\.com\/reel\/\d+/i,
    ],
    aliases: ['facebook.com', 'fb.watch', 'fb.com'],
    requiresAuth: false,
  },
  instagram: {
    name: 'instagram',
    displayName: 'Instagram',
    patterns: [
      /instagram\.com\/p\/[\w-]+\/?/i,
      /instagram\.com\/reel\/[\w-]+\/?/i,
      /instagram\.com\/tv\/[\w-]+\/?/i,
    ],
    aliases: ['instagram.com'],
    requiresAuth: false,
  },
  tiktok: {
    name: 'tiktok',
    displayName: 'TikTok',
    patterns: [
      /tiktok\.com\/@[\w.-]+\/video\/\d+/i,
      /tiktok\.com\/v\/[\w.-]+/i,
      /vm\.tiktok\.com\/[\w-]+/i,
    ],
    aliases: ['tiktok.com', 'vm.tiktok.com'],
    requiresAuth: false,
  },
};

export function detectSource(url: string): MediaSource | null {
  const lowerUrl = url.toLowerCase();
  
  for (const [source, config] of Object.entries(SOURCE_CONFIGS) as [MediaSource, SourceConfig][]) {
    for (const pattern of config.patterns) {
      if (pattern.test(lowerUrl)) {
        return source;
      }
    }
    for (const alias of config.aliases) {
      if (lowerUrl.includes(alias)) {
        return source;
      }
    }
  }
  
  return null;
}

export function isValidUrl(url: string): { valid: boolean; source: MediaSource | null; error?: string } {
  if (!url || typeof url !== 'string') {
    return { valid: false, source: null, error: 'URL is required' };
  }

  try {
    const parsed = new URL(url);
    
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, source: null, error: 'URL must use HTTP or HTTPS' };
    }

    const source = detectSource(url);
    
    if (!source) {
      return { valid: false, source: null, error: 'URL is not from a supported platform' };
    }

    return { valid: true, source };
  } catch {
    return { valid: false, source: null, error: 'Invalid URL format' };
  }
}

export function getSupportedSources(): string[] {
  return Object.values(SOURCE_CONFIGS).map(c => c.displayName);
}