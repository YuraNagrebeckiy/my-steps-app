/**
 * Ритм Дня — облако + Google Календарь + Google Задачи + приёмник «Здоровья» (Apps Script Web App) v2.0
 *
 * Хранит ОДИН JSON-файл в вашем Google Диске (ritm-dnya-state.json):
 *   { updatedAt, state, inbox, lastRaw }
 *   state   — копия состояния приложения (общая для Safari и иконки на рабочем столе)
 *   inbox   — последние данные «Здоровья»/Календаря/Задач (сон, шаги, ккал, пульс…)
 *   lastRaw — последний сырой запрос (для диагностики, 20 КБ)
 *
 * Источники данных (все требуют token):
 *   A) POST ?action=hae        — приложение Health Auto Export (JSON), см. SETUP_HEALTH.md
 *   B) POST ?action=raw        — команда iPhone «Планировщик» (сырые образцы сна + числа)
 *   C) GET  ?action=ingest&sleep=7.5&deep=2.1&bedtime=23:10&calories=420&steps=6400&hr=55  — простые значения
 *   D) GET  ?action=pull | ping | status | raw   — служебные
 *   F) GET  ?action=agenda&tz=Europe/Moscow     — события Google Календаря на сегодня + открытые Google Задачи
 *   G) POST {action:'task_set'|'task_add'}       — выполнить/вернуть/создать Google Задачу из приложения
 *   E) POST {action:'push', updatedAt, state}   — сохранение состояния приложения
 */

const TOKEN_FALLBACK = 'СМЕНИТЕ_НА_ДЛИННУЮ_СЛУЧАЙНУЮ_СТРОКУ';
const VERSION = '2.1';

const FILE_NAME = 'ritm-dnya-state.json';
const MAX_BYTES = 400000;
const INGEST_KEYS = ['sleep', 'deep', 'bedtime', 'calories', 'steps', 'hr', 'cal', 'tasks'];
const SLEEP_MAX_AGE_H = 20;   // сон старше 20 часов (прошлая ночь) за «сегодняшний» не принимаем
const INBOX_MERGE_H = 18;     // частичные данные склеиваются в течение 18 часов

/* ================= ТОЧКИ ВХОДА ================= */

