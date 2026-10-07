/* 아기맞이 장바구니 — Supabase + GitHub Pages */
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CFG = window.BABYCART_CONFIG || {};
const CATS = ['이동', '수유', '위생·목욕', '수면', '놀이·생활', '의류'];
const PRI = ['출산 전 필수', '출산 후 구매', '선택'];
const DUE = new Date(2027, 0, 1);

const S = { items: new Map(), cands: new Map(), loaded: false, cat: null, f: 'all', q: '', detail: null, user: null };
try { S.f = localStorage.getItem('babycart-f') || 'all'; } catch (e) {}
let sb = null, E = null, chan = null;

/* ---------- helpers ---------- */
const money = n => n == null || n === '' || isNaN(n) ? '' : '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
const ts = x => x.created_at ? Date.parse(x.created_at) : 0;
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const num = v => v == null || v === '' || isNaN(v) ? null : Number(v);
const md = d => d ? String(d).slice(5).replace('-', '/').replace(/^0/, '').replace('/0', '/') : '';
// 세일: 세일가가 있고, 끝나는 날이 없거나 아직 안 지났으면 세일 중
const saleOn = c => num(c.sale_price) != null && (!c.sale_until || c.sale_until >= today()) && (num(c.price) == null || num(c.sale_price) < num(c.price));
const saleEnded = c => num(c.sale_price) != null && c.sale_until && c.sale_until < today();
const nowPrice = c => saleOn(c) ? num(c.sale_price) : num(c.price);
const costOf = c => c.bought ? (num(c.paid_price) ?? nowPrice(c)) : nowPrice(c);
const offPct = (was, now) => was && now != null && now < was ? Math.round((1 - now / was) * 100) : 0;
const candsOf = id => [...S.cands.values()].filter(c => c.item_id === id).sort((a, b) => ts(a) - ts(b));
function stateOf(it) { if (it.skip) return 'skip'; const cs = candsOf(it.id); if (cs.some(c => c.bought)) return 'done'; if (cs.some(c => c.chosen)) return 'dec'; return 'todo'; }
const pickOf = it => { const cs = candsOf(it.id); return cs.find(c => c.bought) || cs.find(c => c.chosen) || null; };
const PILL = { todo: ['todo', '검토중'], dec: ['dec', '결정'], done: ['done', '구매완료'], skip: ['skip', '안 사기'] };
const pill = st => `<span class="pill ${PILL[st][0]}">${PILL[st][1]}</span>`;
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => el.hidden = true, 2400); }
function errMsg(e) {
  const m = (e && (e.message || e.error_description || e.error)) || '';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return '인터넷 연결을 확인해 주세요.';
  if (/JWT|session|not authenticated/i.test(m)) return '로그인이 만료됐어요. 새로고침 후 다시 로그인해 주세요.';
  if (/sale_price|sale_until|sale_note|paid_price|schema cache/i.test(m)) return '세일 칸이 아직 없어요. 설치 안내서대로 sale-update.sql을 Supabase에서 실행해 주세요.';
  if (/row-level security|permission/i.test(m)) return '저장 권한이 없어요. 설치 안내서의 SQL을 실행했는지 확인해 주세요.';
  return '저장하지 못했어요. ' + (m ? `(${m})` : '잠시 후 다시 시도해 주세요.');
}
const nameOf = u => { if (!u) return ''; const n = (u.user_metadata || {}).name; return n || String(u.email || '').split('@')[0]; };

/* ---------- data ---------- */
async function fetchAll(table) {
  const { data, error } = await sb.from(table).select('*').range(0, 4999);
  if (error) throw error; return data || [];
}
async function reload() {
  const [items, cands] = await Promise.all([fetchAll('items'), fetchAll('candidates')]);
  S.items = new Map(items.map(r => [r.id, r]));
  S.cands = new Map(cands.map(r => [r.id, r]));
  S.loaded = true; render();
}
function applyChange(map, p) {
  if (p.eventType === 'DELETE') { if (p.old && p.old.id) map.delete(p.old.id); }
  else if (p.new && p.new.id) map.set(p.new.id, p.new);
}
function subscribe() {
  if (chan) return;
  let t = null; const later = () => { clearTimeout(t); t = setTimeout(() => { render(); }, 60); };
  chan = sb.channel('babycart')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, p => { applyChange(S.items, p); later(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'candidates' }, p => { applyChange(S.cands, p); later(); })
    .subscribe();
}
async function run(promise) { const { data, error } = await promise; if (error) throw error; return data; }

