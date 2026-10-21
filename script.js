/**
 * Ритм Дня v4.1 — Биометрическая система управления энергией, Календарём и Задачами
 * Оптимизировано для iPhone 16 Pro Max (iOS 27.0.1)
 * Контуры синхронизации:
 *  1) HUAWEI Health -> Apple HealthKit + Apple Календарь + Напоминания (iOS Shortcuts RitmSync)
 *  2) Google Calendar API v3 + Google Tasks API v1 (OAuth 2.0 GIS) + автономный парсер .ics
 */

const STORAGE_KEY = 'ritm_dnya_state_v4';
const PERMISSIONS_KEY = 'ritm_permissions_granted_v4';
const GOOGLE_CLIENT_ID_KEY = 'ritm_google_client_id_v4';

// Коэффициенты расхода/заряда энергии от задач (% за 1 час)
const TASK_ENERGY_RATES = {
    high: -5.0,    // Категория А: сложные узлы, конструктив, высокий риск
    medium: -2.8,  // Категория Б: координация, проверка стоп-точек по чек-листу
    low: -1.2,     // Категория В: легкая рутина, языки, фиксация итогов
    rest: +6.0,    // Активное восстановление: обед без экрана, прогулка, дневной сон
    free: -0.5     // Свободное окно (базовый метаболизм)
};

const DEFAULT_SCHEDULE = [
    { id: 'slot-1', start: '08:30', end: '09:30', title: 'Подъём по будильнику, завтрак, синк часов Huawei → HealthKit', type: 'routine', energy: 'low', done: true },
    { id: 'slot-2', start: '09:30', end: '10:30', title: 'Защищённый блок: Главная стратегическая задача (Категория А)', type: 'focus', energy: 'high', done: false },
    { id: 'slot-3', start: '10:30', end: '13:00', title: 'Свободное окно', type: 'free', energy: 'high', done: false },
    { id: 'slot-4', start: '13:00', end: '14:00', title: 'Обед и восстановление ресурса (без рабочих чатов)', type: 'break', energy: 'rest', done: false },
    { id: 'slot-5', start: '14:00', end: '16:30', title: 'Свободное окно', type: 'free', energy: 'medium', done: false },
    { id: 'slot-6', start: '17:00', end: '19:00', title: 'Свободное окно', type: 'free', energy: 'low', done: false },
    { id: 'slot-7', start: '20:00', end: '21:00', title: 'Английский (Duolingo 15 мин) и вечерняя разгрузка', type: 'routine', energy: 'low', done: false }
];

const defaultState = {
    dayType: 'work',        // 'work' | 'weekend'
    morningMood: 'high',    // 'high' | 'medium' | 'low'
    manualOffset: 0,
    showDetailedRecs: true,
    health: {
        sleepHours: 8.2,
        deepSleepHours: 3.1,
        bedtime: '22:45',
        activeCalories: 310,
        steps: 5120,
        stepsGoal: 10000,
        restingHR: 58,
        lastSync: 'iOS 27.0.1 • Двухконтурная автосинхронизация v4.1',
        lastSyncTimestamp: Date.now()
    },
    alarm: {
        time: '07:30',
        enabled: true
    },
    syncMeta: {
        lastCalendarSync: 'Ожидание синхронизации (RitmSync / Google API)',
        importedEventsCount: 0,
        importedTasksCount: 0
    },
    holdPoints: [
        { id: 'hp-1', title: 'Защищён первый утренний блок (60 мин на Категорию А без телефона)', done: true },
        { id: 'hp-2', title: 'Стоп-точка 1 (Качество): узел выполнен по проекту без отступлений', done: false },
        { id: 'hp-3', title: 'Стоп-точка 2 (Объём): фактические замеры сходятся со сметой', done: false },
        { id: 'hp-4', title: 'Стоп-точка 3 (Документация): исполнительная схема и акты получены', done: false },
        { id: 'hp-5', title: 'Отказ от «спасательства»: вместо переделки за смежника выдан чек-лист', done: false }
    ],
    schedule: JSON.parse(JSON.stringify(DEFAULT_SCHEDULE)),
    tasks: [
        { id: 'task-1', title: 'Согласовать с Олегом конструктив лестницы, узлы и поручень', category: 'A', complexity: 'high' },
        { id: 'task-2', title: 'Падел-клуб / ЖК Lucky — аудит критических узлов и стоп-точек приёмки', category: 'A', complexity: 'high' },
        { id: 'task-3', title: 'Проверить спецификацию по лаку и диффузоры вентиляции с Антоном', category: 'B', complexity: 'medium' },
        { id: 'task-4', title: 'Отправить подрядчику чек-лист приёмки вместо ручной переделки чертежей', category: 'B', complexity: 'medium' },
        { id: 'task-5', title: 'Зафиксировать 3 главных результата недели и предотвращённые риски', category: 'C', complexity: 'low' }
    ],
    activeTaskFilter: 'all',
    currentPage: 'home'
};

let state = loadState();

/* =========================================================
   1. ЗАГРУЗКА СОСТОЯНИЯ И САНАЦИЯ ДУБЛИКАТОВ 19:00-20:00
   ========================================================= */
function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return JSON.parse(JSON.stringify(defaultState));
        const parsed = JSON.parse(raw);
        const merged = {
            ...defaultState,
            ...parsed,
            health: { ...defaultState.health, ...(parsed.health || {}) },
            alarm: { ...defaultState.alarm, ...(parsed.alarm || {}) },
            syncMeta: { ...defaultState.syncMeta, ...(parsed.syncMeta || {}) },
            schedule: Array.isArray(parsed.schedule) && parsed.schedule.length ? parsed.schedule : JSON.parse(JSON.stringify(DEFAULT_SCHEDULE)),
            tasks: Array.isArray(parsed.tasks) ? parsed.tasks : defaultState.tasks,
            holdPoints: Array.isArray(parsed.holdPoints) ? parsed.holdPoints : defaultState.holdPoints
        };
        merged.schedule = deduplicateScheduleArray(merged.schedule);
        return merged;
    } catch (e) {
        return JSON.parse(JSON.stringify(defaultState));
    }
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.warn('Ошибка сохранения localStorage:', e);
    }
}

// Автоматическое удаление каскадных клонов 19:00-20:00 из v4.0
function deduplicateScheduleArray(scheduleArr) {
    if (!Array.isArray(scheduleArr)) return JSON.parse(JSON.stringify(DEFAULT_SCHEDULE));
    const seenKeys = new Set();
    let count1900 = 0;
    const cleaned = [];

    for (const slot of scheduleArr) {
        if (!slot || !slot.title) continue;
        const normTitle = slot.title.trim().toLowerCase();
        const timeKey = `${slot.start}-${slot.end}`;

        // Разрешаем не более одного дополнительного слота на 19:00-20:00
        if (timeKey === '19:00-20:00') {
            count1900++;
            if (count1900 > 1) continue;
        }

        // Не допускаем дублирования одинаковых задач в расписании
        const uniqueKey = normTitle === 'свободное окно' ? `${timeKey}|free` : normTitle;
        if (seenKeys.has(uniqueKey)) continue;
        seenKeys.add(uniqueKey);
        cleaned.push(slot);
    }

    return cleaned.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
}

function cleanupDuplicateSlots() {
    state.schedule = deduplicateScheduleArray(state.schedule);
    renderAll();
}

function resetScheduleToDefault() {
    state.schedule = JSON.parse(JSON.stringify(DEFAULT_SCHEDULE));
    state.manualOffset = 0;
    renderAll();
}

/* =========================================================
   2. СЕМАНТИЧЕСКИЙ КЛАССИФИКАТОР ЭНЕРГОЁМКОСТИ (А / Б / В / REST)
   ========================================================= */
function classifyEnergyByText(title) {
    const t = String(title || '').toLowerCase();

    if (
        t.includes('[rest]') || t.includes('🔋') || t.includes('обед') ||
        t.includes('отдых') || t.includes('прогулк') || t.includes('сон') ||
        t.includes('w124') || t.includes('катар') || t.includes('перерыв') ||
        t.includes('кино') || t.includes('море') || t.includes('перезагруз')
    ) {
        return { category: 'REST', energy: 'rest' };
    }

    if (
        t.includes('[a]') || t.includes('[а]') || t.includes('🔥') ||
        t.includes('объект') || t.includes('узл') || t.includes('конструктив') ||
        t.includes('лестниц') || t.includes('lucky') || t.includes('падел') ||
        t.includes('аудит') || t.includes('стратег') || t.includes('переговор') ||
        t.includes('смет') || t.includes('кат. а') || t.includes('категория а')
    ) {
        return { category: 'A', energy: 'high' };
    }

    if (
        t.includes('[c]') || t.includes('[в]') || t.includes('🌿') ||
        t.includes('duolingo') || t.includes('английск') || t.includes('язык') ||
        t.includes('рутин') || t.includes('почт') || t.includes('отчёт') ||
        t.includes('итог') || t.includes('результат') || t.includes('быт')
    ) {
        return { category: 'C', energy: 'low' };
    }

    return { category: 'B', energy: 'medium' };
}

