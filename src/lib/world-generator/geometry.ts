import type { WorldConcept, StyleProfile } from './concept';

export interface OfficeGeometry {
  desks: Array<{ x: number; z: number; agent?: string }>;
  walls: Array<{ x: number; z: number; width: number; height: number }>;
  props: Array<{ type: string; x: number; z: number }>;
  lightingConfig: {
    ambientIntensity: number;
    directionalIntensity: number;
    color: number;
  };
}

export class GeometryReconstructor {
  static reconstructFromConcept(concept: WorldConcept): OfficeGeometry {
    const { styleProfile } = concept;

    // Generate desk positions (simple grid layout for v1)
    const desks = this.generateDesks(styleProfile);

    // Generate walls
    const walls = this.generateWalls(styleProfile);

    // Generate props (servers, plants, etc.)
    const props = this.generateProps(styleProfile);

    // Lighting config based on style
    const lightingConfig = this.generateLighting(styleProfile);

    return {
      desks,
      walls,
      props,
      lightingConfig,
    };
  }

  private static generateDesks(profile: StyleProfile): OfficeGeometry['desks'] {
    const desks: OfficeGeometry['desks'] = [];
    const agents = ['minion', 'scout', 'sage', 'proxy'];

    // Simple grid layout
    const cols = profile.complexity === 'high' ? 3 : 2;
    const spacing = 4;
    const startX = -(cols - 1) * spacing * 0.5;

    agents.forEach((agent, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      desks.push({
        x: startX + col * spacing,
        z: -row * spacing,
        agent,
      });
    });

    return desks;
  }

  private static generateWalls(profile: StyleProfile): OfficeGeometry['walls'] {
    const size = profile.complexity === 'high' ? 20 : 15;
    return [
      { x: 0, z: -size / 2, width: size, height: 8 }, // Back wall
      { x: -size / 2, z: 0, width: 1, height: 8 }, // Left wall
      { x: size / 2, z: 0, width: 1, height: 8 }, // Right wall
    ];
  }

  private static generateProps(profile: StyleProfile): OfficeGeometry['props'] {
    const props: OfficeGeometry['props'] = [];

    if (profile.mood === 'sci-fi' || profile.mood === 'futuristic') {
      // Add server racks
      props.push({ type: 'server', x: -6, z: -6 });
      props.push({ type: 'server', x: 6, z: -6 });
    }

    if (profile.mood === 'cozy') {
      // Add plants
      props.push({ type: 'plant', x: -5, z: 5 });
      props.push({ type: 'plant', x: 5, z: 5 });
    }

    return props;
  }

  private static generateLighting(profile: StyleProfile): OfficeGeometry['lightingConfig'] {
    switch (profile.lighting) {
      case 'warm':
        return {
          ambientIntensity: 0.5,
          directionalIntensity: 0.8,
          color: 0xffd700, // Golden
        };
      case 'neon':
        return {
          ambientIntensity: 0.3,
          directionalIntensity: 1.0,
          color: 0x00ffff, // Cyan
        };
      case 'natural':
        return {
          ambientIntensity: 0.6,
          directionalIntensity: 0.7,
          color: 0xffffff, // White
        };
      default: // cool
        return {
          ambientIntensity: 0.4,
          directionalIntensity: 0.9,
          color: 0x87ceeb, // Sky blue
        };
    }
  }
}
