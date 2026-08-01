import { NextResponse } from 'next/server';

// In-memory store for signaling data (Warning: this only works if Vercel reuses the same serverless instance)
// For a 2-person app with low traffic, this often works long enough to establish a WebRTC connection.
const rooms: Record<string, {
  offer?: any;
  answer?: any;
  iceCandidatesA: any[];
  iceCandidatesB: any[];
  createdAt: number;
}> = {};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, roomId, payload } = body;

    if (!roomId) {
      return NextResponse.json({ error: 'Room ID required' }, { status: 400 });
    }

    if (!rooms[roomId]) {
      rooms[roomId] = { iceCandidatesA: [], iceCandidatesB: [], createdAt: Date.now() };
    }

    const room = rooms[roomId];

    switch (action) {
      case 'offer':
        room.offer = payload;
        break;
      case 'answer':
        room.answer = payload;
        break;
      case 'candidate-a':
        room.iceCandidatesA.push(payload);
        break;
      case 'candidate-b':
        room.iceCandidatesB.push(payload);
        break;
      case 'poll':
        // Just return the current state of the room
        return NextResponse.json({
          offer: room.offer,
          answer: room.answer,
          iceCandidatesA: room.iceCandidatesA,
          iceCandidatesB: room.iceCandidatesB,
        });
      case 'clear':
        delete rooms[roomId];
        break;
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
