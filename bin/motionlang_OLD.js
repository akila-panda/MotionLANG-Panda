#!/usr/bin/env node

import { program } from 'commander';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { extractMotionLanguage } from '../src/index.js';
import { formatMotionSpecJson } from '../src/formatters/motion-spec-json.js';
import { formatMotionMarkdown } from '../src/formatters/motion-markdown.js';
import { formatGsap } from '../src/formatters/motion-gsap.js';
import { formatFramer } from '../src/formatters/motion-framer.js';
import { formatCss } from '../src/formatters/motion-css.js';
import { formatFigma } from '../src/formatters/motion-figma.js';
import { formatFigmaComponent } from '../src/formatters/motion-figma-component.js';
import { formatFigmaAnnotations } from '../src/formatters/motion-figma-annotations.js';
import { formatFigmaDevMode } from '../src/formatters/motion-figma-devmode.js';
import { formatMcp } from '../src/formatters/motion-mcp.js';
import { scoreMotionSpec } from '../src/score.js';
import { compareMotionSpecs } from '../src/compare.js';
import { explainMotionSpec, formatExplanationTerminal } from '../src/explainer.js';
import { fixMotionSpec, formatFixTerminal, formatFixMarkdown } from '../src/fixer.js';
import { crawlSite } from '../src/site-crawler.js';
import { formatPreview } from '../src/formatters/motion-preview.js';
import { formatComponentPreview } from '../src/formatters/motion-component-preview.js';
import { captureComponentSnapshot } from '../src/crawler.js';
import { generateSiteConsistencyReport } from '../src/site-consistency.js';
import { formatSiteReport } from '../src/formatters/site-report.js';
import { normaliseMotionSpec } from '../src/utils/token-normalise.js';
import { mergeTokens, formatMergedTokensDtcg } from '../src/utils/token-merge.js';
import { diffSpecs, loadSpec, isDriftExceeded, formatDiffMarkdown } from '../src/diff.js';
import { annotateSpec, getAnnotations, formatAnnotationsTerminal } from '../src/utils/annotate.js';
import { tagSpec, listAllVersions, getVersionHistory, formatVersionsTerminal } from '../src/utils/version.js';

// ── mcp subcommand ─────────────────────────────────────────────────────────
program
  .command('mcp')
  .description('Start the MCP stdio server for AI agent integration')
  .option('--dir <path>', 'Directory containing motion spec output files', './motion-spec-output')
  .action(async (opts) => {
    const { startMcpServer } = await import('../src/mcp/server.js');
    await startMcpServer(opts.dir);
  });

// ── merge subcommand ───────────────────────────────────────────────────────
program
  .command('merge')
  .description('Merge motion tokens from multiple *-motion-spec.json files into a unified DTCG token file')
  .argument('<specs...>', 'Paths to *-motion-spec.json files (2 or more)')
  .option('--out <path>', 'Output path for unified tokens.json', './tokens.json')
  .action(async (specPaths, opts) => {
    const { readFileSync } = await import('fs');

    if (specPaths.length < 2) {
      console.error(chalk.red('merge requires at least 2 spec files.'));
      process.exit(1);
    }

    const specs = [];
    for (const p of specPaths) {
      try {
        specs.push(JSON.parse(readFileSync(p, 'utf8')));
      } catch (e) {
        console.error(chalk.red(`Cannot read ${p}: ${e.message}`));
        process.exit(1);
      }
    }

    const merged = mergeTokens(specs);
    const dtcg   = formatMergedTokensDtcg(merged);
    writeFileSync(opts.out, dtcg, 'utf8');

    console.log(chalk.bold('\n  Token Merge Complete\n'));
    console.log(`  Sources:   ${chalk.cyan(specPaths.length + ' specs')}`);
    console.log(`  Durations: ${chalk.cyan(merged.durations.length + ' canonical tokens')}`);
    console.log(`  Easings:   ${chalk.cyan(merged.easings.length + ' canonical tokens')}`);
    console.log(`  Output:    ${chalk.green(opts.out)}\n`);
    console.log(chalk.dim('  DTCG W3C format — compatible with Style Dictionary, Tokens Studio\n'));
  });

