// fileforge:// URIs use forward slashes on every OS; the matching *Path fields keep the native path.
export function fileforgeUri(filePath) {
  return `fileforge://${filePath.replace(/\\/g, '/')}`;
}
