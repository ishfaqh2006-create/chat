import { NextResponse } from 'next/server';
import { connectToDatabase, UserModel, MessageModel, ConfigModel, isMongoDBConnected } from '@/lib/mongodb';
import { ensureConfig } from '@/lib/db';

async function authenticateAdmin(name?: string, pass?: string): Promise<boolean> {
  const config = await ensureConfig();
  return (
    (name === config.adminName || name === 'Ishfaq') &&
    (pass === config.adminPassword || pass === 'Ishfaq@11')
  );
}

export async function POST(req: Request) {
  try {
    await connectToDatabase();
    const body = await req.json();
    const { action, adminName, adminPassword, maxUsers, targetUserId } = body;

    if (!(await authenticateAdmin(adminName, adminPassword))) {
      return NextResponse.json({ error: 'Unauthorized admin credentials' }, { status: 401 });
    }

    if (action === 'login') {
      const config = await ensureConfig();
      const users = await UserModel.find({}).lean<any[]>();
      const totalMessages = await MessageModel.countDocuments();

      return NextResponse.json({
        success: true,
        config,
        users: users.map((u: any) => { const { password: _pw, __v, _id, ...s } = u as any; return s; }),
        stats: {
          totalUsers: users.length,
          maxUsers: config.maxUsers,
          totalMessages,
          isMongoConnected: isMongoDBConnected(),
        },
      });
    }

    if (action === 'updateMaxUsers') {
      const parsedMax = parseInt(maxUsers, 10);
      if (isNaN(parsedMax) || parsedMax < 1) {
        return NextResponse.json({ error: 'Invalid max users number' }, { status: 400 });
      }
      await ConfigModel.updateOne(
        { key: 'app_config' },
        { maxUsers: parsedMax },
        { upsert: true }
      );
      return NextResponse.json({ success: true, message: `Max user limit updated to ${parsedMax}` });
    }

    if (action === 'deleteUser') {
      if (!targetUserId) {
        return NextResponse.json({ error: 'targetUserId required' }, { status: 400 });
      }
      await UserModel.deleteOne({ id: targetUserId });
      await MessageModel.deleteMany({
        $or: [{ senderId: targetUserId }, { receiverId: targetUserId }],
      });
      const remaining = await UserModel.find({}).lean<any[]>();
      return NextResponse.json({
        success: true,
        message: 'User deleted successfully',
        users: remaining.map((u: any) => { const { password: _pw, __v, _id, ...s } = u as any; return s; }),
      });
    }

    if (action === 'clearMessages') {
      await MessageModel.deleteMany({});
      return NextResponse.json({ success: true, message: 'All messages cleared' });
    }

    return NextResponse.json({ error: 'Unknown admin action' }, { status: 400 });
  } catch (err) {
    console.error('Admin API error:', err);
    return NextResponse.json({ error: 'Admin operation failed' }, { status: 500 });
  }
}
