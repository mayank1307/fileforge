const TOKEN_RE = /\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|true|false|null|\d+(?:\.\d+)?|[a-zA-Z_][\w.]*|&&|\|\||==|!=|>=|<=|>|<|!|\(|\)|,)\s*/y;

function tokenize(expr) {
  const tokens = [];
  TOKEN_RE.lastIndex = 0;
  while (TOKEN_RE.lastIndex < expr.length) {
    const m = TOKEN_RE.exec(expr);
    if (!m) throw new Error(`Unexpected token at position ${TOKEN_RE.lastIndex} in expression: ${expr}`);
    tokens.push(m[1]);
  }
  return tokens;
}

class Parser {
  constructor(tokens, ctx) {
    this.tokens = tokens;
    this.pos = 0;
    this.ctx = ctx;
  }
  peek() { return this.tokens[this.pos]; }
  next() { return this.tokens[this.pos++]; }
  expect(tok) { if (this.next() !== tok) throw new Error(`Expected "${tok}"`); }

  parseExpr() { return this.parseOr(); }

  parseOr() {
    let left = this.parseAnd();
    while (this.peek() === '||') { this.next(); const right = this.parseAnd(); left = !!(left) || !!(right); }
    return left;
  }
  parseAnd() {
    let left = this.parseEquality();
    while (this.peek() === '&&') { this.next(); const right = this.parseEquality(); left = !!(left) && !!(right); }
    return left;
  }
  parseEquality() {
    let left = this.parseComparison();
    while (['==', '!='].includes(this.peek())) {
      const op = this.next();
      const right = this.parseComparison();
      left = op === '==' ? left === right : left !== right;
    }
    return left;
  }
  parseComparison() {
    let left = this.parseUnary();
    while (['>', '<', '>=', '<='].includes(this.peek())) {
      const op = this.next();
      const right = this.parseUnary();
      if (op === '>') left = left > right;
      else if (op === '<') left = left < right;
      else if (op === '>=') left = left >= right;
      else if (op === '<=') left = left <= right;
    }
    return left;
  }
  parseUnary() {
    if (this.peek() === '!') { this.next(); return !this.parseUnary(); }
    return this.parsePrimary();
  }
  parsePrimary() {
    const tok = this.next();
    if (tok === undefined) throw new Error('Unexpected end of expression');
    if (tok === '(') { const v = this.parseExpr(); this.expect(')'); return v; }
    if (tok === 'true') return true;
    if (tok === 'false') return false;
    if (tok === 'null') return null;
    if (/^\d+(\.\d+)?$/.test(tok)) return Number(tok);
    if (tok.startsWith('"') || tok.startsWith("'")) return tok.slice(1, -1);
    if (/^[a-zA-Z_][\w.]*$/.test(tok)) return this.resolvePath(tok);
    throw new Error(`Unknown token: ${tok}`);
  }
  resolvePath(path) {
    const parts = path.split('.');
    let cur = this.ctx;
    for (const part of parts) {
      if (cur == null) return undefined;
      cur = cur[part];
    }
    return cur;
  }
}

export function evaluateCondition(expr, ctx) {
  if (expr == null) return true;
  if (typeof expr === 'boolean') return expr;
  const trimmed = String(expr).trim();
  if (!trimmed) return true;
  const tokens = tokenize(trimmed);
  const parser = new Parser(tokens, ctx);
  const result = parser.parseExpr();
  if (parser.pos < tokens.length) throw new Error(`Unexpected trailing tokens in expression: ${expr}`);
  return !!result;
}
