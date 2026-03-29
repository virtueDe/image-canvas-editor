export function normalizeBasePath(basePath) {
  const withLeadingSlash = basePath.startsWith('/') ? basePath : `/${basePath}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

export function resolveGithubPagesBase(env = process.env) {
  const explicitBasePath = env.VITE_BASE_PATH;
  if (explicitBasePath) {
    return normalizeBasePath(explicitBasePath);
  }

  if (env.GITHUB_ACTIONS !== 'true') {
    return '/';
  }

  const repository = env.GITHUB_REPOSITORY ?? '';
  const [, repoName = ''] = repository.split('/');
  if (!repoName || repoName.endsWith('.github.io')) {
    return '/';
  }

  return normalizeBasePath(repoName);
}