/* =========================================================
   3. ДВУХКОНТУРНАЯ СИНХРОНИЗАЦИЯ (iOS RITMSYNC + GOOGLE API + ICS)
   ========================================================= */
function parseUrlHealthTelemetry() {
    try {
        const params = new URLSearchParams(window.location.search);
        let updated = false;

        if (params.has('sleep')) {
            const val = parseFloat(String(params.get('sleep')).replace(',', '.'));
            if (!isNaN(val) && val > 0) {
                state.health.sleepHours = val;
                updated = true;
            }
        }
        if (params.has('deep')) {
            const val = parseFloat(String(params.get('deep')).replace(',', '.'));
            if (!isNaN(val) && val >= 0) {
                state.health.deepSleepHours = val;
                updated = true;
            }
        }
        if (params.has('bedtime')) {
            const bt = params.get('bedtime');
            if (bt && /^\d{1,2}:\d{2}$/.test(bt.trim())) {
                state.health.bedtime = bt.trim().padStart(5, '0');
                updated = true;
            }
        }
        if (params.has('calories')) {
            const val = parseInt(params.get('calories'), 10);
            if (!isNaN(val) && val >= 0) {
                state.health.activeCalories = val;
                updated = true;
            }
        }
        if (params.has('steps')) {
            const val = parseInt(params.get('steps'), 10);
            if (!isNaN(val) && val >= 0) {
                state.health.steps = val;
                updated = true;
            }
        }
        if (params.has('hr')) {
            const val = parseInt(params.get('hr'), 10);
            if (!isNaN(val) && val > 30) {
                state.health.restingHR = val;
                updated = true;
            }
        }

        // Приём событий из Apple / Google Календаря через параметр &cal=
        if (params.has('cal')) {
            const rawCal = params.get('cal');
            const parsedEvents = parseCalendarStringPayload(rawCal);
            if (parsedEvents.length > 0) {
                mergeExternalEventsIntoSchedule(parsedEvents, 'iOS RitmSync (Apple + Google Calendar)');
                updated = true;
            }
        }

        // Приём задач из Apple Напоминаний (Reminders) через параметр &tasks=
        if (params.has('tasks')) {
            const rawTasks = params.get('tasks');
            const count = importExternalTasksList(rawTasks, 'Apple Напоминания');
            if (count > 0) updated = true;
        }

        if (updated) {
            const timeStr = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            state.health.lastSync = `Синхронизировано через RitmSync (${timeStr})`;
            state.health.lastSyncTimestamp = Date.now();
            window.history.replaceState({}, document.title, window.location.pathname);
            saveState();
        }
    } catch (e) {
        console.warn('Ошибка чтения URL-параметров телеметрии:', e);
    }
}

// Парсер строки событий календаря: поддерживает "10:30-12:00|Встреча;14:00-15:30|Объект" или JSON
function parseCalendarStringPayload(rawStr) {
    if (!rawStr || !rawStr.trim()) return [];
    const decoded = decodeURIComponent(rawStr.trim());

    // Попытка чтения JSON или Base64 JSON
    try {
        const jsonCandidate = decoded.startsWith('[') ? JSON.parse(decoded) : JSON.parse(atob(decoded));
        if (Array.isArray(jsonCandidate)) {
            return jsonCandidate
                .filter(e => e && e.title)
                .map(e => ({
                    start: e.start || '10:30',
                    end: e.end || '12:00',
                    title: String(e.title).trim()
                }));
        }
    } catch (_) {
        // Обычный текстовый формат HH:mm-HH:mm|Название;...
    }

    const events = [];
    const chunks = decoded.split(/[;\n]+/).map(s => s.trim()).filter(Boolean);
    chunks.forEach(chunk => {
        const match = chunk.match(/(\d{1,2}:\d{2})\s*[-—–]\s*(\d{1,2}:\d{2})\s*[|:]?\s*(.+)/);
        if (match) {
            events.push({
                start: match[1].padStart(5, '0'),
                end: match[2].padStart(5, '0'),
                title: match[3].trim()
            });
        } else if (chunk.length > 2 && !chunk.includes('[')) {
            events.push({
                start: '11:00',
                end: '12:30',
                title: chunk
            });
        }
    });
    return events;
}

// Умное слияние внешних встреч с расписанием и генерация «Свободных окон» (>= 45 мин)
function mergeExternalEventsIntoSchedule(externalEvents, sourceLabel = 'Календарь') {
    if (!Array.isArray(externalEvents) || !externalEvents.length) return;

    // Сохраняем базовые опорные блоки (утренний подъём, защищённый блок и вечерний отдых)
    const preserved = state.schedule.filter(s => s.id === 'slot-1' || s.id === 'slot-2' || s.done);
    const busyBlocks = [...preserved];

    externalEvents.forEach((ev, idx) => {
        const cleanTitle = String(ev.title || '').trim();
        if (!cleanTitle) return;
        const exists = busyBlocks.some(b => b.title.toLowerCase() === cleanTitle.toLowerCase());
        if (exists) return;

        const cls = classifyEnergyByText(cleanTitle);
        busyBlocks.push({
            id: `ext-${Date.now()}-${idx}`,
            start: ev.start || '10:30',
            end: ev.end || addMinutes(ev.start || '10:30', 60),
            title: cleanTitle,
            type: cls.energy === 'rest' ? 'break' : 'work',
            energy: cls.energy,
            source: sourceLabel,
            done: false
        });
    });

    busyBlocks.sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

    // Автоматически вычисляем свободные окна между занятыми слотами с 09:30 до 20:30
    const rebuilt = [];
    let cursorMin = 9 * 60 + 30; // 09:30
    const endOfDayMin = 20 * 60 + 30; // 20:30

    busyBlocks.forEach(block => {
        const bStart = timeToMinutes(block.start);
        const bEnd = timeToMinutes(block.end);

        if (bStart - cursorMin >= 45) {
            rebuilt.push({
                id: `free-${cursorMin}-${bStart}`,
                start: minutesToTime(cursorMin),
                end: minutesToTime(bStart),
                title: 'Свободное окно',
                type: 'free',
                energy: cursorMin < 14 * 60 ? 'high' : 'medium',
                done: false
            });
        }
        rebuilt.push(block);
        cursorMin = Math.max(cursorMin, bEnd);
    });

    if (endOfDayMin - cursorMin >= 45) {
        rebuilt.push({
            id: `free-${cursorMin}-${endOfDayMin}`,
            start: minutesToTime(cursorMin),
            end: minutesToTime(endOfDayMin),
            title: 'Свободное окно',
            type: 'free',
            energy: 'low',
            done: false
        });
    }

    state.schedule = deduplicateScheduleArray(rebuilt);
    const timeStr = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    state.syncMeta.lastCalendarSync = `${sourceLabel} • Синхронизировано в ${timeStr} (${externalEvents.length} событий)`;
    state.syncMeta.importedEventsCount = externalEvents.length;
    renderAll();
}

// Импорт внешних задач (из Apple Reminders или Google Tasks) с классификацией А/Б/В
function importExternalTasksList(rawTasksInput, sourceLabel = 'Внешний список') {
    let titles = [];
    if (Array.isArray(rawTasksInput)) {
        titles = rawTasksInput.map(t => (typeof t === 'string' ? t : t.title)).filter(Boolean);
    } else if (typeof rawTasksInput === 'string') {
        titles = decodeURIComponent(rawTasksInput)
            .split(/[;\n|]+/)
            .map(s => s.trim())
            .filter(s => s.length > 2 && !s.includes('[СписокЗадач]'));
    }

    let added = 0;
    titles.forEach((rawTitle, idx) => {
        const clean = rawTitle.trim();
        const exists = state.tasks.some(t => t.title.toLowerCase() === clean.toLowerCase());
        if (!exists) {
            const cls = classifyEnergyByText(clean);
            state.tasks.unshift({
                id: `ext-task-${Date.now()}-${idx}`,
                title: clean,
                category: cls.category,
                complexity: cls.energy,
                source: sourceLabel
            });
            added++;
        }
    });

    if (added > 0) {
        state.syncMeta.importedTasksCount = added;
        renderAll();
    }
    return added;
}

