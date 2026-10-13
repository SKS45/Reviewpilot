const IGNORED_DIRECTORIES = ["node_modules/", "dist/", "build/", "vendor/", ".next/", "coverage/"];

const IGNORED_FILES: RegExp[] = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)poetry\.lock$/,
  /(^|\/)Cargo\.lock$/,
  /(^|\/)go\.sum$/,
  /\.min\.(js|css)$/,
  /\.map$/,
  /\.snap$/,
  /\.(png|jpe?g|gif|svg|ico|pdf|woff2?|ttf|eot|zip|gz)$/i,
];

/** Lockfiles, build output, vendored code and binaries are never worth an LLM call. */
export function isIgnoredPath(path: string, extraPatterns: RegExp[] = []): boolean {
  if (IGNORED_DIRECTORIES.some((dir) => path.startsWith(dir) || path.includes(`/${dir}`))) return true;
  return [...IGNORED_FILES, ...extraPatterns].some((pattern) => pattern.test(path));
}
