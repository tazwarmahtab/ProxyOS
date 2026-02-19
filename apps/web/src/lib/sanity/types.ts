export interface SanityDocument {
  _id: string;
  _type: string;
  _createdAt: string;
  _updatedAt: string;
  _rev: string;
}

export interface AgentMemoryDocument extends SanityDocument {
  _type: 'agentMemory';
  agentRole: 'proxy' | 'minion' | 'scout' | 'sage';
  title: string;
  content: string;
  tags?: string[];
  importance?: number;
}

export interface WorldConfigDocument extends SanityDocument {
  _type: 'worldConfig';
  name: string;
  description?: string;
  theme: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
  };
  styleProfile: {
    mood: 'futuristic' | 'cozy' | 'minimalist' | 'industrial' | 'sci-fi';
    lighting: 'warm' | 'cool' | 'neon' | 'natural';
    complexity: 'low' | 'medium' | 'high';
  };
  isActive?: boolean;
}

export interface UserPreferenceDocument extends SanityDocument {
  _type: 'userPreference';
  userId: string;
  activeSkinId: string;
  activeWorldId?: string;
  settings?: Record<string, any>;
}

export interface GeneratedContentDocument extends SanityDocument {
  _type: 'generatedContent';
  prompt: string;
  content: string;
  type: 'image' | 'text' | 'code' | 'world';
  agentRole: string;
  metadata?: Record<string, any>;
}
