// Generates the plain English motion spec table.
// Designer-readable. No code knowledge required.

import { bucketDuration } from '../utils/easing-names.js';
import { figmaDurationTokenName, figmaEasingTokenName } from '../utils/figma-token-schema.js';
import { formatExplanationMarkdown } from '../explainer.js';
import { timelineAscii, shouldRenderTimeline } from '../utils/timeline-ascii.js';

export function formatMotionMarkdown(motionSpec) {
  const { meta, fingerprint, animations, tokens } = motionSpec;
  const lines = [];

  // ── Header ──────────────────────────────────────────────────────
  lines.push(`# Motion Spec: ${meta.title || 'Unknown Site'}`);
  if (meta.component) {
    lines.push('');
    lines.push(`> **Component: ${meta.component.label}**`);
    lines.push(`> Selector: \`${meta.component.selector}\``);
    lines.push(`> ${motionSpec.animations.length} animations in this component`);
  }
  lines.push('');
  lines.push(`> Extracted from \`${meta.url}\``);
  lines.push(`> ${new Date(meta.timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
  lines.push(`> ${fingerprint.animationCount} animations detected`);
  lines.push('');
  lines.push('This document describes the complete motion language of the website.');
  lines.push('It is structured for designer–developer handoff and AI/LLM consumption.');
  lines.push('');

  // ── Fingerprint ──────────────────────────────────────────────────
  lines.push('## Motion Fingerprint');
  lines.push('');
  lines.push('| Property | Value |');
  lines.push('|----------|-------|');
  lines.push(`| Feel | \`${fingerprint.feel}\` |`);
  lines.push(`| Dominant pattern | \`${fingerprint.dominantPattern || 'none'}\` |`);
  lines.push(`| Dominant library | \`${fingerprint.dominantLibrary}\` |`);
  lines.push(`| Libraries detected | ${fingerprint.libraries.map(l => `\`${l}\``).join(', ') || 'none'} |`);
  lines.push(`| Scroll-linked animations | ${fingerprint.scrollLinked ? 'Yes' : 'No'} |`);
  lines.push(`| prefers-reduced-motion | ${fingerprint.reducedMotionSupport ? '✅ Supported' : '⚠️ Not present'} |`);
  lines.push('');

  // ── Motion Tokens ────────────────────────────────────────────────
  if (tokens.durations.length > 0 || tokens.easings.length > 0) {
    lines.push('## Motion Tokens');
    lines.push('');

    if (tokens.durations.length > 0) {
      lines.push('### Duration Scale');
      lines.push('');
      lines.push('| Token | Value | Bucket |');
      lines.push('|-------|-------|--------|');
      for (const d of tokens.durations) {
        lines.push(`| \`${d.name}\` | \`${d.value}\` | ${d.bucket} |`);
      }
      lines.push('');
    }

    if (tokens.easings.length > 0) {
      lines.push('### Easing Scale');
      lines.push('');
      lines.push('| Token | Value | Name |');
      lines.push('|-------|-------|------|');
      for (const e of tokens.easings) {
        lines.push(`| \`${e.name}\` | \`${e.value}\` | ${e.humanName} |`);
      }
      lines.push('');
    }
  }

  // ── Explanation (when --explain was used) ────────────────────────
  if (motionSpec.explanation) {
    lines.push(formatExplanationMarkdown(motionSpec.explanation));
  }

  // ── Animation Inventory ──────────────────────────────────────────
  lines.push('## Animation Inventory');
  lines.push('');
  lines.push('| ID | Pattern | Source | Duration | Figma Duration Token | Easing | Figma Easing Token | Reduced Motion |');
  lines.push('|----|---------|--------|----------|----------------------|--------|--------------------|----------------|');

  for (const anim of animations) {
    const duration    = anim.duration ? `${Math.round(anim.duration)}ms` : '—';
    const easing      = anim.easingName || anim.easing || '—';
    const rm          = anim.reducedMotion === 'supported' ? '✅'
                      : anim.reducedMotion === 'fade-only' ? '☑️ fade-only'
                      : '⚠️ missing';
    const durToken    = figmaDurationTokenName(anim);
    const easingToken = figmaEasingTokenName(anim);
    lines.push(`| \`${anim.id}\` | ${anim.pattern} | ${anim.source} | ${duration} | \`${durToken}\` | ${easing} | \`${easingToken}\` | ${rm} |`);
  }
  lines.push('');

  // ── Pattern Breakdown ────────────────────────────────────────────
  const patternGroups = {};
  for (const anim of animations) {
    if (!patternGroups[anim.pattern]) patternGroups[anim.pattern] = [];
    patternGroups[anim.pattern].push(anim);
  }

  lines.push('## Pattern Breakdown');
  lines.push('');

  for (const [pattern, group] of Object.entries(patternGroups)) {
    lines.push(`### ${pattern}`);
    lines.push('');
    lines.push(`${group.length} instance${group.length > 1 ? 's' : ''} detected.`);
    lines.push('');

    // Show the richest example
    const example = group.sort((a, b) => b.confidence - a.confidence)[0];
    lines.push('**Best example:**');
    lines.push('');
    lines.push('```');

    if (example.source === 'css-transitions') {
      lines.push(`Property:  ${example.property}`);
      lines.push(`Duration:  ${example.duration ? Math.round(example.duration) + 'ms' : '—'}`);
      if (example.delay) lines.push(`Delay:     ${Math.round(example.delay)}ms`);
      lines.push(`Easing:    ${example.easing} (${example.easingName})`);
      if (example.element?.tag) {
        lines.push(`Element:   <${example.element.tag}${example.element.id ? ' id="' + example.element.id + '"' : ''}${example.element.classes ? ' class="' + example.element.classes + '"' : ''}>`);
      }
    } else if (example.source === 'css-keyframes') {
      lines.push(`Name:      ${example.name}`);
      lines.push(`Steps:     ${example.keyframe?.steps?.length || '—'}`);
      lines.push(`Properties: ${example.keyframe?.propertiesAnimated?.join(', ') || '—'}`);
    } else if (example.source === 'gsap') {
      lines.push(`Duration:  ${example.duration ? Math.round(example.duration) + 'ms' : '—'}`);
      lines.push(`Easing:    ${example.easing || '—'}`);
      if (example.stagger) lines.push(`Stagger:   ${JSON.stringify(example.stagger)}`);
      if (example.scrollTrigger) {
        lines.push(`Trigger:   ${example.scrollTrigger.trigger || '—'}`);
        lines.push(`Start:     ${example.scrollTrigger.start || '—'}`);
        lines.push(`Scrub:     ${example.scrollTrigger.scrub ?? '—'}`);
      }
    }

    lines.push(`Reduced motion: ${example.reducedMotion}`);
    lines.push(`Confidence: ${Math.round(example.confidence * 100)}%`);
    lines.push('```');
    lines.push('');

    // ── ASCII timeline for stagger/sequence groups ────────────────
    if (shouldRenderTimeline(group)) {
      const dominantEasing = group[0]?.easingName || group[0]?.easing || '';
      const timeline = timelineAscii(group, { title: `${pattern} — Timing`, easing: dominantEasing });
      if (timeline) {
        lines.push(timeline);
        lines.push('');
      }
    }
  }

  // ── A11y Summary ─────────────────────────────────────────────────
  lines.push('## Accessibility');
  lines.push('');
  if (fingerprint.reducedMotionSupport) {
    lines.push('✅ `prefers-reduced-motion` media query detected. Users who prefer reduced motion are supported.');
  } else {
    lines.push('⚠️ No `prefers-reduced-motion` media query detected.');
    lines.push('');
    lines.push('**Recommendation:** Add reduced motion fallbacks for all animations:');
    lines.push('');
    lines.push('```css');
    lines.push('@media (prefers-reduced-motion: reduce) {');
    lines.push('  *, *::before, *::after {');
    lines.push('    animation-duration: 0.01ms !important;');
    lines.push('    animation-iteration-count: 1 !important;');
    lines.push('    transition-duration: 0.01ms !important;');
    lines.push('  }');
    lines.push('}');
    lines.push('```');
  }
  lines.push('');
  lines.push(`---`);
  lines.push(`*motionlang — ${meta.url} — ${new Date(meta.timestamp).toISOString()}*`);

  return lines.join('\n');
}