function doGet(e) {
  const p = (e && e.parameter) || {};
  const auth = checkToken_(p.token);
  if (auth) return out_(auth);
  try {
    switch (p.action) {
      case 'ping':
        return out_({ ok: true, pong: true, version: VERSION });
      case 'pull': {
        const s = readStore_();
        return out_({ ok: true, updatedAt: s.updatedAt, state: s.state, inbox: s.inbox });
      }
      case 'status': {
        const s = readStore_();
        return out_({ ok: true, version: VERSION, inbox: s.inbox ? { ts: s.inbox.ts, src: s.inbox.src, qs: s.inbox.qs } : null });
      }
      case 'raw': {
        const s = readStore_();
        return out_({ ok: true, lastRaw: s.lastRaw });
      }
      case 'ingest':
        return out_(withLock_(function () { return ingestFields_(pickParams_(p), 'Команда iPhone', JSON.stringify(p)); }));
      case 'agenda':
        return out_(agenda_(p.tz, p.refresh === '1'));
      default:
        return out_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  try {
    const q = (e && e.parameter) || {};
    const text = (e && e.postData && e.postData.contents) || '';
    let body = null;
    try { body = JSON.parse(text); } catch (_) { body = null; }

    const auth = checkToken_(q.token || (body && body.token));
    if (auth) return out_(auth);

    const action = q.action || (body && body.action);
    if (text.length > MAX_BYTES * 2) return out_({ ok: false, error: 'too_large' });

    if (action === 'push') {
      if (!body || !body.state || typeof body.state !== 'object') return out_({ ok: false, error: 'no_state' });
      if (JSON.stringify(body.state).length > MAX_BYTES) return out_({ ok: false, error: 'too_large' });
      return out_(withLock_(function () {
        const s = readStore_();
        const incoming = Number(body.updatedAt) || 0;
        if (incoming < s.updatedAt) {
          return { ok: true, conflict: true, updatedAt: s.updatedAt, state: s.state }; // на сервере версия новее
        }
        s.state = body.state;
        s.updatedAt = incoming || Date.now();
        writeStore_(s);
        return { ok: true, updatedAt: s.updatedAt };
      }));
    }

    if (action === 'task_set') {
      if (!body || !body.id || !body.list) return out_({ ok: false, error: 'bad_task' });
      const upd = body.done ? { status: 'completed' } : { status: 'needsAction', completed: null };
      Tasks.Tasks.patch(upd, String(body.list), String(body.id));
      CacheService.getUserCache().remove('agenda');
      return out_({ ok: true });
    }
    if (action === 'task_add') {
      const title = String((body && body.title) || '').trim().slice(0, 500);
      if (!title) return out_({ ok: false, error: 'bad_task' });
      const created = Tasks.Tasks.insert({ title: title }, '@default');
      CacheService.getUserCache().remove('agenda');
      return out_({ ok: true, task: { id: created.id, list: '@default' } });
    }

    if (action === 'hae') {
      return out_(withLock_(function () { return ingestFields_(parseHae_(body), 'Health Auto Export', text); }));
    }
    if (action === 'raw') {
      return out_(withLock_(function () { return ingestFields_(parseRaw_(body || {}, q), 'Команда iPhone (сырые данные)', text); }));
    }
    return out_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  }
}

/* ================= РАЗБОР ДАННЫХ «ЗДОРОВЬЯ» ================= */

/** Health Auto Export (JSON v2): { data: { metrics: [ {name, units, data:[...]}, ... ] } } */
function parseHae_(payload) {
  const out = {};
  const metrics = (payload && payload.data && payload.data.metrics) || (payload && payload.metrics) || [];
  const by = {};
  metrics.forEach(function (m) { if (m && m.name) by[m.name] = m; });
  const now = Date.now();

  // --- сон ---
  let sleepWindow = null;
  const sl = by.sleep_analysis;
  if (sl && sl.data && sl.data.length) {
    const unitDiv = /min/i.test(String(sl.units || '')) ? 60 : 1;
    const aggregated = sl.data.filter(function (r) { return r.sleepEnd || r.asleep !== undefined || r.totalSleep !== undefined; });
    if (aggregated.length) {
      let best = null, bestEnd = -1;
      aggregated.forEach(function (r) {
        const end = tsOf_(r.sleepEnd || r.inBedEnd || r.date);
        if (end !== null && end > bestEnd && fresh_(end, now)) { best = r; bestEnd = end; }
      });
      if (best) {
        let hours = num_(best.asleep);
        if (hours === null) hours = num_(best.totalSleep);
        if (hours === null) hours = (num_(best.core) || 0) + (num_(best.deep) || 0) + (num_(best.rem) || 0);
        if (hours > 0) out.sleep = r2_(hours / unitDiv);
        const deep = num_(best.deep);
        if (deep !== null) out.deep = r2_(deep / unitDiv);
        const bt = hm_(best.sleepStart || best.inBedStart);
        if (bt) out.bedtime = bt;
        sleepWindow = [tsOf_(best.sleepStart || best.inBedStart), bestEnd];
      }
    } else {
      // «сырые» отрезки сна: {startDate, endDate, value}
      const agg = sleepFromSegments_(sl.data.map(function (g) { return { start: g.startDate || g.start, end: g.endDate || g.end, stage: g.value }; }), now);
      if (agg) {
        out.sleep = agg.hours; out.deep = agg.deepHours;
        if (agg.bedtime) out.bedtime = agg.bedtime;
        sleepWindow = [agg.startTs, agg.endTs];
      }
    }
  }

  // --- шаги и активные калории: сумма за самый свежий день ---
  const stepsDay = latestDaySum_(by.step_count);
  if (stepsDay !== null) out.steps = Math.round(stepsDay);
  const en = by.active_energy || by.active_energy_burned;
  const enDay = latestDaySum_(en);
  if (enDay !== null) out.calories = Math.round(/kj|кдж/i.test(String(en.units || '')) ? enDay / 4.184 : enDay);

  // --- пульс покоя: resting_heart_rate, иначе минимум пульса во время сна ---
  const rhr = by.resting_heart_rate;
  if (rhr && rhr.data && rhr.data.length) {
    const last = latestEntry_(rhr.data);
    const v = last ? (num_(last.qty) !== null ? num_(last.qty) : num_(last.Avg)) : null;
    if (v && v > 30) out.hr = Math.round(v);
  }
  if (out.hr === undefined && by.heart_rate && by.heart_rate.data) {
    let min = null;
    by.heart_rate.data.forEach(function (r) {
      const t = tsOf_(r.date);
      if (sleepWindow && sleepWindow[0] !== null && t !== null && (t < sleepWindow[0] || t > sleepWindow[1])) return;
      const v = num_(r.Min !== undefined ? r.Min : r.qty);
      if (v && v > 30 && (min === null || v < min)) min = v;
    });
    if (min !== null) out.hr = Math.round(min);
  }
  return out;
}

/** Команда iPhone: JSON {sleep:"старт | конец | стадия\n…" либо число часов, steps, calories, hr, cal, tasks} */
function parseRaw_(body, q) {
  const out = {};
  const warn = [];
  const src = Object.assign({}, q, body);
  const tz = src.tz || null;
  const clean = function (v, intOnly) {
    let t = String(v).replace(/[\s\u00A0\u202F]/g, '');
    if (intOnly) t = t.replace(/[^\d]/g, ''); else t = t.replace(',', '.').replace(/[^\d.]/g, '');
    return t;
  };
  ['steps', 'calories', 'hr'].forEach(function (k) {
    if (src[k] !== undefined && String(src[k]) !== '') {
      const t = clean(src[k], k === 'steps');
      if (t !== '' && isFinite(Number(t))) out[k] = t; else warn.push(k + '_not_a_number: ' + String(src[k]).slice(0, 30));
    }
  });
  ['bedtime', 'deep', 'cal', 'tasks'].forEach(function (k) {
    if (src[k] !== undefined && String(src[k]) !== '') out[k] = String(src[k]);
  });
  if (src.sleep !== undefined && String(src.sleep).trim() !== '') {
    const txt = String(src.sleep);
    if (txt.indexOf('|') === -1 && isFinite(Number(txt.replace(',', '.')))) {
      out.sleep = String(Number(txt.replace(',', '.')));           // уже готовое число часов
    } else {
      const segs = txt.split(/\r?\n/).map(function (line) {
        const p = line.split('|').map(function (x) { return x.trim(); });
        return { start: p[0], end: p[1], stage: p[2] };
      }).filter(function (g) { return g.start && g.end; });
      const parsable = segs.filter(function (g) { return tsOf_(g.start, tz) !== null && tsOf_(g.end, tz) !== null; });
      if (!parsable.length) {
        warn.push('sleep_dates_unrecognized: первая строка = ' + txt.split(/\r?\n/)[0].slice(0, 80) + ' (понимаю: 2026-10-28T01:49:00+03:00, 28.10.2026 01:49, 28 окт. 2026 г., 01:49)');
      } else {
        const agg = sleepFromSegments_(segs, Date.now(), tz);
        if (agg) {
          out.sleep = agg.hours; out.deep = agg.deepHours;
          if (agg.bedtime) out.bedtime = agg.bedtime;
        } else {
          warn.push('sleep_no_fresh_session: нет сна, закончившегося за последние ' + SLEEP_MAX_AGE_H + ' ч (или все отрезки «бодрствование/в постели»)');
        }
      }
    }
  }
  if (warn.length) out.__warn = warn;
  return out;
}

/**
 * Сон из отрезков с защитой от двойного счёта (несколько источников пишут один и тот же сон):
 * отрезки каждого типа объединяются по времени; берётся самая длинная «ночь» (разрыв > 3 ч = другая сессия).
 */
function sleepFromSegments_(segs, nowMs, tz) {
  const asleep = [], deep = [];
  segs.forEach(function (g) {
    const st = tsOf_(g.start, tz), en = tsOf_(g.end, tz);
    if (st === null || en === null || en <= st) return;
    let stage = String(g.stage || '').toLowerCase().trim();
    if (/^[0-5]$/.test(stage)) stage = ['inbed', 'asleep', 'awake', 'core', 'deep', 'rem'][Number(stage)]; // HKCategoryValueSleepAnalysis
    if (/awake|in ?bed|unspecified|бодр|в постел/.test(stage)) return;
    asleep.push([st, en, g.start]);
    if (/deep|глубок/.test(stage)) deep.push([st, en]);
  });
  if (!asleep.length) return null;
  const merged = unionIntervals_(asleep);
  const sessions = [];
  merged.forEach(function (iv) {
    const last = sessions[sessions.length - 1];
    if (last && iv[0] - last.end <= 3 * 3600000) { last.ivs.push(iv); last.end = iv[1]; }
    else sessions.push({ ivs: [iv], start: iv[0], end: iv[1] });
  });
  sessions.forEach(function (s) { s.ms = s.ivs.reduce(function (a, iv) { return a + (iv[1] - iv[0]); }, 0); });
  const fresh = sessions.filter(function (s) { return fresh_(s.end, nowMs); });
  if (!fresh.length) return null;
  const main = fresh.reduce(function (a, b) { return b.ms > a.ms ? b : a; });
  let deepMs = 0;
  unionIntervals_(deep).forEach(function (iv) {
    const a = Math.max(iv[0], main.start), b = Math.min(iv[1], main.end);
    if (b > a) deepMs += b - a;
  });
  let startStr = null;
  asleep.forEach(function (g) { if (g[0] === main.start && !startStr) startStr = g[2]; });
  return { hours: r2_(main.ms / 3600000), deepHours: r2_(deepMs / 3600000), bedtime: hm_(startStr), startTs: main.start, endTs: main.end };
}

/* ================= GOOGLE КАЛЕНДАРЬ И ЗАДАЧИ ================= */

function safeTz_(tz) {
  const fallback = Session.getScriptTimeZone();
  if (!tz) return fallback;
  try { Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'); return tz; } catch (_) { return fallback; }
}

/** События на «сегодня» (в часовом поясе ТЕЛЕФОНА) + открытые задачи из всех списков Google Задач */
function agenda_(tzParam, refresh) {
  const tz = safeTz_(tzParam);
  const cache = CacheService.getUserCache();
  const cacheKey = 'agenda';
  if (!refresh) {
    const hit = cache.get(cacheKey);
    if (hit) { try { const o = JSON.parse(hit); if (o.tz === tz) return o; } catch (_) {} }
  }
  const now = new Date();
  const today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const res = { ok: true, tz: tz, today: today, events: [], tasks: [], warnings: [], ts: now.getTime() };

  // ---- Календарь ----
  try {
    const dayStart = Utilities.parseDate(today + ' 00:00', tz, 'yyyy-MM-dd HH:mm');
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600000);
    const skip = /holiday|праздник|#contacts|birthday|день рожд|weeknum|номер недели/i;
    const seen = {};
    CalendarApp.getAllCalendars().forEach(function (cal) {
      let selected = true;
      try { selected = cal.isSelected(); } catch (_) {}
      if (!selected || skip.test(String(cal.getId()) + ' ' + String(cal.getName()))) return;
      cal.getEvents(dayStart, dayEnd).forEach(function (ev) {
        try { if (ev.getMyStatus() === CalendarApp.GuestStatus.NO) return; } catch (_) {}
        const id = String(ev.getId());
        if (seen[id]) return;
        seen[id] = 1;
        const allDay = ev.isAllDayEvent();
        let start = '', end = '';
        if (!allDay) {
          const s = ev.getStartTime(), e = ev.getEndTime();
          start = Utilities.formatDate(s, tz, 'yyyy-MM-dd') < today ? '00:00' : Utilities.formatDate(s, tz, 'HH:mm');
          end = Utilities.formatDate(e, tz, 'yyyy-MM-dd') > today ? '23:59' : Utilities.formatDate(e, tz, 'HH:mm');
          if (end <= start) end = start === '23:59' ? '23:59' : addMin_(start, 30);
        }
        res.events.push({ id: id, title: String(ev.getTitle() || '(без названия)').slice(0, 200), allDay: allDay, start: start, end: end, cal: cal.getName() });
      });
    });
    res.events.sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });
    res.events = res.events.slice(0, 25);
  } catch (err) {
    res.warnings.push('calendar: ' + String(err && err.message || err));
  }

  // ---- Задачи ----
  try {
    const lists = (Tasks.Tasklists.list({ maxResults: 20 }).items || []);
    const noDue = [];
    lists.forEach(function (l) {
      const r = Tasks.Tasks.list(l.id, { showCompleted: false, showHidden: false, maxResults: 100 });
      (r.items || []).forEach(function (t) {
        const title = String(t.title || '').trim();
        if (!title || t.status === 'completed') return;
        const due = t.due ? String(t.due).slice(0, 10) : '';
        const item = { id: t.id, list: l.id, listTitle: l.title, title: title.slice(0, 300), due: due, notes: String(t.notes || '').slice(0, 200) };
        if (!due) noDue.push(item);
        else if (due <= today) res.tasks.push(item);              // на сегодня и просроченные
      });
    });
    res.tasks.sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; });
    res.tasks = res.tasks.slice(0, 40).concat(noDue.slice(0, 15));   // + до 15 задач без срока
  } catch (err) {
    const msg = String(err && err.message || err);
    res.warnings.push('tasks: ' + (/Tasks is not defined/i.test(msg) ? 'сервис «Google Tasks API» не включён (вставьте appsscript.json)' : msg));
  }

  try { cache.put(cacheKey, JSON.stringify(res), 120); } catch (_) {}
  return res;
}