// Контур 1: Вызов системной команды iOS RitmSync (HealthKit + Apple Календарь + Напоминания)
function runRitmSyncShortcut() {
    const pillText = document.getElementById('sync-pill-text');
    if (pillText) pillText.textContent = 'Запуск RitmSync...';

    // Если приложение запущено внутри Capacitor — читаем HealthKit напрямую
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Health) {
        triggerAutoSyncNow();
        return;
    }

    // Вызываем системную быструю команду iOS "RitmSync"
    window.location.href = 'shortcuts://run-shortcut?name=RitmSync';

    setTimeout(() => {
        const nowTime = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        if (pillText) pillText.textContent = `RitmSync • ${nowTime}`;
    }, 1200);
}

function openNativeAppleCalendar() {
    window.location.href = 'calshow://';
}

function openNativeAppleReminders() {
    window.location.href = 'x-apple-reminder://';
}

// Контур 2: Прямая облачная синхронизация с Google Calendar API v3 и Google Tasks API v1
function triggerGoogleCloudSync() {
    const clientIdInput = document.getElementById('google-client-id-input');
    const savedClientId = localStorage.getItem(GOOGLE_CLIENT_ID_KEY) || '';
    const clientId = (clientIdInput && clientIdInput.value.trim()) || savedClientId;

    if (clientId) {
        localStorage.setItem(GOOGLE_CLIENT_ID_KEY, clientId);
    }

    if (!clientId) {
        openSyncHubModal();
        const statusEl = document.getElementById('calendar-sync-status-text');
        if (statusEl) {
            statusEl.textContent = 'Для прямого облачного подключения укажите Google OAuth Client ID в окне синхронизации или используйте кнопку «Запустить RitmSync (iOS)».';
        }
        return;
    }

    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
        alert('Библиотека Google Identity Services загружается. Повторите через секунду или используйте системный мост iOS RitmSync.');
        return;
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/tasks.readonly',
        callback: async (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
                await fetchGoogleCalendarAndTasks(tokenResponse.access_token);
                closeAllModals();
            }
        }
    });

    tokenClient.requestAccessToken();
}

