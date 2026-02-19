import { HfInference } from '@huggingface/inference';

const HF_TOKEN = process.env.NEXT_PUBLIC_HF_TOKEN;
const hf = HF_TOKEN ? new HfInference(HF_TOKEN) : null;

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
    if (!hf) {
      throw new Error('Hugging Face token not configured');
    }

    try {
      // Generate image using Stable Diffusion XL
      const response = (await hf.textToImage({
        model: 'stabilityai/stable-diffusion-xl-base-1.0',
        inputs: `pixel art, isometric office, ${prompt}, detailed, vibrant colors, retro gaming aesthetic`,
        parameters: {
          num_inference_steps: 20,
          guidance_scale: 7.5,
        },
      })) as unknown as Blob;

      const blob = await response.arrayBuffer();
      const base64 = Buffer.from(blob).toString('base64');
      const imageUrl = `data:image/png;base64,${base64}`;

      // Derive style profile from prompt (simple heuristic for v1)
      const styleProfile = this.deriveStyleProfile(prompt);

      return {
        prompt,
        imageUrl,
        styleProfile,
      };
    } catch (err) {
      console.error('Failed to generate concept:', err);
      throw new Error('Failed to generate world concept');
    }
  }

  private static deriveStyleProfile(prompt: string): StyleProfile {
    const lower = prompt.toLowerCase();
    let mood: StyleProfile['mood'] = 'futuristic';
    let lighting: StyleProfile['lighting'] = 'cool';
    let complexity: StyleProfile['complexity'] = 'medium';

    // Mood detection
    if (lower.includes('cozy') || lower.includes('warm') || lower.includes('home')) {
      mood = 'cozy';
    } else if (lower.includes('minimal') || lower.includes('clean') || lower.includes('simple')) {
      mood = 'minimalist';
    } else if (lower.includes('industrial') || lower.includes('warehouse') || lower.includes('factory')) {
      mood = 'industrial';
    } else if (lower.includes('sci-fi') || lower.includes('futuristic') || lower.includes('space')) {
      mood = 'sci-fi';
    }

    // Lighting detection
    if (lower.includes('warm') || lower.includes('sunset') || lower.includes('golden')) {
      lighting = 'warm';
    } else if (lower.includes('neon') || lower.includes('glow') || lower.includes('cyber')) {
      lighting = 'neon';
    } else if (lower.includes('natural') || lower.includes('sunlight') || lower.includes('daylight')) {
      lighting = 'natural';
    }

    // Complexity detection
    if (lower.includes('simple') || lower.includes('minimal') || lower.includes('clean')) {
      complexity = 'low';
    } else if (lower.includes('detailed') || lower.includes('complex') || lower.includes('intricate')) {
      complexity = 'high';
    }

    return { mood, lighting, complexity };
  }
}
