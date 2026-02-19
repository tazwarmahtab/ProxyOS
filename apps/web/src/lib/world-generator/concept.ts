export interface WorldConcept {
  prompt: string;
  imageUrl: string;
  styleProfile: StyleProfile;
}

export interface StyleProfile {
  mood: 'futuristic' | 'cozy' | 'minimalist' | 'industrial' | 'sci-fi';
  lighting: 'warm' | 'cool' | 'neon' | 'natural';
  complexity: 'low' | 'medium' | 'high';
}

export class WorldConceptGenerator {
  static async generateConcept(prompt: string): Promise<WorldConcept> {
    const imageUrl = 'data:image/svg+xml;base64,' + btoa(`
      <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
        <rect fill="#1a1a2e" width="512" height="512"/>
        <rect fill="#16213e" x="64" y="256" width="384" height="192"/>
        <rect fill="#0f3460" x="96" y="320" width="128" height="96"/>
        <rect fill="#0f3460" x="288" y="320" width="128" height="96"/>
        <rect fill="#e94560" x="128" y="352" width="64" height="64"/>
        <rect fill="#e94560" x="320" y="352" width="64" height="64"/>
        <rect fill="#533483" x="192" y="288" width="128" height="32"/>
        <circle fill="#f5f5f5" cx="256" cy="160" r="48"/>
        <rect fill="#1a1a2e" x="208" y="144" width="96" height="32"/>
      </svg>
    `);

    const styleProfile = this.deriveStyleProfile(prompt);

    return {
      prompt,
      imageUrl,
      styleProfile,
    };
  }

  private static deriveStyleProfile(prompt: string): StyleProfile {
    const lower = prompt.toLowerCase();
    let mood: StyleProfile['mood'] = 'futuristic';
    let lighting: StyleProfile['lighting'] = 'cool';
    let complexity: StyleProfile['complexity'] = 'medium';

    if (lower.includes('cozy') || lower.includes('warm') || lower.includes('home')) {
      mood = 'cozy';
    } else if (lower.includes('minimal') || lower.includes('clean') || lower.includes('simple')) {
      mood = 'minimalist';
    } else if (lower.includes('industrial') || lower.includes('warehouse') || lower.includes('factory')) {
      mood = 'industrial';
    } else if (lower.includes('sci-fi') || lower.includes('futuristic') || lower.includes('space')) {
      mood = 'sci-fi';
    }

    if (lower.includes('warm') || lower.includes('sunset') || lower.includes('golden')) {
      lighting = 'warm';
    } else if (lower.includes('neon') || lower.includes('glow') || lower.includes('cyber')) {
      lighting = 'neon';
    } else if (lower.includes('natural') || lower.includes('sunlight') || lower.includes('daylight')) {
      lighting = 'natural';
    }

    if (lower.includes('simple') || lower.includes('minimal') || lower.includes('clean')) {
      complexity = 'low';
    } else if (lower.includes('detailed') || lower.includes('complex') || lower.includes('intricate')) {
      complexity = 'high';
    }

    return { mood, lighting, complexity };
  }
}