async function fetchGoogleCalendarAndTasks(accessToken) {
    const headers = { Authorization: `Bearer ${accessToken}` };
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    try {
        // 1. Запрос событий Google Calendar API v3 за сегодня
        const calUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(startOfDay.toISOString())}&timeMax=${encodeURIComponent(endOfDay.toISOString())}&singleEvents=true&orderBy=startTime`;
        const calRes = await fetch(calUrl, { headers });
        if (calRes.ok) {
            const calData = await calRes.json();
            const parsedEvents = (calData.items || [])
                .filter(item => item.summary && item.start && item.start.dateTime)
                .map(item => {
                    const st = new Date(item.start.dateTime);
                    const en = item.end && item.end.dateTime ? new Date(item.end.dateTime) : new Date(st.getTime() + 3600000);
                    return {
                        start: st.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
                        end: en.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
                        title: item.summary
                    };
                });
            if (parsedEvents.length > 0) {
                mergeExternalEventsIntoSchedule(parsedEvents, 'Google Calendar API');
            }
        }

        // 2. Запрос активных задач из Google Tasks API v1
        const tasksUrl = 'https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=false&maxResults=25';
        const tasksRes = await fetch(tasksUrl, { headers });
        if (tasksRes.ok) {
            const tasksData = await tasksRes.json();
            const taskTitles = (tasksData.items || []).map(t => t.title).filter(Boolean);
            if (taskTitles.length > 0) {
                importExternalTasksList(taskTitles, 'Google Tasks API');
            }
        }
    } catch (err) {
        console.warn('Ошибка синхронизации с Google API:', err);
    }
}

// Контур 3: Автономный импорт файла .ics (Apple iCloud / Google Calendar) и быстрой вставки
function importIcsCalendar(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const content = String(e.target.result || '');
        const blocks = content.split('BEGIN:VEVENT').slice(1);
        const events = [];

        blocks.forEach(block => {
            const summaryMatch = block.match(/SUMMARY[^:]*:(.+)/i);
            const dtStartMatch = block.match(/DTSTART[^:]*:(\d{8}T\d{4,6})/i);
            const dtEndMatch = block.match(/DTEND[^:]*:(\d{8}T\d{4,6})/i);

            if (summaryMatch) {
                const title = summaryMatch[1].trim();
                const start = dtStartMatch ? `${dtStartMatch[1].slice(9, 11)}:${dtStartMatch[1].slice(11, 13)}` : '11:00';
                const end = dtEndMatch ? `${dtEndMatch[1].slice(9, 11)}:${dtEndMatch[1].slice(11, 13)}` : addMinutes(start, 60);
                events.push({ start, end, title });
            }
        });

        if (events.length > 0) {
            mergeExternalEventsIntoSchedule(events.slice(0, 8), 'Импорт .ics');
            closeAllModals();
        }
    };
    reader.readAsText(file);
}

function importQuickPastedEvents() {
    const input = document.getElementById('quick-cal-paste-input');
    if (!input || !input.value.trim()) return;
    const events = parseCalendarStringPayload(input.value.trim());
    if (events.length > 0) {
        mergeExternalEventsIntoSchedule(events, 'Быстрый импорт');
        input.value = '';
        closeAllModals();
    }
}

async function triggerAutoSyncNow() {
    const pillText = document.getElementById('sync-pill-text');
    if (pillText) pillText.textContent = 'Синхронизация...';

    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Health) {
        try {
            const Health = window.Capacitor.Plugins.Health;
            const stepsData = await Health.queryAggregated({ dataType: 'steps', bucket: 'day' });
            if (stepsData && stepsData.samples && stepsData.samples.length) {
                state.health.steps = Math.round(stepsData.samples[0].value);
            }
        } catch (e) {
            console.warn('Capacitor sync fallback:', e);
        }
    }

    const nowTime = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    state.health.lastSync = `HUAWEI Health → Apple HealthKit • Сегодня в ${nowTime}`;
    state.health.lastSyncTimestamp = Date.now();

    setTimeout(() => {
        if (pillText) pillText.textContent = `HealthKit • ${nowTime}`;
        renderAll();
    }, 300);
}

/* =========================================================
   4. МАТЕМАТИЧЕСКОЕ ЯДРО БАТАРЕИ И ДИНАМИЧЕСКОГО РАСХОДА
   ========================================================= */
function parseBedtimePoints(bedtimeStr) {
    if (!bedtimeStr || typeof bedtimeStr !== 'string') return 0;
    const [h, m] = bedtimeStr.split(':').map(Number);
    if (isNaN(h)) return 0;
    const dec = h + (m || 0) / 60;

    if (dec >= 20 && dec <= 23.5) return 5;
    if (dec > 23.5 || dec < 0.5) return 0;
    if (dec >= 0.5 && dec <= 6) return -Math.min(12, Math.round(dec * 3.5));
    return 0;
}

function getSlotDurationHours(slot) {
    if (!slot || !slot.start || !slot.end) return 1.0;
    const diff = (timeToMinutes(slot.end) - timeToMinutes(slot.start)) / 60;
    return Math.max(0.25, Math.min(6, diff > 0 ? diff : 1.0));
}

function calculateEnergyBreakdown() {
    const { sleepHours, deepSleepHours, bedtime, activeCalories, steps, restingHR } = state.health;

    // 1. База общего сна (8ч = 70 баллов)
    const sleepRatio = Math.min(Math.max(sleepHours, 0) / 8.0, 1.0);
    const sleepPoints = Math.round(sleepRatio * 70);

    // 2. Глубокий сон (3ч = +25 баллов)
    const deepRatio = Math.min(Math.max(deepSleepHours, 0) / 3.0, 1.0);
    const deepPoints = Math.round(deepRatio * 25);

    // 3. Время отхода ко сну (-12..+5 баллов)
    const bedtimePoints = parseBedtimePoints(bedtime);

    // 4. Физическая нагрузка (калории, шаги, ЧСС покоя)
    let loadPenalty = 0;
    if (activeCalories > 550) {
        loadPenalty -= Math.min(15, Math.round((activeCalories - 550) / 60));
    }
    if (steps > 10000) {
        loadPenalty -= Math.min(8, Math.round((steps - 10000) / 2000));
    }
    if (restingHR > 68) {
        loadPenalty -= Math.min(7, Math.round((restingHR - 68) * 0.7));
    }

    // 5. Утреннее самочувствие
    let moodAdjustment = 0;
    if (state.morningMood === 'high') moodAdjustment = 2;
    if (state.morningMood === 'low') moodAdjustment = -10;

    // Чистая биометрическая база (без учёта выполненных задач)
    const baseHealthTotal = Math.max(10, Math.min(100, Math.round(
        sleepPoints + deepPoints + bedtimePoints + loadPenalty + moodAdjustment + (state.manualOffset || 0)
    )));

    // 6. Динамический расход и подзарядка от уникальных выполненных задач сегодня
    let tasksNetDelta = 0;
    const countedTitles = new Set();
    state.schedule.forEach(slot => {
        if (slot.done && slot.id !== 'slot-1') {
            const key = slot.title.trim().toLowerCase();
            if (countedTitles.has(key)) return;
            countedTitles.add(key);

            const hrs = getSlotDurationHours(slot);
            const rate = TASK_ENERGY_RATES[slot.energy] ?? -2.0;
            tasksNetDelta += rate * hrs;
        }
    });
    tasksNetDelta = Math.round(tasksNetDelta);

    const rawTotal = baseHealthTotal + tasksNetDelta;
    const total = Math.max(10, Math.min(100, Math.round(rawTotal)));

    // Расчёт риска перегрузки (0 - 100%)
    const highTasksCount = state.schedule.filter(s => s.energy === 'high' && !s.done).length;
    const rawRisk = Math.round((100 - total) * 0.75 + highTasksCount * 8 + Math.abs(loadPenalty) * 1.5);
    const overloadRisk = Math.max(8, Math.min(95, rawRisk));

    return {
        total,
        baseHealthTotal,
        sleepPoints,
        deepPoints,
        bedtimePoints,
        loadPenalty,
        tasksNetDelta,
        moodAdjustment,
        manualOffset: state.manualOffset || 0,
        overloadRisk
    };
}

function getBatteryScore() {
    return calculateEnergyBreakdown().total;
}

function getEnergyVisualProfile(score) {
    if (score >= 75) {
        return {
            level: 'high',
            mainTag: 'ПОЛНЫЙ СИЛ',
            subTag: 'ОПТИМАЛЬНЫЙ РЕСУРС',
            badge: '🔥 Высокий ресурс',
            liquidGradient: 'linear-gradient(180deg, rgba(74,222,128,0.92) 0%, rgba(16,185,129,0.88) 55%, rgba(0,245,212,0.95) 100%)',
            ringColor: '#00f5d4'
        };
    }
    if (score >= 50) {
        return {
            level: 'medium',
            mainTag: 'УМЕРЕННЫЙ ТЕМП',
            subTag: 'РАБОЧИЙ БАЛАНС',
            badge: '⚡ Умеренный ресурс',
            liquidGradient: 'linear-gradient(180deg, rgba(250,204,21,0.92) 0%, rgba(245,158,11,0.88) 60%, rgba(16,185,129,0.85) 100%)',
            ringColor: '#facc15'
        };
    }
    return {
        level: 'low',
        mainTag: 'БЕРЕЧЬ СИЛЫ',
        subTag: 'НУЖНА ПЕРЕЗАГРУЗКА',
        badge: '🛋 Низкий ресурс',
        liquidGradient: 'linear-gradient(180deg, rgba(251,113,133,0.92) 0%, rgba(239,68,68,0.88) 65%, rgba(245,158,11,0.85) 100%)',
        ringColor: '#f43f5e'
    };
}

/* =========================================================
   5. ГЕНЕРАЦИЯ РЕКОМЕНДАЦИЙ И 4 КАРТОЧЕК СЦЕНАРИЕВ
   ========================================================= */
function generateFourRecommendations() {
    const score = getBatteryScore();
    const isHigh = score >= 70;
    const isWorkday = state.dayType === 'work';

    const heavyTask = (state.tasks.find(t => t.category === 'A') || {}).title || 'Согласовать с Олегом конструктив лестницы и узлы';
    const lightTask = (state.tasks.find(t => t.category !== 'A') || {}).title || 'Проверить спецификацию по лаку и диффузоры с Антоном';

    if (isWorkday && isHigh) {
        return [
            {
                num: '01 • ГЛАВНЫЙ ПРОРЫВ (−5%/ч)',
                title: '🚀 Сложная задача до 16:00',
                text: `Пик ресурса (${score}%). Поставь в первое окно: «${heavyTask}».`,
                actionLabel: 'В утреннее окно →',
                actionTask: heavyTask,
                actionEnergy: 'high'
            },
            {
                num: '02 • ЗАЩИТА ВРЕМЕНИ',
                title: '🛡️ 60 минут тишины (Кат. А)',
                text: 'Первые 60 минут без мессенджеров — только ключевые узлы и конструктив.',
                actionLabel: 'Включить фокус',
                actionTask: 'Глубокий фокус: критические узлы и чертежи',
                actionEnergy: 'high'
            },
            {
                num: '03 • БЕЗ «СПАСАТЕЛЬСТВА»',
                title: '🛑 Контроль по 3 стоп-точкам',
                text: 'Не перечерчивай за смежников (это сжигает 8.5%/ч) — выдай чек-лист.',
                actionLabel: 'Стоп-точки →',
                actionPage: 'tasks'
            },
            {
                num: '04 • ПОДЗАРЯДКА ДНЁМ (+6%/ч)',
                title: '🔋 Обед и переключение в 13:00',
                text: 'Час спокойного обеда и прогулки вернёт +6% к батарее на вторую половину дня.',
                actionLabel: 'Забронировать отдых',
                actionTask: 'Обед, прогулка и перезагрузка без экрана',
                actionEnergy: 'rest'
            }
        ];
    }

    if (isWorkday && !isHigh) {
        return [
            {
                num: '01 • ЩАДЯЩИЙ РЕЖИМ',
                title: '🔋 Побереги силы и ресурс',
                text: `Заряд ${score}%. Отложи тяжёлые расчёты Категории А на день с высоким сном.`,
                actionLabel: 'Щадящий план →',
                actionTask: 'Спокойный рабочий блок без перегруза',
                actionEnergy: 'low'
            },
            {
                num: '02 • ЛЁГКАЯ РУТИНА (−1.2%/ч)',
                title: '🌿 Простые задачи (Кат. Б и В)',
                text: `Закрой несложные вопросы: «${lightTask}».`,
                actionLabel: 'Поставить в окно →',
                actionTask: lightTask,
                actionEnergy: 'low'
            },
            {
                num: '03 • ДЕЛЕГИРОВАНИЕ',
                title: '📋 Запрос решения от подрядчика',
                text: 'Озвучь риск сразу и потребуй готовый вариант от смежников.',
                actionLabel: 'Проверка по чек-листу',
                actionTask: 'Быстрая сверка статуса подрядчиков по чек-листу',
                actionEnergy: 'medium'
            },
            {
                num: '04 • ГЛУБОКОЕ ВОССТАНОВЛЕНИЕ',
                title: '🌙 Отбой до 22:45 (+5% бонус)',
                text: 'Заверши дела вовремя, чтобы набрать 8+ ч сна и 3 ч глубокой фазы.',
                actionLabel: 'Калибровка сна',
                actionPage: 'health'
            }
        ];
    }

    if (!isWorkday && isHigh) {
        return [
            {
                num: '01 • ИСПОЛНЕНИЕ МЕЧТЫ',
                title: '🌍 Поездка туда, где мечтал побывать!',
                text: `Заряд ${score}% и выходной! Отправляйся с Катариной в новое красивое место.`,
                actionLabel: 'Поставить выезд →',
                actionTask: 'Тур выходного дня с Катариной по новому маршруту',
                actionEnergy: 'rest'
            },
            {
                num: '02 • УДОВОЛЬСТВИЕ ЗА РУЛЁМ',
                title: '🚗 Маршрут под новый звук в W124',
                text: 'Включи любимый плейлист и наслаждайся дорогой без единого рабочего звонка.',
                actionLabel: 'Добавить в план',
                actionTask: 'Автопрогулка на W124 под любимую музыку',
                actionEnergy: 'rest'
            },
            {
                num: '03 • ЭНЕРГИЯ ДЛЯ СЕБЯ',
                title: '⚡ Активный отдых и впечатления',
                text: 'Прогулка у моря, спорт или семейный обед в новом месте (+8% к ресурсу).',
                actionLabel: 'Активный отдых',
                actionTask: 'Прогулка и семейный обед в новом месте',
                actionEnergy: 'rest'
            },
            {
                num: '04 • ЦИФРОВОЙ ДЕТОКС',
                title: '🔕 Свобода от рабочих чатов',
                text: 'Любую рабочую мысль за 5 секунд сбрасывай в банк задач до понедельника.',
                actionLabel: 'Банк мыслей →',
                actionPage: 'tasks'
            }
        ];
    }

    return [
        {
            num: '01 • ПОЛНАЯ ПЕРЕЗАГРУЗКА',
            title: '🛋️ Отдыхай, ничего не делай, кайфуй!',
            text: `Заряд ${score}% и выходной. Официальный день восстановления без чувства вины.`,
            actionLabel: 'Режим отдыха →',
            actionTask: 'Полный отдых, перезагрузка и день без обязательств',
            actionEnergy: 'rest'
        },
        {
            num: '02 • БЕЗ БЫТОВЫХ ПОДВИГОВ',
            title: '🚫 Отложи стройку и ремонт',
            text: 'Никаких утомительных поездок — сегодня нервная система восполняет резерв.',
            actionLabel: 'Освободить день',
            actionTask: 'Спокойный домашний ритм',
            actionEnergy: 'rest'
        },
        {
            num: '03 • ДНЕВНОЙ СОН И УЮТ',
            title: '🍵 Кино, вкусный обед и +12% заряда',
            text: '40 минут дневного сна и спокойный вечер с Катариной.',
            actionLabel: 'Тихий час / Кино',
            actionTask: 'Дневной сон, вкусный обед и любимый фильм',
            actionEnergy: 'rest'
        },
        {
            num: '04 • ЗАРЯД НА 100% К ПОНЕДЕЛЬНИКУ',
            title: '🌙 Ранний сон до 22:30',
            text: 'Набери 3 часа глубокого сна для старта новой недели на максимуме.',
            actionLabel: 'Параметры сна →',
            actionPage: 'health'
        }
    ];
}

/* =========================================================
   6. ОТРИСОВКА ИНТЕРФЕЙСА (RENDER ALL)
   ========================================================= */
function renderAll() {
    renderHeaderDate();
    renderBatteryHUD();
    renderMainRecommendationCard();
    renderBentoGrid();
    renderFocusAndCoordinator();
    renderTimeline();
    renderTasksAndHoldPoints();
    renderHealthPageBreakdown();
    saveState();
}

function renderHeaderDate() {
    const el = document.getElementById('current-date');
    if (el) {
        const now = new Date();
        el.textContent = now.toLocaleDateString('ru-RU', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        }).toUpperCase();
    }
    const dayLabel = document.getElementById('day-type-label');
    if (dayLabel) {
        dayLabel.textContent = state.dayType === 'work' ? 'Рабочий' : 'Выходной';
    }
    const alarmBadge = document.getElementById('alarm-time-badge');
    if (alarmBadge) alarmBadge.textContent = state.alarm.time;
}

function renderBatteryHUD() {
    const breakdown = calculateEnergyBreakdown();
    const score = breakdown.total;
    const profile = getEnergyVisualProfile(score);

    const scoreEl = document.getElementById('sleep-score');
    if (scoreEl) scoreEl.textContent = `${score}%`;

    const mainTagEl = document.getElementById('battery-state-tag');
    if (mainTagEl) mainTagEl.textContent = profile.mainTag;

    const subTagEl = document.getElementById('battery-sub-tag');
    if (subTagEl) subTagEl.textContent = profile.subTag;

    const liquidFill = document.getElementById('battery-bar-fill');
    if (liquidFill) {
        liquidFill.style.height = `${score}%`;
        liquidFill.style.background = profile.liquidGradient;
    }

    const ringProgress = document.getElementById('hud-ring-progress');
    if (ringProgress) {
        const circumference = 854;
        const dash = Math.round((score / 100) * 680);
        ringProgress.style.strokeDasharray = `${dash} ${circumference}`;
        ringProgress.style.stroke = profile.ringColor;
    }

    const currentSlot = state.schedule.find(s => !s.done) || state.schedule[0];
    const currentRate = currentSlot ? (TASK_ENERGY_RATES[currentSlot.energy] ?? -2.0) : -1.2;
    const drainBadge = document.getElementById('drain-rate-badge');
    if (drainBadge) {
        const sign = currentRate > 0 ? '+' : '';
        drainBadge.textContent = currentRate > 0
            ? `🔋 Восстановление: ${sign}${currentRate}% / ч`
            : `⚡ Расход задачи: ${currentRate}% / ч`;
    }

    const offsetEl = document.getElementById('manual-offset');
    if (offsetEl) {
        offsetEl.textContent = state.manualOffset === 0
            ? 'Авто'
            : `${state.manualOffset > 0 ? '+' : ''}${state.manualOffset}%`;
    }
}

function renderMainRecommendationCard() {
    const breakdown = calculateEnergyBreakdown();
    const score = breakdown.total;
    const risk = breakdown.overloadRisk;

    const prefixEl = document.getElementById('rec-lead-prefix');
    const bodyEl = document.getElementById('rec-lead-body');

    if (prefixEl && bodyEl) {
        if (state.dayType === 'work') {
            if (score >= 75) {
                prefixEl.textContent = '⚡ ОТЛИЧНЫЙ СТАРТ!';
                prefixEl.style.color = '#4ade80';
                bodyEl.textContent = `Вы полны сил на ${score}%. Рекомендуется закрыть сложные задачи (Категория А) до 16:00, пока ресурс на пике. Избегайте перегрузок вечером, чтобы сохранить баланс.`;
            } else if (score >= 50) {
                prefixEl.textContent = '👌 РАБОЧИЙ ТОНУС.';
                prefixEl.style.color = '#facc15';
                bodyEl.textContent = `Заряд энергии ${score}% (база HealthKit: ${breakdown.baseHealthTotal}%). Чередуйте задачи средней сложности (Категория Б) с перерывами и проверяйте подрядчиков по стоп-точкам.`;
            } else {
                prefixEl.textContent = '🛋 БЕРЕЖНЫЙ РЕЖИМ!';
                prefixEl.style.color = '#fb7185';
                bodyEl.textContent = `Заряд снижен (${score}%). Отложите тяжёлые узлы, переключитесь на лёгкую рутину (Категория В) и запланируйте отбой до 22:45.`;
            }
        } else {
            if (score >= 70) {
                prefixEl.textContent = '🌍 ВРЕМЯ МЕЧТЫ!';
                prefixEl.style.color = '#00f5d4';
                bodyEl.textContent = `Выходной день и высокий заряд ${score}%! Поезжайте туда, где давно мечтали побывать, включите любимую музыку в W124 и отдохните душой.`;
            } else {
                prefixEl.textContent = '🛌 ПОЛНАЯ ПЕРЕЗАГРУЗКА.';
                prefixEl.style.color = '#a855f7';
                bodyEl.textContent = `Выходной и ${score}% ресурса. Главная задача — отдыхать без чувства вины, вкусно поесть, выспаться и набрать 100% к новой неделе.`;
            }
        }
    }

    const marker = document.getElementById('overload-marker');
    if (marker) marker.style.left = `${risk}%`;

    const riskText = document.getElementById('overload-status-text');
    if (riskText) {
        let riskLabel = 'Низкий';
        riskText.className = 'risk-low';
        if (risk >= 65) {
            riskLabel = 'Высокий';
            riskText.className = 'risk-high';
        } else if (risk >= 38) {
            riskLabel = 'Средний';
            riskText.className = 'risk-med';
        }
        riskText.textContent = `${riskLabel} (${risk}%)`;
    }

    const btnWork = document.getElementById('btn-mode-workday');
    const btnWeek = document.getElementById('btn-mode-weekend');
    if (btnWork) btnWork.classList.toggle('active', state.dayType === 'work');
    if (btnWeek) btnWeek.classList.toggle('active', state.dayType === 'weekend');

    document.querySelectorAll('.mood-pill').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mood === state.morningMood);
    });

    const grid = document.getElementById('recommendations-grid');
    if (grid) {
        grid.style.display = state.showDetailedRecs ? 'grid' : 'none';
        const recs = generateFourRecommendations();
        grid.innerHTML = recs.map((r, idx) => `
            <div class="rec-item">
                <div>
                    <div class="rec-num">${r.num}</div>
                    <div class="rec-title">${r.title}</div>
                    <p class="rec-text">${r.text}</p>
                </div>
                <button class="rec-action-btn" onclick="handleRecommendationAction(${idx})">${r.actionLabel}</button>
            </div>
        `).join('');
    }
}

function toggleDetailedRecs() {
    state.showDetailedRecs = !state.showDetailedRecs;
    renderMainRecommendationCard();
}

function renderBentoGrid() {
    const sleepEl = document.getElementById('metric-sleep-hours');
    if (sleepEl) sleepEl.innerHTML = `${Number(state.health.sleepHours).toFixed(1)} <small>ч</small>`;

    const deepEl = document.getElementById('metric-deep-sleep');
    if (deepEl) deepEl.textContent = Number(state.health.deepSleepHours).toFixed(1);

    const calEl = document.getElementById('metric-calories');
    if (calEl) calEl.textContent = state.health.activeCalories;

    const stepsEl = document.getElementById('steps-count');
    if (stepsEl) stepsEl.textContent = Number(state.health.steps).toLocaleString('ru-RU');

    const goalEl = document.getElementById('steps-goal');
    if (goalEl) goalEl.textContent = `/ ${Number(state.health.stepsGoal || 10000).toLocaleString('ru-RU')}`;
}

function renderFocusAndCoordinator() {
    const score = getBatteryScore();
    const profile = getEnergyVisualProfile(score);

    const currentSlot = state.schedule.find(s => !s.done && s.type !== 'free')
        || state.schedule.find(s => !s.done)
        || state.schedule[state.schedule.length - 1];

    if (currentSlot) {
        const hrs = getSlotDurationHours(currentSlot);
        const rate = TASK_ENERGY_RATES[currentSlot.energy] ?? -2.0;
        const slotDelta = Math.round(rate * hrs);

        document.getElementById('focus-time').textContent = `${currentSlot.start} — ${currentSlot.end}`;
        document.getElementById('focus-title').textContent = currentSlot.title;

        const costLabel = document.getElementById('focus-cost-label');
        if (costLabel) {
            costLabel.textContent = slotDelta > 0 ? `+${slotDelta}% (Заряд)` : `${slotDelta}% заряда`;
            costLabel.style.color = slotDelta > 0 ? '#4ade80' : '#00f5d4';
        }

        let remainingDelta = 0;
        state.schedule.forEach(s => {
            if (!s.done) {
                remainingDelta += (TASK_ENERGY_RATES[s.energy] ?? -1.5) * getSlotDurationHours(s);
            }
        });
        const eveningForecast = Math.max(15, Math.min(100, Math.round(score + remainingDelta)));
        const forecastEl = document.getElementById('evening-forecast-label');
        if (forecastEl) forecastEl.textContent = `${eveningForecast}%`;
    }

    const coordTag = document.getElementById('coordinator-energy-tag');
    if (coordTag) coordTag.textContent = profile.badge;

    const freeSlot = state.schedule.find(s => s.type === 'free' && !s.done);
    const coordText = document.getElementById('assistant-text');
    if (coordText) {
        if (freeSlot) {
            coordText.innerHTML = `Свободно окно <strong>${freeSlot.start} — ${freeSlot.end}</strong>. Заряд <strong>${score}%</strong> — выбери задачу по энергоёмкости или включи подзарядку:`;
        } else {
            coordText.textContent = `Все свободные окна на сегодня распределены! Текущий заряд: ${score}%.`;
        }
    }
}

function renderTimeline() {
    const container = document.getElementById('timeline-list');
    if (!container) return;

    const calSyncText = document.getElementById('calendar-sync-status-text');
    if (calSyncText && state.syncMeta && state.syncMeta.lastCalendarSync) {
        calSyncText.textContent = state.syncMeta.lastCalendarSync;
    }

    const b = calculateEnergyBreakdown();
    const drainSummary = document.getElementById('timeline-drain-summary');
    if (drainSummary) {
        drainSummary.textContent = `База: ${b.baseHealthTotal}% | Задачи: ${b.tasksNetDelta >= 0 ? '+' : ''}${b.tasksNetDelta}%`;
    }

    const activeSlot = state.schedule.find(s => !s.done);
    container.innerHTML = state.schedule.map(slot => {
        const isFree = slot.type === 'free';
        const hrs = getSlotDurationHours(slot);
        const rate = TASK_ENERGY_RATES[slot.energy] ?? -2.0;
        const delta = Math.round(rate * hrs);
        const deltaStr = delta > 0 ? `+${delta}%` : `${delta}%`;

        let badgeClass = 'badge-low';
        let badgeText = `🌿 Кат. В • Лёгкий темп (${deltaStr})`;

        if (isFree) {
            badgeClass = 'badge-free';
            badgeText = '✨ Свободное окно — нажми, чтобы занять';
        } else if (slot.energy === 'high') {
            badgeClass = 'badge-high';
            badgeText = `🔥 Кат. А • Высокий фокус (${deltaStr})`;
        } else if (slot.energy === 'medium') {
            badgeClass = 'badge-medium';
            badgeText = `⚡ Кат. Б • Координация (${deltaStr})`;
        } else if (slot.energy === 'rest') {
            badgeClass = 'badge-rest';
            badgeText = `🔋 Подзарядка и отдых (${deltaStr})`;
        }

        const sourceBadge = slot.source ? `<span style="font-size:0.65rem; color:var(--neon-cyan); margin-left:6px;">• ${escapeHtml(slot.source)}</span>` : '';

        return `
            <div class="slot-item ${slot.id === activeSlot?.id ? 'current' : ''} ${isFree ? 'free-window' : ''} ${slot.done ? 'done' : ''}"
                 onclick="${isFree ? `promptFillFreeSlot('${slot.id}')` : ''}">
                <div class="slot-info">
                    <div class="slot-time">${slot.start} — ${slot.end} (${hrs.toFixed(1)} ч)${sourceBadge}</div>
                    <div class="slot-title">${escapeHtml(slot.title)}</div>
                    <span class="slot-badge ${badgeClass}">${badgeText}</span>
                </div>
                <div class="slot-controls" onclick="event.stopPropagation()">
                    <button class="slot-btn" onclick="toggleSlotDone('${slot.id}')" title="Отметить выполненным">✓</button>
                    <button class="slot-btn" onclick="clearOrRemoveSlot('${slot.id}')" title="Освободить / Удалить">✕</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderTasksAndHoldPoints() {
    const badge = document.getElementById('tasks-count-badge');
    if (badge) badge.textContent = `${state.tasks.length} задач`;

    const filtered = state.tasks.filter(t => state.activeTaskFilter === 'all' || t.category === state.activeTaskFilter);
    const list = document.getElementById('tomorrow-list');
    if (list) {
        list.innerHTML = filtered.length ? filtered.map(task => {
            const badgeHtml = task.category === 'A'
                ? '<span class="slot-badge badge-high">🔴 Кат. А (−5.0%/ч)</span>'
                : task.category === 'B'
                ? '<span class="slot-badge badge-medium">🟡 Кат. Б (−2.8%/ч)</span>'
                : task.category === 'REST'
                ? '<span class="slot-badge badge-rest">🔋 Отдых (+6.0%/ч)</span>'
                : '<span class="slot-badge badge-low">🟢 Кат. В (−1.2%/ч)</span>';

            const srcHtml = task.source ? `<small style="color:var(--neon-cyan); margin-left:6px;">${escapeHtml(task.source)}</small>` : '';

            return `
                <li class="tomorrow-item">
                    <div>
                        <strong style="font-size:0.86rem; display:block; margin-bottom:4px;">${escapeHtml(task.title)}</strong>
                        ${badgeHtml}${srcHtml}
                    </div>
                    <div class="task-item-actions">
                        <button class="slot-btn" onclick="scheduleTaskToToday('${task.id}')" title="Поставить в окно сегодня">→</button>
                        <button class="slot-btn" onclick="removeTask('${task.id}')" title="Удалить">✕</button>
                    </div>
                </li>
            `;
        }).join('') : '<li class="tomorrow-item"><span>В этой категории все задачи закрыты ✨</span></li>';
    }

    const hpList = document.getElementById('hold-points-list');
    if (hpList) {
        hpList.innerHTML = state.holdPoints.map(hp => `
            <label class="hold-point-item" onclick="toggleHoldPoint('${hp.id}')">
                <input type="checkbox" ${hp.done ? 'checked' : ''} onchange="event.stopPropagation(); toggleHoldPoint('${hp.id}')" />
                <span style="${hp.done ? 'text-decoration:line-through; opacity:0.55;' : ''}">${escapeHtml(hp.title)}</span>
            </label>
        `).join('');
    }
}

function renderHealthPageBreakdown() {
    const b = calculateEnergyBreakdown();

    syncSlider('slider-sleep', 'val-sleep-hours', state.health.sleepHours, v => `${Number(v).toFixed(1)} ч`);
    syncSlider('slider-deep', 'val-deep-sleep', state.health.deepSleepHours, v => `${Number(v).toFixed(1)} ч`);
    syncSlider('slider-calories', 'val-calories', state.health.activeCalories, v => `${v} ккал`);
    syncSlider('slider-steps', 'val-steps', state.health.steps, v => `${Number(v).toLocaleString('ru-RU')} шагов`);
    syncSlider('slider-hr', 'val-hr', state.health.restingHR, v => `${v} уд/мин`);

    const bedInput = document.getElementById('input-bedtime');
    if (bedInput && bedInput.value !== state.health.bedtime) bedInput.value = state.health.bedtime;

    const syncLabel = document.getElementById('last-sync-label');
    if (syncLabel) syncLabel.textContent = state.health.lastSync;

    const formulaBox = document.getElementById('formula-breakdown');
    if (formulaBox) {
        formulaBox.innerHTML = `
            <div class="formula-line"><span>🌙 База общего сна (${state.health.sleepHours} ч из 8.0 ч):</span><strong>+${b.sleepPoints}%</strong></div>
            <div class="formula-line"><span>🟣 Бонус глубокого сна (${state.health.deepSleepHours} ч из 3.0 ч):</span><strong>+${b.deepPoints}%</strong></div>
            <div class="formula-line"><span>🕘 Режим отхода ко сну (${state.health.bedtime}):</span><strong>${b.bedtimePoints >= 0 ? '+' : ''}${b.bedtimePoints}%</strong></div>
            <div class="formula-line"><span>🔥 Физическая нагрузка (${state.health.activeCalories} ккал, ${state.health.steps} шагов):</span><strong>${b.loadPenalty}%</strong></div>
            <div class="formula-line"><span>🎛 Настрой и калибровка:</span><strong>${b.moodAdjustment + b.manualOffset >= 0 ? '+' : ''}${b.moodAdjustment + b.manualOffset}%</strong></div>
            <div class="formula-line" style="border-top:1px dashed rgba(255,255,255,0.14); padding-top:6px;">
                <span>❤️ Промежуточный итог HealthKit (утро + метаболизм):</span>
                <strong style="color:#4ade80;">${b.baseHealthTotal}%</strong>
            </div>
            <div class="formula-line"><span>⚡ Динамический расход/заряд закрытых задач:</span><strong>${b.tasksNetDelta >= 0 ? '+' : ''}${b.tasksNetDelta}%</strong></div>
            <div class="formula-line" style="border-top:1px solid rgba(255,255,255,0.18); padding-top:8px; margin-top:4px;">
                <span>🔋 Итоговый заряд на главном экране:</span>
                <strong style="color:var(--neon-cyan); font-size:1rem;">${b.total}% (Риск: ${b.overloadRisk}%)</strong>
            </div>
        `;
    }

    const base = window.location.origin + window.location.pathname;
    const templateBox = document.getElementById('healthkit-shortcut-template');
    if (templateBox) {
        templateBox.textContent = `${base}?sleep=[Сон]&deep=[ГлубокийСон]&bedtime=23:00&calories=[Калории]&steps=[Шаги]&hr=[Пульс]&cal=[СобытияДня]&tasks=[СписокЗадач]&autoSync=1`;
    }

    const urlBox = document.getElementById('healthkit-shortcut-url');
    if (urlBox) {
        urlBox.textContent = `${base}?sleep=${state.health.sleepHours}&deep=${state.health.deepSleepHours}&bedtime=${state.health.bedtime}&calories=${state.health.activeCalories}&steps=${state.health.steps}&hr=${state.health.restingHR}&autoSync=1`;
    }
}

function syncSlider(sliderId, labelId, val, fmt) {
    const s = document.getElementById(sliderId);
    if (s && String(s.value) !== String(val)) s.value = val;
    const l = document.getElementById(labelId);
    if (l) l.textContent = fmt(val);
}

/* =========================================================
   7. УПРАВЛЕНИЕ СЛОТАМИ БЕЗ ДУБЛИРОВАНИЯ (v4.1 ANTI-DUPLICATE)
   ========================================================= */
function fillNearestFreeWindow(title, energy = 'medium', slotId = null) {
    if (!title || !title.trim()) return;
    const cleanTitle = title.trim();

    // 1. Проверяем, нет ли уже такой задачи в расписании на сегодня
    const existing = state.schedule.find(s => s.title.trim().toLowerCase() === cleanTitle.toLowerCase());
    if (existing && !slotId) {
        existing.done = false;
        existing.energy = energy;
        renderAll();
        return;
    }

    // 2. Ищем целевое или ближайшее свободное окно
    let slot = slotId
        ? state.schedule.find(s => s.id === slotId)
        : state.schedule.find(s => s.type === 'free' && !s.done);

    // 3. Если свободных окон нет — берём ближайший невыполненный рабочий слот
    if (!slot) {
        slot = state.schedule.find(s => !s.done && s.type !== 'routine');
    }

    if (slot) {
        slot.title = cleanTitle;
        slot.type = energy === 'rest' ? 'break' : 'work';
        slot.energy = energy;
        slot.done = false;
    } else {
        // 4. Если все слоты дня закрыты — вычисляем время строго от конца последнего слота (без штамповки 19:00-20:00)
        const sorted = [...state.schedule].sort((a, b) => timeToMinutes(a.end) - timeToMinutes(b.end));
        const lastEndMin = sorted.length ? timeToMinutes(sorted[sorted.length - 1].end) : 18 * 60;
        const newStartMin = Math.min(21 * 60, Math.max(9 * 60, lastEndMin));
        const newEndMin = Math.min(22 * 60 + 30, newStartMin + 60);

        state.schedule.push({
            id: 'slot-' + Date.now(),
            start: minutesToTime(newStartMin),
            end: minutesToTime(newEndMin),
            title: cleanTitle,
            type: energy === 'rest' ? 'break' : 'work',
            energy,
            done: false
        });
    }

    state.schedule = deduplicateScheduleArray(state.schedule);
    renderAll();
}

function assignCustomToFreeWindow() {
    const input = document.getElementById('custom-window-input');
    if (!input || !input.value.trim()) return;
    const cls = classifyEnergyByText(input.value.trim());
    fillNearestFreeWindow(input.value.trim(), cls.energy);
    input.value = '';
}

function promptFillFreeSlot(slotId) {
    const slot = state.schedule.find(s => s.id === slotId);
    if (!slot) return;
    const score = getBatteryScore();
    const suggested = score >= 70
        ? (state.tasks.find(t => t.category === 'A') || state.tasks[0])
        : (state.tasks.find(t => t.category !== 'A') || state.tasks[0]);
    const text = prompt(`Занять окно ${slot.start} — ${slot.end}:`, suggested ? suggested.title : 'Проверка стоп-точек');
    if (text && text.trim()) {
        const cls = classifyEnergyByText(text.trim());
        fillNearestFreeWindow(text.trim(), cls.energy, slotId);
    }
}

function toggleSlotDone(slotId) {
    const slot = state.schedule.find(s => s.id === slotId);
    if (slot) {
        slot.done = !slot.done;
        renderAll();
    }
}

function clearOrRemoveSlot(slotId) {
    const slot = state.schedule.find(s => s.id === slotId);
    if (!slot) return;
    if (slot.type !== 'free') {
        slot.title = 'Свободное окно';
        slot.type = 'free';
        slot.energy = 'medium';
        slot.done = false;
        delete slot.source;
    } else if (state.schedule.length > 1) {
        state.schedule = state.schedule.filter(s => s.id !== slotId);
    }
    renderAll();
}

function completeCurrentFocus() {
    const current = state.schedule.find(s => !s.done && s.type !== 'free') || state.schedule.find(s => !s.done);
    if (current) {
        current.done = true;
        renderAll();
    }
}

function shiftSchedule(mins = 30) {
    state.schedule.forEach(slot => {
        if (!slot.done) {
            slot.start = addMinutes(slot.start, mins);
            slot.end = addMinutes(slot.end, mins);
        }
    });
    renderAll();
}

function timeToMinutes(timeStr) {
    const [h, m] = String(timeStr || '09:00').split(':').map(Number);
    if (isNaN(h)) return 540;
    return h * 60 + (m || 0);
}

function minutesToTime(totalMins) {
    const clamped = ((totalMins % 1440) + 1440) % 1440;
    const h = String(Math.floor(clamped / 60)).padStart(2, '0');
    const m = String(clamped % 60).padStart(2, '0');
    return `${h}:${m}`;
}

function addMinutes(timeStr, mins) {
    return minutesToTime(timeToMinutes(timeStr) + mins);
}

function activateLowEnergyMode() {
    state.morningMood = 'low';
    state.schedule.forEach(slot => {
        if (!slot.done && slot.energy === 'high') {
            const existsInTasks = state.tasks.some(t => t.title.toLowerCase() === slot.title.toLowerCase());
            if (!existsInTasks) {
                state.tasks.unshift({
                    id: 'task-' + Date.now(),
                    title: slot.title,
                    category: 'A',
                    complexity: 'high'
                });
            }
            slot.title = 'Перерыв и щадящая работа по чек-листу (перенесено в бэклог)';
            slot.energy = 'rest';
        }
    });
    renderAll();
}

function autoFillScheduleByEnergy() {
    moveTomorrowToToday();
    switchPage('calendar');
}

function protectMorningBlock() {
    const morning = state.schedule.find(s => s.start.startsWith('09') || s.start.startsWith('10')) || state.schedule[0];
    if (morning) {
        morning.title = '🛡️ Защищённый блок Кат. А: Главная задача без телефона';
        morning.type = 'focus';
        morning.energy = 'high';
        morning.done = false;
    }
    renderAll();
}

/* =========================================================
   8. УПРАВЛЕНИЕ ЗАДАЧАМИ, НАПОМИНАНИЯМИ И МОДАЛЬНЫМИ ОКНАМИ
   ========================================================= */
function addTomorrowTask() {
    const input = document.getElementById('tomorrow-input');
    const select = document.getElementById('task-category-select');
    if (!input || !input.value.trim()) return;

    const title = input.value.trim();
    const selVal = select ? select.value : 'AUTO';

    let cat = 'B';
    let complexity = 'medium';

    if (selVal === 'AUTO') {
        const autoCls = classifyEnergyByText(title);
        cat = autoCls.category;
        complexity = autoCls.energy;
    } else {
        cat = selVal;
        complexity = cat === 'A' ? 'high' : cat === 'B' ? 'medium' : cat === 'REST' ? 'rest' : 'low';
    }

    state.tasks.unshift({
        id: 'task-' + Date.now(),
        title,
        category: cat,
        complexity
    });
    input.value = '';
    renderAll();
}

function removeTask(taskId) {
    state.tasks = state.tasks.filter(t => t.id !== taskId);
    renderAll();
}

function scheduleTaskToToday(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    fillNearestFreeWindow(task.title, task.complexity || 'medium');
    state.tasks = state.tasks.filter(t => t.id !== taskId);
    renderAll();
}

function moveTomorrowToToday() {
    const score = getBatteryScore();
    const sorted = [...state.tasks].sort((a, b) => {
        if (score >= 70) return (a.category === 'A' ? -1 : 1) - (b.category === 'A' ? -1 : 1);
        return (a.category === 'C' ? -1 : 1) - (b.category === 'C' ? -1 : 1);
    });

    for (const task of sorted) {
        const free = state.schedule.find(s => s.type === 'free' && !s.done);
        if (!free) break;
        free.title = task.title;
        free.type = task.complexity === 'rest' ? 'break' : 'work';
        free.energy = task.complexity || 'medium';
        state.tasks = state.tasks.filter(t => t.id !== task.id);
    }
    renderAll();
}

function filterTasks(cat) {
    state.activeTaskFilter = cat;
    document.querySelectorAll('.task-filter-row .chip').forEach(btn => {
        const onClickStr = btn.getAttribute('onclick') || '';
        btn.classList.toggle('active', onClickStr.includes(`'${cat}'`));
    });
    renderAll();
}

function toggleHoldPoint(hpId) {
    const hp = state.holdPoints.find(h => h.id === hpId);
    if (hp) {
        hp.done = !hp.done;
        renderAll();
    }
}

function switchPage(pageId) {
    state.currentPage = pageId;
    document.querySelectorAll('.page-section').forEach(sec => {
        sec.classList.toggle('active', sec.id === `page-${pageId}`);
    });
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.id === `nav-${pageId}`);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    saveState();
}

