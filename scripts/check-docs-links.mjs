import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const ignoredDirectories = new Set([
  '.git',
  'coverage',
  'dist',
  'node_modules',
]);
const markdownExtensions = new Set(['.md', '.markdown']);

async function collectMarkdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(
          ...(await collectMarkdownFiles(path.join(directory, entry.name))),
        );
      }
      continue;
    }

    if (
      entry.isFile() &&
      markdownExtensions.has(path.extname(entry.name).toLowerCase())
    ) {
      files.push(path.join(directory, entry.name));
    }
  }

  return files;
}

function stripCode(markdown) {
  const withoutFences = markdown.replace(
    /(^|\n)(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\2[^\n]*(?=\n|$)/g,
    '$1',
  );
  return withoutFences.replace(/`[^`\n]*`/g, '');
}

function extractLinks(markdown) {
  const links = [];
  const inlineLink =
    /!?\[[^\]]*\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\s*\)/g;
  const referenceLink = /^ {0,3}\[[^\]]+\]:\s*(<[^>]+>|\S+)/gm;

  for (const match of markdown.matchAll(inlineLink)) {
    links.push(match[1]);
  }

  for (const match of markdown.matchAll(referenceLink)) {
    links.push(match[1]);
  }

  return links.map((link) =>
    link.startsWith('<') && link.endsWith('>') ? link.slice(1, -1) : link,
  );
}

function slugifyHeading(text) {
  return text
    .replace(/<[^>]*>/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\-_ ]/gu, '')
    .replace(/ /g, '-');
}

function collectAnchors(markdown) {
  const anchors = new Set();
  const occurrences = new Map();
  const withoutCode = stripCode(markdown);
  const heading = /^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm;

  for (const match of withoutCode.matchAll(heading)) {
    const base = slugifyHeading(match[1]);
    if (!base) {
      continue;
    }

    const count = occurrences.get(base) ?? 0;
    occurrences.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }

  for (const match of withoutCode.matchAll(/\bid=["']([^"']+)["']/g)) {
    anchors.add(match[1]);
  }

  return anchors;
}

function isExternal(link) {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(link);
}

async function isFile(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

const files = await collectMarkdownFiles(repoRoot);
const anchorCache = new Map();
const errors = [];
let checkedLinks = 0;

for (const file of files) {
  const relativeFile = path.relative(repoRoot, file);
  const markdown = await readFile(file, 'utf8');

  for (const link of extractLinks(stripCode(markdown))) {
    if (!link || isExternal(link)) {
      continue;
    }

    checkedLinks += 1;

    const [rawTarget, fragment = ''] = link.split('#', 2);
    const target = rawTarget.split('?', 1)[0];
    const targetFile = target
      ? path.resolve(path.dirname(file), decodeURIComponent(target))
      : file;

    if (!(await isFile(targetFile))) {
      errors.push(`${relativeFile}: missing target "${link}"`);
      continue;
    }

    if (!fragment) {
      continue;
    }

    if (path.extname(targetFile).toLowerCase() !== '.md') {
      continue;
    }

    if (!anchorCache.has(targetFile)) {
      anchorCache.set(
        targetFile,
        collectAnchors(await readFile(targetFile, 'utf8')),
      );
    }

    const anchors = anchorCache.get(targetFile);
    const decodedFragment = decodeURIComponent(fragment).toLowerCase();
    if (!anchors.has(decodedFragment)) {
      errors.push(`${relativeFile}: missing anchor "${link}"`);
    }
  }
}

if (errors.length > 0) {
  console.error(`Documentation links failed (${errors.length}):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Documentation links OK (${checkedLinks} local links in ${files.length} files).`,
  );
}