// ── diff subcommand ────────────────────────────────────────────────────────
program
  .command('diff')
  .description('Deep diff two *-motion-spec.json files. Exits with code 1 if verdict exceeds threshold.')
  .argument('<specA>', 'Path to baseline *-motion-spec.json')
  .argument('<specB>', 'Path to current *-motion-spec.json')
  .option('--threshold <level>', 'Exit code 1 if verdict exceeds this level (minor-drift|moderate-drift|major-drift)', 'major-drift')
  .option('--out <dir>', 'Write *-diff-report.md to this directory (optional)')
  .action(async (specAPath, specBPath, opts) => {
    let specA, specB;
    try {
      specA = loadSpec(specAPath);
      specB = loadSpec(specBPath);
    } catch (e) {
      console.error(chalk.red(e.message));
      process.exit(1);
    }

    const diff = diffSpecs(specA, specB);

    const verdictColour = {
      identical:        chalk.green,
      'minor-drift':    chalk.yellow,
      'moderate-drift': chalk.hex('#FFA500'),
      'major-drift':    chalk.red,
    }[diff.verdict] ?? chalk.white;

    console.log('');
    console.log(chalk.bold('  Motion Spec Diff'));
    console.log('');
    console.log(`  Verdict:       ${verdictColour(diff.verdict)}`);
    console.log(`  Total changes: ${chalk.cyan(diff.totalDelta)}`);
    console.log('');

    if (diff.fingerprintChanges.length > 0) {
      console.log(chalk.bold('  Fingerprint'));
      for (const c of diff.fingerprintChanges) {
        console.log(`    ${chalk.yellow('~')} ${c.property}: ${c.from} → ${c.to}`);
      }
      console.log('');
    }

    if (diff.additions.length > 0) {
      console.log(chalk.bold('  Animations Added'));
      for (const a of diff.additions) console.log(`    ${chalk.green('+')} ${a.id} (${a.pattern})`);
      console.log('');
    }
    if (diff.removals.length > 0) {
      console.log(chalk.bold('  Animations Removed'));
      for (const r of diff.removals) console.log(`    ${chalk.red('-')} ${r.id} (${r.pattern})`);
      console.log('');
    }
    if (diff.changes.length > 0) {
      console.log(chalk.bold('  Parameter Changes'));
      for (const c of diff.changes) {
        console.log(`    ${chalk.yellow('~')} ${c.id}`);
        for (const p of c.paramChanges) {
          console.log(`        ${p.param}: ${p.from} → ${p.to}`);
        }
      }
      console.log('');
    }
    if (diff.componentChanges.length > 0) {
      console.log(chalk.bold('  Component Changes'));
      for (const c of diff.componentChanges) {
        const sym = c.change === 'added' ? chalk.green('+') : c.change === 'removed' ? chalk.red('-') : chalk.yellow('~');
        console.log(`    ${sym} ${c.label ?? c.id} — ${c.change}`);
      }
      console.log('');
    }
    const tc = diff.tokenChanges;
    if (tc.added.length + tc.removed.length + tc.changed.length > 0) {
      console.log(chalk.bold('  Token Changes'));
      for (const t of tc.added)   console.log(`    ${chalk.green('+')} ${t.name}: ${t.value}`);
      for (const t of tc.removed) console.log(`    ${chalk.red('-')} ${t.name}`);
      for (const t of tc.changed) console.log(`    ${chalk.yellow('~')} ${t.name}: ${t.from} → ${t.to}`);
      console.log('');
    }

    if (opts.out) {
      const { mkdirSync, writeFileSync } = await import('fs');
      const { join } = await import('path');
      mkdirSync(opts.out, { recursive: true });
      const slug = `${Date.now()}-diff-report`;
      const mdPath  = join(opts.out, `${slug}.md`);
      const jsonPath = join(opts.out, `${slug}.json`);
      writeFileSync(mdPath,   formatDiffMarkdown(diff), 'utf8');
      writeFileSync(jsonPath, JSON.stringify(diff, null, 2), 'utf8');
      console.log(chalk.dim(`  Wrote: ${mdPath}`));
      console.log(chalk.dim(`  Wrote: ${jsonPath}`));
    }

    if (diff.verdict !== 'identical' && isDriftExceeded(diff.verdict, opts.threshold)) {
      process.exit(1);
    }
  });

