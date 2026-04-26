import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';

export interface CookieProfile {
  id: string;
  name: string;
  filePath: string;
  email?: string;
  isValid: boolean;
  lastUsed?: Date;
  lastValidated?: Date;
  successCount: number;
  failCount: number;
  createdAt: Date;
}

export interface CookieValidationResult {
  valid: boolean;
  error?: string;
  videoAccess?: boolean;
}

const COOKIES_DIR = './cookies';
const PROFILE_FILE = path.join(COOKIES_DIR, 'profiles.json');
const TEST_VIDEO_ID = 'dQw4w9WgXcQ';

export class CookieManager {
  private profiles: Map<string, CookieProfile> = new Map();
  private currentProfileId: string | null = null;
  private autoRotate: boolean = true;
  private failureThreshold: number = 3;

  constructor() {
    this.ensureCookiesDir();
    this.loadProfiles();
  }

  private ensureCookiesDir(): void {
    if (!fs.existsSync(COOKIES_DIR)) {
      fs.mkdirSync(COOKIES_DIR, { recursive: true });
    }
  }

  private loadProfiles(): void {
    try {
      if (fs.existsSync(PROFILE_FILE)) {
        const data = JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf-8'));
        for (const profile of data.profiles || []) {
          this.profiles.set(profile.id, profile);
        }
        this.currentProfileId = data.currentProfileId || data.profiles?.[0]?.id || null;
        this.autoRotate = data.autoRotate !== false;
      }
    } catch {
      this.profiles = new Map();
    }
  }

  private saveProfiles(): void {
    const data = {
      profiles: Array.from(this.profiles.values()),
      currentProfileId: this.currentProfileId,
      autoRotate: this.autoRotate,
    };
    fs.writeFileSync(PROFILE_FILE, JSON.stringify(data, null, 2));
  }

  addProfile(name: string, filePath: string, email?: string): CookieProfile {
    const profile: CookieProfile = {
      id: crypto.randomUUID(),
      name,
      filePath,
      email,
      isValid: false,
      successCount: 0,
      failCount: 0,
      createdAt: new Date(),
    };

    this.profiles.set(profile.id, profile);

    if (!this.currentProfileId) {
      this.currentProfileId = profile.id;
    }

    this.saveProfiles();
    this.validateProfile(profile.id);
    return profile;
  }

  removeProfile(id: string): boolean {
    const profile = this.profiles.get(id);
    if (!profile) return false;

    this.profiles.delete(id);

    if (this.currentProfileId === id) {
      this.currentProfileId = this.profiles.keys().next().value || null;
    }

    this.saveProfiles();
    return true;
  }

  async validateProfile(profileId: string): Promise<CookieValidationResult> {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      return { valid: false, error: 'Profile not found' };
    }

    if (!fs.existsSync(profile.filePath)) {
      profile.isValid = false;
      this.saveProfiles();
      return { valid: false, error: 'Cookie file not found' };
    }

    return new Promise((resolve) => {
      const args = [
        '--cookies', profile.filePath,
        '--no-playlist',
        '--dump-json',
        `https://youtube.com/watch?v=${TEST_VIDEO_ID}`,
      ];

      const child = spawn('yt-dlp', args);
      let output = '';
      let errorOutput = '';

      child.stdout?.on('data', (data) => { output += data.toString(); });
      child.stderr?.on('data', (data) => { errorOutput += data.toString(); });

      child.on('close', (code) => {
        const profile = this.profiles.get(profileId);
        if (!profile) {
          resolve({ valid: false, error: 'Profile not found' });
          return;
        }

        profile.lastValidated = new Date();

        if (code === 0 && output.trim()) {
          profile.isValid = true;
          this.saveProfiles();
          resolve({ valid: true, videoAccess: true });
        } else if (errorOutput.includes('Sign in') || errorOutput.includes('bot')) {
          profile.isValid = false;
          this.saveProfiles();
          resolve({ valid: false, error: 'Authentication required' });
        } else if (errorOutput.includes('unavailable')) {
          profile.isValid = true;
          this.saveProfiles();
          resolve({ valid: true, videoAccess: false });
        } else {
          profile.isValid = false;
          this.saveProfiles();
          resolve({ valid: false, error: `Exit code: ${code}` });
        }
      });

      child.on('error', (error) => {
        const profile = this.profiles.get(profileId);
        if (profile) {
          profile.isValid = false;
          this.saveProfiles();
        }
        resolve({ valid: false, error: error.message });
      });

      setTimeout(() => {
        child.kill();
        const profile = this.profiles.get(profileId);
        if (profile) {
          profile.isValid = false;
          this.saveProfiles();
        }
        resolve({ valid: false, error: 'Timeout' });
      }, 15000);
    });
  }

  getCurrentProfile(): CookieProfile | null {
    if (!this.currentProfileId) return null;
    return this.profiles.get(this.currentProfileId) || null;
  }

  getCurrentCookiesFile(): string | null {
    const profile = this.getCurrentProfile();
    return profile?.isValid ? profile.filePath : null;
  }

  rotateToNext(): CookieProfile | null {
    const profiles = Array.from(this.profiles.values()).filter(p => p.isValid);
    
    if (profiles.length === 0) return null;

    const currentIndex = profiles.findIndex(p => p.id === this.currentProfileId);
    const nextIndex = (currentIndex + 1) % profiles.length;
    this.currentProfileId = profiles[nextIndex].id;
    this.saveProfiles();

    return this.getCurrentProfile();
  }

  markSuccess(): void {
    const profile = this.getCurrentProfile();
    if (profile) {
      profile.successCount++;
      profile.lastUsed = new Date();
      profile.isValid = true;
      this.saveProfiles();
    }
  }

  markFailure(): void {
    const profile = this.getCurrentProfile();
    if (profile) {
      profile.failCount++;
      profile.lastUsed = new Date();

      if (profile.failCount >= 3) {
        profile.isValid = false;
        this.rotateToNext();
      }

      this.saveProfiles();
    }
  }

  getAllProfiles(): CookieProfile[] {
    return Array.from(this.profiles.values());
  }

  getProfile(id: string): CookieProfile | null {
    return this.profiles.get(id) || null;
  }

  setCurrentProfile(id: string): boolean {
    if (!this.profiles.has(id)) return false;
    this.currentProfileId = id;
    this.saveProfiles();
    return true;
  }

  getStats() {
    const profiles = Array.from(this.profiles.values());
    const validCount = profiles.filter(p => p.isValid).length;
    const totalSuccess = profiles.reduce((sum, p) => sum + p.successCount, 0);
    const totalFail = profiles.reduce((sum, p) => sum + p.failCount, 0);

    return {
      total: profiles.length,
      valid: validCount,
      invalid: profiles.length - validCount,
      currentProfile: this.currentProfileId,
      totalSuccess,
      totalFail,
    };
  }
}

export const cookieManager = new CookieManager();