function addMin_(hm, min) {
  const p = hm.split(':'); let t = Number(p[0]) * 60 + Number(p[1]) + min;
  t = Math.min(t, 23 * 60 + 59);
  return ('0' + Math.floor(t / 60)).slice(-2) + ':' + ('0' + (t % 60)).slice(-2);
}

/* ================= ЗАПИСЬ В INBOX ================= */

function ingestFields_(fields, src, rawText) {
  const s = readStore_();
  const warnings = fields && fields.__warn ? fields.__warn : [];
  s.lastRaw = { ts: Date.now(), src: src, text: String(rawText || '').slice(0, 20000) };

  const clean = {};
  INGEST_KEYS.forEach(function (k) {
    if (fields[k] !== undefined && fields[k] !== null && String(fields[k]) !== '') clean[k] = String(fields[k]).slice(0, 4000);
  });
  const keys = Object.keys(clean);
  if (!keys.length) {
    writeStore_(s);
    return { ok: false, error: 'no_recognized_data', warnings: warnings };   // сырой запрос сохранён: смотрите ?action=raw
  }
  // частичные поступления дополняют друг друга в течение INBOX_MERGE_H часов
  let merged = {};
  if (s.inbox && s.inbox.qs && (Date.now() - s.inbox.ts) < INBOX_MERGE_H * 3600000) merged = parseQs_(s.inbox.qs);
  Object.keys(clean).forEach(function (k) { merged[k] = clean[k]; });
  delete merged.autoSync;
  const parts = Object.keys(merged).map(function (k) { return k + '=' + encodeURIComponent(merged[k]); });
  parts.push('autoSync=1');
  s.inbox = { id: Utilities.getUuid(), ts: Date.now(), src: src, qs: parts.join('&') };
  writeStore_(s);
  return { ok: true, inboxId: s.inbox.id, fields: keys, warnings: warnings };
}