function toggleDayType() {
    state.dayType = state.dayType === 'work' ? 'weekend' : 'work';
    renderAll();
}

function setDayType(type) {
    state.dayType = type === 'weekend' ? 'weekend' : 'work';
    renderAll();
}

function setMorningMood(mood) {
    state.morningMood = mood;
    renderAll();
}

function changeSleepScore(delta) {
    state.manualOffset = Math.max(-35, Math.min(35, (state.manualOffset || 0) + Number(delta)));
    renderAll();
}

function updateHealthMetric(key, val) {
    state.health[key] = key === 'bedtime' ? val : Number(val);
    state.health.lastSync = 'Откалибровано вручную • только что';
    renderAll();
}

function handleRecommendationAction(idx) {
    const rec = generateFourRecommendations()[idx];
    if (!rec) return;
    if (rec.actionPage) {
        switchPage(rec.actionPage);
    } else if (rec.actionTask) {
        fillNearestFreeWindow(rec.actionTask, rec.actionEnergy || 'high');
    }
}

function checkFirstLaunchPermissions() {
    const granted = localStorage.getItem(PERMISSIONS_KEY);
    if (!granted) {
        document.getElementById('permissions-modal')?.classList.remove('hidden');
    }
}

function openPermissionsModal() {
    document.getElementById('permissions-modal')?.classList.remove('hidden');
}

