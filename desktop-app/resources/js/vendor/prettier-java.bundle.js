(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x2) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x2, {
    get: (a, b2) => (typeof require !== "undefined" ? require : a)[b2]
  }) : x2)(function(x2) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x2 + '" is not supported');
  });
  var __copyProps = (to2, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to2, key) && key !== except)
          __defProp(to2, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to2;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // node_modules/prettier/standalone.mjs
  var Ru = Object.defineProperty;
  var yt = (t, e) => {
    for (var r in e) Ru(t, r, { get: e[r], enumerable: true });
  };
  var Su = {};
  yt(Su, { __debug: () => $i, check: () => Vi, doc: () => ar, format: () => Pu, formatWithCursor: () => Ou, getSupportInfo: () => Wi, util: () => fr, version: () => gu });
  var X = (t, e) => (r, n, ...u) => r | 1 && n == null ? void 0 : (e.call(n) ?? n[t]).apply(n, u);
  var vu = String.prototype.replaceAll ?? function(t, e) {
    return t.global ? this.replace(t, e) : this.split(t).join(e);
  };
  var Lu = X("replaceAll", function() {
    if (typeof this == "string") return vu;
  });
  var ne = Lu;
  var Ne = class {
    diff(e, r, n = {}) {
      let u;
      typeof n == "function" ? (u = n, n = {}) : "callback" in n && (u = n.callback);
      let o = this.castInput(e, n), i2 = this.castInput(r, n), D = this.removeEmpty(this.tokenize(o, n)), s = this.removeEmpty(this.tokenize(i2, n));
      return this.diffWithOptionsObj(D, s, n, u);
    }
    diffWithOptionsObj(e, r, n, u) {
      var o;
      let i2 = (C2) => {
        if (C2 = this.postProcess(C2, n), u) {
          setTimeout(function() {
            u(C2);
          }, 0);
          return;
        } else return C2;
      }, D = r.length, s = e.length, a = 1, c = D + s;
      n.maxEditLength != null && (c = Math.min(c, n.maxEditLength));
      let p = (o = n.timeout) !== null && o !== void 0 ? o : 1 / 0, l = Date.now() + p, m = [{ oldPos: -1, lastComponent: void 0 }], f = this.extractCommon(m[0], r, e, 0, n);
      if (m[0].oldPos + 1 >= s && f + 1 >= D) return i2(this.buildValues(m[0].lastComponent, r, e));
      let F = -1 / 0, d = 1 / 0, E = () => {
        for (let C2 = Math.max(F, -a); C2 <= Math.min(d, a); C2 += 2) {
          let h, _ = m[C2 - 1], P = m[C2 + 1];
          _ && (m[C2 - 1] = void 0);
          let A = false;
          if (P) {
            let J = P.oldPos - C2;
            A = P && 0 <= J && J < D;
          }
          let B = _ && _.oldPos + 1 < s;
          if (!A && !B) {
            m[C2] = void 0;
            continue;
          }
          if (!B || A && _.oldPos < P.oldPos ? h = this.addToPath(P, true, false, 0, n) : h = this.addToPath(_, false, true, 1, n), f = this.extractCommon(h, r, e, C2, n), h.oldPos + 1 >= s && f + 1 >= D) return i2(this.buildValues(h.lastComponent, r, e)) || true;
          m[C2] = h, h.oldPos + 1 >= s && (d = Math.min(d, C2 - 1)), f + 1 >= D && (F = Math.max(F, C2 + 1));
        }
        a++;
      };
      if (u) (function C2() {
        setTimeout(function() {
          if (a > c || Date.now() > l) return u(void 0);
          E() || C2();
        }, 0);
      })();
      else for (; a <= c && Date.now() <= l; ) {
        let C2 = E();
        if (C2) return C2;
      }
    }
    addToPath(e, r, n, u, o) {
      let i2 = e.lastComponent;
      return i2 && !o.oneChangePerToken && i2.added === r && i2.removed === n ? { oldPos: e.oldPos + u, lastComponent: { count: i2.count + 1, added: r, removed: n, previousComponent: i2.previousComponent } } : { oldPos: e.oldPos + u, lastComponent: { count: 1, added: r, removed: n, previousComponent: i2 } };
    }
    extractCommon(e, r, n, u, o) {
      let i2 = r.length, D = n.length, s = e.oldPos, a = s - u, c = 0;
      for (; a + 1 < i2 && s + 1 < D && this.equals(n[s + 1], r[a + 1], o); ) a++, s++, c++, o.oneChangePerToken && (e.lastComponent = { count: 1, previousComponent: e.lastComponent, added: false, removed: false });
      return c && !o.oneChangePerToken && (e.lastComponent = { count: c, previousComponent: e.lastComponent, added: false, removed: false }), e.oldPos = s, a;
    }
    equals(e, r, n) {
      return n.comparator ? n.comparator(e, r) : e === r || !!n.ignoreCase && e.toLowerCase() === r.toLowerCase();
    }
    removeEmpty(e) {
      let r = [];
      for (let n = 0; n < e.length; n++) e[n] && r.push(e[n]);
      return r;
    }
    castInput(e, r) {
      return e;
    }
    tokenize(e, r) {
      return Array.from(e);
    }
    join(e) {
      return e.join("");
    }
    postProcess(e, r) {
      return e;
    }
    get useLongestToken() {
      return false;
    }
    buildValues(e, r, n) {
      let u = [], o;
      for (; e; ) u.push(e), o = e.previousComponent, delete e.previousComponent, e = o;
      u.reverse();
      let i2 = u.length, D = 0, s = 0, a = 0;
      for (; D < i2; D++) {
        let c = u[D];
        if (c.removed) c.value = this.join(n.slice(a, a + c.count)), a += c.count;
        else {
          if (!c.added && this.useLongestToken) {
            let p = r.slice(s, s + c.count);
            p = p.map(function(l, m) {
              let f = n[a + m];
              return f.length > l.length ? f : l;
            }), c.value = this.join(p);
          } else c.value = this.join(r.slice(s, s + c.count));
          s += c.count, c.added || (a += c.count);
        }
      }
      return u;
    }
  };
  var At = class extends Ne {
    tokenize(e) {
      return e.slice();
    }
    join(e) {
      return e;
    }
    removeEmpty(e) {
      return e;
    }
  };
  var pr = new At();
  function xt(t, e, r) {
    return pr.diff(t, e, r);
  }
  var Mu = () => {
  };
  var k = Mu;
  var dr = "cr";
  var Fr = "crlf";
  var Yu = "lf";
  var ju = Yu;
  var Bt = "\r";
  var Er = `\r
`;
  var ze = `
`;
  var Uu = ze;
  function Cr(t) {
    let e = t.indexOf(Bt);
    return e !== -1 ? t.charAt(e + 1) === ze ? Fr : dr : ju;
  }
  function we(t) {
    return t === dr ? Bt : t === Fr ? Er : Uu;
  }
  var Vu = /* @__PURE__ */ new Map([[ze, /\n/g], [Bt, /\r/g], [Er, /\r\n/g]]);
  function Tt(t, e) {
    let r = Vu.get(e);
    return t.match(r)?.length ?? 0;
  }
  var Wu = /\r\n?/g;
  function hr(t) {
    return ne(0, t, Wu, ze);
  }
  var ue = /* @__PURE__ */ Symbol.for("comments");
  function $u(t) {
    return this[t < 0 ? this.length + t : t];
  }
  var zu = X("at", function() {
    if (Array.isArray(this) || typeof this == "string") return $u;
  });
  var y = zu;
  var G = "string";
  var U = "array";
  var V = "cursor";
  var I = "indent";
  var R = "align";
  var v = "trim";
  var x = "group";
  var S = "fill";
  var T = "if-break";
  var L = "indent-if-break";
  var M = "line-suffix";
  var Y = "line-suffix-boundary";
  var g = "line";
  var b = "label";
  var N = "break-parent";
  var Ge = /* @__PURE__ */ new Set([V, I, R, v, x, S, T, L, M, Y, g, b, N]);
  function gr(t) {
    let e = t.length;
    for (; e > 0 && (t[e - 1] === "\r" || t[e - 1] === `
`); ) e--;
    return e < t.length ? t.slice(0, e) : t;
  }
  function Fe(t, e, r) {
    if (!t.has(e)) {
      let n = r(e);
      t.set(e, n);
    }
    return t.get(e);
  }
  function Gu(t) {
    if (typeof t == "string") return G;
    if (Array.isArray(t)) return U;
    if (!t) return;
    let { type: e } = t;
    if (Ge.has(e)) return e;
  }
  var q = Gu;
  var Ku = (t) => new Intl.ListFormat("en-US", { type: "disjunction" }).format(t);
  function Hu(t) {
    let e = t === null ? "null" : typeof t;
    if (e !== "string" && e !== "object") return `Unexpected doc '${e}', 
Expected it to be 'string' or 'object'.`;
    if (q(t)) throw new Error("doc is valid.");
    let r = Object.prototype.toString.call(t);
    if (r !== "[object Object]") return `Unexpected doc '${r}'.`;
    let n = Ku([...Ge].map((u) => `'${u}'`));
    return `Unexpected doc.type '${t.type}'.
Expected it to be ${n}.`;
  }
  var Nt = class extends Error {
    name = "InvalidDocError";
    constructor(e) {
      super(Hu(e)), this.doc = e;
    }
  };
  var Z = Nt;
  var _r = {};
  function Ju(t, e, r, n) {
    let u = [t];
    for (; u.length > 0; ) {
      let o = u.pop();
      if (o === _r) {
        r(u.pop());
        continue;
      }
      r && u.push(o, _r);
      let i2 = q(o);
      if (!i2) throw new Z(o);
      if (e?.(o) !== false) switch (i2) {
        case U:
        case S: {
          let D = i2 === U ? o : o.parts;
          for (let s = D.length, a = s - 1; a >= 0; --a) u.push(D[a]);
          break;
        }
        case T:
          u.push(o.flatContents, o.breakContents);
          break;
        case x:
          if (n && o.expandedStates) for (let D = o.expandedStates.length, s = D - 1; s >= 0; --s) u.push(o.expandedStates[s]);
          else u.push(o.contents);
          break;
        case R:
        case I:
        case L:
        case b:
        case M:
          u.push(o.contents);
          break;
        case G:
        case V:
        case v:
        case Y:
        case g:
        case N:
          break;
        default:
          throw new Z(o);
      }
    }
  }
  var Oe = Ju;
  function Se(t, e) {
    if (typeof t == "string") return e(t);
    let r = /* @__PURE__ */ new Map();
    return n(t);
    function n(o) {
      return Fe(r, o, u);
    }
    function u(o) {
      switch (q(o)) {
        case U:
          return e(o.map(n));
        case S:
          return e({ ...o, parts: o.parts.map(n) });
        case T:
          return e({ ...o, breakContents: n(o.breakContents), flatContents: n(o.flatContents) });
        case x: {
          let { expandedStates: i2, contents: D } = o;
          return i2 ? (i2 = i2.map(n), D = i2[0]) : D = n(D), e({ ...o, contents: D, expandedStates: i2 });
        }
        case R:
        case I:
        case L:
        case b:
        case M:
          return e({ ...o, contents: n(o.contents) });
        case G:
        case V:
        case v:
        case Y:
        case g:
        case N:
          return e(o);
        default:
          throw new Z(o);
      }
    }
  }
  function Ke(t, e, r) {
    let n = r, u = false;
    function o(i2) {
      if (u) return false;
      let D = e(i2);
      D !== void 0 && (u = true, n = D);
    }
    return Oe(t, o), n;
  }
  function qu(t) {
    if (t.type === x && t.break || t.type === g && t.hard || t.type === N) return true;
  }
  function xr(t) {
    return Ke(t, qu, false);
  }
  function yr(t) {
    if (t.length > 0) {
      let e = y(0, t, -1);
      !e.expandedStates && !e.break && (e.break = "propagated");
    }
    return null;
  }
  function Br(t) {
    let e = /* @__PURE__ */ new Set(), r = [];
    function n(o) {
      if (o.type === N && yr(r), o.type === x) {
        if (r.push(o), e.has(o)) return false;
        e.add(o);
      }
    }
    function u(o) {
      o.type === x && r.pop().break && yr(r);
    }
    Oe(t, n, u, true);
  }
  function Xu(t) {
    return t.type === g && !t.hard ? t.soft ? "" : " " : t.type === T ? t.flatContents : t;
  }
  function Tr(t) {
    return Se(t, Xu);
  }
  function Ar(t) {
    for (t = [...t]; t.length >= 2 && y(0, t, -2).type === g && y(0, t, -1).type === N; ) t.length -= 2;
    if (t.length > 0) {
      let e = Pe(y(0, t, -1));
      t[t.length - 1] = e;
    }
    return t;
  }
  function Pe(t) {
    switch (q(t)) {
      case I:
      case L:
      case x:
      case M:
      case b: {
        let e = Pe(t.contents);
        return { ...t, contents: e };
      }
      case T:
        return { ...t, breakContents: Pe(t.breakContents), flatContents: Pe(t.flatContents) };
      case S:
        return { ...t, parts: Ar(t.parts) };
      case U:
        return Ar(t);
      case G:
        return gr(t);
      case R:
      case V:
      case v:
      case Y:
      case g:
      case N:
        break;
      default:
        throw new Z(t);
    }
    return t;
  }
  function He(t) {
    return Pe(Zu(t));
  }
  function Qu(t) {
    switch (q(t)) {
      case S: {
        let { parts: e } = t;
        if (e.every((r) => r === "")) return "";
        if (e.length === 1) return e[0];
        break;
      }
      case x:
        if (!t.contents && !t.id && !t.break && !t.expandedStates) return "";
        if (t.contents.type === x && t.contents.id === t.id && t.contents.break === t.break && t.contents.expandedStates === t.expandedStates) return t.contents;
        break;
      case R:
      case I:
      case L:
      case M:
        if (!t.contents) return "";
        break;
      case T:
        if (!t.flatContents && !t.breakContents) return "";
        break;
      case U: {
        let e = [];
        for (let r of t) {
          if (!r) continue;
          let [n, ...u] = Array.isArray(r) ? r : [r];
          typeof n == "string" && typeof y(0, e, -1) == "string" ? e[e.length - 1] += n : e.push(n), e.push(...u);
        }
        return e.length === 0 ? "" : e.length === 1 ? e[0] : e;
      }
      case G:
      case V:
      case v:
      case Y:
      case g:
      case b:
      case N:
        break;
      default:
        throw new Z(t);
    }
    return t;
  }
  function Zu(t) {
    return Se(t, (e) => Qu(e));
  }
  function Nr(t, e = Je) {
    return Se(t, (r) => typeof r == "string" ? be(e, r.split(`
`)) : r);
  }
  function eo(t) {
    if (t.type === g) return true;
  }
  function wr(t) {
    return Ke(t, eo, false);
  }
  function Ee(t, e) {
    return t.type === b ? { ...t, contents: e(t.contents) } : e(t);
  }
  var w = k;
  var qe = k;
  var Or = k;
  var Pr = k;
  function oe(t) {
    return w(t), { type: I, contents: t };
  }
  function De(t, e) {
    return Pr(t), w(e), { type: R, contents: e, n: t };
  }
  function Sr(t) {
    return De(Number.NEGATIVE_INFINITY, t);
  }
  function Xe(t) {
    return De({ type: "root" }, t);
  }
  function br(t) {
    return De(-1, t);
  }
  function Qe(t, e, r) {
    w(t);
    let n = t;
    if (e > 0) {
      for (let u = 0; u < Math.floor(e / r); ++u) n = oe(n);
      n = De(e % r, n), n = De(Number.NEGATIVE_INFINITY, n);
    }
    return n;
  }
  var ae = { type: N };
  var ee = { type: V };
  function kr(t) {
    return Or(t), { type: S, parts: t };
  }
  function wt(t, e = {}) {
    return w(t), qe(e.expandedStates, true), { type: x, id: e.id, contents: t, break: !!e.shouldBreak, expandedStates: e.expandedStates };
  }
  function Ir(t, e) {
    return wt(t[0], { ...e, expandedStates: t });
  }
  function Rr(t, e = "", r = {}) {
    return w(t), e !== "" && w(e), { type: T, breakContents: t, flatContents: e, groupId: r.groupId };
  }
  function vr(t, e) {
    return w(t), { type: L, contents: t, groupId: e.groupId, negate: e.negate };
  }
  function be(t, e) {
    w(t), qe(e);
    let r = [];
    for (let n = 0; n < e.length; n++) n !== 0 && r.push(t), r.push(e[n]);
    return r;
  }
  function Lr(t, e) {
    return w(e), t ? { type: b, label: t, contents: e } : e;
  }
  var Ze = { type: g };
  var Mr = { type: g, soft: true };
  var ke = { type: g, hard: true };
  var W = [ke, ae];
  var Ot = { type: g, hard: true, literal: true };
  var Je = [Ot, ae];
  function Ie(t) {
    return w(t), { type: M, contents: t };
  }
  var Yr = { type: Y };
  var jr = { type: v };
  function te(t) {
    if (!t) return "";
    if (Array.isArray(t)) {
      let e = [];
      for (let r of t) if (Array.isArray(r)) e.push(...te(r));
      else {
        let n = te(r);
        n !== "" && e.push(n);
      }
      return e;
    }
    return t.type === T ? { ...t, breakContents: te(t.breakContents), flatContents: te(t.flatContents) } : t.type === x ? { ...t, contents: te(t.contents), expandedStates: t.expandedStates?.map(te) } : t.type === S ? { type: "fill", parts: t.parts.map(te) } : t.contents ? { ...t, contents: te(t.contents) } : t;
  }
  function Ur(t) {
    let e = /* @__PURE__ */ Object.create(null), r = /* @__PURE__ */ new Set();
    return n(te(t));
    function n(o, i2, D) {
      if (typeof o == "string") return JSON.stringify(o);
      if (Array.isArray(o)) {
        let s = o.map(n).filter(Boolean);
        return s.length === 1 ? s[0] : `[${s.join(", ")}]`;
      }
      if (o.type === g) {
        let s = D?.[i2 + 1]?.type === N;
        return o.literal ? s ? "literalline" : "literallineWithoutBreakParent" : o.hard ? s ? "hardline" : "hardlineWithoutBreakParent" : o.soft ? "softline" : "line";
      }
      if (o.type === N) return D?.[i2 - 1]?.type === g && D[i2 - 1].hard ? void 0 : "breakParent";
      if (o.type === v) return "trim";
      if (o.type === I) return "indent(" + n(o.contents) + ")";
      if (o.type === R) return o.n === Number.NEGATIVE_INFINITY ? "dedentToRoot(" + n(o.contents) + ")" : o.n < 0 ? "dedent(" + n(o.contents) + ")" : o.n.type === "root" ? "markAsRoot(" + n(o.contents) + ")" : "align(" + JSON.stringify(o.n) + ", " + n(o.contents) + ")";
      if (o.type === T) return "ifBreak(" + n(o.breakContents) + (o.flatContents ? ", " + n(o.flatContents) : "") + (o.groupId ? (o.flatContents ? "" : ', ""') + `, { groupId: ${u(o.groupId)} }` : "") + ")";
      if (o.type === L) {
        let s = [];
        o.negate && s.push("negate: true"), o.groupId && s.push(`groupId: ${u(o.groupId)}`);
        let a = s.length > 0 ? `, { ${s.join(", ")} }` : "";
        return `indentIfBreak(${n(o.contents)}${a})`;
      }
      if (o.type === x) {
        let s = [];
        o.break && o.break !== "propagated" && s.push("shouldBreak: true"), o.id && s.push(`id: ${u(o.id)}`);
        let a = s.length > 0 ? `, { ${s.join(", ")} }` : "";
        return o.expandedStates ? `conditionalGroup([${o.expandedStates.map((c) => n(c)).join(",")}]${a})` : `group(${n(o.contents)}${a})`;
      }
      if (o.type === S) return `fill([${o.parts.map((s) => n(s)).join(", ")}])`;
      if (o.type === M) return "lineSuffix(" + n(o.contents) + ")";
      if (o.type === Y) return "lineSuffixBoundary";
      if (o.type === b) return `label(${JSON.stringify(o.label)}, ${n(o.contents)})`;
      if (o.type === V) return "cursor";
      throw new Error("Unknown doc type " + o.type);
    }
    function u(o) {
      if (typeof o != "symbol") return JSON.stringify(String(o));
      if (o in e) return e[o];
      let i2 = o.description || "symbol";
      for (let D = 0; ; D++) {
        let s = i2 + (D > 0 ? ` #${D}` : "");
        if (!r.has(s)) return r.add(s), e[o] = `Symbol.for(${JSON.stringify(s)})`;
      }
    }
  }
  var Vr = () => /[#*0-9]\uFE0F?\u20E3|[\xA9\xAE\u203C\u2049\u2122\u2139\u2194-\u2199\u21A9\u21AA\u231A\u231B\u2328\u23CF\u23ED-\u23EF\u23F1\u23F2\u23F8-\u23FA\u24C2\u25AA\u25AB\u25B6\u25C0\u25FB\u25FC\u25FE\u2600-\u2604\u260E\u2611\u2614\u2615\u2618\u2620\u2622\u2623\u2626\u262A\u262E\u262F\u2638-\u263A\u2640\u2642\u2648-\u2653\u265F\u2660\u2663\u2665\u2666\u2668\u267B\u267E\u267F\u2692\u2694-\u2697\u2699\u269B\u269C\u26A0\u26A7\u26AA\u26B0\u26B1\u26BD\u26BE\u26C4\u26C8\u26CF\u26D1\u26E9\u26F0-\u26F5\u26F7\u26F8\u26FA\u2702\u2708\u2709\u270F\u2712\u2714\u2716\u271D\u2721\u2733\u2734\u2744\u2747\u2757\u2763\u27A1\u2934\u2935\u2B05-\u2B07\u2B1B\u2B1C\u2B55\u3030\u303D\u3297\u3299]\uFE0F?|[\u261D\u270C\u270D](?:\uD83C[\uDFFB-\uDFFF]|\uFE0F)?|[\u270A\u270B](?:\uD83C[\uDFFB-\uDFFF])?|[\u23E9-\u23EC\u23F0\u23F3\u25FD\u2693\u26A1\u26AB\u26C5\u26CE\u26D4\u26EA\u26FD\u2705\u2728\u274C\u274E\u2753-\u2755\u2795-\u2797\u27B0\u27BF\u2B50]|\u26D3\uFE0F?(?:\u200D\uD83D\uDCA5)?|\u26F9(?:\uD83C[\uDFFB-\uDFFF]|\uFE0F)?(?:\u200D[\u2640\u2642]\uFE0F?)?|\u2764\uFE0F?(?:\u200D(?:\uD83D\uDD25|\uD83E\uDE79))?|\uD83C(?:[\uDC04\uDD70\uDD71\uDD7E\uDD7F\uDE02\uDE37\uDF21\uDF24-\uDF2C\uDF36\uDF7D\uDF96\uDF97\uDF99-\uDF9B\uDF9E\uDF9F\uDFCD\uDFCE\uDFD4-\uDFDF\uDFF5\uDFF7]\uFE0F?|[\uDF85\uDFC2\uDFC7](?:\uD83C[\uDFFB-\uDFFF])?|[\uDFC4\uDFCA](?:\uD83C[\uDFFB-\uDFFF])?(?:\u200D[\u2640\u2642]\uFE0F?)?|[\uDFCB\uDFCC](?:\uD83C[\uDFFB-\uDFFF]|\uFE0F)?(?:\u200D[\u2640\u2642]\uFE0F?)?|[\uDCCF\uDD8E\uDD91-\uDD9A\uDE01\uDE1A\uDE2F\uDE32-\uDE36\uDE38-\uDE3A\uDE50\uDE51\uDF00-\uDF20\uDF2D-\uDF35\uDF37-\uDF43\uDF45-\uDF4A\uDF4C-\uDF7C\uDF7E-\uDF84\uDF86-\uDF93\uDFA0-\uDFC1\uDFC5\uDFC6\uDFC8\uDFC9\uDFCF-\uDFD3\uDFE0-\uDFF0\uDFF8-\uDFFF]|\uDDE6\uD83C[\uDDE8-\uDDEC\uDDEE\uDDF1\uDDF2\uDDF4\uDDF6-\uDDFA\uDDFC\uDDFD\uDDFF]|\uDDE7\uD83C[\uDDE6\uDDE7\uDDE9-\uDDEF\uDDF1-\uDDF4\uDDF6-\uDDF9\uDDFB\uDDFC\uDDFE\uDDFF]|\uDDE8\uD83C[\uDDE6\uDDE8\uDDE9\uDDEB-\uDDEE\uDDF0-\uDDF7\uDDFA-\uDDFF]|\uDDE9\uD83C[\uDDEA\uDDEC\uDDEF\uDDF0\uDDF2\uDDF4\uDDFF]|\uDDEA\uD83C[\uDDE6\uDDE8\uDDEA\uDDEC\uDDED\uDDF7-\uDDFA]|\uDDEB\uD83C[\uDDEE-\uDDF0\uDDF2\uDDF4\uDDF7]|\uDDEC\uD83C[\uDDE6\uDDE7\uDDE9-\uDDEE\uDDF1-\uDDF3\uDDF5-\uDDFA\uDDFC\uDDFE]|\uDDED\uD83C[\uDDF0\uDDF2\uDDF3\uDDF7\uDDF9\uDDFA]|\uDDEE\uD83C[\uDDE8-\uDDEA\uDDF1-\uDDF4\uDDF6-\uDDF9]|\uDDEF\uD83C[\uDDEA\uDDF2\uDDF4\uDDF5]|\uDDF0\uD83C[\uDDEA\uDDEC-\uDDEE\uDDF2\uDDF3\uDDF5\uDDF7\uDDFC\uDDFE\uDDFF]|\uDDF1\uD83C[\uDDE6-\uDDE8\uDDEE\uDDF0\uDDF7-\uDDFB\uDDFE]|\uDDF2\uD83C[\uDDE6\uDDE8-\uDDED\uDDF0-\uDDFF]|\uDDF3\uD83C[\uDDE6\uDDE8\uDDEA-\uDDEC\uDDEE\uDDF1\uDDF4\uDDF5\uDDF7\uDDFA\uDDFF]|\uDDF4\uD83C\uDDF2|\uDDF5\uD83C[\uDDE6\uDDEA-\uDDED\uDDF0-\uDDF3\uDDF7-\uDDF9\uDDFC\uDDFE]|\uDDF6\uD83C\uDDE6|\uDDF7\uD83C[\uDDEA\uDDF4\uDDF8\uDDFA\uDDFC]|\uDDF8\uD83C[\uDDE6-\uDDEA\uDDEC-\uDDF4\uDDF7-\uDDF9\uDDFB\uDDFD-\uDDFF]|\uDDF9\uD83C[\uDDE6\uDDE8\uDDE9\uDDEB-\uDDED\uDDEF-\uDDF4\uDDF7\uDDF9\uDDFB\uDDFC\uDDFF]|\uDDFA\uD83C[\uDDE6\uDDEC\uDDF2\uDDF3\uDDF8\uDDFE\uDDFF]|\uDDFB\uD83C[\uDDE6\uDDE8\uDDEA\uDDEC\uDDEE\uDDF3\uDDFA]|\uDDFC\uD83C[\uDDEB\uDDF8]|\uDDFD\uD83C\uDDF0|\uDDFE\uD83C[\uDDEA\uDDF9]|\uDDFF\uD83C[\uDDE6\uDDF2\uDDFC]|\uDF44(?:\u200D\uD83D\uDFEB)?|\uDF4B(?:\u200D\uD83D\uDFE9)?|\uDFC3(?:\uD83C[\uDFFB-\uDFFF])?(?:\u200D(?:[\u2640\u2642]\uFE0F?(?:\u200D\u27A1\uFE0F?)?|\u27A1\uFE0F?))?|\uDFF3\uFE0F?(?:\u200D(?:\u26A7\uFE0F?|\uD83C\uDF08))?|\uDFF4(?:\u200D\u2620\uFE0F?|\uDB40\uDC67\uDB40\uDC62\uDB40(?:\uDC65\uDB40\uDC6E\uDB40\uDC67|\uDC73\uDB40\uDC63\uDB40\uDC74|\uDC77\uDB40\uDC6C\uDB40\uDC73)\uDB40\uDC7F)?)|\uD83D(?:[\uDC3F\uDCFD\uDD49\uDD4A\uDD6F\uDD70\uDD73\uDD76-\uDD79\uDD87\uDD8A-\uDD8D\uDDA5\uDDA8\uDDB1\uDDB2\uDDBC\uDDC2-\uDDC4\uDDD1-\uDDD3\uDDDC-\uDDDE\uDDE1\uDDE3\uDDE8\uDDEF\uDDF3\uDDFA\uDECB\uDECD-\uDECF\uDEE0-\uDEE5\uDEE9\uDEF0\uDEF3]\uFE0F?|[\uDC42\uDC43\uDC46-\uDC50\uDC66\uDC67\uDC6B-\uDC6D\uDC72\uDC74-\uDC76\uDC78\uDC7C\uDC83\uDC85\uDC8F\uDC91\uDCAA\uDD7A\uDD95\uDD96\uDE4C\uDE4F\uDEC0\uDECC](?:\uD83C[\uDFFB-\uDFFF])?|[\uDC6E-\uDC71\uDC73\uDC77\uDC81\uDC82\uDC86\uDC87\uDE45-\uDE47\uDE4B\uDE4D\uDE4E\uDEA3\uDEB4\uDEB5](?:\uD83C[\uDFFB-\uDFFF])?(?:\u200D[\u2640\u2642]\uFE0F?)?|[\uDD74\uDD90](?:\uD83C[\uDFFB-\uDFFF]|\uFE0F)?|[\uDC00-\uDC07\uDC09-\uDC14\uDC16-\uDC25\uDC27-\uDC3A\uDC3C-\uDC3E\uDC40\uDC44\uDC45\uDC51-\uDC65\uDC6A\uDC79-\uDC7B\uDC7D-\uDC80\uDC84\uDC88-\uDC8E\uDC90\uDC92-\uDCA9\uDCAB-\uDCFC\uDCFF-\uDD3D\uDD4B-\uDD4E\uDD50-\uDD67\uDDA4\uDDFB-\uDE2D\uDE2F-\uDE34\uDE37-\uDE41\uDE43\uDE44\uDE48-\uDE4A\uDE80-\uDEA2\uDEA4-\uDEB3\uDEB7-\uDEBF\uDEC1-\uDEC5\uDED0-\uDED2\uDED5-\uDED8\uDEDC-\uDEDF\uDEEB\uDEEC\uDEF4-\uDEFC\uDFE0-\uDFEB\uDFF0]|\uDC08(?:\u200D\u2B1B)?|\uDC15(?:\u200D\uD83E\uDDBA)?|\uDC26(?:\u200D(?:\u2B1B|\uD83D\uDD25))?|\uDC3B(?:\u200D\u2744\uFE0F?)?|\uDC41\uFE0F?(?:\u200D\uD83D\uDDE8\uFE0F?)?|\uDC68(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?\uDC68|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDC68\uDC69]\u200D\uD83D(?:\uDC66(?:\u200D\uD83D\uDC66)?|\uDC67(?:\u200D\uD83D[\uDC66\uDC67])?)|[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC66(?:\u200D\uD83D\uDC66)?|\uDC67(?:\u200D\uD83D[\uDC66\uDC67])?)|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3]))|\uD83C(?:\uDFFB(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?\uDC68\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83D\uDC68\uD83C[\uDFFC-\uDFFF])|\uD83E(?:[\uDD1D\uDEEF]\u200D\uD83D\uDC68\uD83C[\uDFFC-\uDFFF]|[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3])))?|\uDFFC(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?\uDC68\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83D\uDC68\uD83C[\uDFFB\uDFFD-\uDFFF])|\uD83E(?:[\uDD1D\uDEEF]\u200D\uD83D\uDC68\uD83C[\uDFFB\uDFFD-\uDFFF]|[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3])))?|\uDFFD(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?\uDC68\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83D\uDC68\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])|\uD83E(?:[\uDD1D\uDEEF]\u200D\uD83D\uDC68\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF]|[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3])))?|\uDFFE(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?\uDC68\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83D\uDC68\uD83C[\uDFFB-\uDFFD\uDFFF])|\uD83E(?:[\uDD1D\uDEEF]\u200D\uD83D\uDC68\uD83C[\uDFFB-\uDFFD\uDFFF]|[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3])))?|\uDFFF(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?\uDC68\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83D\uDC68\uD83C[\uDFFB-\uDFFE])|\uD83E(?:[\uDD1D\uDEEF]\u200D\uD83D\uDC68\uD83C[\uDFFB-\uDFFE]|[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3])))?))?|\uDC69(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?[\uDC68\uDC69]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC66(?:\u200D\uD83D\uDC66)?|\uDC67(?:\u200D\uD83D[\uDC66\uDC67])?|\uDC69\u200D\uD83D(?:\uDC66(?:\u200D\uD83D\uDC66)?|\uDC67(?:\u200D\uD83D[\uDC66\uDC67])?))|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3]))|\uD83C(?:\uDFFB(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:[\uDC68\uDC69]|\uDC8B\u200D\uD83D[\uDC68\uDC69])\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83D\uDC69\uD83C[\uDFFC-\uDFFF])|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3]|\uDD1D\u200D\uD83D[\uDC68\uDC69]\uD83C[\uDFFC-\uDFFF]|\uDEEF\u200D\uD83D\uDC69\uD83C[\uDFFC-\uDFFF])))?|\uDFFC(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:[\uDC68\uDC69]|\uDC8B\u200D\uD83D[\uDC68\uDC69])\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83D\uDC69\uD83C[\uDFFB\uDFFD-\uDFFF])|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3]|\uDD1D\u200D\uD83D[\uDC68\uDC69]\uD83C[\uDFFB\uDFFD-\uDFFF]|\uDEEF\u200D\uD83D\uDC69\uD83C[\uDFFB\uDFFD-\uDFFF])))?|\uDFFD(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:[\uDC68\uDC69]|\uDC8B\u200D\uD83D[\uDC68\uDC69])\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83D\uDC69\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3]|\uDD1D\u200D\uD83D[\uDC68\uDC69]\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF]|\uDEEF\u200D\uD83D\uDC69\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])))?|\uDFFE(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:[\uDC68\uDC69]|\uDC8B\u200D\uD83D[\uDC68\uDC69])\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83D\uDC69\uD83C[\uDFFB-\uDFFD\uDFFF])|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3]|\uDD1D\u200D\uD83D[\uDC68\uDC69]\uD83C[\uDFFB-\uDFFD\uDFFF]|\uDEEF\u200D\uD83D\uDC69\uD83C[\uDFFB-\uDFFD\uDFFF])))?|\uDFFF(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:[\uDC68\uDC69]|\uDC8B\u200D\uD83D[\uDC68\uDC69])\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83D\uDC69\uD83C[\uDFFB-\uDFFE])|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3]|\uDD1D\u200D\uD83D[\uDC68\uDC69]\uD83C[\uDFFB-\uDFFE]|\uDEEF\u200D\uD83D\uDC69\uD83C[\uDFFB-\uDFFE])))?))?|\uDD75(?:\uD83C[\uDFFB-\uDFFF]|\uFE0F)?(?:\u200D[\u2640\u2642]\uFE0F?)?|\uDE2E(?:\u200D\uD83D\uDCA8)?|\uDE35(?:\u200D\uD83D\uDCAB)?|\uDE36(?:\u200D\uD83C\uDF2B\uFE0F?)?|\uDE42(?:\u200D[\u2194\u2195]\uFE0F?)?|\uDEB6(?:\uD83C[\uDFFB-\uDFFF])?(?:\u200D(?:[\u2640\u2642]\uFE0F?(?:\u200D\u27A1\uFE0F?)?|\u27A1\uFE0F?))?)|\uD83E(?:[\uDD0C\uDD0F\uDD18-\uDD1F\uDD30-\uDD34\uDD36\uDD77\uDDB5\uDDB6\uDDBB\uDDD2\uDDD3\uDDD5\uDEC3-\uDEC5\uDEF0\uDEF2-\uDEF8](?:\uD83C[\uDFFB-\uDFFF])?|[\uDD26\uDD35\uDD37-\uDD39\uDD3C-\uDD3E\uDDB8\uDDB9\uDDCD\uDDCF\uDDD4\uDDD6-\uDDDD](?:\uD83C[\uDFFB-\uDFFF])?(?:\u200D[\u2640\u2642]\uFE0F?)?|[\uDDDE\uDDDF](?:\u200D[\u2640\u2642]\uFE0F?)?|[\uDD0D\uDD0E\uDD10-\uDD17\uDD20-\uDD25\uDD27-\uDD2F\uDD3A\uDD3F-\uDD45\uDD47-\uDD76\uDD78-\uDDB4\uDDB7\uDDBA\uDDBC-\uDDCC\uDDD0\uDDE0-\uDDFF\uDE70-\uDE7C\uDE80-\uDE8A\uDE8E-\uDEC2\uDEC6\uDEC8\uDECD-\uDEDC\uDEDF-\uDEEA\uDEEF]|\uDDCE(?:\uD83C[\uDFFB-\uDFFF])?(?:\u200D(?:[\u2640\u2642]\uFE0F?(?:\u200D\u27A1\uFE0F?)?|\u27A1\uFE0F?))?|\uDDD1(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3\uDE70]|\uDD1D\u200D\uD83E\uDDD1|\uDDD1\u200D\uD83E\uDDD2(?:\u200D\uD83E\uDDD2)?|\uDDD2(?:\u200D\uD83E\uDDD2)?))|\uD83C(?:\uDFFB(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D(?:\uD83D\uDC8B\u200D)?\uD83E\uDDD1\uD83C[\uDFFC-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83E\uDDD1\uD83C[\uDFFC-\uDFFF])|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3\uDE70]|\uDD1D\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFF]|\uDEEF\u200D\uD83E\uDDD1\uD83C[\uDFFC-\uDFFF])))?|\uDFFC(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D(?:\uD83D\uDC8B\u200D)?\uD83E\uDDD1\uD83C[\uDFFB\uDFFD-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83E\uDDD1\uD83C[\uDFFB\uDFFD-\uDFFF])|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3\uDE70]|\uDD1D\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFF]|\uDEEF\u200D\uD83E\uDDD1\uD83C[\uDFFB\uDFFD-\uDFFF])))?|\uDFFD(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D(?:\uD83D\uDC8B\u200D)?\uD83E\uDDD1\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83E\uDDD1\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3\uDE70]|\uDD1D\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFF]|\uDEEF\u200D\uD83E\uDDD1\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])))?|\uDFFE(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D(?:\uD83D\uDC8B\u200D)?\uD83E\uDDD1\uD83C[\uDFFB-\uDFFD\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFD\uDFFF])|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3\uDE70]|\uDD1D\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFF]|\uDEEF\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFD\uDFFF])))?|\uDFFF(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D(?:\uD83D\uDC8B\u200D)?\uD83E\uDDD1\uD83C[\uDFFB-\uDFFE]|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFE])|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3\uDE70]|\uDD1D\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFF]|\uDEEF\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFE])))?))?|\uDEF1(?:\uD83C(?:\uDFFB(?:\u200D\uD83E\uDEF2\uD83C[\uDFFC-\uDFFF])?|\uDFFC(?:\u200D\uD83E\uDEF2\uD83C[\uDFFB\uDFFD-\uDFFF])?|\uDFFD(?:\u200D\uD83E\uDEF2\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])?|\uDFFE(?:\u200D\uD83E\uDEF2\uD83C[\uDFFB-\uDFFD\uDFFF])?|\uDFFF(?:\u200D\uD83E\uDEF2\uD83C[\uDFFB-\uDFFE])?))?)/g;
  var Wr = 12288;
  var $r = 65510;
  var zr = [12288, 12288, 65281, 65376, 65504, 65510];
  var Gr = 4352;
  var Kr = 262141;
  var Pt = [4352, 4447, 8986, 8987, 9001, 9002, 9193, 9196, 9200, 9200, 9203, 9203, 9725, 9726, 9748, 9749, 9776, 9783, 9800, 9811, 9855, 9855, 9866, 9871, 9875, 9875, 9889, 9889, 9898, 9899, 9917, 9918, 9924, 9925, 9934, 9934, 9940, 9940, 9962, 9962, 9970, 9971, 9973, 9973, 9978, 9978, 9981, 9981, 9989, 9989, 9994, 9995, 10024, 10024, 10060, 10060, 10062, 10062, 10067, 10069, 10071, 10071, 10133, 10135, 10160, 10160, 10175, 10175, 11035, 11036, 11088, 11088, 11093, 11093, 11904, 11929, 11931, 12019, 12032, 12245, 12272, 12287, 12289, 12350, 12353, 12438, 12441, 12543, 12549, 12591, 12593, 12686, 12688, 12773, 12783, 12830, 12832, 12871, 12880, 42124, 42128, 42182, 43360, 43388, 44032, 55203, 63744, 64255, 65040, 65049, 65072, 65106, 65108, 65126, 65128, 65131, 94176, 94180, 94192, 94198, 94208, 101589, 101631, 101662, 101760, 101874, 110576, 110579, 110581, 110587, 110589, 110590, 110592, 110882, 110898, 110898, 110928, 110930, 110933, 110933, 110948, 110951, 110960, 111355, 119552, 119638, 119648, 119670, 126980, 126980, 127183, 127183, 127374, 127374, 127377, 127386, 127488, 127490, 127504, 127547, 127552, 127560, 127568, 127569, 127584, 127589, 127744, 127776, 127789, 127797, 127799, 127868, 127870, 127891, 127904, 127946, 127951, 127955, 127968, 127984, 127988, 127988, 127992, 128062, 128064, 128064, 128066, 128252, 128255, 128317, 128331, 128334, 128336, 128359, 128378, 128378, 128405, 128406, 128420, 128420, 128507, 128591, 128640, 128709, 128716, 128716, 128720, 128722, 128725, 128728, 128732, 128735, 128747, 128748, 128756, 128764, 128992, 129003, 129008, 129008, 129292, 129338, 129340, 129349, 129351, 129535, 129648, 129660, 129664, 129674, 129678, 129734, 129736, 129736, 129741, 129756, 129759, 129770, 129775, 129784, 131072, 196605, 196608, 262141];
  var St = (t, e) => {
    let r = 0, n = Math.floor(t.length / 2) - 1;
    for (; r <= n; ) {
      let u = Math.floor((r + n) / 2), o = u * 2;
      if (e < t[o]) n = u - 1;
      else if (e > t[o + 1]) r = u + 1;
      else return true;
    }
    return false;
  };
  var Hr = 19968;
  var [to, ro] = no(Pt);
  function no(t) {
    let e = t[0], r = t[1];
    for (let n = 0; n < t.length; n += 2) {
      let u = t[n], o = t[n + 1];
      if (Hr >= u && Hr <= o) return [u, o];
      o - u > r - e && (e = u, r = o);
    }
    return [e, r];
  }
  var bt = (t) => t < Wr || t > $r ? false : St(zr, t);
  var kt = (t) => t >= to && t <= ro ? true : t < Gr || t > Kr ? false : St(Pt, t);
  var uo = /^(?:[\xA9\xAE\u203C\u2049\u2122\u2139\u2194-\u2199\u21A9\u21AA\u2328\u23CF\u23ED-\u23EF\u23F1\u23F2\u23F8-\u23FA\u24C2\u25AA\u25AB\u25B6\u25C0\u25FB\u25FC\u2600-\u2604\u260E\u2611\u2618\u2620\u2622\u2623\u2626\u262A\u262E\u262F\u2638-\u263A\u2640\u2642\u265F\u2660\u2663\u2665\u2666\u2668\u267B\u267E\u2692\u2694-\u2697\u2699\u269B\u269C\u26A0\u26A7\u26B0\u26B1\u26C8\u26CF\u26D1\u26D3\u26E9\u26F0\u26F1\u26F4\u26F7\u26F8\u2702\u2708\u2709\u270F\u2712\u2714\u2716\u271D\u2721\u2733\u2734\u2744\u2747\u2763\u2764\u27A1\u2934\u2935\u2B05-\u2B07]|\uD83C[\uDD70\uDD71\uDD7E\uDD7F\uDF21\uDF24-\uDF2C\uDF36\uDF7D\uDF96\uDF97\uDF99-\uDF9B\uDF9E\uDF9F\uDFCD\uDFCE\uDFD4-\uDFDF\uDFF3\uDFF5\uDFF7]|\uD83D[\uDC3F\uDC41\uDCFD\uDD49\uDD4A\uDD6F\uDD70\uDD73\uDD76-\uDD79\uDD87\uDD8A-\uDD8D\uDDA5\uDDA8\uDDB1\uDDB2\uDDBC\uDDC2-\uDDC4\uDDD1-\uDDD3\uDDDC-\uDDDE\uDDE1\uDDE3\uDDE8\uDDEF\uDDF3\uDDFA\uDECB\uDECD-\uDECF\uDEE0-\uDEE5\uDEE9\uDEF0\uDEF3])$/;
  var Jr = (t) => uo.test(t);
  var oo = /[^\x20-\x7F]/;
  function io(t) {
    if (!t) return 0;
    if (!oo.test(t)) return t.length;
    let e = 0;
    t = t.replace(Vr(), (r) => (e += Jr(r) ? 1 : 2, ""));
    for (let r of t) {
      let n = r.codePointAt(0);
      n <= 31 || n >= 127 && n <= 159 || n >= 768 && n <= 879 || n >= 65024 && n <= 65039 || (e += bt(n) || kt(n) ? 2 : 1);
    }
    return e;
  }
  var Re = io;
  var so = { type: 0 };
  var Do = { type: 1 };
  var It = { value: "", length: 0, queue: [], get root() {
    return It;
  } };
  function qr(t, e, r) {
    let n = e.type === 1 ? t.queue.slice(0, -1) : [...t.queue, e], u = "", o = 0, i2 = 0, D = 0;
    for (let f of n) switch (f.type) {
      case 0:
        c(), r.useTabs ? s(1) : a(r.tabWidth);
        break;
      case 3: {
        let { string: F } = f;
        c(), u += F, o += F.length;
        break;
      }
      case 2: {
        let { width: F } = f;
        i2 += 1, D += F;
        break;
      }
      default:
        throw new Error(`Unexpected indent comment '${f.type}'.`);
    }
    return l(), { ...t, value: u, length: o, queue: n };
    function s(f) {
      u += "	".repeat(f), o += r.tabWidth * f;
    }
    function a(f) {
      u += " ".repeat(f), o += f;
    }
    function c() {
      r.useTabs ? p() : l();
    }
    function p() {
      i2 > 0 && s(i2), m();
    }
    function l() {
      D > 0 && a(D), m();
    }
    function m() {
      i2 = 0, D = 0;
    }
  }
  function Xr(t, e, r) {
    if (!e) return t;
    if (e.type === "root") return { ...t, root: t };
    if (e === Number.NEGATIVE_INFINITY) return t.root;
    let n;
    return typeof e == "number" ? e < 0 ? n = Do : n = { type: 2, width: e } : n = { type: 3, string: e }, qr(t, n, r);
  }
  function Qr(t, e) {
    return qr(t, so, e);
  }
  function ao(t) {
    let e = 0;
    for (let r = t.length - 1; r >= 0; r--) {
      let n = t[r];
      if (n === " " || n === "	") e++;
      else break;
    }
    return e;
  }
  function et(t) {
    let e = ao(t);
    return { text: e === 0 ? t : t.slice(0, t.length - e), count: e };
  }
  var Rt = class {
    #t = [];
    #e = "";
    #n = 0;
    #u = [];
    #r = [];
    #o() {
      let e = this.#e;
      e !== "" && (this.#t.push(e), this.#n += e.length, this.#e = "");
      for (let r of this.#r) this.#u.push(Math.min(r, this.#n));
      this.#r.length = 0;
    }
    markPosition() {
      if (this.#u.length + this.#r.length >= 2) throw new Error("There are too many 'cursor' in doc.");
      this.#r.push(this.#n + this.#e.length);
    }
    write(e) {
      this.#e += e;
    }
    trim() {
      let { text: e, count: r } = et(this.#e);
      return this.#e = e, this.#o(), r;
    }
    finish() {
      return this.#o(), { text: this.#t.join(""), positions: this.#u };
    }
  };
  var Zr = Rt;
  var K = /* @__PURE__ */ Symbol("MODE_BREAK");
  var Q = /* @__PURE__ */ Symbol("MODE_FLAT");
  var vt = /* @__PURE__ */ Symbol("DOC_FILL_PRINTED_LENGTH");
  function tt(t, e, r, n, u, o) {
    if (r === Number.POSITIVE_INFINITY) return true;
    let i2 = e.length, D = false, s = [t], a = "";
    for (; r >= 0; ) {
      if (s.length === 0) {
        if (i2 === 0) return true;
        s.push(e[--i2]);
        continue;
      }
      let { mode: c, doc: p } = s.pop(), l = q(p);
      switch (l) {
        case G:
          p && (D && (a += " ", r -= 1, D = false), a += p, r -= Re(p));
          break;
        case U:
        case S: {
          let m = l === U ? p : p.parts, f = p[vt] ?? 0;
          for (let F = m.length - 1; F >= f; F--) s.push({ mode: c, doc: m[F] });
          break;
        }
        case I:
        case R:
        case L:
        case b:
          s.push({ mode: c, doc: p.contents });
          break;
        case v: {
          let { text: m, count: f } = et(a);
          a = m, r += f;
          break;
        }
        case x: {
          if (o && p.break) return false;
          let m = p.break ? K : c, f = p.expandedStates && m === K ? y(0, p.expandedStates, -1) : p.contents;
          s.push({ mode: m, doc: f });
          break;
        }
        case T: {
          let f = (p.groupId ? u[p.groupId] || Q : c) === K ? p.breakContents : p.flatContents;
          f && s.push({ mode: c, doc: f });
          break;
        }
        case g:
          if (c === K || p.hard) return true;
          p.soft || (D = true);
          break;
        case M:
          n = true;
          break;
        case Y:
          if (n) return false;
          break;
      }
    }
    return false;
  }
  function Ce(t, e) {
    let r = /* @__PURE__ */ Object.create(null), n = e.printWidth, u = we(e.endOfLine), o = 0, i2 = [{ indent: It, mode: K, doc: t }], D = false, s = [], a = new Zr();
    for (Br(t); i2.length > 0; ) {
      let { indent: f, mode: F, doc: d } = i2.pop();
      switch (q(d)) {
        case G: {
          let E = u !== `
` ? ne(0, d, `
`, u) : d;
          E && (a.write(E), i2.length > 0 && (o += Re(E)));
          break;
        }
        case U:
          for (let E = d.length - 1; E >= 0; E--) i2.push({ indent: f, mode: F, doc: d[E] });
          break;
        case V:
          a.markPosition();
          break;
        case I:
          i2.push({ indent: Qr(f, e), mode: F, doc: d.contents });
          break;
        case R:
          i2.push({ indent: Xr(f, d.n, e), mode: F, doc: d.contents });
          break;
        case v:
          o -= a.trim();
          break;
        case x: {
          let E = (function() {
            if (F === Q && !D) return { indent: f, mode: d.break ? K : Q, doc: d.contents };
            D = false;
            let h = n - o, _ = s.length > 0, P = { indent: f, mode: Q, doc: d.contents };
            if (!d.break && tt(P, i2, h, _, r)) return P;
            if (!d.expandedStates) return { indent: f, mode: K, doc: d.contents };
            if (!d.break) for (let A = 1; A < d.expandedStates.length - 1; A++) {
              let B = { indent: f, mode: Q, doc: d.expandedStates[A] };
              if (tt(B, i2, h, _, r)) return B;
            }
            return { indent: f, mode: K, doc: y(0, d.expandedStates, -1) };
          })();
          i2.push(E), d.id && (r[d.id] = E.mode);
          break;
        }
        case S: {
          let E = n - o, C2 = d[vt] ?? 0, { parts: h } = d, _ = h.length - C2;
          if (_ === 0) break;
          let P = h[C2 + 0], A = h[C2 + 1], B = { indent: f, mode: Q, doc: P }, J = { indent: f, mode: K, doc: P }, $e = tt(B, [], E, s.length > 0, r, true);
          if (_ === 1) {
            $e ? i2.push(B) : i2.push(J);
            break;
          }
          let lr = { indent: f, mode: Q, doc: A }, _t = { indent: f, mode: K, doc: A };
          if (_ === 2) {
            $e ? i2.push(lr, B) : i2.push(_t, J);
            break;
          }
          let bu = h[C2 + 2], ku = { indent: f, mode: F, doc: { ...d, [vt]: C2 + 2 } }, Iu = tt({ indent: f, mode: Q, doc: [P, A, bu] }, [], E, s.length > 0, r, true);
          i2.push(ku), Iu ? i2.push(lr, B) : $e ? i2.push(_t, B) : i2.push(_t, J);
          break;
        }
        case T:
        case L: {
          let E = d.groupId ? r[d.groupId] : F;
          if (E === K) {
            let C2 = d.type === T ? d.breakContents : d.negate ? d.contents : oe(d.contents);
            C2 && i2.push({ indent: f, mode: F, doc: C2 });
          }
          if (E === Q) {
            let C2 = d.type === T ? d.flatContents : d.negate ? oe(d.contents) : d.contents;
            C2 && i2.push({ indent: f, mode: F, doc: C2 });
          }
          break;
        }
        case M:
          s.push({ indent: f, mode: F, doc: d.contents });
          break;
        case Y:
          s.length > 0 && i2.push({ indent: f, mode: F, doc: ke });
          break;
        case g:
          switch (F) {
            case Q:
              if (!d.hard) {
                d.soft || (a.write(" "), o += 1);
                break;
              }
              D = true;
            case K:
              if (s.length > 0) {
                i2.push({ indent: f, mode: F, doc: d }, ...s.reverse()), s.length = 0;
                break;
              }
              d.literal ? (a.write(u), o = 0, f.root && (f.root.value && a.write(f.root.value), o = f.root.length)) : (a.trim(), a.write(u + f.value), o = f.length);
              break;
          }
          break;
        case b:
          i2.push({ indent: f, mode: F, doc: d.contents });
          break;
        case N:
          break;
        default:
          throw new Z(d);
      }
      i2.length === 0 && s.length > 0 && (i2.push(...s.reverse()), s.length = 0);
    }
    let { text: c, positions: p } = a.finish();
    if (p.length !== 2) return { formatted: c };
    let [l, m] = p;
    return { formatted: c, cursorNodeStart: l, cursorNodeText: c.slice(l, m) };
  }
  function co(t, e, r = 0) {
    let n = 0;
    for (let u = r; u < t.length; ++u) t[u] === "	" ? n = n + e - n % e : n++;
    return n;
  }
  var he = co;
  var Lt = class {
    constructor(e) {
      this.stack = [e];
    }
    get key() {
      let { stack: e, siblings: r } = this;
      return y(0, e, r === null ? -2 : -4) ?? null;
    }
    get index() {
      return this.siblings === null ? null : y(0, this.stack, -2);
    }
    get node() {
      return y(0, this.stack, -1);
    }
    get parent() {
      return this.getNode(1);
    }
    get grandparent() {
      return this.getNode(2);
    }
    get isInArray() {
      return this.siblings !== null;
    }
    get siblings() {
      let { stack: e } = this, r = y(0, e, -3);
      return Array.isArray(r) ? r : null;
    }
    get next() {
      let { siblings: e } = this;
      return e === null ? null : e[this.index + 1];
    }
    get previous() {
      let { siblings: e } = this;
      return e === null ? null : e[this.index - 1];
    }
    get isFirst() {
      return this.index === 0;
    }
    get isLast() {
      let { siblings: e, index: r } = this;
      return e !== null && r === e.length - 1;
    }
    get isRoot() {
      return this.stack.length === 1;
    }
    get root() {
      return this.stack[0];
    }
    get ancestors() {
      return [...this.#e()];
    }
    getName() {
      let { stack: e } = this, { length: r } = e;
      return r > 1 ? y(0, e, -2) : null;
    }
    getValue() {
      return y(0, this.stack, -1);
    }
    getNode(e = 0) {
      let r = this.#t(e);
      return r === -1 ? null : this.stack[r];
    }
    getParentNode(e = 0) {
      return this.getNode(e + 1);
    }
    #t(e) {
      let { stack: r } = this;
      for (let n = r.length - 1; n >= 0; n -= 2) if (!Array.isArray(r[n]) && --e < 0) return n;
      return -1;
    }
    call(e, ...r) {
      let { stack: n } = this, { length: u } = n, o = y(0, n, -1);
      for (let i2 of r) o = o?.[i2], n.push(i2, o);
      try {
        return e(this);
      } finally {
        n.length = u;
      }
    }
    callParent(e, r = 0) {
      let n = this.#t(r + 1), u = this.stack.splice(n + 1);
      try {
        return e(this);
      } finally {
        this.stack.push(...u);
      }
    }
    each(e, ...r) {
      let { stack: n } = this, { length: u } = n, o = y(0, n, -1);
      for (let i2 of r) o = o[i2], n.push(i2, o);
      try {
        for (let i2 = 0; i2 < o.length; ++i2) n.push(i2, o[i2]), e(this, i2, o), n.length -= 2;
      } finally {
        n.length = u;
      }
    }
    map(e, ...r) {
      let n = [];
      return this.each((u, o, i2) => {
        n[o] = e(u, o, i2);
      }, ...r), n;
    }
    match(...e) {
      let r = this.stack.length - 1, n = null, u = this.stack[r--];
      for (let o of e) {
        if (u === void 0) return false;
        let i2 = null;
        if (typeof n == "number" && (i2 = n, n = this.stack[r--], u = this.stack[r--]), o && !o(u, n, i2)) return false;
        n = this.stack[r--], u = this.stack[r--];
      }
      return true;
    }
    findAncestor(e) {
      for (let r of this.#e()) if (e(r)) return r;
    }
    hasAncestor(e) {
      for (let r of this.#e()) if (e(r)) return true;
      return false;
    }
    *#e() {
      let { stack: e } = this;
      for (let r = e.length - 3; r >= 0; r -= 2) {
        let n = e[r];
        Array.isArray(n) || (yield n);
      }
    }
  };
  var en = Lt;
  function fo(t) {
    return Array.isArray(t) && t.length > 0;
  }
  var rt = fo;
  function lo(t) {
    return t !== null && typeof t == "object";
  }
  var ge = lo;
  function _e(t) {
    return (e, r, n) => {
      if (r === false) return false;
      let u = !!n?.backwards, { length: o } = e, i2 = r;
      for (; i2 >= 0 && i2 < o; ) {
        let D = e.charAt(i2);
        if (t instanceof RegExp) {
          if (!t.test(D)) return i2;
        } else if (!t.includes(D)) return i2;
        u ? i2-- : i2++;
      }
      return i2 === -1 || i2 === o ? i2 : false;
    };
  }
  var tn = _e(/\s/);
  var j = _e(" 	");
  var nt = _e(",; 	");
  var ut = _e(/[^\n\r]/);
  var rn = (t) => t === `
` || t === "\r" || t === "\u2028" || t === "\u2029";
  function po(t, e, r) {
    if (e === false) return false;
    let n = !!r?.backwards, u = t.charAt(e);
    if (n) {
      if (t.charAt(e - 1) === "\r" && u === `
`) return e - 2;
      if (rn(u)) return e - 1;
    } else {
      if (u === "\r" && t.charAt(e + 1) === `
`) return e + 2;
      if (rn(u)) return e + 1;
    }
    return e;
  }
  var $ = po;
  function mo(t, e, r = {}) {
    let n = j(t, r.backwards ? e - 1 : e, r), u = $(t, n, r);
    return n !== u;
  }
  var H = mo;
  function* ye(t, e) {
    let { getVisitorKeys: r, filter: n = () => true } = e, u = (o) => ge(o) && n(o);
    for (let o of r(t)) {
      let i2 = t[o];
      if (Array.isArray(i2)) for (let D of i2) u(D) && (yield D);
      else u(i2) && (yield i2);
    }
  }
  function* nn(t, e) {
    let r = [t];
    for (let n = 0; n < r.length; n++) {
      let u = r[n];
      for (let o of ye(u, e)) yield o, r.push(o);
    }
  }
  function un(t, e) {
    return ye(t, e).next().done;
  }
  function Fo(t, e, r) {
    let { filter: n } = r;
    if (!n) return [];
    let u, o = (r.getChildren?.(t, r) ?? [...ye(t, { getVisitorKeys: r.getVisitorKeys })]).flatMap((s) => (u ?? (u = [t, ...e]), n(s, u) ? [s] : on(s, u, r))), { locStart: i2, locEnd: D } = r;
    return o.sort((s, a) => i2(s) - i2(a) || D(s) - D(a)), o;
  }
  function on(t, e, r) {
    return Fe(r.cache, t, (n) => Fo(n, e, r));
  }
  var ot = on;
  function Eo(t) {
    let e = t.type || t.kind || "(unknown type)", r = String(t.name || t.id && (typeof t.id == "object" ? t.id.name : t.id) || t.key && (typeof t.key == "object" ? t.key.name : t.key) || t.value && (typeof t.value == "object" ? "" : String(t.value)) || t.operator || "");
    return r.length > 20 && (r = r.slice(0, 19) + "\u2026"), e + (r ? " " + r : "");
  }
  function Mt(t, e) {
    (t.comments ?? (t.comments = [])).push(e), e.printed = false, e.nodeDescription = Eo(t);
  }
  function ce(t, e) {
    e.leading = true, e.trailing = false, Mt(t, e);
  }
  function re(t, e, r) {
    e.leading = false, e.trailing = false, r && (e.marker = r), Mt(t, e);
  }
  function fe(t, e) {
    e.leading = false, e.trailing = true, Mt(t, e);
  }
  var Ut = /* @__PURE__ */ new WeakMap();
  function Dn(t, e, r, n, u = []) {
    let { locStart: o, locEnd: i2 } = r, D = o(e), s = i2(e), a = ot(t, u, { cache: Ut, locStart: o, locEnd: i2, getVisitorKeys: r.getVisitorKeys, filter: r.printer.canAttachComment, getChildren: r.printer.getCommentChildNodes }), c, p, l = 0, m = a.length;
    for (; l < m; ) {
      let f = l + m >> 1, F = a[f], d = o(F), E = i2(F);
      if (d <= D && s <= E) return Dn(F, e, r, F, [F, ...u]);
      if (E <= D) {
        c = F, l = f + 1;
        continue;
      }
      if (s <= d) {
        p = F, m = f;
        continue;
      }
      throw new Error("Comment location overlaps with node location");
    }
    if (n?.type === "TemplateLiteral") {
      let { quasis: f } = n, F = jt(f, e, r);
      c && jt(f, c, r) !== F && (c = null), p && jt(f, p, r) !== F && (p = null);
    }
    return { enclosingNode: n, precedingNode: c, followingNode: p };
  }
  var Yt = () => false;
  function an(t, e) {
    let { comments: r } = t;
    if (delete t.comments, !rt(r) || !e.printer.canAttachComment) return;
    let n = [], { printer: { features: { experimental_avoidAstMutation: u }, handleComments: o = {} }, originalText: i2 } = e, { ownLine: D = Yt, endOfLine: s = Yt, remaining: a = Yt } = o, c = r.map((l, m) => ({ ...Dn(t, l, e), comment: l, text: i2, options: e, ast: t, isLastComment: r.length - 1 === m, placement: void 0 })), p = !u;
    for (let [l, m] of c.entries()) {
      let { comment: f, precedingNode: F, enclosingNode: d, followingNode: E, text: C2, options: h, ast: _, isLastComment: P } = m, A = Co(C2, h, c, l) ? "ownLine" : ho(C2, h, c, l) ? "endOfLine" : "remaining", B;
      if (u ? (m.placement = A, B = [m]) : B = [f, C2, h, _, P], p && (f.placement = A, f.enclosingNode = d, f.precedingNode = F, f.followingNode = E), A === "ownLine") D(...B) || (E ? ce(E, f) : F ? fe(F, f) : d ? re(d, f) : re(_, f));
      else if (A === "endOfLine") s(...B) || (F ? fe(F, f) : E ? ce(E, f) : d ? re(d, f) : re(_, f));
      else if (!a(...B)) if (F && E) {
        let J = n.length;
        J > 0 && n[J - 1].followingNode !== E && sn(n, h), n.push(m);
      } else F ? fe(F, f) : E ? ce(E, f) : d ? re(d, f) : re(_, f);
    }
    if (sn(n, e), p) for (let l of r) delete l.precedingNode, delete l.enclosingNode, delete l.followingNode, delete l.placement;
  }
  var cn = (t) => !/[\S\n\u2028\u2029]/.test(t);
  function Co(t, e, r, n) {
    let { comment: u, precedingNode: o } = r[n], { locStart: i2, locEnd: D } = e, s = i2(u);
    if (o) for (let a = n - 1; a >= 0; a--) {
      let { comment: c, precedingNode: p } = r[a];
      if (p !== o || !cn(t.slice(D(c), s))) break;
      s = i2(c);
    }
    return H(t, s, { backwards: true });
  }
  function ho(t, e, r, n) {
    let { comment: u, followingNode: o } = r[n], { locStart: i2, locEnd: D } = e, s = D(u);
    if (o) for (let a = n + 1; a < r.length; a++) {
      let { comment: c, followingNode: p } = r[a];
      if (p !== o || !cn(t.slice(s, i2(c)))) break;
      s = D(c);
    }
    return H(t, s);
  }
  function sn(t, e) {
    let r = t.length;
    if (r === 0) return;
    let { precedingNode: n, followingNode: u } = t[0], o = e.locStart(u), i2;
    for (i2 = r; i2 > 0; --i2) {
      let { comment: D, precedingNode: s, followingNode: a } = t[i2 - 1];
      k(s, n), k(a, u);
      let c = e.originalText.slice(e.locEnd(D), o);
      if (e.printer.isGap?.(c, e) ?? /^[\s(]*$/.test(c)) o = e.locStart(D);
      else break;
    }
    for (let [D, { comment: s }] of t.entries()) D < i2 ? fe(n, s) : ce(u, s);
    for (let D of [n, u]) D.comments && D.comments.length > 1 && D.comments.sort((s, a) => e.locStart(s) - e.locStart(a));
    t.length = 0;
  }
  function jt(t, e, r) {
    let n = r.locStart(e) - 1;
    for (let u = 1; u < t.length; ++u) if (n < r.locStart(t[u])) return u - 1;
    return 0;
  }
  function go(t, e) {
    let r = e - 1;
    r = j(t, r, { backwards: true }), r = $(t, r, { backwards: true }), r = j(t, r, { backwards: true });
    let n = $(t, r, { backwards: true });
    return r !== n;
  }
  var ve = go;
  var fn = () => true;
  function ln(t, e) {
    let r = t.node;
    return r.printed = true, e.printer.printComment(t, e);
  }
  function _o(t, e) {
    let r = t.node, n = [ln(t, e)], { printer: u, originalText: o, locStart: i2, locEnd: D } = e;
    if (u.isBlockComment?.(r)) {
      let c = " ";
      H(o, D(r)) && (H(o, i2(r), { backwards: true }) ? c = W : c = Ze), n.push(c);
    } else n.push(W);
    let a = $(o, j(o, D(r)));
    return a !== false && H(o, a) && n.push(W), n;
  }
  function yo(t, e, r) {
    let n = t.node, u = ln(t, e), { printer: o, originalText: i2, locStart: D } = e, s = o.isBlockComment?.(n);
    if (r?.hasLineSuffix && !r?.isBlock || H(i2, D(n), { backwards: true })) {
      let a = ve(i2, D(n));
      return { doc: Ie([W, a ? W : "", u]), isBlock: s, hasLineSuffix: true };
    }
    return !s || r?.hasLineSuffix ? { doc: [Ie([" ", u]), ae], isBlock: s, hasLineSuffix: true } : { doc: [" ", u], isBlock: s, hasLineSuffix: false };
  }
  function Ao(t, e, r) {
    let n = e[/* @__PURE__ */ Symbol.for("printedComments")], u = r?.filter ?? fn, o = new Set(t.node?.comments?.filter((i2) => !n?.has(i2) && i2.leading && u(i2)));
    return o.size === 0 ? "" : t.map(({ node: i2 }) => o.has(i2) ? _o(t, e) : "", "comments").filter(Boolean);
  }
  function xo(t, e, r) {
    let n = t.node?.comments, u = new Set(n?.filter((c) => c.trailing)), o = e[/* @__PURE__ */ Symbol.for("printedComments")], i2 = r?.filter ?? fn, D = new Set(n?.filter((c) => u.has(c) && !o?.has(c) && i2(c)));
    if (D.size === 0) return "";
    let s = [], a;
    return t.each(({ node: c }) => {
      u.has(c) && (a = yo(t, e, a), D.has(c) && s.push(a.doc));
    }, "comments"), s;
  }
  function pn(t, e, r, n) {
    let u = Ao(t, r, n), o = xo(t, r, n);
    return u || o ? Ee(e, (i2) => [u, i2, o]) : e;
  }
  function mn(t) {
    let { [ue]: e, [/* @__PURE__ */ Symbol.for("printedComments")]: r } = t;
    for (let n of e) {
      if (!n.printed && !r.has(n)) throw new Error('Comment "' + n.value.trim() + '" was not printed. Please report this error!');
      delete n.printed;
    }
  }
  var dn = () => k;
  var Le = class extends Error {
    name = "ConfigError";
  };
  var Me = class extends Error {
    name = "UndefinedParserError";
  };
  var Bo = Object.hasOwn ?? Function.prototype.call.bind(Object.prototype.hasOwnProperty);
  var le = Bo;
  var Fn = { checkIgnorePragma: { category: "Special", type: "boolean", default: false, description: "Check whether the file's first docblock comment contains '@noprettier' or '@noformat' to determine if it should be formatted.", cliCategory: "Other" }, cursorOffset: { category: "Special", type: "int", default: -1, range: { start: -1, end: 1 / 0, step: 1 }, description: "Print (to stderr) where a cursor at the given position would move to after formatting.", cliCategory: "Editor" }, endOfLine: { category: "Global", type: "choice", default: "lf", description: "Which end of line characters to apply.", choices: [{ value: "lf", description: "Line Feed only (\\n), common on Linux and macOS as well as inside git repos" }, { value: "crlf", description: "Carriage Return + Line Feed characters (\\r\\n), common on Windows" }, { value: "cr", description: "Carriage Return character only (\\r), used very rarely" }, { value: "auto", description: `Maintain existing
(mixed values within one file are normalised by looking at what's used after the first line)` }] }, filepath: { category: "Special", type: "path", description: "Specify the input filepath. This will be used to do parser inference.", cliName: "stdin-filepath", cliCategory: "Other", cliDescription: "Path to the file to pretend that stdin comes from." }, insertPragma: { category: "Special", type: "boolean", default: false, description: "Insert @format pragma into file's first docblock comment.", cliCategory: "Other" }, parser: { category: "Global", type: "choice", default: void 0, description: "Which parser to use.", exception: (t) => typeof t == "string" || typeof t == "function", choices: [{ value: "flow", description: "Flow" }, { value: "babel", description: "JavaScript" }, { value: "babel-flow", description: "Flow" }, { value: "babel-ts", description: "TypeScript" }, { value: "typescript", description: "TypeScript" }, { value: "acorn", description: "JavaScript" }, { value: "espree", description: "JavaScript" }, { value: "meriyah", description: "JavaScript" }, { value: "css", description: "CSS" }, { value: "less", description: "Less" }, { value: "scss", description: "SCSS" }, { value: "json", description: "JSON" }, { value: "json5", description: "JSON5" }, { value: "jsonc", description: "JSON with Comments" }, { value: "json-stringify", description: "JSON.stringify" }, { value: "graphql", description: "GraphQL" }, { value: "markdown", description: "Markdown" }, { value: "mdx", description: "MDX" }, { value: "vue", description: "Vue" }, { value: "yaml", description: "YAML" }, { value: "glimmer", description: "Ember / Handlebars" }, { value: "html", description: "HTML" }, { value: "angular", description: "Angular" }, { value: "lwc", description: "Lightning Web Components" }, { value: "mjml", description: "MJML" }] }, plugins: { type: "path", array: true, default: [{ value: [] }], category: "Global", description: "Add a plugin. Multiple plugins can be passed as separate `--plugin`s.", exception: (t) => typeof t == "string" || typeof t == "object", cliName: "plugin", cliCategory: "Config" }, printWidth: { category: "Global", type: "int", default: 80, description: "The line length where Prettier will try wrap.", range: { start: 0, end: 1 / 0, step: 1 } }, rangeEnd: { category: "Special", type: "int", default: 1 / 0, range: { start: 0, end: 1 / 0, step: 1 }, description: `Format code ending at a given character offset (exclusive).
The range will extend forwards to the end of the selected statement.`, cliCategory: "Editor" }, rangeStart: { category: "Special", type: "int", default: 0, range: { start: 0, end: 1 / 0, step: 1 }, description: `Format code starting at a given character offset.
The range will extend backwards to the start of the first line containing the selected statement.`, cliCategory: "Editor" }, requirePragma: { category: "Special", type: "boolean", default: false, description: "Require either '@prettier' or '@format' to be present in the file's first docblock comment in order for it to be formatted.", cliCategory: "Other" }, tabWidth: { type: "int", category: "Global", default: 2, description: "Number of spaces per indentation level.", range: { start: 0, end: 1 / 0, step: 1 } }, useTabs: { category: "Global", type: "boolean", default: false, description: "Indent with tabs instead of spaces." }, embeddedLanguageFormatting: { category: "Global", type: "choice", default: "auto", description: "Control how Prettier formats quoted code embedded in the file.", choices: [{ value: "auto", description: "Format embedded code if Prettier can automatically identify it." }, { value: "off", description: "Never automatically format embedded code." }] } };
  function it({ plugins: t = [], showDeprecated: e = false } = {}) {
    let r = t.flatMap((u) => u.languages ?? []), n = [];
    for (let u of No(Object.assign({}, ...t.map(({ options: o }) => o), Fn))) !e && u.deprecated || (Array.isArray(u.choices) && (e || (u.choices = u.choices.filter((o) => !o.deprecated)), u.name === "parser" && (u.choices = [...u.choices, ...To(u.choices, r, t)])), u.pluginDefaults = Object.fromEntries(t.filter((o) => o.defaultOptions?.[u.name] !== void 0).map((o) => [o.name, o.defaultOptions[u.name]])), n.push(u));
    return { languages: r, options: n };
  }
  function* To(t, e, r) {
    let n = new Set(t.map((u) => u.value));
    for (let u of e) if (u.parsers) {
      for (let o of u.parsers) if (!n.has(o)) {
        n.add(o);
        let i2 = r.find((s) => s.parsers && le(s.parsers, o)), D = u.name;
        i2?.name && (D += ` (plugin: ${i2.name})`), yield { value: o, description: D };
      }
    }
  }
  function No(t) {
    let e = [];
    for (let [r, n] of Object.entries(t)) {
      let u = { name: r, ...n };
      Array.isArray(u.default) && (u.default = y(0, u.default, -1).value), e.push(u);
    }
    return e;
  }
  var wo = Array.prototype.toReversed ?? function() {
    return [...this].reverse();
  };
  var Oo = X("toReversed", function() {
    if (Array.isArray(this)) return wo;
  });
  var En = Oo;
  function Po() {
    let t = globalThis, e = t.process?.platform;
    if (typeof e == "string") return e.startsWith("win");
    let r = t.Deno?.build?.os;
    return typeof r == "string" ? r === "windows" : t.navigator?.platform?.startsWith("Win") ?? false;
  }
  var So = Po();
  function Cn(t) {
    if (t = t instanceof URL ? t : new URL(t), t.protocol !== "file:") throw new TypeError(`URL must be a file URL: received "${t.protocol}"`);
    return t;
  }
  function bo(t) {
    return t = Cn(t), decodeURIComponent(t.pathname.replace(/%(?![0-9A-Fa-f]{2})/g, "%25"));
  }
  function ko(t) {
    t = Cn(t);
    let e = decodeURIComponent(t.pathname.replace(/\//g, "\\").replace(/%(?![0-9A-Fa-f]{2})/g, "%25")).replace(/^\\*([A-Za-z]:)(\\|$)/, "$1\\");
    return t.hostname !== "" && (e = `\\\\${t.hostname}${e}`), e;
  }
  function Vt(t) {
    return So ? ko(t) : bo(t);
  }
  var hn = (t) => String(t).split(/[/\\]/).pop();
  var gn = (t) => String(t).startsWith("file:");
  function _n(t, e) {
    if (!e) return;
    let r = hn(e).toLowerCase();
    return t.find(({ filenames: n }) => n?.some((u) => u.toLowerCase() === r)) ?? t.find(({ extensions: n }) => n?.some((u) => r.endsWith(u)));
  }
  function Io(t, e) {
    if (e) return t.find(({ name: r }) => r.toLowerCase() === e) ?? t.find(({ aliases: r }) => r?.includes(e)) ?? t.find(({ extensions: r }) => r?.includes(`.${e}`));
  }
  var Ro = void 0;
  function yn(t, e) {
    if (e) {
      if (gn(e)) try {
        e = Vt(e);
      } catch {
        return;
      }
      if (typeof e == "string") return t.find(({ isSupported: r }) => r?.({ filepath: e }));
    }
  }
  function vo(t, e) {
    let r = En(0, t.plugins).flatMap((u) => u.languages ?? []);
    return (Io(r, e.language) ?? _n(r, e.physicalFile) ?? _n(r, e.file) ?? yn(r, e.physicalFile) ?? yn(r, e.file) ?? Ro?.(r, e.physicalFile))?.parsers[0];
  }
  var st = vo;
  var ie = { key: (t) => /^[$_a-zA-Z][$_a-zA-Z0-9]*$/.test(t) ? t : JSON.stringify(t), value(t) {
    if (t === null || typeof t != "object") return JSON.stringify(t);
    if (Array.isArray(t)) return `[${t.map((r) => ie.value(r)).join(", ")}]`;
    let e = Object.keys(t);
    return e.length === 0 ? "{}" : `{ ${e.map((r) => `${ie.key(r)}: ${ie.value(t[r])}`).join(", ")} }`;
  }, pair: ({ key: t, value: e }) => ie.value({ [t]: e }) };
  var An = new Proxy(String, { get: () => An });
  var z = An;
  var xn = (t, e, { descriptor: r }) => {
    let n = [`${z.yellow(typeof t == "string" ? r.key(t) : r.pair(t))} is deprecated`];
    return e && n.push(`we now treat it as ${z.blue(typeof e == "string" ? r.key(e) : r.pair(e))}`), n.join("; ") + ".";
  };
  var Dt = /* @__PURE__ */ Symbol.for("vnopts.VALUE_NOT_EXIST");
  var Ae = /* @__PURE__ */ Symbol.for("vnopts.VALUE_UNCHANGED");
  var Bn = " ".repeat(2);
  var Nn = (t, e, r) => {
    let { text: n, list: u } = r.normalizeExpectedResult(r.schemas[t].expected(r)), o = [];
    return n && o.push(Tn(t, e, n, r.descriptor)), u && o.push([Tn(t, e, u.title, r.descriptor)].concat(u.values.map((i2) => wn(i2, r.loggerPrintWidth))).join(`
`)), On(o, r.loggerPrintWidth);
  };
  function Tn(t, e, r, n) {
    return [`Invalid ${z.red(n.key(t))} value.`, `Expected ${z.blue(r)},`, `but received ${e === Dt ? z.gray("nothing") : z.red(n.value(e))}.`].join(" ");
  }
  function wn({ text: t, list: e }, r) {
    let n = [];
    return t && n.push(`- ${z.blue(t)}`), e && n.push([`- ${z.blue(e.title)}:`].concat(e.values.map((u) => wn(u, r - Bn.length).replace(/^|\n/g, `$&${Bn}`))).join(`
`)), On(n, r);
  }
  function On(t, e) {
    if (t.length === 1) return t[0];
    let [r, n] = t, [u, o] = t.map((i2) => i2.split(`
`, 1)[0].length);
    return u > e && u > o ? n : r;
  }
  var xe = [];
  var Wt = [];
  function at(t, e, r) {
    if (t === e) return 0;
    let n = r?.maxDistance, u = t;
    t.length > e.length && (t = e, e = u);
    let o = t.length, i2 = e.length;
    for (; o > 0 && t.charCodeAt(~-o) === e.charCodeAt(~-i2); ) o--, i2--;
    let D = 0;
    for (; D < o && t.charCodeAt(D) === e.charCodeAt(D); ) D++;
    if (o -= D, i2 -= D, n !== void 0 && i2 - o > n) return n;
    if (o === 0) return n !== void 0 && i2 > n ? n : i2;
    let s, a, c, p, l = 0, m = 0;
    for (; l < o; ) Wt[l] = t.charCodeAt(D + l), xe[l] = ++l;
    for (; m < i2; ) {
      for (s = e.charCodeAt(D + m), c = m++, a = m, l = 0; l < o; l++) p = s === Wt[l] ? c : c + 1, c = xe[l], a = xe[l] = c > a ? p > a ? a + 1 : p : p > c ? c + 1 : p;
      if (n !== void 0) {
        let f = a;
        for (l = 0; l < o; l++) xe[l] < f && (f = xe[l]);
        if (f > n) return n;
      }
    }
    return xe.length = o, Wt.length = o, n !== void 0 && a > n ? n : a;
  }
  function Pn(t, e, r) {
    if (!Array.isArray(e) || e.length === 0) return;
    let n = r?.maxDistance, u = t.length;
    for (let s of e) if (s === t) return s;
    if (n === 0) return;
    let o, i2 = Number.POSITIVE_INFINITY, D = /* @__PURE__ */ new Set();
    for (let s of e) {
      if (D.has(s)) continue;
      D.add(s);
      let a = Math.abs(s.length - u);
      if (a >= i2 || n !== void 0 && a > n) continue;
      let c = Number.isFinite(i2) ? n === void 0 ? i2 : Math.min(i2, n) : n, p = c === void 0 ? at(t, s) : at(t, s, { maxDistance: c });
      if (n !== void 0 && p > n) continue;
      let l = p;
      if (c !== void 0 && p === c && c === n && (l = at(t, s)), l < i2 && (i2 = l, o = s, i2 === 0)) break;
    }
    if (!(n !== void 0 && i2 > n)) return o;
  }
  var ct = (t, e, { descriptor: r, logger: n, schemas: u }) => {
    let o = [`Ignored unknown option ${z.yellow(r.pair({ key: t, value: e }))}.`], i2 = Pn(t, Object.keys(u), { maxDistance: 3 });
    i2 && o.push(`Did you mean ${z.blue(r.key(i2))}?`), n.warn(o.join(" "));
  };
  var Lo = ["default", "expected", "validate", "deprecated", "forward", "redirect", "overlap", "preprocess", "postprocess"];
  function Mo(t, e) {
    let r = new t(e), n = Object.create(r);
    for (let u of Lo) u in e && (n[u] = Yo(e[u], r, O.prototype[u].length));
    return n;
  }
  var O = class {
    static create(e) {
      return Mo(this, e);
    }
    constructor(e) {
      this.name = e.name;
    }
    default(e) {
    }
    expected(e) {
      return "nothing";
    }
    validate(e, r) {
      return false;
    }
    deprecated(e, r) {
      return false;
    }
    forward(e, r) {
    }
    redirect(e, r) {
    }
    overlap(e, r, n) {
      return e;
    }
    preprocess(e, r) {
      return e;
    }
    postprocess(e, r) {
      return Ae;
    }
  };
  function Yo(t, e, r) {
    return typeof t == "function" ? (...n) => t(...n.slice(0, r - 1), e, ...n.slice(r - 1)) : () => t;
  }
  var ft = class extends O {
    constructor(e) {
      super(e), this._sourceName = e.sourceName;
    }
    expected(e) {
      return e.schemas[this._sourceName].expected(e);
    }
    validate(e, r) {
      return r.schemas[this._sourceName].validate(e, r);
    }
    redirect(e, r) {
      return this._sourceName;
    }
  };
  var lt = class extends O {
    expected() {
      return "anything";
    }
    validate() {
      return true;
    }
  };
  var pt = class extends O {
    constructor({ valueSchema: e, name: r = e.name, ...n }) {
      super({ ...n, name: r }), this._valueSchema = e;
    }
    expected(e) {
      let { text: r, list: n } = e.normalizeExpectedResult(this._valueSchema.expected(e));
      return { text: r && `an array of ${r}`, list: n && { title: "an array of the following values", values: [{ list: n }] } };
    }
    validate(e, r) {
      if (!Array.isArray(e)) return false;
      let n = [];
      for (let u of e) {
        let o = r.normalizeValidateResult(this._valueSchema.validate(u, r), u);
        o !== true && n.push(o.value);
      }
      return n.length === 0 ? true : { value: n };
    }
    deprecated(e, r) {
      let n = [];
      for (let u of e) {
        let o = r.normalizeDeprecatedResult(this._valueSchema.deprecated(u, r), u);
        o !== false && n.push(...o.map(({ value: i2 }) => ({ value: [i2] })));
      }
      return n;
    }
    forward(e, r) {
      let n = [];
      for (let u of e) {
        let o = r.normalizeForwardResult(this._valueSchema.forward(u, r), u);
        n.push(...o.map(Sn));
      }
      return n;
    }
    redirect(e, r) {
      let n = [], u = [];
      for (let o of e) {
        let i2 = r.normalizeRedirectResult(this._valueSchema.redirect(o, r), o);
        "remain" in i2 && n.push(i2.remain), u.push(...i2.redirect.map(Sn));
      }
      return n.length === 0 ? { redirect: u } : { redirect: u, remain: n };
    }
    overlap(e, r) {
      return e.concat(r);
    }
  };
  function Sn({ from: t, to: e }) {
    return { from: [t], to: e };
  }
  var mt = class extends O {
    expected() {
      return "true or false";
    }
    validate(e) {
      return typeof e == "boolean";
    }
  };
  function kn(t, e) {
    let r = /* @__PURE__ */ Object.create(null);
    for (let n of t) {
      let u = n[e];
      if (r[u]) throw new Error(`Duplicate ${e} ${JSON.stringify(u)}`);
      r[u] = n;
    }
    return r;
  }
  function In(t, e) {
    let r = /* @__PURE__ */ new Map();
    for (let n of t) {
      let u = n[e];
      if (r.has(u)) throw new Error(`Duplicate ${e} ${JSON.stringify(u)}`);
      r.set(u, n);
    }
    return r;
  }
  function Rn() {
    let t = /* @__PURE__ */ Object.create(null);
    return (e) => {
      let r = JSON.stringify(e);
      return t[r] ? true : (t[r] = true, false);
    };
  }
  function vn(t, e) {
    let r = [], n = [];
    for (let u of t) e(u) ? r.push(u) : n.push(u);
    return [r, n];
  }
  function Ln(t) {
    return t === Math.floor(t);
  }
  function Mn(t, e) {
    if (t === e) return 0;
    let r = typeof t, n = typeof e, u = ["undefined", "object", "boolean", "number", "string"];
    return r !== n ? u.indexOf(r) - u.indexOf(n) : r !== "string" ? Number(t) - Number(e) : t.localeCompare(e);
  }
  function Yn(t) {
    return (...e) => {
      let r = t(...e);
      return typeof r == "string" ? new Error(r) : r;
    };
  }
  function $t(t) {
    return t === void 0 ? {} : t;
  }
  function zt(t) {
    if (typeof t == "string") return { text: t };
    let { text: e, list: r } = t;
    return jo((e || r) !== void 0, "Unexpected `expected` result, there should be at least one field."), r ? { text: e, list: { title: r.title, values: r.values.map(zt) } } : { text: e };
  }
  function Gt(t, e) {
    return t === true ? true : t === false ? { value: e } : t;
  }
  function Kt(t, e, r = false) {
    return t === false ? false : t === true ? r ? true : [{ value: e }] : "value" in t ? [t] : t.length === 0 ? false : t;
  }
  function bn(t, e) {
    return typeof t == "string" || "key" in t ? { from: e, to: t } : "from" in t ? { from: t.from, to: t.to } : { from: e, to: t.to };
  }
  function dt(t, e) {
    return t === void 0 ? [] : Array.isArray(t) ? t.map((r) => bn(r, e)) : [bn(t, e)];
  }
  function Ht(t, e) {
    let r = dt(typeof t == "object" && "redirect" in t ? t.redirect : t, e);
    return r.length === 0 ? { remain: e, redirect: r } : typeof t == "object" && "remain" in t ? { remain: t.remain, redirect: r } : { redirect: r };
  }
  function jo(t, e) {
    if (!t) throw new Error(e);
  }
  var Ft = class extends O {
    constructor(e) {
      super(e), this._choices = In(e.choices.map((r) => r && typeof r == "object" ? r : { value: r }), "value");
    }
    expected({ descriptor: e }) {
      let r = Array.from(this._choices.keys()).map((i2) => this._choices.get(i2)).filter(({ hidden: i2 }) => !i2).map((i2) => i2.value).sort(Mn).map(e.value), n = r.slice(0, -2), u = r.slice(-2);
      return { text: n.concat(u.join(" or ")).join(", "), list: { title: "one of the following values", values: r } };
    }
    validate(e) {
      return this._choices.has(e);
    }
    deprecated(e) {
      let r = this._choices.get(e);
      return r && r.deprecated ? { value: e } : false;
    }
    forward(e) {
      let r = this._choices.get(e);
      return r ? r.forward : void 0;
    }
    redirect(e) {
      let r = this._choices.get(e);
      return r ? r.redirect : void 0;
    }
  };
  var Et = class extends O {
    expected() {
      return "a number";
    }
    validate(e, r) {
      return typeof e == "number";
    }
  };
  var Ct = class extends Et {
    expected() {
      return "an integer";
    }
    validate(e, r) {
      return r.normalizeValidateResult(super.validate(e, r), e) === true && Ln(e);
    }
  };
  var Ye = class extends O {
    expected() {
      return "a string";
    }
    validate(e) {
      return typeof e == "string";
    }
  };
  var jn = ie;
  var Un = ct;
  var Vn = Nn;
  var Wn = xn;
  var ht = class {
    constructor(e, r) {
      let { logger: n = console, loggerPrintWidth: u = 80, descriptor: o = jn, unknown: i2 = Un, invalid: D = Vn, deprecated: s = Wn, missing: a = () => false, required: c = () => false, preprocess: p = (m) => m, postprocess: l = () => Ae } = r || {};
      this._utils = { descriptor: o, logger: n || { warn: () => {
      } }, loggerPrintWidth: u, schemas: kn(e, "name"), normalizeDefaultResult: $t, normalizeExpectedResult: zt, normalizeDeprecatedResult: Kt, normalizeForwardResult: dt, normalizeRedirectResult: Ht, normalizeValidateResult: Gt }, this._unknownHandler = i2, this._invalidHandler = Yn(D), this._deprecatedHandler = s, this._identifyMissing = (m, f) => !(m in f) || a(m, f), this._identifyRequired = c, this._preprocess = p, this._postprocess = l, this.cleanHistory();
    }
    cleanHistory() {
      this._hasDeprecationWarned = Rn();
    }
    normalize(e) {
      let r = {}, u = [this._preprocess(e, this._utils)], o = () => {
        for (; u.length !== 0; ) {
          let i2 = u.shift(), D = this._applyNormalization(i2, r);
          u.push(...D);
        }
      };
      o();
      for (let i2 of Object.keys(this._utils.schemas)) {
        let D = this._utils.schemas[i2];
        if (!(i2 in r)) {
          let s = $t(D.default(this._utils));
          "value" in s && u.push({ [i2]: s.value });
        }
      }
      o();
      for (let i2 of Object.keys(this._utils.schemas)) {
        if (!(i2 in r)) continue;
        let D = this._utils.schemas[i2], s = r[i2], a = D.postprocess(s, this._utils);
        a !== Ae && (this._applyValidation(a, i2, D), r[i2] = a);
      }
      return this._applyPostprocess(r), this._applyRequiredCheck(r), r;
    }
    _applyNormalization(e, r) {
      let n = [], { knownKeys: u, unknownKeys: o } = this._partitionOptionKeys(e);
      for (let i2 of u) {
        let D = this._utils.schemas[i2], s = D.preprocess(e[i2], this._utils);
        this._applyValidation(s, i2, D);
        let a = ({ from: m, to: f }) => {
          n.push(typeof f == "string" ? { [f]: m } : { [f.key]: f.value });
        }, c = ({ value: m, redirectTo: f }) => {
          let F = Kt(D.deprecated(m, this._utils), s, true);
          if (F !== false) if (F === true) this._hasDeprecationWarned(i2) || this._utils.logger.warn(this._deprecatedHandler(i2, f, this._utils));
          else for (let { value: d } of F) {
            let E = { key: i2, value: d };
            if (!this._hasDeprecationWarned(E)) {
              let C2 = typeof f == "string" ? { key: f, value: d } : f;
              this._utils.logger.warn(this._deprecatedHandler(E, C2, this._utils));
            }
          }
        };
        dt(D.forward(s, this._utils), s).forEach(a);
        let l = Ht(D.redirect(s, this._utils), s);
        if (l.redirect.forEach(a), "remain" in l) {
          let m = l.remain;
          r[i2] = i2 in r ? D.overlap(r[i2], m, this._utils) : m, c({ value: m });
        }
        for (let { from: m, to: f } of l.redirect) c({ value: m, redirectTo: f });
      }
      for (let i2 of o) {
        let D = e[i2];
        this._applyUnknownHandler(i2, D, r, (s, a) => {
          n.push({ [s]: a });
        });
      }
      return n;
    }
    _applyRequiredCheck(e) {
      for (let r of Object.keys(this._utils.schemas)) if (this._identifyMissing(r, e) && this._identifyRequired(r)) throw this._invalidHandler(r, Dt, this._utils);
    }
    _partitionOptionKeys(e) {
      let [r, n] = vn(Object.keys(e).filter((u) => !this._identifyMissing(u, e)), (u) => u in this._utils.schemas);
      return { knownKeys: r, unknownKeys: n };
    }
    _applyValidation(e, r, n) {
      let u = Gt(n.validate(e, this._utils), e);
      if (u !== true) throw this._invalidHandler(r, u.value, this._utils);
    }
    _applyUnknownHandler(e, r, n, u) {
      let o = this._unknownHandler(e, r, this._utils);
      if (o) for (let i2 of Object.keys(o)) {
        if (this._identifyMissing(i2, o)) continue;
        let D = o[i2];
        i2 in this._utils.schemas ? u(i2, D) : n[i2] = D;
      }
    }
    _applyPostprocess(e) {
      let r = this._postprocess(e, this._utils);
      if (r !== Ae) {
        if (r.delete) for (let n of r.delete) delete e[n];
        if (r.override) {
          let { knownKeys: n, unknownKeys: u } = this._partitionOptionKeys(r.override);
          for (let o of n) {
            let i2 = r.override[o];
            this._applyValidation(i2, o, this._utils.schemas[o]), e[o] = i2;
          }
          for (let o of u) {
            let i2 = r.override[o];
            this._applyUnknownHandler(o, i2, e, (D, s) => {
              let a = this._utils.schemas[D];
              this._applyValidation(s, D, a), e[D] = s;
            });
          }
        }
      }
    }
  };
  var Jt;
  function Uo(t, e, { logger: r = false, isCLI: n = false, passThrough: u = false, FlagSchema: o, descriptor: i2 } = {}) {
    if (n) {
      if (!o) throw new Error("'FlagSchema' option is required.");
      if (!i2) throw new Error("'descriptor' option is required.");
    } else i2 = ie;
    let D = u ? Array.isArray(u) ? (l, m) => u.includes(l) ? { [l]: m } : void 0 : (l, m) => ({ [l]: m }) : (l, m, f) => {
      let { _: F, ...d } = f.schemas;
      return ct(l, m, { ...f, schemas: d });
    }, s = Vo(e, { isCLI: n, FlagSchema: o }), a = new ht(s, { logger: r, unknown: D, descriptor: i2 }), c = r !== false;
    c && Jt && (a._hasDeprecationWarned = Jt);
    let p = a.normalize(t);
    return c && (Jt = a._hasDeprecationWarned), p;
  }
  function Vo(t, { isCLI: e, FlagSchema: r }) {
    let n = [];
    e && n.push(lt.create({ name: "_" }));
    for (let u of t) n.push(Wo(u, { isCLI: e, optionInfos: t, FlagSchema: r })), u.alias && e && n.push(ft.create({ name: u.alias, sourceName: u.name }));
    return n;
  }
  function Wo(t, { isCLI: e, optionInfos: r, FlagSchema: n }) {
    let { name: u } = t, o = { name: u }, i2, D = {};
    switch (t.type) {
      case "int":
        i2 = Ct, e && (o.preprocess = Number);
        break;
      case "string":
        i2 = Ye;
        break;
      case "choice":
        i2 = Ft, o.choices = t.choices.map((s) => s?.redirect ? { ...s, redirect: { to: { key: t.name, value: s.redirect } } } : s);
        break;
      case "boolean":
        i2 = mt;
        break;
      case "flag":
        i2 = n, o.flags = r.flatMap((s) => [s.alias, s.description && s.name, s.oppositeDescription && `no-${s.name}`].filter(Boolean));
        break;
      case "path":
        i2 = Ye;
        break;
      default:
        throw new Error(`Unexpected type ${t.type}`);
    }
    if (t.exception ? o.validate = (s, a, c) => t.exception(s) || a.validate(s, c) : o.validate = (s, a, c) => s === void 0 || a.validate(s, c), t.redirect && (D.redirect = (s) => s ? { to: typeof t.redirect == "string" ? t.redirect : { key: t.redirect.option, value: t.redirect.value } } : void 0), t.deprecated && (D.deprecated = true), e && !t.array) {
      let s = o.preprocess || ((a) => a);
      o.preprocess = (a, c, p) => c.preprocess(s(Array.isArray(a) ? y(0, a, -1) : a), p);
    }
    return t.array ? pt.create({ ...e ? { preprocess: (s) => Array.isArray(s) ? s : [s] } : {}, ...D, valueSchema: i2.create(o) }) : i2.create({ ...o, ...D });
  }
  var $n = Uo;
  var $o = Array.prototype.findLast ?? function(t) {
    for (let e = this.length - 1; e >= 0; e--) {
      let r = this[e];
      if (t(r, e, this)) return r;
    }
  };
  var zo = X("findLast", function() {
    if (Array.isArray(this)) return $o;
  });
  var qt = zo;
  var zn = /* @__PURE__ */ Symbol.for("PRETTIER_IS_FRONT_MATTER");
  var Xt = [];
  function Go(t) {
    return !!t?.[zn];
  }
  var pe = Go;
  var Gn = /* @__PURE__ */ new Set(["yaml", "toml"]);
  var je = ({ node: t }) => pe(t) && Gn.has(t.language);
  async function Qt(t, e, r, n) {
    let { node: u } = r, { language: o } = u;
    if (!Gn.has(o)) return;
    let i2 = u.value.trim(), D;
    if (i2) {
      let s = o === "yaml" ? o : st(n, { language: o });
      if (!s) return;
      D = i2 ? await t(i2, { parser: s }) : "";
    } else D = i2;
    return Xe([u.startDelimiter, u.explicitLanguage ?? "", W, D, D ? W : "", u.endDelimiter]);
  }
  function Ko(t, e) {
    return je({ node: t }) && (delete e.end, delete e.raw, delete e.value), e;
  }
  var Zt = Ko;
  function Ho({ node: t }) {
    return t.raw;
  }
  var er = Ho;
  var Kn = /* @__PURE__ */ new Set(["tokens", "comments", "parent", "enclosingNode", "precedingNode", "followingNode"]);
  var Jo = (t) => Object.keys(t).filter((e) => !Kn.has(e));
  function qo(t, e) {
    let r = t ? (n) => t(n, Kn) : Jo;
    return e ? new Proxy(r, { apply: (n, u, o) => pe(o[0]) ? Xt : Reflect.apply(n, u, o) }) : r;
  }
  var tr = qo;
  function rr(t, e) {
    if (!e) throw new Error("parserName is required.");
    let r = qt(0, t, (u) => u.parsers && le(u.parsers, e));
    if (r) return r;
    let n = `Couldn't resolve parser "${e}".`;
    throw n += " Plugins must be explicitly added to the standalone bundle.", new Le(n);
  }
  function Hn(t, e) {
    if (!e) throw new Error("astFormat is required.");
    let r = qt(0, t, (u) => u.printers && le(u.printers, e));
    if (r) return r;
    let n = `Couldn't find plugin for AST format "${e}".`;
    throw n += " Plugins must be explicitly added to the standalone bundle.", new Le(n);
  }
  function Ue({ plugins: t, parser: e }) {
    let r = rr(t, e);
    return nr(r, e);
  }
  function nr(t, e) {
    let r = t.parsers[e];
    return typeof r == "function" ? r() : r;
  }
  async function Jn(t, e) {
    let r = t.printers[e], n = typeof r == "function" ? await r() : r;
    return Zo(n);
  }
  function Xo(t) {
    let { features: e, getVisitorKeys: r, embed: n, massageAstNode: u, print: o, ...i2 } = t;
    e = ni(e);
    let D = e.experimental_frontMatterSupport;
    r = tr(r, D.massageAstNode || D.embed || D.print);
    let s = u;
    u && D.massageAstNode && (s = new Proxy(u, { apply(l, m, f) {
      return Zt(...f), Reflect.apply(l, m, f);
    } }));
    let a = n;
    if (n) {
      let l;
      a = new Proxy(n, { get(m, f, F) {
        return f === "getVisitorKeys" ? (l ?? (l = n.getVisitorKeys ? tr(n.getVisitorKeys, D.massageAstNode || D.embed) : r), l) : Reflect.get(m, f, F);
      }, apply: (m, f, F) => D.embed && je(...F) ? Qt : Reflect.apply(m, f, F) });
    }
    let c = o;
    return D.print && (c = new Proxy(o, { apply(l, m, f) {
      let [F] = f;
      return pe(F.node) ? er(F) : Reflect.apply(l, m, f);
    } })), { features: e, getVisitorKeys: r, embed: a, massageAstNode: s, print: c, ...i2 };
  }
  var Qo = /* @__PURE__ */ new WeakMap();
  function Zo(t) {
    return Fe(Qo, t, Xo);
  }
  var ei = ["clean", "embed", "print"];
  var ti = Object.fromEntries(ei.map((t) => [t, false]));
  function ri(t) {
    return { ...ti, ...t };
  }
  function ni(t) {
    return { experimental_avoidAstMutation: false, ...t, experimental_frontMatterSupport: ri(t?.experimental_frontMatterSupport) };
  }
  var qn = { astFormat: "estree", printer: {}, originalText: void 0, locStart: null, locEnd: null, getVisitorKeys: null };
  async function ui(t, e = {}) {
    let r = { ...t };
    if (!r.parser) {
      if (!r.filepath) throw new Me("No parser and no file path given, couldn't infer a parser.");
      if (r.parser = st(r, { physicalFile: r.filepath }), !r.parser) throw new Me(`No parser could be inferred for file "${r.filepath}".`);
    }
    let n = it({ plugins: t.plugins, showDeprecated: true }).options, u = { ...qn, ...Object.fromEntries(n.filter((p) => p.default !== void 0).map((p) => [p.name, p.default])) }, o = rr(r.plugins, r.parser), i2 = await nr(o, r.parser);
    r.astFormat = i2.astFormat, r.locEnd = i2.locEnd, r.locStart = i2.locStart;
    let D = o.printers?.[i2.astFormat] ? o : Hn(r.plugins, i2.astFormat), s = await Jn(D, i2.astFormat);
    r.printer = s, r.getVisitorKeys = s.getVisitorKeys;
    let a = D.defaultOptions ? Object.fromEntries(Object.entries(D.defaultOptions).filter(([, p]) => p !== void 0)) : {}, c = { ...u, ...a };
    for (let [p, l] of Object.entries(c)) r[p] ?? (r[p] = l);
    return r.parser === "json" && (r.trailingComma = "none"), $n(r, n, { passThrough: Object.keys(qn), ...e });
  }
  var se = ui;
  var Xn = /\r\n|[\n\r\u2028\u2029]/;
  function oi(t, e, r, n) {
    let u = { column: null, line: -1, ...t.start }, o = { ...u, ...t.end }, { linesAbove: i2 = 2, linesBelow: D = 3 } = r || {}, s = u.line - n, a = u.column, c = o.line - n, p = o.column, l = Math.max(s - (i2 + 1), 0), m = Math.min(e.length, c + D);
    s === -1 && (l = 0), c === -1 && (m = e.length);
    let f = c - s, F = {};
    if (f) for (let d = 0; d <= f; d++) {
      let E = d + s;
      if (a == null) F[E] = true;
      else if (d === 0) {
        let C2 = e[E - 1].length;
        F[E] = [a, C2 - a];
      } else if (d === f) F[E] = [0, p];
      else {
        let C2 = e[E - 1].length;
        F[E] = [0, C2];
      }
    }
    else if (a === p) a != null ? F[s] = [a, 0] : F[s] = true;
    else {
      let d = a ?? 0, E = p ?? d;
      F[s] = [d, E - d];
    }
    return { start: l, end: m, markerLines: F };
  }
  function Qn(t, e, r = {}, n) {
    let { defs: u, highlight: o } = n || { defs: { gutter: String, marker: String, message: String, reset: String }, highlight: String }, i2 = (r.startLine || 1) - 1, D = t.split(Xn), { start: s, end: a, markerLines: c } = oi(e, D, r, i2), p = e.start && typeof e.start.column == "number", l = String(a + i2).length, f = o(t).split(Xn, a).slice(s, a).map((F, d) => {
      let E = s + 1 + d, h = ` ${` ${E + i2}`.slice(-l)} |`, _ = c[E], P = !c[E + 1];
      if (_) {
        let A = "";
        if (Array.isArray(_)) {
          let B = F.slice(0, _[0]).replace(/[^\t]/g, " "), J = _[1] || 1;
          A = [`
 `, u.gutter(h.replace(/\d/g, " ")), " ", B, u.marker("^").repeat(J)].join(""), P && r.message && (A += " " + u.message(r.message));
        }
        return [u.marker(">"), u.gutter(h), F.length > 0 ? ` ${F}` : "", A].join("");
      } else return ` ${u.gutter(h)}${F.length > 0 ? ` ${F}` : ""}`;
    }).join(`
`);
    return r.message && !p && (f = `${" ".repeat(l + 1)}${r.message}
${f}`), u.reset(f);
  }
  function Zn(t, e, r = {}) {
    return Qn(t, e, r);
  }
  async function ii(t, e) {
    let r = await Ue(e), n = r.preprocess ? await r.preprocess(t, e) : t;
    e.originalText = n;
    let u;
    try {
      u = await r.parse(n, e, e);
    } catch (o) {
      si(o, t);
    }
    return { text: n, ast: u };
  }
  function si(t, e) {
    let { loc: r } = t;
    if (r) {
      let { start: n, end: u } = r;
      n && (n = { line: n.line, column: n.column - 1 }), u && (u = { line: u.line, column: u.column - 1 });
      let o = Zn(e, { start: n, end: u }, { highlightCode: true });
      t.message += `
` + o, t.codeFrame = o;
    }
    throw t;
  }
  var me = ii;
  async function eu(t, e, r, n, u) {
    if (r.embeddedLanguageFormatting !== "auto") return;
    let { printer: o } = r, { embed: i2 } = o;
    if (!i2) return;
    if (i2.length > 2) throw new Error("printer.embed has too many parameters. The API changed in Prettier v3. Please update your plugin. See https://prettier.io/docs/plugins#optional-embed");
    let { hasPrettierIgnore: D } = o, { getVisitorKeys: s } = i2, a = [];
    l();
    let c = t.stack;
    for (let { print: m, node: f, pathStack: F } of a) try {
      t.stack = F;
      let d = await m(p, e, t, r);
      d && u.set(f, d);
    } catch (d) {
      if (globalThis.PRETTIER_DEBUG) throw d;
    }
    t.stack = c;
    function p(m, f) {
      return Di(m, f, r, n);
    }
    function l() {
      let { node: m } = t;
      if (m === null || typeof m != "object" || D?.(t)) return;
      for (let F of s(m)) Array.isArray(m[F]) ? t.each(l, F) : t.call(l, F);
      let f = i2(t, r);
      if (f) {
        if (typeof f == "function") {
          a.push({ print: f, node: m, pathStack: [...t.stack] });
          return;
        }
        u.set(m, f);
      }
    }
  }
  async function Di(t, e, r, n) {
    let u = await se({ ...r, ...e, parentParser: r.parser, originalText: t, cursorOffset: void 0, rangeStart: void 0, rangeEnd: void 0 }, { passThrough: true }), { ast: o } = await me(t, u), i2 = await n(o, u);
    return He(i2);
  }
  function ai(t, e, r, n) {
    let { originalText: u, [ue]: o, locStart: i2, locEnd: D, [/* @__PURE__ */ Symbol.for("printedComments")]: s } = e, { node: a } = t, c = i2(a), p = D(a);
    for (let m of o) i2(m) >= c && D(m) <= p && s.add(m);
    let { printPrettierIgnored: l } = e.printer;
    return l ? l(t, e, r, n) : u.slice(c, p);
  }
  var tu = ai;
  async function Ve(t, e) {
    ({ ast: t } = await ur(t, e));
    let r = /* @__PURE__ */ new Map(), n = new en(t), u = dn(e), o = /* @__PURE__ */ new Map();
    await eu(n, D, e, Ve, o);
    let i2 = await ru(n, e, D, void 0, o);
    if (mn(e), e.cursorOffset >= 0) {
      if (e.nodeAfterCursor && !e.nodeBeforeCursor) return [ee, i2];
      if (e.nodeBeforeCursor && !e.nodeAfterCursor) return [i2, ee];
    }
    return i2;
    function D(a, c) {
      return a === void 0 || a === n ? s(c) : Array.isArray(a) ? n.call(() => s(c), ...a) : n.call(() => s(c), a);
    }
    function s(a) {
      u(n);
      let c = n.node;
      if (c == null) return "";
      let p = ge(c) && a === void 0;
      if (p && r.has(c)) return r.get(c);
      let l = ru(n, e, D, a, o);
      return p && r.set(c, l), l;
    }
  }
  function ru(t, e, r, n, u) {
    let { node: o } = t, { printer: i2 } = e, D;
    switch (i2.hasPrettierIgnore?.(t) ? D = tu(t, e, r, n) : u.has(o) ? D = u.get(o) : D = i2.print(t, e, r, n), o) {
      case e.cursorNode:
        D = Ee(D, (s) => [ee, s, ee]);
        break;
      case e.nodeBeforeCursor:
        D = Ee(D, (s) => [s, ee]);
        break;
      case e.nodeAfterCursor:
        D = Ee(D, (s) => [ee, s]);
        break;
    }
    return i2.printComment && rt(o.comments) && !i2.willPrintOwnComments?.(t, e) && (D = pn(t, D, e)), D;
  }
  async function ur(t, e) {
    let r = t.comments ?? [];
    e[ue] = r, e[/* @__PURE__ */ Symbol.for("printedComments")] = /* @__PURE__ */ new Set(), an(t, e);
    let { printer: { preprocess: n } } = e;
    return t = n ? await n(t, e) : t, { ast: t, comments: r };
  }
  function ci(t, e) {
    let { cursorOffset: r, locStart: n, locEnd: u, getVisitorKeys: o } = e, i2 = (m) => n(m) <= r && u(m) >= r, D = t, s = [t];
    for (let m of nn(t, { getVisitorKeys: o, filter: i2 })) s.push(m), D = m;
    if (un(D, { getVisitorKeys: o })) return { cursorNode: D };
    let a, c, p = -1, l = Number.POSITIVE_INFINITY;
    for (; s.length > 0 && (a === void 0 || c === void 0); ) {
      D = s.pop();
      let m = a !== void 0, f = c !== void 0;
      for (let F of ye(D, { getVisitorKeys: o })) {
        if (!m) {
          let d = u(F);
          d <= r && d > p && (a = F, p = d);
        }
        if (!f) {
          let d = n(F);
          d >= r && d < l && (c = F, l = d);
        }
      }
    }
    return { nodeBeforeCursor: a, nodeAfterCursor: c };
  }
  var or = ci;
  function fi(t, e) {
    let { printer: r } = e, n = r.massageAstNode;
    if (!n) return t;
    let { getVisitorKeys: u } = r, { ignoredProperties: o } = n;
    return i2(t);
    function i2(D, s) {
      if (!ge(D)) return D;
      if (Array.isArray(D)) return D.map((l) => i2(l, s)).filter(Boolean);
      let a = {}, c = new Set(u(D));
      for (let l in D) !le(D, l) || o?.has(l) || (c.has(l) ? a[l] = i2(D[l], D) : a[l] = D[l]);
      let p = n(D, a, s);
      if (p !== null) return p ?? a;
    }
  }
  var nu = fi;
  var li = Array.prototype.findLastIndex ?? function(t) {
    for (let e = this.length - 1; e >= 0; e--) {
      let r = this[e];
      if (t(r, e, this)) return e;
    }
    return -1;
  };
  var pi = X("findLastIndex", function() {
    if (Array.isArray(this)) return li;
  });
  var uu = pi;
  function mi(t, e) {
    return e = new Set(e), t.find((r) => su.has(r.type) && e.has(r));
  }
  function ou(t) {
    let e = uu(0, t, (r) => r.type !== "Program" && r.type !== "File");
    return e === -1 ? t : t.slice(0, e + 1);
  }
  function di(t, e, { locStart: r, locEnd: n }) {
    let [u, ...o] = t, [i2, ...D] = e;
    if (u === i2) return [u, i2];
    let s = r(u);
    for (let c of ou(D)) if (r(c) >= s) i2 = c;
    else break;
    let a = n(i2);
    for (let c of ou(o)) {
      if (n(c) <= a) u = c;
      else break;
      if (u === i2) break;
    }
    return [u, i2];
  }
  function ir(t, e, r, n, u = [], o, i2) {
    let { locStart: D, locEnd: s } = i2, a = D(t), c = s(t);
    if (e > c || e < a || o === "rangeEnd" && e === a || o === "rangeStart" && e === c) return;
    let p = [t, ...u], l = ot(t, p, { cache: Ut, locStart: D, locEnd: s, getVisitorKeys: r.getVisitorKeys, filter: r.printer.canAttachComment, getChildren: r.printer.getCommentChildNodes });
    for (let m of l) {
      let f = ir(m, e, r, n, p, o, i2);
      if (f) return f;
    }
    if (n(t, u[0])) return p;
  }
  function Fi(t, e) {
    return e !== "DeclareExportDeclaration" && t !== "TypeParameterDeclaration" && (t === "Directive" || t === "TypeAlias" || t === "TSExportAssignment" || t.startsWith("Declare") || t.startsWith("TSDeclare") || t.endsWith("Statement") || t.endsWith("Declaration"));
  }
  var su = /* @__PURE__ */ new Set(["JsonRoot", "ObjectExpression", "ArrayExpression", "StringLiteral", "NumericLiteral", "BooleanLiteral", "NullLiteral", "UnaryExpression", "TemplateLiteral"]);
  var Ei = /* @__PURE__ */ new Set(["OperationDefinition", "FragmentDefinition", "VariableDefinition", "TypeExtensionDefinition", "ObjectTypeDefinition", "FieldDefinition", "DirectiveDefinition", "EnumTypeDefinition", "EnumValueDefinition", "InputValueDefinition", "InputObjectTypeDefinition", "SchemaDefinition", "OperationTypeDefinition", "InterfaceTypeDefinition", "UnionTypeDefinition", "ScalarTypeDefinition"]);
  function iu(t, e, r) {
    if (!e) return false;
    switch (t.parser) {
      case "flow":
      case "hermes":
      case "babel":
      case "babel-flow":
      case "babel-ts":
      case "typescript":
      case "acorn":
      case "espree":
      case "meriyah":
      case "oxc":
      case "oxc-ts":
      case "__babel_estree":
        return Fi(e.type, r?.type);
      case "json":
      case "json5":
      case "jsonc":
      case "json-stringify":
        return su.has(e.type);
      case "graphql":
        return Ei.has(e.kind);
      case "vue":
        return e.tag !== "root";
    }
    return false;
  }
  function Du(t, e, r) {
    let { rangeStart: n, rangeEnd: u } = e;
    k(u > n);
    let o = t.slice(n, u).search(/\S/), i2 = o === -1;
    if (!i2) for (n += o; u > n && !/\S/.test(t[u - 1]); --u) ;
    let D = e.printer.features?.experimental_locForRangeFormat ?? e, s = ir(r, n, e, (f, F) => iu(e, f, F), [], "rangeStart", D);
    if (!s) return;
    let a = i2 ? s : ir(r, u, e, (f) => iu(e, f), [], "rangeEnd", D);
    if (!a) return;
    let c, p;
    if (r.type === "JsonRoot") {
      let f = mi(s, a);
      c = f, p = f;
    } else [c, p] = di(s, a, e);
    let { locStart: l, locEnd: m } = D;
    return [Math.min(l(c), l(p)), Math.max(m(c), m(p))];
  }
  var lu = "\uFEFF";
  var au = /* @__PURE__ */ Symbol("cursor");
  async function pu(t, e, r = 0) {
    if (!t || t.trim().length === 0) return { formatted: "", cursorOffset: -1, comments: [] };
    let { ast: n, text: u } = await me(t, e);
    e.cursorOffset >= 0 && (e = { ...e, ...or(n, e) });
    let o = await Ve(n, e, r);
    r > 0 && (o = Qe([W, o], r, e.tabWidth));
    let i2 = Ce(o, e);
    if (r > 0) {
      let s = i2.formatted.trim();
      i2.cursorNodeStart !== void 0 && (i2.cursorNodeStart -= i2.formatted.indexOf(s), i2.cursorNodeStart < 0 && (i2.cursorNodeStart = 0, i2.cursorNodeText = i2.cursorNodeText.trimStart()), i2.cursorNodeStart + i2.cursorNodeText.length > s.length && (i2.cursorNodeText = i2.cursorNodeText.trimEnd())), i2.formatted = s + we(e.endOfLine);
    }
    let D = e[ue];
    if (e.cursorOffset >= 0) {
      let s, a, c, p;
      if ((e.cursorNode || e.nodeBeforeCursor || e.nodeAfterCursor) && i2.cursorNodeText) if (c = i2.cursorNodeStart, p = i2.cursorNodeText, e.cursorNode) s = e.locStart(e.cursorNode), a = u.slice(s, e.locEnd(e.cursorNode));
      else {
        if (!e.nodeBeforeCursor && !e.nodeAfterCursor) throw new Error("Cursor location must contain at least one of cursorNode, nodeBeforeCursor, nodeAfterCursor");
        s = e.nodeBeforeCursor ? e.locEnd(e.nodeBeforeCursor) : 0;
        let E = e.nodeAfterCursor ? e.locStart(e.nodeAfterCursor) : u.length;
        a = u.slice(s, E);
      }
      else s = 0, a = u, c = 0, p = i2.formatted;
      let l = e.cursorOffset - s;
      if (a === p) return { formatted: i2.formatted, cursorOffset: c + l, comments: D };
      let m = a.split("");
      m.splice(l, 0, au);
      let f = p.split(""), F = xt(m, f), d = c;
      for (let E of F) if (E.removed) {
        if (E.value.includes(au)) break;
      } else d += E.count;
      return { formatted: i2.formatted, cursorOffset: d, comments: D };
    }
    return { formatted: i2.formatted, cursorOffset: -1, comments: D };
  }
  async function Ci(t, e) {
    let { ast: r, text: n } = await me(t, e), [u, o] = Du(n, e, r) ?? [0, 0], i2 = n.slice(u, o), D = Math.min(u, n.lastIndexOf(`
`, u) + 1), s = n.slice(D, u).match(/^\s*/)[0], a = he(s, e.tabWidth), c = await pu(i2, { ...e, rangeStart: 0, rangeEnd: Number.POSITIVE_INFINITY, cursorOffset: e.cursorOffset > u && e.cursorOffset <= o ? e.cursorOffset - u : -1, endOfLine: "lf" }, a), p = c.formatted.trimEnd(), { cursorOffset: l } = e;
    l > o ? l += p.length - i2.length : c.cursorOffset >= 0 && (l = c.cursorOffset + u);
    let m = n.slice(0, u) + p + n.slice(o);
    if (e.endOfLine !== "lf") {
      let f = we(e.endOfLine);
      l >= 0 && f === `\r
` && (l += Tt(m.slice(0, l), `
`)), m = ne(0, m, `
`, f);
    }
    return { formatted: m, cursorOffset: l, comments: c.comments };
  }
  function sr(t, e, r) {
    return typeof e != "number" || Number.isNaN(e) || e < 0 || e > t.length ? r : e;
  }
  function cu(t, e) {
    let { cursorOffset: r, rangeStart: n, rangeEnd: u } = e;
    return r = sr(t, r, -1), n = sr(t, n, 0), u = sr(t, u, t.length), { ...e, cursorOffset: r, rangeStart: n, rangeEnd: u };
  }
  function mu(t, e) {
    let { cursorOffset: r, rangeStart: n, rangeEnd: u, endOfLine: o } = cu(t, e), i2 = t.charAt(0) === lu;
    if (i2 && (t = t.slice(1), r--, n--, u--), o === "auto" && (o = Cr(t)), t.includes("\r")) {
      let D = (s) => Tt(t.slice(0, Math.max(s, 0)), `\r
`);
      r -= D(r), n -= D(n), u -= D(u), t = hr(t);
    }
    return { hasBOM: i2, text: t, options: cu(t, { ...e, cursorOffset: r, rangeStart: n, rangeEnd: u, endOfLine: o }) };
  }
  async function fu(t, e) {
    let r = await Ue(e);
    return !r.hasPragma || r.hasPragma(t);
  }
  async function hi(t, e) {
    return (await Ue(e)).hasIgnorePragma?.(t);
  }
  async function Dr(t, e) {
    let { hasBOM: r, text: n, options: u } = mu(t, await se(e));
    if (u.rangeStart >= u.rangeEnd && n !== "" || u.requirePragma && !await fu(n, u) || u.checkIgnorePragma && await hi(n, u)) return { formatted: t, cursorOffset: e.cursorOffset, comments: [] };
    let o;
    return u.rangeStart > 0 || u.rangeEnd < n.length ? o = await Ci(n, u) : (!u.requirePragma && u.insertPragma && u.printer.insertPragma && !await fu(n, u) && (n = u.printer.insertPragma(n)), o = await pu(n, u)), r && (o.formatted = lu + o.formatted, o.cursorOffset >= 0 && o.cursorOffset++), o;
  }
  async function du(t, e, r) {
    let { text: n, options: u } = mu(t, await se(e)), o = await me(n, u);
    return r && (r.preprocessForPrint && (o.ast = await ur(o.ast, u)), r.massage && (o.ast = nu(o.ast, u))), o;
  }
  async function Fu(t, e) {
    e = await se(e);
    let r = await Ve(t, e);
    return Ce(r, e);
  }
  async function Eu(t, e) {
    let r = Ur(t), { formatted: n } = await Dr(r, { ...e, parser: "__js_expression" });
    return n;
  }
  async function Cu(t, e) {
    e = await se(e);
    let { ast: r } = await me(t, e);
    return e.cursorOffset >= 0 && (e = { ...e, ...or(r, e) }), Ve(r, e);
  }
  async function hu(t, e) {
    return Ce(t, await se(e));
  }
  var ar = {};
  yt(ar, { builders: () => _i, printer: () => yi, utils: () => Ai });
  var _i = { join: be, line: Ze, softline: Mr, hardline: W, literalline: Je, group: wt, conditionalGroup: Ir, fill: kr, lineSuffix: Ie, lineSuffixBoundary: Yr, cursor: ee, breakParent: ae, ifBreak: Rr, trim: jr, indent: oe, indentIfBreak: vr, align: De, addAlignmentToDoc: Qe, markAsRoot: Xe, dedentToRoot: Sr, dedent: br, hardlineWithoutBreakParent: ke, literallineWithoutBreakParent: Ot, label: Lr, concat: (t) => t };
  var yi = { printDocToString: Ce };
  var Ai = { willBreak: xr, traverseDoc: Oe, findInDoc: Ke, mapDoc: Se, removeLines: Tr, stripTrailingHardline: He, replaceEndOfLine: Nr, canBreak: wr };
  var gu = "3.9.1";
  var fr = {};
  yt(fr, { addDanglingComment: () => re, addLeadingComment: () => ce, addTrailingComment: () => fe, getAlignmentSize: () => he, getIndentSize: () => _u, getMaxContinuousCount: () => yu, getNextNonSpaceNonCommentCharacter: () => Au, getNextNonSpaceNonCommentCharacterIndex: () => vi, getPreferredQuote: () => Tu, getStringWidth: () => Re, hasNewline: () => H, hasNewlineInRange: () => Nu, hasSpaces: () => wu, isNextLineEmpty: () => Ui, isNextLineEmptyAfterIndex: () => gt, isPreviousLineEmpty: () => Mi, makeString: () => ji, skip: () => _e, skipEverythingButNewLine: () => ut, skipInlineComment: () => Be, skipNewline: () => $, skipSpaces: () => j, skipToLineEnd: () => nt, skipTrailingComment: () => Te, skipWhitespace: () => tn });
  function xi(t, e) {
    if (e === false) return false;
    if (t.charAt(e) === "/" && t.charAt(e + 1) === "*") {
      for (let r = e + 2; r < t.length; ++r) if (t.charAt(r) === "*" && t.charAt(r + 1) === "/") return r + 2;
    }
    return e;
  }
  var Be = xi;
  function Bi(t, e) {
    return e === false ? false : t.charAt(e) === "/" && t.charAt(e + 1) === "/" ? ut(t, e) : e;
  }
  var Te = Bi;
  function Ti(t, e) {
    let r = null, n = e;
    for (; n !== r; ) r = n, n = j(t, n), n = Be(t, n), n = Te(t, n), n = $(t, n);
    return n;
  }
  var We = Ti;
  function Ni(t, e) {
    let r = null, n = e;
    for (; n !== r; ) r = n, n = nt(t, n), n = Be(t, n), n = j(t, n);
    return n = Te(t, n), n = $(t, n), n !== false && H(t, n);
  }
  var gt = Ni;
  function wi(t, e) {
    let r = t.lastIndexOf(`
`);
    return r === -1 ? 0 : he(t.slice(r + 1).match(/^[\t ]*/)[0], e);
  }
  var _u = wi;
  function cr(t) {
    if (typeof t != "string") throw new TypeError("Expected a string");
    return t.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&").replace(/-/g, "\\x2d");
  }
  function Oi(t, e) {
    let r = t.matchAll(new RegExp(`(?:${cr(e)})+`, "g"));
    return r.reduce || (r = [...r]), r.reduce((n, [u]) => Math.max(n, u.length), 0) / e.length;
  }
  var yu = Oi;
  function Pi(t, e) {
    let r = We(t, e);
    return r === false ? "" : t.charAt(r);
  }
  var Au = Pi;
  var xu = Object.freeze({ character: "'", codePoint: 39 });
  var Bu = Object.freeze({ character: '"', codePoint: 34 });
  var Si = Object.freeze({ preferred: xu, alternate: Bu });
  var bi = Object.freeze({ preferred: Bu, alternate: xu });
  function Tu(t, e) {
    let { preferred: r, alternate: n } = e === true || e === "'" ? Si : bi, { length: u } = t, o = 0, i2 = 0;
    for (let D = 0; D < u; D++) {
      let s = t.charCodeAt(D);
      s === r.codePoint ? o++ : s === n.codePoint && i2++;
    }
    return (o > i2 ? n : r).character;
  }
  function ki(t, e, r) {
    for (let n = e; n < r; ++n) if (t.charAt(n) === `
`) return true;
    return false;
  }
  var Nu = ki;
  function Ii(t, e, r = {}) {
    return j(t, r.backwards ? e - 1 : e, r) !== e;
  }
  var wu = Ii;
  function Ri(t, e, r) {
    return We(t, r(e));
  }
  function vi(t, e) {
    return arguments.length === 2 || typeof e == "number" ? We(t, e) : Ri(...arguments);
  }
  function Li(t, e, r) {
    return ve(t, r(e));
  }
  function Mi(t, e) {
    return arguments.length === 2 || typeof e == "number" ? ve(t, e) : Li(...arguments);
  }
  function Yi(t, e, r) {
    return gt(t, r(e));
  }
  function ji(t, e, r) {
    let n = e === '"' ? "'" : '"', o = ne(0, t, /\\(.)|(["'])/gs, (i2, D, s) => D === n ? D : s === e ? "\\" + s : s || (r && /^[^\n\r"'0-7\\bfnrt-vx\u2028\u2029]$/.test(D) ? D : "\\" + D));
    return e + o + e;
  }
  function Ui(t, e) {
    return arguments.length === 2 || typeof e == "number" ? gt(t, e) : Yi(...arguments);
  }
  function de(t, e = 1) {
    return async (...r) => {
      let n = r[e] ?? {}, u = n.plugins ?? [];
      return r[e] = { ...n, plugins: Array.isArray(u) ? u : Object.values(u) }, await t(...r);
    };
  }
  var Ou = de(Dr);
  async function Pu(t, e) {
    let { formatted: r } = await Ou(t, { ...e, cursorOffset: -1 });
    return r;
  }
  async function Vi(t, e) {
    return await Pu(t, e) === t;
  }
  var Wi = de(it, 0);
  var $i = { parse: de(du), formatAST: de(Fu), formatDoc: de(Eu), printToDoc: de(Cu), printDocToString: de(hu) };

  // node_modules/prettier-plugin-java/node_modules/web-tree-sitter/web-tree-sitter.js
  var import_meta = { url: document.currentScript?.src || location.href };
  var __defProp2 = Object.defineProperty;
  var __name = (target, value) => __defProp2(target, "name", { value, configurable: true });
  var Edit = class {
    static {
      __name(this, "Edit");
    }
    /** The start position of the change. */
    startPosition;
    /** The end position of the change before the edit. */
    oldEndPosition;
    /** The end position of the change after the edit. */
    newEndPosition;
    /** The start index of the change. */
    startIndex;
    /** The end index of the change before the edit. */
    oldEndIndex;
    /** The end index of the change after the edit. */
    newEndIndex;
    constructor({
      startIndex,
      oldEndIndex,
      newEndIndex,
      startPosition,
      oldEndPosition,
      newEndPosition
    }) {
      this.startIndex = startIndex >>> 0;
      this.oldEndIndex = oldEndIndex >>> 0;
      this.newEndIndex = newEndIndex >>> 0;
      this.startPosition = startPosition;
      this.oldEndPosition = oldEndPosition;
      this.newEndPosition = newEndPosition;
    }
    /**
     * Edit a point and index to keep it in-sync with source code that has been edited.
     *
     * This function updates a single point's byte offset and row/column position
     * based on an edit operation. This is useful for editing points without
     * requiring a tree or node instance.
     */
    editPoint(point, index) {
      let newIndex = index;
      const newPoint = { ...point };
      if (index >= this.oldEndIndex) {
        newIndex = this.newEndIndex + (index - this.oldEndIndex);
        const originalRow = point.row;
        newPoint.row = this.newEndPosition.row + (point.row - this.oldEndPosition.row);
        newPoint.column = originalRow === this.oldEndPosition.row ? this.newEndPosition.column + (point.column - this.oldEndPosition.column) : point.column;
      } else if (index > this.startIndex) {
        newIndex = this.newEndIndex;
        newPoint.row = this.newEndPosition.row;
        newPoint.column = this.newEndPosition.column;
      }
      return { point: newPoint, index: newIndex };
    }
    /**
     * Edit a range to keep it in-sync with source code that has been edited.
     *
     * This function updates a range's start and end positions based on an edit
     * operation. This is useful for editing ranges without requiring a tree
     * or node instance.
     */
    editRange(range) {
      const newRange = {
        startIndex: range.startIndex,
        startPosition: { ...range.startPosition },
        endIndex: range.endIndex,
        endPosition: { ...range.endPosition }
      };
      if (range.endIndex >= this.oldEndIndex) {
        if (range.endIndex !== Number.MAX_SAFE_INTEGER) {
          newRange.endIndex = this.newEndIndex + (range.endIndex - this.oldEndIndex);
          newRange.endPosition = {
            row: this.newEndPosition.row + (range.endPosition.row - this.oldEndPosition.row),
            column: range.endPosition.row === this.oldEndPosition.row ? this.newEndPosition.column + (range.endPosition.column - this.oldEndPosition.column) : range.endPosition.column
          };
          if (newRange.endIndex < this.newEndIndex) {
            newRange.endIndex = Number.MAX_SAFE_INTEGER;
            newRange.endPosition = { row: Number.MAX_SAFE_INTEGER, column: Number.MAX_SAFE_INTEGER };
          }
        }
      } else if (range.endIndex > this.startIndex) {
        newRange.endIndex = this.startIndex;
        newRange.endPosition = { ...this.startPosition };
      }
      if (range.startIndex >= this.oldEndIndex) {
        newRange.startIndex = this.newEndIndex + (range.startIndex - this.oldEndIndex);
        newRange.startPosition = {
          row: this.newEndPosition.row + (range.startPosition.row - this.oldEndPosition.row),
          column: range.startPosition.row === this.oldEndPosition.row ? this.newEndPosition.column + (range.startPosition.column - this.oldEndPosition.column) : range.startPosition.column
        };
        if (newRange.startIndex < this.newEndIndex) {
          newRange.startIndex = Number.MAX_SAFE_INTEGER;
          newRange.startPosition = { row: Number.MAX_SAFE_INTEGER, column: Number.MAX_SAFE_INTEGER };
        }
      } else if (range.startIndex > this.startIndex) {
        newRange.startIndex = this.startIndex;
        newRange.startPosition = { ...this.startPosition };
      }
      return newRange;
    }
  };
  var SIZE_OF_SHORT = 2;
  var SIZE_OF_INT = 4;
  var SIZE_OF_CURSOR = 4 * SIZE_OF_INT;
  var SIZE_OF_NODE = 5 * SIZE_OF_INT;
  var SIZE_OF_POINT = 2 * SIZE_OF_INT;
  var SIZE_OF_RANGE = 2 * SIZE_OF_INT + 2 * SIZE_OF_POINT;
  var ZERO_POINT = { row: 0, column: 0 };
  var INTERNAL = /* @__PURE__ */ Symbol("INTERNAL");
  function assertInternal(x2) {
    if (x2 !== INTERNAL) throw new Error("Illegal constructor");
  }
  __name(assertInternal, "assertInternal");
  function isPoint(point) {
    return !!point && typeof point.row === "number" && typeof point.column === "number";
  }
  __name(isPoint, "isPoint");
  function setModule(module2) {
    C = module2;
  }
  __name(setModule, "setModule");
  var C;
  var LookaheadIterator = class {
    static {
      __name(this, "LookaheadIterator");
    }
    /** @internal */
    [0] = 0;
    // Internal handle for Wasm
    /** @internal */
    language;
    /** @internal */
    constructor(internal, address, language) {
      assertInternal(internal);
      this[0] = address;
      this.language = language;
    }
    /** Get the current symbol of the lookahead iterator. */
    get currentTypeId() {
      return C._ts_lookahead_iterator_current_symbol(this[0]);
    }
    /** Get the current symbol name of the lookahead iterator. */
    get currentType() {
      return this.language.types[this.currentTypeId] || "ERROR";
    }
    /** Delete the lookahead iterator, freeing its resources. */
    delete() {
      C._ts_lookahead_iterator_delete(this[0]);
      this[0] = 0;
    }
    /**
     * Reset the lookahead iterator.
     *
     * This returns `true` if the language was set successfully and `false`
     * otherwise.
     */
    reset(language, stateId) {
      if (C._ts_lookahead_iterator_reset(this[0], language[0], stateId)) {
        this.language = language;
        return true;
      }
      return false;
    }
    /**
     * Reset the lookahead iterator to another state.
     *
     * This returns `true` if the iterator was reset to the given state and
     * `false` otherwise.
     */
    resetState(stateId) {
      return Boolean(C._ts_lookahead_iterator_reset_state(this[0], stateId));
    }
    /**
     * Returns an iterator that iterates over the symbols of the lookahead iterator.
     *
     * The iterator will yield the current symbol name as a string for each step
     * until there are no more symbols to iterate over.
     */
    [Symbol.iterator]() {
      return {
        next: /* @__PURE__ */ __name(() => {
          if (C._ts_lookahead_iterator_next(this[0])) {
            return { done: false, value: this.currentType };
          }
          return { done: true, value: "" };
        }, "next")
      };
    }
  };
  function getText(tree, startIndex, endIndex, startPosition) {
    const length = endIndex - startIndex;
    let result = tree.textCallback(startIndex, startPosition);
    if (result) {
      startIndex += result.length;
      while (startIndex < endIndex) {
        const string = tree.textCallback(startIndex, startPosition);
        if (string && string.length > 0) {
          startIndex += string.length;
          result += string;
        } else {
          break;
        }
      }
      if (startIndex > endIndex) {
        result = result.slice(0, length);
      }
    }
    return result ?? "";
  }
  __name(getText, "getText");
  var Tree = class _Tree {
    static {
      __name(this, "Tree");
    }
    /** @internal */
    [0] = 0;
    // Internal handle for Wasm
    /** @internal */
    textCallback;
    /** The language that was used to parse the syntax tree. */
    language;
    /** @internal */
    constructor(internal, address, language, textCallback) {
      assertInternal(internal);
      this[0] = address;
      this.language = language;
      this.textCallback = textCallback;
    }
    /** Create a shallow copy of the syntax tree. This is very fast. */
    copy() {
      const address = C._ts_tree_copy(this[0]);
      return new _Tree(INTERNAL, address, this.language, this.textCallback);
    }
    /** Delete the syntax tree, freeing its resources. */
    delete() {
      C._ts_tree_delete(this[0]);
      this[0] = 0;
    }
    /** Get the root node of the syntax tree. */
    get rootNode() {
      C._ts_tree_root_node_wasm(this[0]);
      return unmarshalNode(this);
    }
    /**
     * Get the root node of the syntax tree, but with its position shifted
     * forward by the given offset.
     */
    rootNodeWithOffset(offsetBytes, offsetExtent) {
      const address = TRANSFER_BUFFER + SIZE_OF_NODE;
      C.setValue(address, offsetBytes, "i32");
      marshalPoint(address + SIZE_OF_INT, offsetExtent);
      C._ts_tree_root_node_with_offset_wasm(this[0]);
      return unmarshalNode(this);
    }
    /**
     * Edit the syntax tree to keep it in sync with source code that has been
     * edited.
     *
     * You must describe the edit both in terms of byte offsets and in terms of
     * row/column coordinates.
     */
    edit(edit) {
      marshalEdit(edit);
      C._ts_tree_edit_wasm(this[0]);
    }
    /** Create a new {@link TreeCursor} starting from the root of the tree. */
    walk() {
      return this.rootNode.walk();
    }
    /**
     * Compare this old edited syntax tree to a new syntax tree representing
     * the same document, returning a sequence of ranges whose syntactic
     * structure has changed.
     *
     * For this to work correctly, this syntax tree must have been edited such
     * that its ranges match up to the new tree. Generally, you'll want to
     * call this method right after calling one of the [`Parser::parse`]
     * functions. Call it on the old tree that was passed to parse, and
     * pass the new tree that was returned from `parse`.
     */
    getChangedRanges(other) {
      if (!(other instanceof _Tree)) {
        throw new TypeError("Argument must be a Tree");
      }
      C._ts_tree_get_changed_ranges_wasm(this[0], other[0]);
      const count = C.getValue(TRANSFER_BUFFER, "i32");
      const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
      const result = new Array(count);
      if (count > 0) {
        let address = buffer;
        for (let i2 = 0; i2 < count; i2++) {
          result[i2] = unmarshalRange(address);
          address += SIZE_OF_RANGE;
        }
        C._free(buffer);
      }
      return result;
    }
    /** Get the included ranges that were used to parse the syntax tree. */
    getIncludedRanges() {
      C._ts_tree_included_ranges_wasm(this[0]);
      const count = C.getValue(TRANSFER_BUFFER, "i32");
      const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
      const result = new Array(count);
      if (count > 0) {
        let address = buffer;
        for (let i2 = 0; i2 < count; i2++) {
          result[i2] = unmarshalRange(address);
          address += SIZE_OF_RANGE;
        }
        C._free(buffer);
      }
      return result;
    }
  };
  var TreeCursor = class _TreeCursor {
    static {
      __name(this, "TreeCursor");
    }
    /** @internal */
    // @ts-expect-error: never read
    [0] = 0;
    // Internal handle for Wasm
    /** @internal */
    // @ts-expect-error: never read
    [1] = 0;
    // Internal handle for Wasm
    /** @internal */
    // @ts-expect-error: never read
    [2] = 0;
    // Internal handle for Wasm
    /** @internal */
    // @ts-expect-error: never read
    [3] = 0;
    // Internal handle for Wasm
    /** @internal */
    tree;
    /** @internal */
    constructor(internal, tree) {
      assertInternal(internal);
      this.tree = tree;
      unmarshalTreeCursor(this);
    }
    /** Creates a deep copy of the tree cursor. This allocates new memory. */
    copy() {
      const copy = new _TreeCursor(INTERNAL, this.tree);
      C._ts_tree_cursor_copy_wasm(this.tree[0]);
      unmarshalTreeCursor(copy);
      return copy;
    }
    /** Delete the tree cursor, freeing its resources. */
    delete() {
      marshalTreeCursor(this);
      C._ts_tree_cursor_delete_wasm(this.tree[0]);
      this[0] = this[1] = this[2] = 0;
    }
    /** Get the tree cursor's current {@link Node}. */
    get currentNode() {
      marshalTreeCursor(this);
      C._ts_tree_cursor_current_node_wasm(this.tree[0]);
      return unmarshalNode(this.tree);
    }
    /**
     * Get the numerical field id of this tree cursor's current node.
     *
     * See also {@link TreeCursor#currentFieldName}.
     */
    get currentFieldId() {
      marshalTreeCursor(this);
      return C._ts_tree_cursor_current_field_id_wasm(this.tree[0]);
    }
    /** Get the field name of this tree cursor's current node. */
    get currentFieldName() {
      return this.tree.language.fields[this.currentFieldId];
    }
    /**
     * Get the depth of the cursor's current node relative to the original
     * node that the cursor was constructed with.
     */
    get currentDepth() {
      marshalTreeCursor(this);
      return C._ts_tree_cursor_current_depth_wasm(this.tree[0]);
    }
    /**
     * Get the index of the cursor's current node out of all of the
     * descendants of the original node that the cursor was constructed with.
     */
    get currentDescendantIndex() {
      marshalTreeCursor(this);
      return C._ts_tree_cursor_current_descendant_index_wasm(this.tree[0]);
    }
    /** Get the type of the cursor's current node. */
    get nodeType() {
      return this.tree.language.types[this.nodeTypeId] || "ERROR";
    }
    /** Get the type id of the cursor's current node. */
    get nodeTypeId() {
      marshalTreeCursor(this);
      return C._ts_tree_cursor_current_node_type_id_wasm(this.tree[0]);
    }
    /** Get the state id of the cursor's current node. */
    get nodeStateId() {
      marshalTreeCursor(this);
      return C._ts_tree_cursor_current_node_state_id_wasm(this.tree[0]);
    }
    /** Get the id of the cursor's current node. */
    get nodeId() {
      marshalTreeCursor(this);
      return C._ts_tree_cursor_current_node_id_wasm(this.tree[0]);
    }
    /**
     * Check if the cursor's current node is *named*.
     *
     * Named nodes correspond to named rules in the grammar, whereas
     * *anonymous* nodes correspond to string literals in the grammar.
     */
    get nodeIsNamed() {
      marshalTreeCursor(this);
      return C._ts_tree_cursor_current_node_is_named_wasm(this.tree[0]) === 1;
    }
    /**
     * Check if the cursor's current node is *missing*.
     *
     * Missing nodes are inserted by the parser in order to recover from
     * certain kinds of syntax errors.
     */
    get nodeIsMissing() {
      marshalTreeCursor(this);
      return C._ts_tree_cursor_current_node_is_missing_wasm(this.tree[0]) === 1;
    }
    /** Get the string content of the cursor's current node. */
    get nodeText() {
      marshalTreeCursor(this);
      const startIndex = C._ts_tree_cursor_start_index_wasm(this.tree[0]);
      const endIndex = C._ts_tree_cursor_end_index_wasm(this.tree[0]);
      C._ts_tree_cursor_start_position_wasm(this.tree[0]);
      const startPosition = unmarshalPoint(TRANSFER_BUFFER);
      return getText(this.tree, startIndex, endIndex, startPosition);
    }
    /** Get the start position of the cursor's current node. */
    get startPosition() {
      marshalTreeCursor(this);
      C._ts_tree_cursor_start_position_wasm(this.tree[0]);
      return unmarshalPoint(TRANSFER_BUFFER);
    }
    /** Get the end position of the cursor's current node. */
    get endPosition() {
      marshalTreeCursor(this);
      C._ts_tree_cursor_end_position_wasm(this.tree[0]);
      return unmarshalPoint(TRANSFER_BUFFER);
    }
    /** Get the start index of the cursor's current node. */
    get startIndex() {
      marshalTreeCursor(this);
      return C._ts_tree_cursor_start_index_wasm(this.tree[0]);
    }
    /** Get the end index of the cursor's current node. */
    get endIndex() {
      marshalTreeCursor(this);
      return C._ts_tree_cursor_end_index_wasm(this.tree[0]);
    }
    /**
     * Move this cursor to the first child of its current node.
     *
     * This returns `true` if the cursor successfully moved, and returns
     * `false` if there were no children.
     */
    gotoFirstChild() {
      marshalTreeCursor(this);
      const result = C._ts_tree_cursor_goto_first_child_wasm(this.tree[0]);
      unmarshalTreeCursor(this);
      return result === 1;
    }
    /**
     * Move this cursor to the last child of its current node.
     *
     * This returns `true` if the cursor successfully moved, and returns
     * `false` if there were no children.
     *
     * Note that this function may be slower than
     * {@link TreeCursor#gotoFirstChild} because it needs to
     * iterate through all the children to compute the child's position.
     */
    gotoLastChild() {
      marshalTreeCursor(this);
      const result = C._ts_tree_cursor_goto_last_child_wasm(this.tree[0]);
      unmarshalTreeCursor(this);
      return result === 1;
    }
    /**
     * Move this cursor to the parent of its current node.
     *
     * This returns `true` if the cursor successfully moved, and returns
     * `false` if there was no parent node (the cursor was already on the
     * root node).
     *
     * Note that the node the cursor was constructed with is considered the root
     * of the cursor, and the cursor cannot walk outside this node.
     */
    gotoParent() {
      marshalTreeCursor(this);
      const result = C._ts_tree_cursor_goto_parent_wasm(this.tree[0]);
      unmarshalTreeCursor(this);
      return result === 1;
    }
    /**
     * Move this cursor to the next sibling of its current node.
     *
     * This returns `true` if the cursor successfully moved, and returns
     * `false` if there was no next sibling node.
     *
     * Note that the node the cursor was constructed with is considered the root
     * of the cursor, and the cursor cannot walk outside this node.
     */
    gotoNextSibling() {
      marshalTreeCursor(this);
      const result = C._ts_tree_cursor_goto_next_sibling_wasm(this.tree[0]);
      unmarshalTreeCursor(this);
      return result === 1;
    }
    /**
     * Move this cursor to the previous sibling of its current node.
     *
     * This returns `true` if the cursor successfully moved, and returns
     * `false` if there was no previous sibling node.
     *
     * Note that this function may be slower than
     * {@link TreeCursor#gotoNextSibling} due to how node
     * positions are stored. In the worst case, this will need to iterate
     * through all the children up to the previous sibling node to recalculate
     * its position. Also note that the node the cursor was constructed with is
     * considered the root of the cursor, and the cursor cannot walk outside this node.
     */
    gotoPreviousSibling() {
      marshalTreeCursor(this);
      const result = C._ts_tree_cursor_goto_previous_sibling_wasm(this.tree[0]);
      unmarshalTreeCursor(this);
      return result === 1;
    }
    /**
     * Move the cursor to the node that is the nth descendant of
     * the original node that the cursor was constructed with, where
     * zero represents the original node itself.
     */
    gotoDescendant(goalDescendantIndex) {
      marshalTreeCursor(this);
      C._ts_tree_cursor_goto_descendant_wasm(this.tree[0], goalDescendantIndex);
      unmarshalTreeCursor(this);
    }
    /**
     * Move this cursor to the first child of its current node that contains or
     * starts after the given byte offset.
     *
     * This returns `true` if the cursor successfully moved to a child node, and returns
     * `false` if no such child was found.
     */
    gotoFirstChildForIndex(goalIndex) {
      marshalTreeCursor(this);
      C.setValue(TRANSFER_BUFFER + SIZE_OF_CURSOR, goalIndex, "i32");
      const result = C._ts_tree_cursor_goto_first_child_for_index_wasm(this.tree[0]);
      unmarshalTreeCursor(this);
      return result === 1;
    }
    /**
     * Move this cursor to the first child of its current node that contains or
     * starts after the given byte offset.
     *
     * This returns the index of the child node if one was found, and returns
     * `null` if no such child was found.
     */
    gotoFirstChildForPosition(goalPosition) {
      marshalTreeCursor(this);
      marshalPoint(TRANSFER_BUFFER + SIZE_OF_CURSOR, goalPosition);
      const result = C._ts_tree_cursor_goto_first_child_for_position_wasm(this.tree[0]);
      unmarshalTreeCursor(this);
      return result === 1;
    }
    /**
     * Re-initialize this tree cursor to start at the original node that the
     * cursor was constructed with.
     */
    reset(node) {
      marshalNode(node);
      marshalTreeCursor(this, TRANSFER_BUFFER + SIZE_OF_NODE);
      C._ts_tree_cursor_reset_wasm(this.tree[0]);
      unmarshalTreeCursor(this);
    }
    /**
     * Re-initialize a tree cursor to the same position as another cursor.
     *
     * Unlike {@link TreeCursor#reset}, this will not lose parent
     * information and allows reusing already created cursors.
     */
    resetTo(cursor2) {
      marshalTreeCursor(this, TRANSFER_BUFFER);
      marshalTreeCursor(cursor2, TRANSFER_BUFFER + SIZE_OF_CURSOR);
      C._ts_tree_cursor_reset_to_wasm(this.tree[0], cursor2.tree[0]);
      unmarshalTreeCursor(this);
    }
  };
  var Node = class {
    static {
      __name(this, "Node");
    }
    /** @internal */
    // @ts-expect-error: never read
    [0] = 0;
    // Internal handle for Wasm
    /** @internal */
    _children;
    /** @internal */
    _namedChildren;
    /** @internal */
    constructor(internal, {
      id,
      tree,
      startIndex,
      startPosition,
      other
    }) {
      assertInternal(internal);
      this[0] = other;
      this.id = id;
      this.tree = tree;
      this.startIndex = startIndex;
      this.startPosition = startPosition;
    }
    /**
     * The numeric id for this node that is unique.
     *
     * Within a given syntax tree, no two nodes have the same id. However:
     *
     * * If a new tree is created based on an older tree, and a node from the old tree is reused in
     *   the process, then that node will have the same id in both trees.
     *
     * * A node not marked as having changes does not guarantee it was reused.
     *
     * * If a node is marked as having changed in the old tree, it will not be reused.
     */
    id;
    /** The byte index where this node starts. */
    startIndex;
    /** The position where this node starts. */
    startPosition;
    /** The tree that this node belongs to. */
    tree;
    /** Get this node's type as a numerical id. */
    get typeId() {
      marshalNode(this);
      return C._ts_node_symbol_wasm(this.tree[0]);
    }
    /**
     * Get the node's type as a numerical id as it appears in the grammar,
     * ignoring aliases.
     */
    get grammarId() {
      marshalNode(this);
      return C._ts_node_grammar_symbol_wasm(this.tree[0]);
    }
    /** Get this node's type as a string. */
    get type() {
      return this.tree.language.types[this.typeId] || "ERROR";
    }
    /**
     * Get this node's symbol name as it appears in the grammar, ignoring
     * aliases as a string.
     */
    get grammarType() {
      return this.tree.language.types[this.grammarId] || "ERROR";
    }
    /**
     * Check if this node is *named*.
     *
     * Named nodes correspond to named rules in the grammar, whereas
     * *anonymous* nodes correspond to string literals in the grammar.
     */
    get isNamed() {
      marshalNode(this);
      return C._ts_node_is_named_wasm(this.tree[0]) === 1;
    }
    /**
     * Check if this node is *extra*.
     *
     * Extra nodes represent things like comments, which are not required
     * by the grammar, but can appear anywhere.
     */
    get isExtra() {
      marshalNode(this);
      return C._ts_node_is_extra_wasm(this.tree[0]) === 1;
    }
    /**
     * Check if this node represents a syntax error.
     *
     * Syntax errors represent parts of the code that could not be incorporated
     * into a valid syntax tree.
     */
    get isError() {
      marshalNode(this);
      return C._ts_node_is_error_wasm(this.tree[0]) === 1;
    }
    /**
     * Check if this node is *missing*.
     *
     * Missing nodes are inserted by the parser in order to recover from
     * certain kinds of syntax errors.
     */
    get isMissing() {
      marshalNode(this);
      return C._ts_node_is_missing_wasm(this.tree[0]) === 1;
    }
    /** Check if this node has been edited. */
    get hasChanges() {
      marshalNode(this);
      return C._ts_node_has_changes_wasm(this.tree[0]) === 1;
    }
    /**
     * Check if this node represents a syntax error or contains any syntax
     * errors anywhere within it.
     */
    get hasError() {
      marshalNode(this);
      return C._ts_node_has_error_wasm(this.tree[0]) === 1;
    }
    /** Get the byte index where this node ends. */
    get endIndex() {
      marshalNode(this);
      return C._ts_node_end_index_wasm(this.tree[0]);
    }
    /** Get the position where this node ends. */
    get endPosition() {
      marshalNode(this);
      C._ts_node_end_point_wasm(this.tree[0]);
      return unmarshalPoint(TRANSFER_BUFFER);
    }
    /** Get the string content of this node. */
    get text() {
      return getText(this.tree, this.startIndex, this.endIndex, this.startPosition);
    }
    /** Get this node's parse state. */
    get parseState() {
      marshalNode(this);
      return C._ts_node_parse_state_wasm(this.tree[0]);
    }
    /** Get the parse state after this node. */
    get nextParseState() {
      marshalNode(this);
      return C._ts_node_next_parse_state_wasm(this.tree[0]);
    }
    /** Check if this node is equal to another node. */
    equals(other) {
      return this.tree === other.tree && this.id === other.id;
    }
    /**
     * Get the node's child at the given index, where zero represents the first child.
     *
     * This method is fairly fast, but its cost is technically log(n), so if
     * you might be iterating over a long list of children, you should use
     * {@link Node#children} instead.
     */
    child(index) {
      marshalNode(this);
      C._ts_node_child_wasm(this.tree[0], index);
      return unmarshalNode(this.tree);
    }
    /**
     * Get this node's *named* child at the given index.
     *
     * See also {@link Node#isNamed}.
     * This method is fairly fast, but its cost is technically log(n), so if
     * you might be iterating over a long list of children, you should use
     * {@link Node#namedChildren} instead.
     */
    namedChild(index) {
      marshalNode(this);
      C._ts_node_named_child_wasm(this.tree[0], index);
      return unmarshalNode(this.tree);
    }
    /**
     * Get this node's child with the given numerical field id.
     *
     * See also {@link Node#childForFieldName}. You can
     * convert a field name to an id using {@link Language#fieldIdForName}.
     */
    childForFieldId(fieldId) {
      marshalNode(this);
      C._ts_node_child_by_field_id_wasm(this.tree[0], fieldId);
      return unmarshalNode(this.tree);
    }
    /**
     * Get the first child with the given field name.
     *
     * If multiple children may have the same field name, access them using
     * {@link Node#childrenForFieldName}.
     */
    childForFieldName(fieldName) {
      const fieldId = this.tree.language.fields.indexOf(fieldName);
      if (fieldId !== -1) return this.childForFieldId(fieldId);
      return null;
    }
    /** Get the field name of this node's child at the given index. */
    fieldNameForChild(index) {
      marshalNode(this);
      const address = C._ts_node_field_name_for_child_wasm(this.tree[0], index);
      if (!address) return null;
      return C.AsciiToString(address);
    }
    /** Get the field name of this node's named child at the given index. */
    fieldNameForNamedChild(index) {
      marshalNode(this);
      const address = C._ts_node_field_name_for_named_child_wasm(this.tree[0], index);
      if (!address) return null;
      return C.AsciiToString(address);
    }
    /**
     * Get an array of this node's children with a given field name.
     *
     * See also {@link Node#children}.
     */
    childrenForFieldName(fieldName) {
      const fieldId = this.tree.language.fields.indexOf(fieldName);
      if (fieldId !== -1 && fieldId !== 0) return this.childrenForFieldId(fieldId);
      return [];
    }
    /**
      * Get an array of this node's children with a given field id.
      *
      * See also {@link Node#childrenForFieldName}.
      */
    childrenForFieldId(fieldId) {
      marshalNode(this);
      C._ts_node_children_by_field_id_wasm(this.tree[0], fieldId);
      const count = C.getValue(TRANSFER_BUFFER, "i32");
      const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
      const result = new Array(count);
      if (count > 0) {
        let address = buffer;
        for (let i2 = 0; i2 < count; i2++) {
          result[i2] = unmarshalNode(this.tree, address);
          address += SIZE_OF_NODE;
        }
        C._free(buffer);
      }
      return result;
    }
    /** Get the node's first child that contains or starts after the given byte offset. */
    firstChildForIndex(index) {
      marshalNode(this);
      const address = TRANSFER_BUFFER + SIZE_OF_NODE;
      C.setValue(address, index, "i32");
      C._ts_node_first_child_for_byte_wasm(this.tree[0]);
      return unmarshalNode(this.tree);
    }
    /** Get the node's first named child that contains or starts after the given byte offset. */
    firstNamedChildForIndex(index) {
      marshalNode(this);
      const address = TRANSFER_BUFFER + SIZE_OF_NODE;
      C.setValue(address, index, "i32");
      C._ts_node_first_named_child_for_byte_wasm(this.tree[0]);
      return unmarshalNode(this.tree);
    }
    /** Get this node's number of children. */
    get childCount() {
      marshalNode(this);
      return C._ts_node_child_count_wasm(this.tree[0]);
    }
    /**
     * Get this node's number of *named* children.
     *
     * See also {@link Node#isNamed}.
     */
    get namedChildCount() {
      marshalNode(this);
      return C._ts_node_named_child_count_wasm(this.tree[0]);
    }
    /** Get this node's first child. */
    get firstChild() {
      return this.child(0);
    }
    /**
     * Get this node's first named child.
     *
     * See also {@link Node#isNamed}.
     */
    get firstNamedChild() {
      return this.namedChild(0);
    }
    /** Get this node's last child. */
    get lastChild() {
      return this.child(this.childCount - 1);
    }
    /**
     * Get this node's last named child.
     *
     * See also {@link Node#isNamed}.
     */
    get lastNamedChild() {
      return this.namedChild(this.namedChildCount - 1);
    }
    /**
     * Iterate over this node's children.
     *
     * If you're walking the tree recursively, you may want to use the
     * {@link TreeCursor} APIs directly instead.
     */
    get children() {
      if (!this._children) {
        marshalNode(this);
        C._ts_node_children_wasm(this.tree[0]);
        const count = C.getValue(TRANSFER_BUFFER, "i32");
        const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        this._children = new Array(count);
        if (count > 0) {
          let address = buffer;
          for (let i2 = 0; i2 < count; i2++) {
            this._children[i2] = unmarshalNode(this.tree, address);
            address += SIZE_OF_NODE;
          }
          C._free(buffer);
        }
      }
      return this._children;
    }
    /**
     * Iterate over this node's named children.
     *
     * See also {@link Node#children}.
     */
    get namedChildren() {
      if (!this._namedChildren) {
        marshalNode(this);
        C._ts_node_named_children_wasm(this.tree[0]);
        const count = C.getValue(TRANSFER_BUFFER, "i32");
        const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        this._namedChildren = new Array(count);
        if (count > 0) {
          let address = buffer;
          for (let i2 = 0; i2 < count; i2++) {
            this._namedChildren[i2] = unmarshalNode(this.tree, address);
            address += SIZE_OF_NODE;
          }
          C._free(buffer);
        }
      }
      return this._namedChildren;
    }
    /**
     * Get the descendants of this node that are the given type, or in the given types array.
     *
     * The types array should contain node type strings, which can be retrieved from {@link Language#types}.
     *
     * Additionally, a `startPosition` and `endPosition` can be passed in to restrict the search to a byte range.
     */
    descendantsOfType(types, startPosition = ZERO_POINT, endPosition = ZERO_POINT) {
      if (!Array.isArray(types)) types = [types];
      const symbols = [];
      const typesBySymbol = this.tree.language.types;
      for (const node_type of types) {
        if (node_type == "ERROR") {
          symbols.push(65535);
        }
      }
      for (let i2 = 0, n = typesBySymbol.length; i2 < n; i2++) {
        if (types.includes(typesBySymbol[i2])) {
          symbols.push(i2);
        }
      }
      const symbolsAddress = C._malloc(SIZE_OF_INT * symbols.length);
      for (let i2 = 0, n = symbols.length; i2 < n; i2++) {
        C.setValue(symbolsAddress + i2 * SIZE_OF_INT, symbols[i2], "i32");
      }
      marshalNode(this);
      C._ts_node_descendants_of_type_wasm(
        this.tree[0],
        symbolsAddress,
        symbols.length,
        startPosition.row,
        startPosition.column,
        endPosition.row,
        endPosition.column
      );
      const descendantCount = C.getValue(TRANSFER_BUFFER, "i32");
      const descendantAddress = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
      const result = new Array(descendantCount);
      if (descendantCount > 0) {
        let address = descendantAddress;
        for (let i2 = 0; i2 < descendantCount; i2++) {
          result[i2] = unmarshalNode(this.tree, address);
          address += SIZE_OF_NODE;
        }
      }
      C._free(descendantAddress);
      C._free(symbolsAddress);
      return result;
    }
    /** Get this node's next sibling. */
    get nextSibling() {
      marshalNode(this);
      C._ts_node_next_sibling_wasm(this.tree[0]);
      return unmarshalNode(this.tree);
    }
    /** Get this node's previous sibling. */
    get previousSibling() {
      marshalNode(this);
      C._ts_node_prev_sibling_wasm(this.tree[0]);
      return unmarshalNode(this.tree);
    }
    /**
     * Get this node's next *named* sibling.
     *
     * See also {@link Node#isNamed}.
     */
    get nextNamedSibling() {
      marshalNode(this);
      C._ts_node_next_named_sibling_wasm(this.tree[0]);
      return unmarshalNode(this.tree);
    }
    /**
     * Get this node's previous *named* sibling.
     *
     * See also {@link Node#isNamed}.
     */
    get previousNamedSibling() {
      marshalNode(this);
      C._ts_node_prev_named_sibling_wasm(this.tree[0]);
      return unmarshalNode(this.tree);
    }
    /** Get the node's number of descendants, including one for the node itself. */
    get descendantCount() {
      marshalNode(this);
      return C._ts_node_descendant_count_wasm(this.tree[0]);
    }
    /**
     * Get this node's immediate parent.
     * Prefer {@link Node#childWithDescendant} for iterating over this node's ancestors.
     */
    get parent() {
      marshalNode(this);
      C._ts_node_parent_wasm(this.tree[0]);
      return unmarshalNode(this.tree);
    }
    /**
     * Get the node that contains `descendant`.
     *
     * Note that this can return `descendant` itself.
     */
    childWithDescendant(descendant) {
      marshalNode(this);
      marshalNode(descendant, 1);
      C._ts_node_child_with_descendant_wasm(this.tree[0]);
      return unmarshalNode(this.tree);
    }
    /** Get the smallest node within this node that spans the given byte range. */
    descendantForIndex(start2, end = start2) {
      if (typeof start2 !== "number" || typeof end !== "number") {
        throw new Error("Arguments must be numbers");
      }
      marshalNode(this);
      const address = TRANSFER_BUFFER + SIZE_OF_NODE;
      C.setValue(address, start2, "i32");
      C.setValue(address + SIZE_OF_INT, end, "i32");
      C._ts_node_descendant_for_index_wasm(this.tree[0]);
      return unmarshalNode(this.tree);
    }
    /** Get the smallest named node within this node that spans the given byte range. */
    namedDescendantForIndex(start2, end = start2) {
      if (typeof start2 !== "number" || typeof end !== "number") {
        throw new Error("Arguments must be numbers");
      }
      marshalNode(this);
      const address = TRANSFER_BUFFER + SIZE_OF_NODE;
      C.setValue(address, start2, "i32");
      C.setValue(address + SIZE_OF_INT, end, "i32");
      C._ts_node_named_descendant_for_index_wasm(this.tree[0]);
      return unmarshalNode(this.tree);
    }
    /** Get the smallest node within this node that spans the given point range. */
    descendantForPosition(start2, end = start2) {
      if (!isPoint(start2) || !isPoint(end)) {
        throw new Error("Arguments must be {row, column} objects");
      }
      marshalNode(this);
      const address = TRANSFER_BUFFER + SIZE_OF_NODE;
      marshalPoint(address, start2);
      marshalPoint(address + SIZE_OF_POINT, end);
      C._ts_node_descendant_for_position_wasm(this.tree[0]);
      return unmarshalNode(this.tree);
    }
    /** Get the smallest named node within this node that spans the given point range. */
    namedDescendantForPosition(start2, end = start2) {
      if (!isPoint(start2) || !isPoint(end)) {
        throw new Error("Arguments must be {row, column} objects");
      }
      marshalNode(this);
      const address = TRANSFER_BUFFER + SIZE_OF_NODE;
      marshalPoint(address, start2);
      marshalPoint(address + SIZE_OF_POINT, end);
      C._ts_node_named_descendant_for_position_wasm(this.tree[0]);
      return unmarshalNode(this.tree);
    }
    /**
     * Create a new {@link TreeCursor} starting from this node.
     *
     * Note that the given node is considered the root of the cursor,
     * and the cursor cannot walk outside this node.
     */
    walk() {
      marshalNode(this);
      C._ts_tree_cursor_new_wasm(this.tree[0]);
      return new TreeCursor(INTERNAL, this.tree);
    }
    /**
     * Edit this node to keep it in-sync with source code that has been edited.
     *
     * This function is only rarely needed. When you edit a syntax tree with
     * the {@link Tree#edit} method, all of the nodes that you retrieve from
     * the tree afterward will already reflect the edit. You only need to
     * use {@link Node#edit} when you have a specific {@link Node} instance that
     * you want to keep and continue to use after an edit.
     */
    edit(edit) {
      if (this.startIndex >= edit.oldEndIndex) {
        this.startIndex = edit.newEndIndex + (this.startIndex - edit.oldEndIndex);
        let subbedPointRow;
        let subbedPointColumn;
        if (this.startPosition.row > edit.oldEndPosition.row) {
          subbedPointRow = this.startPosition.row - edit.oldEndPosition.row;
          subbedPointColumn = this.startPosition.column;
        } else {
          subbedPointRow = 0;
          subbedPointColumn = this.startPosition.column;
          if (this.startPosition.column >= edit.oldEndPosition.column) {
            subbedPointColumn = this.startPosition.column - edit.oldEndPosition.column;
          }
        }
        if (subbedPointRow > 0) {
          this.startPosition.row += subbedPointRow;
          this.startPosition.column = subbedPointColumn;
        } else {
          this.startPosition.column += subbedPointColumn;
        }
      } else if (this.startIndex > edit.startIndex) {
        this.startIndex = edit.newEndIndex;
        this.startPosition.row = edit.newEndPosition.row;
        this.startPosition.column = edit.newEndPosition.column;
      }
    }
    /** Get the S-expression representation of this node. */
    toString() {
      marshalNode(this);
      const address = C._ts_node_to_string_wasm(this.tree[0]);
      const result = C.AsciiToString(address);
      C._free(address);
      return result;
    }
  };
  function unmarshalCaptures(query, tree, address, patternIndex, result) {
    for (let i2 = 0, n = result.length; i2 < n; i2++) {
      const captureIndex = C.getValue(address, "i32");
      address += SIZE_OF_INT;
      const node = unmarshalNode(tree, address);
      address += SIZE_OF_NODE;
      result[i2] = { patternIndex, name: query.captureNames[captureIndex], node };
    }
    return address;
  }
  __name(unmarshalCaptures, "unmarshalCaptures");
  function marshalNode(node, index = 0) {
    let address = TRANSFER_BUFFER + index * SIZE_OF_NODE;
    C.setValue(address, node.id, "i32");
    address += SIZE_OF_INT;
    C.setValue(address, node.startIndex, "i32");
    address += SIZE_OF_INT;
    C.setValue(address, node.startPosition.row, "i32");
    address += SIZE_OF_INT;
    C.setValue(address, node.startPosition.column, "i32");
    address += SIZE_OF_INT;
    C.setValue(address, node[0], "i32");
  }
  __name(marshalNode, "marshalNode");
  function unmarshalNode(tree, address = TRANSFER_BUFFER) {
    const id = C.getValue(address, "i32");
    address += SIZE_OF_INT;
    if (id === 0) return null;
    const index = C.getValue(address, "i32");
    address += SIZE_OF_INT;
    const row = C.getValue(address, "i32");
    address += SIZE_OF_INT;
    const column = C.getValue(address, "i32");
    address += SIZE_OF_INT;
    const other = C.getValue(address, "i32");
    const result = new Node(INTERNAL, {
      id,
      tree,
      startIndex: index,
      startPosition: { row, column },
      other
    });
    return result;
  }
  __name(unmarshalNode, "unmarshalNode");
  function marshalTreeCursor(cursor2, address = TRANSFER_BUFFER) {
    C.setValue(address + 0 * SIZE_OF_INT, cursor2[0], "i32");
    C.setValue(address + 1 * SIZE_OF_INT, cursor2[1], "i32");
    C.setValue(address + 2 * SIZE_OF_INT, cursor2[2], "i32");
    C.setValue(address + 3 * SIZE_OF_INT, cursor2[3], "i32");
  }
  __name(marshalTreeCursor, "marshalTreeCursor");
  function unmarshalTreeCursor(cursor2) {
    cursor2[0] = C.getValue(TRANSFER_BUFFER + 0 * SIZE_OF_INT, "i32");
    cursor2[1] = C.getValue(TRANSFER_BUFFER + 1 * SIZE_OF_INT, "i32");
    cursor2[2] = C.getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32");
    cursor2[3] = C.getValue(TRANSFER_BUFFER + 3 * SIZE_OF_INT, "i32");
  }
  __name(unmarshalTreeCursor, "unmarshalTreeCursor");
  function marshalPoint(address, point) {
    C.setValue(address, point.row, "i32");
    C.setValue(address + SIZE_OF_INT, point.column, "i32");
  }
  __name(marshalPoint, "marshalPoint");
  function unmarshalPoint(address) {
    const result = {
      row: C.getValue(address, "i32") >>> 0,
      column: C.getValue(address + SIZE_OF_INT, "i32") >>> 0
    };
    return result;
  }
  __name(unmarshalPoint, "unmarshalPoint");
  function marshalRange(address, range) {
    marshalPoint(address, range.startPosition);
    address += SIZE_OF_POINT;
    marshalPoint(address, range.endPosition);
    address += SIZE_OF_POINT;
    C.setValue(address, range.startIndex, "i32");
    address += SIZE_OF_INT;
    C.setValue(address, range.endIndex, "i32");
    address += SIZE_OF_INT;
  }
  __name(marshalRange, "marshalRange");
  function unmarshalRange(address) {
    const result = {};
    result.startPosition = unmarshalPoint(address);
    address += SIZE_OF_POINT;
    result.endPosition = unmarshalPoint(address);
    address += SIZE_OF_POINT;
    result.startIndex = C.getValue(address, "i32") >>> 0;
    address += SIZE_OF_INT;
    result.endIndex = C.getValue(address, "i32") >>> 0;
    return result;
  }
  __name(unmarshalRange, "unmarshalRange");
  function marshalEdit(edit, address = TRANSFER_BUFFER) {
    marshalPoint(address, edit.startPosition);
    address += SIZE_OF_POINT;
    marshalPoint(address, edit.oldEndPosition);
    address += SIZE_OF_POINT;
    marshalPoint(address, edit.newEndPosition);
    address += SIZE_OF_POINT;
    C.setValue(address, edit.startIndex, "i32");
    address += SIZE_OF_INT;
    C.setValue(address, edit.oldEndIndex, "i32");
    address += SIZE_OF_INT;
    C.setValue(address, edit.newEndIndex, "i32");
    address += SIZE_OF_INT;
  }
  __name(marshalEdit, "marshalEdit");
  function unmarshalLanguageMetadata(address) {
    const major_version = C.getValue(address, "i32");
    const minor_version = C.getValue(address += SIZE_OF_INT, "i32");
    const patch_version = C.getValue(address += SIZE_OF_INT, "i32");
    return { major_version, minor_version, patch_version };
  }
  __name(unmarshalLanguageMetadata, "unmarshalLanguageMetadata");
  var LANGUAGE_FUNCTION_REGEX = /^tree_sitter_\w+$/;
  var Language = class _Language {
    static {
      __name(this, "Language");
    }
    /** @internal */
    [0] = 0;
    // Internal handle for Wasm
    /**
     * A list of all node types in the language. The index of each type in this
     * array is its node type id.
     */
    types;
    /**
     * A list of all field names in the language. The index of each field name in
     * this array is its field id.
     */
    fields;
    /** @internal */
    constructor(internal, address) {
      assertInternal(internal);
      this[0] = address;
      this.types = new Array(C._ts_language_symbol_count(this[0]));
      for (let i2 = 0, n = this.types.length; i2 < n; i2++) {
        if (C._ts_language_symbol_type(this[0], i2) < 2) {
          this.types[i2] = C.UTF8ToString(C._ts_language_symbol_name(this[0], i2));
        }
      }
      this.fields = new Array(C._ts_language_field_count(this[0]) + 1);
      for (let i2 = 0, n = this.fields.length; i2 < n; i2++) {
        const fieldName = C._ts_language_field_name_for_id(this[0], i2);
        if (fieldName !== 0) {
          this.fields[i2] = C.UTF8ToString(fieldName);
        } else {
          this.fields[i2] = null;
        }
      }
    }
    /**
     * Gets the name of the language.
     */
    get name() {
      const ptr = C._ts_language_name(this[0]);
      if (ptr === 0) return null;
      return C.UTF8ToString(ptr);
    }
    /**
     * Gets the ABI version of the language.
     */
    get abiVersion() {
      return C._ts_language_abi_version(this[0]);
    }
    /**
    * Get the metadata for this language. This information is generated by the
    * CLI, and relies on the language author providing the correct metadata in
    * the language's `tree-sitter.json` file.
    */
    get metadata() {
      C._ts_language_metadata_wasm(this[0]);
      const length = C.getValue(TRANSFER_BUFFER, "i32");
      if (length === 0) return null;
      return unmarshalLanguageMetadata(TRANSFER_BUFFER + SIZE_OF_INT);
    }
    /**
     * Gets the number of fields in the language.
     */
    get fieldCount() {
      return this.fields.length - 1;
    }
    /**
     * Gets the number of states in the language.
     */
    get stateCount() {
      return C._ts_language_state_count(this[0]);
    }
    /**
     * Get the field id for a field name.
     */
    fieldIdForName(fieldName) {
      const result = this.fields.indexOf(fieldName);
      return result !== -1 ? result : null;
    }
    /**
     * Get the field name for a field id.
     */
    fieldNameForId(fieldId) {
      return this.fields[fieldId] ?? null;
    }
    /**
     * Get the node type id for a node type name.
     */
    idForNodeType(type, named) {
      const typeLength = C.lengthBytesUTF8(type);
      const typeAddress = C._malloc(typeLength + 1);
      C.stringToUTF8(type, typeAddress, typeLength + 1);
      const result = C._ts_language_symbol_for_name(this[0], typeAddress, typeLength, named ? 1 : 0);
      C._free(typeAddress);
      return result || null;
    }
    /**
     * Gets the number of node types in the language.
     */
    get nodeTypeCount() {
      return C._ts_language_symbol_count(this[0]);
    }
    /**
     * Get the node type name for a node type id.
     */
    nodeTypeForId(typeId) {
      const name2 = C._ts_language_symbol_name(this[0], typeId);
      return name2 ? C.UTF8ToString(name2) : null;
    }
    /**
     * Check if a node type is named.
     *
     * @see {@link https://tree-sitter.github.io/tree-sitter/using-parsers/2-basic-parsing.html#named-vs-anonymous-nodes}
     */
    nodeTypeIsNamed(typeId) {
      return C._ts_language_type_is_named_wasm(this[0], typeId) ? true : false;
    }
    /**
     * Check if a node type is visible.
     */
    nodeTypeIsVisible(typeId) {
      return C._ts_language_type_is_visible_wasm(this[0], typeId) ? true : false;
    }
    /**
     * Get the supertypes ids of this language.
     *
     * @see {@link https://tree-sitter.github.io/tree-sitter/using-parsers/6-static-node-types.html?highlight=supertype#supertype-nodes}
     */
    get supertypes() {
      C._ts_language_supertypes_wasm(this[0]);
      const count = C.getValue(TRANSFER_BUFFER, "i32");
      const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
      const result = new Array(count);
      if (count > 0) {
        let address = buffer;
        for (let i2 = 0; i2 < count; i2++) {
          result[i2] = C.getValue(address, "i16");
          address += SIZE_OF_SHORT;
        }
      }
      return result;
    }
    /**
     * Get the subtype ids for a given supertype node id.
     */
    subtypes(supertype) {
      C._ts_language_subtypes_wasm(this[0], supertype);
      const count = C.getValue(TRANSFER_BUFFER, "i32");
      const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
      const result = new Array(count);
      if (count > 0) {
        let address = buffer;
        for (let i2 = 0; i2 < count; i2++) {
          result[i2] = C.getValue(address, "i16");
          address += SIZE_OF_SHORT;
        }
      }
      return result;
    }
    /**
     * Get the next state id for a given state id and node type id.
     */
    nextState(stateId, typeId) {
      return C._ts_language_next_state(this[0], stateId, typeId);
    }
    /**
     * Create a new lookahead iterator for this language and parse state.
     *
     * This returns `null` if state is invalid for this language.
     *
     * Iterating {@link LookaheadIterator} will yield valid symbols in the given
     * parse state. Newly created lookahead iterators will return the `ERROR`
     * symbol from {@link LookaheadIterator#currentType}.
     *
     * Lookahead iterators can be useful for generating suggestions and improving
     * syntax error diagnostics. To get symbols valid in an `ERROR` node, use the
     * lookahead iterator on its first leaf node state. For `MISSING` nodes, a
     * lookahead iterator created on the previous non-extra leaf node may be
     * appropriate.
     */
    lookaheadIterator(stateId) {
      const address = C._ts_lookahead_iterator_new(this[0], stateId);
      if (address) return new LookaheadIterator(INTERNAL, address, this);
      return null;
    }
    /**
     * Load a language from a WebAssembly module.
     * The module can be provided as a path to a file or as a buffer.
     */
    static async load(input) {
      let binary2;
      if (input instanceof Uint8Array) {
        binary2 = input;
      } else if (globalThis.process?.versions.node) {
        const fs2 = await import("fs/promises");
        binary2 = await fs2.readFile(input);
      } else {
        const response = await fetch(input);
        if (!response.ok) {
          const body2 = await response.text();
          throw new Error(`Language.load failed with status ${response.status}.

${body2}`);
        }
        const retryResp = response.clone();
        try {
          binary2 = await WebAssembly.compileStreaming(response);
        } catch (reason) {
          console.error("wasm streaming compile failed:", reason);
          console.error("falling back to ArrayBuffer instantiation");
          binary2 = new Uint8Array(await retryResp.arrayBuffer());
        }
      }
      const mod = await C.loadWebAssemblyModule(binary2, { loadAsync: true });
      const symbolNames = Object.keys(mod);
      const functionName = symbolNames.find((key) => LANGUAGE_FUNCTION_REGEX.test(key) && !key.includes("external_scanner_"));
      if (!functionName) {
        console.log(`Couldn't find language function in Wasm file. Symbols:
${JSON.stringify(symbolNames, null, 2)}`);
        throw new Error("Language.load failed: no language function found in Wasm file");
      }
      const languageAddress = mod[functionName]();
      return new _Language(INTERNAL, languageAddress);
    }
  };
  async function Module2(moduleArg = {}) {
    var moduleRtn;
    var Module = moduleArg;
    var ENVIRONMENT_IS_WEB = typeof window == "object";
    var ENVIRONMENT_IS_WORKER = typeof WorkerGlobalScope != "undefined";
    var ENVIRONMENT_IS_NODE = typeof process == "object" && process.versions?.node && process.type != "renderer";
    if (ENVIRONMENT_IS_NODE) {
      const { createRequire } = await import("module");
      var require = createRequire(import_meta.url);
    }
    Module.currentQueryProgressCallback = null;
    Module.currentProgressCallback = null;
    Module.currentLogCallback = null;
    Module.currentParseCallback = null;
    var arguments_ = [];
    var thisProgram = "./this.program";
    var quit_ = /* @__PURE__ */ __name((status, toThrow) => {
      throw toThrow;
    }, "quit_");
    var _scriptName = import_meta.url;
    var scriptDirectory = "";
    function locateFile(path) {
      if (Module["locateFile"]) {
        return Module["locateFile"](path, scriptDirectory);
      }
      return scriptDirectory + path;
    }
    __name(locateFile, "locateFile");
    var readAsync, readBinary;
    if (ENVIRONMENT_IS_NODE) {
      var fs = require("fs");
      if (_scriptName.startsWith("file:")) {
        scriptDirectory = require("path").dirname(require("url").fileURLToPath(_scriptName)) + "/";
      }
      readBinary = /* @__PURE__ */ __name((filename) => {
        filename = isFileURI(filename) ? new URL(filename) : filename;
        var ret = fs.readFileSync(filename);
        return ret;
      }, "readBinary");
      readAsync = /* @__PURE__ */ __name(async (filename, binary2 = true) => {
        filename = isFileURI(filename) ? new URL(filename) : filename;
        var ret = fs.readFileSync(filename, binary2 ? void 0 : "utf8");
        return ret;
      }, "readAsync");
      if (process.argv.length > 1) {
        thisProgram = process.argv[1].replace(/\\/g, "/");
      }
      arguments_ = process.argv.slice(2);
      quit_ = /* @__PURE__ */ __name((status, toThrow) => {
        process.exitCode = status;
        throw toThrow;
      }, "quit_");
    } else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
      try {
        scriptDirectory = new URL(".", _scriptName).href;
      } catch {
      }
      {
        if (ENVIRONMENT_IS_WORKER) {
          readBinary = /* @__PURE__ */ __name((url) => {
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url, false);
            xhr.responseType = "arraybuffer";
            xhr.send(null);
            return new Uint8Array(
              /** @type{!ArrayBuffer} */
              xhr.response
            );
          }, "readBinary");
        }
        readAsync = /* @__PURE__ */ __name(async (url) => {
          if (isFileURI(url)) {
            return new Promise((resolve, reject) => {
              var xhr = new XMLHttpRequest();
              xhr.open("GET", url, true);
              xhr.responseType = "arraybuffer";
              xhr.onload = () => {
                if (xhr.status == 200 || xhr.status == 0 && xhr.response) {
                  resolve(xhr.response);
                  return;
                }
                reject(xhr.status);
              };
              xhr.onerror = reject;
              xhr.send(null);
            });
          }
          var response = await fetch(url, {
            credentials: "same-origin"
          });
          if (response.ok) {
            return response.arrayBuffer();
          }
          throw new Error(response.status + " : " + response.url);
        }, "readAsync");
      }
    } else {
    }
    var out = console.log.bind(console);
    var err = console.error.bind(console);
    var dynamicLibraries = [];
    var wasmBinary;
    var ABORT = false;
    var EXITSTATUS;
    var isFileURI = /* @__PURE__ */ __name((filename) => filename.startsWith("file://"), "isFileURI");
    var readyPromiseResolve, readyPromiseReject;
    var wasmMemory;
    var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
    var HEAP64, HEAPU64;
    var HEAP_DATA_VIEW;
    var runtimeInitialized = false;
    function updateMemoryViews() {
      var b2 = wasmMemory.buffer;
      Module["HEAP8"] = HEAP8 = new Int8Array(b2);
      Module["HEAP16"] = HEAP16 = new Int16Array(b2);
      Module["HEAPU8"] = HEAPU8 = new Uint8Array(b2);
      Module["HEAPU16"] = HEAPU16 = new Uint16Array(b2);
      Module["HEAP32"] = HEAP32 = new Int32Array(b2);
      Module["HEAPU32"] = HEAPU32 = new Uint32Array(b2);
      Module["HEAPF32"] = HEAPF32 = new Float32Array(b2);
      Module["HEAPF64"] = HEAPF64 = new Float64Array(b2);
      Module["HEAP64"] = HEAP64 = new BigInt64Array(b2);
      Module["HEAPU64"] = HEAPU64 = new BigUint64Array(b2);
      Module["HEAP_DATA_VIEW"] = HEAP_DATA_VIEW = new DataView(b2);
      LE_HEAP_UPDATE();
    }
    __name(updateMemoryViews, "updateMemoryViews");
    function initMemory() {
      if (Module["wasmMemory"]) {
        wasmMemory = Module["wasmMemory"];
      } else {
        var INITIAL_MEMORY = Module["INITIAL_MEMORY"] || 33554432;
        wasmMemory = new WebAssembly.Memory({
          "initial": INITIAL_MEMORY / 65536,
          // In theory we should not need to emit the maximum if we want "unlimited"
          // or 4GB of memory, but VMs error on that atm, see
          // https://github.com/emscripten-core/emscripten/issues/14130
          // And in the pthreads case we definitely need to emit a maximum. So
          // always emit one.
          "maximum": 32768
        });
      }
      updateMemoryViews();
    }
    __name(initMemory, "initMemory");
    var __RELOC_FUNCS__ = [];
    function preRun() {
      if (Module["preRun"]) {
        if (typeof Module["preRun"] == "function") Module["preRun"] = [Module["preRun"]];
        while (Module["preRun"].length) {
          addOnPreRun(Module["preRun"].shift());
        }
      }
      callRuntimeCallbacks(onPreRuns);
    }
    __name(preRun, "preRun");
    function initRuntime() {
      runtimeInitialized = true;
      callRuntimeCallbacks(__RELOC_FUNCS__);
      wasmExports["__wasm_call_ctors"]();
      callRuntimeCallbacks(onPostCtors);
    }
    __name(initRuntime, "initRuntime");
    function preMain() {
    }
    __name(preMain, "preMain");
    function postRun() {
      if (Module["postRun"]) {
        if (typeof Module["postRun"] == "function") Module["postRun"] = [Module["postRun"]];
        while (Module["postRun"].length) {
          addOnPostRun(Module["postRun"].shift());
        }
      }
      callRuntimeCallbacks(onPostRuns);
    }
    __name(postRun, "postRun");
    function abort(what) {
      Module["onAbort"]?.(what);
      what = "Aborted(" + what + ")";
      err(what);
      ABORT = true;
      what += ". Build with -sASSERTIONS for more info.";
      var e = new WebAssembly.RuntimeError(what);
      readyPromiseReject?.(e);
      throw e;
    }
    __name(abort, "abort");
    var wasmBinaryFile;
    function findWasmBinary() {
      if (Module["locateFile"]) {
        return locateFile("web-tree-sitter.wasm");
      }
      return new URL("web-tree-sitter.wasm", import_meta.url).href;
    }
    __name(findWasmBinary, "findWasmBinary");
    function getBinarySync(file) {
      if (file == wasmBinaryFile && wasmBinary) {
        return new Uint8Array(wasmBinary);
      }
      if (readBinary) {
        return readBinary(file);
      }
      throw "both async and sync fetching of the wasm failed";
    }
    __name(getBinarySync, "getBinarySync");
    async function getWasmBinary(binaryFile) {
      if (!wasmBinary) {
        try {
          var response = await readAsync(binaryFile);
          return new Uint8Array(response);
        } catch {
        }
      }
      return getBinarySync(binaryFile);
    }
    __name(getWasmBinary, "getWasmBinary");
    async function instantiateArrayBuffer(binaryFile, imports) {
      try {
        var binary2 = await getWasmBinary(binaryFile);
        var instance2 = await WebAssembly.instantiate(binary2, imports);
        return instance2;
      } catch (reason) {
        err(`failed to asynchronously prepare wasm: ${reason}`);
        abort(reason);
      }
    }
    __name(instantiateArrayBuffer, "instantiateArrayBuffer");
    async function instantiateAsync(binary2, binaryFile, imports) {
      if (!binary2 && !isFileURI(binaryFile) && !ENVIRONMENT_IS_NODE) {
        try {
          var response = fetch(binaryFile, {
            credentials: "same-origin"
          });
          var instantiationResult = await WebAssembly.instantiateStreaming(response, imports);
          return instantiationResult;
        } catch (reason) {
          err(`wasm streaming compile failed: ${reason}`);
          err("falling back to ArrayBuffer instantiation");
        }
      }
      return instantiateArrayBuffer(binaryFile, imports);
    }
    __name(instantiateAsync, "instantiateAsync");
    function getWasmImports() {
      return {
        "env": wasmImports,
        "wasi_snapshot_preview1": wasmImports,
        "GOT.mem": new Proxy(wasmImports, GOTHandler),
        "GOT.func": new Proxy(wasmImports, GOTHandler)
      };
    }
    __name(getWasmImports, "getWasmImports");
    async function createWasm() {
      function receiveInstance(instance2, module2) {
        wasmExports = instance2.exports;
        wasmExports = relocateExports(wasmExports, 1024);
        var metadata2 = getDylinkMetadata(module2);
        if (metadata2.neededDynlibs) {
          dynamicLibraries = metadata2.neededDynlibs.concat(dynamicLibraries);
        }
        mergeLibSymbols(wasmExports, "main");
        LDSO.init();
        loadDylibs();
        __RELOC_FUNCS__.push(wasmExports["__wasm_apply_data_relocs"]);
        assignWasmExports(wasmExports);
        return wasmExports;
      }
      __name(receiveInstance, "receiveInstance");
      function receiveInstantiationResult(result2) {
        return receiveInstance(result2["instance"], result2["module"]);
      }
      __name(receiveInstantiationResult, "receiveInstantiationResult");
      var info2 = getWasmImports();
      if (Module["instantiateWasm"]) {
        return new Promise((resolve, reject) => {
          Module["instantiateWasm"](info2, (mod, inst) => {
            resolve(receiveInstance(mod, inst));
          });
        });
      }
      wasmBinaryFile ??= findWasmBinary();
      var result = await instantiateAsync(wasmBinary, wasmBinaryFile, info2);
      var exports = receiveInstantiationResult(result);
      return exports;
    }
    __name(createWasm, "createWasm");
    class ExitStatus {
      static {
        __name(this, "ExitStatus");
      }
      name = "ExitStatus";
      constructor(status) {
        this.message = `Program terminated with exit(${status})`;
        this.status = status;
      }
    }
    var GOT = {};
    var currentModuleWeakSymbols = /* @__PURE__ */ new Set([]);
    var GOTHandler = {
      get(obj, symName) {
        var rtn = GOT[symName];
        if (!rtn) {
          rtn = GOT[symName] = new WebAssembly.Global({
            "value": "i32",
            "mutable": true
          });
        }
        if (!currentModuleWeakSymbols.has(symName)) {
          rtn.required = true;
        }
        return rtn;
      }
    };
    var LE_ATOMICS_NATIVE_BYTE_ORDER = [];
    var LE_HEAP_LOAD_F32 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getFloat32(byteOffset, true), "LE_HEAP_LOAD_F32");
    var LE_HEAP_LOAD_F64 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getFloat64(byteOffset, true), "LE_HEAP_LOAD_F64");
    var LE_HEAP_LOAD_I16 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getInt16(byteOffset, true), "LE_HEAP_LOAD_I16");
    var LE_HEAP_LOAD_I32 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getInt32(byteOffset, true), "LE_HEAP_LOAD_I32");
    var LE_HEAP_LOAD_I64 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getBigInt64(byteOffset, true), "LE_HEAP_LOAD_I64");
    var LE_HEAP_LOAD_U32 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getUint32(byteOffset, true), "LE_HEAP_LOAD_U32");
    var LE_HEAP_STORE_F32 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setFloat32(byteOffset, value, true), "LE_HEAP_STORE_F32");
    var LE_HEAP_STORE_F64 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setFloat64(byteOffset, value, true), "LE_HEAP_STORE_F64");
    var LE_HEAP_STORE_I16 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setInt16(byteOffset, value, true), "LE_HEAP_STORE_I16");
    var LE_HEAP_STORE_I32 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setInt32(byteOffset, value, true), "LE_HEAP_STORE_I32");
    var LE_HEAP_STORE_I64 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setBigInt64(byteOffset, value, true), "LE_HEAP_STORE_I64");
    var LE_HEAP_STORE_U32 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setUint32(byteOffset, value, true), "LE_HEAP_STORE_U32");
    var callRuntimeCallbacks = /* @__PURE__ */ __name((callbacks) => {
      while (callbacks.length > 0) {
        callbacks.shift()(Module);
      }
    }, "callRuntimeCallbacks");
    var onPostRuns = [];
    var addOnPostRun = /* @__PURE__ */ __name((cb) => onPostRuns.push(cb), "addOnPostRun");
    var onPreRuns = [];
    var addOnPreRun = /* @__PURE__ */ __name((cb) => onPreRuns.push(cb), "addOnPreRun");
    var UTF8Decoder = typeof TextDecoder != "undefined" ? new TextDecoder() : void 0;
    var findStringEnd = /* @__PURE__ */ __name((heapOrArray, idx, maxBytesToRead, ignoreNul) => {
      var maxIdx = idx + maxBytesToRead;
      if (ignoreNul) return maxIdx;
      while (heapOrArray[idx] && !(idx >= maxIdx)) ++idx;
      return idx;
    }, "findStringEnd");
    var UTF8ArrayToString = /* @__PURE__ */ __name((heapOrArray, idx = 0, maxBytesToRead, ignoreNul) => {
      var endPtr = findStringEnd(heapOrArray, idx, maxBytesToRead, ignoreNul);
      if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
        return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
      }
      var str = "";
      while (idx < endPtr) {
        var u0 = heapOrArray[idx++];
        if (!(u0 & 128)) {
          str += String.fromCharCode(u0);
          continue;
        }
        var u1 = heapOrArray[idx++] & 63;
        if ((u0 & 224) == 192) {
          str += String.fromCharCode((u0 & 31) << 6 | u1);
          continue;
        }
        var u2 = heapOrArray[idx++] & 63;
        if ((u0 & 240) == 224) {
          u0 = (u0 & 15) << 12 | u1 << 6 | u2;
        } else {
          u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | heapOrArray[idx++] & 63;
        }
        if (u0 < 65536) {
          str += String.fromCharCode(u0);
        } else {
          var ch = u0 - 65536;
          str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023);
        }
      }
      return str;
    }, "UTF8ArrayToString");
    var getDylinkMetadata = /* @__PURE__ */ __name((binary2) => {
      var offset = 0;
      var end = 0;
      function getU8() {
        return binary2[offset++];
      }
      __name(getU8, "getU8");
      function getLEB() {
        var ret = 0;
        var mul = 1;
        while (1) {
          var byte = binary2[offset++];
          ret += (byte & 127) * mul;
          mul *= 128;
          if (!(byte & 128)) break;
        }
        return ret;
      }
      __name(getLEB, "getLEB");
      function getString() {
        var len = getLEB();
        offset += len;
        return UTF8ArrayToString(binary2, offset - len, len);
      }
      __name(getString, "getString");
      function getStringList() {
        var count2 = getLEB();
        var rtn = [];
        while (count2--) rtn.push(getString());
        return rtn;
      }
      __name(getStringList, "getStringList");
      function failIf(condition, message) {
        if (condition) throw new Error(message);
      }
      __name(failIf, "failIf");
      if (binary2 instanceof WebAssembly.Module) {
        var dylinkSection = WebAssembly.Module.customSections(binary2, "dylink.0");
        failIf(dylinkSection.length === 0, "need dylink section");
        binary2 = new Uint8Array(dylinkSection[0]);
        end = binary2.length;
      } else {
        var int32View = new Uint32Array(new Uint8Array(binary2.subarray(0, 24)).buffer);
        var magicNumberFound = int32View[0] == 1836278016 || int32View[0] == 6386541;
        failIf(!magicNumberFound, "need to see wasm magic number");
        failIf(binary2[8] !== 0, "need the dylink section to be first");
        offset = 9;
        var section_size = getLEB();
        end = offset + section_size;
        var name2 = getString();
        failIf(name2 !== "dylink.0");
      }
      var customSection = {
        neededDynlibs: [],
        tlsExports: /* @__PURE__ */ new Set(),
        weakImports: /* @__PURE__ */ new Set(),
        runtimePaths: []
      };
      var WASM_DYLINK_MEM_INFO = 1;
      var WASM_DYLINK_NEEDED = 2;
      var WASM_DYLINK_EXPORT_INFO = 3;
      var WASM_DYLINK_IMPORT_INFO = 4;
      var WASM_DYLINK_RUNTIME_PATH = 5;
      var WASM_SYMBOL_TLS = 256;
      var WASM_SYMBOL_BINDING_MASK = 3;
      var WASM_SYMBOL_BINDING_WEAK = 1;
      while (offset < end) {
        var subsectionType = getU8();
        var subsectionSize = getLEB();
        if (subsectionType === WASM_DYLINK_MEM_INFO) {
          customSection.memorySize = getLEB();
          customSection.memoryAlign = getLEB();
          customSection.tableSize = getLEB();
          customSection.tableAlign = getLEB();
        } else if (subsectionType === WASM_DYLINK_NEEDED) {
          customSection.neededDynlibs = getStringList();
        } else if (subsectionType === WASM_DYLINK_EXPORT_INFO) {
          var count = getLEB();
          while (count--) {
            var symname = getString();
            var flags2 = getLEB();
            if (flags2 & WASM_SYMBOL_TLS) {
              customSection.tlsExports.add(symname);
            }
          }
        } else if (subsectionType === WASM_DYLINK_IMPORT_INFO) {
          var count = getLEB();
          while (count--) {
            var modname = getString();
            var symname = getString();
            var flags2 = getLEB();
            if ((flags2 & WASM_SYMBOL_BINDING_MASK) == WASM_SYMBOL_BINDING_WEAK) {
              customSection.weakImports.add(symname);
            }
          }
        } else if (subsectionType === WASM_DYLINK_RUNTIME_PATH) {
          customSection.runtimePaths = getStringList();
        } else {
          offset += subsectionSize;
        }
      }
      return customSection;
    }, "getDylinkMetadata");
    function getValue(ptr, type = "i8") {
      if (type.endsWith("*")) type = "*";
      switch (type) {
        case "i1":
          return HEAP8[ptr];
        case "i8":
          return HEAP8[ptr];
        case "i16":
          return LE_HEAP_LOAD_I16((ptr >> 1) * 2);
        case "i32":
          return LE_HEAP_LOAD_I32((ptr >> 2) * 4);
        case "i64":
          return LE_HEAP_LOAD_I64((ptr >> 3) * 8);
        case "float":
          return LE_HEAP_LOAD_F32((ptr >> 2) * 4);
        case "double":
          return LE_HEAP_LOAD_F64((ptr >> 3) * 8);
        case "*":
          return LE_HEAP_LOAD_U32((ptr >> 2) * 4);
        default:
          abort(`invalid type for getValue: ${type}`);
      }
    }
    __name(getValue, "getValue");
    var newDSO = /* @__PURE__ */ __name((name2, handle2, syms) => {
      var dso = {
        refcount: Infinity,
        name: name2,
        exports: syms,
        global: true
      };
      LDSO.loadedLibsByName[name2] = dso;
      if (handle2 != void 0) {
        LDSO.loadedLibsByHandle[handle2] = dso;
      }
      return dso;
    }, "newDSO");
    var LDSO = {
      loadedLibsByName: {},
      loadedLibsByHandle: {},
      init() {
        newDSO("__main__", 0, wasmImports);
      }
    };
    var ___heap_base = 78240;
    var alignMemory = /* @__PURE__ */ __name((size, alignment) => Math.ceil(size / alignment) * alignment, "alignMemory");
    var getMemory = /* @__PURE__ */ __name((size) => {
      if (runtimeInitialized) {
        return _calloc(size, 1);
      }
      var ret = ___heap_base;
      var end = ret + alignMemory(size, 16);
      ___heap_base = end;
      GOT["__heap_base"].value = end;
      return ret;
    }, "getMemory");
    var isInternalSym = /* @__PURE__ */ __name((symName) => ["__cpp_exception", "__c_longjmp", "__wasm_apply_data_relocs", "__dso_handle", "__tls_size", "__tls_align", "__set_stack_limits", "_emscripten_tls_init", "__wasm_init_tls", "__wasm_call_ctors", "__start_em_asm", "__stop_em_asm", "__start_em_js", "__stop_em_js"].includes(symName) || symName.startsWith("__em_js__"), "isInternalSym");
    var uleb128EncodeWithLen = /* @__PURE__ */ __name((arr) => {
      const n = arr.length;
      return [n % 128 | 128, n >> 7, ...arr];
    }, "uleb128EncodeWithLen");
    var wasmTypeCodes = {
      "i": 127,
      // i32
      "p": 127,
      // i32
      "j": 126,
      // i64
      "f": 125,
      // f32
      "d": 124,
      // f64
      "e": 111
    };
    var generateTypePack = /* @__PURE__ */ __name((types) => uleb128EncodeWithLen(Array.from(types, (type) => {
      var code = wasmTypeCodes[type];
      return code;
    })), "generateTypePack");
    var convertJsFunctionToWasm = /* @__PURE__ */ __name((func2, sig) => {
      var bytes = Uint8Array.of(
        0,
        97,
        115,
        109,
        // magic ("\0asm")
        1,
        0,
        0,
        0,
        // version: 1
        1,
        ...uleb128EncodeWithLen([
          1,
          // count: 1
          96,
          // param types
          ...generateTypePack(sig.slice(1)),
          // return types (for now only supporting [] if `void` and single [T] otherwise)
          ...generateTypePack(sig[0] === "v" ? "" : sig[0])
        ]),
        // The rest of the module is static
        2,
        7,
        // import section
        // (import "e" "f" (func 0 (type 0)))
        1,
        1,
        101,
        1,
        102,
        0,
        0,
        7,
        5,
        // export section
        // (export "f" (func 0 (type 0)))
        1,
        1,
        102,
        0,
        0
      );
      var module2 = new WebAssembly.Module(bytes);
      var instance2 = new WebAssembly.Instance(module2, {
        "e": {
          "f": func2
        }
      });
      var wrappedFunc = instance2.exports["f"];
      return wrappedFunc;
    }, "convertJsFunctionToWasm");
    var wasmTableMirror = [];
    var wasmTable = new WebAssembly.Table({
      "initial": 31,
      "element": "anyfunc"
    });
    var getWasmTableEntry = /* @__PURE__ */ __name((funcPtr) => {
      var func2 = wasmTableMirror[funcPtr];
      if (!func2) {
        wasmTableMirror[funcPtr] = func2 = wasmTable.get(funcPtr);
      }
      return func2;
    }, "getWasmTableEntry");
    var updateTableMap = /* @__PURE__ */ __name((offset, count) => {
      if (functionsInTableMap) {
        for (var i2 = offset; i2 < offset + count; i2++) {
          var item = getWasmTableEntry(i2);
          if (item) {
            functionsInTableMap.set(item, i2);
          }
        }
      }
    }, "updateTableMap");
    var functionsInTableMap;
    var getFunctionAddress = /* @__PURE__ */ __name((func2) => {
      if (!functionsInTableMap) {
        functionsInTableMap = /* @__PURE__ */ new WeakMap();
        updateTableMap(0, wasmTable.length);
      }
      return functionsInTableMap.get(func2) || 0;
    }, "getFunctionAddress");
    var freeTableIndexes = [];
    var getEmptyTableSlot = /* @__PURE__ */ __name(() => {
      if (freeTableIndexes.length) {
        return freeTableIndexes.pop();
      }
      return wasmTable["grow"](1);
    }, "getEmptyTableSlot");
    var setWasmTableEntry = /* @__PURE__ */ __name((idx, func2) => {
      wasmTable.set(idx, func2);
      wasmTableMirror[idx] = wasmTable.get(idx);
    }, "setWasmTableEntry");
    var addFunction = /* @__PURE__ */ __name((func2, sig) => {
      var rtn = getFunctionAddress(func2);
      if (rtn) {
        return rtn;
      }
      var ret = getEmptyTableSlot();
      try {
        setWasmTableEntry(ret, func2);
      } catch (err2) {
        if (!(err2 instanceof TypeError)) {
          throw err2;
        }
        var wrapped = convertJsFunctionToWasm(func2, sig);
        setWasmTableEntry(ret, wrapped);
      }
      functionsInTableMap.set(func2, ret);
      return ret;
    }, "addFunction");
    var updateGOT = /* @__PURE__ */ __name((exports, replace) => {
      for (var symName in exports) {
        if (isInternalSym(symName)) {
          continue;
        }
        var value = exports[symName];
        GOT[symName] ||= new WebAssembly.Global({
          "value": "i32",
          "mutable": true
        });
        if (replace || GOT[symName].value == 0) {
          if (typeof value == "function") {
            GOT[symName].value = addFunction(value);
          } else if (typeof value == "number") {
            GOT[symName].value = value;
          } else {
            err(`unhandled export type for '${symName}': ${typeof value}`);
          }
        }
      }
    }, "updateGOT");
    var relocateExports = /* @__PURE__ */ __name((exports, memoryBase2, replace) => {
      var relocated = {};
      for (var e in exports) {
        var value = exports[e];
        if (typeof value == "object") {
          value = value.value;
        }
        if (typeof value == "number") {
          value += memoryBase2;
        }
        relocated[e] = value;
      }
      updateGOT(relocated, replace);
      return relocated;
    }, "relocateExports");
    var isSymbolDefined = /* @__PURE__ */ __name((symName) => {
      var existing = wasmImports[symName];
      if (!existing || existing.stub) {
        return false;
      }
      return true;
    }, "isSymbolDefined");
    var dynCall = /* @__PURE__ */ __name((sig, ptr, args2 = [], promising = false) => {
      var func2 = getWasmTableEntry(ptr);
      var rtn = func2(...args2);
      function convert(rtn2) {
        return rtn2;
      }
      __name(convert, "convert");
      return convert(rtn);
    }, "dynCall");
    var stackSave = /* @__PURE__ */ __name(() => _emscripten_stack_get_current(), "stackSave");
    var stackRestore = /* @__PURE__ */ __name((val) => __emscripten_stack_restore(val), "stackRestore");
    var createInvokeFunction = /* @__PURE__ */ __name((sig) => (ptr, ...args2) => {
      var sp = stackSave();
      try {
        return dynCall(sig, ptr, args2);
      } catch (e) {
        stackRestore(sp);
        if (e !== e + 0) throw e;
        _setThrew(1, 0);
        if (sig[0] == "j") return 0n;
      }
    }, "createInvokeFunction");
    var resolveGlobalSymbol = /* @__PURE__ */ __name((symName, direct = false) => {
      var sym;
      if (isSymbolDefined(symName)) {
        sym = wasmImports[symName];
      } else if (symName.startsWith("invoke_")) {
        sym = wasmImports[symName] = createInvokeFunction(symName.split("_")[1]);
      }
      return {
        sym,
        name: symName
      };
    }, "resolveGlobalSymbol");
    var onPostCtors = [];
    var addOnPostCtor = /* @__PURE__ */ __name((cb) => onPostCtors.push(cb), "addOnPostCtor");
    var UTF8ToString = /* @__PURE__ */ __name((ptr, maxBytesToRead, ignoreNul) => ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead, ignoreNul) : "", "UTF8ToString");
    var loadWebAssemblyModule = /* @__PURE__ */ __name((binary, flags, libName, localScope, handle) => {
      var metadata = getDylinkMetadata(binary);
      function loadModule() {
        var memAlign = Math.pow(2, metadata.memoryAlign);
        var memoryBase = metadata.memorySize ? alignMemory(getMemory(metadata.memorySize + memAlign), memAlign) : 0;
        var tableBase = metadata.tableSize ? wasmTable.length : 0;
        if (handle) {
          HEAP8[handle + 8] = 1;
          LE_HEAP_STORE_U32((handle + 12 >> 2) * 4, memoryBase);
          LE_HEAP_STORE_I32((handle + 16 >> 2) * 4, metadata.memorySize);
          LE_HEAP_STORE_U32((handle + 20 >> 2) * 4, tableBase);
          LE_HEAP_STORE_I32((handle + 24 >> 2) * 4, metadata.tableSize);
        }
        if (metadata.tableSize) {
          wasmTable.grow(metadata.tableSize);
        }
        var moduleExports;
        function resolveSymbol(sym) {
          var resolved = resolveGlobalSymbol(sym).sym;
          if (!resolved && localScope) {
            resolved = localScope[sym];
          }
          if (!resolved) {
            resolved = moduleExports[sym];
          }
          return resolved;
        }
        __name(resolveSymbol, "resolveSymbol");
        var proxyHandler = {
          get(stubs, prop) {
            switch (prop) {
              case "__memory_base":
                return memoryBase;
              case "__table_base":
                return tableBase;
            }
            if (prop in wasmImports && !wasmImports[prop].stub) {
              var res = wasmImports[prop];
              return res;
            }
            if (!(prop in stubs)) {
              var resolved;
              stubs[prop] = (...args2) => {
                resolved ||= resolveSymbol(prop);
                return resolved(...args2);
              };
            }
            return stubs[prop];
          }
        };
        var proxy = new Proxy({}, proxyHandler);
        currentModuleWeakSymbols = metadata.weakImports;
        var info = {
          "GOT.mem": new Proxy({}, GOTHandler),
          "GOT.func": new Proxy({}, GOTHandler),
          "env": proxy,
          "wasi_snapshot_preview1": proxy
        };
        function postInstantiation(module, instance) {
          updateTableMap(tableBase, metadata.tableSize);
          moduleExports = relocateExports(instance.exports, memoryBase);
          if (!flags.allowUndefined) {
            reportUndefinedSymbols();
          }
          function addEmAsm(addr, body) {
            var args = [];
            var arity = 0;
            for (; arity < 16; arity++) {
              if (body.indexOf("$" + arity) != -1) {
                args.push("$" + arity);
              } else {
                break;
              }
            }
            args = args.join(",");
            var func = `(${args}) => { ${body} };`;
            ASM_CONSTS[start] = eval(func);
          }
          __name(addEmAsm, "addEmAsm");
          if ("__start_em_asm" in moduleExports) {
            var start = moduleExports["__start_em_asm"];
            var stop = moduleExports["__stop_em_asm"];
            while (start < stop) {
              var jsString = UTF8ToString(start);
              addEmAsm(start, jsString);
              start = HEAPU8.indexOf(0, start) + 1;
            }
          }
          function addEmJs(name, cSig, body) {
            var jsArgs = [];
            cSig = cSig.slice(1, -1);
            if (cSig != "void") {
              cSig = cSig.split(",");
              for (var i in cSig) {
                var jsArg = cSig[i].split(" ").pop();
                jsArgs.push(jsArg.replace("*", ""));
              }
            }
            var func = `(${jsArgs}) => ${body};`;
            moduleExports[name] = eval(func);
          }
          __name(addEmJs, "addEmJs");
          for (var name in moduleExports) {
            if (name.startsWith("__em_js__")) {
              var start = moduleExports[name];
              var jsString = UTF8ToString(start);
              var parts = jsString.split("<::>");
              addEmJs(name.replace("__em_js__", ""), parts[0], parts[1]);
              delete moduleExports[name];
            }
          }
          var applyRelocs = moduleExports["__wasm_apply_data_relocs"];
          if (applyRelocs) {
            if (runtimeInitialized) {
              applyRelocs();
            } else {
              __RELOC_FUNCS__.push(applyRelocs);
            }
          }
          var init = moduleExports["__wasm_call_ctors"];
          if (init) {
            if (runtimeInitialized) {
              init();
            } else {
              addOnPostCtor(init);
            }
          }
          return moduleExports;
        }
        __name(postInstantiation, "postInstantiation");
        if (flags.loadAsync) {
          return (async () => {
            var instance2;
            if (binary instanceof WebAssembly.Module) {
              instance2 = new WebAssembly.Instance(binary, info);
            } else {
              ({ module: binary, instance: instance2 } = await WebAssembly.instantiate(binary, info));
            }
            return postInstantiation(binary, instance2);
          })();
        }
        var module = binary instanceof WebAssembly.Module ? binary : new WebAssembly.Module(binary);
        var instance = new WebAssembly.Instance(module, info);
        return postInstantiation(module, instance);
      }
      __name(loadModule, "loadModule");
      flags = {
        ...flags,
        rpath: {
          parentLibPath: libName,
          paths: metadata.runtimePaths
        }
      };
      if (flags.loadAsync) {
        return metadata.neededDynlibs.reduce((chain, dynNeeded) => chain.then(() => loadDynamicLibrary(dynNeeded, flags, localScope)), Promise.resolve()).then(loadModule);
      }
      metadata.neededDynlibs.forEach((needed) => loadDynamicLibrary(needed, flags, localScope));
      return loadModule();
    }, "loadWebAssemblyModule");
    var mergeLibSymbols = /* @__PURE__ */ __name((exports, libName2) => {
      for (var [sym, exp] of Object.entries(exports)) {
        const setImport = /* @__PURE__ */ __name((target) => {
          if (!isSymbolDefined(target)) {
            wasmImports[target] = exp;
          }
        }, "setImport");
        setImport(sym);
        const main_alias = "__main_argc_argv";
        if (sym == "main") {
          setImport(main_alias);
        }
        if (sym == main_alias) {
          setImport("main");
        }
      }
    }, "mergeLibSymbols");
    var asyncLoad = /* @__PURE__ */ __name(async (url) => {
      var arrayBuffer = await readAsync(url);
      return new Uint8Array(arrayBuffer);
    }, "asyncLoad");
    function loadDynamicLibrary(libName2, flags2 = {
      global: true,
      nodelete: true
    }, localScope2, handle2) {
      var dso = LDSO.loadedLibsByName[libName2];
      if (dso) {
        if (!flags2.global) {
          if (localScope2) {
            Object.assign(localScope2, dso.exports);
          }
        } else if (!dso.global) {
          dso.global = true;
          mergeLibSymbols(dso.exports, libName2);
        }
        if (flags2.nodelete && dso.refcount !== Infinity) {
          dso.refcount = Infinity;
        }
        dso.refcount++;
        if (handle2) {
          LDSO.loadedLibsByHandle[handle2] = dso;
        }
        return flags2.loadAsync ? Promise.resolve(true) : true;
      }
      dso = newDSO(libName2, handle2, "loading");
      dso.refcount = flags2.nodelete ? Infinity : 1;
      dso.global = flags2.global;
      function loadLibData() {
        if (handle2) {
          var data = LE_HEAP_LOAD_U32((handle2 + 28 >> 2) * 4);
          var dataSize = LE_HEAP_LOAD_U32((handle2 + 32 >> 2) * 4);
          if (data && dataSize) {
            var libData = HEAP8.slice(data, data + dataSize);
            return flags2.loadAsync ? Promise.resolve(libData) : libData;
          }
        }
        var libFile = locateFile(libName2);
        if (flags2.loadAsync) {
          return asyncLoad(libFile);
        }
        if (!readBinary) {
          throw new Error(`${libFile}: file not found, and synchronous loading of external files is not available`);
        }
        return readBinary(libFile);
      }
      __name(loadLibData, "loadLibData");
      function getExports() {
        if (flags2.loadAsync) {
          return loadLibData().then((libData) => loadWebAssemblyModule(libData, flags2, libName2, localScope2, handle2));
        }
        return loadWebAssemblyModule(loadLibData(), flags2, libName2, localScope2, handle2);
      }
      __name(getExports, "getExports");
      function moduleLoaded(exports) {
        if (dso.global) {
          mergeLibSymbols(exports, libName2);
        } else if (localScope2) {
          Object.assign(localScope2, exports);
        }
        dso.exports = exports;
      }
      __name(moduleLoaded, "moduleLoaded");
      if (flags2.loadAsync) {
        return getExports().then((exports) => {
          moduleLoaded(exports);
          return true;
        });
      }
      moduleLoaded(getExports());
      return true;
    }
    __name(loadDynamicLibrary, "loadDynamicLibrary");
    var reportUndefinedSymbols = /* @__PURE__ */ __name(() => {
      for (var [symName, entry] of Object.entries(GOT)) {
        if (entry.value == 0) {
          var value = resolveGlobalSymbol(symName, true).sym;
          if (!value && !entry.required) {
            continue;
          }
          if (typeof value == "function") {
            entry.value = addFunction(value, value.sig);
          } else if (typeof value == "number") {
            entry.value = value;
          } else {
            throw new Error(`bad export type for '${symName}': ${typeof value}`);
          }
        }
      }
    }, "reportUndefinedSymbols");
    var runDependencies = 0;
    var dependenciesFulfilled = null;
    var removeRunDependency = /* @__PURE__ */ __name((id) => {
      runDependencies--;
      Module["monitorRunDependencies"]?.(runDependencies);
      if (runDependencies == 0) {
        if (dependenciesFulfilled) {
          var callback = dependenciesFulfilled;
          dependenciesFulfilled = null;
          callback();
        }
      }
    }, "removeRunDependency");
    var addRunDependency = /* @__PURE__ */ __name((id) => {
      runDependencies++;
      Module["monitorRunDependencies"]?.(runDependencies);
    }, "addRunDependency");
    var loadDylibs = /* @__PURE__ */ __name(async () => {
      if (!dynamicLibraries.length) {
        reportUndefinedSymbols();
        return;
      }
      addRunDependency("loadDylibs");
      for (var lib of dynamicLibraries) {
        await loadDynamicLibrary(lib, {
          loadAsync: true,
          global: true,
          nodelete: true,
          allowUndefined: true
        });
      }
      reportUndefinedSymbols();
      removeRunDependency("loadDylibs");
    }, "loadDylibs");
    var noExitRuntime = true;
    function setValue(ptr, value, type = "i8") {
      if (type.endsWith("*")) type = "*";
      switch (type) {
        case "i1":
          HEAP8[ptr] = value;
          break;
        case "i8":
          HEAP8[ptr] = value;
          break;
        case "i16":
          LE_HEAP_STORE_I16((ptr >> 1) * 2, value);
          break;
        case "i32":
          LE_HEAP_STORE_I32((ptr >> 2) * 4, value);
          break;
        case "i64":
          LE_HEAP_STORE_I64((ptr >> 3) * 8, BigInt(value));
          break;
        case "float":
          LE_HEAP_STORE_F32((ptr >> 2) * 4, value);
          break;
        case "double":
          LE_HEAP_STORE_F64((ptr >> 3) * 8, value);
          break;
        case "*":
          LE_HEAP_STORE_U32((ptr >> 2) * 4, value);
          break;
        default:
          abort(`invalid type for setValue: ${type}`);
      }
    }
    __name(setValue, "setValue");
    var ___memory_base = new WebAssembly.Global({
      "value": "i32",
      "mutable": false
    }, 1024);
    var ___stack_high = 78240;
    var ___stack_low = 12704;
    var ___stack_pointer = new WebAssembly.Global({
      "value": "i32",
      "mutable": true
    }, 78240);
    var ___table_base = new WebAssembly.Global({
      "value": "i32",
      "mutable": false
    }, 1);
    var __abort_js = /* @__PURE__ */ __name(() => abort(""), "__abort_js");
    __abort_js.sig = "v";
    var getHeapMax = /* @__PURE__ */ __name(() => (
      // Stay one Wasm page short of 4GB: while e.g. Chrome is able to allocate
      // full 4GB Wasm memories, the size will wrap back to 0 bytes in Wasm side
      // for any code that deals with heap sizes, which would require special
      // casing all heap size related code to treat 0 specially.
      2147483648
    ), "getHeapMax");
    var growMemory = /* @__PURE__ */ __name((size) => {
      var oldHeapSize = wasmMemory.buffer.byteLength;
      var pages = (size - oldHeapSize + 65535) / 65536 | 0;
      try {
        wasmMemory.grow(pages);
        updateMemoryViews();
        return 1;
      } catch (e) {
      }
    }, "growMemory");
    var _emscripten_resize_heap = /* @__PURE__ */ __name((requestedSize) => {
      var oldSize = HEAPU8.length;
      requestedSize >>>= 0;
      var maxHeapSize = getHeapMax();
      if (requestedSize > maxHeapSize) {
        return false;
      }
      for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
        var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);
        overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
        var newSize = Math.min(maxHeapSize, alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536));
        var replacement = growMemory(newSize);
        if (replacement) {
          return true;
        }
      }
      return false;
    }, "_emscripten_resize_heap");
    _emscripten_resize_heap.sig = "ip";
    var _fd_close = /* @__PURE__ */ __name((fd) => 52, "_fd_close");
    _fd_close.sig = "ii";
    var INT53_MAX = 9007199254740992;
    var INT53_MIN = -9007199254740992;
    var bigintToI53Checked = /* @__PURE__ */ __name((num) => num < INT53_MIN || num > INT53_MAX ? NaN : Number(num), "bigintToI53Checked");
    function _fd_seek(fd, offset, whence, newOffset) {
      offset = bigintToI53Checked(offset);
      return 70;
    }
    __name(_fd_seek, "_fd_seek");
    _fd_seek.sig = "iijip";
    var printCharBuffers = [null, [], []];
    var printChar = /* @__PURE__ */ __name((stream, curr) => {
      var buffer = printCharBuffers[stream];
      if (curr === 0 || curr === 10) {
        (stream === 1 ? out : err)(UTF8ArrayToString(buffer));
        buffer.length = 0;
      } else {
        buffer.push(curr);
      }
    }, "printChar");
    var _fd_write = /* @__PURE__ */ __name((fd, iov, iovcnt, pnum) => {
      var num = 0;
      for (var i2 = 0; i2 < iovcnt; i2++) {
        var ptr = LE_HEAP_LOAD_U32((iov >> 2) * 4);
        var len = LE_HEAP_LOAD_U32((iov + 4 >> 2) * 4);
        iov += 8;
        for (var j2 = 0; j2 < len; j2++) {
          printChar(fd, HEAPU8[ptr + j2]);
        }
        num += len;
      }
      LE_HEAP_STORE_U32((pnum >> 2) * 4, num);
      return 0;
    }, "_fd_write");
    _fd_write.sig = "iippp";
    function _tree_sitter_log_callback(isLexMessage, messageAddress) {
      if (Module.currentLogCallback) {
        const message = UTF8ToString(messageAddress);
        Module.currentLogCallback(message, isLexMessage !== 0);
      }
    }
    __name(_tree_sitter_log_callback, "_tree_sitter_log_callback");
    function _tree_sitter_parse_callback(inputBufferAddress, index, row, column, lengthAddress) {
      const INPUT_BUFFER_SIZE = 10 * 1024;
      const string = Module.currentParseCallback(index, {
        row,
        column
      });
      if (typeof string === "string") {
        setValue(lengthAddress, string.length, "i32");
        stringToUTF16(string, inputBufferAddress, INPUT_BUFFER_SIZE);
      } else {
        setValue(lengthAddress, 0, "i32");
      }
    }
    __name(_tree_sitter_parse_callback, "_tree_sitter_parse_callback");
    function _tree_sitter_progress_callback(currentOffset, hasError) {
      if (Module.currentProgressCallback) {
        return Module.currentProgressCallback({
          currentOffset,
          hasError
        });
      }
      return false;
    }
    __name(_tree_sitter_progress_callback, "_tree_sitter_progress_callback");
    function _tree_sitter_query_progress_callback(currentOffset) {
      if (Module.currentQueryProgressCallback) {
        return Module.currentQueryProgressCallback({
          currentOffset
        });
      }
      return false;
    }
    __name(_tree_sitter_query_progress_callback, "_tree_sitter_query_progress_callback");
    var runtimeKeepaliveCounter = 0;
    var keepRuntimeAlive = /* @__PURE__ */ __name(() => noExitRuntime || runtimeKeepaliveCounter > 0, "keepRuntimeAlive");
    var _proc_exit = /* @__PURE__ */ __name((code) => {
      EXITSTATUS = code;
      if (!keepRuntimeAlive()) {
        Module["onExit"]?.(code);
        ABORT = true;
      }
      quit_(code, new ExitStatus(code));
    }, "_proc_exit");
    _proc_exit.sig = "vi";
    var exitJS = /* @__PURE__ */ __name((status, implicit) => {
      EXITSTATUS = status;
      _proc_exit(status);
    }, "exitJS");
    var handleException = /* @__PURE__ */ __name((e) => {
      if (e instanceof ExitStatus || e == "unwind") {
        return EXITSTATUS;
      }
      quit_(1, e);
    }, "handleException");
    var lengthBytesUTF8 = /* @__PURE__ */ __name((str) => {
      var len = 0;
      for (var i2 = 0; i2 < str.length; ++i2) {
        var c = str.charCodeAt(i2);
        if (c <= 127) {
          len++;
        } else if (c <= 2047) {
          len += 2;
        } else if (c >= 55296 && c <= 57343) {
          len += 4;
          ++i2;
        } else {
          len += 3;
        }
      }
      return len;
    }, "lengthBytesUTF8");
    var stringToUTF8Array = /* @__PURE__ */ __name((str, heap, outIdx, maxBytesToWrite) => {
      if (!(maxBytesToWrite > 0)) return 0;
      var startIdx = outIdx;
      var endIdx = outIdx + maxBytesToWrite - 1;
      for (var i2 = 0; i2 < str.length; ++i2) {
        var u = str.codePointAt(i2);
        if (u <= 127) {
          if (outIdx >= endIdx) break;
          heap[outIdx++] = u;
        } else if (u <= 2047) {
          if (outIdx + 1 >= endIdx) break;
          heap[outIdx++] = 192 | u >> 6;
          heap[outIdx++] = 128 | u & 63;
        } else if (u <= 65535) {
          if (outIdx + 2 >= endIdx) break;
          heap[outIdx++] = 224 | u >> 12;
          heap[outIdx++] = 128 | u >> 6 & 63;
          heap[outIdx++] = 128 | u & 63;
        } else {
          if (outIdx + 3 >= endIdx) break;
          heap[outIdx++] = 240 | u >> 18;
          heap[outIdx++] = 128 | u >> 12 & 63;
          heap[outIdx++] = 128 | u >> 6 & 63;
          heap[outIdx++] = 128 | u & 63;
          i2++;
        }
      }
      heap[outIdx] = 0;
      return outIdx - startIdx;
    }, "stringToUTF8Array");
    var stringToUTF8 = /* @__PURE__ */ __name((str, outPtr, maxBytesToWrite) => stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite), "stringToUTF8");
    var stackAlloc = /* @__PURE__ */ __name((sz) => __emscripten_stack_alloc(sz), "stackAlloc");
    var stringToUTF8OnStack = /* @__PURE__ */ __name((str) => {
      var size = lengthBytesUTF8(str) + 1;
      var ret = stackAlloc(size);
      stringToUTF8(str, ret, size);
      return ret;
    }, "stringToUTF8OnStack");
    var AsciiToString = /* @__PURE__ */ __name((ptr) => {
      var str = "";
      while (1) {
        var ch = HEAPU8[ptr++];
        if (!ch) return str;
        str += String.fromCharCode(ch);
      }
    }, "AsciiToString");
    var stringToUTF16 = /* @__PURE__ */ __name((str, outPtr, maxBytesToWrite) => {
      maxBytesToWrite ??= 2147483647;
      if (maxBytesToWrite < 2) return 0;
      maxBytesToWrite -= 2;
      var startPtr = outPtr;
      var numCharsToWrite = maxBytesToWrite < str.length * 2 ? maxBytesToWrite / 2 : str.length;
      for (var i2 = 0; i2 < numCharsToWrite; ++i2) {
        var codeUnit = str.charCodeAt(i2);
        LE_HEAP_STORE_I16((outPtr >> 1) * 2, codeUnit);
        outPtr += 2;
      }
      LE_HEAP_STORE_I16((outPtr >> 1) * 2, 0);
      return outPtr - startPtr;
    }, "stringToUTF16");
    LE_ATOMICS_NATIVE_BYTE_ORDER = new Int8Array(new Int16Array([1]).buffer)[0] === 1 ? [
      /* little endian */
      ((x2) => x2),
      ((x2) => x2),
      void 0,
      ((x2) => x2)
    ] : [
      /* big endian */
      ((x2) => x2),
      ((x2) => ((x2 & 65280) << 8 | (x2 & 255) << 24) >> 16),
      void 0,
      ((x2) => x2 >> 24 & 255 | x2 >> 8 & 65280 | (x2 & 65280) << 8 | (x2 & 255) << 24)
    ];
    function LE_HEAP_UPDATE() {
      HEAPU16.unsigned = ((x2) => x2 & 65535);
      HEAPU32.unsigned = ((x2) => x2 >>> 0);
    }
    __name(LE_HEAP_UPDATE, "LE_HEAP_UPDATE");
    {
      initMemory();
      if (Module["noExitRuntime"]) noExitRuntime = Module["noExitRuntime"];
      if (Module["print"]) out = Module["print"];
      if (Module["printErr"]) err = Module["printErr"];
      if (Module["dynamicLibraries"]) dynamicLibraries = Module["dynamicLibraries"];
      if (Module["wasmBinary"]) wasmBinary = Module["wasmBinary"];
      if (Module["arguments"]) arguments_ = Module["arguments"];
      if (Module["thisProgram"]) thisProgram = Module["thisProgram"];
      if (Module["preInit"]) {
        if (typeof Module["preInit"] == "function") Module["preInit"] = [Module["preInit"]];
        while (Module["preInit"].length > 0) {
          Module["preInit"].shift()();
        }
      }
    }
    Module["setValue"] = setValue;
    Module["getValue"] = getValue;
    Module["UTF8ToString"] = UTF8ToString;
    Module["stringToUTF8"] = stringToUTF8;
    Module["lengthBytesUTF8"] = lengthBytesUTF8;
    Module["AsciiToString"] = AsciiToString;
    Module["stringToUTF16"] = stringToUTF16;
    Module["loadWebAssemblyModule"] = loadWebAssemblyModule;
    Module["LE_HEAP_STORE_I64"] = LE_HEAP_STORE_I64;
    var ASM_CONSTS = {};
    var _malloc, _calloc, _realloc, _free, _ts_range_edit, _memcmp, _ts_language_symbol_count, _ts_language_state_count, _ts_language_abi_version, _ts_language_name, _ts_language_field_count, _ts_language_next_state, _ts_language_symbol_name, _ts_language_symbol_for_name, _strncmp, _ts_language_symbol_type, _ts_language_field_name_for_id, _ts_lookahead_iterator_new, _ts_lookahead_iterator_delete, _ts_lookahead_iterator_reset_state, _ts_lookahead_iterator_reset, _ts_lookahead_iterator_next, _ts_lookahead_iterator_current_symbol, _ts_point_edit, _ts_parser_delete, _ts_parser_reset, _ts_parser_set_language, _ts_parser_set_included_ranges, _ts_query_new, _ts_query_delete, _iswspace, _iswalnum, _ts_query_pattern_count, _ts_query_capture_count, _ts_query_string_count, _ts_query_capture_name_for_id, _ts_query_capture_quantifier_for_id, _ts_query_string_value_for_id, _ts_query_predicates_for_pattern, _ts_query_start_byte_for_pattern, _ts_query_end_byte_for_pattern, _ts_query_is_pattern_rooted, _ts_query_is_pattern_non_local, _ts_query_is_pattern_guaranteed_at_step, _ts_query_disable_capture, _ts_query_disable_pattern, _ts_tree_copy, _ts_tree_delete, _ts_init, _ts_parser_new_wasm, _ts_parser_enable_logger_wasm, _ts_parser_parse_wasm, _ts_parser_included_ranges_wasm, _ts_language_type_is_named_wasm, _ts_language_type_is_visible_wasm, _ts_language_metadata_wasm, _ts_language_supertypes_wasm, _ts_language_subtypes_wasm, _ts_tree_root_node_wasm, _ts_tree_root_node_with_offset_wasm, _ts_tree_edit_wasm, _ts_tree_included_ranges_wasm, _ts_tree_get_changed_ranges_wasm, _ts_tree_cursor_new_wasm, _ts_tree_cursor_copy_wasm, _ts_tree_cursor_delete_wasm, _ts_tree_cursor_reset_wasm, _ts_tree_cursor_reset_to_wasm, _ts_tree_cursor_goto_first_child_wasm, _ts_tree_cursor_goto_last_child_wasm, _ts_tree_cursor_goto_first_child_for_index_wasm, _ts_tree_cursor_goto_first_child_for_position_wasm, _ts_tree_cursor_goto_next_sibling_wasm, _ts_tree_cursor_goto_previous_sibling_wasm, _ts_tree_cursor_goto_descendant_wasm, _ts_tree_cursor_goto_parent_wasm, _ts_tree_cursor_current_node_type_id_wasm, _ts_tree_cursor_current_node_state_id_wasm, _ts_tree_cursor_current_node_is_named_wasm, _ts_tree_cursor_current_node_is_missing_wasm, _ts_tree_cursor_current_node_id_wasm, _ts_tree_cursor_start_position_wasm, _ts_tree_cursor_end_position_wasm, _ts_tree_cursor_start_index_wasm, _ts_tree_cursor_end_index_wasm, _ts_tree_cursor_current_field_id_wasm, _ts_tree_cursor_current_depth_wasm, _ts_tree_cursor_current_descendant_index_wasm, _ts_tree_cursor_current_node_wasm, _ts_node_symbol_wasm, _ts_node_field_name_for_child_wasm, _ts_node_field_name_for_named_child_wasm, _ts_node_children_by_field_id_wasm, _ts_node_first_child_for_byte_wasm, _ts_node_first_named_child_for_byte_wasm, _ts_node_grammar_symbol_wasm, _ts_node_child_count_wasm, _ts_node_named_child_count_wasm, _ts_node_child_wasm, _ts_node_named_child_wasm, _ts_node_child_by_field_id_wasm, _ts_node_next_sibling_wasm, _ts_node_prev_sibling_wasm, _ts_node_next_named_sibling_wasm, _ts_node_prev_named_sibling_wasm, _ts_node_descendant_count_wasm, _ts_node_parent_wasm, _ts_node_child_with_descendant_wasm, _ts_node_descendant_for_index_wasm, _ts_node_named_descendant_for_index_wasm, _ts_node_descendant_for_position_wasm, _ts_node_named_descendant_for_position_wasm, _ts_node_start_point_wasm, _ts_node_end_point_wasm, _ts_node_start_index_wasm, _ts_node_end_index_wasm, _ts_node_to_string_wasm, _ts_node_children_wasm, _ts_node_named_children_wasm, _ts_node_descendants_of_type_wasm, _ts_node_is_named_wasm, _ts_node_has_changes_wasm, _ts_node_has_error_wasm, _ts_node_is_error_wasm, _ts_node_is_missing_wasm, _ts_node_is_extra_wasm, _ts_node_parse_state_wasm, _ts_node_next_parse_state_wasm, _ts_query_matches_wasm, _ts_query_captures_wasm, _memset, _memcpy, _memmove, _iswalpha, _iswblank, _iswdigit, _iswlower, _iswupper, _iswxdigit, _memchr, _strlen, _strcmp, _strncat, _strncpy, _towlower, _towupper, _setThrew, __emscripten_stack_restore, __emscripten_stack_alloc, _emscripten_stack_get_current, ___wasm_apply_data_relocs;
    function assignWasmExports(wasmExports2) {
      Module["_malloc"] = _malloc = wasmExports2["malloc"];
      Module["_calloc"] = _calloc = wasmExports2["calloc"];
      Module["_realloc"] = _realloc = wasmExports2["realloc"];
      Module["_free"] = _free = wasmExports2["free"];
      Module["_ts_range_edit"] = _ts_range_edit = wasmExports2["ts_range_edit"];
      Module["_memcmp"] = _memcmp = wasmExports2["memcmp"];
      Module["_ts_language_symbol_count"] = _ts_language_symbol_count = wasmExports2["ts_language_symbol_count"];
      Module["_ts_language_state_count"] = _ts_language_state_count = wasmExports2["ts_language_state_count"];
      Module["_ts_language_abi_version"] = _ts_language_abi_version = wasmExports2["ts_language_abi_version"];
      Module["_ts_language_name"] = _ts_language_name = wasmExports2["ts_language_name"];
      Module["_ts_language_field_count"] = _ts_language_field_count = wasmExports2["ts_language_field_count"];
      Module["_ts_language_next_state"] = _ts_language_next_state = wasmExports2["ts_language_next_state"];
      Module["_ts_language_symbol_name"] = _ts_language_symbol_name = wasmExports2["ts_language_symbol_name"];
      Module["_ts_language_symbol_for_name"] = _ts_language_symbol_for_name = wasmExports2["ts_language_symbol_for_name"];
      Module["_strncmp"] = _strncmp = wasmExports2["strncmp"];
      Module["_ts_language_symbol_type"] = _ts_language_symbol_type = wasmExports2["ts_language_symbol_type"];
      Module["_ts_language_field_name_for_id"] = _ts_language_field_name_for_id = wasmExports2["ts_language_field_name_for_id"];
      Module["_ts_lookahead_iterator_new"] = _ts_lookahead_iterator_new = wasmExports2["ts_lookahead_iterator_new"];
      Module["_ts_lookahead_iterator_delete"] = _ts_lookahead_iterator_delete = wasmExports2["ts_lookahead_iterator_delete"];
      Module["_ts_lookahead_iterator_reset_state"] = _ts_lookahead_iterator_reset_state = wasmExports2["ts_lookahead_iterator_reset_state"];
      Module["_ts_lookahead_iterator_reset"] = _ts_lookahead_iterator_reset = wasmExports2["ts_lookahead_iterator_reset"];
      Module["_ts_lookahead_iterator_next"] = _ts_lookahead_iterator_next = wasmExports2["ts_lookahead_iterator_next"];
      Module["_ts_lookahead_iterator_current_symbol"] = _ts_lookahead_iterator_current_symbol = wasmExports2["ts_lookahead_iterator_current_symbol"];
      Module["_ts_point_edit"] = _ts_point_edit = wasmExports2["ts_point_edit"];
      Module["_ts_parser_delete"] = _ts_parser_delete = wasmExports2["ts_parser_delete"];
      Module["_ts_parser_reset"] = _ts_parser_reset = wasmExports2["ts_parser_reset"];
      Module["_ts_parser_set_language"] = _ts_parser_set_language = wasmExports2["ts_parser_set_language"];
      Module["_ts_parser_set_included_ranges"] = _ts_parser_set_included_ranges = wasmExports2["ts_parser_set_included_ranges"];
      Module["_ts_query_new"] = _ts_query_new = wasmExports2["ts_query_new"];
      Module["_ts_query_delete"] = _ts_query_delete = wasmExports2["ts_query_delete"];
      Module["_iswspace"] = _iswspace = wasmExports2["iswspace"];
      Module["_iswalnum"] = _iswalnum = wasmExports2["iswalnum"];
      Module["_ts_query_pattern_count"] = _ts_query_pattern_count = wasmExports2["ts_query_pattern_count"];
      Module["_ts_query_capture_count"] = _ts_query_capture_count = wasmExports2["ts_query_capture_count"];
      Module["_ts_query_string_count"] = _ts_query_string_count = wasmExports2["ts_query_string_count"];
      Module["_ts_query_capture_name_for_id"] = _ts_query_capture_name_for_id = wasmExports2["ts_query_capture_name_for_id"];
      Module["_ts_query_capture_quantifier_for_id"] = _ts_query_capture_quantifier_for_id = wasmExports2["ts_query_capture_quantifier_for_id"];
      Module["_ts_query_string_value_for_id"] = _ts_query_string_value_for_id = wasmExports2["ts_query_string_value_for_id"];
      Module["_ts_query_predicates_for_pattern"] = _ts_query_predicates_for_pattern = wasmExports2["ts_query_predicates_for_pattern"];
      Module["_ts_query_start_byte_for_pattern"] = _ts_query_start_byte_for_pattern = wasmExports2["ts_query_start_byte_for_pattern"];
      Module["_ts_query_end_byte_for_pattern"] = _ts_query_end_byte_for_pattern = wasmExports2["ts_query_end_byte_for_pattern"];
      Module["_ts_query_is_pattern_rooted"] = _ts_query_is_pattern_rooted = wasmExports2["ts_query_is_pattern_rooted"];
      Module["_ts_query_is_pattern_non_local"] = _ts_query_is_pattern_non_local = wasmExports2["ts_query_is_pattern_non_local"];
      Module["_ts_query_is_pattern_guaranteed_at_step"] = _ts_query_is_pattern_guaranteed_at_step = wasmExports2["ts_query_is_pattern_guaranteed_at_step"];
      Module["_ts_query_disable_capture"] = _ts_query_disable_capture = wasmExports2["ts_query_disable_capture"];
      Module["_ts_query_disable_pattern"] = _ts_query_disable_pattern = wasmExports2["ts_query_disable_pattern"];
      Module["_ts_tree_copy"] = _ts_tree_copy = wasmExports2["ts_tree_copy"];
      Module["_ts_tree_delete"] = _ts_tree_delete = wasmExports2["ts_tree_delete"];
      Module["_ts_init"] = _ts_init = wasmExports2["ts_init"];
      Module["_ts_parser_new_wasm"] = _ts_parser_new_wasm = wasmExports2["ts_parser_new_wasm"];
      Module["_ts_parser_enable_logger_wasm"] = _ts_parser_enable_logger_wasm = wasmExports2["ts_parser_enable_logger_wasm"];
      Module["_ts_parser_parse_wasm"] = _ts_parser_parse_wasm = wasmExports2["ts_parser_parse_wasm"];
      Module["_ts_parser_included_ranges_wasm"] = _ts_parser_included_ranges_wasm = wasmExports2["ts_parser_included_ranges_wasm"];
      Module["_ts_language_type_is_named_wasm"] = _ts_language_type_is_named_wasm = wasmExports2["ts_language_type_is_named_wasm"];
      Module["_ts_language_type_is_visible_wasm"] = _ts_language_type_is_visible_wasm = wasmExports2["ts_language_type_is_visible_wasm"];
      Module["_ts_language_metadata_wasm"] = _ts_language_metadata_wasm = wasmExports2["ts_language_metadata_wasm"];
      Module["_ts_language_supertypes_wasm"] = _ts_language_supertypes_wasm = wasmExports2["ts_language_supertypes_wasm"];
      Module["_ts_language_subtypes_wasm"] = _ts_language_subtypes_wasm = wasmExports2["ts_language_subtypes_wasm"];
      Module["_ts_tree_root_node_wasm"] = _ts_tree_root_node_wasm = wasmExports2["ts_tree_root_node_wasm"];
      Module["_ts_tree_root_node_with_offset_wasm"] = _ts_tree_root_node_with_offset_wasm = wasmExports2["ts_tree_root_node_with_offset_wasm"];
      Module["_ts_tree_edit_wasm"] = _ts_tree_edit_wasm = wasmExports2["ts_tree_edit_wasm"];
      Module["_ts_tree_included_ranges_wasm"] = _ts_tree_included_ranges_wasm = wasmExports2["ts_tree_included_ranges_wasm"];
      Module["_ts_tree_get_changed_ranges_wasm"] = _ts_tree_get_changed_ranges_wasm = wasmExports2["ts_tree_get_changed_ranges_wasm"];
      Module["_ts_tree_cursor_new_wasm"] = _ts_tree_cursor_new_wasm = wasmExports2["ts_tree_cursor_new_wasm"];
      Module["_ts_tree_cursor_copy_wasm"] = _ts_tree_cursor_copy_wasm = wasmExports2["ts_tree_cursor_copy_wasm"];
      Module["_ts_tree_cursor_delete_wasm"] = _ts_tree_cursor_delete_wasm = wasmExports2["ts_tree_cursor_delete_wasm"];
      Module["_ts_tree_cursor_reset_wasm"] = _ts_tree_cursor_reset_wasm = wasmExports2["ts_tree_cursor_reset_wasm"];
      Module["_ts_tree_cursor_reset_to_wasm"] = _ts_tree_cursor_reset_to_wasm = wasmExports2["ts_tree_cursor_reset_to_wasm"];
      Module["_ts_tree_cursor_goto_first_child_wasm"] = _ts_tree_cursor_goto_first_child_wasm = wasmExports2["ts_tree_cursor_goto_first_child_wasm"];
      Module["_ts_tree_cursor_goto_last_child_wasm"] = _ts_tree_cursor_goto_last_child_wasm = wasmExports2["ts_tree_cursor_goto_last_child_wasm"];
      Module["_ts_tree_cursor_goto_first_child_for_index_wasm"] = _ts_tree_cursor_goto_first_child_for_index_wasm = wasmExports2["ts_tree_cursor_goto_first_child_for_index_wasm"];
      Module["_ts_tree_cursor_goto_first_child_for_position_wasm"] = _ts_tree_cursor_goto_first_child_for_position_wasm = wasmExports2["ts_tree_cursor_goto_first_child_for_position_wasm"];
      Module["_ts_tree_cursor_goto_next_sibling_wasm"] = _ts_tree_cursor_goto_next_sibling_wasm = wasmExports2["ts_tree_cursor_goto_next_sibling_wasm"];
      Module["_ts_tree_cursor_goto_previous_sibling_wasm"] = _ts_tree_cursor_goto_previous_sibling_wasm = wasmExports2["ts_tree_cursor_goto_previous_sibling_wasm"];
      Module["_ts_tree_cursor_goto_descendant_wasm"] = _ts_tree_cursor_goto_descendant_wasm = wasmExports2["ts_tree_cursor_goto_descendant_wasm"];
      Module["_ts_tree_cursor_goto_parent_wasm"] = _ts_tree_cursor_goto_parent_wasm = wasmExports2["ts_tree_cursor_goto_parent_wasm"];
      Module["_ts_tree_cursor_current_node_type_id_wasm"] = _ts_tree_cursor_current_node_type_id_wasm = wasmExports2["ts_tree_cursor_current_node_type_id_wasm"];
      Module["_ts_tree_cursor_current_node_state_id_wasm"] = _ts_tree_cursor_current_node_state_id_wasm = wasmExports2["ts_tree_cursor_current_node_state_id_wasm"];
      Module["_ts_tree_cursor_current_node_is_named_wasm"] = _ts_tree_cursor_current_node_is_named_wasm = wasmExports2["ts_tree_cursor_current_node_is_named_wasm"];
      Module["_ts_tree_cursor_current_node_is_missing_wasm"] = _ts_tree_cursor_current_node_is_missing_wasm = wasmExports2["ts_tree_cursor_current_node_is_missing_wasm"];
      Module["_ts_tree_cursor_current_node_id_wasm"] = _ts_tree_cursor_current_node_id_wasm = wasmExports2["ts_tree_cursor_current_node_id_wasm"];
      Module["_ts_tree_cursor_start_position_wasm"] = _ts_tree_cursor_start_position_wasm = wasmExports2["ts_tree_cursor_start_position_wasm"];
      Module["_ts_tree_cursor_end_position_wasm"] = _ts_tree_cursor_end_position_wasm = wasmExports2["ts_tree_cursor_end_position_wasm"];
      Module["_ts_tree_cursor_start_index_wasm"] = _ts_tree_cursor_start_index_wasm = wasmExports2["ts_tree_cursor_start_index_wasm"];
      Module["_ts_tree_cursor_end_index_wasm"] = _ts_tree_cursor_end_index_wasm = wasmExports2["ts_tree_cursor_end_index_wasm"];
      Module["_ts_tree_cursor_current_field_id_wasm"] = _ts_tree_cursor_current_field_id_wasm = wasmExports2["ts_tree_cursor_current_field_id_wasm"];
      Module["_ts_tree_cursor_current_depth_wasm"] = _ts_tree_cursor_current_depth_wasm = wasmExports2["ts_tree_cursor_current_depth_wasm"];
      Module["_ts_tree_cursor_current_descendant_index_wasm"] = _ts_tree_cursor_current_descendant_index_wasm = wasmExports2["ts_tree_cursor_current_descendant_index_wasm"];
      Module["_ts_tree_cursor_current_node_wasm"] = _ts_tree_cursor_current_node_wasm = wasmExports2["ts_tree_cursor_current_node_wasm"];
      Module["_ts_node_symbol_wasm"] = _ts_node_symbol_wasm = wasmExports2["ts_node_symbol_wasm"];
      Module["_ts_node_field_name_for_child_wasm"] = _ts_node_field_name_for_child_wasm = wasmExports2["ts_node_field_name_for_child_wasm"];
      Module["_ts_node_field_name_for_named_child_wasm"] = _ts_node_field_name_for_named_child_wasm = wasmExports2["ts_node_field_name_for_named_child_wasm"];
      Module["_ts_node_children_by_field_id_wasm"] = _ts_node_children_by_field_id_wasm = wasmExports2["ts_node_children_by_field_id_wasm"];
      Module["_ts_node_first_child_for_byte_wasm"] = _ts_node_first_child_for_byte_wasm = wasmExports2["ts_node_first_child_for_byte_wasm"];
      Module["_ts_node_first_named_child_for_byte_wasm"] = _ts_node_first_named_child_for_byte_wasm = wasmExports2["ts_node_first_named_child_for_byte_wasm"];
      Module["_ts_node_grammar_symbol_wasm"] = _ts_node_grammar_symbol_wasm = wasmExports2["ts_node_grammar_symbol_wasm"];
      Module["_ts_node_child_count_wasm"] = _ts_node_child_count_wasm = wasmExports2["ts_node_child_count_wasm"];
      Module["_ts_node_named_child_count_wasm"] = _ts_node_named_child_count_wasm = wasmExports2["ts_node_named_child_count_wasm"];
      Module["_ts_node_child_wasm"] = _ts_node_child_wasm = wasmExports2["ts_node_child_wasm"];
      Module["_ts_node_named_child_wasm"] = _ts_node_named_child_wasm = wasmExports2["ts_node_named_child_wasm"];
      Module["_ts_node_child_by_field_id_wasm"] = _ts_node_child_by_field_id_wasm = wasmExports2["ts_node_child_by_field_id_wasm"];
      Module["_ts_node_next_sibling_wasm"] = _ts_node_next_sibling_wasm = wasmExports2["ts_node_next_sibling_wasm"];
      Module["_ts_node_prev_sibling_wasm"] = _ts_node_prev_sibling_wasm = wasmExports2["ts_node_prev_sibling_wasm"];
      Module["_ts_node_next_named_sibling_wasm"] = _ts_node_next_named_sibling_wasm = wasmExports2["ts_node_next_named_sibling_wasm"];
      Module["_ts_node_prev_named_sibling_wasm"] = _ts_node_prev_named_sibling_wasm = wasmExports2["ts_node_prev_named_sibling_wasm"];
      Module["_ts_node_descendant_count_wasm"] = _ts_node_descendant_count_wasm = wasmExports2["ts_node_descendant_count_wasm"];
      Module["_ts_node_parent_wasm"] = _ts_node_parent_wasm = wasmExports2["ts_node_parent_wasm"];
      Module["_ts_node_child_with_descendant_wasm"] = _ts_node_child_with_descendant_wasm = wasmExports2["ts_node_child_with_descendant_wasm"];
      Module["_ts_node_descendant_for_index_wasm"] = _ts_node_descendant_for_index_wasm = wasmExports2["ts_node_descendant_for_index_wasm"];
      Module["_ts_node_named_descendant_for_index_wasm"] = _ts_node_named_descendant_for_index_wasm = wasmExports2["ts_node_named_descendant_for_index_wasm"];
      Module["_ts_node_descendant_for_position_wasm"] = _ts_node_descendant_for_position_wasm = wasmExports2["ts_node_descendant_for_position_wasm"];
      Module["_ts_node_named_descendant_for_position_wasm"] = _ts_node_named_descendant_for_position_wasm = wasmExports2["ts_node_named_descendant_for_position_wasm"];
      Module["_ts_node_start_point_wasm"] = _ts_node_start_point_wasm = wasmExports2["ts_node_start_point_wasm"];
      Module["_ts_node_end_point_wasm"] = _ts_node_end_point_wasm = wasmExports2["ts_node_end_point_wasm"];
      Module["_ts_node_start_index_wasm"] = _ts_node_start_index_wasm = wasmExports2["ts_node_start_index_wasm"];
      Module["_ts_node_end_index_wasm"] = _ts_node_end_index_wasm = wasmExports2["ts_node_end_index_wasm"];
      Module["_ts_node_to_string_wasm"] = _ts_node_to_string_wasm = wasmExports2["ts_node_to_string_wasm"];
      Module["_ts_node_children_wasm"] = _ts_node_children_wasm = wasmExports2["ts_node_children_wasm"];
      Module["_ts_node_named_children_wasm"] = _ts_node_named_children_wasm = wasmExports2["ts_node_named_children_wasm"];
      Module["_ts_node_descendants_of_type_wasm"] = _ts_node_descendants_of_type_wasm = wasmExports2["ts_node_descendants_of_type_wasm"];
      Module["_ts_node_is_named_wasm"] = _ts_node_is_named_wasm = wasmExports2["ts_node_is_named_wasm"];
      Module["_ts_node_has_changes_wasm"] = _ts_node_has_changes_wasm = wasmExports2["ts_node_has_changes_wasm"];
      Module["_ts_node_has_error_wasm"] = _ts_node_has_error_wasm = wasmExports2["ts_node_has_error_wasm"];
      Module["_ts_node_is_error_wasm"] = _ts_node_is_error_wasm = wasmExports2["ts_node_is_error_wasm"];
      Module["_ts_node_is_missing_wasm"] = _ts_node_is_missing_wasm = wasmExports2["ts_node_is_missing_wasm"];
      Module["_ts_node_is_extra_wasm"] = _ts_node_is_extra_wasm = wasmExports2["ts_node_is_extra_wasm"];
      Module["_ts_node_parse_state_wasm"] = _ts_node_parse_state_wasm = wasmExports2["ts_node_parse_state_wasm"];
      Module["_ts_node_next_parse_state_wasm"] = _ts_node_next_parse_state_wasm = wasmExports2["ts_node_next_parse_state_wasm"];
      Module["_ts_query_matches_wasm"] = _ts_query_matches_wasm = wasmExports2["ts_query_matches_wasm"];
      Module["_ts_query_captures_wasm"] = _ts_query_captures_wasm = wasmExports2["ts_query_captures_wasm"];
      Module["_memset"] = _memset = wasmExports2["memset"];
      Module["_memcpy"] = _memcpy = wasmExports2["memcpy"];
      Module["_memmove"] = _memmove = wasmExports2["memmove"];
      Module["_iswalpha"] = _iswalpha = wasmExports2["iswalpha"];
      Module["_iswblank"] = _iswblank = wasmExports2["iswblank"];
      Module["_iswdigit"] = _iswdigit = wasmExports2["iswdigit"];
      Module["_iswlower"] = _iswlower = wasmExports2["iswlower"];
      Module["_iswupper"] = _iswupper = wasmExports2["iswupper"];
      Module["_iswxdigit"] = _iswxdigit = wasmExports2["iswxdigit"];
      Module["_memchr"] = _memchr = wasmExports2["memchr"];
      Module["_strlen"] = _strlen = wasmExports2["strlen"];
      Module["_strcmp"] = _strcmp = wasmExports2["strcmp"];
      Module["_strncat"] = _strncat = wasmExports2["strncat"];
      Module["_strncpy"] = _strncpy = wasmExports2["strncpy"];
      Module["_towlower"] = _towlower = wasmExports2["towlower"];
      Module["_towupper"] = _towupper = wasmExports2["towupper"];
      _setThrew = wasmExports2["setThrew"];
      __emscripten_stack_restore = wasmExports2["_emscripten_stack_restore"];
      __emscripten_stack_alloc = wasmExports2["_emscripten_stack_alloc"];
      _emscripten_stack_get_current = wasmExports2["emscripten_stack_get_current"];
      ___wasm_apply_data_relocs = wasmExports2["__wasm_apply_data_relocs"];
    }
    __name(assignWasmExports, "assignWasmExports");
    var wasmImports = {
      /** @export */
      __heap_base: ___heap_base,
      /** @export */
      __indirect_function_table: wasmTable,
      /** @export */
      __memory_base: ___memory_base,
      /** @export */
      __stack_high: ___stack_high,
      /** @export */
      __stack_low: ___stack_low,
      /** @export */
      __stack_pointer: ___stack_pointer,
      /** @export */
      __table_base: ___table_base,
      /** @export */
      _abort_js: __abort_js,
      /** @export */
      emscripten_resize_heap: _emscripten_resize_heap,
      /** @export */
      fd_close: _fd_close,
      /** @export */
      fd_seek: _fd_seek,
      /** @export */
      fd_write: _fd_write,
      /** @export */
      memory: wasmMemory,
      /** @export */
      tree_sitter_log_callback: _tree_sitter_log_callback,
      /** @export */
      tree_sitter_parse_callback: _tree_sitter_parse_callback,
      /** @export */
      tree_sitter_progress_callback: _tree_sitter_progress_callback,
      /** @export */
      tree_sitter_query_progress_callback: _tree_sitter_query_progress_callback
    };
    function callMain(args2 = []) {
      var entryFunction = resolveGlobalSymbol("main").sym;
      if (!entryFunction) return;
      args2.unshift(thisProgram);
      var argc = args2.length;
      var argv = stackAlloc((argc + 1) * 4);
      var argv_ptr = argv;
      args2.forEach((arg) => {
        LE_HEAP_STORE_U32((argv_ptr >> 2) * 4, stringToUTF8OnStack(arg));
        argv_ptr += 4;
      });
      LE_HEAP_STORE_U32((argv_ptr >> 2) * 4, 0);
      try {
        var ret = entryFunction(argc, argv);
        exitJS(
          ret,
          /* implicit = */
          true
        );
        return ret;
      } catch (e) {
        return handleException(e);
      }
    }
    __name(callMain, "callMain");
    function run(args2 = arguments_) {
      if (runDependencies > 0) {
        dependenciesFulfilled = run;
        return;
      }
      preRun();
      if (runDependencies > 0) {
        dependenciesFulfilled = run;
        return;
      }
      function doRun() {
        Module["calledRun"] = true;
        if (ABORT) return;
        initRuntime();
        preMain();
        readyPromiseResolve?.(Module);
        Module["onRuntimeInitialized"]?.();
        var noInitialRun = Module["noInitialRun"] || false;
        if (!noInitialRun) callMain(args2);
        postRun();
      }
      __name(doRun, "doRun");
      if (Module["setStatus"]) {
        Module["setStatus"]("Running...");
        setTimeout(() => {
          setTimeout(() => Module["setStatus"](""), 1);
          doRun();
        }, 1);
      } else {
        doRun();
      }
    }
    __name(run, "run");
    var wasmExports;
    wasmExports = await createWasm();
    run();
    if (runtimeInitialized) {
      moduleRtn = Module;
    } else {
      moduleRtn = new Promise((resolve, reject) => {
        readyPromiseResolve = resolve;
        readyPromiseReject = reject;
      });
    }
    return moduleRtn;
  }
  __name(Module2, "Module");
  var web_tree_sitter_default = Module2;
  var Module3 = null;
  async function initializeBinding(moduleOptions) {
    return Module3 ??= await web_tree_sitter_default(moduleOptions);
  }
  __name(initializeBinding, "initializeBinding");
  function checkModule() {
    return !!Module3;
  }
  __name(checkModule, "checkModule");
  var TRANSFER_BUFFER;
  var LANGUAGE_VERSION;
  var MIN_COMPATIBLE_VERSION;
  var Parser = class {
    static {
      __name(this, "Parser");
    }
    /** @internal */
    [0] = 0;
    // Internal handle for Wasm
    /** @internal */
    [1] = 0;
    // Internal handle for Wasm
    /** @internal */
    logCallback = null;
    /** The parser's current language. */
    language = null;
    /**
     * This must always be called before creating a Parser.
     *
     * You can optionally pass in options to configure the Wasm module, the most common
     * one being `locateFile` to help the module find the `.wasm` file.
     */
    static async init(moduleOptions) {
      setModule(await initializeBinding(moduleOptions));
      TRANSFER_BUFFER = C._ts_init();
      LANGUAGE_VERSION = C.getValue(TRANSFER_BUFFER, "i32");
      MIN_COMPATIBLE_VERSION = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
    }
    /**
     * Create a new parser.
     */
    constructor() {
      this.initialize();
    }
    /** @internal */
    initialize() {
      if (!checkModule()) {
        throw new Error("cannot construct a Parser before calling `init()`");
      }
      C._ts_parser_new_wasm();
      this[0] = C.getValue(TRANSFER_BUFFER, "i32");
      this[1] = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
    }
    /** Delete the parser, freeing its resources. */
    delete() {
      C._ts_parser_delete(this[0]);
      C._free(this[1]);
      this[0] = 0;
      this[1] = 0;
    }
    /**
     * Set the language that the parser should use for parsing.
     *
     * If the language was not successfully assigned, an error will be thrown.
     * This happens if the language was generated with an incompatible
     * version of the Tree-sitter CLI. Check the language's version using
     * {@link Language#version} and compare it to this library's
     * {@link LANGUAGE_VERSION} and {@link MIN_COMPATIBLE_VERSION} constants.
     */
    setLanguage(language) {
      let address;
      if (!language) {
        address = 0;
        this.language = null;
      } else if (language.constructor === Language) {
        address = language[0];
        const version = C._ts_language_abi_version(address);
        if (version < MIN_COMPATIBLE_VERSION || LANGUAGE_VERSION < version) {
          throw new Error(
            `Incompatible language version ${version}. Compatibility range ${MIN_COMPATIBLE_VERSION} through ${LANGUAGE_VERSION}.`
          );
        }
        this.language = language;
      } else {
        throw new Error("Argument must be a Language");
      }
      C._ts_parser_set_language(this[0], address);
      return this;
    }
    /**
     * Parse a slice of UTF8 text.
     *
     * @param {string | ParseCallback} callback - The UTF8-encoded text to parse or a callback function.
     *
     * @param {Tree | null} [oldTree] - A previous syntax tree parsed from the same document. If the text of the
     *   document has changed since `oldTree` was created, then you must edit `oldTree` to match
     *   the new text using {@link Tree#edit}.
     *
     * @param {ParseOptions} [options] - Options for parsing the text.
     *  This can be used to set the included ranges, or a progress callback.
     *
     * @returns {Tree | null} A {@link Tree} if parsing succeeded, or `null` if:
     *  - The parser has not yet had a language assigned with {@link Parser#setLanguage}.
     *  - The progress callback returned true.
     */
    parse(callback, oldTree, options) {
      if (typeof callback === "string") {
        C.currentParseCallback = (index) => callback.slice(index);
      } else if (typeof callback === "function") {
        C.currentParseCallback = callback;
      } else {
        throw new Error("Argument must be a string or a function");
      }
      if (options?.progressCallback) {
        C.currentProgressCallback = options.progressCallback;
      } else {
        C.currentProgressCallback = null;
      }
      if (this.logCallback) {
        C.currentLogCallback = this.logCallback;
        C._ts_parser_enable_logger_wasm(this[0], 1);
      } else {
        C.currentLogCallback = null;
        C._ts_parser_enable_logger_wasm(this[0], 0);
      }
      let rangeCount = 0;
      let rangeAddress = 0;
      if (options?.includedRanges) {
        rangeCount = options.includedRanges.length;
        rangeAddress = C._calloc(rangeCount, SIZE_OF_RANGE);
        let address = rangeAddress;
        for (let i2 = 0; i2 < rangeCount; i2++) {
          marshalRange(address, options.includedRanges[i2]);
          address += SIZE_OF_RANGE;
        }
      }
      const treeAddress = C._ts_parser_parse_wasm(
        this[0],
        this[1],
        oldTree ? oldTree[0] : 0,
        rangeAddress,
        rangeCount
      );
      if (!treeAddress) {
        C.currentParseCallback = null;
        C.currentLogCallback = null;
        C.currentProgressCallback = null;
        return null;
      }
      if (!this.language) {
        throw new Error("Parser must have a language to parse");
      }
      const result = new Tree(INTERNAL, treeAddress, this.language, C.currentParseCallback);
      C.currentParseCallback = null;
      C.currentLogCallback = null;
      C.currentProgressCallback = null;
      return result;
    }
    /**
     * Instruct the parser to start the next parse from the beginning.
     *
     * If the parser previously failed because of a callback, 
     * then by default, it will resume where it left off on the
     * next call to {@link Parser#parse} or other parsing functions.
     * If you don't want to resume, and instead intend to use this parser to
     * parse some other document, you must call `reset` first.
     */
    reset() {
      C._ts_parser_reset(this[0]);
    }
    /** Get the ranges of text that the parser will include when parsing. */
    getIncludedRanges() {
      C._ts_parser_included_ranges_wasm(this[0]);
      const count = C.getValue(TRANSFER_BUFFER, "i32");
      const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
      const result = new Array(count);
      if (count > 0) {
        let address = buffer;
        for (let i2 = 0; i2 < count; i2++) {
          result[i2] = unmarshalRange(address);
          address += SIZE_OF_RANGE;
        }
        C._free(buffer);
      }
      return result;
    }
    /** Set the logging callback that a parser should use during parsing. */
    setLogger(callback) {
      if (!callback) {
        this.logCallback = null;
      } else if (typeof callback !== "function") {
        throw new Error("Logger callback must be a function");
      } else {
        this.logCallback = callback;
      }
      return this;
    }
    /** Get the parser's current logger. */
    getLogger() {
      return this.logCallback;
    }
  };
  var PREDICATE_STEP_TYPE_CAPTURE = 1;
  var PREDICATE_STEP_TYPE_STRING = 2;
  var QUERY_WORD_REGEX = /[\w-]+/g;
  var CaptureQuantifier = {
    Zero: 0,
    ZeroOrOne: 1,
    ZeroOrMore: 2,
    One: 3,
    OneOrMore: 4
  };
  var isCaptureStep = /* @__PURE__ */ __name((step) => step.type === "capture", "isCaptureStep");
  var isStringStep = /* @__PURE__ */ __name((step) => step.type === "string", "isStringStep");
  var QueryErrorKind = {
    Syntax: 1,
    NodeName: 2,
    FieldName: 3,
    CaptureName: 4,
    PatternStructure: 5
  };
  var QueryError = class _QueryError extends Error {
    constructor(kind, info2, index, length) {
      super(_QueryError.formatMessage(kind, info2));
      this.kind = kind;
      this.info = info2;
      this.index = index;
      this.length = length;
      this.name = "QueryError";
    }
    static {
      __name(this, "QueryError");
    }
    /** Formats an error message based on the error kind and info */
    static formatMessage(kind, info2) {
      switch (kind) {
        case QueryErrorKind.NodeName:
          return `Bad node name '${info2.word}'`;
        case QueryErrorKind.FieldName:
          return `Bad field name '${info2.word}'`;
        case QueryErrorKind.CaptureName:
          return `Bad capture name @${info2.word}`;
        case QueryErrorKind.PatternStructure:
          return `Bad pattern structure at offset ${info2.suffix}`;
        case QueryErrorKind.Syntax:
          return `Bad syntax at offset ${info2.suffix}`;
      }
    }
  };
  function parseAnyPredicate(steps, index, operator, textPredicates) {
    if (steps.length !== 3) {
      throw new Error(
        `Wrong number of arguments to \`#${operator}\` predicate. Expected 2, got ${steps.length - 1}`
      );
    }
    if (!isCaptureStep(steps[1])) {
      throw new Error(
        `First argument of \`#${operator}\` predicate must be a capture. Got "${steps[1].value}"`
      );
    }
    const isPositive = operator === "eq?" || operator === "any-eq?";
    const matchAll = !operator.startsWith("any-");
    if (isCaptureStep(steps[2])) {
      const captureName1 = steps[1].name;
      const captureName2 = steps[2].name;
      textPredicates[index].push((captures) => {
        const nodes1 = [];
        const nodes2 = [];
        for (const c of captures) {
          if (c.name === captureName1) nodes1.push(c.node);
          if (c.name === captureName2) nodes2.push(c.node);
        }
        const compare = /* @__PURE__ */ __name((n1, n2, positive) => {
          return positive ? n1.text === n2.text : n1.text !== n2.text;
        }, "compare");
        return matchAll ? nodes1.every((n1) => nodes2.some((n2) => compare(n1, n2, isPositive))) : nodes1.some((n1) => nodes2.some((n2) => compare(n1, n2, isPositive)));
      });
    } else {
      const captureName = steps[1].name;
      const stringValue = steps[2].value;
      const matches = /* @__PURE__ */ __name((n) => n.text === stringValue, "matches");
      const doesNotMatch = /* @__PURE__ */ __name((n) => n.text !== stringValue, "doesNotMatch");
      textPredicates[index].push((captures) => {
        const nodes = [];
        for (const c of captures) {
          if (c.name === captureName) nodes.push(c.node);
        }
        const test = isPositive ? matches : doesNotMatch;
        return matchAll ? nodes.every(test) : nodes.some(test);
      });
    }
  }
  __name(parseAnyPredicate, "parseAnyPredicate");
  function parseMatchPredicate(steps, index, operator, textPredicates) {
    if (steps.length !== 3) {
      throw new Error(
        `Wrong number of arguments to \`#${operator}\` predicate. Expected 2, got ${steps.length - 1}.`
      );
    }
    if (steps[1].type !== "capture") {
      throw new Error(
        `First argument of \`#${operator}\` predicate must be a capture. Got "${steps[1].value}".`
      );
    }
    if (steps[2].type !== "string") {
      throw new Error(
        `Second argument of \`#${operator}\` predicate must be a string. Got @${steps[2].name}.`
      );
    }
    const isPositive = operator === "match?" || operator === "any-match?";
    const matchAll = !operator.startsWith("any-");
    const captureName = steps[1].name;
    const regex = new RegExp(steps[2].value);
    textPredicates[index].push((captures) => {
      const nodes = [];
      for (const c of captures) {
        if (c.name === captureName) nodes.push(c.node.text);
      }
      const test = /* @__PURE__ */ __name((text, positive) => {
        return positive ? regex.test(text) : !regex.test(text);
      }, "test");
      if (nodes.length === 0) return !isPositive;
      return matchAll ? nodes.every((text) => test(text, isPositive)) : nodes.some((text) => test(text, isPositive));
    });
  }
  __name(parseMatchPredicate, "parseMatchPredicate");
  function parseAnyOfPredicate(steps, index, operator, textPredicates) {
    if (steps.length < 2) {
      throw new Error(
        `Wrong number of arguments to \`#${operator}\` predicate. Expected at least 1. Got ${steps.length - 1}.`
      );
    }
    if (steps[1].type !== "capture") {
      throw new Error(
        `First argument of \`#${operator}\` predicate must be a capture. Got "${steps[1].value}".`
      );
    }
    const isPositive = operator === "any-of?";
    const captureName = steps[1].name;
    const stringSteps = steps.slice(2);
    if (!stringSteps.every(isStringStep)) {
      throw new Error(
        `Arguments to \`#${operator}\` predicate must be strings.".`
      );
    }
    const values = stringSteps.map((s) => s.value);
    textPredicates[index].push((captures) => {
      const nodes = [];
      for (const c of captures) {
        if (c.name === captureName) nodes.push(c.node.text);
      }
      if (nodes.length === 0) return !isPositive;
      return nodes.every((text) => values.includes(text)) === isPositive;
    });
  }
  __name(parseAnyOfPredicate, "parseAnyOfPredicate");
  function parseIsPredicate(steps, index, operator, assertedProperties, refutedProperties) {
    if (steps.length < 2 || steps.length > 3) {
      throw new Error(
        `Wrong number of arguments to \`#${operator}\` predicate. Expected 1 or 2. Got ${steps.length - 1}.`
      );
    }
    if (!steps.every(isStringStep)) {
      throw new Error(
        `Arguments to \`#${operator}\` predicate must be strings.".`
      );
    }
    const properties = operator === "is?" ? assertedProperties : refutedProperties;
    if (!properties[index]) properties[index] = {};
    properties[index][steps[1].value] = steps[2]?.value ?? null;
  }
  __name(parseIsPredicate, "parseIsPredicate");
  function parseSetDirective(steps, index, setProperties) {
    if (steps.length < 2 || steps.length > 3) {
      throw new Error(`Wrong number of arguments to \`#set!\` predicate. Expected 1 or 2. Got ${steps.length - 1}.`);
    }
    if (!steps.every(isStringStep)) {
      throw new Error(`Arguments to \`#set!\` predicate must be strings.".`);
    }
    if (!setProperties[index]) setProperties[index] = {};
    setProperties[index][steps[1].value] = steps[2]?.value ?? null;
  }
  __name(parseSetDirective, "parseSetDirective");
  function parsePattern(index, stepType, stepValueId, captureNames, stringValues, steps, textPredicates, predicates, setProperties, assertedProperties, refutedProperties) {
    if (stepType === PREDICATE_STEP_TYPE_CAPTURE) {
      const name2 = captureNames[stepValueId];
      steps.push({ type: "capture", name: name2 });
    } else if (stepType === PREDICATE_STEP_TYPE_STRING) {
      steps.push({ type: "string", value: stringValues[stepValueId] });
    } else if (steps.length > 0) {
      if (steps[0].type !== "string") {
        throw new Error("Predicates must begin with a literal value");
      }
      const operator = steps[0].value;
      switch (operator) {
        case "any-not-eq?":
        case "not-eq?":
        case "any-eq?":
        case "eq?":
          parseAnyPredicate(steps, index, operator, textPredicates);
          break;
        case "any-not-match?":
        case "not-match?":
        case "any-match?":
        case "match?":
          parseMatchPredicate(steps, index, operator, textPredicates);
          break;
        case "not-any-of?":
        case "any-of?":
          parseAnyOfPredicate(steps, index, operator, textPredicates);
          break;
        case "is?":
        case "is-not?":
          parseIsPredicate(steps, index, operator, assertedProperties, refutedProperties);
          break;
        case "set!":
          parseSetDirective(steps, index, setProperties);
          break;
        default:
          predicates[index].push({ operator, operands: steps.slice(1) });
      }
      steps.length = 0;
    }
  }
  __name(parsePattern, "parsePattern");
  var Query = class {
    static {
      __name(this, "Query");
    }
    /** @internal */
    [0] = 0;
    // Internal handle for Wasm
    /** @internal */
    exceededMatchLimit;
    /** @internal */
    textPredicates;
    /** The names of the captures used in the query. */
    captureNames;
    /** The quantifiers of the captures used in the query. */
    captureQuantifiers;
    /**
     * The other user-defined predicates associated with the given index.
     *
     * This includes predicates with operators other than:
     * - `match?`
     * - `eq?` and `not-eq?`
     * - `any-of?` and `not-any-of?`
     * - `is?` and `is-not?`
     * - `set!`
     */
    predicates;
    /** The properties for predicates with the operator `set!`. */
    setProperties;
    /** The properties for predicates with the operator `is?`. */
    assertedProperties;
    /** The properties for predicates with the operator `is-not?`. */
    refutedProperties;
    /** The maximum number of in-progress matches for this cursor. */
    matchLimit;
    /**
     * Create a new query from a string containing one or more S-expression
     * patterns.
     *
     * The query is associated with a particular language, and can only be run
     * on syntax nodes parsed with that language. References to Queries can be
     * shared between multiple threads.
     *
     * @link {@see https://tree-sitter.github.io/tree-sitter/using-parsers/queries}
     */
    constructor(language, source) {
      const sourceLength = C.lengthBytesUTF8(source);
      const sourceAddress = C._malloc(sourceLength + 1);
      C.stringToUTF8(source, sourceAddress, sourceLength + 1);
      const address = C._ts_query_new(
        language[0],
        sourceAddress,
        sourceLength,
        TRANSFER_BUFFER,
        TRANSFER_BUFFER + SIZE_OF_INT
      );
      if (!address) {
        const errorId = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        const errorByte = C.getValue(TRANSFER_BUFFER, "i32");
        const errorIndex = C.UTF8ToString(sourceAddress, errorByte).length;
        const suffix = source.slice(errorIndex, errorIndex + 100).split("\n")[0];
        const word = suffix.match(QUERY_WORD_REGEX)?.[0] ?? "";
        C._free(sourceAddress);
        switch (errorId) {
          case QueryErrorKind.Syntax:
            throw new QueryError(QueryErrorKind.Syntax, { suffix: `${errorIndex}: '${suffix}'...` }, errorIndex, 0);
          case QueryErrorKind.NodeName:
            throw new QueryError(errorId, { word }, errorIndex, word.length);
          case QueryErrorKind.FieldName:
            throw new QueryError(errorId, { word }, errorIndex, word.length);
          case QueryErrorKind.CaptureName:
            throw new QueryError(errorId, { word }, errorIndex, word.length);
          case QueryErrorKind.PatternStructure:
            throw new QueryError(errorId, { suffix: `${errorIndex}: '${suffix}'...` }, errorIndex, 0);
        }
      }
      const stringCount = C._ts_query_string_count(address);
      const captureCount = C._ts_query_capture_count(address);
      const patternCount = C._ts_query_pattern_count(address);
      const captureNames = new Array(captureCount);
      const captureQuantifiers = new Array(patternCount);
      const stringValues = new Array(stringCount);
      for (let i2 = 0; i2 < captureCount; i2++) {
        const nameAddress = C._ts_query_capture_name_for_id(
          address,
          i2,
          TRANSFER_BUFFER
        );
        const nameLength = C.getValue(TRANSFER_BUFFER, "i32");
        captureNames[i2] = C.UTF8ToString(nameAddress, nameLength);
      }
      for (let i2 = 0; i2 < patternCount; i2++) {
        const captureQuantifiersArray = new Array(captureCount);
        for (let j2 = 0; j2 < captureCount; j2++) {
          const quantifier = C._ts_query_capture_quantifier_for_id(address, i2, j2);
          captureQuantifiersArray[j2] = quantifier;
        }
        captureQuantifiers[i2] = captureQuantifiersArray;
      }
      for (let i2 = 0; i2 < stringCount; i2++) {
        const valueAddress = C._ts_query_string_value_for_id(
          address,
          i2,
          TRANSFER_BUFFER
        );
        const nameLength = C.getValue(TRANSFER_BUFFER, "i32");
        stringValues[i2] = C.UTF8ToString(valueAddress, nameLength);
      }
      const setProperties = new Array(patternCount);
      const assertedProperties = new Array(patternCount);
      const refutedProperties = new Array(patternCount);
      const predicates = new Array(patternCount);
      const textPredicates = new Array(patternCount);
      for (let i2 = 0; i2 < patternCount; i2++) {
        const predicatesAddress = C._ts_query_predicates_for_pattern(address, i2, TRANSFER_BUFFER);
        const stepCount = C.getValue(TRANSFER_BUFFER, "i32");
        predicates[i2] = [];
        textPredicates[i2] = [];
        const steps = new Array();
        let stepAddress = predicatesAddress;
        for (let j2 = 0; j2 < stepCount; j2++) {
          const stepType = C.getValue(stepAddress, "i32");
          stepAddress += SIZE_OF_INT;
          const stepValueId = C.getValue(stepAddress, "i32");
          stepAddress += SIZE_OF_INT;
          parsePattern(
            i2,
            stepType,
            stepValueId,
            captureNames,
            stringValues,
            steps,
            textPredicates,
            predicates,
            setProperties,
            assertedProperties,
            refutedProperties
          );
        }
        Object.freeze(textPredicates[i2]);
        Object.freeze(predicates[i2]);
        Object.freeze(setProperties[i2]);
        Object.freeze(assertedProperties[i2]);
        Object.freeze(refutedProperties[i2]);
      }
      C._free(sourceAddress);
      this[0] = address;
      this.captureNames = captureNames;
      this.captureQuantifiers = captureQuantifiers;
      this.textPredicates = textPredicates;
      this.predicates = predicates;
      this.setProperties = setProperties;
      this.assertedProperties = assertedProperties;
      this.refutedProperties = refutedProperties;
      this.exceededMatchLimit = false;
    }
    /** Delete the query, freeing its resources. */
    delete() {
      C._ts_query_delete(this[0]);
      this[0] = 0;
    }
    /**
     * Iterate over all of the matches in the order that they were found.
     *
     * Each match contains the index of the pattern that matched, and a list of
     * captures. Because multiple patterns can match the same set of nodes,
     * one match may contain captures that appear *before* some of the
     * captures from a previous match.
     *
     * @param {Node} node - The node to execute the query on.
     *
     * @param {QueryOptions} options - Options for query execution.
     */
    matches(node, options = {}) {
      const startPosition = options.startPosition ?? ZERO_POINT;
      const endPosition = options.endPosition ?? ZERO_POINT;
      const startIndex = options.startIndex ?? 0;
      const endIndex = options.endIndex ?? 0;
      const startContainingPosition = options.startContainingPosition ?? ZERO_POINT;
      const endContainingPosition = options.endContainingPosition ?? ZERO_POINT;
      const startContainingIndex = options.startContainingIndex ?? 0;
      const endContainingIndex = options.endContainingIndex ?? 0;
      const matchLimit = options.matchLimit ?? 4294967295;
      const maxStartDepth = options.maxStartDepth ?? 4294967295;
      const progressCallback = options.progressCallback;
      if (typeof matchLimit !== "number") {
        throw new Error("Arguments must be numbers");
      }
      this.matchLimit = matchLimit;
      if (endIndex !== 0 && startIndex > endIndex) {
        throw new Error("`startIndex` cannot be greater than `endIndex`");
      }
      if (endPosition !== ZERO_POINT && (startPosition.row > endPosition.row || startPosition.row === endPosition.row && startPosition.column > endPosition.column)) {
        throw new Error("`startPosition` cannot be greater than `endPosition`");
      }
      if (endContainingIndex !== 0 && startContainingIndex > endContainingIndex) {
        throw new Error("`startContainingIndex` cannot be greater than `endContainingIndex`");
      }
      if (endContainingPosition !== ZERO_POINT && (startContainingPosition.row > endContainingPosition.row || startContainingPosition.row === endContainingPosition.row && startContainingPosition.column > endContainingPosition.column)) {
        throw new Error("`startContainingPosition` cannot be greater than `endContainingPosition`");
      }
      if (progressCallback) {
        C.currentQueryProgressCallback = progressCallback;
      }
      marshalNode(node);
      C._ts_query_matches_wasm(
        this[0],
        node.tree[0],
        startPosition.row,
        startPosition.column,
        endPosition.row,
        endPosition.column,
        startIndex,
        endIndex,
        startContainingPosition.row,
        startContainingPosition.column,
        endContainingPosition.row,
        endContainingPosition.column,
        startContainingIndex,
        endContainingIndex,
        matchLimit,
        maxStartDepth
      );
      const rawCount = C.getValue(TRANSFER_BUFFER, "i32");
      const startAddress = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
      const didExceedMatchLimit = C.getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32");
      const result = new Array(rawCount);
      this.exceededMatchLimit = Boolean(didExceedMatchLimit);
      let filteredCount = 0;
      let address = startAddress;
      for (let i2 = 0; i2 < rawCount; i2++) {
        const patternIndex = C.getValue(address, "i32");
        address += SIZE_OF_INT;
        const captureCount = C.getValue(address, "i32");
        address += SIZE_OF_INT;
        const captures = new Array(captureCount);
        address = unmarshalCaptures(this, node.tree, address, patternIndex, captures);
        if (this.textPredicates[patternIndex].every((p) => p(captures))) {
          result[filteredCount] = { patternIndex, captures };
          const setProperties = this.setProperties[patternIndex];
          result[filteredCount].setProperties = setProperties;
          const assertedProperties = this.assertedProperties[patternIndex];
          result[filteredCount].assertedProperties = assertedProperties;
          const refutedProperties = this.refutedProperties[patternIndex];
          result[filteredCount].refutedProperties = refutedProperties;
          filteredCount++;
        }
      }
      result.length = filteredCount;
      C._free(startAddress);
      C.currentQueryProgressCallback = null;
      return result;
    }
    /**
     * Iterate over all of the individual captures in the order that they
     * appear.
     *
     * This is useful if you don't care about which pattern matched, and just
     * want a single, ordered sequence of captures.
     *
     * @param {Node} node - The node to execute the query on.
     *
     * @param {QueryOptions} options - Options for query execution.
     */
    captures(node, options = {}) {
      const startPosition = options.startPosition ?? ZERO_POINT;
      const endPosition = options.endPosition ?? ZERO_POINT;
      const startIndex = options.startIndex ?? 0;
      const endIndex = options.endIndex ?? 0;
      const startContainingPosition = options.startContainingPosition ?? ZERO_POINT;
      const endContainingPosition = options.endContainingPosition ?? ZERO_POINT;
      const startContainingIndex = options.startContainingIndex ?? 0;
      const endContainingIndex = options.endContainingIndex ?? 0;
      const matchLimit = options.matchLimit ?? 4294967295;
      const maxStartDepth = options.maxStartDepth ?? 4294967295;
      const progressCallback = options.progressCallback;
      if (typeof matchLimit !== "number") {
        throw new Error("Arguments must be numbers");
      }
      this.matchLimit = matchLimit;
      if (endIndex !== 0 && startIndex > endIndex) {
        throw new Error("`startIndex` cannot be greater than `endIndex`");
      }
      if (endPosition !== ZERO_POINT && (startPosition.row > endPosition.row || startPosition.row === endPosition.row && startPosition.column > endPosition.column)) {
        throw new Error("`startPosition` cannot be greater than `endPosition`");
      }
      if (endContainingIndex !== 0 && startContainingIndex > endContainingIndex) {
        throw new Error("`startContainingIndex` cannot be greater than `endContainingIndex`");
      }
      if (endContainingPosition !== ZERO_POINT && (startContainingPosition.row > endContainingPosition.row || startContainingPosition.row === endContainingPosition.row && startContainingPosition.column > endContainingPosition.column)) {
        throw new Error("`startContainingPosition` cannot be greater than `endContainingPosition`");
      }
      if (progressCallback) {
        C.currentQueryProgressCallback = progressCallback;
      }
      marshalNode(node);
      C._ts_query_captures_wasm(
        this[0],
        node.tree[0],
        startPosition.row,
        startPosition.column,
        endPosition.row,
        endPosition.column,
        startIndex,
        endIndex,
        startContainingPosition.row,
        startContainingPosition.column,
        endContainingPosition.row,
        endContainingPosition.column,
        startContainingIndex,
        endContainingIndex,
        matchLimit,
        maxStartDepth
      );
      const count = C.getValue(TRANSFER_BUFFER, "i32");
      const startAddress = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
      const didExceedMatchLimit = C.getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32");
      const result = new Array();
      this.exceededMatchLimit = Boolean(didExceedMatchLimit);
      const captures = new Array();
      let address = startAddress;
      for (let i2 = 0; i2 < count; i2++) {
        const patternIndex = C.getValue(address, "i32");
        address += SIZE_OF_INT;
        const captureCount = C.getValue(address, "i32");
        address += SIZE_OF_INT;
        const captureIndex = C.getValue(address, "i32");
        address += SIZE_OF_INT;
        captures.length = captureCount;
        address = unmarshalCaptures(this, node.tree, address, patternIndex, captures);
        if (this.textPredicates[patternIndex].every((p) => p(captures))) {
          const capture = captures[captureIndex];
          const setProperties = this.setProperties[patternIndex];
          capture.setProperties = setProperties;
          const assertedProperties = this.assertedProperties[patternIndex];
          capture.assertedProperties = assertedProperties;
          const refutedProperties = this.refutedProperties[patternIndex];
          capture.refutedProperties = refutedProperties;
          result.push(capture);
        }
      }
      C._free(startAddress);
      C.currentQueryProgressCallback = null;
      return result;
    }
    /** Get the predicates for a given pattern. */
    predicatesForPattern(patternIndex) {
      return this.predicates[patternIndex];
    }
    /**
     * Disable a certain capture within a query.
     *
     * This prevents the capture from being returned in matches, and also
     * avoids any resource usage associated with recording the capture.
     */
    disableCapture(captureName) {
      const captureNameLength = C.lengthBytesUTF8(captureName);
      const captureNameAddress = C._malloc(captureNameLength + 1);
      C.stringToUTF8(captureName, captureNameAddress, captureNameLength + 1);
      C._ts_query_disable_capture(this[0], captureNameAddress, captureNameLength);
      C._free(captureNameAddress);
    }
    /**
     * Disable a certain pattern within a query.
     *
     * This prevents the pattern from matching, and also avoids any resource
     * usage associated with the pattern. This throws an error if the pattern
     * index is out of bounds.
     */
    disablePattern(patternIndex) {
      if (patternIndex >= this.predicates.length) {
        throw new Error(
          `Pattern index is ${patternIndex} but the pattern count is ${this.predicates.length}`
        );
      }
      C._ts_query_disable_pattern(this[0], patternIndex);
    }
    /**
     * Check if, on its last execution, this cursor exceeded its maximum number
     * of in-progress matches.
     */
    didExceedMatchLimit() {
      return this.exceededMatchLimit;
    }
    /** Get the byte offset where the given pattern starts in the query's source. */
    startIndexForPattern(patternIndex) {
      if (patternIndex >= this.predicates.length) {
        throw new Error(
          `Pattern index is ${patternIndex} but the pattern count is ${this.predicates.length}`
        );
      }
      return C._ts_query_start_byte_for_pattern(this[0], patternIndex);
    }
    /** Get the byte offset where the given pattern ends in the query's source. */
    endIndexForPattern(patternIndex) {
      if (patternIndex >= this.predicates.length) {
        throw new Error(
          `Pattern index is ${patternIndex} but the pattern count is ${this.predicates.length}`
        );
      }
      return C._ts_query_end_byte_for_pattern(this[0], patternIndex);
    }
    /** Get the number of patterns in the query. */
    patternCount() {
      return C._ts_query_pattern_count(this[0]);
    }
    /** Get the index for a given capture name. */
    captureIndexForName(captureName) {
      return this.captureNames.indexOf(captureName);
    }
    /** Check if a given pattern within a query has a single root node. */
    isPatternRooted(patternIndex) {
      return C._ts_query_is_pattern_rooted(this[0], patternIndex) === 1;
    }
    /** Check if a given pattern within a query has a single root node. */
    isPatternNonLocal(patternIndex) {
      return C._ts_query_is_pattern_non_local(this[0], patternIndex) === 1;
    }
    /**
     * Check if a given step in a query is 'definite'.
     *
     * A query step is 'definite' if its parent pattern will be guaranteed to
     * match successfully once it reaches the step.
     */
    isPatternGuaranteedAtStep(byteIndex) {
      return C._ts_query_is_pattern_guaranteed_at_step(this[0], byteIndex) === 1;
    }
  };

  // node_modules/prettier/doc.mjs
  var __defProp3 = Object.defineProperty;
  var __export = (target, all) => {
    for (var name2 in all)
      __defProp3(target, name2, { get: all[name2], enumerable: true });
  };
  var public_exports = {};
  __export(public_exports, {
    builders: () => builders,
    printer: () => printer,
    utils: () => utils
  });
  var OPTIONAL_OBJECT = 1;
  var createMethodShim = (methodName, getImplementation) => (flags2, object, ...arguments_2) => {
    if (flags2 | OPTIONAL_OBJECT && (object === void 0 || object === null)) {
      return;
    }
    const implementation = getImplementation.call(object) ?? object[methodName];
    return implementation.apply(object, arguments_2);
  };
  function stringOrArrayAt(index) {
    return this[index < 0 ? this.length + index : index];
  }
  var at2 = /* @__PURE__ */ createMethodShim("at", function() {
    if (Array.isArray(this) || typeof this === "string") {
      return stringOrArrayAt;
    }
  });
  var method_at_default = at2;
  var noop = () => {
  };
  var noop_default = noop;
  var DOC_TYPE_STRING = (
    /** @type {const} */
    "string"
  );
  var DOC_TYPE_ARRAY = (
    /** @type {const} */
    "array"
  );
  var DOC_TYPE_CURSOR = (
    /** @type {const} */
    "cursor"
  );
  var DOC_TYPE_INDENT = (
    /** @type {const} */
    "indent"
  );
  var DOC_TYPE_ALIGN = (
    /** @type {const} */
    "align"
  );
  var DOC_TYPE_TRIM = (
    /** @type {const} */
    "trim"
  );
  var DOC_TYPE_GROUP = (
    /** @type {const} */
    "group"
  );
  var DOC_TYPE_FILL = (
    /** @type {const} */
    "fill"
  );
  var DOC_TYPE_IF_BREAK = (
    /** @type {const} */
    "if-break"
  );
  var DOC_TYPE_INDENT_IF_BREAK = (
    /** @type {const} */
    "indent-if-break"
  );
  var DOC_TYPE_LINE_SUFFIX = (
    /** @type {const} */
    "line-suffix"
  );
  var DOC_TYPE_LINE_SUFFIX_BOUNDARY = (
    /** @type {const} */
    "line-suffix-boundary"
  );
  var DOC_TYPE_LINE = (
    /** @type {const} */
    "line"
  );
  var DOC_TYPE_LABEL = (
    /** @type {const} */
    "label"
  );
  var DOC_TYPE_BREAK_PARENT = (
    /** @type {const} */
    "break-parent"
  );
  var VALID_OBJECT_DOC_TYPES = /* @__PURE__ */ new Set([
    DOC_TYPE_CURSOR,
    DOC_TYPE_INDENT,
    DOC_TYPE_ALIGN,
    DOC_TYPE_TRIM,
    DOC_TYPE_GROUP,
    DOC_TYPE_FILL,
    DOC_TYPE_IF_BREAK,
    DOC_TYPE_INDENT_IF_BREAK,
    DOC_TYPE_LINE_SUFFIX,
    DOC_TYPE_LINE_SUFFIX_BOUNDARY,
    DOC_TYPE_LINE,
    DOC_TYPE_LABEL,
    DOC_TYPE_BREAK_PARENT
  ]);
  function trimNewlinesEnd(string) {
    let end = string.length;
    while (end > 0 && (string[end - 1] === "\r" || string[end - 1] === "\n")) {
      end--;
    }
    return end < string.length ? string.slice(0, end) : string;
  }
  function getOrInsertComputed(map, key, callback) {
    if (!map.has(key)) {
      const value = callback(key);
      map.set(key, value);
    }
    return map.get(key);
  }
  function getDocType(doc) {
    if (typeof doc === "string") {
      return DOC_TYPE_STRING;
    }
    if (Array.isArray(doc)) {
      return DOC_TYPE_ARRAY;
    }
    if (!doc) {
      return;
    }
    const { type } = doc;
    if (VALID_OBJECT_DOC_TYPES.has(type)) {
      return type;
    }
  }
  var get_doc_type_default = getDocType;
  var disjunctionListFormat = (list) => new Intl.ListFormat("en-US", { type: "disjunction" }).format(list);
  function getDocErrorMessage(doc) {
    const type = doc === null ? "null" : typeof doc;
    if (type !== "string" && type !== "object") {
      return `Unexpected doc '${type}', 
Expected it to be 'string' or 'object'.`;
    }
    if (get_doc_type_default(doc)) {
      throw new Error("doc is valid.");
    }
    const objectType = Object.prototype.toString.call(doc);
    if (objectType !== "[object Object]") {
      return `Unexpected doc '${objectType}'.`;
    }
    const EXPECTED_TYPE_VALUES = disjunctionListFormat(
      [...VALID_OBJECT_DOC_TYPES].map((type2) => `'${type2}'`)
    );
    return `Unexpected doc.type '${doc.type}'.
Expected it to be ${EXPECTED_TYPE_VALUES}.`;
  }
  var InvalidDocError = class extends Error {
    name = "InvalidDocError";
    constructor(doc) {
      super(getDocErrorMessage(doc));
      this.doc = doc;
    }
  };
  var invalid_doc_error_default = InvalidDocError;
  var traverseDocOnExitStackMarker = {};
  function traverseDoc(doc, onEnter, onExit, shouldTraverseConditionalGroups) {
    const docsStack = [doc];
    while (docsStack.length > 0) {
      const doc2 = docsStack.pop();
      if (doc2 === traverseDocOnExitStackMarker) {
        onExit(docsStack.pop());
        continue;
      }
      if (onExit) {
        docsStack.push(doc2, traverseDocOnExitStackMarker);
      }
      const docType = get_doc_type_default(doc2);
      if (!docType) {
        throw new invalid_doc_error_default(doc2);
      }
      if (onEnter?.(doc2) === false) {
        continue;
      }
      switch (docType) {
        case DOC_TYPE_ARRAY:
        case DOC_TYPE_FILL: {
          const parts2 = docType === DOC_TYPE_ARRAY ? doc2 : doc2.parts;
          for (let ic = parts2.length, i2 = ic - 1; i2 >= 0; --i2) {
            docsStack.push(parts2[i2]);
          }
          break;
        }
        case DOC_TYPE_IF_BREAK:
          docsStack.push(doc2.flatContents, doc2.breakContents);
          break;
        case DOC_TYPE_GROUP:
          if (shouldTraverseConditionalGroups && doc2.expandedStates) {
            for (let ic = doc2.expandedStates.length, i2 = ic - 1; i2 >= 0; --i2) {
              docsStack.push(doc2.expandedStates[i2]);
            }
          } else {
            docsStack.push(doc2.contents);
          }
          break;
        case DOC_TYPE_ALIGN:
        case DOC_TYPE_INDENT:
        case DOC_TYPE_INDENT_IF_BREAK:
        case DOC_TYPE_LABEL:
        case DOC_TYPE_LINE_SUFFIX:
          docsStack.push(doc2.contents);
          break;
        case DOC_TYPE_STRING:
        case DOC_TYPE_CURSOR:
        case DOC_TYPE_TRIM:
        case DOC_TYPE_LINE_SUFFIX_BOUNDARY:
        case DOC_TYPE_LINE:
        case DOC_TYPE_BREAK_PARENT:
          break;
        default:
          throw new invalid_doc_error_default(doc2);
      }
    }
  }
  var traverse_doc_default = traverseDoc;
  function mapDoc(doc, cb) {
    if (typeof doc === "string") {
      return cb(doc);
    }
    const mapped = /* @__PURE__ */ new Map();
    return rec(doc);
    function rec(doc2) {
      return getOrInsertComputed(mapped, doc2, process2);
    }
    function process2(doc2) {
      switch (get_doc_type_default(doc2)) {
        case DOC_TYPE_ARRAY:
          return cb(doc2.map(rec));
        case DOC_TYPE_FILL:
          return cb({
            ...doc2,
            parts: doc2.parts.map(rec)
          });
        case DOC_TYPE_IF_BREAK:
          return cb({
            ...doc2,
            breakContents: rec(doc2.breakContents),
            flatContents: rec(doc2.flatContents)
          });
        case DOC_TYPE_GROUP: {
          let {
            expandedStates,
            contents
          } = doc2;
          if (expandedStates) {
            expandedStates = expandedStates.map(rec);
            contents = expandedStates[0];
          } else {
            contents = rec(contents);
          }
          return cb({
            ...doc2,
            contents,
            expandedStates
          });
        }
        case DOC_TYPE_ALIGN:
        case DOC_TYPE_INDENT:
        case DOC_TYPE_INDENT_IF_BREAK:
        case DOC_TYPE_LABEL:
        case DOC_TYPE_LINE_SUFFIX:
          return cb({
            ...doc2,
            contents: rec(doc2.contents)
          });
        case DOC_TYPE_STRING:
        case DOC_TYPE_CURSOR:
        case DOC_TYPE_TRIM:
        case DOC_TYPE_LINE_SUFFIX_BOUNDARY:
        case DOC_TYPE_LINE:
        case DOC_TYPE_BREAK_PARENT:
          return cb(doc2);
        default:
          throw new invalid_doc_error_default(doc2);
      }
    }
  }
  function findInDoc(doc, fn2, defaultValue) {
    let result = defaultValue;
    let shouldSkipFurtherProcessing = false;
    function findInDocOnEnterFn(doc2) {
      if (shouldSkipFurtherProcessing) {
        return false;
      }
      const maybeResult = fn2(doc2);
      if (maybeResult !== void 0) {
        shouldSkipFurtherProcessing = true;
        result = maybeResult;
      }
    }
    traverse_doc_default(doc, findInDocOnEnterFn);
    return result;
  }
  function willBreakFn(doc) {
    if (doc.type === DOC_TYPE_GROUP && doc.break) {
      return true;
    }
    if (doc.type === DOC_TYPE_LINE && doc.hard) {
      return true;
    }
    if (doc.type === DOC_TYPE_BREAK_PARENT) {
      return true;
    }
  }
  function willBreak(doc) {
    return findInDoc(doc, willBreakFn, false);
  }
  function breakParentGroup(groupStack) {
    if (groupStack.length > 0) {
      const parentGroup = method_at_default(
        /* OPTIONAL_OBJECT: false */
        0,
        groupStack,
        -1
      );
      if (!parentGroup.expandedStates && !parentGroup.break) {
        parentGroup.break = "propagated";
      }
    }
    return null;
  }
  function propagateBreaks(doc) {
    const alreadyVisitedSet = /* @__PURE__ */ new Set();
    const groupStack = [];
    function propagateBreaksOnEnterFn(doc2) {
      if (doc2.type === DOC_TYPE_BREAK_PARENT) {
        breakParentGroup(groupStack);
      }
      if (doc2.type === DOC_TYPE_GROUP) {
        groupStack.push(doc2);
        if (alreadyVisitedSet.has(doc2)) {
          return false;
        }
        alreadyVisitedSet.add(doc2);
      }
    }
    function propagateBreaksOnExitFn(doc2) {
      if (doc2.type === DOC_TYPE_GROUP) {
        const group22 = groupStack.pop();
        if (group22.break) {
          breakParentGroup(groupStack);
        }
      }
    }
    traverse_doc_default(
      doc,
      propagateBreaksOnEnterFn,
      propagateBreaksOnExitFn,
      /* shouldTraverseConditionalGroups */
      true
    );
  }
  function removeLinesFn(doc) {
    if (doc.type === DOC_TYPE_LINE && !doc.hard) {
      return doc.soft ? "" : " ";
    }
    if (doc.type === DOC_TYPE_IF_BREAK) {
      return doc.flatContents;
    }
    return doc;
  }
  function removeLines(doc) {
    return mapDoc(doc, removeLinesFn);
  }
  function stripTrailingHardlineFromParts(parts2) {
    parts2 = [...parts2];
    while (parts2.length >= 2 && method_at_default(
      /* OPTIONAL_OBJECT: false */
      0,
      parts2,
      -2
    ).type === DOC_TYPE_LINE && method_at_default(
      /* OPTIONAL_OBJECT: false */
      0,
      parts2,
      -1
    ).type === DOC_TYPE_BREAK_PARENT) {
      parts2.length -= 2;
    }
    if (parts2.length > 0) {
      const lastPart = stripTrailingHardlineFromDoc(method_at_default(
        /* OPTIONAL_OBJECT: false */
        0,
        parts2,
        -1
      ));
      parts2[parts2.length - 1] = lastPart;
    }
    return parts2;
  }
  function stripTrailingHardlineFromDoc(doc) {
    switch (get_doc_type_default(doc)) {
      case DOC_TYPE_INDENT:
      case DOC_TYPE_INDENT_IF_BREAK:
      case DOC_TYPE_GROUP:
      case DOC_TYPE_LINE_SUFFIX:
      case DOC_TYPE_LABEL: {
        const contents = stripTrailingHardlineFromDoc(doc.contents);
        return {
          ...doc,
          contents
        };
      }
      case DOC_TYPE_IF_BREAK:
        return {
          ...doc,
          breakContents: stripTrailingHardlineFromDoc(doc.breakContents),
          flatContents: stripTrailingHardlineFromDoc(doc.flatContents)
        };
      case DOC_TYPE_FILL:
        return {
          ...doc,
          parts: stripTrailingHardlineFromParts(doc.parts)
        };
      case DOC_TYPE_ARRAY:
        return stripTrailingHardlineFromParts(doc);
      case DOC_TYPE_STRING:
        return trimNewlinesEnd(doc);
      case DOC_TYPE_ALIGN:
      case DOC_TYPE_CURSOR:
      case DOC_TYPE_TRIM:
      case DOC_TYPE_LINE_SUFFIX_BOUNDARY:
      case DOC_TYPE_LINE:
      case DOC_TYPE_BREAK_PARENT:
        break;
      default:
        throw new invalid_doc_error_default(doc);
    }
    return doc;
  }
  function stripTrailingHardline(doc) {
    return stripTrailingHardlineFromDoc(cleanDoc(doc));
  }
  function cleanDocFn(doc) {
    switch (get_doc_type_default(doc)) {
      case DOC_TYPE_FILL: {
        const {
          parts: parts2
        } = doc;
        if (parts2.every((part) => part === "")) {
          return "";
        }
        if (parts2.length === 1) {
          return parts2[0];
        }
        break;
      }
      case DOC_TYPE_GROUP:
        if (!doc.contents && !doc.id && !doc.break && !doc.expandedStates) {
          return "";
        }
        if (doc.contents.type === DOC_TYPE_GROUP && doc.contents.id === doc.id && doc.contents.break === doc.break && doc.contents.expandedStates === doc.expandedStates) {
          return doc.contents;
        }
        break;
      case DOC_TYPE_ALIGN:
      case DOC_TYPE_INDENT:
      case DOC_TYPE_INDENT_IF_BREAK:
      case DOC_TYPE_LINE_SUFFIX:
        if (!doc.contents) {
          return "";
        }
        break;
      case DOC_TYPE_IF_BREAK:
        if (!doc.flatContents && !doc.breakContents) {
          return "";
        }
        break;
      case DOC_TYPE_ARRAY: {
        const parts2 = [];
        for (const part of doc) {
          if (!part) {
            continue;
          }
          const [currentPart, ...restParts] = Array.isArray(part) ? part : [part];
          if (typeof currentPart === "string" && typeof method_at_default(
            /* OPTIONAL_OBJECT: false */
            0,
            parts2,
            -1
          ) === "string") {
            parts2[parts2.length - 1] += currentPart;
          } else {
            parts2.push(currentPart);
          }
          parts2.push(...restParts);
        }
        if (parts2.length === 0) {
          return "";
        }
        if (parts2.length === 1) {
          return parts2[0];
        }
        return parts2;
      }
      case DOC_TYPE_STRING:
      case DOC_TYPE_CURSOR:
      case DOC_TYPE_TRIM:
      case DOC_TYPE_LINE_SUFFIX_BOUNDARY:
      case DOC_TYPE_LINE:
      case DOC_TYPE_LABEL:
      case DOC_TYPE_BREAK_PARENT:
        break;
      default:
        throw new invalid_doc_error_default(doc);
    }
    return doc;
  }
  function cleanDoc(doc) {
    return mapDoc(doc, (currentDoc) => cleanDocFn(currentDoc));
  }
  function replaceEndOfLine(doc, replacement = literalline) {
    return mapDoc(doc, (currentDoc) => typeof currentDoc === "string" ? join(replacement, currentDoc.split("\n")) : currentDoc);
  }
  function canBreakFn(doc) {
    if (doc.type === DOC_TYPE_LINE) {
      return true;
    }
  }
  function canBreak(doc) {
    return findInDoc(doc, canBreakFn, false);
  }
  var assertDoc = true ? noop_default : (
    /**
    @param {Doc} doc
    */
    (function(doc) {
      traverse_doc_default(doc, (doc2) => {
        if (typeof doc2 === "string" || checked.has(doc2)) {
          return false;
        }
        checked.add(doc2);
      });
    })
  );
  var assertDocArray = true ? noop_default : (
    /**
    @param {readonly Doc[]} docs
    @param {boolean} [optional = false]
    */
    (function(docs, optional = false) {
      if (optional && !docs) {
        return;
      }
      if (!Array.isArray(docs)) {
        throw new TypeError("Unexpected doc array.");
      }
      for (const doc of docs) {
        assertDoc(doc);
      }
    })
  );
  var assertDocFillParts = true ? noop_default : (
    /**
    @param {readonly Doc[]} parts
    */
    (function(parts2) {
      assertDocArray(parts2);
      if (parts2.length > 1 && isEmptyDoc(method_at_default(
        /* OPTIONAL_OBJECT: false */
        0,
        parts2,
        -1
      ))) {
        parts2 = parts2.slice(0, -1);
      }
      for (const [i2, doc] of parts2.entries()) {
        if (i2 % 2 === 1 && !isValidSeparator(doc)) {
          const type = get_doc_type_default(doc);
          throw new Error(`Unexpected non-line-break doc at ${i2}. Doc type is ${type}.`);
        }
      }
    })
  );
  var assertAlignType = true ? noop_default : function(alignType) {
    if (!(typeof alignType === "number" || typeof alignType === "string" || alignType?.type === "root")) {
      throw new TypeError(`Invalid alignType '${alignType}'.`);
    }
  };
  function indent(contents) {
    assertDoc(contents);
    return { type: DOC_TYPE_INDENT, contents };
  }
  function align(alignType, contents) {
    assertAlignType(alignType);
    assertDoc(contents);
    return { type: DOC_TYPE_ALIGN, contents, n: alignType };
  }
  function dedentToRoot(contents) {
    return align(Number.NEGATIVE_INFINITY, contents);
  }
  function markAsRoot(contents) {
    return align({ type: "root" }, contents);
  }
  function dedent(contents) {
    return align(-1, contents);
  }
  function addAlignmentToDoc(doc, size, tabWidth) {
    assertDoc(doc);
    let aligned = doc;
    if (size > 0) {
      for (let level = 0; level < Math.floor(size / tabWidth); ++level) {
        aligned = indent(aligned);
      }
      aligned = align(size % tabWidth, aligned);
      aligned = align(Number.NEGATIVE_INFINITY, aligned);
    }
    return aligned;
  }
  var breakParent = { type: DOC_TYPE_BREAK_PARENT };
  var cursor = { type: DOC_TYPE_CURSOR };
  function fill(parts2) {
    assertDocFillParts(parts2);
    return { type: DOC_TYPE_FILL, parts: parts2 };
  }
  function group(contents, options = {}) {
    assertDoc(contents);
    assertDocArray(
      options.expandedStates,
      /* optional */
      true
    );
    return {
      type: DOC_TYPE_GROUP,
      id: options.id,
      contents,
      break: Boolean(options.shouldBreak),
      expandedStates: options.expandedStates
    };
  }
  function conditionalGroup(states, options) {
    return group(states[0], { ...options, expandedStates: states });
  }
  function ifBreak(breakContents, flatContents = "", options = {}) {
    assertDoc(breakContents);
    if (flatContents !== "") {
      assertDoc(flatContents);
    }
    return {
      type: DOC_TYPE_IF_BREAK,
      breakContents,
      flatContents,
      groupId: options.groupId
    };
  }
  function indentIfBreak(contents, options) {
    assertDoc(contents);
    return {
      type: DOC_TYPE_INDENT_IF_BREAK,
      contents,
      groupId: options.groupId,
      negate: options.negate
    };
  }
  function join(separator, docs) {
    assertDoc(separator);
    assertDocArray(docs);
    const parts2 = [];
    for (let i2 = 0; i2 < docs.length; i2++) {
      if (i2 !== 0) {
        parts2.push(separator);
      }
      parts2.push(docs[i2]);
    }
    return parts2;
  }
  function label(label2, contents) {
    assertDoc(contents);
    return label2 ? { type: DOC_TYPE_LABEL, label: label2, contents } : contents;
  }
  var line = { type: DOC_TYPE_LINE };
  var softline = { type: DOC_TYPE_LINE, soft: true };
  var hardlineWithoutBreakParent = { type: DOC_TYPE_LINE, hard: true };
  var hardline = [hardlineWithoutBreakParent, breakParent];
  var literallineWithoutBreakParent = {
    type: DOC_TYPE_LINE,
    hard: true,
    literal: true
  };
  var literalline = [literallineWithoutBreakParent, breakParent];
  function lineSuffix(contents) {
    assertDoc(contents);
    return { type: DOC_TYPE_LINE_SUFFIX, contents };
  }
  var lineSuffixBoundary = { type: DOC_TYPE_LINE_SUFFIX_BOUNDARY };
  var trim = { type: DOC_TYPE_TRIM };
  var stringReplaceAll = String.prototype.replaceAll ?? function(pattern, replacement) {
    if (pattern.global) {
      return this.replace(pattern, replacement);
    }
    return this.split(pattern).join(replacement);
  };
  var replaceAll = /* @__PURE__ */ createMethodShim("replaceAll", function() {
    if (typeof this === "string") {
      return stringReplaceAll;
    }
  });
  var method_replace_all_default = replaceAll;
  var OPTION_CR = "cr";
  var OPTION_CRLF = "crlf";
  var CHARACTER_CR = "\r";
  var CHARACTER_CRLF = "\r\n";
  var CHARACTER_LF = "\n";
  var DEFAULT_EOL = CHARACTER_LF;
  function convertEndOfLineOptionToCharacter(endOfLineOption) {
    return endOfLineOption === OPTION_CR ? CHARACTER_CR : endOfLineOption === OPTION_CRLF ? CHARACTER_CRLF : DEFAULT_EOL;
  }
  var emoji_regex_default = () => {
    return /[#*0-9]\uFE0F?\u20E3|[\xA9\xAE\u203C\u2049\u2122\u2139\u2194-\u2199\u21A9\u21AA\u231A\u231B\u2328\u23CF\u23ED-\u23EF\u23F1\u23F2\u23F8-\u23FA\u24C2\u25AA\u25AB\u25B6\u25C0\u25FB\u25FC\u25FE\u2600-\u2604\u260E\u2611\u2614\u2615\u2618\u2620\u2622\u2623\u2626\u262A\u262E\u262F\u2638-\u263A\u2640\u2642\u2648-\u2653\u265F\u2660\u2663\u2665\u2666\u2668\u267B\u267E\u267F\u2692\u2694-\u2697\u2699\u269B\u269C\u26A0\u26A7\u26AA\u26B0\u26B1\u26BD\u26BE\u26C4\u26C8\u26CF\u26D1\u26E9\u26F0-\u26F5\u26F7\u26F8\u26FA\u2702\u2708\u2709\u270F\u2712\u2714\u2716\u271D\u2721\u2733\u2734\u2744\u2747\u2757\u2763\u27A1\u2934\u2935\u2B05-\u2B07\u2B1B\u2B1C\u2B55\u3030\u303D\u3297\u3299]\uFE0F?|[\u261D\u270C\u270D](?:\uD83C[\uDFFB-\uDFFF]|\uFE0F)?|[\u270A\u270B](?:\uD83C[\uDFFB-\uDFFF])?|[\u23E9-\u23EC\u23F0\u23F3\u25FD\u2693\u26A1\u26AB\u26C5\u26CE\u26D4\u26EA\u26FD\u2705\u2728\u274C\u274E\u2753-\u2755\u2795-\u2797\u27B0\u27BF\u2B50]|\u26D3\uFE0F?(?:\u200D\uD83D\uDCA5)?|\u26F9(?:\uD83C[\uDFFB-\uDFFF]|\uFE0F)?(?:\u200D[\u2640\u2642]\uFE0F?)?|\u2764\uFE0F?(?:\u200D(?:\uD83D\uDD25|\uD83E\uDE79))?|\uD83C(?:[\uDC04\uDD70\uDD71\uDD7E\uDD7F\uDE02\uDE37\uDF21\uDF24-\uDF2C\uDF36\uDF7D\uDF96\uDF97\uDF99-\uDF9B\uDF9E\uDF9F\uDFCD\uDFCE\uDFD4-\uDFDF\uDFF5\uDFF7]\uFE0F?|[\uDF85\uDFC2\uDFC7](?:\uD83C[\uDFFB-\uDFFF])?|[\uDFC4\uDFCA](?:\uD83C[\uDFFB-\uDFFF])?(?:\u200D[\u2640\u2642]\uFE0F?)?|[\uDFCB\uDFCC](?:\uD83C[\uDFFB-\uDFFF]|\uFE0F)?(?:\u200D[\u2640\u2642]\uFE0F?)?|[\uDCCF\uDD8E\uDD91-\uDD9A\uDE01\uDE1A\uDE2F\uDE32-\uDE36\uDE38-\uDE3A\uDE50\uDE51\uDF00-\uDF20\uDF2D-\uDF35\uDF37-\uDF43\uDF45-\uDF4A\uDF4C-\uDF7C\uDF7E-\uDF84\uDF86-\uDF93\uDFA0-\uDFC1\uDFC5\uDFC6\uDFC8\uDFC9\uDFCF-\uDFD3\uDFE0-\uDFF0\uDFF8-\uDFFF]|\uDDE6\uD83C[\uDDE8-\uDDEC\uDDEE\uDDF1\uDDF2\uDDF4\uDDF6-\uDDFA\uDDFC\uDDFD\uDDFF]|\uDDE7\uD83C[\uDDE6\uDDE7\uDDE9-\uDDEF\uDDF1-\uDDF4\uDDF6-\uDDF9\uDDFB\uDDFC\uDDFE\uDDFF]|\uDDE8\uD83C[\uDDE6\uDDE8\uDDE9\uDDEB-\uDDEE\uDDF0-\uDDF7\uDDFA-\uDDFF]|\uDDE9\uD83C[\uDDEA\uDDEC\uDDEF\uDDF0\uDDF2\uDDF4\uDDFF]|\uDDEA\uD83C[\uDDE6\uDDE8\uDDEA\uDDEC\uDDED\uDDF7-\uDDFA]|\uDDEB\uD83C[\uDDEE-\uDDF0\uDDF2\uDDF4\uDDF7]|\uDDEC\uD83C[\uDDE6\uDDE7\uDDE9-\uDDEE\uDDF1-\uDDF3\uDDF5-\uDDFA\uDDFC\uDDFE]|\uDDED\uD83C[\uDDF0\uDDF2\uDDF3\uDDF7\uDDF9\uDDFA]|\uDDEE\uD83C[\uDDE8-\uDDEA\uDDF1-\uDDF4\uDDF6-\uDDF9]|\uDDEF\uD83C[\uDDEA\uDDF2\uDDF4\uDDF5]|\uDDF0\uD83C[\uDDEA\uDDEC-\uDDEE\uDDF2\uDDF3\uDDF5\uDDF7\uDDFC\uDDFE\uDDFF]|\uDDF1\uD83C[\uDDE6-\uDDE8\uDDEE\uDDF0\uDDF7-\uDDFB\uDDFE]|\uDDF2\uD83C[\uDDE6\uDDE8-\uDDED\uDDF0-\uDDFF]|\uDDF3\uD83C[\uDDE6\uDDE8\uDDEA-\uDDEC\uDDEE\uDDF1\uDDF4\uDDF5\uDDF7\uDDFA\uDDFF]|\uDDF4\uD83C\uDDF2|\uDDF5\uD83C[\uDDE6\uDDEA-\uDDED\uDDF0-\uDDF3\uDDF7-\uDDF9\uDDFC\uDDFE]|\uDDF6\uD83C\uDDE6|\uDDF7\uD83C[\uDDEA\uDDF4\uDDF8\uDDFA\uDDFC]|\uDDF8\uD83C[\uDDE6-\uDDEA\uDDEC-\uDDF4\uDDF7-\uDDF9\uDDFB\uDDFD-\uDDFF]|\uDDF9\uD83C[\uDDE6\uDDE8\uDDE9\uDDEB-\uDDED\uDDEF-\uDDF4\uDDF7\uDDF9\uDDFB\uDDFC\uDDFF]|\uDDFA\uD83C[\uDDE6\uDDEC\uDDF2\uDDF3\uDDF8\uDDFE\uDDFF]|\uDDFB\uD83C[\uDDE6\uDDE8\uDDEA\uDDEC\uDDEE\uDDF3\uDDFA]|\uDDFC\uD83C[\uDDEB\uDDF8]|\uDDFD\uD83C\uDDF0|\uDDFE\uD83C[\uDDEA\uDDF9]|\uDDFF\uD83C[\uDDE6\uDDF2\uDDFC]|\uDF44(?:\u200D\uD83D\uDFEB)?|\uDF4B(?:\u200D\uD83D\uDFE9)?|\uDFC3(?:\uD83C[\uDFFB-\uDFFF])?(?:\u200D(?:[\u2640\u2642]\uFE0F?(?:\u200D\u27A1\uFE0F?)?|\u27A1\uFE0F?))?|\uDFF3\uFE0F?(?:\u200D(?:\u26A7\uFE0F?|\uD83C\uDF08))?|\uDFF4(?:\u200D\u2620\uFE0F?|\uDB40\uDC67\uDB40\uDC62\uDB40(?:\uDC65\uDB40\uDC6E\uDB40\uDC67|\uDC73\uDB40\uDC63\uDB40\uDC74|\uDC77\uDB40\uDC6C\uDB40\uDC73)\uDB40\uDC7F)?)|\uD83D(?:[\uDC3F\uDCFD\uDD49\uDD4A\uDD6F\uDD70\uDD73\uDD76-\uDD79\uDD87\uDD8A-\uDD8D\uDDA5\uDDA8\uDDB1\uDDB2\uDDBC\uDDC2-\uDDC4\uDDD1-\uDDD3\uDDDC-\uDDDE\uDDE1\uDDE3\uDDE8\uDDEF\uDDF3\uDDFA\uDECB\uDECD-\uDECF\uDEE0-\uDEE5\uDEE9\uDEF0\uDEF3]\uFE0F?|[\uDC42\uDC43\uDC46-\uDC50\uDC66\uDC67\uDC6B-\uDC6D\uDC72\uDC74-\uDC76\uDC78\uDC7C\uDC83\uDC85\uDC8F\uDC91\uDCAA\uDD7A\uDD95\uDD96\uDE4C\uDE4F\uDEC0\uDECC](?:\uD83C[\uDFFB-\uDFFF])?|[\uDC6E-\uDC71\uDC73\uDC77\uDC81\uDC82\uDC86\uDC87\uDE45-\uDE47\uDE4B\uDE4D\uDE4E\uDEA3\uDEB4\uDEB5](?:\uD83C[\uDFFB-\uDFFF])?(?:\u200D[\u2640\u2642]\uFE0F?)?|[\uDD74\uDD90](?:\uD83C[\uDFFB-\uDFFF]|\uFE0F)?|[\uDC00-\uDC07\uDC09-\uDC14\uDC16-\uDC25\uDC27-\uDC3A\uDC3C-\uDC3E\uDC40\uDC44\uDC45\uDC51-\uDC65\uDC6A\uDC79-\uDC7B\uDC7D-\uDC80\uDC84\uDC88-\uDC8E\uDC90\uDC92-\uDCA9\uDCAB-\uDCFC\uDCFF-\uDD3D\uDD4B-\uDD4E\uDD50-\uDD67\uDDA4\uDDFB-\uDE2D\uDE2F-\uDE34\uDE37-\uDE41\uDE43\uDE44\uDE48-\uDE4A\uDE80-\uDEA2\uDEA4-\uDEB3\uDEB7-\uDEBF\uDEC1-\uDEC5\uDED0-\uDED2\uDED5-\uDED8\uDEDC-\uDEDF\uDEEB\uDEEC\uDEF4-\uDEFC\uDFE0-\uDFEB\uDFF0]|\uDC08(?:\u200D\u2B1B)?|\uDC15(?:\u200D\uD83E\uDDBA)?|\uDC26(?:\u200D(?:\u2B1B|\uD83D\uDD25))?|\uDC3B(?:\u200D\u2744\uFE0F?)?|\uDC41\uFE0F?(?:\u200D\uD83D\uDDE8\uFE0F?)?|\uDC68(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?\uDC68|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDC68\uDC69]\u200D\uD83D(?:\uDC66(?:\u200D\uD83D\uDC66)?|\uDC67(?:\u200D\uD83D[\uDC66\uDC67])?)|[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC66(?:\u200D\uD83D\uDC66)?|\uDC67(?:\u200D\uD83D[\uDC66\uDC67])?)|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3]))|\uD83C(?:\uDFFB(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?\uDC68\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83D\uDC68\uD83C[\uDFFC-\uDFFF])|\uD83E(?:[\uDD1D\uDEEF]\u200D\uD83D\uDC68\uD83C[\uDFFC-\uDFFF]|[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3])))?|\uDFFC(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?\uDC68\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83D\uDC68\uD83C[\uDFFB\uDFFD-\uDFFF])|\uD83E(?:[\uDD1D\uDEEF]\u200D\uD83D\uDC68\uD83C[\uDFFB\uDFFD-\uDFFF]|[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3])))?|\uDFFD(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?\uDC68\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83D\uDC68\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])|\uD83E(?:[\uDD1D\uDEEF]\u200D\uD83D\uDC68\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF]|[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3])))?|\uDFFE(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?\uDC68\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83D\uDC68\uD83C[\uDFFB-\uDFFD\uDFFF])|\uD83E(?:[\uDD1D\uDEEF]\u200D\uD83D\uDC68\uD83C[\uDFFB-\uDFFD\uDFFF]|[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3])))?|\uDFFF(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?\uDC68\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83D\uDC68\uD83C[\uDFFB-\uDFFE])|\uD83E(?:[\uDD1D\uDEEF]\u200D\uD83D\uDC68\uD83C[\uDFFB-\uDFFE]|[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3])))?))?|\uDC69(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?[\uDC68\uDC69]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC66(?:\u200D\uD83D\uDC66)?|\uDC67(?:\u200D\uD83D[\uDC66\uDC67])?|\uDC69\u200D\uD83D(?:\uDC66(?:\u200D\uD83D\uDC66)?|\uDC67(?:\u200D\uD83D[\uDC66\uDC67])?))|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3]))|\uD83C(?:\uDFFB(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:[\uDC68\uDC69]|\uDC8B\u200D\uD83D[\uDC68\uDC69])\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83D\uDC69\uD83C[\uDFFC-\uDFFF])|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3]|\uDD1D\u200D\uD83D[\uDC68\uDC69]\uD83C[\uDFFC-\uDFFF]|\uDEEF\u200D\uD83D\uDC69\uD83C[\uDFFC-\uDFFF])))?|\uDFFC(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:[\uDC68\uDC69]|\uDC8B\u200D\uD83D[\uDC68\uDC69])\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83D\uDC69\uD83C[\uDFFB\uDFFD-\uDFFF])|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3]|\uDD1D\u200D\uD83D[\uDC68\uDC69]\uD83C[\uDFFB\uDFFD-\uDFFF]|\uDEEF\u200D\uD83D\uDC69\uD83C[\uDFFB\uDFFD-\uDFFF])))?|\uDFFD(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:[\uDC68\uDC69]|\uDC8B\u200D\uD83D[\uDC68\uDC69])\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83D\uDC69\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3]|\uDD1D\u200D\uD83D[\uDC68\uDC69]\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF]|\uDEEF\u200D\uD83D\uDC69\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])))?|\uDFFE(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:[\uDC68\uDC69]|\uDC8B\u200D\uD83D[\uDC68\uDC69])\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83D\uDC69\uD83C[\uDFFB-\uDFFD\uDFFF])|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3]|\uDD1D\u200D\uD83D[\uDC68\uDC69]\uD83C[\uDFFB-\uDFFD\uDFFF]|\uDEEF\u200D\uD83D\uDC69\uD83C[\uDFFB-\uDFFD\uDFFF])))?|\uDFFF(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:[\uDC68\uDC69]|\uDC8B\u200D\uD83D[\uDC68\uDC69])\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83D\uDC69\uD83C[\uDFFB-\uDFFE])|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3]|\uDD1D\u200D\uD83D[\uDC68\uDC69]\uD83C[\uDFFB-\uDFFE]|\uDEEF\u200D\uD83D\uDC69\uD83C[\uDFFB-\uDFFE])))?))?|\uDD75(?:\uD83C[\uDFFB-\uDFFF]|\uFE0F)?(?:\u200D[\u2640\u2642]\uFE0F?)?|\uDE2E(?:\u200D\uD83D\uDCA8)?|\uDE35(?:\u200D\uD83D\uDCAB)?|\uDE36(?:\u200D\uD83C\uDF2B\uFE0F?)?|\uDE42(?:\u200D[\u2194\u2195]\uFE0F?)?|\uDEB6(?:\uD83C[\uDFFB-\uDFFF])?(?:\u200D(?:[\u2640\u2642]\uFE0F?(?:\u200D\u27A1\uFE0F?)?|\u27A1\uFE0F?))?)|\uD83E(?:[\uDD0C\uDD0F\uDD18-\uDD1F\uDD30-\uDD34\uDD36\uDD77\uDDB5\uDDB6\uDDBB\uDDD2\uDDD3\uDDD5\uDEC3-\uDEC5\uDEF0\uDEF2-\uDEF8](?:\uD83C[\uDFFB-\uDFFF])?|[\uDD26\uDD35\uDD37-\uDD39\uDD3C-\uDD3E\uDDB8\uDDB9\uDDCD\uDDCF\uDDD4\uDDD6-\uDDDD](?:\uD83C[\uDFFB-\uDFFF])?(?:\u200D[\u2640\u2642]\uFE0F?)?|[\uDDDE\uDDDF](?:\u200D[\u2640\u2642]\uFE0F?)?|[\uDD0D\uDD0E\uDD10-\uDD17\uDD20-\uDD25\uDD27-\uDD2F\uDD3A\uDD3F-\uDD45\uDD47-\uDD76\uDD78-\uDDB4\uDDB7\uDDBA\uDDBC-\uDDCC\uDDD0\uDDE0-\uDDFF\uDE70-\uDE7C\uDE80-\uDE8A\uDE8E-\uDEC2\uDEC6\uDEC8\uDECD-\uDEDC\uDEDF-\uDEEA\uDEEF]|\uDDCE(?:\uD83C[\uDFFB-\uDFFF])?(?:\u200D(?:[\u2640\u2642]\uFE0F?(?:\u200D\u27A1\uFE0F?)?|\u27A1\uFE0F?))?|\uDDD1(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3\uDE70]|\uDD1D\u200D\uD83E\uDDD1|\uDDD1\u200D\uD83E\uDDD2(?:\u200D\uD83E\uDDD2)?|\uDDD2(?:\u200D\uD83E\uDDD2)?))|\uD83C(?:\uDFFB(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D(?:\uD83D\uDC8B\u200D)?\uD83E\uDDD1\uD83C[\uDFFC-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83E\uDDD1\uD83C[\uDFFC-\uDFFF])|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3\uDE70]|\uDD1D\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFF]|\uDEEF\u200D\uD83E\uDDD1\uD83C[\uDFFC-\uDFFF])))?|\uDFFC(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D(?:\uD83D\uDC8B\u200D)?\uD83E\uDDD1\uD83C[\uDFFB\uDFFD-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83E\uDDD1\uD83C[\uDFFB\uDFFD-\uDFFF])|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3\uDE70]|\uDD1D\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFF]|\uDEEF\u200D\uD83E\uDDD1\uD83C[\uDFFB\uDFFD-\uDFFF])))?|\uDFFD(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D(?:\uD83D\uDC8B\u200D)?\uD83E\uDDD1\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83E\uDDD1\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3\uDE70]|\uDD1D\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFF]|\uDEEF\u200D\uD83E\uDDD1\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])))?|\uDFFE(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D(?:\uD83D\uDC8B\u200D)?\uD83E\uDDD1\uD83C[\uDFFB-\uDFFD\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFD\uDFFF])|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3\uDE70]|\uDD1D\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFF]|\uDEEF\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFD\uDFFF])))?|\uDFFF(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D(?:\uD83D\uDC8B\u200D)?\uD83E\uDDD1\uD83C[\uDFFB-\uDFFE]|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFE])|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3\uDE70]|\uDD1D\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFF]|\uDEEF\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFE])))?))?|\uDEF1(?:\uD83C(?:\uDFFB(?:\u200D\uD83E\uDEF2\uD83C[\uDFFC-\uDFFF])?|\uDFFC(?:\u200D\uD83E\uDEF2\uD83C[\uDFFB\uDFFD-\uDFFF])?|\uDFFD(?:\u200D\uD83E\uDEF2\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])?|\uDFFE(?:\u200D\uD83E\uDEF2\uD83C[\uDFFB-\uDFFD\uDFFF])?|\uDFFF(?:\u200D\uD83E\uDEF2\uD83C[\uDFFB-\uDFFE])?))?)/g;
  };
  var fullwidthMinimalCodePoint = 12288;
  var fullwidthMaximumCodePoint = 65510;
  var fullwidthRanges = [12288, 12288, 65281, 65376, 65504, 65510];
  var wideMinimalCodePoint = 4352;
  var wideMaximumCodePoint = 262141;
  var wideRanges = [4352, 4447, 8986, 8987, 9001, 9002, 9193, 9196, 9200, 9200, 9203, 9203, 9725, 9726, 9748, 9749, 9776, 9783, 9800, 9811, 9855, 9855, 9866, 9871, 9875, 9875, 9889, 9889, 9898, 9899, 9917, 9918, 9924, 9925, 9934, 9934, 9940, 9940, 9962, 9962, 9970, 9971, 9973, 9973, 9978, 9978, 9981, 9981, 9989, 9989, 9994, 9995, 10024, 10024, 10060, 10060, 10062, 10062, 10067, 10069, 10071, 10071, 10133, 10135, 10160, 10160, 10175, 10175, 11035, 11036, 11088, 11088, 11093, 11093, 11904, 11929, 11931, 12019, 12032, 12245, 12272, 12287, 12289, 12350, 12353, 12438, 12441, 12543, 12549, 12591, 12593, 12686, 12688, 12773, 12783, 12830, 12832, 12871, 12880, 42124, 42128, 42182, 43360, 43388, 44032, 55203, 63744, 64255, 65040, 65049, 65072, 65106, 65108, 65126, 65128, 65131, 94176, 94180, 94192, 94198, 94208, 101589, 101631, 101662, 101760, 101874, 110576, 110579, 110581, 110587, 110589, 110590, 110592, 110882, 110898, 110898, 110928, 110930, 110933, 110933, 110948, 110951, 110960, 111355, 119552, 119638, 119648, 119670, 126980, 126980, 127183, 127183, 127374, 127374, 127377, 127386, 127488, 127490, 127504, 127547, 127552, 127560, 127568, 127569, 127584, 127589, 127744, 127776, 127789, 127797, 127799, 127868, 127870, 127891, 127904, 127946, 127951, 127955, 127968, 127984, 127988, 127988, 127992, 128062, 128064, 128064, 128066, 128252, 128255, 128317, 128331, 128334, 128336, 128359, 128378, 128378, 128405, 128406, 128420, 128420, 128507, 128591, 128640, 128709, 128716, 128716, 128720, 128722, 128725, 128728, 128732, 128735, 128747, 128748, 128756, 128764, 128992, 129003, 129008, 129008, 129292, 129338, 129340, 129349, 129351, 129535, 129648, 129660, 129664, 129674, 129678, 129734, 129736, 129736, 129741, 129756, 129759, 129770, 129775, 129784, 131072, 196605, 196608, 262141];
  var isInRange = (ranges, codePoint) => {
    let low = 0;
    let high = Math.floor(ranges.length / 2) - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const i2 = mid * 2;
      if (codePoint < ranges[i2]) {
        high = mid - 1;
      } else if (codePoint > ranges[i2 + 1]) {
        low = mid + 1;
      } else {
        return true;
      }
    }
    return false;
  };
  var commonCjkCodePoint = 19968;
  var [wideFastPathStart, wideFastPathEnd] = /* @__PURE__ */ findWideFastPathRange(wideRanges);
  function findWideFastPathRange(ranges) {
    let fastPathStart = ranges[0];
    let fastPathEnd = ranges[1];
    for (let index = 0; index < ranges.length; index += 2) {
      const start2 = ranges[index];
      const end = ranges[index + 1];
      if (commonCjkCodePoint >= start2 && commonCjkCodePoint <= end) {
        return [start2, end];
      }
      if (end - start2 > fastPathEnd - fastPathStart) {
        fastPathStart = start2;
        fastPathEnd = end;
      }
    }
    return [fastPathStart, fastPathEnd];
  }
  var isFullWidth = (codePoint) => {
    if (codePoint < fullwidthMinimalCodePoint || codePoint > fullwidthMaximumCodePoint) {
      return false;
    }
    return isInRange(fullwidthRanges, codePoint);
  };
  var isWide = (codePoint) => {
    if (codePoint >= wideFastPathStart && codePoint <= wideFastPathEnd) {
      return true;
    }
    if (codePoint < wideMinimalCodePoint || codePoint > wideMaximumCodePoint) {
      return false;
    }
    return isInRange(wideRanges, codePoint);
  };
  var narrowEmojiRegexp = /^(?:[\xA9\xAE\u203C\u2049\u2122\u2139\u2194-\u2199\u21A9\u21AA\u2328\u23CF\u23ED-\u23EF\u23F1\u23F2\u23F8-\u23FA\u24C2\u25AA\u25AB\u25B6\u25C0\u25FB\u25FC\u2600-\u2604\u260E\u2611\u2618\u2620\u2622\u2623\u2626\u262A\u262E\u262F\u2638-\u263A\u2640\u2642\u265F\u2660\u2663\u2665\u2666\u2668\u267B\u267E\u2692\u2694-\u2697\u2699\u269B\u269C\u26A0\u26A7\u26B0\u26B1\u26C8\u26CF\u26D1\u26D3\u26E9\u26F0\u26F1\u26F4\u26F7\u26F8\u2702\u2708\u2709\u270F\u2712\u2714\u2716\u271D\u2721\u2733\u2734\u2744\u2747\u2763\u2764\u27A1\u2934\u2935\u2B05-\u2B07]|\uD83C[\uDD70\uDD71\uDD7E\uDD7F\uDF21\uDF24-\uDF2C\uDF36\uDF7D\uDF96\uDF97\uDF99-\uDF9B\uDF9E\uDF9F\uDFCD\uDFCE\uDFD4-\uDFDF\uDFF3\uDFF5\uDFF7]|\uD83D[\uDC3F\uDC41\uDCFD\uDD49\uDD4A\uDD6F\uDD70\uDD73\uDD76-\uDD79\uDD87\uDD8A-\uDD8D\uDDA5\uDDA8\uDDB1\uDDB2\uDDBC\uDDC2-\uDDC4\uDDD1-\uDDD3\uDDDC-\uDDDE\uDDE1\uDDE3\uDDE8\uDDEF\uDDF3\uDDFA\uDECB\uDECD-\uDECF\uDEE0-\uDEE5\uDEE9\uDEF0\uDEF3])$/;
  var isNarrowEmojiCharacter = (character) => narrowEmojiRegexp.test(character);
  var notAsciiRegex = /[^\x20-\x7F]/;
  function getStringWidth(text) {
    if (!text) {
      return 0;
    }
    if (!notAsciiRegex.test(text)) {
      return text.length;
    }
    let width = 0;
    text = text.replace(emoji_regex_default(), (character) => {
      width += isNarrowEmojiCharacter(character) ? 1 : 2;
      return "";
    });
    for (const character of text) {
      const codePoint = character.codePointAt(0);
      if (codePoint <= 31 || codePoint >= 127 && codePoint <= 159) {
        continue;
      }
      if (codePoint >= 768 && codePoint <= 879) {
        continue;
      }
      if (codePoint >= 65024 && codePoint <= 65039) {
        continue;
      }
      width += isFullWidth(codePoint) || isWide(codePoint) ? 2 : 1;
    }
    return width;
  }
  var get_string_width_default = getStringWidth;
  var INDENT_COMMAND_TYPE_INDENT = 0;
  var INDENT_COMMAND_TYPE_DEDENT = 1;
  var INDENT_COMMAND_TYPE_WIDTH = 2;
  var INDENT_COMMAND_TYPE_STRING = 3;
  var INDENT_COMMAND_INDENT = { type: INDENT_COMMAND_TYPE_INDENT };
  var INDENT_COMMAND_DEDENT = { type: INDENT_COMMAND_TYPE_DEDENT };
  var ROOT_INDENT = {
    value: "",
    length: 0,
    queue: [],
    get root() {
      return ROOT_INDENT;
    }
  };
  function generateIndent(indent22, command, options) {
    const queue = command.type === INDENT_COMMAND_TYPE_DEDENT ? indent22.queue.slice(0, -1) : [...indent22.queue, command];
    let value = "";
    let length = 0;
    let lastTabs = 0;
    let lastSpaces = 0;
    for (const command2 of queue) {
      switch (command2.type) {
        case INDENT_COMMAND_TYPE_INDENT:
          flush();
          if (options.useTabs) {
            addTabs(1);
          } else {
            addSpaces(options.tabWidth);
          }
          break;
        case INDENT_COMMAND_TYPE_STRING: {
          const { string } = command2;
          flush();
          value += string;
          length += string.length;
          break;
        }
        case INDENT_COMMAND_TYPE_WIDTH: {
          const { width } = command2;
          lastTabs += 1;
          lastSpaces += width;
          break;
        }
        default:
          throw new Error(`Unexpected indent comment '${command2.type}'.`);
      }
    }
    flushSpaces();
    return { ...indent22, value, length, queue };
    function addTabs(count) {
      value += "	".repeat(count);
      length += options.tabWidth * count;
    }
    function addSpaces(count) {
      value += " ".repeat(count);
      length += count;
    }
    function flush() {
      if (options.useTabs) {
        flushTabs();
      } else {
        flushSpaces();
      }
    }
    function flushTabs() {
      if (lastTabs > 0) {
        addTabs(lastTabs);
      }
      resetLast();
    }
    function flushSpaces() {
      if (lastSpaces > 0) {
        addSpaces(lastSpaces);
      }
      resetLast();
    }
    function resetLast() {
      lastTabs = 0;
      lastSpaces = 0;
    }
  }
  function makeAlign(indent22, indentOptions, options) {
    if (!indentOptions) {
      return indent22;
    }
    if (indentOptions.type === "root") {
      return { ...indent22, root: indent22 };
    }
    if (indentOptions === Number.NEGATIVE_INFINITY) {
      return indent22.root;
    }
    let command;
    if (typeof indentOptions === "number") {
      if (indentOptions < 0) {
        command = INDENT_COMMAND_DEDENT;
      } else {
        command = { type: INDENT_COMMAND_TYPE_WIDTH, width: indentOptions };
      }
    } else {
      command = { type: INDENT_COMMAND_TYPE_STRING, string: indentOptions };
    }
    return generateIndent(indent22, command, options);
  }
  function makeIndent(indent22, options) {
    return generateIndent(indent22, INDENT_COMMAND_INDENT, options);
  }
  function getTrailingIndentionLength(text) {
    let length = 0;
    for (let index = text.length - 1; index >= 0; index--) {
      const character = text[index];
      if (character === " " || character === "	") {
        length++;
      } else {
        break;
      }
    }
    return length;
  }
  function trimIndentation(text) {
    const length = getTrailingIndentionLength(text);
    const trimmed = length === 0 ? text : text.slice(0, text.length - length);
    return { text: trimmed, count: length };
  }
  var printResult = class {
    /** @type {string[]} */
    #settledTexts = [];
    #unsettledText = "";
    #settledTextLength = 0;
    /** @type {number[]} */
    #settledPositions = [];
    /** @type {number[]} */
    #unsettledPositions = [];
    #settle() {
      const text = this.#unsettledText;
      if (text !== "") {
        this.#settledTexts.push(text);
        this.#settledTextLength += text.length;
        this.#unsettledText = "";
      }
      for (const position of this.#unsettledPositions) {
        this.#settledPositions.push(Math.min(position, this.#settledTextLength));
      }
      this.#unsettledPositions.length = 0;
    }
    markPosition() {
      if (this.#settledPositions.length + this.#unsettledPositions.length >= 2) {
        throw new Error("There are too many 'cursor' in doc.");
      }
      this.#unsettledPositions.push(
        this.#settledTextLength + this.#unsettledText.length
      );
    }
    /**
    @param {string} text
    */
    write(text) {
      this.#unsettledText += text;
    }
    trim() {
      const { text: trimmed, count } = trimIndentation(this.#unsettledText);
      this.#unsettledText = trimmed;
      this.#settle();
      return count;
    }
    finish() {
      this.#settle();
      return {
        text: this.#settledTexts.join(""),
        positions: this.#settledPositions
      };
    }
  };
  var print_result_default = printResult;
  var MODE_BREAK = /* @__PURE__ */ Symbol("MODE_BREAK");
  var MODE_FLAT = /* @__PURE__ */ Symbol("MODE_FLAT");
  var DOC_FILL_PRINTED_LENGTH = /* @__PURE__ */ Symbol("DOC_FILL_PRINTED_LENGTH");
  function fits(next, restCommands, remainingWidth, hasLineSuffix, groupModeMap, mustBeFlat) {
    if (remainingWidth === Number.POSITIVE_INFINITY) {
      return true;
    }
    let restCommandsIndex = restCommands.length;
    let hasPendingSpace = false;
    const commands = [next];
    let output = "";
    while (remainingWidth >= 0) {
      if (commands.length === 0) {
        if (restCommandsIndex === 0) {
          return true;
        }
        commands.push(restCommands[--restCommandsIndex]);
        continue;
      }
      const {
        mode,
        doc
      } = commands.pop();
      const docType = get_doc_type_default(doc);
      switch (docType) {
        case DOC_TYPE_STRING:
          if (doc) {
            if (hasPendingSpace) {
              output += " ";
              remainingWidth -= 1;
              hasPendingSpace = false;
            }
            output += doc;
            remainingWidth -= get_string_width_default(doc);
          }
          break;
        case DOC_TYPE_ARRAY:
        case DOC_TYPE_FILL: {
          const parts2 = docType === DOC_TYPE_ARRAY ? doc : doc.parts;
          const end = doc[DOC_FILL_PRINTED_LENGTH] ?? 0;
          for (let index = parts2.length - 1; index >= end; index--) {
            commands.push({
              mode,
              doc: parts2[index]
            });
          }
          break;
        }
        case DOC_TYPE_INDENT:
        case DOC_TYPE_ALIGN:
        case DOC_TYPE_INDENT_IF_BREAK:
        case DOC_TYPE_LABEL:
          commands.push({
            mode,
            doc: doc.contents
          });
          break;
        case DOC_TYPE_TRIM: {
          const {
            text,
            count
          } = trimIndentation(output);
          output = text;
          remainingWidth += count;
          break;
        }
        case DOC_TYPE_GROUP: {
          if (mustBeFlat && doc.break) {
            return false;
          }
          const groupMode = doc.break ? MODE_BREAK : mode;
          const contents = doc.expandedStates && groupMode === MODE_BREAK ? method_at_default(
            /* OPTIONAL_OBJECT: false */
            0,
            doc.expandedStates,
            -1
          ) : doc.contents;
          commands.push({
            mode: groupMode,
            doc: contents
          });
          break;
        }
        case DOC_TYPE_IF_BREAK: {
          const groupMode = doc.groupId ? groupModeMap[doc.groupId] || MODE_FLAT : mode;
          const contents = groupMode === MODE_BREAK ? doc.breakContents : doc.flatContents;
          if (contents) {
            commands.push({
              mode,
              doc: contents
            });
          }
          break;
        }
        case DOC_TYPE_LINE:
          if (mode === MODE_BREAK || doc.hard) {
            return true;
          }
          if (!doc.soft) {
            hasPendingSpace = true;
          }
          break;
        case DOC_TYPE_LINE_SUFFIX:
          hasLineSuffix = true;
          break;
        case DOC_TYPE_LINE_SUFFIX_BOUNDARY:
          if (hasLineSuffix) {
            return false;
          }
          break;
      }
    }
    return false;
  }
  function printDocToString(doc, options) {
    const groupModeMap = /* @__PURE__ */ Object.create(null);
    const width = options.printWidth;
    const newLine = convertEndOfLineOptionToCharacter(options.endOfLine);
    let position = 0;
    const commands = [{
      indent: ROOT_INDENT,
      mode: MODE_BREAK,
      doc
    }];
    let shouldRemeasure = false;
    const lineSuffix22 = [];
    const result = new print_result_default();
    propagateBreaks(doc);
    while (commands.length > 0) {
      const {
        indent: indent22,
        mode,
        doc: doc2
      } = commands.pop();
      switch (get_doc_type_default(doc2)) {
        case DOC_TYPE_STRING: {
          const formatted2 = newLine !== "\n" ? method_replace_all_default(
            /* OPTIONAL_OBJECT: false */
            0,
            doc2,
            "\n",
            newLine
          ) : doc2;
          if (formatted2) {
            result.write(formatted2);
            if (commands.length > 0) {
              position += get_string_width_default(formatted2);
            }
          }
          break;
        }
        case DOC_TYPE_ARRAY:
          for (let index = doc2.length - 1; index >= 0; index--) {
            commands.push({
              indent: indent22,
              mode,
              doc: doc2[index]
            });
          }
          break;
        case DOC_TYPE_CURSOR:
          result.markPosition();
          break;
        case DOC_TYPE_INDENT:
          commands.push({
            indent: makeIndent(indent22, options),
            mode,
            doc: doc2.contents
          });
          break;
        case DOC_TYPE_ALIGN:
          commands.push({
            indent: makeAlign(indent22, doc2.n, options),
            mode,
            doc: doc2.contents
          });
          break;
        case DOC_TYPE_TRIM:
          position -= result.trim();
          break;
        case DOC_TYPE_GROUP: {
          const command = (function printGroup() {
            if (mode === MODE_FLAT && !shouldRemeasure) {
              return {
                indent: indent22,
                mode: doc2.break ? MODE_BREAK : MODE_FLAT,
                doc: doc2.contents
              };
            }
            shouldRemeasure = false;
            const remainingWidth = width - position;
            const hasLineSuffix = lineSuffix22.length > 0;
            const flatCommand = {
              indent: indent22,
              mode: MODE_FLAT,
              doc: doc2.contents
            };
            if (!doc2.break && fits(flatCommand, commands, remainingWidth, hasLineSuffix, groupModeMap)) {
              return flatCommand;
            }
            if (!doc2.expandedStates) {
              return {
                indent: indent22,
                mode: MODE_BREAK,
                doc: doc2.contents
              };
            }
            if (!doc2.break) {
              for (let index = 1; index < doc2.expandedStates.length - 1; index++) {
                const flatCommand2 = {
                  indent: indent22,
                  mode: MODE_FLAT,
                  doc: doc2.expandedStates[index]
                };
                if (fits(flatCommand2, commands, remainingWidth, hasLineSuffix, groupModeMap)) {
                  return flatCommand2;
                }
              }
            }
            return {
              indent: indent22,
              mode: MODE_BREAK,
              doc: method_at_default(
                /* OPTIONAL_OBJECT: false */
                0,
                doc2.expandedStates,
                -1
              )
            };
          })();
          commands.push(command);
          if (doc2.id) {
            groupModeMap[doc2.id] = command.mode;
          }
          break;
        }
        // Fills each line with as much code as possible before moving to a new
        // line with the same indentation.
        //
        // Expects doc.parts to be an array of alternating content and
        // whitespace. The whitespace contains the linebreaks.
        //
        // For example:
        //   ["I", line, "love", line, "monkeys"]
        // or
        //   [{ type: group, ... }, softline, { type: group, ... }]
        //
        // It uses this parts structure to handle three main layout cases:
        // * The first two content items fit on the same line without
        //   breaking
        //   -> output the first content item and the whitespace "flat".
        // * Only the first content item fits on the line without breaking
        //   -> output the first content item "flat" and the whitespace with
        //   "break".
        // * Neither content item fits on the line without breaking
        //   -> output the first content item and the whitespace with "break".
        case DOC_TYPE_FILL: {
          const remainingWidth = width - position;
          const offset = doc2[DOC_FILL_PRINTED_LENGTH] ?? 0;
          const {
            parts: parts2
          } = doc2;
          const length = parts2.length - offset;
          if (length === 0) {
            break;
          }
          const content = parts2[offset + 0];
          const whitespace = parts2[offset + 1];
          const contentFlatCommand = {
            indent: indent22,
            mode: MODE_FLAT,
            doc: content
          };
          const contentBreakCommand = {
            indent: indent22,
            mode: MODE_BREAK,
            doc: content
          };
          const contentFits = fits(contentFlatCommand, [], remainingWidth, lineSuffix22.length > 0, groupModeMap, true);
          if (length === 1) {
            if (contentFits) {
              commands.push(contentFlatCommand);
            } else {
              commands.push(contentBreakCommand);
            }
            break;
          }
          const whitespaceFlatCommand = {
            indent: indent22,
            mode: MODE_FLAT,
            doc: whitespace
          };
          const whitespaceBreakCommand = {
            indent: indent22,
            mode: MODE_BREAK,
            doc: whitespace
          };
          if (length === 2) {
            if (contentFits) {
              commands.push(whitespaceFlatCommand, contentFlatCommand);
            } else {
              commands.push(whitespaceBreakCommand, contentBreakCommand);
            }
            break;
          }
          const secondContent = parts2[offset + 2];
          const remainingCommand = {
            indent: indent22,
            mode,
            doc: {
              ...doc2,
              [DOC_FILL_PRINTED_LENGTH]: offset + 2
            }
          };
          const firstAndSecondContentFlatCommand = {
            indent: indent22,
            mode: MODE_FLAT,
            doc: [content, whitespace, secondContent]
          };
          const firstAndSecondContentFits = fits(firstAndSecondContentFlatCommand, [], remainingWidth, lineSuffix22.length > 0, groupModeMap, true);
          commands.push(remainingCommand);
          if (firstAndSecondContentFits) {
            commands.push(whitespaceFlatCommand, contentFlatCommand);
          } else if (contentFits) {
            commands.push(whitespaceBreakCommand, contentFlatCommand);
          } else {
            commands.push(whitespaceBreakCommand, contentBreakCommand);
          }
          break;
        }
        case DOC_TYPE_IF_BREAK:
        case DOC_TYPE_INDENT_IF_BREAK: {
          const groupMode = doc2.groupId ? groupModeMap[doc2.groupId] : mode;
          if (groupMode === MODE_BREAK) {
            const breakContents = doc2.type === DOC_TYPE_IF_BREAK ? doc2.breakContents : doc2.negate ? doc2.contents : indent(doc2.contents);
            if (breakContents) {
              commands.push({
                indent: indent22,
                mode,
                doc: breakContents
              });
            }
          }
          if (groupMode === MODE_FLAT) {
            const flatContents = doc2.type === DOC_TYPE_IF_BREAK ? doc2.flatContents : doc2.negate ? indent(doc2.contents) : doc2.contents;
            if (flatContents) {
              commands.push({
                indent: indent22,
                mode,
                doc: flatContents
              });
            }
          }
          break;
        }
        case DOC_TYPE_LINE_SUFFIX:
          lineSuffix22.push({
            indent: indent22,
            mode,
            doc: doc2.contents
          });
          break;
        case DOC_TYPE_LINE_SUFFIX_BOUNDARY:
          if (lineSuffix22.length > 0) {
            commands.push({
              indent: indent22,
              mode,
              doc: hardlineWithoutBreakParent
            });
          }
          break;
        case DOC_TYPE_LINE:
          switch (mode) {
            case MODE_FLAT:
              if (!doc2.hard) {
                if (!doc2.soft) {
                  result.write(" ");
                  position += 1;
                }
                break;
              }
              shouldRemeasure = true;
            // fallthrough
            case MODE_BREAK:
              if (lineSuffix22.length > 0) {
                commands.push({
                  indent: indent22,
                  mode,
                  doc: doc2
                }, ...lineSuffix22.reverse());
                lineSuffix22.length = 0;
                break;
              }
              if (doc2.literal) {
                result.write(newLine);
                position = 0;
                if (indent22.root) {
                  if (indent22.root.value) {
                    result.write(indent22.root.value);
                  }
                  position = indent22.root.length;
                }
              } else {
                result.trim();
                result.write(newLine + indent22.value);
                position = indent22.length;
              }
              break;
          }
          break;
        case DOC_TYPE_LABEL:
          commands.push({
            indent: indent22,
            mode,
            doc: doc2.contents
          });
          break;
        case DOC_TYPE_BREAK_PARENT:
          break;
        default:
          throw new invalid_doc_error_default(doc2);
      }
      if (commands.length === 0 && lineSuffix22.length > 0) {
        commands.push(...lineSuffix22.reverse());
        lineSuffix22.length = 0;
      }
    }
    const {
      text: formatted,
      positions: cursorPositions
    } = result.finish();
    if (cursorPositions.length !== 2) {
      return {
        formatted
      };
    }
    const [cursorNodeStart, cursorNodeEnd] = cursorPositions;
    return {
      formatted,
      cursorNodeStart,
      cursorNodeText: formatted.slice(cursorNodeStart, cursorNodeEnd)
    };
  }
  var builders = {
    join,
    line,
    softline,
    hardline,
    literalline,
    group,
    conditionalGroup,
    fill,
    lineSuffix,
    lineSuffixBoundary,
    cursor,
    breakParent,
    ifBreak,
    trim,
    indent,
    indentIfBreak,
    align,
    addAlignmentToDoc,
    markAsRoot,
    dedentToRoot,
    dedent,
    hardlineWithoutBreakParent,
    literallineWithoutBreakParent,
    label,
    // TODO: Remove this in v4
    concat: (parts2) => parts2
  };
  var printer = { printDocToString };
  var utils = {
    willBreak,
    traverseDoc: traverse_doc_default,
    findInDoc,
    mapDoc,
    removeLines,
    stripTrailingHardline,
    replaceEndOfLine,
    canBreak
  };

  // node_modules/prettier-plugin-java/dist/index.mjs
  var import_meta2 = { url: document.currentScript?.src || location.href };
  var options_default = {
    arrowParens: {
      type: "choice",
      category: "Java",
      default: "always",
      choices: [{
        value: "always",
        description: ""
      }, {
        value: "avoid",
        description: ""
      }],
      description: "Include parentheses around a sole arrow function parameter."
    },
    trailingComma: {
      type: "choice",
      category: "Java",
      default: "all",
      choices: [
        {
          value: "all",
          description: ""
        },
        {
          value: "es5",
          description: ""
        },
        {
          value: "none",
          description: ""
        }
      ],
      description: "Print trailing commas wherever possible when multi-line."
    },
    experimentalOperatorPosition: {
      type: "choice",
      category: "Java",
      default: "end",
      choices: [{
        value: "start",
        description: ""
      }, {
        value: "end",
        description: ""
      }],
      description: "Where to print operators when binary expressions wrap lines."
    }
  };
  var multiFieldsByType = {
    array_creation_expression: { dimensions: true },
    cast_expression: { type: true },
    constant_declaration: { declarator: true },
    exports_module_directive: { modules: true },
    field_declaration: { declarator: true },
    for_statement: {
      init: true,
      update: true
    },
    local_variable_declaration: { declarator: true },
    opens_module_directive: { modules: true },
    provides_module_directive: { provider: true },
    requires_module_directive: { modifiers: true },
    spread_parameter: { annotations: true }
  };
  var { group: group$7, hardline: hardline$6, ifBreak: ifBreak$2, indent: indent$7, indentIfBreak: indentIfBreak$2, join: join$7, line: line$7, lineSuffixBoundary: lineSuffixBoundary$1, softline: softline$4 } = builders;
  var { mapDoc: mapDoc2 } = utils;
  function hasType(path, type) {
    return path.node.type === type;
  }
  function hasChild(path, fieldName) {
    return path.node[fieldName] != null;
  }
  function definedKeys(obj, options) {
    return (options ?? Object.keys(obj)).filter((key) => obj[key] !== void 0);
  }
  function printModifiers(path, print, annotationMode) {
    const modifiersIndex = path.node.namedChildren.findIndex(({ type }) => type === "modifiers");
    if (modifiersIndex === -1) return [];
    const separator = annotationMode === "avoidBreak" ? line$7 : annotationMode === "noBreak" || path.node.namedChildren[modifiersIndex].children.some(({ type }) => type !== "annotation" && type !== "marker_annotation") ? " " : hardline$6;
    return [path.call((modifiers) => print(modifiers, { annotationMode }), "namedChildren", modifiersIndex), separator];
  }
  function printValue(path) {
    return path.node.value;
  }
  function lineStartWithComments(node) {
    return node.comments?.length ? Math.min(node.start.row, node.comments[0].start.row) : node.start.row;
  }
  function lineEndWithComments(node) {
    return node.comments?.length ? Math.max(node.end.row, node.comments.at(-1).end.row) : node.end.row;
  }
  function printDanglingComments(path, danglingCommentsPrintOptions = {}) {
    const { indent: shouldIndent = false } = danglingCommentsPrintOptions;
    const danglingComments = new Set(path.node.comments?.filter((comment) => !(comment.leading || comment.trailing)));
    if (danglingComments.size === 0) return "";
    const doc = join$7(hardline$6, path.map(({ node: comment }) => danglingComments.has(comment) ? printComment(comment) : "", "comments").filter(Boolean));
    return shouldIndent ? indent$7([hardline$6, doc]) : doc;
  }
  function printComment(comment) {
    comment.printed = true;
    const lines = comment.value.split("\n").map((line3) => line3.trim());
    return lines.length > 1 && lines[0].startsWith("/*") && lines.slice(1).every((line3) => line3.startsWith("*")) && lines.at(-1).endsWith("*/") ? join$7(hardline$6, lines.map((line3, index) => index === 0 ? line3 : ` ${line3}`)) : comment.value;
  }
  function hasLeadingComments(node) {
    return node.comments?.some(({ leading }) => leading) ?? false;
  }
  function indentInParentheses(contents) {
    return contents && !Array.isArray(contents) || contents.length ? [
      "(",
      indent$7([softline$4, contents]),
      softline$4,
      ")"
    ] : "()";
  }
  function printArrayInitializer(path, print, options) {
    if (!path.node.namedChildren.length) {
      const danglingComments = printDanglingComments(path, { indent: true });
      return danglingComments ? [
        "{",
        danglingComments,
        hardline$6,
        "}"
      ] : "{}";
    }
    const list = join$7([",", line$7], path.map(print, "namedChildren"));
    if (list.length && options.trailingComma !== "none") list.push(ifBreak$2(","));
    return group$7([
      "{",
      indent$7([line$7, ...list]),
      line$7,
      "}"
    ]);
  }
  function printBlock(path, contents) {
    if (contents.length) return group$7([
      "{",
      indent$7([hardline$6, ...join$7(hardline$6, contents)]),
      hardline$6,
      "}"
    ]);
    const danglingComments = printDanglingComments(path, { indent: true });
    if (danglingComments) return [
      "{",
      danglingComments,
      hardline$6,
      "}"
    ];
    const parent = path.parent;
    const grandparent = path.grandparent;
    return parent?.type === "catch_clause" && (grandparent?.type === "try_statement" || grandparent?.type === "try_with_resources_statement") && grandparent.namedChildren.filter(({ type }) => type === "catch_clause").length === 1 && !grandparent.namedChildren.some(({ type }) => type === "finally_clause") || parent && [
      "for_statement",
      "do_statement",
      "enhanced_for_statement",
      "while_statement"
    ].includes(parent.type) || [
      "annotation_type_body",
      "class_body",
      "constructor_body",
      "enum_body",
      "interface_body",
      "module_body",
      "record_pattern_body"
    ].includes(path.node.type) || parent && [
      "block",
      "lambda_expression",
      "method_declaration",
      "static_initializer",
      "synchronized_statement"
    ].includes(parent.type) ? "{}" : [
      "{",
      hardline$6,
      "}"
    ];
  }
  function printBlockStatements(path, print) {
    const parts2 = [];
    path.each((child) => {
      const { node, previous } = child;
      if (node.type === "switch_label") return;
      const blankLine = parts2.length && previous && lineStartWithComments(node) > lineEndWithComments(previous) + 1;
      const declaration = print(child);
      parts2.push(blankLine ? [hardline$6, declaration] : declaration);
    }, "namedChildren");
    return parts2;
  }
  function printBodyDeclarations(path, print, padFirst = false) {
    const isInterfaceBody = path.node.type === "interface_body";
    const isFormalParameters = path.node.type === "formal_parameters";
    const separator = isFormalParameters ? softline$4 : hardline$6;
    let previousRequiresPadding = padFirst;
    return path.map((child) => {
      const { node, previous } = child;
      const modifiers = node.namedChildren.find(({ type }) => type === "modifiers")?.children ?? [];
      const firstAnnotationIndex = modifiers.findIndex(({ type }) => type === "annotation" || type === "marker_annotation");
      const lastNonAnnotationIndex = modifiers.findLastIndex(({ type }) => type !== "annotation" && type !== "marker_annotation");
      const currentRequiresPadding = firstAnnotationIndex !== -1 && (!isFormalParameters && lastNonAnnotationIndex === -1 || firstAnnotationIndex < lastNonAnnotationIndex) || !isFormalParameters && node.type !== "constant_declaration" && node.type !== "enum_constant" && node.type !== "field_declaration" && !(isInterfaceBody && node.type === "method_declaration" && !node.bodyNode);
      const blankLine = previousRequiresPadding || previous && (currentRequiresPadding || lineStartWithComments(node) > lineEndWithComments(previous) + 1);
      previousRequiresPadding = currentRequiresPadding;
      const declaration = print(child);
      return blankLine ? [separator, declaration] : declaration;
    }, "namedChildren");
  }
  function printTypeParameters(path, print) {
    const parameters = path.node.namedChildren;
    if (parameters.length === 0 || parameters.length === 1 && isSimpleType(parameters[0]) && !parameters.some(({ comments }) => comments?.length && comments.some(({ type }) => type === "line_comment"))) return [
      "<",
      join$7(", ", path.map(print, "namedChildren")),
      ">"
    ];
    const parts2 = [
      "<",
      indent$7([softline$4, join$7([",", line$7], path.map(print, "namedChildren"))]),
      softline$4,
      ">"
    ];
    return path.node.type === "type_arguments" ? group$7(parts2) : parts2;
  }
  function printVariableDeclaration(path, print) {
    const declaration = printModifiers(path, print);
    declaration.push(path.call(print, "typeNode"), " ");
    const declarators = path.map(print, "declaratorNodes");
    if (declarators.length > 1 && path.node.declaratorNodes.some(({ valueNode }) => valueNode)) declaration.push(group$7(indent$7(join$7([",", line$7], declarators)), { shouldBreak: path.parent?.type !== "for_statement" }));
    else declaration.push(join$7(", ", declarators));
    declaration.push(";");
    return declaration;
  }
  function printAssignment(leftDoc, operator, rightDoc, rightNode) {
    if (!rightDoc || !rightNode) return leftDoc;
    if (rightNode.type === "binary_expression" || rightNode.type === "instanceof_expression" || rightNode.type === "ternary_expression" && (rightNode.conditionNode.type === "binary_expression" || rightNode.conditionNode.type === "instanceof_expression") || hasLeadingComments(rightNode)) return group$7([
      leftDoc,
      operator,
      group$7(indent$7([line$7, rightDoc]))
    ]);
    const groupId = /* @__PURE__ */ Symbol("assignment");
    return group$7([
      leftDoc,
      operator,
      group$7(indent$7(line$7), { id: groupId }),
      lineSuffixBoundary$1,
      indentIfBreak$2(rightDoc, { groupId })
    ]);
  }
  function printTextBlock(path, contents) {
    const parts2 = [
      '"""',
      hardline$6,
      contents,
      '"""'
    ];
    const parentType = path.parent?.type;
    const grandparentType = path.grandparent?.type;
    return parentType === "assignment_expression" || parentType === "variable_declarator" || path.node.fieldName === "object" && (grandparentType === "assignment_expression" || grandparentType === "variable_declarator") ? indent$7(parts2) : parts2;
  }
  function embedTextBlock(path) {
    if (path.node.namedChildren.some(({ type }) => type === "string_interpolation") || path.node.children[0].value === '"') return null;
    const language = findEmbeddedLanguage(path);
    if (!language) return null;
    const text = unescapeTextBlockContents(textBlockContents(path.node));
    return async (textToDoc) => {
      return printTextBlock(path, [escapeDocForTextBlock(await textToDoc(text, { parser: language })), hardline$6]);
    };
  }
  function textBlockContents(node) {
    const lines = node.value.split("\n").slice(1);
    const baseIndent = findBaseIndent(lines);
    return lines.map((line3) => line3.slice(baseIndent)).join("\n").slice(0, -3);
  }
  var PRECEDENCE = new Map([
    ["||"],
    ["&&"],
    ["|"],
    ["^"],
    ["&"],
    ["==", "!="],
    [
      "<",
      ">",
      "<=",
      ">=",
      "instanceof"
    ],
    [
      "<<",
      ">>",
      ">>>"
    ],
    ["+", "-"],
    [
      "*",
      "/",
      "%"
    ]
  ].flatMap((operators, index) => operators.map((operator) => [operator, index])));
  function getPrecedence(operator) {
    return PRECEDENCE.get(operator) ?? -1;
  }
  var equalityOperators = /* @__PURE__ */ new Set(["==", "!="]);
  var multiplicativeOperators = /* @__PURE__ */ new Set([
    "*",
    "/",
    "%"
  ]);
  var bitshiftOperators = /* @__PURE__ */ new Set([
    ">>",
    ">>>",
    "<<"
  ]);
  function isBitwiseOperator(operator) {
    return bitshiftOperators.has(operator) || operator === "|" || operator === "^" || operator === "&";
  }
  function shouldFlatten(parentOp, nodeOp) {
    if (getPrecedence(nodeOp) !== getPrecedence(parentOp)) return false;
    if (equalityOperators.has(parentOp) && equalityOperators.has(nodeOp)) return false;
    if (nodeOp === "%" && multiplicativeOperators.has(parentOp) || parentOp === "%" && multiplicativeOperators.has(nodeOp)) return false;
    if (nodeOp !== parentOp && multiplicativeOperators.has(nodeOp) && multiplicativeOperators.has(parentOp)) return false;
    if (bitshiftOperators.has(parentOp) && bitshiftOperators.has(nodeOp)) return false;
    return true;
  }
  function createTypeCheckFunction(typesArray) {
    const types = new Set(typesArray);
    return (node) => node != null && types.has(node.type);
  }
  var isMember = createTypeCheckFunction([
    "array_access",
    "field_access",
    "method_invocation"
  ]);
  function needsParentheses(path) {
    if (path.isRoot) return false;
    const { node, parent } = path;
    const parentCheckResult = parentNeedsParentheses(path);
    if (typeof parentCheckResult === "boolean") return parentCheckResult;
    switch (node.type) {
      case "switch_expression":
        return isMember(parent) || parent?.type === "explicit_constructor_invocation" || parent?.type === "method_reference" || parent?.type === "object_creation_expression";
      case "update_expression":
        if (parent?.type === "unary_expression") return node.children[0].type.startsWith(parent.operatorNode.type);
      case "unary_expression":
        switch (parent?.type) {
          case "unary_expression":
            return node.type === "unary_expression" && node.operatorNode.type === parent.operatorNode.type && (node.operatorNode.type === "+" || node.operatorNode.type === "-");
          case "instanceof_expression":
            return parent.leftNode === node && node.type === "unary_expression";
          default:
            return false;
        }
      case "binary_expression":
      case "instanceof_expression":
        if (parent?.type === "update_expression") return true;
      case "cast_expression":
        switch (parent?.type) {
          case "cast_expression":
            return node.type !== "cast_expression";
          case "method_reference":
          case "object_creation_expression":
          case "update_expression":
            return true;
          case "unary_expression":
            if (!node.comments) return true;
            break;
          case "explicit_constructor_invocation":
          case "field_access":
          case "method_invocation":
            return parent.objectNode === node;
          case "array_access":
            return parent.arrayNode === node;
          case "binary_expression":
          case "instanceof_expression": {
            if (node.type === "cast_expression") return false;
            if (parent.type === "binary_expression" && isLogicalOperator(parent.operatorNode) && node.type === "binary_expression" && isLogicalOperator(node.operatorNode)) return parent.operatorNode.type !== node.operatorNode.type;
            const operator = node.type === "instanceof_expression" ? "instanceof" : node.operatorNode.type;
            const precedence = getPrecedence(operator);
            const parentOperator = parent.type === "instanceof_expression" ? "instanceof" : parent.operatorNode.type;
            const parentPrecedence = getPrecedence(parentOperator);
            if (parentPrecedence > precedence) return true;
            if (parent.rightNode === node && parentPrecedence === precedence) return true;
            if (parentPrecedence === precedence && !shouldFlatten(parentOperator, operator)) return true;
            if (parentPrecedence < precedence && operator === "%" && (parentOperator === "+" || parentOperator === "-")) return true;
            if (isBitwiseOperator(parentOperator)) return true;
            return false;
          }
          default:
            return false;
        }
        break;
      case "assignment_expression":
        if (parent?.type === "for_statement" && (parent.initNodes.includes(node) || parent.updateNodes.includes(node))) return false;
        if (parent?.type === "expression_statement" && parent.namedChildren[0] === node) return false;
        if (parent?.type === "assignment_expression" || parent?.type === "lambda_expression" && parent.bodyNode === node) return false;
        return true;
      case "ternary_expression":
        switch (parent?.type) {
          case "unary_expression":
          case "binary_expression":
          case "cast_expression":
          case "method_reference":
          case "object_creation_expression":
            return true;
          case "ternary_expression":
            return parent.conditionNode === node;
          case "explicit_constructor_invocation":
          case "field_access":
          case "method_invocation":
            return parent.objectNode === node;
          case "array_access":
            return parent.arrayNode === node;
          default:
            return false;
        }
    }
    return false;
  }
  function returnArgumentHasLeadingComment(node) {
    return node.comments?.some((comment) => comment.leading && (comment.type === "line_comment" || comment.start < comment.end));
  }
  var isReturnOrThrowStatement = createTypeCheckFunction(["return_statement", "throw_statement"]);
  function parentNeedsParentheses(path) {
    const { parent } = path;
    switch (parent?.type) {
      case "return_statement":
      case "throw_statement":
        if (willReturnOrThrowStatementBreak(path)) return false;
        break;
    }
  }
  function willReturnOrThrowStatementBreak(path) {
    const { parent } = path;
    if (!isReturnOrThrowStatement(parent)) return false;
    const { node } = path;
    if (node.type === "assignment_expression" && returnArgumentHasLeadingComment(node)) return true;
    return false;
  }
  var isLogicalOperator = createTypeCheckFunction(["||", "&&"]);
  function isSimpleType(node) {
    const { type, children, namedChildren } = node;
    const lastNamedChild = namedChildren.at(-1);
    return [
      "boolean_type",
      "floating_point_type",
      "integral_type",
      "type_identifier",
      "void_type"
    ].includes(type) || type === "annotated_type" && lastNamedChild && isSimpleType(lastNamedChild) || type === "array_type" && isSimpleType(node.elementNode) || type === "scoped_type_identifier" && lastNamedChild && isSimpleType(namedChildren[0]) && isSimpleType(lastNamedChild) || type === "type_parameter" && (lastNamedChild?.type !== "type_bound" || lastNamedChild.namedChildren.length === 1) || type === "wildcard" && (children.at(-1).type === "?" || isSimpleType(namedChildren.at(-1)));
  }
  function findBaseIndent(lines) {
    return Math.min(...lines.map((line3) => line3.search(/\S/)).filter((indent3) => indent3 >= 0));
  }
  function findEmbeddedLanguage(path) {
    return path.ancestors.find(({ type, comments }) => type === "block" || comments?.some(({ leading }) => leading))?.comments?.filter(({ leading }) => leading).map(({ value }) => value.match(/^(?:\/\/|\/\*)\s*language\s*=\s*(\S+)/)?.[1]).findLast((language) => language)?.toLowerCase();
  }
  function escapeDocForTextBlock(doc) {
    return mapDoc2(doc, (currentDoc) => typeof currentDoc === "string" ? currentDoc.replace(/\\|"""/g, (match) => match === "\\" ? "\\\\" : '""\\"') : currentDoc);
  }
  function unescapeTextBlockContents(text) {
    return text.replace(/\\(?:([stnr"'\\])|\n|\r\n?)/g, (_, escaped) => {
      switch (escaped) {
        case "s":
          return " ";
        case "t":
          return "	";
        case "n":
          return "\n";
        case "r":
          return "\r";
        default:
          return escaped ?? "";
      }
    });
  }
  var arrays_default = { array_initializer: printArrayInitializer };
  var { group: group$6, hardline: hardline$5, ifBreak: ifBreak$1, indent: indent$6, indentIfBreak: indentIfBreak$1, join: join$6, line: line$6, softline: softline$3 } = builders;
  var blocks_and_statements_default = {
    block(path, print) {
      return printBlock(path, printBlockStatements(path, print));
    },
    local_variable_declaration: printVariableDeclaration,
    labeled_statement(path, print) {
      return join$6(": ", path.map(print, "namedChildren"));
    },
    expression_statement(path, print) {
      const parentType = path.parent?.type;
      const expressionType = path.node.namedChildren[0].type;
      const expression = path.call(print, "namedChildren", 0);
      return expressionType === "switch_expression" && parentType !== "assignment_expression" && parentType !== "switch_rule" ? expression : [expression, ";"];
    },
    if_statement(path, print) {
      const statement = ["if ", path.call(print, "conditionNode")];
      if (path.node.consequenceNode.type === ";") statement.push(";");
      else statement.push(" ", path.call(print, "consequenceNode"));
      if (!hasChild(path, "alternativeNode")) return statement;
      const danglingComments = printDanglingComments(path);
      if (danglingComments) statement.push(hardline$5, danglingComments, hardline$5);
      else {
        const ifHasBlock = path.node.consequenceNode.type === "block";
        statement.push(ifHasBlock ? " " : hardline$5);
      }
      statement.push("else");
      if (path.node.alternativeNode.type === ";") statement.push(";");
      else statement.push(" ", path.call(print, "alternativeNode"));
      return statement;
    },
    assert_statement(path, print) {
      return [
        "assert ",
        ...join$6(" : ", path.map(print, "namedChildren")),
        ";"
      ];
    },
    switch_expression(path, print) {
      return join$6(" ", [
        "switch",
        path.call(print, "conditionNode"),
        path.call(print, "bodyNode")
      ]);
    },
    switch_block(path, print) {
      return printBlock(path, path.map(print, "namedChildren"));
    },
    switch_block_statement_group(path, print) {
      const parts2 = [];
      path.each((child) => {
        if (child.node.type === "switch_label") parts2.push(print(child), ":");
      }, "namedChildren");
      const firstStatementIndex = path.node.namedChildren.findIndex(({ type }) => type !== "switch_label");
      if (firstStatementIndex === path.node.namedChildren.length - 1 && path.node.namedChildren[firstStatementIndex].type === "block") parts2.push(" ", path.call(print, "namedChildren", firstStatementIndex));
      else if (firstStatementIndex !== -1) parts2.push(indent$6([hardline$5, ...join$6(hardline$5, printBlockStatements(path, print))]));
      return parts2;
    },
    switch_label(path, print) {
      if (!path.node.children.some(({ type }) => type === "case")) return "default";
      const values = [];
      path.each((child) => {
        if (child.node.type !== "guard") values.push(print(child));
      }, "namedChildren");
      const hasMultipleValues = values.length > 1;
      const label2 = hasMultipleValues ? ["case", indent$6([line$6, ...join$6([",", line$6], values)])] : ["case ", values[0]];
      const guardIndex = path.node.namedChildren.findIndex(({ type }) => type === "guard");
      return guardIndex !== -1 ? [group$6([...label2, hasMultipleValues ? line$6 : " "]), path.call(print, "namedChildren", guardIndex)] : group$6(label2);
    },
    switch_rule(path, print) {
      const bodyIndex = path.node.namedChildren.findIndex(({ type }) => type === "block" || type === "expression_statement" || type === "throw_statement");
      const body2 = path.call(print, "namedChildren", bodyIndex);
      const switchLabelIndex = path.node.namedChildren.findIndex(({ type }) => type === "switch_label");
      const parts2 = [path.call(print, "namedChildren", switchLabelIndex), " ->"];
      const bodyNode = path.node.namedChildren[bodyIndex];
      if (bodyNode.type !== "block" && hasLeadingComments(bodyNode)) parts2.push(indent$6([hardline$5, body2]));
      else parts2.push(" ", body2);
      return parts2;
    },
    while_statement(path, print) {
      const parts2 = ["while ", path.call(print, "conditionNode")];
      const body2 = path.call(print, "bodyNode");
      const bodyType = path.node.bodyNode.type;
      if (bodyType === "block") {
        parts2.push(" ", body2);
        return parts2;
      } else if (bodyType === ";") {
        parts2.push(";");
        return parts2;
      } else {
        parts2.push(line$6, body2);
        return group$6(indent$6(parts2));
      }
    },
    do_statement(path, print) {
      return [
        "do",
        path.node.bodyNode.type === ";" ? ";" : [" ", path.call(print, "bodyNode")],
        " while ",
        path.call(print, "conditionNode"),
        ";"
      ];
    },
    for_statement(path, print) {
      const danglingComments = printDanglingComments(path);
      const hasInit = path.node.initNodes.length > 0;
      const hasCondition = hasChild(path, "conditionNode");
      const hasUpdate = path.node.updateNodes.length > 0;
      const expressions = [
        !hasInit ? ";" : path.node.initNodes[0].type === "local_variable_declaration" ? path.call(print, "initNodes", 0) : [printExpressionList(path.map(print, "initNodes")), ";"],
        hasCondition ? [path.call(print, "conditionNode"), ";"] : ";",
        hasUpdate ? printExpressionList(path.map(print, "updateNodes")) : ""
      ];
      const hasEmptyStatement = path.node.bodyNode.type === ";";
      return [
        danglingComments && [danglingComments, hardline$5],
        "for ",
        hasInit || hasCondition || hasUpdate ? group$6(indentInParentheses(join$6(line$6, expressions))) : "(;;)",
        hasEmptyStatement ? ";" : [" ", path.call(print, "bodyNode")]
      ];
    },
    update_expression(path, print) {
      return path.map(print, "children");
    },
    enhanced_for_statement(path, print) {
      const danglingComments = printDanglingComments(path);
      const forStatement = [
        danglingComments && [danglingComments, hardline$5],
        "for (",
        ...printModifiers(path, print),
        path.call(print, "typeNode"),
        " ",
        path.call(print, "nameNode")
      ];
      if (hasChild(path, "dimensionsNode")) forStatement.push(path.call(print, "dimensionsNode"));
      forStatement.push(" : ", path.call(print, "valueNode"), ")");
      const bodyType = path.node.bodyNode.type;
      if (bodyType === ";") forStatement.push(";");
      else {
        const body2 = path.call(print, "bodyNode");
        forStatement.push(bodyType === "block" ? [" ", body2] : indent$6([line$6, body2]));
      }
      return group$6(forStatement);
    },
    break_statement(path, print) {
      const parts2 = ["break"];
      const identifierIndex = path.node.namedChildren.findIndex(({ type }) => type === "identifier");
      if (identifierIndex !== -1) parts2.push(" ", path.call(print, "namedChildren", identifierIndex));
      parts2.push(";");
      return parts2;
    },
    continue_statement(path, print) {
      const identifierIndex = path.node.namedChildren.findIndex(({ type }) => type === "identifier");
      return identifierIndex !== -1 ? [
        "continue ",
        path.call(print, "namedChildren", identifierIndex),
        ";"
      ] : "continue;";
    },
    return_statement: printReturnOrThrowStatement,
    throw_statement: printReturnOrThrowStatement,
    synchronized_statement(path, print) {
      const parenthesizedExpressionIndex = path.node.namedChildren.findIndex(({ type }) => type === "parenthesized_expression");
      return [
        "synchronized ",
        path.call(print, "namedChildren", parenthesizedExpressionIndex),
        " ",
        path.call(print, "bodyNode")
      ];
    },
    try_statement(path, print) {
      const parts2 = ["try", path.call(print, "bodyNode")];
      path.each((child) => {
        if (child.node.type === "catch_clause" || child.node.type === "finally_clause") parts2.push(print(child));
      }, "namedChildren");
      return join$6(" ", parts2);
    },
    catch_clause(path, print) {
      const catchFormalParameterIndex = path.node.namedChildren.findIndex(({ type }) => type === "catch_formal_parameter");
      return [
        "catch ",
        group$6(indentInParentheses(path.call(print, "namedChildren", catchFormalParameterIndex))),
        " ",
        path.call(print, "bodyNode")
      ];
    },
    catch_formal_parameter(path, print) {
      const parts2 = printModifiers(path, print, "noBreak");
      const catchTypeIndex = path.node.namedChildren.findIndex(({ type }) => type === "catch_type");
      parts2.push(path.call(print, "namedChildren", catchTypeIndex), " ", path.call(print, "nameNode"));
      if (hasChild(path, "dimensionsNode")) parts2.push(path.call(print, "dimensionsNode"));
      return parts2;
    },
    catch_type(path, print) {
      return join$6([line$6, "| "], path.map(print, "namedChildren"));
    },
    finally_clause(path, print) {
      return ["finally ", path.call(print, "namedChildren", 0)];
    },
    try_with_resources_statement(path, print) {
      const parts2 = [
        "try",
        path.call(print, "resourcesNode"),
        path.call(print, "bodyNode")
      ];
      path.each((child) => {
        if (child.node.type === "catch_clause" || child.node.type === "finally_clause") parts2.push(print(child));
      }, "namedChildren");
      return join$6(" ", parts2);
    },
    resource_specification(path, print) {
      const resources = [];
      let hasTrailingSemicolon = false;
      path.each((child) => {
        if (child.node.type === "resource") {
          resources.push(print(child));
          hasTrailingSemicolon = false;
        } else if (child.node.type === ";") hasTrailingSemicolon = true;
      }, "children");
      const parts2 = join$6([";", line$6], resources);
      if (hasTrailingSemicolon) parts2.push(ifBreak$1(";"));
      return group$6(indentInParentheses(parts2));
    },
    resource(path, print) {
      if (hasChild(path, "typeNode") && hasChild(path, "nameNode") && hasChild(path, "valueNode")) {
        const parts2 = printModifiers(path, print);
        parts2.push(path.call(print, "typeNode"), " ", path.call(print, "nameNode"));
        if (hasChild(path, "dimensionsNode")) parts2.push(path.call(print, "dimensionsNode"));
        parts2.push(" =");
        const value = path.call(print, "valueNode");
        if (path.node.valueNode.type === "binary_expression" || hasLeadingComments(path.node.valueNode)) parts2.push(group$6(indent$6([line$6, value])));
        else {
          const groupId = /* @__PURE__ */ Symbol("assignment");
          parts2.push(group$6(indent$6(line$6), { id: groupId }), indentIfBreak$1(value, { groupId }));
        }
        return parts2;
      }
      const resourceIndex = path.node.namedChildren.findIndex(({ type }) => type === "identifier" || type === "field_access");
      return path.call(print, "namedChildren", resourceIndex);
    },
    yield_statement(path, print) {
      return [
        "yield ",
        path.call(print, "namedChildren", 0),
        ";"
      ];
    }
  };
  function printExpressionList(expressions) {
    return group$6(expressions.map((expression, index) => index === 0 ? expression : [",", indent$6([line$6, expression])]));
  }
  function printReturnOrThrowArgument(path, print) {
    const { node } = path;
    const argumentDoc = print(path);
    if (returnArgumentHasLeadingComment(node)) return [
      "(",
      indent$6([hardline$5, argumentDoc]),
      hardline$5,
      ")"
    ];
    if (node.type === "binary_expression") return group$6([
      ifBreak$1("("),
      indent$6([softline$3, argumentDoc]),
      softline$3,
      ifBreak$1(")")
    ]);
    return argumentDoc;
  }
  function printReturnOrThrowStatement(path, print) {
    const { node } = path;
    return [
      node.type === "throw_statement" ? "throw" : "return",
      node.namedChildren.length ? [" ", path.call(() => printReturnOrThrowArgument(path, print), "namedChildren", 0)] : "",
      ";"
    ];
  }
  var { group: group$5, hardline: hardline$4, indent: indent$5, join: join$5, line: line$5, softline: softline$2 } = builders;
  var classes_default = {
    class_declaration(path, print) {
      const parts2 = ["class ", path.call(print, "nameNode")];
      const definedClauses = definedKeys(path.node, [
        "superclassNode",
        "interfacesNode",
        "permitsNode"
      ]);
      const hasMultipleClauses = definedClauses.length > 1;
      const hasTypeParameters = hasChild(path, "type_parametersNode");
      if (hasTypeParameters) {
        const typeParameters = path.call(print, "type_parametersNode");
        parts2.push(hasMultipleClauses ? group$5(indent$5(typeParameters)) : typeParameters);
      }
      if (definedClauses.length) {
        const separator = hasTypeParameters && !hasMultipleClauses ? " " : line$5;
        const clauses = definedClauses.flatMap((clause) => hasChild(path, clause) ? [separator, path.call(print, clause)] : []);
        const hasBody = path.node.bodyNode.namedChildren.length > 0;
        const clauseGroup = [hasTypeParameters && !hasMultipleClauses ? clauses : indent$5(clauses), hasBody ? separator : " "];
        parts2.push(hasMultipleClauses ? clauseGroup : group$5(clauseGroup));
      } else parts2.push(" ");
      return [
        ...printModifiers(path, print, "declarationOnly"),
        group$5(parts2),
        path.call(print, "bodyNode")
      ];
    },
    type_parameters: printTypeParameters,
    superclass(path, print) {
      return ["extends ", path.call(print, "namedChildren", 0)];
    },
    super_interfaces(path, print) {
      return group$5(["implements", indent$5([line$5, path.call(print, "namedChildren", 0)])]);
    },
    permits(path, print) {
      return group$5(["permits", indent$5([line$5, path.call(print, "namedChildren", 0)])]);
    },
    type_list(path, print) {
      return join$5([",", line$5], path.map(print, "namedChildren"));
    },
    class_body(path, print) {
      return printBlock(path, printBodyDeclarations(path, print, path.parent?.type === "class_declaration"));
    },
    field_declaration: printVariableDeclaration,
    variable_declarator(path, print) {
      const leftDoc = [path.call(print, "nameNode")];
      if (hasChild(path, "dimensionsNode")) leftDoc.push(path.call(print, "dimensionsNode"));
      return printAssignment(leftDoc, " =", hasChild(path, "valueNode") ? path.call(print, "valueNode") : void 0, path.node.valueNode);
    },
    method_declaration(path, print) {
      const modifiers = printModifiers(path, print);
      const declaration = [];
      if (hasChild(path, "type_parametersNode")) declaration.push(group$5(path.call(print, "type_parametersNode")), " ");
      path.each((child) => {
        if (child.node.type === "annotation" || child.node.type === "marker_annotation") declaration.push(print(child), " ");
      }, "children");
      declaration.push(path.call(print, "typeNode"));
      if (hasChild(path, "dimensionsNode")) declaration.push(path.call(print, "dimensionsNode"));
      declaration.push(" ", path.call(print, "nameNode"), group$5(path.call(print, "parametersNode")));
      const throwsIndex = path.node.namedChildren.findIndex(({ type }) => type === "throws");
      if (throwsIndex !== -1) declaration.push(group$5(indent$5([line$5, path.call(print, "namedChildren", throwsIndex)])));
      return hasChild(path, "bodyNode") ? [
        modifiers,
        group$5(declaration),
        " ",
        path.call(print, "bodyNode")
      ] : [
        modifiers,
        group$5(declaration),
        ";"
      ];
    },
    receiver_parameter(path, print) {
      return path.map((child) => child.isLast ? print(child) : [print(child), child.node.type === "identifier" ? "." : " "], "namedChildren");
    },
    formal_parameters(path, print) {
      const parameters = path.parent?.type === "record_declaration" ? printBodyDeclarations(path, print) : path.map(print, "namedChildren");
      if (parameters.length === 0) return [
        "(",
        printDanglingCommentsInList(path),
        ")"
      ];
      return indentInParentheses(join$5([",", line$5], parameters));
    },
    formal_parameter(path, print) {
      const parameter = printModifiers(path, print, path.grandparent?.type === "record_declaration" ? "avoidBreak" : "noBreak");
      parameter.push(path.call(print, "typeNode"));
      if (hasChild(path, "dimensionsNode")) parameter.push(path.call(print, "dimensionsNode"));
      parameter.push(" ", path.call(print, "nameNode"));
      return group$5(parameter);
    },
    spread_parameter(path, print) {
      const parts2 = printModifiers(path, print, "noBreak");
      parts2.push(path.call(print, "typeNode"));
      if (hasChild(path, "annotationsNodes")) parts2.push(...path.map((annotation) => [" ", print(annotation)], "annotationsNodes"));
      parts2.push("... ", path.call(print, "namedChildren", path.node.namedChildren.length - 1));
      return parts2;
    },
    throws(path, print) {
      return ["throws ", ...join$5(", ", path.map(print, "namedChildren"))];
    },
    static_initializer(path, print) {
      return ["static ", path.call(print, "namedChildren", 0)];
    },
    constructor_declaration(path, print) {
      const modifiers = printModifiers(path, print, "declarationOnly");
      const declaration = [];
      if (hasChild(path, "type_parametersNode")) declaration.push(group$5(path.call(print, "type_parametersNode")), " ");
      declaration.push(path.call(print, "nameNode"), group$5(path.call(print, "parametersNode")));
      const throwsIndex = path.node.namedChildren.findIndex(({ type }) => type === "throws");
      if (throwsIndex !== -1) declaration.push(group$5(indent$5([line$5, path.call(print, "namedChildren", throwsIndex)])));
      return [
        modifiers,
        group$5(declaration),
        " ",
        path.call(print, "bodyNode")
      ];
    },
    constructor_body(path, print) {
      return printBlock(path, printBlockStatements(path, print));
    },
    explicit_constructor_invocation(path, print) {
      const invocation = [];
      if (hasChild(path, "objectNode")) invocation.push(path.call(print, "objectNode"), ".");
      if (hasChild(path, "type_argumentsNode")) invocation.push(path.call(print, "type_argumentsNode"));
      invocation.push(path.call(print, "constructorNode"), path.call(print, "argumentsNode"), ";");
      return invocation;
    },
    visibility: printValue,
    modifier: printValue,
    modifiers(path, print, _, args2) {
      const parts2 = [];
      const modifiers = [];
      const typeAnnotations = [];
      path.each((child) => {
        if (child.node.type === "annotation" || child.node.type === "marker_annotation") (modifiers.length ? typeAnnotations : parts2).push(print(child));
        else {
          modifiers.push(child.node.value);
          parts2.push(...typeAnnotations);
          typeAnnotations.length = 0;
        }
      }, "namedChildren");
      const annotationMode = args2 && typeof args2 === "object" && "annotationMode" in args2 ? args2.annotationMode : null;
      if (annotationMode === "declarationOnly") {
        parts2.push(...typeAnnotations);
        typeAnnotations.length = 0;
      }
      modifiers.sort((a, b2) => (indexByModifier.get(a) ?? -1) - (indexByModifier.get(b2) ?? -1));
      if (modifiers.length || typeAnnotations.length) parts2.push(join$5(" ", [...modifiers, ...typeAnnotations]));
      return join$5(annotationMode === "avoidBreak" ? line$5 : annotationMode === "noBreak" ? " " : hardline$4, parts2);
    },
    enum_declaration(path, print) {
      const modifiers = printModifiers(path, print, "declarationOnly");
      const parts2 = ["enum ", path.call(print, "nameNode")];
      if (hasChild(path, "interfacesNode")) {
        const hasBody = path.node.bodyNode.namedChildren.length > 0;
        parts2.push(indent$5([line$5, path.call(print, "interfacesNode")]), hasBody ? line$5 : " ");
      } else parts2.push(" ");
      return [
        ...modifiers,
        group$5(parts2),
        path.call(print, "bodyNode")
      ];
    },
    enum_body(path, print, options) {
      const parts2 = printBodyDeclarations(path, print);
      const enumBodyDeclarationsIndex = path.node.namedChildren.findIndex(({ type }) => type === "enum_body_declarations");
      const declarations = [];
      if (enumBodyDeclarationsIndex !== -1) {
        const hasDeclarations = path.node.namedChildren[enumBodyDeclarationsIndex].namedChildren.length > 0;
        const enumBodyDeclarations = parts2.pop();
        if (hasDeclarations) {
          if (!parts2.length) declarations.push(hardline$4);
          declarations.push(enumBodyDeclarations);
        }
      }
      const contents = [];
      if (parts2.length) {
        contents.push(join$5([",", hardline$4], parts2));
        if (!declarations.length && options.trailingComma !== "none") contents.push(",");
      }
      if (declarations.length) contents.push(";", hardline$4, ...declarations);
      return printBlock(path, contents.length ? [contents] : []);
    },
    enum_constant(path, print) {
      const initializer = printModifiers(path, print);
      initializer.push(path.call(print, "nameNode"));
      if (hasChild(path, "argumentsNode")) initializer.push(path.call(print, "argumentsNode"));
      if (hasChild(path, "bodyNode")) initializer.push(" ", path.call(print, "bodyNode"));
      return initializer;
    },
    enum_body_declarations(path, print) {
      return join$5(hardline$4, printBodyDeclarations(path, print));
    },
    record_declaration(path, print) {
      const modifiers = printModifiers(path, print, "declarationOnly");
      const parts2 = ["record ", path.call(print, "nameNode")];
      if (hasChild(path, "type_parametersNode")) parts2.push(group$5(path.call(print, "type_parametersNode")));
      parts2.push(path.call(print, "parametersNode"));
      if (hasChild(path, "interfacesNode")) {
        const hasParameters = path.node.parametersNode.namedChildren.length > 0;
        const hasBody = path.node.bodyNode.namedChildren.length > 0;
        const interfaces = [hasParameters ? " " : line$5, path.call(print, "interfacesNode")];
        parts2.push(group$5([hasParameters ? interfaces : indent$5(interfaces), hasBody ? line$5 : " "]));
      } else parts2.push(" ");
      return [
        ...modifiers,
        group$5(parts2),
        path.call(print, "bodyNode")
      ];
    },
    compact_constructor_declaration(path, print) {
      const parts2 = printModifiers(path, print, "declarationOnly");
      parts2.push(path.call(print, "nameNode"), " ", path.call(print, "bodyNode"));
      return parts2;
    }
  };
  var indexByModifier = [
    "public",
    "protected",
    "private",
    "abstract",
    "default",
    "static",
    "final",
    "transient",
    "volatile",
    "synchronized",
    "native",
    "sealed",
    "non-sealed",
    "strictfp"
  ].reduce((map, name2, index) => map.set(name2, index), /* @__PURE__ */ new Map());
  function printDanglingCommentsInList(path) {
    const { node } = path;
    return node.comments?.some((comment) => !(comment.leading || comment.trailing)) ? [indent$5([softline$2, printDanglingComments(path)]), node.comments.some(({ type, leading, trailing }) => !(leading || trailing) && type === "line_comment") ? hardline$4 : softline$2] : "";
  }
  var { align: align2, breakParent: breakParent$1, conditionalGroup: conditionalGroup2, dedent: dedent2, group: group$4, hardline: hardline$3, ifBreak: ifBreak2, indent: indent$4, indentIfBreak: indentIfBreak2, join: join$4, line: line$4, lineSuffixBoundary: lineSuffixBoundary2, softline: softline$1 } = builders;
  var { getNextNonSpaceNonCommentCharacterIndex, hasNewline: hasNewline$1, isNextLineEmpty } = fr;
  var { removeLines: removeLines2, willBreak: willBreak2 } = utils;
  var expressions_default = {
    lambda_expression(path, print, options, args2) {
      const signatureDocs = [];
      let bodyDoc;
      const bodyComments = [];
      const shouldPrintAsChain = !(args2 && typeof args2 === "object" && "expandLastArg" in args2 && args2.expandLastArg) && path.node.bodyNode.type === "lambda_expression";
      let functionBody;
      (function rec() {
        const { node } = path;
        const signatureDoc = printLambdaExpressionSignature(path, options, print, args2);
        if (signatureDocs.length === 0) signatureDocs.push(signatureDoc);
        else {
          const { leading, trailing } = printCommentsSeparately(path);
          signatureDocs.push([leading, signatureDoc]);
          bodyComments.unshift(trailing);
        }
        if (!shouldPrintAsChain || node.bodyNode.type !== "lambda_expression") {
          bodyDoc = path.call((child) => print(child, args2), "bodyNode");
          functionBody = node.bodyNode;
        } else path.call(rec, "bodyNode");
      })();
      const shouldPutBodyOnSameLine = !functionBody.comments?.some((comment) => comment.leading && hasNewline$1(options.originalText, comment.end.index)) && mayBreakAfterShortPrefix(functionBody);
      const chainGroupId = /* @__PURE__ */ Symbol("arrow-chain");
      const signaturesDoc = printArrowFunctionSignatures(path, { signatureDocs });
      bodyDoc = printArrowFunctionBody(path, args2, {
        bodyDoc,
        bodyComments,
        shouldPutBodyOnSameLine
      });
      return group$4([
        group$4(signaturesDoc, { id: chainGroupId }),
        " ->",
        shouldPrintAsChain ? indentIfBreak2(bodyDoc, { groupId: chainGroupId }) : group$4(bodyDoc)
      ]);
    },
    inferred_parameters(path, print, options) {
      const identifiers = [];
      path.each((child) => {
        if (child.node.type === "identifier") identifiers.push(print(child));
      }, "namedChildren");
      if (!identifiers.length) return "()";
      const parameters = join$4([",", line$4], identifiers);
      if (identifiers.length > 1 || willBreak2(identifiers)) return group$4(indentInParentheses(parameters));
      return options.arrowParens === "avoid" ? parameters : [
        "(",
        ...parameters,
        ")"
      ];
    },
    ternary_expression(path, print, options) {
      const { node } = path;
      const consequentNode = node.consequenceNode;
      const parts2 = [];
      const parent = path.parent;
      const isParentTest = parent.type === node.type && parent.conditionNode === node;
      const forceNoIndent = parent.type === node.type && !isParentTest;
      let currentParent;
      let previousParent;
      let i2 = 0;
      do {
        previousParent = currentParent || node;
        currentParent = path.getParentNode(i2);
        i2++;
      } while (currentParent && currentParent.type === node.type && currentParent.conditionNode !== previousParent);
      const firstNonConditionalParent = currentParent || parent;
      const printBranch = (nodePropertyName) => options.useTabs ? indent$4(path.call(print, nodePropertyName)) : align2(2, path.call(print, nodePropertyName));
      const part = [
        line$4,
        "? ",
        consequentNode.type === node.type ? ifBreak2("", "(") : "",
        printBranch("consequenceNode"),
        consequentNode.type === node.type ? ifBreak2("", ")") : "",
        line$4,
        ": ",
        printBranch("alternativeNode")
      ];
      parts2.push(parent.type !== node.type || parent.alternativeNode === node || isParentTest ? part : options.useTabs ? dedent2(indent$4(part)) : align2(Math.max(0, options.tabWidth - 2), part));
      const maybeGroup = (doc) => parent === firstNonConditionalParent ? group$4(doc) : doc;
      const breakClosingParen = parent.type === "explicit_constructor_invocation" || parent.type === "field_access" || parent.type === "method_invocation" || parent.type === "method_reference" || parent.type === "object_creation_expression";
      const shouldExtraIndent = shouldExtraIndentForTernaryExpression(path);
      const result = maybeGroup([
        printTernaryTest(path, print),
        forceNoIndent ? parts2 : indent$4(parts2),
        breakClosingParen && !shouldExtraIndent ? softline$1 : ""
      ]);
      return isParentTest || shouldExtraIndent ? group$4([indent$4([softline$1, result]), softline$1]) : result;
    },
    assignment_expression(path, print) {
      const { node } = path;
      return printAssignment(path.call(print, "leftNode"), [" ", node.operatorNode.type], path.call(print, "rightNode"), node.rightNode);
    },
    binary_expression(path, print, options) {
      const { node } = path;
      const parent = path.parent;
      const grandparent = path.grandparent;
      const isInsideParentheses = (grandparent?.type === "if_statement" || grandparent?.type === "while_statement" || grandparent?.type === "switch_expression" || grandparent?.type === "do_statement") && grandparent.conditionNode === parent || grandparent?.type === "synchronized_statement" && grandparent.bodyNode !== parent;
      const parts2 = printBinaryExpressions(path, print, options, isInsideParentheses);
      if (isInsideParentheses) return parts2;
      if (parent?.type === "unary_expression" && !node.comments || (parent?.type === "explicit_constructor_invocation" || parent?.type === "field_access" || parent?.type === "method_invocation") && parent.objectNode === node || parent?.type === "method_reference" || parent?.type === "object_creation_expression") return group$4([indent$4([softline$1, ...parts2]), softline$1]);
      if (isReturnOrThrowStatement(parent) || parent?.type === "assignment_expression" || parent?.type === "variable_declarator" || parent?.type === "guard" || parent?.type === "lambda_expression" && parent.bodyNode === node || parent?.type === "for_statement" && parent.conditionNode === node || parent?.type === "ternary_expression" && !isReturnOrThrowStatement(grandparent) && grandparent?.type !== "parenthesized_expression" && grandparent?.type !== "argument_list" || parent?.type === "unary_expression" && parent.operandNode === node) return group$4(parts2);
      if (parts2.length === 0) return "";
      const firstGroupIndex = parts2.findIndex((part) => typeof part !== "string" && !Array.isArray(part) && part.type === "group");
      const headParts = parts2.slice(0, firstGroupIndex === -1 ? 1 : firstGroupIndex + 1);
      const rest = parts2.slice(headParts.length);
      return group$4([...headParts, indent$4(rest)]);
    },
    instanceof_expression(path, print, options) {
      return group$4(indent$4(path.map((child) => {
        const doc = print(child, { annotationMode: "noBreak" });
        if (!child.previous) return doc;
        return [(options.experimentalOperatorPosition === "start" ? child.node.type === "instanceof" : child.previous.type === "instanceof") ? line$4 : " ", doc];
      }, "children")));
    },
    unary_expression(path, print) {
      return path.map(print, "children");
    },
    field_access: printMemberChain,
    generic_type(path, print) {
      const typeIdentifierIndex = path.node.namedChildren.findIndex(({ type }) => type === "scoped_type_identifier" || type === "type_identifier");
      const typeArgumentsIndex = path.node.namedChildren.findIndex(({ type }) => type === "type_arguments");
      return [path.call(print, "namedChildren", typeIdentifierIndex), path.call(print, "namedChildren", typeArgumentsIndex)];
    },
    parenthesized_expression(path, print) {
      const expression = path.call(print, "namedChildren", 0);
      const parentType = path.parent?.type;
      const grandparentType = path.grandparent?.type;
      const expressionType = path.node.namedChildren[0].type;
      const hasLambda = expressionType === "lambda_expression";
      const hasTernary = expressionType === "ternary_expression";
      const hasSuffix = parentType && (parentType === "array_access" || parentType === "explicit_constructor_invocation" || parentType === "field_access" || parentType === "method_invocation" || parentType === "method_reference" || parentType === "object_creation_expression");
      const isAssignment = parentType && (parentType === "assignment_expression" || parentType === "variable_declarator") || hasSuffix && (grandparentType === "assignment_expression" || grandparentType === "variable_declarator");
      if (!hasLambda && hasSuffix && (!hasTernary || isAssignment)) return group$4(indentInParentheses(hasTernary ? group$4(expression) : expression));
      else if (parentType && (parentType === "guard" || parentType === "return_statement" || parentType === "unary_expression" && grandparentType === "return_statement" || path.node.fieldName === "condition" && (parentType === "do_statement" || parentType === "if_statement" || parentType === "switch_expression" || parentType === "while_statement") || path.node.fieldName !== "body" && parentType === "synchronized_statement")) return group$4(indentInParentheses(group$4(expression)));
      else if (hasTernary && hasSuffix && !isAssignment) return group$4([
        "(",
        expression,
        softline$1,
        ")"
      ]);
      else return group$4([
        "(",
        hasLambda || hasTernary ? expression : indent$4(expression),
        ")"
      ]);
    },
    cast_expression(path, print) {
      const { node } = path;
      const parts2 = [
        group$4(node.typeNodes.length === 1 ? [
          "(",
          path.call(print, "typeNodes", 0),
          ")"
        ] : [
          "(",
          indent$4([softline$1, join$4([" &", line$4], path.map(print, "typeNodes"))]),
          softline$1,
          ")"
        ]),
        " ",
        path.call(print, "valueNode")
      ];
      const parent = path.parent;
      if (parent?.type === "unary_expression" && !node.comments || parent?.type === "array_access" && parent.arrayNode === node || (parent?.type === "explicit_constructor_invocation" || parent?.type === "field_access" || parent?.type === "method_invocation") && parent.objectNode === node || parent?.type === "method_reference" || parent?.type === "object_creation_expression") return group$4([indent$4([softline$1, ...parts2]), softline$1]);
      return parts2;
    },
    object_creation_expression(path, print) {
      const expression = [];
      path.each((child) => {
        if (child.node.type === "class_body") expression.push(" ");
        expression.push(print(child));
        if (child.node.type === "annotation" || child.node.type === "marker_annotation" || child.node.type === "new") expression.push(" ");
      }, "children");
      return expression;
    },
    method_invocation: printMemberChain,
    argument_list(path, print, options) {
      const args2 = path.node.namedChildren;
      if (args2.length === 0) {
        const shouldBreak = path.node.comments?.some(({ type, leading, trailing }) => !leading && !trailing && type === "line_comment");
        return group$4(indentInParentheses(printDanglingComments(path)), { shouldBreak });
      }
      const lastArgIndex = args2.length - 1;
      let anyArgEmptyLine = false;
      const printedArguments = [];
      path.each((arg, index) => {
        let argDoc = print(arg);
        if (index === lastArgIndex) {
        } else if (isNextLineEmpty(options.originalText, arg.node.end.index)) {
          anyArgEmptyLine = true;
          argDoc = [
            argDoc,
            ",",
            hardline$3,
            hardline$3
          ];
        } else argDoc = [
          argDoc,
          ",",
          line$4
        ];
        printedArguments.push(argDoc);
      }, "namedChildren");
      function allArgsBrokenOut() {
        return group$4([
          "(",
          indent$4([line$4, ...printedArguments]),
          line$4,
          ")"
        ], { shouldBreak: true });
      }
      if (anyArgEmptyLine) return allArgsBrokenOut();
      if (shouldExpandFirstArg(args2)) {
        const tailArgs = printedArguments.slice(1);
        if (tailArgs.some(willBreak2)) return allArgsBrokenOut();
        let firstArg;
        try {
          firstArg = path.call((arg) => print(arg, { expandFirstArg: true }), "namedChildren", 0);
        } catch (caught) {
          if (caught instanceof ArgExpansionBailout) return allArgsBrokenOut();
          throw caught;
        }
        if (willBreak2(firstArg)) return [breakParent$1, conditionalGroup2([[
          "(",
          group$4(firstArg, { shouldBreak: true }),
          ", ",
          ...tailArgs,
          ")"
        ], allArgsBrokenOut()])];
        return conditionalGroup2([
          [
            "(",
            firstArg,
            ", ",
            ...tailArgs,
            ")"
          ],
          [
            "(",
            group$4(firstArg, { shouldBreak: true }),
            ", ",
            ...tailArgs,
            ")"
          ],
          allArgsBrokenOut()
        ]);
      }
      if (shouldExpandLastArg(args2)) {
        const headArgs = printedArguments.slice(0, -1);
        if (headArgs.some(willBreak2)) return allArgsBrokenOut();
        let lastArg;
        try {
          lastArg = path.call((arg) => print(arg, { expandLastArg: true }), "namedChildren", lastArgIndex);
        } catch (caught) {
          if (caught instanceof ArgExpansionBailout) return allArgsBrokenOut();
          throw caught;
        }
        if (willBreak2(lastArg)) return [breakParent$1, conditionalGroup2([[
          "(",
          ...headArgs,
          group$4(lastArg, { shouldBreak: true }),
          ")"
        ], allArgsBrokenOut()])];
        return conditionalGroup2([
          [
            "(",
            ...headArgs,
            lastArg,
            ")"
          ],
          [
            "(",
            ...headArgs,
            group$4(lastArg, { shouldBreak: true }),
            ")"
          ],
          allArgsBrokenOut()
        ]);
      }
      return group$4(indentInParentheses(printedArguments), { shouldBreak: printedArguments.some(willBreak2) || anyArgEmptyLine });
    },
    array_creation_expression(path, print) {
      const parts2 = ["new "];
      path.each((child) => {
        if (child.node.type === "annotation" || child.node.type === "marker_annotation") parts2.push(print(child), " ");
      }, "namedChildren");
      parts2.push(path.call(print, "typeNode"), ...path.map(print, "dimensionsNodes"));
      if (hasChild(path, "valueNode")) parts2.push(" ", path.call(print, "valueNode"));
      return parts2;
    },
    dimensions_expr(path, print) {
      return path.map((child) => child.node.type === "annotation" || child.node.type === "marker_annotation" ? [print(child), " "] : [
        "[",
        print(child),
        "]"
      ], "namedChildren");
    },
    class_literal(path, print) {
      return [path.call(print, "namedChildren", 0), ".class"];
    },
    array_access: printMemberChain,
    method_reference(path, print) {
      return group$4(path.map(print, "children"));
    },
    template_expression(path, print) {
      return [
        path.call(print, "template_processorNode"),
        ".",
        path.call(print, "template_argumentNode")
      ];
    },
    pattern(path, print) {
      return path.call(print, "namedChildren", 0);
    },
    type_pattern(path, print) {
      return join$4(" ", path.map(print, "children"));
    },
    record_pattern(path, print) {
      return path.map(print, "children");
    },
    record_pattern_body(path, print) {
      return group$4(indentInParentheses(join$4([",", line$4], path.map(print, "namedChildren"))));
    },
    record_pattern_component(path, print) {
      return join$4(" ", path.map(print, "children"));
    },
    guard(path, print) {
      return ["when ", group$4([
        ifBreak2("("),
        indent$4([softline$1, path.call(print, "namedChildren", 0)]),
        softline$1,
        ifBreak2(")")
      ])];
    }
  };
  function printLambdaExpressionSignature(path, options, print, args2) {
    const parts2 = [];
    const parameters = path.call(print, "parametersNode");
    if (shouldPrintParamsWithoutParens(path, options)) parts2.push(parameters);
    else {
      if (args2 != null && typeof args2 === "object" && ("expandLastArg" in args2 && args2.expandLastArg === true || "expandFirstArg" in args2 && args2.expandFirstArg === true)) {
        if (willBreak2(parameters)) throw new ArgExpansionBailout();
        parts2.push(group$4(removeLines2(parameters)));
      } else parts2.push(parameters);
      if (path.node.parametersNode.type === "identifier") return path.node.parametersNode.comments ? group$4([
        "(",
        indent$4([softline$1, ...parts2]),
        lineSuffixBoundary2,
        ")"
      ]) : [
        "(",
        ...parts2,
        ")"
      ];
    }
    const dangling = printDanglingComments(path);
    if (dangling) parts2.push(" ", dangling);
    return parts2;
  }
  function mayBreakAfterShortPrefix(functionBody) {
    return functionBody.type === "array_creation_expression" || functionBody.type === "lambda_expression" || functionBody.type === "block";
  }
  function printArrowFunctionSignatures(path, { signatureDocs }) {
    if (signatureDocs.length === 1) return signatureDocs[0];
    const { node, parent } = path;
    if (node.fieldName !== "object" && parent?.type === "method_invocation" || parent?.type === "binary_expression") return group$4([
      signatureDocs[0],
      " ->",
      indent$4([line$4, join$4([" ->", line$4], signatureDocs.slice(1))])
    ]);
    if (node.fieldName === "object" && parent?.type === "method_invocation") return group$4(join$4([" ->", line$4], signatureDocs));
    return group$4(indent$4(join$4([" ->", line$4], signatureDocs)));
  }
  function printArrowFunctionBody(path, args2, { bodyDoc, bodyComments, shouldPutBodyOnSameLine }) {
    const trailingSpace = args2 && typeof args2 === "object" && "expandLastArg" in args2 && args2.expandLastArg && !path.node.comments ? softline$1 : "";
    return shouldPutBodyOnSameLine ? [
      " ",
      bodyDoc,
      bodyComments
    ] : [indent$4([
      line$4,
      bodyDoc,
      bodyComments
    ]), trailingSpace];
  }
  function shouldPrintParamsWithoutParens(path, options) {
    if (options.arrowParens === "always") return false;
    if (options.arrowParens === "avoid") {
      const { node } = path;
      return canPrintParamsWithoutParens(node);
    }
    return false;
  }
  function canPrintParamsWithoutParens(node) {
    return node.parametersNode.type === "identifier" && !node.comments?.some(({ leading, trailing }) => !leading && !trailing) && !node.parametersNode.comments;
  }
  function printMemberChain(path, print, options) {
    const isExpressionStatement = path.parent?.type === "expression_statement";
    const printedNodes = [];
    function shouldInsertEmptyLineAfter(node2) {
      const { originalText } = options;
      const nextCharIndex = getNextNonSpaceNonCommentCharacterIndex(originalText, node2.end.index);
      if ((nextCharIndex ? originalText.charAt(nextCharIndex) : "") === ")") return nextCharIndex !== false && isNextLineEmpty(originalText, nextCharIndex + 1);
      return isNextLineEmpty(originalText, node2.end.index);
    }
    function rec(path2) {
      const { node: node2 } = path2;
      if (hasType(path2, "method_invocation") && hasChild(path2, "objectNode")) {
        const hasTrailingEmptyLine = shouldInsertEmptyLineAfter(node2);
        printedNodes.unshift({
          node: node2,
          hasTrailingEmptyLine,
          printed: [printComments(path2, printMethodInvocation(path2, print)), hasTrailingEmptyLine ? hardline$3 : ""]
        });
        path2.call(rec, "objectNode");
      } else if (hasType(path2, "array_access")) {
        printedNodes.unshift({
          node: node2,
          printed: printComments(path2, printArrayAccess(path2, print))
        });
        path2.call(rec, "arrayNode");
      } else if (hasType(path2, "field_access")) {
        printedNodes.unshift({
          node: node2,
          printed: printComments(path2, printFieldAccess(path2, print))
        });
        path2.call(rec, "objectNode");
      } else printedNodes.unshift({
        node: node2,
        printed: print(path2)
      });
    }
    const { node } = path;
    if (hasType(path, "method_invocation")) {
      printedNodes.unshift({
        node,
        printed: printComments(path, printMethodInvocation(path, print))
      });
      if (hasChild(path, "objectNode")) path.call(rec, "objectNode");
    } else if (hasType(path, "array_access")) {
      printedNodes.unshift({
        node,
        printed: printComments(path, printArrayAccess(path, print))
      });
      if (hasChild(path, "arrayNode")) path.call(rec, "arrayNode");
    } else if (hasType(path, "field_access")) {
      printedNodes.unshift({
        node,
        printed: printComments(path, printFieldAccess(path, print))
      });
      if (hasChild(path, "objectNode")) path.call(rec, "objectNode");
    }
    const danglingComments = printDanglingComments(path);
    if (danglingComments) printedNodes[0].printed = [
      danglingComments,
      hardline$3,
      printedNodes[0].printed
    ];
    const groups = [];
    let currentGroup = [printedNodes[0]];
    let i2 = 1;
    for (; i2 < printedNodes.length; ++i2) if (printedNodes[i2].node.type === "array_access") currentGroup.push(printedNodes[i2]);
    else break;
    if (printedNodes[0].node.type !== "method_invocation") for (; i2 + 1 < printedNodes.length; ++i2) if (printedNodes[i2].node.type !== "method_invocation") currentGroup.push(printedNodes[i2]);
    else break;
    groups.push(currentGroup);
    currentGroup = [];
    let hasSeenMethodInvocation = false;
    for (; i2 < printedNodes.length; ++i2) {
      if (hasSeenMethodInvocation) {
        if (printedNodes[i2].node.type === "array_access") {
          currentGroup.push(printedNodes[i2]);
          continue;
        }
        groups.push(currentGroup);
        currentGroup = [];
        hasSeenMethodInvocation = false;
      }
      if (printedNodes[i2].node.type === "method_invocation") hasSeenMethodInvocation = true;
      currentGroup.push(printedNodes[i2]);
      if (printedNodes[i2].node.comments?.some(({ trailing }) => trailing)) {
        groups.push(currentGroup);
        currentGroup = [];
        hasSeenMethodInvocation = false;
      }
    }
    if (currentGroup.length > 0) groups.push(currentGroup);
    function isFactory(name2) {
      return /^[A-Z]|^[$_]+$/.test(name2);
    }
    function isShort(name2) {
      return name2.length <= options.tabWidth;
    }
    function shouldNotWrap(groups2) {
      const hasArrayAccess = groups2[1][0]?.node.type === "array_access";
      if (groups2[0].length === 1) {
        const firstNode = groups2[0][0].node;
        return firstNode.type === "this" || firstNode.type === "identifier" && (isFactory(firstNode.value) || isExpressionStatement && isShort(firstNode.value) || hasArrayAccess);
      }
      const lastNode = groups2[0].at(-1).node;
      return lastNode.type === "field_access" && lastNode.fieldNode.type === "identifier" && (isFactory(lastNode.fieldNode.value) || hasArrayAccess);
    }
    const shouldMerge = groups.length >= 2 && !groups[1][0].node.comments?.length && shouldNotWrap(groups);
    function printGroup(printedGroup) {
      return printedGroup.map((tuple) => tuple.printed);
    }
    function printIndentedGroup(groups2) {
      if (groups2.length === 0) return "";
      return indent$4([hardline$3, join$4(hardline$3, groups2.map(printGroup))]);
    }
    const printedGroups = groups.map(printGroup);
    const oneLine = printedGroups;
    const cutoff = shouldMerge ? 3 : 2;
    const flatGroups = groups.flat();
    const nodeHasComment = flatGroups.some((node2) => node2.node.comments?.some(({ leading }) => leading)) || flatGroups.slice(0, -1).some((node2) => node2.node.comments?.some(({ trailing }) => trailing));
    if (groups.length <= cutoff && !nodeHasComment && !groups.some((g2) => g2.at(-1).hasTrailingEmptyLine)) return group$4(oneLine);
    const lastNodeBeforeIndent = groups[shouldMerge ? 1 : 0].at(-1).node;
    const shouldHaveEmptyLineBeforeIndent = lastNodeBeforeIndent.type !== "method_invocation" && shouldInsertEmptyLineAfter(lastNodeBeforeIndent);
    const expanded = [
      printGroup(groups[0]),
      shouldMerge ? groups.slice(1, 2).map(printGroup) : "",
      shouldHaveEmptyLineBeforeIndent ? hardline$3 : "",
      printIndentedGroup(groups.slice(shouldMerge ? 2 : 1))
    ];
    const methodInvocations = printedNodes.map(({ node: node2 }) => node2).filter((node2) => node2.type === "method_invocation");
    function lastGroupWillBreakAndOtherCallsHaveFunctionArguments() {
      const lastGroupNode = groups.at(-1).at(-1).node;
      const lastGroupDoc = printedGroups.at(-1);
      return lastGroupNode.type === "method_invocation" && willBreak2(lastGroupDoc) && methodInvocations.slice(0, -1).some((node2) => node2.argumentsNode.namedChildren.some(({ type }) => type === "lambda_expression"));
    }
    let result;
    if (nodeHasComment || methodInvocations.length > 2 && methodInvocations.some((inv) => !inv.argumentsNode.namedChildren.every((arg) => isSimpleCallArgument(arg))) || printedGroups.slice(0, -1).some(willBreak2) || lastGroupWillBreakAndOtherCallsHaveFunctionArguments()) result = group$4(expanded);
    else result = [willBreak2(oneLine) || shouldHaveEmptyLineBeforeIndent ? breakParent$1 : "", conditionalGroup2([oneLine, expanded])];
    return result;
  }
  function printMethodInvocation(path, print) {
    const parts2 = [];
    if (hasChild(path, "objectNode")) parts2.push(".");
    if (path.node.children.filter(({ type }) => type === ".").length === 2) parts2.push("super", ".");
    if (hasChild(path, "type_argumentsNode")) parts2.push(path.call(print, "type_argumentsNode"));
    parts2.push(path.call(print, "nameNode"), path.call(print, "argumentsNode"));
    return parts2;
  }
  function printArrayAccess(path, print) {
    const index = path.call(print, "indexNode");
    return path.node.indexNode.type === "decimal_integer_literal" ? [
      "[",
      index,
      "]"
    ] : group$4([
      "[",
      indent$4([softline$1, index]),
      softline$1,
      "]"
    ]);
  }
  function printFieldAccess(path, print) {
    const parts2 = ["."];
    if (path.node.children.filter(({ type }) => type === ".").length === 2) parts2.push("super.");
    parts2.push(path.call(print, "fieldNode"));
    return parts2;
  }
  function printBinaryExpressions(path, print, options, isInsideParentheses) {
    if (!hasType(path, "binary_expression")) return [group$4(print(path))];
    const { node } = path;
    let parts2 = [];
    if (node.leftNode.type === "binary_expression" && shouldFlatten(node.operatorNode.type, node.leftNode.operatorNode.type)) parts2 = path.call(() => printBinaryExpressions(path, print, options, isInsideParentheses), "leftNode");
    else parts2.push(group$4(path.call(print, "leftNode")));
    const operator = node.operatorNode.type;
    const operatorDoc = path.call(print, "operatorNode");
    const rightContent = path.call(print, "rightNode");
    let right = options.experimentalOperatorPosition === "start" ? [
      line$4,
      operatorDoc,
      " ",
      rightContent
    ] : [
      " ",
      operatorDoc,
      line$4,
      rightContent
    ];
    const { parent } = path;
    const shouldBreak = node.leftNode.comments?.some(({ trailing, type }) => trailing && type === "line_comment") ?? false;
    if (shouldBreak || !(isInsideParentheses && logicalOperators.has(operator)) && (parent?.type !== node.type || logicalOperators.has(parent.operatorNode.value) !== logicalOperators.has(operator)) && node.leftNode.type !== node.type && node.rightNode.type !== node.type) right = group$4(right, { shouldBreak });
    parts2.push(right);
    return parts2;
  }
  var logicalOperators = /* @__PURE__ */ new Set(["||", "&&"]);
  function isSimpleCallArgument(node, depth = 2) {
    if (depth <= 0) return false;
    const isChildSimple = (child) => isSimpleCallArgument(child, depth - 1);
    if (isLiteral(node) || isSingleWordType(node) || node.type === "class_literal") return true;
    if (node.type === "object_creation_expression" || node.type === "method_invocation") {
      if (node.type === "object_creation_expression" || !node.objectNode || isSimpleCallArgument(node.objectNode, depth)) {
        const args2 = node.argumentsNode.namedChildren;
        return args2.length <= depth && args2.every(isChildSimple);
      }
      return false;
    }
    if (node.type === "array_access") return isSimpleCallArgument(node.arrayNode, depth) && isSimpleCallArgument(node.indexNode, depth);
    if (node.type === "field_access") return isSimpleCallArgument(node.objectNode, depth) && isSimpleCallArgument(node.fieldNode, depth);
    if (node.type === "unary_expression") return isSimpleCallArgument(node.operandNode, depth);
    if (node.type === "method_reference" || node.type === "update_expression") return isSimpleCallArgument(node.namedChildren[0], depth);
    return false;
  }
  function isLiteral(node) {
    return [
      "true",
      "false",
      "null_literal",
      "binary_integer_literal",
      "decimal_floating_point_literal",
      "decimal_integer_literal",
      "hex_floating_point_literal",
      "hex_integer_literal",
      "octal_integer_literal",
      "character_literal"
    ].includes(node.type) || isStringLiteral(node);
  }
  function isSingleWordType(node) {
    return [
      "identifier",
      "this",
      "super"
    ].includes(node.type);
  }
  function couldExpandArg(arg, lambdaChainRecursion = false) {
    if (arg.type === "array_creation_expression" && arg.valueNode && (arg.valueNode.namedChildren.length > 0 || arg.valueNode.comments)) return true;
    if (arg.type === "lambda_expression") {
      const { bodyNode: body2 } = arg;
      if (body2.type === "block" || body2.type === "array_creation_expression") return true;
      if (body2.type === "lambda_expression" && couldExpandArg(body2, true)) return true;
      if (!lambdaChainRecursion) {
        if (body2.type === "ternary_expression") return true;
        if (body2.type === "method_invocation" || body2.type === "object_creation_expression") return true;
      }
    }
    return false;
  }
  function shouldExpandLastArg(args2) {
    const lastArg = args2.at(-1);
    const penultimateArg = args2.at(-2);
    return !lastArg.comments?.some(({ leading }) => leading) && !lastArg.comments?.some(({ trailing }) => trailing) && couldExpandArg(lastArg) && (!penultimateArg || penultimateArg.type !== lastArg.type) && (args2.length !== 2 || penultimateArg.type !== "lambda_expression");
  }
  function shouldExpandFirstArg(args2) {
    if (args2.length !== 2) return false;
    const [firstArg, secondArg] = args2;
    return !firstArg.comments && firstArg.type === "lambda_expression" && firstArg.bodyNode.type === "block" && secondArg.type !== "lambda_expression" && secondArg.type !== "ternary_expression" && isHopefullyShortCallArgument(secondArg) && !couldExpandArg(secondArg);
  }
  function isHopefullyShortCallArgument(node) {
    if ((node.type === "method_invocation" || node.type === "object_creation_expression") && node.argumentsNode.namedChildren.length > 1) return false;
    if (node.type === "binary_expression") return isSimpleCallArgument(node.leftNode, 1) && isSimpleCallArgument(node.rightNode, 1);
    return isSimpleCallArgument(node);
  }
  function printTernaryTest(path, print) {
    const { node, parent } = path;
    const printed = path.call(print, "conditionNode");
    if (parent?.type === node.type && parent.alternativeNode === node) return align2(2, printed);
    return printed;
  }
  function getExpressionChild(node) {
    switch (node.type) {
      case "assignment_expression":
        return node.rightNode;
      case "variable_declarator":
        return node.valueNode;
      case "unary_expression":
        return node.operandNode;
      case "return_statement":
      case "throw_statement":
      case "yield_statement":
        return node.namedChildren[0];
      default:
        return null;
    }
  }
  function shouldExtraIndentForTernaryExpression(path) {
    const { node } = path;
    let parent;
    let child = node;
    for (let ancestorCount = 0; !parent; ancestorCount++) {
      const node2 = path.getParentNode(ancestorCount);
      if (node2.type === "array_access" && node2.arrayNode === child || (node2.type === "explicit_constructor_invocation" || node2.type === "field_access" || node2.type === "method_invocation") && node2.objectNode === child || node2.type === "method_reference" || node2.type === "object_creation_expression") {
        child = node2;
        continue;
      }
      if (node2.type === "cast_expression" && node2.valueNode === child) {
        parent = path.getParentNode(ancestorCount + 1);
        child = node2;
      } else parent = node2;
    }
    if (child === node) return false;
    return getExpressionChild(parent) === child;
  }
  function isStringLiteral(node) {
    return node.type === "string_literal" && node.children[0].value === '"';
  }
  var ArgExpansionBailout = class extends Error {
    constructor(..._args) {
      super(..._args);
      this.name = "ArgExpansionBailout";
    }
  };
  var { group: group$3, indent: indent$3, join: join$3, line: line$3 } = builders;
  var interfaces_default = {
    interface_declaration(path, print) {
      const parts2 = ["interface ", path.call(print, "nameNode")];
      const extendsInterfacesIndex = path.node.namedChildren.findIndex(({ type }) => type === "extends_interfaces");
      const hasExtendsInterfaces = extendsInterfacesIndex !== -1;
      const hasPermits = hasChild(path, "permitsNode");
      const hasMultipleClauses = hasExtendsInterfaces && hasPermits;
      const hasTypeParameters = hasChild(path, "type_parametersNode");
      if (hasTypeParameters) {
        const typeParameters = path.call(print, "type_parametersNode");
        parts2.push(hasMultipleClauses ? group$3(indent$3(typeParameters)) : typeParameters);
      }
      if (hasExtendsInterfaces || hasPermits) {
        const separator = hasTypeParameters && !hasMultipleClauses ? " " : line$3;
        const clauses = [];
        if (hasExtendsInterfaces) clauses.push(separator, path.call(print, "namedChildren", extendsInterfacesIndex));
        if (hasPermits) clauses.push(separator, path.call(print, "permitsNode"));
        const hasBody = path.node.bodyNode.namedChildren.length > 0;
        const clauseGroup = [hasTypeParameters && !hasMultipleClauses ? clauses : indent$3(clauses), hasBody ? separator : " "];
        parts2.push(hasMultipleClauses ? clauseGroup : group$3(clauseGroup));
      } else parts2.push(" ");
      return [
        ...printModifiers(path, print, "declarationOnly"),
        group$3(parts2),
        path.call(print, "bodyNode")
      ];
    },
    extends_interfaces(path, print) {
      const typeListIndex = path.node.namedChildren.findIndex(({ type }) => type === "type_list");
      return group$3(["extends", indent$3([line$3, path.call(print, "namedChildren", typeListIndex)])]);
    },
    interface_body(path, print) {
      return printBlock(path, printBodyDeclarations(path, print));
    },
    constant_declaration: printVariableDeclaration,
    annotation_type_declaration(path, print) {
      const parts2 = printModifiers(path, print);
      parts2.push("@interface ", path.call(print, "nameNode"), " ", path.call(print, "bodyNode"));
      return parts2;
    },
    annotation_type_body(path, print) {
      return printBlock(path, printBodyDeclarations(path, print));
    },
    annotation_type_element_declaration(path, print) {
      const parts2 = printModifiers(path, print);
      parts2.push(path.call(print, "typeNode"), " ", path.call(print, "nameNode"), "()");
      if (hasChild(path, "dimensionsNode")) parts2.push(path.call(print, "dimensionsNode"));
      if (hasChild(path, "valueNode")) parts2.push(" default ", path.call(print, "valueNode"));
      parts2.push(";");
      return parts2;
    },
    annotation(path, print) {
      return [
        "@",
        path.call(print, "nameNode"),
        path.call(print, "argumentsNode")
      ];
    },
    marker_annotation(path, print) {
      return ["@", path.call(print, "nameNode")];
    },
    annotation_argument_list(path, print) {
      const args2 = path.map(print, "namedChildren");
      return args2.length === 1 && path.node.namedChildren[0].type === "element_value_array_initializer" ? [
        "(",
        args2[0],
        ")"
      ] : group$3(indentInParentheses(join$3([",", line$3], args2)));
    },
    element_value_pair(path, print) {
      return group$3([
        path.call(print, "keyNode"),
        " = ",
        path.call(print, "valueNode")
      ]);
    },
    element_value_array_initializer: printArrayInitializer
  };
  var { group: group$2, hardline: hardline$2, indent: indent$2, join: join$2, softline: softline2 } = builders;
  var lexical_structure_default = {
    string_literal(path, print) {
      if (path.node.namedChildren.some(({ type }) => type === "string_interpolation") || path.node.children[0].value === '"') return path.map(print, "children");
      return printTextBlock(path, join$2(hardline$2, textBlockContents(path.node).split("\n")));
    },
    string_fragment: printValue,
    multiline_string_fragment: printValue,
    string_interpolation(path, print) {
      const expressionType = path.node.namedChildren[0].type;
      const expression = path.call(print, "namedChildren", 0);
      return expressionType === "binary_expression" || expressionType === "ternary_expression" ? group$2([
        "\\{",
        indent$2([softline2, expression]),
        softline2,
        "}"
      ]) : [
        "\\{",
        expression,
        "}"
      ];
    },
    escape_sequence: printValue,
    character_literal: printValue,
    binary_integer_literal: printValue,
    decimal_integer_literal: printValue,
    hex_integer_literal: printValue,
    octal_integer_literal: printValue,
    decimal_floating_point_literal: printValue,
    hex_floating_point_literal: printValue,
    null_literal: printValue,
    true: printValue,
    false: printValue,
    this: printValue,
    super: printValue,
    underscore_pattern: printValue,
    asterisk: printValue
  };
  var names_default = {
    identifier: printValue,
    type_identifier: printValue,
    scoped_identifier(path, print) {
      return [
        path.call(print, "scopeNode"),
        ".",
        path.call(print, "nameNode")
      ];
    },
    scoped_type_identifier(path, print) {
      return path.map((child) => child.node.type === "annotation" || child.node.type === "marker_annotation" ? [print(child), " "] : print(child), "children");
    }
  };
  var { group: group$1, hardline: hardline$1, indent: indent$1, join: join$1, line: line$2 } = builders;
  var packages_and_modules_default = {
    program(path, print) {
      if (!path.node.namedChildren.length) return [printDanglingComments(path), hardline$1];
      const parts2 = [];
      if (path.node.namedChildren[0].type !== "import_declaration") parts2.push(path.call(print, "namedChildren", 0));
      const staticImports = [];
      const imports = [];
      const otherDeclarations = [];
      path.each((child) => {
        const doc = print(child);
        if (child.node.type === "import_declaration") {
          const names = extractNames(child.node.namedChildren[0]);
          if (child.node.namedChildren.some(({ type }) => type === "asterisk")) names.push("*");
          (child.node.children[1].type === "static" ? staticImports : imports).push({
            doc,
            names
          });
        } else if (!child.isFirst) otherDeclarations.push(doc);
      }, "namedChildren");
      parts2.push(...[staticImports, imports].filter((imports2) => imports2.length).map((imports2) => join$1(hardline$1, imports2.sort(compareFqn).map(({ doc }) => doc))), ...otherDeclarations);
      return [...join$1([hardline$1, hardline$1], parts2), hardline$1];
    },
    package_declaration(path, print) {
      const annotations = [];
      const identifier = [];
      path.each((child) => {
        switch (child.node.type) {
          case "annotation":
          case "marker_annotation":
            annotations.push(print(child));
            break;
          case "identifier":
          case "scoped_identifier":
            identifier.push(print(child));
            break;
        }
      }, "namedChildren");
      return join$1(hardline$1, [...annotations, [
        "package ",
        ...identifier,
        ";"
      ]]);
    },
    import_declaration(path, print) {
      const declaration = ["import "];
      if (path.node.children.some(({ type }) => type === "static")) declaration.push("static ");
      const identifierIndex = path.node.namedChildren.findIndex(({ type }) => type === "identifier" || type === "scoped_identifier");
      declaration.push(path.call(print, "namedChildren", identifierIndex));
      if (path.node.namedChildren.some(({ type }) => type === "asterisk")) declaration.push(".*");
      declaration.push(";");
      return declaration;
    },
    module_declaration(path, print) {
      const parts2 = [];
      path.each((child) => {
        if (child.node.type === "annotation" || child.node.type === "marker_annotation") parts2.push(print(child));
      }, "namedChildren");
      if (path.node.children.some(({ type }) => type === "open")) parts2.push("open");
      parts2.push("module", path.call(print, "nameNode"), path.call(print, "bodyNode"));
      return join$1(" ", parts2);
    },
    module_body(path, print) {
      return printBlock(path, path.map((child) => child.previous && child.node.start.row > child.previous.end.row + 1 ? [hardline$1, print(child)] : print(child), "namedChildren"));
    },
    requires_module_directive(path, print) {
      const parts2 = ["requires"];
      path.each((child) => {
        if (child.node.type === "requires_modifier") parts2.push(print(child));
      }, "namedChildren");
      parts2.push(path.call(print, "moduleNode"));
      return [...join$1(" ", parts2), ";"];
    },
    exports_module_directive: printToModuleNamesDirective,
    opens_module_directive: printToModuleNamesDirective,
    uses_module_directive(path, print) {
      return [
        "uses ",
        path.call(print, "typeNode"),
        ";"
      ];
    },
    provides_module_directive(path, print) {
      const [provided, ...providers] = path.map(print, "namedChildren");
      return [
        "provides ",
        provided,
        group$1(indent$1([line$2, group$1(indent$1([
          "with",
          line$2,
          ...join$1([",", line$2], providers)
        ]))])),
        ";"
      ];
    },
    requires_modifier: printValue
  };
  function extractNames(node) {
    return node.type === "identifier" ? [node.value] : [...extractNames(node.scopeNode), node.nameNode.value];
  }
  function compareFqn({ names: a }, { names: b2 }) {
    const minParts = Math.min(a.length, b2.length);
    for (let i2 = 0; i2 < minParts; i2++) {
      const imageA = a[i2];
      const imageB = b2[i2];
      if (imageA < imageB) return -1;
      else if (imageA > imageB) return 1;
    }
    return a.length - b2.length;
  }
  function printToModuleNamesDirective(path, print) {
    const directive = [
      path.node.type === "exports_module_directive" ? "exports" : "opens",
      " ",
      path.call(print, "packageNode")
    ];
    if (path.node.modulesNodes.length) {
      const moduleNames = join$1([",", line$2], path.map(print, "modulesNodes"));
      directive.push(group$1(indent$1([line$2, group$1(indent$1([
        "to",
        line$2,
        ...moduleNames
      ]))])));
    }
    directive.push(";");
    return directive;
  }
  var { group: group2, indent: indent2, join: join2, line: line$1 } = builders;
  var types_values_and_variables_default = {
    boolean_type: printValue,
    integral_type: printValue,
    floating_point_type: printValue,
    void_type: printValue,
    array_type(path, print) {
      return [path.call(print, "elementNode"), path.call(print, "dimensionsNode")];
    },
    annotated_type(path, print) {
      return join2(" ", path.map(print, "children"));
    },
    dimensions(path, print) {
      return path.map((child) => {
        if (child.node.isNamed) return [
          ...child.isFirst ? [" "] : [],
          print(child),
          " "
        ];
        return child.node.value;
      }, "children");
    },
    type_parameter(path, print) {
      return join2(" ", path.map(print, "children"));
    },
    type_bound(path, print) {
      const [firstType, ...restTypes] = path.map(print, "namedChildren");
      const bound = ["extends ", firstType];
      if (restTypes.length) bound.push(group2(indent2([
        line$1,
        "& ",
        ...join2([line$1, "& "], restTypes)
      ])));
      return bound;
    },
    type_arguments: printTypeParameters,
    wildcard(path, print) {
      return join2(" ", path.map(print, "children"));
    }
  };
  var printersByNodeType = {
    ERROR(path) {
      throw new Error(`Failed to parse: "${printValue(path)}"`);
    },
    ...arrays_default,
    ...blocks_and_statements_default,
    ...classes_default,
    ...expressions_default,
    ...interfaces_default,
    ...lexical_structure_default,
    ...names_default,
    ...packages_and_modules_default,
    ...types_values_and_variables_default
  };
  function printerForNodeType(type) {
    return printersByNodeType[type];
  }
  var printer_default = {
    print(path, options, print, args2) {
      if (!hasNamedNode(path)) return printValue(path);
      const doc = printerForNodeType(path.node.type)(path, print, options, args2);
      return needsParentheses(path) ? [
        "(",
        doc,
        ")"
      ] : doc;
    },
    embed(path) {
      return hasType(path, "string_literal") ? embedTextBlock(path) : null;
    },
    hasPrettierIgnore(path) {
      return path.node.comments?.some(isPrettierIgnore) === true || canAttachComment(path.node, path.parent ? [path.parent] : []) && isFullyBetweenPrettierIgnore(path);
    },
    canAttachComment,
    isBlockComment(node) {
      return node.type === "block_comment";
    },
    willPrintOwnComments,
    printComment(commentPath) {
      return printComment(commentPath.node);
    },
    getCommentChildNodes(node) {
      return node.isNamed ? node.children : [];
    },
    handleComments: {
      ownLine: handleLineComment,
      endOfLine: handleLineComment,
      remaining: handleRemainingComment
    },
    getVisitorKeys() {
      return ["namedChildren"];
    }
  };
  function hasNamedNode(path) {
    return path.node.isNamed;
  }
  var { hasNewline, isPreviousLineEmpty, skipNewline, skipSpaces } = fr;
  var { breakParent: breakParent2, hardline: hardline2, line: line2, lineSuffix: lineSuffix2 } = builders;
  var prettierIgnoreRangesByTree = /* @__PURE__ */ new WeakMap();
  function determinePrettierIgnoreRanges(tree) {
    const { comments } = tree;
    if (!comments) return;
    const ranges = comments.filter(({ value }) => /^\/(?:\/\s*(?:prettier-ignore-(?:start|end)|@formatter:(?:off|on))\s*|\*\s*(?:prettier-ignore-(?:start|end)|@formatter:(?:off|on))\s*\*\/)$/.test(value)).reduce((ranges2, { value, start: start2 }) => {
      const previous = ranges2.at(-1);
      if (value.includes("start") || value.includes("off")) {
        if (previous?.end !== Infinity) ranges2.push({
          start: start2.index,
          end: Infinity
        });
      } else if (previous?.end === Infinity) previous.end = start2.index;
      return ranges2;
    }, new Array());
    prettierIgnoreRangesByTree.set(tree, ranges);
  }
  function isFullyBetweenPrettierIgnore(path) {
    const { node, root } = path;
    const start2 = parser_default.locStart(node);
    const end = parser_default.locEnd(node);
    return prettierIgnoreRangesByTree.get(root)?.some((range) => range.start < start2 && end < range.end) === true;
  }
  function isPrettierIgnore(comment) {
    return /^(\/\/\s*prettier-ignore|\/\*\s*prettier-ignore\s*\*\/)$/.test(comment.value);
  }
  function willPrintOwnComments(path) {
    return isMember(path.node) && !printer_default.hasPrettierIgnore(path);
  }
  function canAttachComment(node, ancestors) {
    if (!node.isNamed) return isBinaryOperator(node);
    switch (node.type) {
      case "enum_body_declarations":
      case "escape_sequence":
      case "modifier":
      case "multiline_string_fragment":
      case "program":
      case "string_fragment":
      case "visibility":
        return false;
      case "parenthesized_expression": {
        const [parent] = ancestors;
        return !(parent.isNamed && [
          "do_statement",
          "if_statement",
          "switch_expression",
          "synchronized_statement",
          "try_statement",
          "try_with_resources_statement",
          "while_statement"
        ].includes(parent.type));
      }
      default:
        return true;
    }
  }
  function handleLineComment(commentNode, _, options) {
    return [
      handleBinaryExpressionComments,
      handleFormalParametersComments,
      handleFqnOrRefTypeComments,
      handleIfStatementComments,
      handleJumpStatementComments,
      handleLabeledStatementComments,
      handleLambdaExpressionComments,
      handleMemberChainComments,
      handleModifiersComments,
      handleNameComments,
      handleTernaryExpressionComments,
      handleTryStatementComments
    ].some((fn2) => fn2(commentNode, options));
  }
  function handleRemainingComment(commentNode) {
    return [
      handleFqnOrRefTypeComments,
      handleNameComments,
      handleJumpStatementComments
    ].some((fn2) => fn2(commentNode));
  }
  function handleBinaryExpressionComments(commentNode, options) {
    const { enclosingNode, precedingNode, followingNode } = commentNode;
    if (enclosingNode?.type === "binary_expression") {
      if (isBinaryOperator(followingNode)) {
        if (options.experimentalOperatorPosition === "start") fr.addLeadingComment(followingNode, commentNode);
        else fr.addTrailingComment(followingNode, commentNode);
        return true;
      } else if (options.experimentalOperatorPosition === "start" && isBinaryOperator(precedingNode)) {
        fr.addLeadingComment(precedingNode, commentNode);
        return true;
      }
    }
    return false;
  }
  function handleFormalParametersComments(commentNode) {
    const { enclosingNode, precedingNode, followingNode } = commentNode;
    if (enclosingNode?.type === "formal_parameters" && !precedingNode && !followingNode) {
      fr.addDanglingComment(enclosingNode, commentNode, void 0);
      return true;
    }
    return false;
  }
  function handleFqnOrRefTypeComments(commentNode) {
    const { enclosingNode, followingNode } = commentNode;
    if (enclosingNode?.type === "scoped_type_identifier" && followingNode) {
      fr.addLeadingComment(followingNode, commentNode);
      return true;
    }
    return false;
  }
  function handleIfStatementComments(commentNode) {
    const { enclosingNode, precedingNode } = commentNode;
    if (enclosingNode?.type === "if_statement" && precedingNode?.fieldName === "consequence") {
      fr.addDanglingComment(enclosingNode, commentNode, void 0);
      return true;
    }
    return false;
  }
  function handleJumpStatementComments(commentNode) {
    const { enclosingNode, precedingNode, followingNode } = commentNode;
    if (enclosingNode && !precedingNode && !followingNode && (enclosingNode.type === "break_statement" || enclosingNode.type === "continue_statement" || enclosingNode.type === "return_statement")) {
      fr.addTrailingComment(enclosingNode, commentNode);
      return true;
    }
    return false;
  }
  function handleLabeledStatementComments(commentNode) {
    const { enclosingNode, precedingNode } = commentNode;
    if (enclosingNode?.type === "labeled_statement" && precedingNode?.type === "identifier") {
      fr.addLeadingComment(precedingNode, commentNode);
      return true;
    }
    return false;
  }
  function handleLambdaExpressionComments(commentNode) {
    const { enclosingNode, precedingNode, followingNode } = commentNode;
    if (enclosingNode?.type === "lambda_expression" && precedingNode && followingNode && enclosingNode.children.find(({ type }) => type === "->").end.index < commentNode.start.index) {
      if (followingNode.type === "block") if (followingNode.namedChildren.length) fr.addLeadingComment(followingNode.namedChildren[0], commentNode);
      else fr.addDanglingComment(followingNode, commentNode, void 0);
      else fr.addLeadingComment(followingNode, commentNode);
      return true;
    }
  }
  function handleMemberChainComments(commentNode) {
    const { enclosingNode, precedingNode, followingNode } = commentNode;
    if (precedingNode && (enclosingNode?.type === "field_access" || enclosingNode?.type === "method_invocation" && precedingNode.end.row < commentNode.start.row) && precedingNode === enclosingNode.objectNode) {
      fr.addLeadingComment(enclosingNode, commentNode);
      return true;
    } else if (isMember(followingNode) && (!precedingNode || precedingNode !== getMemberObject(followingNode) && precedingNode.end.row < commentNode.start.row) && !isPrettierIgnore(commentNode)) {
      fr.addDanglingComment(followingNode, commentNode, void 0);
      return true;
    }
    return false;
  }
  function handleModifiersComments(commentNode) {
    const { precedingNode } = commentNode;
    if (precedingNode?.type === "annotation" || precedingNode?.type === "marker_annotation" || precedingNode?.type === "modifiers") {
      fr.addTrailingComment(precedingNode, commentNode);
      return true;
    }
    return false;
  }
  function handleNameComments(commentNode) {
    const { enclosingNode, precedingNode } = commentNode;
    if (enclosingNode && precedingNode?.type === "identifier" && (enclosingNode.type === "scoped_identifier" || enclosingNode.type === "module_declaration" || enclosingNode.type === "package_declaration" || enclosingNode.type === "scoped_type_identifier")) {
      fr.addTrailingComment(precedingNode, commentNode);
      return true;
    }
    return false;
  }
  function handleTernaryExpressionComments(commentNode) {
    const { enclosingNode, precedingNode, followingNode } = commentNode;
    if (enclosingNode?.type === "ternary_expression" && precedingNode?.isNamed && followingNode?.isNamed && precedingNode.end.row < commentNode.start.row && commentNode.end.row < followingNode.start.row) {
      fr.addLeadingComment(followingNode, commentNode);
      return true;
    }
    return false;
  }
  function handleTryStatementComments(commentNode) {
    const { enclosingNode, followingNode } = commentNode;
    if (enclosingNode && (enclosingNode.type === "catch_clause" || enclosingNode.type === "try_statement" || enclosingNode.type === "try_with_resources_statement") && followingNode?.isNamed) {
      const block = followingNode.type === "catch_clause" ? followingNode.bodyNode : followingNode.type === "finally_clause" ? followingNode.namedChildren[0] : null;
      if (!block) return false;
      const blockStatement = block.namedChildren.at(0);
      if (blockStatement) fr.addLeadingComment(blockStatement, commentNode);
      else fr.addDanglingComment(block, commentNode, void 0);
      return true;
    }
    return false;
  }
  function getMemberObject(node) {
    return node.type === "array_access" ? node.arrayNode : node.objectNode;
  }
  var binaryOperators = /* @__PURE__ */ new Set([
    "<<",
    ">>",
    ">>>",
    "instanceof",
    "<=",
    ">=",
    "==",
    "-",
    "+",
    "&&",
    "&",
    "^",
    "!=",
    "||",
    "|",
    "*",
    "/",
    "%"
  ]);
  function isBinaryOperator(node) {
    return node !== void 0 && binaryOperators.has(node.type);
  }
  function printLeadingComment(path) {
    const comment = path.node;
    const parts2 = [printComment(comment)];
    const originalText = path.root.value;
    if (comment.type === "block_comment") {
      let lineBreak = " ";
      if (hasNewline(originalText, parser_default.locEnd(comment))) if (hasNewline(originalText, parser_default.locStart(comment), { backwards: true })) lineBreak = hardline2;
      else lineBreak = line2;
      parts2.push(lineBreak);
    } else parts2.push(hardline2);
    const index = skipNewline(originalText, skipSpaces(originalText, parser_default.locEnd(comment)));
    if (index !== false && hasNewline(originalText, index)) parts2.push(hardline2);
    return parts2;
  }
  function printTrailingComment(path, previousComment) {
    const comment = path.node;
    const printed = printComment(comment);
    const originalText = path.root.value;
    const isBlock = comment.type === "block_comment";
    if (previousComment?.hasLineSuffix && !previousComment?.isBlock || hasNewline(originalText, parser_default.locStart(comment), { backwards: true })) return {
      doc: lineSuffix2([
        hardline2,
        isPreviousLineEmpty(originalText, parser_default.locStart(comment)) ? hardline2 : "",
        printed
      ]),
      isBlock,
      hasLineSuffix: true
    };
    if (!isBlock || previousComment?.hasLineSuffix) return {
      doc: [lineSuffix2([" ", printed]), breakParent2],
      isBlock,
      hasLineSuffix: true
    };
    return {
      doc: [" ", printed],
      isBlock,
      hasLineSuffix: false
    };
  }
  function printLeadingComments(path) {
    if (!hasChild(path, "comments")) return [];
    const docs = [];
    path.each((path2) => {
      const { node: comment } = path2;
      if (!comment.leading) return;
      docs.push(printLeadingComment(path2));
    }, "comments");
    return docs;
  }
  function printTrailingComments(path) {
    if (!hasChild(path, "comments")) return [];
    const docs = [];
    let printedTrailingComment;
    path.each((path2) => {
      const { node: comment } = path2;
      if (!comment.trailing) return;
      printedTrailingComment = printTrailingComment(path2, printedTrailingComment);
      docs.push(printedTrailingComment.doc);
    }, "comments");
    return docs;
  }
  function printCommentsSeparately(path) {
    return {
      leading: printLeadingComments(path),
      trailing: printTrailingComments(path)
    };
  }
  function printComments(path, doc) {
    const leading = printLeadingComments(path);
    const trailing = printTrailingComments(path);
    return leading.length || trailing.length ? [
      leading,
      doc,
      trailing
    ] : doc;
  }
  var parser_default = {
    async parse(text) {
      const tree = (await parser).parse(text);
      const { rootNode } = tree;
      if (rootNode.hasError) throw new Error("Failed to parse: " + rootNode);
      const ast = processTree(rootNode);
      determinePrettierIgnoreRanges(ast);
      tree.delete();
      return ast;
    },
    astFormat: "java",
    hasPragma(text) {
      return /^\/\*\*\n\s+\*\s@(format|prettier)\n\s+\*\//.test(text);
    },
    locStart(node) {
      return node.start.index;
    },
    locEnd(node) {
      return node.end.index;
    }
  };
  var parser = (async () => {
    await Parser.init();
    const parser2 = new Parser();
    const Java = await Language.load(new URL("./tree-sitter-java_orchard.wasm", import_meta2.url));
    parser2.setLanguage(Java);
    return parser2;
  })();
  var isParenthesizedParent = createTypeCheckFunction([
    "do_statement",
    "if_statement",
    "switch_expression",
    "synchronized_statement",
    "try_statement",
    "try_with_resources_statement",
    "while_statement"
  ]);
  function processTree(node, fieldName = null, comments) {
    const { type, isNamed, text: value, startPosition, endPosition } = node;
    const javaNode = {
      type,
      isNamed,
      value,
      start: {
        index: node.startIndex,
        row: startPosition.row,
        column: startPosition.column
      },
      end: {
        index: node.endIndex,
        row: endPosition.row,
        column: endPosition.column
      },
      children: [],
      namedChildren: [],
      fieldName
    };
    if (!comments) comments = javaNode.comments = [];
    if (!javaNode.isNamed) return javaNode;
    const multiFields = multiFieldsByType[node.type];
    if (multiFields) Object.keys(multiFields).forEach((name2) => javaNode[`${name2}Nodes`] = []);
    node.children.forEach((child, index) => {
      const fieldName2 = node.fieldNameForChild(index);
      (child.type === "parenthesized_expression" && !isParenthesizedParent(javaNode) ? child.namedChildren : [child]).forEach((child2) => {
        const { type: type2, text: value2, startPosition: startPosition2, endPosition: endPosition2 } = child2;
        if (type2 === "block_comment" || type2 === "line_comment") comments.push({
          type: type2,
          value: value2,
          start: {
            index: child2.startIndex,
            row: startPosition2.row,
            column: startPosition2.column
          },
          end: {
            index: child2.endIndex,
            row: endPosition2.row,
            column: endPosition2.column
          },
          leading: false,
          trailing: false,
          printed: false
        });
        else {
          const javaChild = processTree(child2, fieldName2, comments);
          javaNode.children.push(javaChild);
          if (javaChild.isNamed) javaNode.namedChildren.push(javaChild);
          if (fieldName2) if (multiFields?.[fieldName2]) javaNode[`${fieldName2}Nodes`].push(javaChild);
          else javaNode[`${fieldName2}Node`] = javaChild;
        }
      });
    });
    return javaNode;
  }
  var src_default = {
    languages: [{
      name: "Java",
      parsers: ["java"],
      group: "Java",
      tmScope: "source.java",
      aceMode: "java",
      codemirrorMode: "clike",
      codemirrorMimeType: "text/x-java",
      extensions: [".java"],
      linguistLanguageId: 181,
      vscodeLanguageIds: ["java"]
    }],
    parsers: { java: parser_default },
    printers: { java: printer_default },
    options: options_default,
    defaultOptions: { arrowParens: "avoid" }
  };

  // resources/js/editor/java-formatter-bundle-source.js
  function getDefaultPlugin(module2) {
    return module2 && module2.default ? module2.default : module2;
  }
  function getJavaFormatOptions() {
    return {
      parser: "java",
      plugins: [getDefaultPlugin(src_default)],
      printWidth: 100,
      tabWidth: 2,
      useTabs: false
    };
  }
  async function formatJavaCode(source) {
    const formatted = await Pu(String(source || ""), getJavaFormatOptions());
    return typeof formatted === "string" ? formatted : String(formatted || "");
  }
  async function formatJavaCodeWithCursor(source, cursorOffset) {
    return Ou(String(source || ""), {
      ...getJavaFormatOptions(),
      cursorOffset: Math.max(0, Number(cursorOffset) || 0)
    });
  }
  window.MarkdownViewerJavaFormatter = {
    formatJavaCode,
    formatJavaCodeWithCursor
  };
})();
