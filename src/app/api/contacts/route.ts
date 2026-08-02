import { NextResponse } from 'next/server';
import { connectToDatabase, UserModel } from '@/lib/mongodb';
import { ensureConfig } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { action, userId, contactUsername } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    await connectToDatabase();
    await ensureConfig();

    const currentUser = await UserModel.findOne({ id: userId }).lean<any>();
    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const currentContacts: string[] = currentUser.contacts || [];

    // ── SEARCH ────────────────────────────────────────────────────────────────
    if (action === 'search') {
      if (!contactUsername?.trim()) {
        return NextResponse.json({ users: [] });
      }

      const query = contactUsername.trim().toLowerCase();
      const matches = await UserModel.find({
        id: { $ne: userId },
        $or: [
          { username: { $regex: query, $options: 'i' } },
          { fullName: { $regex: query, $options: 'i' } },
        ],
      }).lean<any[]>();

      const result = matches.map((u: any) => {
        const { password: _pw, __v, _id, ...safe } = u as any;
        return { ...safe, isAdded: currentContacts.includes(u.id) };
      });

      return NextResponse.json({ users: result });
    }

    // ── ADD ───────────────────────────────────────────────────────────────────
    if (action === 'add') {
      if (!contactUsername?.trim()) {
        return NextResponse.json({ error: 'Contact username is required' }, { status: 400 });
      }

      const cleanQuery = contactUsername.trim().toLowerCase();
      const targetUser = await UserModel.findOne({
        username: { $regex: new RegExp(`^${cleanQuery}$`, 'i') },
      }).lean<any>();

      if (!targetUser) {
        return NextResponse.json(
          { error: `User "@${contactUsername}" not found` },
          { status: 404 }
        );
      }

      if (targetUser.id === userId) {
        return NextResponse.json(
          { error: 'You cannot add yourself as a contact' },
          { status: 400 }
        );
      }

      // Add bi-directionally
      await UserModel.updateOne(
        { id: userId },
        { $addToSet: { contacts: targetUser.id } }
      );
      await UserModel.updateOne(
        { id: targetUser.id },
        { $addToSet: { contacts: userId } }
      );

      const { password: _pw, __v, _id, ...safeTarget } = targetUser as any;
      return NextResponse.json({
        success: true,
        message: `Added @${targetUser.username} to contacts`,
        contact: safeTarget,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('Contacts API error:', err);
    return NextResponse.json({ error: 'Failed to process contact request' }, { status: 500 });
  }
}
