// Path guard — prevent directory traversal in user file access
import path from 'path';

export function resolveUserPath(baseDir, userId, requestedPath) {
  const userRoot = path.resolve(baseDir, userId);
  const abs = path.resolve(userRoot, requestedPath);
  const withSep = userRoot.endsWith(path.sep) ? userRoot : userRoot + path.sep;
  if (!(abs === userRoot || abs.startsWith(withSep))) {
    throw new Error('Path escape blocked');
  }
  return { userRoot, abs };
}
