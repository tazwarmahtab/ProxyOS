import { Browserbase } from '@browserbasehq/sdk';

const bb = new Browserbase({
  apiKey: process.env.BROWSERBASE_API_KEY,
});

export async function createBrowserSession(options: {
  projectId: string;
  browserSettings?: {
    fingerprint?: {
      browsers?: ('chrome' | 'firefox')[];
      devices?: ('desktop' | 'mobile')[];
      operatingSystems?: ('windows' | 'macos' | 'linux')[];
    };
    viewport?: {
      width: number;
      height: number;
    };
  };
}) {
  const session = await bb.sessions.create({
    projectId: options.projectId,
    browserSettings: options.browserSettings,
  });

  return session;
}

export async function getBrowserSession(sessionId: string) {
  const session = await bb.sessions.retrieve(sessionId);
  return session;
}

export async function listBrowserSessions(projectId: string) {
  const sessions = await bb.sessions.list({ projectId });
  return sessions;
}

export async function closeBrowserSession(sessionId: string) {
  await bb.sessions.update(sessionId, { status: 'CLOSED' });
}

export function getConnectUrl(sessionId: string): string {
  return `wss://connect.browserbase.com?sessionId=${sessionId}`;
}

export default bb;