function pickParams_(p) {
  const o = {};
  INGEST_KEYS.forEach(function (k) { if (p[k] !== undefined) o[k] = p[k]; });
  return o;
}

function parseQs_(qs) {
  const o = {};
  String(qs || '').split('&').forEach(function (kv) {
    const i = kv.indexOf('=');
    if (i > 0) o[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
  });
  return o;
}

/* ================= УТИЛИТЫ ================= */

function num_(v) { if (v === null || v === undefined || v === '') return null; const n = Number(v); return isFinite(n) ? n : null; }
function r2_(n) { return Math.round(n * 100) / 100; }
function fresh_(endTs, nowMs) { const age = (nowMs - endTs) / 3600000; return age <= SLEEP_MAX_AGE_H && age >= -2; }

const RU_MONTHS_ = { 'янв': 1, 'фев': 2, 'мар': 3, 'апр': 4, 'мая': 5, 'май': 5, 'июн': 6, 'июл': 7, 'авг': 8, 'сен': 9, 'окт': 10, 'ноя': 11, 'дек': 12 };
function p2_(n) { return ('0' + n).slice(-2); }

/** Приводит дату из «Команд» к виду «yyyy-MM-dd HH:mm:ss[ смещение]». Понимает ISO, «28.10.2026, 01:49», «28 окт. 2026 г., 01:49». */
function normDate_(s) {
  s = String(s || '').trim();
  if (!s) return null;
  if (/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s)) return s;
  let m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\D+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return m[3] + '-' + p2_(m[2]) + '-' + p2_(m[1]) + ' ' + p2_(m[4]) + ':' + m[5] + ':' + (m[6] || '00');
  m = s.toLowerCase().match(/(\d{1,2})\s+([а-я]+)\.?\s+(\d{4})\D+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m && RU_MONTHS_[m[2].slice(0, 3)]) return m[3] + '-' + p2_(RU_MONTHS_[m[2].slice(0, 3)]) + '-' + p2_(m[1]) + ' ' + p2_(m[4]) + ':' + m[5] + ':' + (m[6] || '00');
  return null;
}

