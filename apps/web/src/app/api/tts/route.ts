import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { text, voice = 'leah' } = await request.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    if (text.length > 5000) {
      return NextResponse.json(
        { error: 'Text must be 5000 characters or less' },
        { status: 400 }
      );
    }

    const apiKey = process.env.LMNT_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'LMNT API key not configured' },
        { status: 500 }
      );
    }

    const response = await fetch('https://api.lmnt.com/v1/ai/speech/bytes', {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        voice,
        format: 'mp3',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[LMNT TTS] API error:', error);
      return NextResponse.json(
        { error: 'Failed to generate speech' },
        { status: response.status }
      );
    }

    const audioBuffer = await response.arrayBuffer();

    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error('[LMNT TTS] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  const apiKey = process.env.LMNT_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json(
      { error: 'LMNT API key not configured' },
      { status: 500 }
    );
  }

  try {
    const response = await fetch('https://api.lmnt.com/v1/voice', {
      headers: {
        'X-API-Key': apiKey,
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch voices' },
        { status: response.status }
      );
    }

    const voices = await response.json();
    return NextResponse.json(voices);
  } catch (error) {
    console.error('[LMNT TTS] Error fetching voices:', error);
    return NextResponse.json(
      { error: 'Failed to fetch voices' },
      { status: 500 }
    );
  }
}
