import { NextResponse } from 'next/server';
import { connectToDatabase, UserModel, MessageModel, isMongoDBConnected } from '@/lib/mongodb';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const currentUserId = searchParams.get('userId');

    await connectToDatabase();

    if (!currentUserId) {
      return NextResponse.json({ users: [] });
    }

    const currentUser = await UserModel.findOne({ id: currentUserId }).lean<any>();
    if (!currentUser) {
      return NextResponse.json({ users: [] });
    }

    // Update lastSeen heartbeat
    await UserModel.updateOne({ id: currentUserId }, { lastSeen: Date.now() });

    const userContactsList: string[] = currentUser.contacts || [];

    // Find users with existing message history
    const sentMsgs = await MessageModel.distinct('receiverId', { senderId: currentUserId });
    const recvMsgs = await MessageModel.distinct('senderId', { receiverId: currentUserId });
    const threadUserIds = new Set<string>([...sentMsgs, ...recvMsgs]);

    // Allowed: explicit contacts OR users with message history
    const allowedIds = [...new Set([...userContactsList, ...Array.from(threadUserIds)])];

    if (allowedIds.length === 0) {
      return NextResponse.json({
        users: [],
        isMongoConnected: isMongoDBConnected(),
        dbProvider: 'MongoDB Atlas',
      });
    }

    const allUsers = await UserModel.find({ id: { $in: allowedIds } }).lean<any[]>();

    const now = Date.now();
    const contacts = await Promise.all(
      allUsers
        .filter((u: any) => u.id !== currentUserId)
        .map(async (u: any) => {
          const { password: _pw, __v, _id, ...safeUser } = u as any;

          // Last message in this conversation
          const lastMsg = await MessageModel.findOne({
            $and: [
              {
                $or: [
                  { senderId: currentUserId, receiverId: u.id },
                  { senderId: u.id, receiverId: currentUserId },
                ],
              },
              {
                $or: [
                  { expiresAt: { $exists: false } },
                  { expiresAt: { $gte: now } },
                ],
              },
            ],
          })
            .sort({ timestamp: -1 })
            .lean<any>();

          const unreadCount = await MessageModel.countDocuments({
            senderId: u.id,
            receiverId: currentUserId,
            status: { $ne: 'read' },
            $or: [
              { expiresAt: { $exists: false } },
              { expiresAt: { $gte: now } },
            ],
          });

          return {
            ...safeUser,
            isOnline: (now - u.lastSeen) < 25000,
            lastMessage: lastMsg || undefined,
            unreadCount,
          };
        })
    );

    return NextResponse.json({
      users: contacts,
      isMongoConnected: isMongoDBConnected(),
      dbProvider: 'MongoDB Atlas',
    });
  } catch (err) {
    console.error('Fetch users error:', err);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}
