// Version tagging for motion spec files.
// Adds version tags to spec meta. Lists all tagged versions in an output directory.
// Used by:
//   motionlang tag spec.json v1.2 --note "Post-rebrand"
//   motionlang versions --dir ./motion-spec-output

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';

/**
 * Tags a spec file with a version string and optional note.
 * The tag is appended to spec.meta.versions[] (never overwrites prior tags).
 *
 * @param {string} specPath
 * @param {string} version   e.g. 'v1.2'
 * @param {string} [note]    Optional human note
 * @returns {object}         Updated spec
 */
export function tagSpec(specPath, version, note = '') {
  const spec = loadSpecForVersion(specPath);

  if (!spec.meta.versions) spec.meta.versions = [];

  // Prevent duplicate version tags
  const existing = spec.meta.versions.find(v => v.version === version);
  if (existing) {
    // Update note and timestamp in place
    existing.note     = note;
    existing.taggedAt = new Date().toISOString();
  } else {
    spec.meta.versions.push({
      version,
      note,
      taggedAt: new Date().toISOString(),
    });
  }

  writeFileSync(specPath, JSON.stringify(spec, null, 2), 'utf8');
  return spec;
}

/**
 * Returns the version history for a single spec file.
 * @param {string} specPath
 * @returns {Array<{ version, note, taggedAt }>}
 */
export function getVersionHistory(specPath) {
  const spec = loadSpecForVersion(specPath);
  return spec.meta.versions ?? [];
}

/**
 * Scans a directory for all *-motion-spec.json files and collects their version tags.
 * Returns a flat list sorted by taggedAt descending.
 *
 * @param {string} dir
 * @returns {Array<{ file, url, version, note, taggedAt }>}
 */
export function listAllVersions(dir) {
  let entries = [];
  try {
    const files = readdirSync(dir).filter(f => f.endsWith('-motion-spec.json'));
    for (const file of files) {
      const specPath = join(dir, file);
      try {
        const spec = JSON.parse(readFileSync(specPath, 'utf8'));
        const versions = spec.meta?.versions ?? [];
        for (const v of versions) {
          entries.push({
            file,
            url:      spec.meta?.url ?? 'unknown',
            version:  v.version,
            note:     v.note ?? '',
            taggedAt: v.taggedAt,
          });
        }
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // Dir unreadable — return empty
  }

  return entries.sort((a, b) => new Date(b.taggedAt) - new Date(a.taggedAt));
}

/**
 * Formats a version list for terminal output.
 * @param {Array} versions  Result of listAllVersions() or getVersionHistory()
 * @param {boolean} [showFile]  Include filename column
 * @returns {string}
 */
export function formatVersionsTerminal(versions, showFile = false) {
  if (versions.length === 0) return '  (no version tags found)';
  return versions
    .map(v => {
      const dateStr = v.taggedAt ? new Date(v.taggedAt).toLocaleDateString() : '?';
      const note    = v.note ? `  "${v.note}"` : '';
      const file    = showFile && v.file ? `  [${v.file}]` : '';
      const url     = v.url && v.url !== 'unknown' ? `  ${v.url}` : '';
      return `  ${v.version}${url}${file} — ${dateStr}${note}`;
    })
    .join('\n');
}

function loadSpecForVersion(specPath) {
  try {
    return JSON.parse(readFileSync(specPath, 'utf8'));
  } catch (e) {
    throw new Error(`Cannot load spec at "${specPath}": ${e.message}`);
  }
}