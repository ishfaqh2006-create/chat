import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://ishfaqh2006_db_user:xdNqD75ZfrZo3TNh@cluster0.jjsq2zr.mongodb.net/szchat?retryWrites=true&w=majority";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

let cached = global.mongooseCache ?? { conn: null, promise: null };
global.mongooseCache = cached;

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((m) => {
      console.log('[szchat] Connected to MongoDB Atlas');
      return m;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    console.error('[szchat] MongoDB connection error:', e);
    throw e;
  }

  return cached.conn;
}

export function isMongoDBConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

// ── Schemas ──────────────────────────────────────────────────────────────────

const ConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  maxUsers: { type: Number, default: 20 },
  adminName: { type: String, default: 'Ishfaq' },
  adminPassword: { type: String, default: 'Ishfaq@11' },
});

const UserSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  fullName: { type: String, required: true },
  password: { type: String, required: true },
  avatarColor: { type: String, default: '#00a884' },
  createdAt: { type: String, default: () => new Date().toISOString() },
  lastSeen: { type: Number, default: Date.now },
  statusMessage: { type: String, default: 'Hey there! I am using szchat.' },
  contacts: [{ type: String }],
});

const MessageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  senderId: { type: String, required: true },
  receiverId: { type: String, required: true },
  text: { type: String, default: '' },
  fileUrl: { type: String },
  fileType: { type: String },
  ciphertext: { type: String },
  iv: { type: String },
  encrypted: { type: Boolean, default: true },
  timestamp: { type: Number, default: Date.now },
  status: { type: String, default: 'sent' },
  viewOnce: { type: Boolean, default: false },
  viewOnceOpened: { type: Boolean, default: false },
  disappearingOption: { type: String, default: 'off' },
  expiresAt: { type: Number },
  deletedFor: [{ type: String }],
  // Reply fields
  replyToId: { type: String },
  replyToText: { type: String },
  replyToSender: { type: String },
});

// Index for fast conversation lookups
MessageSchema.index({ senderId: 1, receiverId: 1 });
MessageSchema.index({ timestamp: 1 });

const TypingSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  typingTo: { type: String },
  timestamp: { type: Number, default: Date.now },
});

export const ConfigModel =
  mongoose.models.Config || mongoose.model('Config', ConfigSchema);
export const UserModel =
  mongoose.models.User || mongoose.model('User', UserSchema);
export const MessageModel =
  mongoose.models.Message || mongoose.model('Message', MessageSchema);
export const TypingModel =
  mongoose.models.Typing || mongoose.model('Typing', TypingSchema);
