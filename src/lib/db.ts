/**
 * db.ts — MongoDB-only data layer for szchat.
 * All persistence is via MongoDB Atlas. No filesystem writes.
 */

export type AppConfig = {
  maxUsers: number;
  adminName: string;
  adminPassword: string;
};

export type UserRecord = {
  id: string;
  username: string;
  fullName: string;
  password: string;
  avatarColor: string;
  createdAt: string;
  lastSeen: number;
  statusMessage?: string;
  contacts?: string[];
};

export type DisappearingOption = 'off' | 'view_once' | '1h' | '24h' | '7d';

export type MessageRecord = {
  id: string;
  senderId: string;
  receiverId: string;
  text?: string;
  fileUrl?: string;
  fileType?: 'image' | 'audio' | 'document';
  ciphertext?: string;
  iv?: string;
  encrypted?: boolean;
  timestamp: number;
  status: 'sent' | 'delivered' | 'read';
  viewOnce?: boolean;
  viewOnceOpened?: boolean;
  disappearingOption?: DisappearingOption;
  expiresAt?: number;
  deletedFor?: string[];
};

export function calculateExpirationTime(
  option: DisappearingOption,
  now: number = Date.now()
): number | undefined {
  if (option === '1h')  return now + 60 * 60 * 1000;
  if (option === '24h') return now + 24 * 60 * 60 * 1000;
  if (option === '7d')  return now + 7 * 24 * 60 * 60 * 1000;
  return undefined;
}

/** Ensure the default config document exists in MongoDB. */
export async function ensureConfig(): Promise<AppConfig> {
  const { connectToDatabase, ConfigModel } = await import('./mongodb');
  await connectToDatabase();

  let configDoc = await ConfigModel.findOne({ key: 'app_config' }).lean<any>();
  if (!configDoc) {
    configDoc = await ConfigModel.create({
      key: 'app_config',
      maxUsers: 20,
      adminName: 'Ishfaq',
      adminPassword: 'Ishfaq@11',
    });
  }

  return {
    maxUsers: configDoc.maxUsers ?? 20,
    adminName: configDoc.adminName ?? 'Ishfaq',
    adminPassword: configDoc.adminPassword ?? 'Ishfaq@11',
  };
}
