import { NextResponse } from 'next/server';
import { connectToDatabase, UserModel } from '@/lib/mongodb';

export async function POST(req: Request) {
  try {
    const { userId, fullName, statusMessage } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    await connectToDatabase();

    const updateFields: Record<string, string> = {};
    if (fullName && fullName.trim()) updateFields.fullName = fullName.trim();
    if (statusMessage !== undefined) updateFields.statusMessage = statusMessage.trim();

    const updated = await UserModel.findOneAndUpdate(
      { id: userId },
      { $set: updateFields },
      { new: true }
    ).lean<any>();

    if (!updated) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { password: _pw, __v, _id, ...safeUser } = updated as any;
    return NextResponse.json({ success: true, user: safeUser });
  } catch (err) {
    console.error('Profile update error:', err);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