function closePermissionsModal() {
    document.getElementById('permissions-modal')?.classList.add('hidden');
}

function openSyncHubModal() {
    const savedClientId = localStorage.getItem(GOOGLE_CLIENT_ID_KEY) || '';
    const input = document.getElementById('google-client-id-input');
    if (input && savedClientId) input.value = savedClientId;
    document.getElementById('sync-hub-modal')?.classList.remove('hidden');
}

async function grantHealthPermission() {
    const btn = document.getElementById('perm-health-btn');
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Health) {
        try {
            await window.Capacitor.Plugins.Health.requestAuthorization({
                read: ['steps', 'sleep', 'calories', 'heartRate'],
                write: []
            });
        } catch (err) {
            console.warn('Capacitor HealthKit prompt:', err);
        }
    }
    if (btn) {
        btn.textContent = 'Подключено ✓';
        btn.style.background = 'rgba(16, 185, 129, 0.25)';
        btn.style.color = '#4ade80';
    }
    triggerAutoSyncNow();
}

async function requestNotificationPermission() {
    const btn = document.getElementById('perm-notif-btn');
    if ('Notification' in window) {
        const res = await Notification.requestPermission();
        if (btn) btn.textContent = res === 'granted' ? 'Разрешено ✓' : 'Активно ✓';
    } else if (btn) {
        btn.textContent = 'Активно ✓';
    }
}

