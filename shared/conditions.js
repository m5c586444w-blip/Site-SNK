// Évaluateur des `triggerCondition` d'évènements — MECHANICS_SPEC.md §5.3 : « a small boolean
// expression over Nation/State/Division fields ». La grammaire couvre exactement les formes
// utilisées par la spec :
//   date == '01/01/an-845'              date >= '01/01/an-850'
//   event.WALL_BREACH_845.fired == true event.X.resolved == true
//   nation.stability < 30               nation.completedFocusIds includes "X"
//   nation('Paradis').titanPowersHeld includes 'TITAN_FOUNDING'
//   GameSettings.historicalMode == true
//   AND / OR / NOT, parenthèses.
// Aucun eval() : analyse syntaxique puis évaluation sur un contexte explicite.

const DATE_RE = /^(\d{2})\/(\d{2})\/an-(\d+)$/;

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "'" || c === '"') {
      const end = src.indexOf(c, i + 1);
      if (end < 0) throw new Error(`Chaîne non fermée dans : ${src}`);
      tokens.push({ t: 'str', v: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['==', '!=', '<=', '>='].includes(two)) { tokens.push({ t: 'op', v: two }); i += 2; continue; }
    if ('<>'.includes(c)) { tokens.push({ t: 'op', v: c }); i++; continue; }
    if ('().'.includes(c)) { tokens.push({ t: c }); i++; continue; }
    const num = /^-?\d+(\.\d+)?/.exec(src.slice(i));
    if (num) { tokens.push({ t: 'num', v: Number(num[0]) }); i += num[0].length; continue; }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (id) {
      const w = id[0];
      if (['AND', 'OR', 'NOT'].includes(w)) tokens.push({ t: w });
      else if (w === 'includes') tokens.push({ t: 'op', v: 'includes' });
      else if (w === 'true' || w === 'false') tokens.push({ t: 'bool', v: w === 'true' });
      else tokens.push({ t: 'id', v: w });
      i += w.length;
      continue;
    }
    throw new Error(`Caractère inattendu « ${c} » dans : ${src}`);
  }
  return tokens;
}

/** Analyse une condition en arbre. Lève une erreur si la syntaxe est invalide. */
export function parseCondition(src) {
  const tokens = tokenize(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const take = (t) => {
    const tok = tokens[pos];
    if (!tok || (t && tok.t !== t)) throw new Error(`Attendu ${t ?? 'jeton'} en position ${pos} dans : ${src}`);
    pos++;
    return tok;
  };

  function operand() {
    const tok = peek();
    if (!tok) throw new Error(`Condition incomplète : ${src}`);
    if (tok.t === 'str') { pos++; return { k: 'lit', v: DATE_RE.test(tok.v) ? dateNum(tok.v) : tok.v, isDate: DATE_RE.test(tok.v) }; }
    if (tok.t === 'num' || tok.t === 'bool') { pos++; return { k: 'lit', v: tok.v }; }
    if (tok.t === 'id') {
      const path = [];
      path.push({ name: take('id').v });
      while (peek()?.t === '.' || peek()?.t === '(') {
        if (peek().t === '.') { pos++; path.push({ name: take('id').v }); } else {
          pos++;
          path[path.length - 1].arg = take('str').v;
          take(')');
        }
      }
      return { k: 'path', path };
    }
    throw new Error(`Opérande invalide dans : ${src}`);
  }

  function primary() {
    if (peek()?.t === '(') { pos++; const e = orExpr(); take(')'); return e; }
    const left = operand();
    const op = take('op').v;
    const right = operand();
    return { k: 'cmp', op, left, right };
  }
  function notExpr() {
    if (peek()?.t === 'NOT') { pos++; return { k: 'not', e: notExpr() }; }
    return primary();
  }
  function andExpr() {
    let e = notExpr();
    while (peek()?.t === 'AND') { pos++; e = { k: 'and', a: e, b: notExpr() }; }
    return e;
  }
  function orExpr() {
    let e = andExpr();
    while (peek()?.t === 'OR') { pos++; e = { k: 'or', a: e, b: andExpr() }; }
    return e;
  }
  const tree = orExpr();
  if (pos !== tokens.length) throw new Error(`Jetons en trop dans : ${src}`);
  return tree;
}

export function dateNum(s) {
  const m = DATE_RE.exec(s);
  return Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]);
}

/**
 * Contexte : { date: {day,month,year}, settings, nation (évaluée), nations[], events: {[id]: {fired, resolved}} }
 */
function resolve(path, ctx) {
  const [head, ...rest] = path;
  let value;
  if (head.name === 'date') value = ctx.date.year * 10000 + ctx.date.month * 100 + ctx.date.day;
  else if (head.name === 'GameSettings') value = ctx.settings;
  else if (head.name === 'nation') {
    value = head.arg != null ? ctx.nations.find((n) => n.id.toLowerCase() === head.arg.toLowerCase()) : ctx.nation;
    if (!value) throw new Error(`Nation inconnue : ${head.arg}`);
  } else if (head.name === 'event') {
    const [idSeg, ...after] = rest;
    const rec = ctx.events[idSeg.name] ?? { fired: false, resolved: false };
    return after.reduce((v, seg) => v?.[seg.name], rec);
  } else throw new Error(`Chemin inconnu : ${head.name}`);
  return rest.reduce((v, seg) => v?.[seg.name], value);
}

function value(node, ctx) {
  return node.k === 'lit' ? node.v : resolve(node.path, ctx);
}

export function evaluate(tree, ctx) {
  switch (tree.k) {
    case 'and': return evaluate(tree.a, ctx) && evaluate(tree.b, ctx);
    case 'or': return evaluate(tree.a, ctx) || evaluate(tree.b, ctx);
    case 'not': return !evaluate(tree.e, ctx);
    case 'cmp': {
      const l = value(tree.left, ctx);
      const r = value(tree.right, ctx);
      switch (tree.op) {
        case '==': return l === r;
        case '!=': return l !== r;
        case '<': return l != null && l < r;
        case '<=': return l != null && l <= r;
        case '>': return l != null && l > r;
        case '>=': return l != null && l >= r;
        case 'includes': return Array.isArray(l) && l.includes(r);
        default: throw new Error(`Opérateur inconnu ${tree.op}`);
      }
    }
    default: throw new Error('Nœud inconnu');
  }
}

export function evaluateCondition(src, ctx) {
  return evaluate(parseCondition(src), ctx);
}

/** Verrou global du mode historique (MECHANICS §5.3), appliqué à tout évènement de la table. */
export function gateHistorical(condition) {
  return `GameSettings.historicalMode == true AND (${condition})`;
}
