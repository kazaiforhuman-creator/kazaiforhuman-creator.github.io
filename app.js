// ページの中身はすべて data.json から描く。
// 編集はアドレスの末尾に #edit を付けて開き、GitHub のトークンで data.json を書き換える（リポジトリに書き込める人しか保存できない）
// トークンを保存したブラウザでは、上の帯に「編集」ボタンが出る（ほかの人には出ない）
const REPO = { owner: "kazaiforhuman-creator", name: "kazaiforhuman-creator.github.io", path: "data.json", branch: "main" };
const DRAFT_KEY = "ainote-draft";
const TOKEN_KEY = "ainote-gh-token";
const STATUS = [["live", "公開中", "Released"], ["wip", "製作中", "In progress"], ["idea", "構想", "Ideas"]];
const CATS = ["MUSIC", "WRITING", "DESIGN", "STUDY", "CODE", "VIDEO"];

let SAVED = null;
let state = null;
const ui = { editMode: location.hash === "#edit", editing: false, form: null, faqForm: null, confirmDel: null, msg: "", busy: false, draft: null, copied: "", loadError: false };

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = u => /^https:\/\/[^\s"'<>]+$/.test(u || "") ? u : "";
const safeIcon = u => /^data:image\/(svg\+xml|png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(u || "") ? u : "";
const safeMail = m => /^[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+$/.test(m || "") ? m : "";
const today = () => new Date().toLocaleDateString("sv-SE");
const dirty = () => JSON.stringify(state) !== JSON.stringify(SAVED);
const sortByPn = a => a.slice().sort((x, y) => x.pn.localeCompare(y.pn, "ja", { numeric: true }));
const nextPn = () => "AT-" + String(Math.max(0, ...state.tools.map(t => parseInt(String(t.pn).replace(/\D/g, ""), 10) || 0)) + 1).padStart(2, "0");
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};

function delActions(kind, id, label) {
  if (!ui.editing) return "";
  return ui.confirmDel === kind + ":" + id
    ? `<div class="card-actions"><span class="warn">「${esc(label)}」を削除しますか？</span><button type="button" class="btn primary" data-act="del-yes" data-kind="${kind}" data-id="${esc(id)}">削除する</button><button type="button" class="btn" data-act="del-no">やめる</button></div>`
    : `<div class="card-actions"><button type="button" class="btn" data-act="${kind}-edit" data-id="${esc(id)}">編集</button><button type="button" class="btn" data-act="del" data-kind="${kind}" data-id="${esc(id)}">削除</button></div>`;
}

function toolCard(t, solo) {
  const isIdea = t.status === "idea";
  const icon = safeIcon(t.icon), url = safeUrl(t.url), x = safeUrl(t.x);
  return `<article class="tool${solo ? " solo" : ""}${isIdea ? " idea" : ""}">
    <div class="tool-top"><span class="pn">${esc(t.pn)}</span>${t.cat ? `<span class="cat">${esc(t.cat)}</span>` : ""}</div>
    <div class="tool-name">${icon ? `<img src="${icon}" alt="">` : ""}<h3>${esc(t.name)}</h3></div>
    ${t.one ? `<p class="one">${esc(t.one)}</p>` : ""}
    ${(t.does || t.hand) ? `<dl>
      ${t.does ? `<dt>${isIdea ? "予定している機能" : "機能"}</dt><dd>${esc(t.does)}</dd>` : ""}
      ${t.hand ? `<dt>使う人が行うこと</dt><dd class="hand">${esc(t.hand)}</dd>` : ""}
    </dl>` : ""}
    ${(url || x) ? `<div class="links">
      ${url ? `<a href="${esc(url)}">ツールを開く →</a>` : ""}
      ${x ? `<a href="${esc(x)}" target="_blank" rel="noopener">X の投稿 ↗</a>` : ""}
    </div>` : ""}
    ${delActions("tool", t.id, t.name)}
  </article>`;
}

function toolFormHtml() {
  const f = ui.form, v = f.values;
  const t = f.id ? state.tools.find(o => o.id === f.id) : null;
  return `<form class="form" id="tool-form" novalidate>
    <h3>${t ? `「${esc(t.name)}」を編集` : "ツール・構想を追加"}</h3>
    <label>番号<input type="text" id="f-pn" value="${esc(v.pn)}"></label>
    <label>状態<select id="f-status">${STATUS.map(([k, l]) => `<option value="${k}"${v.status === k ? " selected" : ""}>${l}</option>`).join("")}</select></label>
    <label>名前（必須）<input type="text" id="f-name" value="${esc(v.name)}"></label>
    <label>分類<input type="text" id="f-cat" list="cat-list" value="${esc(v.cat)}"><datalist id="cat-list">${CATS.map(c => `<option value="${c}">`).join("")}</datalist></label>
    <label class="full">概要（1文）<textarea id="f-one">${esc(v.one)}</textarea></label>
    <label class="full">機能<textarea id="f-does">${esc(v.does)}</textarea></label>
    <label class="full">使う人が行うこと<textarea id="f-hand">${esc(v.hand)}</textarea></label>
    <label>ツールの URL（https://）<input type="url" id="f-url" value="${esc(v.url)}"></label>
    <label>X の投稿 URL（https://）<input type="url" id="f-x" value="${esc(v.x)}"></label>
    <label class="full">アイコン（SVG・PNG・JPEG・WebP、300KB まで）
      <span class="icon-now">${safeIcon(v.icon) ? `<img src="${safeIcon(v.icon)}" alt="">現在のアイコン <button type="button" class="btn" data-act="icon-clear">外す</button>` : "アイコンなし"}</span>
      <input type="file" id="f-icon" accept="image/svg+xml,image/png,image/jpeg,image/webp">
    </label>
    <div class="row-end"><button type="submit" class="btn primary">この内容で決定</button><button type="button" class="btn" data-act="form-cancel">やめる</button>${f.error ? `<span class="warn">${esc(f.error)}</span>` : ""}</div>
  </form>`;
}

function faqFormHtml() {
  const f = ui.faqForm;
  return `<form class="form" id="faq-form" novalidate>
    <h3>${f.id ? "質問を編集" : "質問を追加"}</h3>
    <label class="full">質問<input type="text" id="q-q" value="${esc(f.q)}"></label>
    <label class="full">回答<textarea id="q-a">${esc(f.a)}</textarea></label>
    <div class="row-end"><button type="submit" class="btn primary">この内容で決定</button><button type="button" class="btn" data-act="faq-cancel">やめる</button>${f.error ? `<span class="warn">${esc(f.error)}</span>` : ""}</div>
  </form>`;
}

function editPanel() {
  if (!ui.editMode) return "";
  if (!ui.editing) {
    const has = !!store.get(TOKEN_KEY);
    return `<div class="editbar" role="region" aria-label="編集">
      <span>編集するには、このリポジトリに書き込める GitHub のトークンが必要です。</span>
      <span class="actions">${has
        ? `<button type="button" class="btn primary" data-act="start">編集を始める</button><button type="button" class="btn" data-act="token-forget">保存したトークンを消す</button>`
        : `<input type="password" id="gh-token" autocomplete="off" placeholder="github_pat_..." aria-label="GitHub のトークン" style="font:inherit;padding:4px 8px;min-width:0;width:16em"><button type="button" class="btn primary" data-act="token-set">この端末に保存して編集</button>`}
      </span>
    </div>`;
  }
  return `<div class="editbar" role="region" aria-label="編集">
      <span>編集中${dirty() ? "：未保存の変更があります" : ""}</span>
      <span class="actions">
        <button type="button" class="btn primary" data-act="save"${!dirty() || ui.busy ? " disabled" : ""}>保存して公開</button>
        <button type="button" class="btn" data-act="discard"${!dirty() || ui.busy ? " disabled" : ""}>変更を破棄</button>
        <button type="button" class="btn" data-act="stop">編集を終える</button>
      </span>
    </div>`;
}

function render() {
  const app = document.getElementById("app");
  if (!state) {
    app.innerHTML = `<div class="bar"><span>AI NO TE</span></div>
      <header class="hero"><h1><span class="ai">AI</span><span class="te">の<em>手</em></span></h1><div class="underline" aria-hidden="true"></div>
      <p class="catch">AIを人の「<em>合いの手</em>」に</p>
      <p class="about">${ui.loadError ? "内容を読み込めませんでした。時間をおいて、ページを開き直してください。" : "読み込んでいます。"}</p></header>`;
    return;
  }
  const counts = Object.fromEntries(STATUS.map(([k]) => [k, state.tools.filter(t => t.status === k).length]));
  const groups = STATUS.map(([k, label, en]) => {
    const list = sortByPn(state.tools.filter(t => t.status === k));
    if (!list.length) return "";
    return `<div class="group"><p class="group-head"><b>${label}</b>${en} · ${list.length}</p>
      <div class="tools">${list.map(t => toolCard(t, list.length === 1)).join("")}</div></div>`;
  }).join("");
  const mail = safeMail(state.contact);
  const draftNote = ui.draft && ui.editMode && !ui.editing ? `<div class="editbar"><span>保存されていない編集内容が残っています。</span><span class="actions"><button type="button" class="btn primary" data-act="draft-restore">復元して編集</button><button type="button" class="btn" data-act="draft-drop">破棄</button></span></div>` : "";

  app.innerHTML = `
  <div class="bar"><span>AI NO TE</span><span style="display:flex;gap:16px;align-items:center">${!ui.editMode && store.get(TOKEN_KEY) ? `<a class="btn" href="#edit" style="text-decoration:none">編集</a>` : ""}<a href="https://x.com/KazAIforHuman" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">X @KazAIforHuman ↗</a></span></div>
  ${draftNote}${editPanel()}
  ${ui.msg ? `<p class="msg" role="status">${esc(ui.msg)}</p>` : ""}

  <header class="hero">
    <h1><span class="ai">AI</span><span class="te">の<em>手</em></span></h1>
    <div class="underline" aria-hidden="true"></div>
    <p class="catch">AIを人の「<em>合いの手</em>」に</p>
    <p class="about">AI と一緒に作った、制作を補助するツールを公開しています。<br>作るのは人間。AIはツール。</p>
    <div class="spec"><span>開設 2026.10.14</span><span>公開中 ${counts.live} 点</span><span>製作中 ${counts.wip} 点</span><span>構想 ${counts.idea} 点</span></div>
  </header>

  <section class="sec" aria-labelledby="h-news">
    <div class="sec-head"><h2 id="h-news">お知らせ</h2><span class="tag">News</span></div>
    ${state.news.length ? `<ol class="news">${state.news.map((n, i) => ({ n, i })).sort((a, b) => b.n.d.localeCompare(a.n.d) || b.i - a.i).map(({ n, i }) =>
      `<li><time datetime="${esc(n.d)}">${esc(n.d.replace(/-/g, "."))}</time><span>${esc(n.t)}</span>${ui.editing ? `<button type="button" class="btn" data-act="news-del" data-i="${i}">削除</button>` : ""}</li>`).join("")}</ol>` : `<p class="empty">お知らせはまだありません。</p>`}
    ${ui.editing ? `<div class="log-add"><input type="date" id="news-d" value="${today()}" aria-label="日付"><input type="text" id="news-t" placeholder="お知らせの内容" aria-label="お知らせの内容"><button type="button" class="btn" data-act="news-add">お知らせを追加</button></div>` : ""}
  </section>

  <section class="sec" aria-labelledby="h-rules">
    <div class="sec-head"><h2 id="h-rules">このツールチェストの方針</h2><span class="tag">Policy</span></div>
    <ol class="rules">
      <li><span class="no">1</span><h3>完成品を出力しない</h3><p>ツールが出力するのは、比較・分解・可視化・試聴など、制作の判断に使う材料に限ります。文章・音楽・画像などの作品そのものは出力しません。</p></li>
      <li><span class="no">2</span><h3>最終的な判断は使う人が行う</h3><p>ツールの出力をそのまま使っても作品にはならない設計にしています。何を選び、どう仕上げるかは、使う人が決めます。</p></li>
      <li><span class="no">3</span><h3>仕組みが分かる形にする</h3><p>ツールが何をしているかを画面上で確認できるようにし、使う人が中身を理解したうえで使えるようにします。</p></li>
      <li><span class="no">4</span><h3>ブラウザだけで動く</h3><p>インストールや登録は不要です。ツールは AI を使用しておらず、入力した内容を外部に送信しません。</p></li>
    </ol>
  </section>

  <section class="sec" aria-labelledby="h-tools">
    <div class="sec-head"><h2 id="h-tools">ツール</h2>${ui.editing ? `<button type="button" class="btn" data-act="tool-add">＋ ツール・構想を追加</button>` : `<span class="tag">Tools</span>`}</div>
    ${ui.form ? toolFormHtml() : ""}
    ${groups || `<p class="empty">掲載しているツールはまだありません。</p>`}
  </section>

  <section class="sec" aria-labelledby="h-how">
    <div class="sec-head"><h2 id="h-how">作り方</h2><span class="tag">How it's built</span></div>
    <div class="how">
      <div><b>1 TOOL = 1 PAGE</b><p>ツールは1つずつ独立したページです。それぞれ単体で動きます。</p></div>
      <div><b>MADE WITH AI</b><p>ツールの制作には AI（Claude）を使用しています。</p></div>
      <div><b>NO AI INSIDE</b><p>ツールそのものは AI を使用していません。AI 系の API は呼び出していません。</p></div>
    </div>
  </section>

  <section class="sec" aria-labelledby="h-faq">
    <div class="sec-head"><h2 id="h-faq">よくある質問</h2>${ui.editing ? `<button type="button" class="btn" data-act="faq-add">＋ 質問を追加</button>` : `<span class="tag">FAQ</span>`}</div>
    ${ui.faqForm ? faqFormHtml() : ""}
    ${state.faq.length ? `<div class="faq">${state.faq.map(f => `<details${ui.editing ? " open" : ""}>
      <summary><span class="q">Q</span><span>${esc(f.q)}</span></summary>
      <div class="ans"><span class="a">A</span><p>${esc(f.a)}</p></div>
      ${delActions("faq", f.id, f.q)}
    </details>`).join("")}</div>` : `<p class="empty">質問はまだありません。</p>`}
  </section>

  <section class="sec" aria-labelledby="h-contact">
    <div class="sec-head"><h2 id="h-contact">お問い合わせ</h2><span class="tag">Contact</span></div>
    <div class="contact">
      <p>ツールへのご意見・ご要望・不具合のご報告は、下記のメールアドレスまでお送りください。</p>
      ${ui.editing ? `<label class="note" for="contact-mail">メールアドレス</label><input type="text" id="contact-mail" class="addr" value="${esc(state.contact)}" style="font:inherit;font-family:var(--f-mono);padding:6px 8px;border:1px solid var(--line);background:var(--paper);color:var(--ink)">`
        : `<p class="addr" id="mail-text">${esc(mail)}</p>
      <div class="row">
        <button type="button" class="btn primary" data-act="copy-mail">アドレスをコピー</button>
        ${mail ? `<a class="btn" href="mailto:${esc(mail)}">メールを作成</a>` : ""}
        ${ui.copied ? `<span class="ok" role="status">${esc(ui.copied)}</span>` : ""}
      </div>`}
      <p class="note">ツールの公開は X でお知らせしています。<a href="https://x.com/KazAIforHuman" target="_blank" rel="noopener" style="color:var(--ink);font-family:var(--f-mono);font-weight:500">@KazAIforHuman ↗</a></p>
    </div>
  </section>

  <footer>
    <div class="row"><span>AI NO TE</span><span>© 2026 AIの手</span></div>
    <p class="notice">本サイトおよび掲載しているツールの文章・コード・画像を、AI の学習・データセット・生成への入力に利用することを禁止します。無断での転載・複製もお断りします。<br>Text and data mining reserved. Use of this site's content for AI training is not permitted.</p>
  </footer>`;
}

function readToolForm() {
  const g = id => document.getElementById(id)?.value.trim() ?? "";
  Object.assign(ui.form.values, { pn: g("f-pn"), status: g("f-status"), name: g("f-name"), cat: g("f-cat").toUpperCase(), one: g("f-one"), does: g("f-does"), hand: g("f-hand"), url: g("f-url"), x: g("f-x") });
}
function openToolForm(id) {
  const t = id ? state.tools.find(v => v.id === id) : null;
  ui.form = { id: id || null, error: "", values: t ? { ...t } : { pn: nextPn(), status: "idea", name: "", cat: "", one: "", does: "", hand: "", url: "", x: "", icon: "" } };
  ui.confirmDel = null; render();
  document.getElementById("tool-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("f-name")?.focus({ preventScroll: true });
}
function openFaqForm(id) {
  const f = id ? state.faq.find(v => v.id === id) : null;
  ui.faqForm = { id: id || null, q: f ? f.q : "", a: f ? f.a : "", error: "" };
  ui.confirmDel = null; render();
  document.getElementById("faq-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  document.getElementById("q-q")?.focus({ preventScroll: true });
}
const stash = () => store.set(DRAFT_KEY, JSON.stringify(state));
const unstash = () => store.del(DRAFT_KEY);

// UTF-8 の文字列を base64 にする（大きなアイコンでも落ちないよう分割して変換）
function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function save() {
  if (ui.busy) return;
  if (!safeMail(state.contact)) { ui.msg = "お問い合わせのメールアドレスの形が正しくありません。"; render(); return; }
  const token = store.get(TOKEN_KEY);
  if (!token) { ui.msg = "トークンが保存されていません。"; ui.editing = false; render(); return; }
  ui.busy = true; ui.msg = "保存しています。"; ui.form = null; ui.faqForm = null; stash(); render();
  const api = `https://api.github.com/repos/${REPO.owner}/${REPO.name}/contents/${REPO.path}`;
  const headers = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  try {
    const cur = await fetch(api + "?ref=" + REPO.branch, { headers, cache: "no-store" });
    if (cur.status === 401) throw { code: "auth" };
    if (cur.status === 403 || cur.status === 404) throw { code: "perm" };
    if (!cur.ok) throw { code: "net" };
    const { sha } = await cur.json();
    const put = await fetch(api, {
      method: "PUT", headers,
      body: JSON.stringify({ message: "サイトの内容を更新", content: toBase64(JSON.stringify(state, null, 1) + "\n"), sha, branch: REPO.branch })
    });
    if (put.status === 401) throw { code: "auth" };
    if (put.status === 403 || put.status === 404) throw { code: "perm" };
    if (put.status === 409) throw { code: "conflict" };
    if (!put.ok) throw { code: "net" };
    SAVED = structuredClone(state); unstash();
    ui.msg = "保存しました。サイトへの反映には 1〜2 分かかります。";
  } catch (e) {
    ui.msg = ({
      auth: "トークンが無効か、期限が切れています。「保存したトークンを消す」から入れ直してください。",
      perm: "このトークンには、このリポジトリへの書き込み権限がありません。",
      conflict: "ほかの場所で先に更新されました。ページを開き直してから、もう一度保存してください。編集内容は下書きとして残してあります。"
    })[e && e.code] || "保存できませんでした。通信の状態を確認して、もう一度押してください。";
  }
  ui.busy = false; render();
}

async function copyMail() {
  const mail = safeMail(state.contact);
  try { await navigator.clipboard.writeText(mail); ui.copied = "コピーしました。"; render(); }
  catch {
    ui.copied = "アドレスを選択しました。コピーしてお使いください。"; render();
    const el = document.getElementById("mail-text");
    if (el) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  }
}

function addNews() {
  const d = document.getElementById("news-d").value, t = document.getElementById("news-t").value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !t) { ui.msg = "お知らせには日付と内容の両方を入れてください。"; return; }
  state.news.push({ d, t }); stash();
}

const app = document.getElementById("app");
app.addEventListener("click", e => {
  const b = e.target.closest("[data-act]");
  if (!b || !state) return;
  const act = b.dataset.act, id = b.dataset.id;
  if (act === "copy-mail") { copyMail(); return; }
  ui.msg = ""; ui.copied = "";
  switch (act) {
    case "token-set": {
      const v = document.getElementById("gh-token").value.trim();
      if (!v) { ui.msg = "トークンを入れてください。"; break; }
      store.set(TOKEN_KEY, v); ui.editing = true; break;
    }
    case "token-forget": store.del(TOKEN_KEY); break;
    case "start": ui.editing = true; break;
    case "stop": ui.editing = false; ui.form = null; ui.faqForm = null; ui.confirmDel = null; if (dirty()) ui.msg = "未保存の変更があります。公開するには「編集を始める」から「保存して公開」を押してください。"; break;
    case "tool-add": openToolForm(null); return;
    case "tool-edit": openToolForm(id); return;
    case "faq-add": openFaqForm(null); return;
    case "faq-edit": openFaqForm(id); return;
    case "del": ui.confirmDel = b.dataset.kind + ":" + id; break;
    case "del-no": ui.confirmDel = null; break;
    case "del-yes": {
      const key = b.dataset.kind === "faq" ? "faq" : "tools";
      state[key] = state[key].filter(t => t.id !== id);
      if (ui.form && ui.form.id === id) ui.form = null;
      if (ui.faqForm && ui.faqForm.id === id) ui.faqForm = null;
      ui.confirmDel = null; stash(); break;
    }
    case "form-cancel": ui.form = null; break;
    case "faq-cancel": ui.faqForm = null; break;
    case "icon-clear": readToolForm(); ui.form.values.icon = ""; break;
    case "save": save(); return;
    case "discard": state = structuredClone(SAVED); ui.form = null; ui.faqForm = null; ui.confirmDel = null; unstash(); break;
    case "news-add": addNews(); break;
    case "news-del": state.news.splice(Number(b.dataset.i), 1); stash(); break;
    case "draft-restore": state = ui.draft; ui.draft = null; ui.editing = true; break;
    case "draft-drop": ui.draft = null; unstash(); break;
    default: return;
  }
  render();
});

app.addEventListener("submit", e => {
  e.preventDefault();
  if (e.target.id === "tool-form") {
    readToolForm();
    const v = ui.form.values;
    if (!v.name) { ui.form.error = "名前を入れてください。"; render(); return; }
    if ((v.url && !safeUrl(v.url)) || (v.x && !safeUrl(v.x))) { ui.form.error = "URL は https:// から始まる形で入れてください。"; render(); return; }
    const item = { id: ui.form.id || uid("t"), pn: v.pn || nextPn(), name: v.name, cat: v.cat, status: v.status, icon: safeIcon(v.icon), one: v.one, does: v.does, hand: v.hand, url: v.url, x: v.x };
    if (ui.form.id) state.tools = state.tools.map(t => t.id === ui.form.id ? item : t);
    else state.tools.push(item);
    ui.form = null; stash(); render();
    document.getElementById("h-tools")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (e.target.id === "faq-form") {
    const q = document.getElementById("q-q").value.trim(), a = document.getElementById("q-a").value.trim();
    if (!q || !a) { Object.assign(ui.faqForm, { q, a, error: "質問と回答の両方を入れてください。" }); render(); return; }
    if (ui.faqForm.id) state.faq = state.faq.map(f => f.id === ui.faqForm.id ? { id: f.id, q, a } : f);
    else state.faq.push({ id: uid("q"), q, a });
    ui.faqForm = null; stash(); render();
    document.getElementById("h-faq")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

app.addEventListener("change", e => {
  if (e.target.id === "contact-mail") { state.contact = e.target.value.trim(); stash(); render(); return; }
  if (e.target.id !== "f-icon") return;
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  readToolForm();
  if (file.size > 300 * 1024) { ui.form.error = "アイコンは 300KB 以下の画像にしてください。"; render(); return; }
  const r = new FileReader();
  r.onload = () => { ui.form.values.icon = safeIcon(String(r.result)); ui.form.error = ui.form.values.icon ? "" : "この形式の画像は使えません。"; render(); };
  r.readAsDataURL(file);
});

window.addEventListener("hashchange", () => { ui.editMode = location.hash === "#edit"; if (!ui.editMode) ui.editing = false; render(); });

render();
fetch("data.json?t=" + Date.now(), { cache: "no-store" })
  .then(r => { if (!r.ok) throw 0; return r.json(); })
  .then(d => {
    SAVED = d; state = structuredClone(d);
    try {
      const raw = store.get(DRAFT_KEY);
      if (raw) {
        const dr = JSON.parse(raw);
        if (JSON.stringify(dr) === JSON.stringify(SAVED)) unstash();
        else if (dr && Array.isArray(dr.tools) && Array.isArray(dr.news) && Array.isArray(dr.faq)) ui.draft = dr;
      }
    } catch {}
    render();
  })
  .catch(() => { ui.loadError = true; render(); });