function completeOnboardingPermissions() {
    localStorage.setItem(PERMISSIONS_KEY, 'true');
    requestNotificationPermission();
    grantHealthPermission();
    closePermissionsModal();
}

function openAddSlotModal() {
    document.getElementById('add-slot-modal')?.classList.remove('hidden');
}

function openAlarmModal() {
    document.getElementById('alarm-modal')?.classList.remove('hidden');
}

function openStepsModal() {
    const modal = document.getElementById('steps-modal');
    const input = document.getElementById('steps-input');
    if (input) input.value = state.health.steps;
    if (modal) modal.classList.remove('hidden');
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

function saveNewSlot() {
    const start = document.getElementById('new-slot-start')?.value || '14:00';
    const end = document.getElementById('new-slot-end')?.value || '15:30';
    const title = document.getElementById('new-slot-title')?.value.trim() || 'Свободное окно';
    const energy = document.getElementById('new-slot-energy')?.value || 'medium';

    state.schedule.push({
        id: 'slot-' + Date.now(),
        start,
        end,
        title,
        type: energy === 'free' ? 'free' : energy === 'rest' ? 'break' : 'work',
        energy,
        done: false
    });
    state.schedule = deduplicateScheduleArray(state.schedule);
    closeAllModals();
    renderAll();
}

function saveAlarmSettings() {
    const time = document.getElementById('alarm-time-input')?.value || '07:30';
    const enabled = document.getElementById('alarm-enabled-input')?.checked ?? true;
    state.alarm = { time, enabled };
    closeAllModals();
    renderAll();
}

function saveStepsManual() {
    const val = parseInt(document.getElementById('steps-input')?.value, 10);
    if (!isNaN(val) && val >= 0) {
        state.health.steps = val;
        state.health.lastSync = 'Шаги обновлены • только что';
    }
    closeAllModals();
    renderAll();
}

function copyShortcutTemplateUrl() {
    const box = document.getElementById('healthkit-shortcut-template');
    if (box && navigator.clipboard) {
        navigator.clipboard.writeText(box.textContent.trim());
        alert('Шаблон с динамическими переменными для «Команд» iOS скопирован!');
    }
}

function copyShortcutUrl() {
    const box = document.getElementById('healthkit-shortcut-url');
    if (box && navigator.clipboard) {
        navigator.clipboard.writeText(box.textContent.trim());
        alert('Тестовая ссылка скопирована в буфер обмена!');
    }
}

function startVoiceInput(inputId, btnId) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const input = document.getElementById(inputId);
    const btn = document.getElementById(btnId);

    if (!SpeechRecognition) {
        if (input) input.focus();
        return;
    }

    const rec = new SpeechRecognition();
    rec.lang = 'ru-RU';
    rec.interimResults = false;
    if (btn) btn.style.borderColor = '#f43f5e';
    rec.start();

    rec.onresult = (e) => {
        if (input) input.value = e.results[0][0].transcript;
    };
    rec.onend = () => {
        if (btn) btn.style.borderColor = '';
    };
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* =========================================================
   9. АВТОЗАПУСК ПРИ ОТКРЫТИИ ПРИЛОЖЕНИЯ
   ========================================================= */
document.addEventListener('DOMContentLoaded', () => {
    parseUrlHealthTelemetry();
    checkFirstLaunchPermissions();
    renderAll();

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            parseUrlHealthTelemetry();
            renderAll();
        }
    });
});