/** → миллисекунды UTC. Если в строке нет смещения (+03:00 / Z), время считается местным в поясе tz (иначе — пояс скрипта). */
function tsOf_(s, tz) {
  const n = normDate_(s);
  if (!n) return null;
  const m = n.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?\s*(Z|[+-]\d{2}:?\d{2})?/);
  if (!m) return null;
  const z = m[7];
  if (!z) {
    try {
      return Utilities.parseDate(m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5] + ':' + (m[6] || '00'), safeTz_(tz), 'yyyy-MM-dd HH:mm:ss').getTime();
    } catch (_) { return null; }
  }
  let ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  if (z !== 'Z') {
    const sign = z.charAt(0) === '-' ? -1 : 1;
    ms -= sign * (Number(z.slice(1, 3)) * 60 + Number(z.slice(-2))) * 60000;
  }
  return ms;
}
function hm_(s) { const n = normDate_(s) || String(s || ''); const m = n.match(/[ T](\d{2}):(\d{2})/); return m ? m[1] + ':' + m[2] : null; }
function day_(s) { return String(s || '').slice(0, 10); }

function unionIntervals_(list) {
  const a = list.map(function (x) { return [x[0], x[1]]; }).sort(function (x, y) { return x[0] - y[0]; });
  const res = [];
  a.forEach(function (iv) {
    const last = res[res.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]); else res.push(iv);
  });
  return res;
}

