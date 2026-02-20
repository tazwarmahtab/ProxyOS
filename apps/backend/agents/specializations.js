import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const VALID_SPECIALIZATIONS = {
  minion: ['backend', 'frontend', 'devops', 'database', 'scripting'],
  scout: ['market-research', 'technical-research', 'competitive-analysis', 'data-gathering'],
  sage: ['code-review', 'security-audit', 'architecture-review', 'ux-review']
};

/**
 * Load a specialization markdown file for a given agent role.
 * Returns the file content, or empty string if the file doesn't exist.
 * @param {string} agentRole - 'minion', 'scout', or 'sage'
 * @param {string} specializationName - e.g. 'backend', 'code-review'
 * @returns {Promise<string>}
 */
export async function loadSpecialization(agentRole, specializationName) {
  if (!specializationName) return '';
  if (!VALID_SPECIALIZATIONS[agentRole]?.includes(specializationName)) return '';

  const filePath = path.join(__dirname, agentRole, 'specializations', `${specializationName}.md`);

  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}