// ── annotate subcommand ────────────────────────────────────────────────────
program
  .command('annotate')
  .description('Add or update an annotation on an animation in a *-motion-spec.json')
  .argument('<spec>', 'Path to *-motion-spec.json')
  .option('--id <animId>', 'Animation ID to annotate')
  .option('--note <text>', 'Annotation note text')
  .option('--author <name>', 'Author name (default: motionlang)')
  .option('--list', 'List all existing annotations in this spec')
  .action(async (specPath, opts) => {
    if (opts.list) {
      const annotations = getAnnotations(specPath);
      console.log('');
      console.log(chalk.bold('  Annotations'));
      console.log('');
      console.log(formatAnnotationsTerminal(annotations));
      console.log('');
      return;
    }

    if (!opts.id || !opts.note) {
      console.error(chalk.red('  --id and --note are required (or use --list to view existing annotations)'));
      process.exit(1);
    }

    const entries = {
      [opts.id]: {
        note:   opts.note,
        author: opts.author ?? 'motionlang',
      },
    };

    annotateSpec(specPath, entries);
    console.log('');
    console.log(chalk.green(`  ✓ Annotation saved`));
    console.log(`    ${chalk.cyan(opts.id)}: "${opts.note}"`);
    console.log('');
  });

// ── tag subcommand ─────────────────────────────────────────────────────────
program
  .command('tag')
  .description('Tag a *-motion-spec.json with a version label')
  .argument('<spec>', 'Path to *-motion-spec.json')
  .argument('<version>', 'Version label e.g. v1.2')
  .option('--note <text>', 'Optional note for this version tag')
  .action(async (specPath, version, opts) => {
    tagSpec(specPath, version, opts.note ?? '');
    console.log('');
    console.log(chalk.green(`  ✓ Tagged as ${chalk.bold(version)}`));
    if (opts.note) console.log(`    "${opts.note}"`);
    console.log('');
  });

// ── versions subcommand ────────────────────────────────────────────────────
program
  .command('versions')
  .description('List all version tags across specs in an output directory')
  .option('--dir <path>', 'Output directory to scan', './motion-spec-output')
  .option('--spec <path>', 'Show version history for a single spec file')
  .action(async (opts) => {
    console.log('');
    console.log(chalk.bold('  Version History'));
    console.log('');

    if (opts.spec) {
      const history = getVersionHistory(opts.spec);
      console.log(formatVersionsTerminal(history, false));
    } else {
      const all = listAllVersions(opts.dir);
      console.log(formatVersionsTerminal(all, true));
    }
    console.log('');
  });
