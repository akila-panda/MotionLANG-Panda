// Spec annotation utility.
// Reads a *-motion-spec.json, adds or updates annotations, writes back.
// Annotations survive re-extractions (merged by animation ID).
// Used by: motionlang annotate spec.json --id hero-slide-001 --note "approved by client"

import { readFileSync, writeFileSync } from 'fs';

/**
 * Loads spec, merges annotations, writes back.
 *
 * @param {string} specPath   Path to *-motion-spec.json
 * @param {Object} entries    Map of animationId → { note, author?, date? }
 * @returns {object}          Updated spec
 */
export function annotateSpec(specPath, entries) {
  const spec = loadSpecForAnnotation(specPath);

  if (!spec.annotations) spec.annotations = {};

  for (const [animId, data] of Object.entries(entries)) {
    spec.annotations[animId] = {
      note:       data.note ?? '',
      author:     data.author ?? 'motionlang',
      date:       data.date ?? new Date().toISOString(),
      // Preserve prior fields if re-annotating
      ...(spec.annotations[animId] ?? {}),
      // New note always overwrites
      note: data.note ?? spec.annotations[animId]?.note ?? '',
      author: data.author ?? spec.annotations[animId]?.author ?? 'motionlang',
      date: data.date ?? new Date().toISOString(),
    };
  }

  writeFileSync(specPath, JSON.stringify(spec, null, 2), 'utf8');
  return spec;
}

/**
 * Returns all annotations from a spec file.
 * @param {string} specPath
 * @returns {Object}  annotations map
 */
export function getAnnotations(specPath) {
  const spec = loadSpecForAnnotation(specPath);
  return spec.annotations ?? {};
}

/**
 * Removes a specific annotation by animation ID.
 * @param {string} specPath
 * @param {string} animId
 * @returns {object} Updated spec
 */
export function removeAnnotation(specPath, animId) {
  const spec = loadSpecForAnnotation(specPath);
  if (spec.annotations) {
    delete spec.annotations[animId];
  }
  writeFileSync(specPath, JSON.stringify(spec, null, 2), 'utf8');
  return spec;
}

/**
 * Formats annotations as a terminal-friendly string.
 * @param {Object} annotations
 * @returns {string}
 */
export function formatAnnotationsTerminal(annotations) {
  const entries = Object.entries(annotations);
  if (entries.length === 0) return '  (no annotations)';
  return entries
    .map(([id, ann]) => {
      const dateStr = ann.date ? new Date(ann.date).toLocaleDateString() : '?';
      return `  ${id}\n    "${ann.note}" — ${ann.author}, ${dateStr}`;
    })
    .join('\n');
}

function loadSpecForAnnotation(specPath) {
  try {
    return JSON.parse(readFileSync(specPath, 'utf8'));
  } catch (e) {
    throw new Error(`Cannot load spec at "${specPath}": ${e.message}`);
  }
}