import { NextResponse } from 'next/server';
import { connectToDatabase, MessageModel } from '@/lib/mongodb';
import { calculateExpirationTime, DisappearingOption } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const peerId = searchParams.get('peerId');

    if (!userId || !peerId) {
      return NextResponse.json({ error: 'userId and peerId are required' }, { status: 400 });
    }

    await connectToDatabase();
    const now = Date.now();

    // Delete expired messages
    await MessageModel.deleteMany({
      expiresAt: { $lt: now },
    }).catch(() => {});

    // Mark as read
    await MessageModel.updateMany(
      { senderId: peerId, receiverId: userId, status: { $ne: 'read' } },
      { status: 'read' }
    ).catch(() => {});

    // Fetch conversation
    const messages = await MessageModel.find({
      $or: [
        { senderId: userId, receiverId: peerId },
        { senderId: peerId, receiverId: userId },
      ],
      $and: [
        { deletedFor: { $not: { $elemMatch: { $eq: userId } } } },
        {
          $or: [
            { expiresAt: { $exists: false } },
            { expiresAt: { $gte: now } },
          ],
        },
      ],
    })
      .sort({ timestamp: 1 })
      .lean<any[]>();

    return NextResponse.json({ messages });
  } catch (err) {
    console.error('Get messages error:', err);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      senderId,
      receiverId,
      text,
      fileUrl,
      fileType,
      ciphertext,
      iv,
      viewOnce,
      disappearingOption,
    } = body;

    if (!senderId || !receiverId) {
      return NextResponse.json(
        { error: 'senderId and receiverId are required' },
        { status: 400 }
      );
    }
    if (!text && !fileUrl && !ciphertext) {
      return NextResponse.json(
        { error: 'Message content or media required' },
        { status: 400 }
      );
    }

    await connectToDatabase();
    const now = Date.now();

    // Check receiver online status
    const { UserModel } = await import('@/lib/mongodb');
    const receiver = await UserModel.findOne({ id: receiverId }).lean<any>();
    const isReceiverOnline = receiver ? now - receiver.lastSeen < 25000 : false;

    const chosenOption: DisappearingOption =
      (disappearingOption as DisappearingOption) || (viewOnce ? 'view_once' : 'off');
    const expiresAt = calculateExpirationTime(chosenOption, now);

    const newMsg = {
      id: 'msg_' + now + '_' + Math.random().toString(36).substr(2, 6),
      senderId,
      receiverId,
      text: text || '',
      fileUrl: fileUrl || undefined,
      fileType: fileType || undefined,
      ciphertext: ciphertext || undefined,
      iv: iv || undefined,
      encrypted: true,
      timestamp: now,
      status: isReceiverOnline ? 'delivered' : 'sent',
      viewOnce: chosenOption === 'view_once' || !!viewOnce,
      viewOnceOpened: false,
      disappearingOption: chosenOption,
      expiresAt,
      deletedFor: [],
    };

    const saved = await MessageModel.create(newMsg);
    const plain = saved.toObject();
    const { _id, __v, ...cleanMsg } = plain as any;

    return NextResponse.json({ success: true, message: cleanMsg });
  } catch (err) {
    console.error('Post message error:', err);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { action, messageId, userId } = body;

    await connectToDatabase();

    const msg = await MessageModel.findOne({ id: messageId });
    if (!msg) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    if (action === 'viewOnceOpened') {
      msg.viewOnceOpened = true;
      await msg.save();
    } else if (action === 'deleteForMe') {
      if (!msg.deletedFor.includes(userId)) {
        msg.deletedFor.push(userId);
      }
      await msg.save();
    } else if (action === 'deleteForEveryone') {
      if (msg.senderId === userId) {
        await MessageModel.deleteOne({ id: messageId });
        return NextResponse.json({ success: true, deleted: true });
      }
    }

    return NextResponse.json({ success: true, message: msg.toObject() });
  } catch (err) {
    console.error('Patch message error:', err);
    return NextResponse.json({ error: 'Failed to update message' }, { status: 500 });
  }
}