function latestEntry_(data) {
  let best = null, bt = -1;
  data.forEach(function (r) { const t = tsOf_(r.date); if (t !== null && t >= bt) { best = r; bt = t; } });
  return best;
}

function latestDaySum_(metric) {
  if (!metric || !metric.data || !metric.data.length) return null;
  const days = {};
  metric.data.forEach(function (r) {
    const q = num_(r.qty);
    if (q === null) return;
    const d = day_(r.date);
    days[d] = (days[d] || 0) + q;
  });
  const keys = Object.keys(days).sort();
  return keys.length ? days[keys[keys.length - 1]] : null;
}

/* ================= ТОКЕН И ХРАНИЛИЩЕ ================= */

function getToken_() {
  const saved = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (saved && saved.length >= 12) return saved;
  if (TOKEN_FALLBACK && TOKEN_FALLBACK.indexOf('СМЕНИТЕ') !== 0 && TOKEN_FALLBACK.length >= 12) return TOKEN_FALLBACK;
  return '';
}

function checkToken_(t) {
  const token = getToken_();
  if (!token) return { ok: false, error: 'server_not_configured' };
  if (String(t || '') !== token) return { ok: false, error: 'auth' };
  return null;
}

/**
 * ЗАПУСТИТЕ ОДИН РАЗ (и повторно после обновления кода): создаёт токен и файл хранилища,
 * запрашивает доступ к Диску, Календарю и Google Задачам и проверяет, что всё работает.
 * Токен НЕ меняется при повторном запуске.
 */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let token = getToken_();
  if (!token) {
    token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 32);
    props.setProperty('TOKEN', token);
  }
  getFile_();
  Logger.log('ГОТОВО. Ваш токен для приложения:\n' + token);
  try {
    const a = agenda_(null, true);
    Logger.log('Календарь: ' + (a.warnings.some(function (w) { return w.indexOf('calendar') === 0; }) ? 'ОШИБКА — ' + a.warnings.join('; ') : 'OK, событий сегодня: ' + a.events.length));
    Logger.log('Google Задачи: ' + (a.warnings.some(function (w) { return w.indexOf('tasks') === 0; }) ? 'ОШИБКА — ' + a.warnings.join('; ') : 'OK, открытых задач: ' + a.tasks.length));
  } catch (err) {
    Logger.log('Проверка календаря/задач не удалась: ' + err);
  }
  Logger.log('Теперь: Развернуть → Управление развёртываниями → ✏ → Версия: «Новая версия» → Развернуть.');
}

function showToken() {
  Logger.log('Токен: ' + (getToken_() || 'НЕ ЗАДАН — запустите setup()'));
}

/** Сменить токен (если он попал на скриншот/в чат). После запуска вставьте новый токен в приложение и в Health Auto Export. */
function resetToken() {
  PropertiesService.getScriptProperties().deleteProperty('TOKEN');
  setup();
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function getFile_() {
  const it = DriveApp.getFilesByName(FILE_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFile(FILE_NAME, JSON.stringify({ updatedAt: 0, state: null, inbox: null, lastRaw: null }), MimeType.PLAIN_TEXT);
}

function readStore_() {
  try {
    const o = JSON.parse(getFile_().getBlob().getDataAsString());
    return { updatedAt: Number(o.updatedAt) || 0, state: o.state || null, inbox: o.inbox || null, lastRaw: o.lastRaw || null };
  } catch (_) {
    return { updatedAt: 0, state: null, inbox: null, lastRaw: null };
  }
}

function writeStore_(s) { getFile_().setContent(JSON.stringify(s)); }

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
