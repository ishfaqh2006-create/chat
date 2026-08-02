import { NextResponse } from 'next/server';
import { connectToDatabase, UserModel } from '@/lib/mongodb';

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    await connectToDatabase();
    const cleanUsername = username.trim().toLowerCase();

    const user = await UserModel.findOne({
      username: { $regex: new RegExp(`^${cleanUsername}$`, 'i') },
    }).lean<any>();

    if (!user) {
      return NextResponse.json(
        { error: 'User not found. Please sign up first.' },
        { status: 404 }
      );
    }

    if (user.password !== password) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
    }

    // Update lastSeen
    await UserModel.updateOne({ id: user.id }, { lastSeen: Date.now() });

    const { password: _pw, __v, _id, ...safeUser } = user as any;
    safeUser.lastSeen = Date.now();
    return NextResponse.json({ success: true, user: safeUser });
  } catch (err: any) {
    console.error('Login error:', err);
    return NextResponse.json(
      { error: 'Failed to authenticate user' },
      { status: 500 }
    );
  }
}