/* ---------- render ---------- */
function renderSum() {
  const now = new Date(); now.setHours(0, 0, 0, 0); const dd = Math.round((DUE - now) / 864e5);
  const items = [...S.items.values()].filter(i => !i.skip);
  const must = items.filter(i => i.priority === '출산 전 필수');
  const mustDone = must.filter(i => stateOf(i) !== 'todo').length;
  let spent = 0, plan = 0, saved = 0;
  items.forEach(i => { const p = pickOf(i); if (!p) return; const v = costOf(p); if (v == null) return; if (p.bought) spent += v; else plan += v; const was = num(p.price); if (was != null && v < was) saved += was - v; });
  const onSale = items.filter(i => candsOf(i.id).some(saleOn)).length;
  const pct = must.length ? Math.round(mustDone / must.length * 100) : 0;
  $('#sum').innerHTML = `<div class="k d"><div class="lab">예정일 1월 1일까지</div><div class="v">${dd > 0 ? 'D-' + dd : dd === 0 ? 'D-day' : 'D+' + (-dd)}</div></div>
  <div class="k"><div class="lab">필수 품목 결정</div><div class="v">${mustDone}<small>/${must.length}</small></div><div class="meter"><i style="width:${pct}%"></i></div></div>
  <div class="k"><div class="lab">결정·구매 합계</div><div class="v">${money(spent + plan) || '$0'}</div><div class="lab">구매완료 ${money(spent) || '$0'}${saved ? ` · <b class="save">세일로 ${money(saved)} 절약</b>` : ''}</div></div>`;
  $('#sum').dataset.sale = onSale;
}
function render() { renderList(); if (S.detail) renderDetail(); }
function renderList() {
  renderSum();
  const F = $('#filters'), L = $('#list');
  if (!S.loaded) { F.innerHTML = ''; L.innerHTML = '<div class="empty">목록을 불러오는 중…</div>'; return; }
  const all = [...S.items.values()];
  if (!all.length) { F.innerHTML = ''; L.innerHTML = `<div class="empty"><h2>아직 품목이 없어요</h2>유모차, 젖병처럼 사야 할 품목을 추가하고<br>품목마다 후보 제품을 모아 비교해 보세요.<div style="margin-top:16px"><button class="btn" data-a="additem">+ 첫 품목 추가</button></div></div>`; return; }
  const cnt = {}; all.forEach(i => cnt[i.category] = (cnt[i.category] || 0) + 1);
  const cats = [...CATS.filter(c => cnt[c]), ...Object.keys(cnt).filter(c => !CATS.includes(c))];
  const nSale = all.filter(i => !i.skip && candsOf(i.id).some(saleOn)).length;
  const FS = [['all', '전체'], ['must', '출산 전 필수'], ['todo', '아직 검토중'], ['dec', '결정만'], ['done', '구매완료'], ['sale', `세일 중${nSale ? ' ' + nSale : ''}`]];
  F.innerHTML = `<div class="chips"><button class="chip ${!S.cat ? 'on' : ''}" data-a="cat" data-v="">모든 카테고리</button>${cats.map(c => `<button class="chip ${S.cat === c ? 'on' : ''}" data-a="cat" data-v="${esc(c)}">${esc(c)}<span class="n">${cnt[c]}</span></button>`).join('')}</div>
  <div class="chips">${FS.map(([v, l]) => `<button class="chip ${S.f === v ? 'on' : ''}" data-a="f" data-v="${v}">${l}</button>`).join('')}</div>`;
  let arr = all; const q = S.q.trim().toLowerCase();
  if (S.cat) arr = arr.filter(i => i.category === S.cat);
  if (S.f === 'must') arr = arr.filter(i => i.priority === '출산 전 필수' && !i.skip);
  else if (S.f === 'sale') arr = arr.filter(i => !i.skip && candsOf(i.id).some(saleOn));
  else if (S.f !== 'all') arr = arr.filter(i => stateOf(i) === S.f);
  if (q) arr = arr.filter(i => [i.name, i.category, i.note, ...candsOf(i.id).flatMap(c => [c.product, c.brand])].some(x => x && String(x).toLowerCase().includes(q)));
  if (!arr.length) { L.innerHTML = '<div class="empty">조건에 맞는 품목이 없어요.</div>'; return; }
  const groups = cats.map(c => [c, arr.filter(i => i.category === c).sort((a, b) => (a.sort_order ?? 1e9) - (b.sort_order ?? 1e9) || ts(a) - ts(b))]).filter(g => g[1].length);
  L.innerHTML = groups.map(([c, its]) => {
    const done = its.filter(i => ['dec', 'done'].includes(stateOf(i))).length;
    return `<div class="cat"><h2>${esc(c)}<span>${done}/${its.length} 결정</span></h2><div class="rows">${its.map(rowHtml).join('')}</div></div>`;
  }).join('');
}
function rowHtml(i) {
  const st = stateOf(i), p = pickOf(i), cs = candsOf(i.id), n = cs.length;
  const sale = st !== 'skip' && !(p && p.bought) && cs.some(saleOn);
  const cost = p ? costOf(p) : null;
  const sub = p ? `${esc(p.product)}${p.brand ? ' · ' + esc(p.brand) : ''}` : (n ? `후보 ${n}개 비교 중` : (i.note ? esc(i.note) : '후보 없음'));
  return `<button class="row ${st === 'skip' ? 'skip' : ''}" data-a="item" data-id="${i.id}"><div class="main"><div class="t">${esc(i.name)}${i.priority === '출산 전 필수' && st !== 'skip' ? '<span class="must">필수</span>' : ''}${sale ? '<span class="salechip">세일</span>' : ''}</div><div class="s">${sub}</div></div>${cost != null ? `<span class="p">${money(cost)}</span>` : ''}${pill(st)}</button>`;
}
function renderDetail() {
  const el = $('#detail'), it = S.items.get(S.detail);
  if (!it) { el.hidden = true; S.detail = null; return; }
  const cs = candsOf(it.id), st = stateOf(it);
  el.innerHTML = `<div class="wrap"><div class="ovhead"><button class="back" data-a="closedetail">‹ 목록</button><button class="linkbtn" data-a="edititem" data-id="${it.id}">품목 수정</button></div>
  <div class="dtitle">${esc(it.name)}</div>
  <div class="dmeta">${pill(st)}<span>${esc(it.category)}</span><span>· ${esc(it.priority || '')}</span></div>
  ${it.note ? `<div class="note-box">${esc(it.note)}</div>` : ''}
  <div class="sec"><span>후보 ${cs.length}개</span><button class="btn sm" data-a="addcand" data-id="${it.id}">+ 후보 추가</button></div>
  ${cs.length ? `<div class="cands">${cs.map(candHtml).join('')}</div>` : '<div class="empty">아직 후보가 없어요. 눈여겨본 제품을 추가해서 가격과 장단점을 비교해 보세요.</div>'}
  </div>`;
  el.hidden = false;
}
function safeLink(u) { u = String(u || '').trim(); if (!u) return ''; if (!/^https?:\/\//i.test(u)) u = 'https://' + u; return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : ''; }
function priceHtml(c) {
  const was = num(c.price);
  if (c.bought && num(c.paid_price) != null && was != null && num(c.paid_price) < was) return `<div class="price"><s class="was">${money(was)}</s>${money(c.paid_price)}</div>`;
  if (saleOn(c) && was != null) return `<div class="price"><s class="was">${money(was)}</s>${money(c.sale_price)}<span class="off">-${offPct(was, num(c.sale_price))}%</span></div>`;
  if (saleOn(c)) return `<div class="price">${money(c.sale_price)}<span class="off">세일</span></div>`;
  return `<div class="price">${money(was)}</div>`;
}
function saleLine(c) {
  if (c.bought) return num(c.paid_price) != null && num(c.price) != null && num(c.paid_price) < num(c.price) ? `<div class="sale-line">${money(num(c.price) - num(c.paid_price))} 아껴서 샀어요</div>` : '';
  const bits = [c.sale_note, c.sale_until ? md(c.sale_until) + '까지' : ''].filter(Boolean).map(esc).join(' · ');
  if (saleOn(c)) { const was = num(c.price); return `<div class="sale-line">세일 중${was != null ? ` · ${money(was - num(c.sale_price))} 절약` : ''}${bits ? ' · ' + bits : ''}</div>`; }
  if (saleEnded(c)) return `<div class="sale-line ended">세일 끝남 (${md(c.sale_until)}, ${money(c.sale_price)})</div>`;
  return '';
}
function candHtml(c) {
  const link = safeLink(c.link);
  return `<div class="cand ${c.bought ? 'got' : c.chosen ? 'pick' : ''}">
  <div class="hd"><div style="min-width:0"><div class="t">${esc(c.product)}</div><div class="b">${esc(c.brand || '')}</div></div>${priceHtml(c)}</div>
  ${saleLine(c)}
  ${c.bought ? pill('done') : c.chosen ? pill('dec') : ''}
  ${(c.pros || c.cons) ? `<div class="pc">${c.pros ? `<div class="pro"><span class="l">장점</span>${esc(c.pros)}</div>` : ''}${c.cons ? `<div class="con"><span class="l">단점</span>${esc(c.cons)}</div>` : ''}</div>` : ''}
  ${c.note ? `<div class="b" style="white-space:pre-wrap">${esc(c.note)}</div>` : ''}
  ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener">제품 페이지 ↗</a>` : ''}
  ${c.added_by ? `<div class="b">추가: ${esc(c.added_by)}</div>` : ''}
  <div class="acts">
    ${c.bought ? `<button class="btn sm ghost" data-a="unbuy" data-id="${c.id}">구매 취소</button>` : c.chosen ? `<button class="btn sm okb" data-a="buy" data-id="${c.id}">샀어요</button><button class="btn sm ghost" data-a="unchoose" data-id="${c.id}">결정 취소</button>` : `<button class="btn sm" data-a="choose" data-id="${c.id}">이걸로 결정</button>`}
    <button class="btn sm ghost" data-a="editcand" data-id="${c.id}">수정</button>
  </div></div>`;
}

/* ---------- editors ---------- */
function openSheet(html) { const s = $('#sheet'); s.innerHTML = `<div class="wrap">${html}</div>`; s.hidden = false; s.scrollTop = 0; }
function closeSheet() { const s = $('#sheet'); s.hidden = true; s.innerHTML = ''; E = null; }
const segHtml = (name, opts, val) => `<div class="seg" id="${name}">${opts.map(o => `<button type="button" class="chip ${o === val ? 'on' : ''}" data-a="seg" data-g="${name}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
function openItem(id) {
  const it = id ? S.items.get(id) : null;
  E = { kind: 'item', id, cat: it ? it.category : (S.cat || CATS[0]), pri: it ? it.priority : PRI[0], skip: !!(it && it.skip), arm: false };
  openSheet(`<div class="ovhead"><button class="back" data-a="cancel">취소</button><h2>${it ? '품목 수정' : '품목 추가'}</h2><button class="btn" id="i-save" data-a="saveitem">저장</button></div>
  <div class="f"><label for="i-name">품목 이름</label><input id="i-name" class="in" value="${esc(it ? it.name : '')}" placeholder="예: 유모차"></div>
  <div class="f"><label>카테고리</label>${segHtml('cat', CATS, E.cat)}</div>
  <div class="f"><label>우선순위</label>${segHtml('pri', PRI, E.pri)}</div>
  <div class="f"><label for="i-note">메모</label><textarea id="i-note" class="in" placeholder="고를 때 확인할 것">${esc(it && it.note || '')}</textarea></div>
  ${it ? `<div class="f"><label>사지 않기로 했으면</label>${segHtml('skip', ['살 예정', '안 사기'], E.skip ? '안 사기' : '살 예정')}</div>` : ''}
  <div class="err" id="e-err"></div>
  ${it ? '<div class="actions"><button class="btn danger" id="i-del" data-a="delitem">품목과 후보 모두 삭제</button></div>' : ''}`);
}
async function saveItem() {
  const name = $('#i-name').value.trim(); if (!name) { $('#e-err').textContent = '품목 이름을 입력해 주세요.'; return; }
  const btn = $('#i-save'); btn.disabled = true;
  const body = { name, category: E.cat, priority: E.pri, note: $('#i-note').value.trim(), skip: E.skip };
  try {
    if (E.id) { const r = await run(sb.from('items').update(body).eq('id', E.id).select().single()); S.items.set(r.id, r); }
    else { const max = Math.max(0, ...[...S.items.values()].map(i => i.sort_order || 0)); const r = await run(sb.from('items').insert({ ...body, sort_order: max + 1 }).select().single()); S.items.set(r.id, r); }
    closeSheet(); render(); toast('저장했어요');
  } catch (e) { btn.disabled = false; $('#e-err').textContent = errMsg(e); }
}
async function delItem() {
  const b = $('#i-del'); if (!E.arm) { E.arm = true; b.classList.add('arm'); b.textContent = '한 번 더 누르면 삭제돼요'; return; }
  try {
    await run(sb.from('items').delete().eq('id', E.id)); // candidates cascade
    S.items.delete(E.id); candsOf(E.id).forEach(c => S.cands.delete(c.id));
    closeSheet(); S.detail = null; $('#detail').hidden = true; render(); toast('삭제했어요');
  } catch (e) { $('#e-err').textContent = errMsg(e); }
}
function openCand({ itemId, id }) {
  const c = id ? S.cands.get(id) : null; E = { kind: 'cand', id, itemId: c ? c.item_id : itemId, arm: false };
  const it = S.items.get(E.itemId);
  openSheet(`<div class="ovhead"><button class="back" data-a="cancel">취소</button><h2>${c ? '후보 수정' : '후보 추가'}${it ? ' · ' + esc(it.name) : ''}</h2><button class="btn" id="c-save" data-a="savecand">저장</button></div>
  <div class="f"><label for="c-product">제품명</label><input id="c-product" class="in" value="${esc(c ? c.product : '')}" placeholder="예: Vista V3"></div>
  <div class="two"><div class="f"><label for="c-brand">브랜드</label><input id="c-brand" class="in" value="${esc(c && c.brand || '')}" placeholder="예: UPPAbaby"></div>
  <div class="f"><label for="c-price">가격 ($)</label><input id="c-price" class="in" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(c && c.price != null ? c.price : '')}" placeholder="0"></div></div>
  <div class="salebox"><div class="sec" style="margin-top:0"><span>세일 (있을 때만)</span></div>
  <div class="two"><div class="f"><label for="c-sale">세일 가격 ($)</label><input id="c-sale" class="in" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(c && c.sale_price != null ? c.sale_price : '')}" placeholder="예: 879"></div>
  <div class="f"><label for="c-until">세일 끝나는 날</label><input id="c-until" class="in" type="date" value="${esc(c && c.sale_until || '')}"></div></div>
  <div class="f" style="margin-bottom:4px"><label for="c-salenote">세일 메모</label><input id="c-salenote" class="in" value="${esc(c && c.sale_note || '')}" placeholder="예: Target 블랙프라이데이, 쿠폰 코드"></div>
  <div class="help" id="c-salehint"></div>
  ${c && num(c.sale_price) != null ? '<button type="button" class="linkbtn" data-a="clearsale" style="padding-left:0">세일 정보 지우기</button>' : ''}</div>
  <div class="f"><label for="c-pros">장점</label><textarea id="c-pros" class="in" placeholder="한 줄에 하나씩">${esc(c && c.pros || '')}</textarea></div>
  <div class="f"><label for="c-cons">단점</label><textarea id="c-cons" class="in" placeholder="한 줄에 하나씩">${esc(c && c.cons || '')}</textarea></div>
  <div class="f"><label for="c-link">링크</label><input id="c-link" class="in" type="url" value="${esc(c && c.link || '')}" placeholder="https://"></div>
  <div class="f"><label for="c-note">메모</label><textarea id="c-note" class="in" placeholder="매장에서 본 느낌, 할인 정보 등">${esc(c && c.note || '')}</textarea></div>
  <div class="err" id="e-err"></div>
  ${c ? '<div class="actions"><button class="btn danger" id="c-del" data-a="delcand">이 후보 삭제</button></div>' : ''}`);
  const hint = () => { const was = num($('#c-price').value), now = num($('#c-sale').value); const h = $('#c-salehint'); if (!h) return;
    h.textContent = was != null && now != null ? (now < was ? `정가보다 ${money(was - now)} 싸요 (${offPct(was, now)}% 할인)` : '세일 가격이 정가보다 비싸거나 같아요.') : ''; };
  $('#c-price').addEventListener('input', hint); $('#c-sale').addEventListener('input', hint); hint();
}
async function saveCand() {
  const product = $('#c-product').value.trim(); if (!product) { $('#e-err').textContent = '제품명을 입력해 주세요.'; return; }
  const pv = $('#c-price').value.trim(), sv = $('#c-sale').value.trim();
  const body = { item_id: E.itemId, product, brand: $('#c-brand').value.trim(), price: pv === '' ? null : Number(pv), pros: $('#c-pros').value.trim(), cons: $('#c-cons').value.trim(), link: $('#c-link').value.trim(), note: $('#c-note').value.trim(),
    sale_price: sv === '' ? null : Number(sv), sale_until: $('#c-until').value || null, sale_note: $('#c-salenote').value.trim() };
  const btn = $('#c-save'); btn.disabled = true;
  try {
    const r = E.id ? await run(sb.from('candidates').update(body).eq('id', E.id).select().single())
      : await run(sb.from('candidates').insert({ ...body, added_by: nameOf(S.user) }).select().single());
    S.cands.set(r.id, r); closeSheet(); render(); toast('저장했어요');
  } catch (e) { btn.disabled = false; $('#e-err').textContent = errMsg(e); }
}
async function delCand() {
  const b = $('#c-del'); if (!E.arm) { E.arm = true; b.classList.add('arm'); b.textContent = '한 번 더 누르면 삭제돼요'; return; }
  try { await run(sb.from('candidates').delete().eq('id', E.id)); S.cands.delete(E.id); closeSheet(); render(); toast('삭제했어요'); }
  catch (e) { $('#e-err').textContent = errMsg(e); }
}
async function setPick(id, chosen, bought) {
  const c = S.cands.get(id); if (!c) return;
  try {
    if (chosen) {
      const others = candsOf(c.item_id).filter(o => o.id !== id && (o.chosen || o.bought)).map(o => o.id);
      if (others.length) { await run(sb.from('candidates').update({ chosen: false, bought: false }).in('id', others)); others.forEach(o => S.cands.set(o, { ...S.cands.get(o), chosen: false, bought: false })); }
    }
    const r = await run(sb.from('candidates').update({ chosen, bought, paid_price: bought ? nowPrice(c) : null }).eq('id', id).select().single());
    S.cands.set(r.id, r); render();
    toast(bought ? '구매완료로 표시했어요' : chosen ? '결정했어요' : '결정을 취소했어요');
  } catch (e) { toast(errMsg(e)); }
}

/* ---------- events ---------- */
const H = {
  cat: a => { S.cat = a.dataset.v || null; render(); },
  f: a => { S.f = a.dataset.v; try { localStorage.setItem('babycart-f', S.f); } catch (e) {} render(); },
  item: a => { S.detail = a.dataset.id; renderDetail(); $('#detail').scrollTop = 0; },
  closedetail: () => { S.detail = null; $('#detail').hidden = true; },
  additem: () => { if (sb && S.user) openItem(null); },
  edititem: a => openItem(a.dataset.id),
  saveitem: () => saveItem(), delitem: () => delItem(),
  addcand: a => openCand({ itemId: a.dataset.id }),
  editcand: a => openCand({ id: a.dataset.id }),
  savecand: () => saveCand(), delcand: () => delCand(),
  choose: a => setPick(a.dataset.id, true, false),
  unchoose: a => setPick(a.dataset.id, false, false),
  buy: a => setPick(a.dataset.id, true, true),
  unbuy: a => setPick(a.dataset.id, true, false),
  cancel: () => closeSheet(),
  clearsale: () => { $('#c-sale').value = ''; $('#c-until').value = ''; $('#c-salenote').value = ''; $('#c-salehint').textContent = ''; },
  seg: a => {
    const g = a.dataset.g, v = a.dataset.v;
    if (g === 'cat') E.cat = v; if (g === 'pri') E.pri = v; if (g === 'skip') E.skip = v === '안 사기';
    document.querySelectorAll(`#${g} .chip`).forEach(b => b.classList.toggle('on', b.dataset.v === v));
  },
  logout: async () => { await sb.auth.signOut(); location.reload(); },
};
document.addEventListener('click', ev => { const a = ev.target.closest('[data-a]'); if (!a) return; const f = H[a.dataset.a]; if (f) { ev.preventDefault(); f(a, ev); } });
$('#q').addEventListener('input', ev => { S.q = ev.target.value; render(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.user && !E) reload().catch(() => {}); });

