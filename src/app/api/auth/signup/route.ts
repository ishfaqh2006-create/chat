import { NextResponse } from 'next/server';
import { connectToDatabase, UserModel } from '@/lib/mongodb';
import { ensureConfig } from '@/lib/db';

const AVATAR_COLORS = [
  '#00a884', '#128c7e', '#34b7f1', '#e52d27',
  '#8e44ad', '#d35400', '#16a085', '#2c3e50',
  '#f39c12', '#9b59b6',
];

export async function POST(req: Request) {
  try {
    const { username, fullName, password } = await req.json();

    if (!username || !username.trim()) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }
    if (!password || password.length < 3) {
      return NextResponse.json(
        { error: 'Password must be at least 3 characters' },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const config = await ensureConfig();
    const cleanUsername = username.trim().toLowerCase();

    const totalUsers = await UserModel.countDocuments();
    if (totalUsers >= config.maxUsers) {
      return NextResponse.json(
        {
          error: `Sign up limit reached! Maximum ${config.maxUsers} users allowed. Ask the admin to increase the limit.`,
        },
        { status: 400 }
      );
    }

    const existing = await UserModel.findOne({
      username: { $regex: new RegExp(`^${cleanUsername}$`, 'i') },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Username already taken. Please choose another or login.' },
        { status: 400 }
      );
    }

    const newUser = {
      id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      username: username.trim(),
      fullName: (fullName && fullName.trim()) ? fullName.trim() : username.trim(),
      password,
      avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
      createdAt: new Date().toISOString(),
      lastSeen: Date.now(),
      statusMessage: 'Hey there! I am using szchat.',
      contacts: [],
    };

    await UserModel.create(newUser);

    const { password: _pw, ...userWithoutPassword } = newUser;
    return NextResponse.json({ success: true, user: userWithoutPassword });
  } catch (err: any) {
    console.error('Signup error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to process signup' },
      { status: 500 }
    );
  }
}
