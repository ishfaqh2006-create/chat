import { NextResponse } from 'next/server';
import { connectToDatabase, TypingModel } from '@/lib/mongodb';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const peerId = searchParams.get('peerId');

    if (!userId || !peerId) {
      return NextResponse.json({ isTyping: false });
    }

    await connectToDatabase();

    const record = await TypingModel.findOne({ userId: peerId }).lean<any>();
    if (record && record.typingTo === userId) {
      const isStillTyping = Date.now() - record.timestamp < 4000;
      return NextResponse.json({ isTyping: isStillTyping });
    }

    return NextResponse.json({ isTyping: false });
  } catch (_err) {
    return NextResponse.json({ isTyping: false });
  }
}

export async function POST(req: Request) {
  try {
    const { userId, typingTo } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    await connectToDatabase();

    if (typingTo) {
      await TypingModel.findOneAndUpdate(
        { userId },
        { userId, typingTo, timestamp: Date.now() },
        { upsert: true, new: true }
      );
    } else {
      await TypingModel.deleteOne({ userId });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update typing status' }, { status: 500 });
  }
}