program
  .name('motionlang')
  .description('Extract and reverse-engineer the complete motion language from any website — by component.\n\n  Detects CSS, GSAP, Framer Motion, AOS, ScrollReveal, parallax, and cursor animations.\n  Groups animations into named components. Outputs 7+ formats.\n\n  Phase 2 flags: --components, --component, --explain, --fix, --preview,\n                 --standardise, --figma-component, --crawl-site\n  Subcommands:   diff, merge, annotate, tag, versions, mcp')
  .version('2.0.0')
  .argument('<url>', 'URL to crawl')
  .option('--scroll', 'Simulate full-page scroll to capture scroll-triggered animations')
  .option('--mouse', 'Simulate mouse movement to capture parallax and cursor effects')
  .option('--interactions', 'Simulate hover/focus to capture state-change animations')
  .option('--deep', 'Enable all simulation modes (scroll + mouse + interactions)')
  .option('--section <selector>', 'Target a specific section e.g. ".hero"')
  .option('--components', 'List all detected components on the page (no extraction)')
  .option('--component <id>', 'Extract a single component by id or number. Scopes all outputs.')
  .option('--out <dir>', 'Output directory', './motion-spec-output')
  .option('--width <px>', 'Viewport width', '1280')
  .option('--wait <ms>', 'Wait N ms after page load', '0')
  .option('--emit <format>', 'Output format: json | md | gsap | framer | css | figma | mcp | all', 'all')
  .option('--compare <url2>', 'Compare motion fingerprint against a second URL')
  .option('--explain', 'Add motion explanation: why does this site feel the way it does?')
  .option('--fix', 'Add prescriptive fix suggestions with code examples. Writes *-motion-fix.md.')
  .option('--preview', 'Generate a self-contained HTML animation preview. Writes *-motion-preview.html.')
  .option('--component-preview', 'Reconstruct the actual component with real HTML/CSS + GSAP animations. Requires --component <id>. Writes *-motion-component-preview.html.')
  .option('--standardise', 'Use canonical DTCG-aligned token names (motion/duration/md, motion/easing/decelerate) in all outputs.')
  .option('--figma-component', 'Generate Figma plugin scripts for the selected component (use with --component <id>).')
  .option('--crawl-site', 'Crawl all internal links from the starting URL.')
  .option('--depth <n>', 'Max link depth to follow when using --crawl-site.', '3')
  .option('--pages <n>', 'Max pages to crawl when using --crawl-site.', '20')
  .option('--crawl-delay <ms>', 'Delay between page requests when crawling (ms).', '1000')
  .option('--fail-on-drift <level>', 'Exit code 1 if drift verdict >= level. Values: minor-drift, moderate-drift, major-drift.')
  .action(async (url, opts) => {
    console.log('');
    console.log(chalk.bold('motionlang') + chalk.dim(' — motion specification engine'));
    console.log(chalk.dim(`  ${url}`));
    console.log('');

    const spinner = ora('Launching browser...').start();

    try {
      const options = {
        width:        parseInt(opts.width),
        wait:         parseInt(opts.wait),
        scroll:       opts.deep || opts.scroll || false,
        mouse:        opts.deep || opts.mouse  || false,
        interactions: opts.deep || opts.interactions || false,
        section:      opts.section || null,
        component:    opts.component || null,
      };

      spinner.text = 'Crawling page...';
      let motionSpec = await extractMotionLanguage(url, options);

      // ── Token standardisation (--standardise) ──────────────────
      if (opts.standardise) {
        motionSpec = normaliseMotionSpec(motionSpec);
      }

      // ── Components list mode ───────────────────────────────────
      if (opts.components) {
        spinner.succeed(chalk.green('Done'));
        console.log('');
        console.log(chalk.bold('  Detected Components'));
        console.log('');

        const { components = [] } = motionSpec;

        if (components.length === 0) {
          console.log(chalk.dim('  No components detected. The page may use non-semantic markup.'));
          console.log(chalk.dim('  Try --scroll to load more content.'));
        } else {
          for (let i = 0; i < components.length; i++) {
            const c = components[i];
            const animCount = c.animationIds.length;
            const animLabel = animCount === 1 ? '1 animation' : `${animCount} animations`;
            console.log(
              `  ${chalk.cyan(`[${i + 1}]`)} ${chalk.bold(c.label)}` +
              chalk.dim(`  (${c.selector}, ${animLabel})`)
            );
          }
          console.log('');
          console.log(chalk.dim('  Run: motionlang ' + url + ' --component <id or number> to extract one component'));
        }

        console.log('');
        return;
      }

      // ── Resolve --component: accept number or id string ────────
      if (opts.component) {
        const { components = [] } = motionSpec;
        const input = opts.component.trim();
        const byNumber = /^\d+$/.test(input) ? components[parseInt(input) - 1] : null;
        const byId     = components.find(c => c.id === input || c.label.toLowerCase() === input.toLowerCase());
        const resolved = byNumber || byId;

        if (!resolved && components.length > 0) {
          spinner.fail(chalk.red('Component not found: ' + input));
          console.log(chalk.dim('\n  Available components:'));
          for (let i = 0; i < components.length; i++) {
            console.log(chalk.dim(`  [${i + 1}] ${components[i].label} (id: ${components[i].id})`));
          }
          process.exit(1);
        }

        if (resolved) {
          // Scope the motionSpec to this component's animations only
          motionSpec.animations = motionSpec.animations.filter(a => a.componentId === resolved.id);
          motionSpec.meta.component = resolved;
          console.log('');
          console.log(chalk.bold(`  Component: ${resolved.label}`));
          console.log(chalk.dim(`  Selector: ${resolved.selector}`));
          console.log(chalk.dim(`  Animations: ${motionSpec.animations.length}`));
          console.log('');
        }
      }

      // ── Crawl-site mode ────────────────────────────────────────
      if (opts.crawlSite) {
        const crawlOptions = {
          depth:      parseInt(opts.depth),
          maxPages:   parseInt(opts.pages),
          crawlDelay: parseInt(opts.crawlDelay),
        };

        spinner.text = `Crawling site (max ${crawlOptions.maxPages} pages, depth ${crawlOptions.depth})...`;

        let pagesDone = 0;
        const crawlResult = await crawlSite(url, crawlOptions, options, (pageUrl, index) => {
          pagesDone = index;
          spinner.text = `Crawling page ${index}: ${pageUrl}`;
        });

        spinner.succeed(chalk.green(`Crawled ${crawlResult.crawledUrls.length} pages`));
        console.log('');

        if (crawlResult.errors.length > 0) {
          console.log(chalk.yellow(`  ⚠  ${crawlResult.errors.length} page(s) failed to crawl`));
          for (const e of crawlResult.errors) {
            console.log(chalk.dim(`     ${e.url}: ${e.error}`));
          }
          console.log('');
        }

        // Generate consistency report
        const report = generateSiteConsistencyReport(crawlResult.motionSpecs);

        // Print summary to terminal
        console.log(chalk.bold('  Site Consistency Report'));
        console.log(`  Verdict:  ${verdictChalk(report.verdict, chalk)}`);
        console.log(`  Pages:    ${chalk.cyan(report.pageCount)}`);
        console.log(`  Summary:  ${chalk.dim(report.summary)}`);
        console.log('');

        if (report.componentDrift.length > 0) {
          console.log(chalk.bold('  Component Drift Detected'));
          for (const d of report.componentDrift) {
            console.log(`  ${chalk.yellow('~')} ${d.selector} — ${d.label} (${d.pageCount} pages)`);
          }
          console.log('');
        }

        if (report.reducedMotionCoverage.missingCount > 0) {
          console.log(chalk.yellow(`  ⚠  reduced-motion missing on ${report.reducedMotionCoverage.missingCount} page(s)`));
          console.log('');
        }

        // Write output files
        const outDir = opts.out;
        mkdirSync(outDir, { recursive: true });
        const hostname = new URL(url).hostname.replace(/\./g, '-');
        const timestamp = new Date().toISOString().slice(0, 10);
        const prefix = `${hostname}-${timestamp}`;

        const reportJsonPath = join(outDir, `${prefix}-site-consistency-report.json`);
        const reportMdPath   = join(outDir, `${prefix}-site-consistency-report.md`);

        writeFileSync(reportJsonPath, JSON.stringify({ crawl: crawlResult, report }, null, 2));
        writeFileSync(reportMdPath, formatSiteReport(report, url));

        console.log(chalk.bold('  Output files'));
        console.log(`  ${chalk.dim('→')} ${reportJsonPath}`);
        console.log(`  ${chalk.dim('→')} ${reportMdPath}`);
        console.log('');

        // CI exit code
        if (opts.failOnDrift) {
          const driftOrder = ['consistent', 'minor-drift', 'moderate-drift', 'major-drift'];
          const threshold = driftOrder.indexOf(opts.failOnDrift);
          const actual    = driftOrder.indexOf(report.verdict);
          if (threshold >= 0 && actual >= threshold) {
            console.log(chalk.red(`  ✖  Drift threshold exceeded: ${report.verdict} >= ${opts.failOnDrift}`));
            process.exit(1);
          }
        }

        return;
      }

      // ── Compare mode ───────────────────────────────────────────
      if (opts.compare) {
        spinner.text = `Crawling ${opts.compare}...`;
        console.log(chalk.dim(`  ${opts.compare}`));
        const motionSpecB = await extractMotionLanguage(opts.compare, options);
        const diff = compareMotionSpecs(motionSpec, motionSpecB);

        spinner.succeed(chalk.green('Done'));
        console.log('');
        console.log(chalk.bold('  Comparison'));
        console.log(`  Verdict:  ${chalk.cyan(diff.summary.verdict)}`);
        console.log(`  Changes:  ${chalk.cyan(diff.summary.totalChanges)}`);
        console.log('');

        if (diff.fingerprint.changes.length > 0) {
          console.log(chalk.bold('  Fingerprint changes'));
          for (const c of diff.fingerprint.changes) {
            console.log(`  ${chalk.yellow(c.property)}: ${chalk.red(String(c.from))} → ${chalk.green(String(c.to))}`);
          }
          console.log('');
        }

        if (diff.tokens.added.length + diff.tokens.removed.length + diff.tokens.changed.length > 0) {
          console.log(chalk.bold('  Token changes'));
          for (const t of diff.tokens.added)   console.log(`  ${chalk.green('+')} ${t.name}: ${t.value}`);
          for (const t of diff.tokens.removed) console.log(`  ${chalk.red('-')} ${t.name}`);
          for (const t of diff.tokens.changed) console.log(`  ${chalk.yellow('~')} ${t.name}: ${t.from} → ${t.to}`);
          console.log('');
        }

        if (diff.animations.added.length + diff.animations.removed.length > 0) {
          console.log(chalk.bold('  Animation pattern changes'));
          for (const a of diff.animations.added)   console.log(`  ${chalk.green('+')} ${a.pattern} ×${a.count}`);
          for (const a of diff.animations.removed) console.log(`  ${chalk.red('-')} ${a.pattern} ×${a.count}`);
          console.log('');
        }

        const outDir = opts.out;
        mkdirSync(outDir, { recursive: true });
        const hostnameA = new URL(url).hostname.replace(/\./g, '-');
        const hostnameB = new URL(opts.compare).hostname.replace(/\./g, '-');
        const timestamp = new Date().toISOString().slice(0, 10);
        const comparePath = join(outDir, `${hostnameA}-vs-${hostnameB}-${timestamp}-compare.json`);
        writeFileSync(comparePath, JSON.stringify(diff, null, 2));
        console.log(chalk.bold('  Output files'));
        console.log(`  ${chalk.dim('→')} ${comparePath}`);
        console.log('');
        return;
      }

      // ── Normal mode ────────────────────────────────────────────
      spinner.text = 'Writing output files...';
      const health = scoreMotionSpec(motionSpec);

      // ── Explanation ────────────────────────────────────────────
      let explanation = null;
      if (opts.explain) {
        explanation = explainMotionSpec(motionSpec);
        motionSpec.explanation = explanation; // attach to spec so JSON + MD include it
      }

      // ── Fix suggestions ────────────────────────────────────────
      let fixResult = null;
      if (opts.fix) {
        fixResult = fixMotionSpec(motionSpec, health);
        motionSpec.fixes = fixResult; // attach to spec so JSON includes it
      }

      const outDir = opts.out;
      mkdirSync(outDir, { recursive: true });
      const hostname = new URL(url).hostname.replace(/\./g, '-');
      const timestamp = new Date().toISOString().slice(0, 10);
      const prefix = `${hostname}-${timestamp}`;
      const written = [];
      const emit = opts.emit;

      if (emit === 'all' || emit === 'json') {
        const p = join(outDir, `${prefix}-motion-spec.json`);
        writeFileSync(p, formatMotionSpecJson(motionSpec));
        written.push(p);
      }
      if (emit === 'all' || emit === 'md') {
        const p = join(outDir, `${prefix}-motion-spec.md`);
        writeFileSync(p, formatMotionMarkdown(motionSpec));
        written.push(p);
      }
      if (emit === 'all' || emit === 'gsap') {
        const p = join(outDir, `${prefix}-motion-gsap.js`);
        writeFileSync(p, formatGsap(motionSpec));
        written.push(p);
      }
      if (emit === 'all' || emit === 'framer') {
        const p = join(outDir, `${prefix}-motion-framer.js`);
        writeFileSync(p, formatFramer(motionSpec));
        written.push(p);
      }
      if (emit === 'all' || emit === 'css') {
        const p = join(outDir, `${prefix}-motion.css`);
        writeFileSync(p, formatCss(motionSpec));
        written.push(p);
      }
      if (emit === 'all' || emit === 'figma') {
        const p = join(outDir, `${prefix}-motion-figma.json`);
        writeFileSync(p, formatFigma(motionSpec));
        written.push(p);
      }
      if (emit === 'all' || emit === 'mcp') {
        const p = join(outDir, `${prefix}-motion-mcp.json`);
        writeFileSync(p, formatMcp(motionSpec));
        written.push(p);
      }

      // ── Explain file (when --explain is set) ───────────────────
      if (explanation) {
        const { formatExplanationMarkdown } = await import('../src/explainer.js');
        const p = join(outDir, `${prefix}-motion-explain.md`);
        const lines = [];
        lines.push(`# Motion Explanation: ${motionSpec.meta.title || motionSpec.meta.url}`);
        lines.push('');
        lines.push(`> Extracted from \`${motionSpec.meta.url}\``);
        lines.push('');
        lines.push(formatExplanationMarkdown(explanation));
        lines.push('---');
        lines.push(`*motionlang --explain — ${motionSpec.meta.url} — ${new Date(motionSpec.meta.timestamp).toISOString()}*`);
        writeFileSync(p, lines.join('\n'));
        written.push(p);
      }

      // ── Fix file (when --fix is set) ───────────────────────────
      if (fixResult) {
        const p = join(outDir, `${prefix}-motion-fix.md`);
        writeFileSync(p, formatFixMarkdown(fixResult, url));
        written.push(p);
      }

      // ── Preview file (when --preview is set) ───────────────────
      if (opts.preview) {
        const p = join(outDir, `${prefix}-motion-preview.html`);
        writeFileSync(p, formatPreview(motionSpec));
        written.push(p);
      }

      // ── Component preview (when --component-preview is set) ────
      if (opts.componentPreview) {
        const resolved = motionSpec.meta.component;
        if (!resolved) {
          console.warn(chalk.yellow('⚠  --component-preview requires --component <id>. Use --components to list available components.'));
        } else {
          spinner.text = `Capturing live DOM snapshot of ${resolved.selector}...`;
          try {
            const snapshot = await captureComponentSnapshot(url, resolved.selector, {
              width:  parseInt(opts.width),
              wait:   parseInt(opts.wait),
            });
            if (!snapshot) {
              console.warn(chalk.yellow(`⚠  Could not find ${resolved.selector} in the page. Try a different component.`));
            } else {
              // Attach health score for display in the preview
              motionSpec.health = scoreMotionSpec(motionSpec);
              const p = join(outDir, `${prefix}-motion-component-preview.html`);
              writeFileSync(p, formatComponentPreview(motionSpec, snapshot));
              written.push(p);
              console.log('');
              console.log(chalk.bold('  Component Preview'));
              console.log(`  ${chalk.green('→')} Open in browser: ${chalk.cyan(p)}`);
              console.log(`  ${chalk.dim('Real HTML · Inlined computed styles · GSAP from spec')}`);
              console.log('');
            }
          } catch (snapErr) {
            console.warn(chalk.yellow(`⚠  Component snapshot failed: ${snapErr.message}`));
          }
        }
      }

      // ── Figma component scripts (when --figma-component is set) ─
      if (opts.figmaComponent) {
        const compId = opts.component || (motionSpec.components?.[0]?.id);
        if (!compId) {
          console.warn(chalk.yellow('⚠  --figma-component requires --component <id>. Use --components to list available components.'));
        } else {
          // Component frame script
          const compScript = formatFigmaComponent(motionSpec, compId);
          const compPath = join(outDir, `${prefix}-motion-figma-component.js`);
          writeFileSync(compPath, compScript);
          written.push(compPath);

          // Annotation overlay
          const { json: annJson, script: annScript } = formatFigmaAnnotations(motionSpec, compId);
          const annJsonPath = join(outDir, `${prefix}-motion-figma-annotations.json`);
          const annScriptPath = join(outDir, `${prefix}-motion-figma-annotations.js`);
          writeFileSync(annJsonPath, annJson);
          writeFileSync(annScriptPath, annScript);
          written.push(annJsonPath, annScriptPath);

          // Dev Mode snippets
          const devScript = formatFigmaDevMode(motionSpec, compId);
          const devPath = join(outDir, `${prefix}-motion-figma-devmode.js`);
          writeFileSync(devPath, devScript);
          written.push(devPath);
        }
      }

      spinner.succeed(chalk.green('Done'));
      console.log('');

      console.log(chalk.bold('  Fingerprint'));
      console.log(`  Feel:       ${chalk.cyan(motionSpec.fingerprint.feel)}`);
      console.log(`  Pattern:    ${chalk.cyan(motionSpec.fingerprint.dominantPattern || 'none')}`);
      console.log(`  Library:    ${chalk.cyan(motionSpec.fingerprint.dominantLibrary)}`);
      console.log(`  Animations: ${chalk.cyan(motionSpec.fingerprint.animationCount)}`);
      console.log(`  Reduced ♿: ${motionSpec.fingerprint.reducedMotionSupport ? chalk.green('✅ supported') : chalk.yellow('⚠️  not present')}`);
      console.log(`  Health:     ${gradeColor(health.grade, chalk)} ${chalk.dim(`(${health.score}/100)`)}`);
      console.log('');

      if (health.findings.length > 0) {
        console.log(chalk.bold('  Health findings'));
        for (const f of health.findings) {
          const icon = f.severity === 'error'
            ? chalk.red('✖')
            : f.severity === 'warning'
              ? chalk.yellow('⚠')
              : chalk.dim('ℹ');
          console.log(`  ${icon}  ${f.message}`);
        }
        console.log('');
      }

      // ── Explanation output ─────────────────────────────────────
      if (explanation) {
        console.log(formatExplanationTerminal(explanation, url));
      }

      // ── Fix output ─────────────────────────────────────────────
      if (fixResult) {
        console.log(formatFixTerminal(fixResult, url));
      }

      // ── Preview output notice ──────────────────────────────────
      if (opts.preview) {
        const previewFile = written.find(f => f.endsWith('-motion-preview.html'));
        if (previewFile) {
          console.log(chalk.bold('  Preview'));
          console.log(`  ${chalk.green('→')} Open in browser: ${chalk.cyan(previewFile)}`);
          console.log(`  ${chalk.dim('Self-contained HTML — no server required.')}`);
          console.log('');
        }
      }

      // ── Figma component notice ─────────────────────────────────
      if (opts.figmaComponent) {
        const compScript   = written.find(f => f.endsWith('-motion-figma-component.js'));
        const annScript    = written.find(f => f.endsWith('-motion-figma-annotations.js'));
        const devScript    = written.find(f => f.endsWith('-motion-figma-devmode.js'));
        if (compScript) {
          console.log(chalk.bold('  Figma Component Scripts'));
          console.log(`  ${chalk.green('1.')} Component frame  → ${chalk.cyan(compScript)}`);
          console.log(`  ${chalk.green('2.')} Annotation cards → ${chalk.cyan(annScript)}`);
          console.log(`  ${chalk.green('3.')} Dev Mode snippets→ ${chalk.cyan(devScript)}`);
          console.log('');
          console.log(chalk.dim('  HOW TO USE: Open Figma → Plugins → Development → Open Console'));
          console.log(chalk.dim('  Paste script 1 → component frame appears.'));
          console.log(chalk.dim('  Select the frame, paste script 2 → annotation cards appear.'));
          console.log(chalk.dim('  Select the frame, paste script 3 → Dev Mode shows code snippets.'));
          console.log('');
        }
      }

      console.log(chalk.bold('  Output files'));
      for (const f of written) {
        console.log(`  ${chalk.dim('→')} ${f}`);
      }
      console.log('');

      // ── MCP usage hint ─────────────────────────────────────────
      console.log(chalk.dim('  tip: run motionlang mcp --dir ' + outDir + ' to start the AI agent server'));
      console.log('');

    } catch (err) {
      spinner.fail(chalk.red('Failed'));
      console.error(chalk.red('\n  Error: ' + err.message));
      process.exit(1);
    }
  });

program.parse();

function gradeColor(grade, chalk) {
  if (grade === 'A') return chalk.green(`Grade ${grade}`);
  if (grade === 'B') return chalk.cyan(`Grade ${grade}`);
  if (grade === 'C') return chalk.yellow(`Grade ${grade}`);
  return chalk.red(`Grade ${grade}`);
}

function verdictChalk(verdict, chalk) {
  if (verdict === 'consistent')     return chalk.green(verdict);
  if (verdict === 'minor-drift')    return chalk.yellow(verdict);
  if (verdict === 'moderate-drift') return chalk.yellow(verdict);
  return chalk.red(verdict);
}