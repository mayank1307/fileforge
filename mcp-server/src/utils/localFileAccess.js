import { realpathSync, statSync } from 'fs';
import { homedir } from 'os';
import { delimiter, isAbsolute, join, relative, resolve, sep } from 'path';
import { fileURLToPath } from 'url';

export const ALLOWED_READ_PATHS_ENV = 'FILEFORGE_ALLOWED_READ_PATHS';

// The rest of ~/.fileforge holds the bridge token and secrets.json, so only FileForge's own output folders are readable.
const OWN_OUTPUT_FOLDERS = ['exports', 'resources', 'artifacts'];

function dataDir() {
  return join(homedir(), '.fileforge');
}

function isInside(root, path) {
  const rel = relative(root, path);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

// A path is compared with a folder's spelling and its real location, so /tmp matches /private/tmp on macOS.
function spellings(path) {
  try {
    return [path, realpathSync.native(path)];
  } catch {
    return [path];
  }
}

function ownFolders() {
  return OWN_OUTPUT_FOLDERS.flatMap((name) => spellings(join(dataDir(), name)));
}

function configuredFolders() {
  return (process.env[ALLOWED_READ_PATHS_ENV] ?? '')
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry && isAbsolute(entry))
    .flatMap((entry) => spellings(resolve(entry)));
}

function isAllowed(path) {
  const own = ownFolders();
  if (own.some((root) => isInside(root, path))) return true;
  // Allowing a parent folder such as ~ must not expose the token and secrets.
  if (spellings(dataDir()).some((root) => isInside(root, path))) return false;
  return configuredFolders().some((root) => isInside(root, path));
}

function notAllowed(input) {
  const error = new Error(`Can't read local path "${input}". FileForge reads only its own output folders in ~/.fileforge and folders the user lists in ${ALLOWED_READ_PATHS_ENV}.`);
  error.code = 'LOCAL_PATH_NOT_ALLOWED';
  return error;
}

// Returns the real path to read, or throws. Paths outside the allowed folders get the same error whether or not they
// exist, so this can't be used to probe the disk.
export function resolveReadablePath(input) {
  let path;
  try {
    path = resolve(String(input).startsWith('file://') ? fileURLToPath(input) : String(input));
  } catch {
    throw notAllowed(input);
  }

  let real;
  try {
    real = realpathSync.native(path);
  } catch (err) {
    if (!isAllowed(path)) throw notAllowed(input);
    throw err;
  }

  // Checking the real path stops a symlink inside an allowed folder from pointing out of it.
  if (!isAllowed(real)) throw notAllowed(input);
  if (!statSync(real).isFile()) throw notAllowed(input);
  return real;
}