/* ---------- boot ---------- */
async function showApp() {
  $('#boot').hidden = true; $('#login').hidden = true; $('#app').hidden = false; $('#fab').hidden = false;
  $('#me').textContent = nameOf(S.user);
  render();
  try { await reload(); subscribe(); }
  catch (e) { $('#list').innerHTML = `<div class="empty"><h2>목록을 불러오지 못했어요</h2>${esc(errMsg(e))}<br><span class="help">설치 안내서의 Supabase 설정(SQL 실행)을 마쳤는지 확인해 주세요.</span></div>`; }
}
function showLogin() { $('#boot').hidden = true; $('#app').hidden = true; $('#fab').hidden = true; $('#login').hidden = false; }
(async () => {
  if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY) {
    $('#boot').innerHTML = '<div class="empty" style="margin-top:15vh"><h2>설정이 필요해요</h2>config.js 파일에 Supabase 주소와 키를 넣어 주세요.<br>설치 안내서 3단계를 보세요.</div>'; return;
  }
  if (!window.supabase) { $('#boot').innerHTML = '<div class="empty" style="margin-top:15vh"><h2>불러오지 못했어요</h2>인터넷 연결을 확인하고 새로고침해 주세요.</div>'; return; }
  const m = String(CFG.SUPABASE_URL).trim().match(/https?:\/\/[^/\s]+/);
  const baseUrl = m ? m[0] : String(CFG.SUPABASE_URL).trim();
  sb = window.supabase.createClient(baseUrl, String(CFG.SUPABASE_ANON_KEY).trim(), { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'babycart-auth' } });
  const { data } = await sb.auth.getSession();
  if (data.session) { S.user = data.session.user; showApp(); } else showLogin();
  sb.auth.onAuthStateChange((ev, session) => { if (ev === 'SIGNED_OUT') { S.user = null; showLogin(); } else if (session) S.user = session.user; });
})();
$('#loginform').addEventListener('submit', async ev => {
  ev.preventDefault(); const btn = $('#lg-btn'), er = $('#lg-err'); er.textContent = ''; btn.disabled = true;
  const { data, error } = await sb.auth.signInWithPassword({ email: $('#lg-email').value.trim(), password: $('#lg-pw').value });
  btn.disabled = false;
  if (error) { er.textContent = /Invalid login/i.test(error.message) ? '이메일이나 비밀번호가 맞지 않아요.' : errMsg(error); return; }
  S.user = data.user; showApp();
});
