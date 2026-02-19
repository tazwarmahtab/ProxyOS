import { NextRequest, NextResponse } from 'next/server';
import { 
  getAgentMemories, 
  createAgentMemory, 
  getWorldConfigs, 
  getActiveWorldConfig,
  createWorldConfig,
  setActiveWorld,
  getUserPreference,
  upsertUserPreference,
  saveGeneratedContent,
  getGeneratedContent
} from '@/lib/sanity';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    switch (action) {
      case 'memories':
        const agentRole = searchParams.get('agentRole') || undefined;
        const memories = await getAgentMemories(agentRole);
        return NextResponse.json({ success: true, data: memories });

      case 'worlds':
        const worlds = await getWorldConfigs();
        return NextResponse.json({ success: true, data: worlds });

      case 'activeWorld':
        const activeWorld = await getActiveWorldConfig();
        return NextResponse.json({ success: true, data: activeWorld });

      case 'userPreference':
        const userId = searchParams.get('userId');
        if (!userId) {
          return NextResponse.json({ success: false, error: 'userId required' }, { status: 400 });
        }
        const preference = await getUserPreference(userId);
        return NextResponse.json({ success: true, data: preference });

      case 'generatedContent':
        const type = searchParams.get('type') || undefined;
        const content = await getGeneratedContent(type);
        return NextResponse.json({ success: true, data: content });

      default:
        return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, data } = body;

  try {
    switch (action) {
      case 'createMemory':
        const memory = await createAgentMemory(data);
        return NextResponse.json({ success: true, data: memory });

      case 'createWorld':
        const world = await createWorldConfig(data);
        return NextResponse.json({ success: true, data: world });

      case 'setActiveWorld':
        await setActiveWorld(data.worldId);
        return NextResponse.json({ success: true });

      case 'upsertUserPreference':
        const preference = await upsertUserPreference(data.userId, data.preferences);
        return NextResponse.json({ success: true, data: preference });

      case 'saveGeneratedContent':
        const content = await saveGeneratedContent(data);
        return NextResponse.json({ success: true, data: content });

      default:
        return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
