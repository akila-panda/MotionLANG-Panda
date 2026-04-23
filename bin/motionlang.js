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
import { formatMcp } from '../src/formatters/motion-mcp.js';
import { scoreMotionSpec } from '../src/score.js';
import { compareMotionSpecs } from '../src/compare.js';

// ── mcp subcommand ─────────────────────────────────────────────────────────
program
  .command('mcp')
  .description('Start the MCP stdio server for AI agent integration')
  .option('--dir <path>', 'Directory containing motion spec output files', './motion-spec-output')
  .action(async (opts) => {
    const { startMcpServer } = await import('../src/mcp/server.js');
    await startMcpServer(opts.dir);
  });

// ── main crawl command ─────────────────────────────────────────────────────
program
  .name('motionlang')
  .description('Extract the complete motion language from any website')
  .version('1.0.0')
  .argument('<url>', 'URL to crawl')
  .option('--scroll', 'Simulate full-page scroll to capture scroll-triggered animations')
  .option('--mouse', 'Simulate mouse movement to capture parallax and cursor effects')
  .option('--interactions', 'Simulate hover/focus to capture state-change animations')
  .option('--deep', 'Enable all simulation modes (scroll + mouse + interactions)')
  .option('--section <selector>', 'Target a specific section e.g. ".hero"')
  .option('--out <dir>', 'Output directory', './motion-spec-output')
  .option('--width <px>', 'Viewport width', '1280')
  .option('--wait <ms>', 'Wait N ms after page load', '0')
  .option('--emit <format>', 'Output format: json | md | gsap | framer | css | figma | mcp | all', 'all')
  .option('--compare <url2>', 'Compare motion fingerprint against a second URL')
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
      };

      spinner.text = 'Crawling page...';
      const motionSpec = await extractMotionLanguage(url, options);

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
