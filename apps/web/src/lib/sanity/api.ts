import { sanityClient, sanityWriteClient } from './client';
import type { 
  AgentMemoryDocument, 
  WorldConfigDocument, 
  UserPreferenceDocument,
  GeneratedContentDocument 
} from './types';

export async function getAgentMemories(agentRole?: string): Promise<AgentMemoryDocument[]> {
  const query = agentRole
    ? `*[_type == "agentMemory" && agentRole == $agentRole] | order(_createdAt desc)`
    : `*[_type == "agentMemory"] | order(_createdAt desc)`;
  
  return sanityClient.fetch(query, { agentRole });
}

export async function createAgentMemory(memory: Omit<AgentMemoryDocument, keyof SanityDocument>): Promise<AgentMemoryDocument> {
  const doc = {
    _type: 'agentMemory',
    ...memory,
  };
  
  const result = await sanityWriteClient.create(doc);
  return result as AgentMemoryDocument;
}

export async function getWorldConfigs(): Promise<WorldConfigDocument[]> {
  return sanityClient.fetch(`*[_type == "worldConfig"] | order(_createdAt desc)`);
}

export async function getActiveWorldConfig(): Promise<WorldConfigDocument | null> {
  return sanityClient.fetch(`*[_type == "worldConfig" && isActive == true][0]`);
}

export async function createWorldConfig(config: Omit<WorldConfigDocument, keyof SanityDocument>): Promise<WorldConfigDocument> {
  const doc = {
    _type: 'worldConfig',
    ...config,
  };
  
  const result = await sanityWriteClient.create(doc);
  return result as WorldConfigDocument;
}

export async function setActiveWorld(worldId: string): Promise<void> {
  await sanityWriteClient
    .patch({ query: `*[_type == "worldConfig" && isActive == true]` })
    .set({ isActive: false })
    .commit();
  
  await sanityWriteClient
    .patch(worldId)
    .set({ isActive: true })
    .commit();
}

export async function getUserPreference(userId: string): Promise<UserPreferenceDocument | null> {
  return sanityClient.fetch(
    `*[_type == "userPreference" && userId == $userId][0]`,
    { userId }
  );
}

export async function upsertUserPreference(
  userId: string, 
  preferences: Partial<Omit<UserPreferenceDocument, keyof SanityDocument | 'userId'>>
): Promise<UserPreferenceDocument> {
  const existing = await getUserPreference(userId);
  
  if (existing) {
    const result = await sanityWriteClient
      .patch(existing._id)
      .set({ ...preferences })
      .commit();
    return result as UserPreferenceDocument;
  }
  
  const doc = {
    _type: 'userPreference',
    userId,
    ...preferences,
  };
  
  const result = await sanityWriteClient.create(doc);
  return result as UserPreferenceDocument;
}

export async function saveGeneratedContent(
  content: Omit<GeneratedContentDocument, keyof SanityDocument>
): Promise<GeneratedContentDocument> {
  const doc = {
    _type: 'generatedContent',
    ...content,
  };
  
  const result = await sanityWriteClient.create(doc);
  return result as GeneratedContentDocument;
}

export async function getGeneratedContent(type?: string): Promise<GeneratedContentDocument[]> {
  const query = type
    ? `*[_type == "generatedContent" && type == $type] | order(_createdAt desc)`
    : `*[_type == "generatedContent"] | order(_createdAt desc)`;
  
  return sanityClient.fetch(query, { type });
}

interface SanityDocument {
  _id: string;
  _type: string;
  _createdAt: string;
  _updatedAt: string;
  _rev: string;
}
