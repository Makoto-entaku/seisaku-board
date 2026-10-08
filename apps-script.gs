/**
 * 制作グループ 進行表 API
 * このスプレッドシートの「企画」「todo」タブを、閲覧サイト（GitHub Pages）から読み書きする。
 * ページごとの鍵を知っている人だけが、そのページの担当企画を読み書きできる。
 */
const SS = () => SpreadsheetApp.openById('1g6pWnew5dY_op5lE-LZc7w97hJ5c4-lrUdrfNhtRL-E');
// ページごとの鍵と担当は「設定」タブ（A:ページ B:鍵 C:担当、空欄は全企画）から読む
function pages_() {
  const v = SS().getSheetByName('設定').getDataRange().getDisplayValues().slice(1);
  const m = {};
  v.filter(r => r[0] && r[1]).forEach(r => m[r[0]] = { key: r[1], owner: r[2] || null });
  return m;
}
const P_SHEET = '企画', T_SHEET = 'todo';
const T_COLS = ['id', 'pid', 'text', 'done', 'due', 'pri', 'who', 'del', 'u'];

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function auth_(page, k) {
  const p = pages_()[page];
  if (!p || p.key !== k) throw new Error('auth');
  return p;
}
const bool_ = v => String(v).toUpperCase() === 'TRUE';

function projects_() {
  const v = SS().getSheetByName(P_SHEET).getDataRange().getDisplayValues().slice(1);
  return v.filter(r => r[0]).map(r => ({ id: r[0], no: r[1], name: r[2], owner: r[3], deadline: r[4], goal: r[5], doc: r[6], order: Number(r[7]) || 0 }));
}
function tasks_() {
  const v = SS().getSheetByName(T_SHEET).getDataRange().getDisplayValues().slice(1);
  return v.map((r, i) => ({ row: i + 2, id: r[0], pid: r[1], text: r[2], done: bool_(r[3]), due: r[4], pri: bool_(r[5]), who: r[6], del: bool_(r[7]), u: Number(r[8]) || 0 }))
          .filter(t => t.id);
}
function visible_(p) {
  return projects_().filter(x => !p.owner || x.owner === p.owner);
}

function doGet(e) {
  try {
    const p = auth_(e.parameter.page, e.parameter.k);
    const ps = visible_(p), ids = new Set(ps.map(x => x.id));
    const ts = tasks_().filter(t => ids.has(t.pid) && !t.del);
    ps.forEach(x => x.tasks = ts.filter(t => t.pid === x.id).map(({ row, pid, ...t }) => t));
    return out_({ ok: true, projects: ps, updated: new Date().toISOString() });
  } catch (err) {
    return out_({ ok: false, error: err.message === 'auth' ? 'auth' : 'server' });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const b = JSON.parse(e.postData.contents);
    const p = auth_(b.page, b.k);
    lock.waitLock(10000);
    const allowed = new Set(visible_(p).map(x => x.id));
    const sh = SS().getSheetByName(T_SHEET);
    const now = Date.now();
    if (b.op === 'add') {
      if (!allowed.has(b.pid)) throw new Error('auth');
      const text = String(b.text || '').trim().slice(0, 300);
      if (!text) throw new Error('empty');
      const id = 'w' + now.toString(36);
      sh.appendRow([id, b.pid, text, false, '', false, '', false, now]);
      sh.getRange(sh.getLastRow(), 5).setNumberFormat('@');
      return out_({ ok: true, id: id });
    }
    if (b.op === 'set') {
      const t = tasks_().find(x => x.id === b.id);
      if (!t || !allowed.has(t.pid)) throw new Error('auth');
      const f = b.fields || {};
      if ('done' in f) sh.getRange(t.row, 4).setValue(!!f.done);
      if ('due' in f) sh.getRange(t.row, 5).setNumberFormat('@').setValue(/^\d{4}-\d{2}-\d{2}$/.test(f.due) ? f.due : '');
      if ('pri' in f) sh.getRange(t.row, 6).setValue(!!f.pri);
      if ('del' in f) sh.getRange(t.row, 8).setValue(!!f.del);
      sh.getRange(t.row, 9).setValue(now);
      return out_({ ok: true });
    }
    throw new Error('op');
  } catch (err) {
    return out_({ ok: false, error: err.message === 'auth' ? 'auth' : 'server' });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}
