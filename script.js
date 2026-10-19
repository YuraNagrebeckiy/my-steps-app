/**
 * Ритм Дня — Управление Энергией, Здоровьем (HealthKit), Календарём и Задачами
 * Персональная система Юрия Нагребецкого (yuranagrebeckiy.github.io)
 */

const STORAGE_KEY = 'ritm_dnya_state_v3';

const defaultState = {
  dayType: 'work', // 'work' | 'weekend'
  morningMood: 'high', // 'high' | 'medium' | 'low'
  manualOffset: 0,
  health: {
    sleepHours: 8.0,
    deepSleepHours: 3.0,
    bedtime: '22:45',
    activeCalories: 420,
    steps: 4250,
    stepsGoal: 8000,
    restingHR: 59,
    lastSync: 'Сегодня, утренний чек-ин'
  },
  alarm: {
    time: '07:30',
    enabled: true,
    triggeredToday: false
  },
  gcal: {
    connected: false,
    lastSync: null,
    eventsCount: 0
  },
  holdPoints: [
    { id: 'hp-1', title: 'Защищён первый утренний блок (45–60 мин на главную задачу без телефона)', done: false },
    { id: 'hp-2', title: 'Стоп-точка 1: Проверено фактическое качество работ на объекте', done: false },
    { id: 'hp-3', title: 'Стоп-точка 2: Сверены реальные объёмы перед закрытием этапа', done: false },
    { id: 'hp-4', title: 'Стоп-точка 3: Получена исполнительная документация от подрядчика', done: false },
    { id: 'hp-5', title: 'Отказ от «спасательства»: риски озвучены сразу, смежникам выдан чек-лист', done: false }
  ],
  weeklyWins: [
    'Предотвращён риск по узлам примыкания и вентиляции до начала чистовой отделки',
    'Введены жёсткие стоп-точки приёмки работ (качество + объём + документация)'
  ],
  schedule: [
    {
      id: 'slot-1',
      start: '08:30',
      end: '09:30',
      title: 'Подъём по будильнику, завтрак, утренний чек-ин',
      type: 'routine',
      energy: 'low',
      done: true
    },
    {
      id: 'slot-2',
      start: '09:30',
      end: '10:30',
      title: 'Защищённый блок: Главная стратегическая задача (без телефона)',
      type: 'focus',
      energy: 'high',
      done: false
    },
    {
      id: 'slot-3',
      start: '10:30',
      end: '13:00',
      title: 'Свободное окно',
      type: 'free',
      energy: 'high',
      done: false
    },
    {
      id: 'slot-4',
      start: '13:00',
      end: '14:00',
      title: 'Обед и переключение (спокойный темп без перегруза)',
      type: 'break',
      energy: 'low',
      done: false
    },
    {
      id: 'slot-5',
      start: '14:00',
      end: '16:30',
      title: 'Свободное окно',
      type: 'free',
      energy: 'medium',
      done: false
    },
    {
      id: 'slot-6',
      start: '17:00',
      end: '19:00',
      title: 'Свободное окно',
      type: 'free',
      energy: 'low',
      done: false
    },
    {
      id: 'slot-7',
      start: '20:00',
      end: '21:00',
      title: 'Английский (Duolingo 15 мин) и спокойный отдых',
      type: 'routine',
      energy: 'low',
      done: false
    }
  ],
  tasks: [
    {
      id: 'task-1',
      title: 'Согласовать с Олегом конструктив лестницы, узлы и поручень',
      category: 'A',
      complexity: 'high',
      project: 'Частный дом / Лестница'
    },
    {
      id: 'task-2',
      title: 'Падел-клуб / ЖК Lucky — аудит критических узлов и стоп-точек приёмки',
      category: 'A',
      complexity: 'high',
      project: 'Ключевые объекты'
    },
    {
      id: 'task-3',
      title: 'Проверить спецификацию по лаку и диффузоры вентиляции с Антоном',
      category: 'B',
      complexity: 'medium',
      project: 'Комплектация и смежники'
    },
    {
      id: 'task-4',
      title: 'Отправить подрядчику чек-лист приёмки вместо ручной переделки чертежей',
      category: 'B',
      complexity: 'medium',
      project: 'Делегирование (Категория Б)'
    },
    {
      id: 'task-5',
      title: 'Зафиксировать 3 главных результата недели и предотвращённые риски',
      category: 'C',
      complexity: 'low',
      project: 'Видимость вклада'
    }
  ],
  weekendIdeas: [
    'Тур выходного дня с Катариной по неизведанным местам области под новый звук в W124',
    'Поездка к морю или в лесной маршрут без единого рабочего звонка',
    'Вкусный семейный обед в новом месте и прогулка в своём темпе'
  ],
  activeTaskFilter: 'all',
  currentPage: 'home'
};

let state = loadState();
let deferredInstallPrompt = null;
let selectedFreeSlotId = null;

/* ==========================================
   1. ЗАГРУЗКА И СОХРАНЕНИЕ СОСТОЯНИЯ
   ========================================== */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return JSON.parse(JSON.stringify(defaultState));
    const parsed = JSON.parse(raw);
    return {
      ...defaultState,
      ...parsed,
      health: { ...defaultState.health, ...(parsed.health || {}) },
      alarm: { ...defaultState.alarm, ...(parsed.alarm || {}) },
      gcal: { ...defaultState.gcal, ...(parsed.gcal || {}) },
      schedule: Array.isArray(parsed.schedule) && parsed.schedule.length ? parsed.schedule : defaultState.schedule,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : defaultState.tasks,
      holdPoints: Array.isArray(parsed.holdPoints) ? parsed.holdPoints : defaultState.holdPoints,
      weeklyWins: Array.isArray(parsed.weeklyWins) ? parsed.weeklyWins : defaultState.weeklyWins
    };
  } catch (e) {
    return JSON.parse(JSON.stringify(defaultState));
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Не удалось сохранить состояние в localStorage:', e);
  }
}

/* ==========================================
   2. УМНАЯ ФОРМУЛА БАТАРЕЙКИ ЭНЕРГИИ (HealthKit)
   ========================================== */
function parseBedtimePenaltyOrBonus(bedtimeStr) {
  if (!bedtimeStr || typeof bedtimeStr !== 'string') return 0;
  const parts = bedtimeStr.split(':').map(Number);
  if (parts.length < 2 || isNaN(parts[0])) return 0;
  const hour = parts[0];
  const minute = parts[1] || 0;
  const decimalHour = hour + minute / 60;

  // Отбой с 21:00 до 23:30 даёт бонус +5% к восстановлению
  if (decimalHour >= 20 && decimalHour <= 23.5) {
    return 5;
  }
  // Отбой с 23:30 до 00:30 — нейтрально (0%)
  if (decimalHour > 23.5 || decimalHour < 0.5) {
    return 0;
  }
  // Поздний отбой после 00:30 до 06:00 снижает восстановление (до -12%)
  if (decimalHour >= 0.5 && decimalHour <= 6) {
    return -Math.min(12, Math.round(decimalHour * 3.5));
  }
  return 0;
}

function calculateEnergyBreakdown() {
  const { sleepHours, deepSleepHours, bedtime, activeCalories, steps, restingHR } = state.health;

  // 1. Общий сон: 8+ часов = 70 базовых баллов (при 8ч+ и хорошем глубоком сне = 100%)
  const sleepRatio = Math.min(Math.max(sleepHours, 0) / 8.0, 1.0);
  const sleepPoints = Math.round(sleepRatio * 70);

  // 2. Глубокий сон: 3 часа = максимальный бонус +25 баллов
  const deepRatio = Math.min(Math.max(deepSleepHours, 0) / 3.0, 1.0);
  const deepPoints = Math.round(deepRatio * 25);

  // 3. Время отхода ко сну: от -12 до +5 баллов
  const bedtimePoints = parseBedtimePenaltyOrBonus(bedtime);

  // 4. Физическая нагрузка (активные калории + шаги + пульс в покое)
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

  // Настроение с утра (небольшая субъективная коррекция)
  let moodAdjustment = 0;
  if (state.morningMood === 'high') moodAdjustment = 4;
  if (state.morningMood === 'low') moodAdjustment = -10;

  let rawTotal = sleepPoints + deepPoints + bedtimePoints + loadPenalty + moodAdjustment + (state.manualOffset || 0);

  // Если спал >= 8 часов и глубокий сон >= 3 часов без перегруза и без ручного минуса — батарейка 100%
  if (
    sleepHours >= 8.0 &&
    deepSleepHours >= 3.0 &&
    bedtimePoints >= 0 &&
    loadPenalty === 0 &&
    state.morningMood !== 'low' &&
    (state.manualOffset || 0) >= 0
  ) {
    rawTotal = 100;
  }

  const total = Math.max(10, Math.min(100, Math.round(rawTotal)));

  return {
    total,
    sleepPoints,
    deepPoints,
    bedtimePoints,
    loadPenalty,
    moodAdjustment,
    manualOffset: state.manualOffset || 0
  };
}

function getBatteryScore() {
  return calculateEnergyBreakdown().total;
}

function getEnergyLevelTag(score) {
  if (score >= 75) return { level: 'high', label: '🔥 Высокий ресурс', emoji: '🔋', color: 'linear-gradient(90deg, #22c55e, #4ade80)' };
  if (score >= 50) return { level: 'medium', label: '👍 Умеренный ресурс', emoji: '⚡', color: 'linear-gradient(90deg, #eab308, #facc15)' };
  return { level: 'low', label: '🛋️ Низкий ресурс (Беречь силы)', emoji: '🪫', color: 'linear-gradient(90deg, #ef4444, #f87171)' };
}

/* ==========================================
   3. ГЕНЕРАЦИЯ 4 ДИНАМИЧЕСКИХ КАРТОЧЕК РЕКОМЕНДАЦИЙ
   ========================================== */
function generateFourRecommendations() {
  const score = getBatteryScore();
  const isHigh = score >= 70;
  const isWorkday = state.dayType === 'work';

  const heavyTaskObj = state.tasks.find(t => t.category === 'A' || t.complexity === 'high');
  const mediumTaskObj = state.tasks.find(t => t.category === 'B' || t.complexity === 'medium');
  const lightTaskObj = state.tasks.find(t => t.category === 'C' || t.complexity === 'low');

  const heavyTitle = heavyTaskObj ? heavyTaskObj.title : 'Самая сложная отложенная задача по объекту (Категория А)';
  const lightTitle = lightTaskObj
    ? lightTaskObj.title
    : mediumTaskObj
    ? mediumTaskObj.title
    : 'Проверить спецификацию и отправить чек-лист смежникам';

  // СЦЕНАРИЙ 1: БУДНИЙ ДЕНЬ + ВЫСОКИЙ ЗАРЯД (70–100%)
  if (isWorkday && isHigh) {
    return [
      {
        num: '01 • ГЛАВНЫЙ ПРОРЫВ',
        title: '🚀 Готов к большим свершениям',
        text: `Заряд ${score}% (сон ${state.health.sleepHours}ч, глубокий ${state.health.deepSleepHours}ч). Забери в первое окно самую тяжёлую задачу, которую откладывал: «${heavyTitle}».`,
        priority: 'priority-high',
        actionLabel: 'Поставить в утреннее окно →',
        actionTask: heavyTitle,
        actionEnergy: 'high'
      },
      {
        num: '02 • ЗАЩИТА ВРЕМЕНИ',
        title: '🛡️ 60 минут тишины (Категория А)',
        text: 'Убери телефон на первый рабочий час. Решай только критические узлы и конструктив, где твоя компетенция создаёт главную ценность.',
        priority: 'priority-high',
        actionLabel: 'Активировать фокус-блок',
        actionTask: 'Глубокий фокус: критические узлы и чертежи (без телефона)',
        actionEnergy: 'high'
      },
      {
        num: '03 • СИСТЕМА КОНТРОЛЯ',
        title: '🛑 Стоп-точки вместо «спасательства»',
        text: 'На объекте проверяй только 3 стоп-точки: качество, объём и документацию. Не доделывай работу за подрядчиков — выдай чек-лист и срок.',
        priority: '',
        actionLabel: 'Открыть стоп-точки',
        actionPage: 'tasks'
      },
      {
        num: '04 • БАЛАНС И ВИДИМОСТЬ',
        title: '📊 Фиксация результата дня',
        text: 'Оставь созвоны и мелкую рутину на послеобеденное окно, а вечером запиши 1–2 предотвращённых риска в сводку недели.',
        priority: '',
        actionLabel: 'Запланировать созвоны',
        actionTask: 'Созвоны со смежниками и фиксация итогов дня',
        actionEnergy: 'medium'
      }
    ];
  }

  // СЦЕНАРИЙ 2: БУДНИЙ ДЕНЬ + НИЗКИЙ/СРЕДНИЙ ЗАРЯД (< 70%)
  if (isWorkday && !isHigh) {
    return [
      {
        num: '01 • БЕРЕЖНЫЙ РЕЖИМ',
        title: '🔋 Побереги силы и ресурс',
        text: `Заряд ${score}%. Сегодня важно позаботиться о себе и не тратить много энергии. Отложи тяжёлые расчёты и сложные узлы на день с высоким зарядом.`,
        priority: 'priority-low',
        actionLabel: 'Включить щадящий темп',
        actionTask: 'Спокойный рабочий блок без перегруза',
        actionEnergy: 'low'
      },
      {
        num: '02 • ЛЁГКИЕ ЗАДАЧИ',
        title: '🌿 Простая рутина (Категория Б и В)',
        text: `Закрой простые и понятные задачи, которые не выжимают ресурс: «${lightTitle}».`,
        priority: 'priority-low',
        actionLabel: 'Поставить лёгкую задачу →',
        actionTask: lightTitle,
        actionEnergy: 'low'
      },
      {
        num: '03 • ЖЁСТКОЕ ДЕЛЕГИРОВАНИЕ',
        title: '📋 Никакой работы «за троих»',
        text: 'При обнаружении ошибки смежника не садись перечерчивать сам — сразу озвучь риск в чате и запроси от них готовый вариант решения.',
        priority: '',
        actionLabel: 'Поставить проверку по чек-листу',
        actionTask: 'Быстрая проверка статуса подрядчиков по чек-листу',
        actionEnergy: 'low'
      },
      {
        num: '04 • ВОССТАНОВЛЕНИЕ',
        title: '🌙 Ранний стоп и глубокий сон',
        text: 'Обязательный спокойный обед в 13:00, завершение работы без задержек и отбой до 22:45, чтобы набрать 3 часа глубокого сна.',
        priority: '',
        actionLabel: 'Настроить сон и отбой',
        actionPage: 'health'
      }
    ];
  }

  // СЦЕНАРИЙ 3: ВЫХОДНОЙ ДЕНЬ + ВЫСОКИЙ ЗАРЯД (70–100%)
  if (!isWorkday && isHigh) {
    return [
      {
        num: '01 • ИСПОЛНЕНИЕ МЕЧТЫ',
        title: '🌍 Поезжай туда, где мечтал побывать!',
        text: `Заряд ${score}% и выходной день! Ты давно мечтал выбраться в красивое место и сменить обстановку — едь и исполняй свои мечты вместе с Катариной.`,
        priority: 'priority-high',
        actionLabel: 'Запланировать выезд мечты →',
        actionTask: 'Тур выходного дня: поездка в новое место с Катариной',
        actionEnergy: 'high'
      },
      {
        num: '02 • САУНДТРЕК МАРШРУТА',
        title: '🚗 Удовольствие за рулём W124',
        text: 'Включи любимый плейлист на качественном звуке, выбери неизведанный маршрут вдали от рабочих объектов и наслаждайся дорогой.',
        priority: 'priority-high',
        actionLabel: 'Поставить маршрут в план',
        actionTask: 'Автопрогулка под любимую музыку по новому маршруту',
        actionEnergy: 'medium'
      },
      {
        num: '03 • ЭНЕРГИЯ ДЛЯ СЕБЯ',
        title: '⚡ Активный отдых и хобби',
        text: 'Используй высокий ресурс для того, что заряжает лично тебя: спорт, прогулка на природе, фотография или тёплая встреча с близкими.',
        priority: '',
        actionLabel: 'Добавить активный отдых',
        actionTask: 'Активная прогулка и время для себя и семьи',
        actionEnergy: 'medium'
      },
      {
        num: '04 • СВОБОДА ОТ СТРОЙКИ',
        title: '🔕 Полный детокс от рабочих чатов',
        text: 'Никаких смет и чертежей в выходной. Если пришла рабочая мысль — запиши её за 10 секунд в блок «На завтра» и забудь до понедельника.',
        priority: '',
        actionLabel: 'Записать мысль на завтра',
        actionPage: 'tasks'
      }
    ];
  }

  // СЦЕНАРИЙ 4: ВЫХОДНОЙ ДЕНЬ + НИЗКИЙ ЗАРЯД (< 70%)
  return [
    {
      num: '01 • ПОЛНАЯ ПЕРЕЗАГРУЗКА',
      title: '🛋️ Отдыхай, ничего не делай, кайфуй!',
      text: `Заряд ${score}% и выходной день. Главная задача на сегодня — официально ничего не делать, отдыхать без чувства вины и восстанавливать нервную систему.`,
      priority: 'priority-low',
      actionLabel: 'Включить режим полного отдыха →',
      actionTask: 'Полный отдых, перезагрузка и день без обязательств',
      actionEnergy: 'low'
    },
    {
      num: '02 • БЕЗ БЫТОВЫХ ПОДВИГОВ',
      title: '🚫 Отложи стройку и тяжёлый быт',
      text: 'Не затевай сложный ремонт по дому или дальние утомительные поездки. Твоему телу сейчас нужен покой для глубокого восстановления.',
      priority: 'priority-low',
      actionLabel: 'Освободить день от дел',
      actionTask: 'Свободное время в спокойном домашнем темпе',
      actionEnergy: 'low'
    },
    {
      num: '03 • УЮТ И УДОВОЛЬСТВИЕ',
      title: '🍵 Вкусная еда, кино и дневной сон',
      text: 'Вкусный обед, любимый фильм с Катариной, 40 минут дневного сна или неспешная прогулка на свежем воздухе у дома.',
      priority: '',
      actionLabel: 'Поставить тихий час / кино',
      actionTask: 'Дневной сон, вкусный обед и спокойный фильм',
      actionEnergy: 'low'
    },
    {
      num: '04 • ГЛУБОКАЯ ЗАРЯДКА НА НЕДЕЛЮ',
      title: '🌙 8+ часов сна и 3 часа глубокой фазы',
      text: 'Проветри спальню и ляг спать до 22:30, чтобы к утру понедельника зарядить батарейку на честные 100%.',
      priority: '',
      actionLabel: 'Проверить параметры сна',
      actionPage: 'health'
    }
  ];
}

/* ==========================================
   4. ОБНОВЛЕНИЕ ИНТЕРФЕЙСА (РЕНДЕРИНГ ВСЕХ БЛОКОВ)
   ========================================== */
function renderAll() {
  renderDateHeader();
  renderBatteryAndHealth();
  renderDayTypeAndMoodUI();
  renderFourRecommendationsUI();
  renderCoordinatorCard();
  renderFocusCard();
  renderTimeline();
  renderTasksAndHoldPoints();
  renderAlarmUI();
  renderGcalUI();
  saveState();
}

function renderDateHeader() {
  const dateEl = document.getElementById('current-date');
  if (dateEl) {
    const now = new Date();
    const formatted = now.toLocaleDateString('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
    dateEl.textContent = formatted.toUpperCase();
  }
}

function renderBatteryAndHealth() {
  const breakdown = calculateEnergyBreakdown();
  const score = breakdown.total;
  const tagInfo = getEnergyLevelTag(score);

  const scoreEl = document.getElementById('sleep-score');
  if (scoreEl) scoreEl.textContent = `${score}%`;

  const emojiEl = document.getElementById('battery-emoji');
  if (emojiEl) emojiEl.textContent = tagInfo.emoji;

  const stateTagEl = document.getElementById('battery-state-tag');
  if (stateTagEl) {
    stateTagEl.textContent = tagInfo.label;
    stateTagEl.style.background =
      tagInfo.level === 'high'
        ? 'rgba(34, 197, 94, 0.15)'
        : tagInfo.level === 'medium'
        ? 'rgba(234, 179, 8, 0.18)'
        : 'rgba(239, 68, 68, 0.18)';
    stateTagEl.style.color =
      tagInfo.level === 'high' ? '#4ade80' : tagInfo.level === 'medium' ? '#facc15' : '#f87171';
  }

  const barFill = document.getElementById('battery-bar-fill');
  if (barFill) {
    barFill.style.width = `${score}%`;
    barFill.style.background = tagInfo.color;
  }

  // Мини-метрики под батарейкой
  const mSleep = document.getElementById('metric-sleep-hours');
  if (mSleep) mSleep.textContent = `${Number(state.health.sleepHours).toFixed(1)} ч`;

  const mDeep = document.getElementById('metric-deep-sleep');
  if (mDeep) mDeep.textContent = `${Number(state.health.deepSleepHours).toFixed(1)} ч`;

  const mBed = document.getElementById('metric-bedtime');
  if (mBed) mBed.textContent = state.health.bedtime || '22:45';

  const mCal = document.getElementById('metric-calories');
  if (mCal) mCal.textContent = `${state.health.activeCalories} ккал`;

  // Ручная коррекция и шаги в статус-баре
  const offsetEls = document.querySelectorAll('#manual-offset, #battery-offset-val, #sleep-offset');
  offsetEls.forEach(el => {
    const sign = state.manualOffset > 0 ? '+' : '';
    el.textContent = `${sign}${state.manualOffset || 0}%`;
  });

  const stepsEls = document.querySelectorAll('#steps-count, #steps-value, #metric-steps');
  stepsEls.forEach(el => {
    el.textContent = Number(state.health.steps).toLocaleString('ru-RU');
  });

  const stepsGoalEls = document.querySelectorAll('#steps-goal');
  stepsGoalEls.forEach(el => {
    el.textContent = `/ ${Number(state.health.stepsGoal || 8000).toLocaleString('ru-RU')}`;
  });

  // Слайдеры и значения на вкладке «Здоровье и Сон»
  syncSliderAndLabel('slider-sleep', 'val-sleep-hours', state.health.sleepHours, v => `${Number(v).toFixed(1)} ч`);
  syncSliderAndLabel('slider-deep', 'val-deep-sleep', state.health.deepSleepHours, v => `${Number(v).toFixed(1)} ч`);
  syncSliderAndLabel('slider-calories', 'val-calories', state.health.activeCalories, v => `${v} ккал`);
  syncSliderAndLabel('slider-steps', 'val-steps', state.health.steps, v => `${Number(v).toLocaleString('ru-RU')} шагов`);
  syncSliderAndLabel('slider-hr', 'val-hr', state.health.restingHR, v => `${v} уд/мин`);

  const bedtimeInput = document.getElementById('input-bedtime') || document.getElementById('slider-bedtime');
  if (bedtimeInput && bedtimeInput.value !== state.health.bedtime) {
    bedtimeInput.value = state.health.bedtime;
  }
  const bedtimeVal = document.getElementById('val-bedtime');
  if (bedtimeVal) bedtimeVal.textContent = state.health.bedtime;

  // Детализация формулы на странице Здоровья
  const formulaBox = document.getElementById('formula-breakdown') || document.querySelector('.formula-breakdown');
  if (formulaBox) {
    formulaBox.innerHTML = `
      <div class="formula-line">
        <span>🌙 Общий сон (${Number(state.health.sleepHours).toFixed(1)} ч из 8.0 ч):</span>
        <strong>+${breakdown.sleepPoints}%</strong>
      </div>
      <div class="formula-line">
        <span>🌊 Глубокий сон (${Number(state.health.deepSleepHours).toFixed(1)} ч из 3.0 ч):</span>
        <strong>+${breakdown.deepPoints}%</strong>
      </div>
      <div class="formula-line">
        <span>🕙 Время отхода ко сну (${state.health.bedtime}):</span>
        <strong>${breakdown.bedtimePoints >= 0 ? '+' : ''}${breakdown.bedtimePoints}%</strong>
      </div>
      <div class="formula-line">
        <span>🔥 Нагрузка (${state.health.activeCalories} ккал, ${state.health.steps} шагов, пульс ${state.health.restingHR}):</span>
        <strong>${breakdown.loadPenalty}%</strong>
      </div>
      <div class="formula-line">
        <span>⚡ Самочувствие и ручная коррекция:</span>
        <strong>${breakdown.moodAdjustment + breakdown.manualOffset >= 0 ? '+' : ''}${breakdown.moodAdjustment + breakdown.manualOffset}%</strong>
      </div>
      <div class="formula-line" style="border-top:1px solid var(--border-color); padding-top:6px; margin-top:4px;">
        <span>🔋 Итоговый заряд батареи:</span>
        <strong style="color:var(--accent-green); font-size:14px;">${breakdown.total}%</strong>
      </div>
    `;
  }

  // Ссылка для автоматизации Команд iOS (Apple HealthKit -> URL)
  const shortcutUrlBox = document.getElementById('healthkit-shortcut-url') || document.querySelector('.code-box');
  if (shortcutUrlBox) {
    const baseUrl = window.location.origin + window.location.pathname;
    shortcutUrlBox.textContent = `${baseUrl}?sleep=8.0&deep=3.0&bedtime=22:45&calories=420&steps=5000&hr=58`;
  }
}

function syncSliderAndLabel(sliderId, labelId, val, formatter) {
  const slider = document.getElementById(sliderId);
  if (slider && String(slider.value) !== String(val)) {
    slider.value = val;
  }
  const label = document.getElementById(labelId);
  if (label) {
    label.textContent = formatter(val);
  }
}

function renderDayTypeAndMoodUI() {
  const isWork = state.dayType === 'work';

  const topToggle = document.getElementById('day-type-toggle');
  if (topToggle) {
    topToggle.innerHTML = isWork ? '🛠️ Рабочий' : '☕ Выходной';
  }

  // Кнопки чек-ина (Будний или Выходной)
  const checkinBtns = document.querySelectorAll('.checkin-btn');
  checkinBtns.forEach(btn => {
    const text = btn.textContent.toLowerCase();
    const isWorkBtn = text.includes('работ') || text.includes('будн') || btn.id.includes('work');
    const isWeekendBtn = text.includes('выходн') || text.includes('отдых') || btn.id.includes('weekend');
    if (isWorkBtn) btn.classList.toggle('active', isWork);
    if (isWeekendBtn) btn.classList.toggle('active', !isWork);
  });

  // Кнопки утреннего самочувствия
  const energyBtns = document.querySelectorAll('.energy-btn');
  energyBtns.forEach(btn => {
    const text = btn.textContent.toLowerCase();
    let btnMood = '';
    if (text.includes('заряжен') || btn.dataset.mood === 'high') btnMood = 'high';
    else if (text.includes('нормальн') || btn.dataset.mood === 'medium') btnMood = 'medium';
    else if (text.includes('нет сил') || btn.dataset.mood === 'low') btnMood = 'low';

    if (btnMood) {
      btn.classList.toggle('active', state.morningMood === btnMood);
    }
  });
}

function renderFourRecommendationsUI() {
  const grid = document.getElementById('recommendations-grid') || document.querySelector('.recommendations-grid');
  if (!grid) return;

  const recs = generateFourRecommendations();
  grid.innerHTML = recs
    .map(
      (rec, idx) => `
      <div class="rec-item ${rec.priority || ''}">
        <div>
          <div class="rec-item-header">
            <span class="rec-num">${rec.num}</span>
          </div>
          <div class="rec-title" style="margin: 4px 0 6px;">${rec.title}</div>
          <p class="rec-text">${rec.text}</p>
        </div>
        <button class="rec-action-btn" onclick="handleRecommendationAction(${idx})">
          ${rec.actionLabel}
        </button>
      </div>
    `
    )
    .join('');
}

function handleRecommendationAction(index) {
  const recs = generateFourRecommendations();
  const rec = recs[index];
  if (!rec) return;

  if (rec.actionPage) {
    switchPage(rec.actionPage);
    return;
  }

  if (rec.actionTask) {
    fillNearestFreeWindow(rec.actionTask, rec.actionEnergy || 'high');
  }
}

function renderCoordinatorCard() {
  const score = getBatteryScore();
  const tagInfo = getEnergyLevelTag(score);

  const badgeEl =
    document.getElementById('coordinator-energy-tag') ||
    document.getElementById('energy-badge') ||
    document.querySelector('.assistant-header .energy-tag');
  if (badgeEl) {
    badgeEl.textContent = tagInfo.label;
  }

  const freeSlot = state.schedule.find(s => s.type === 'free' && !s.done);
  const textEl = document.getElementById('assistant-text') || document.querySelector('.assistant-text');
  if (!textEl) return;

  if (!freeSlot) {
    textEl.textContent =
      state.dayType === 'work'
        ? `Заряд ${score}%. Все свободные окна на сегодня распределены! Двигайся спокойно по плану и береги вечер для отдыха.`
        : `Заряд ${score}%. Выходной распланирован в удовольствие! Наслаждайся днём без рабочих чатов.`;
    return;
  }

  if (state.dayType === 'work') {
    if (score >= 70) {
      const heavyTask = state.tasks.find(t => t.category === 'A' || t.complexity === 'high');
      textEl.textContent = `У тебя свободно окно ${freeSlot.start} — ${freeSlot.end}. Высокий заряд (${score}%)! Идеальный момент, чтобы закрыть самую тяжёлую задачу: «${
        heavyTask ? heavyTask.title : 'Выезд на объект или сложные чертежи и узлы'
      }».`;
    } else {
      const lightTask = state.tasks.find(t => t.category !== 'A');
      textEl.textContent = `Свободно окно ${freeSlot.start} — ${freeSlot.end}. Заряд ${score}% — не перегружай себя. Выбери лёгкую задачу («${
        lightTask ? lightTask.title : 'Быстрый созвон или проверка по чек-листу'
      }») или сделай паузу.`;
    }
  } else {
    if (score >= 70) {
      textEl.textContent = `Выходной день, свободно окно ${freeSlot.start} — ${freeSlot.end}, заряд ${score}%! Поезжай туда, где давно мечтал побывать, или выбери активный отдых для души.`;
    } else {
      textEl.textContent = `Выходной день и заряд ${score}%. Свободное окно ${freeSlot.start} — ${freeSlot.end} лучше занять полным отдыхом, сном или спокойной прогулкой. Кайфуй!`;
    }
  }
}

function renderFocusCard() {
  const currentSlot =
    state.schedule.find(s => !s.done && s.type !== 'free') ||
    state.schedule.find(s => !s.done) ||
    state.schedule[state.schedule.length - 1];

  if (!currentSlot) return;

  const timeEl = document.getElementById('focus-time') || document.querySelector('.focus-time');
  if (timeEl) timeEl.textContent = `${currentSlot.start} — ${currentSlot.end}`;

  const titleEl = document.getElementById('focus-title') || document.querySelector('.focus-card h2');
  if (titleEl) titleEl.textContent = currentSlot.title;

  const descEl = document.getElementById('focus-desc') || document.querySelector('.focus-card p');
  if (descEl) {
    if (currentSlot.energy === 'high') {
      descEl.textContent = 'Глубокий фокус (Категория А) • Уведомления отключены, работаем без «спасательства».';
    } else if (currentSlot.type === 'free') {
      descEl.textContent = 'Свободное окно времени — выбери задачу из рекомендаций выше.';
    } else {
      descEl.textContent = 'Спокойный темп без перегруза.';
    }
  }
}

function renderTimeline() {
  const containers = document.querySelectorAll('#timeline-list, #timeline, .timeline');
  if (!containers.length) return;

  const activeSlotId = (state.schedule.find(s => !s.done) || {}).id;

  const html = state.schedule
    .map(slot => {
      const isFree = slot.type === 'free';
      const isCurrent = slot.id === activeSlotId;
      let badgeClass = 'badge-low';
      let badgeText = '🌿 Лёгкий темп';

      if (isFree) {
        badgeClass = 'badge-free';
        badgeText = '✨ Свободное окно — нажми, чтобы занять';
      } else if (slot.source === 'gcal') {
        badgeClass = 'badge-gcal';
        badgeText = '📅 Google Календарь';
      } else if (slot.energy === 'high') {
        badgeClass = 'badge-high';
        badgeText = '🔥 Высокий фокус (Категория А)';
      } else if (slot.energy === 'medium') {
        badgeClass = 'badge-medium';
        badgeText = '⚡ Средний темп (Контроль)';
      }

      return `
        <div class="slot-item ${isCurrent ? 'current' : ''} ${isFree ? 'free-window' : ''} ${slot.done ? 'done' : ''}"
             onclick="${isFree ? `promptFillFreeSlot('${slot.id}')` : ''}">
          <div class="slot-info">
            <div class="slot-time">${slot.start} — ${slot.end}</div>
            <div class="slot-title">${escapeHtml(slot.title)}</div>
            <span class="slot-badge ${badgeClass}">${badgeText}</span>
          </div>
          <div class="slot-controls" onclick="event.stopPropagation()">
            <button class="slot-btn" title="Выполнено" onclick="toggleSlotDone('${slot.id}')">✓</button>
            <button class="slot-btn" title="${isFree ? 'Удалить слот' : 'Освободить окно'}" onclick="clearOrRemoveSlot('${slot.id}')">✕</button>
          </div>
        </div>
      `;
    })
    .join('');

  containers.forEach(container => {
    container.innerHTML = html;
  });
}

function renderTasksAndHoldPoints() {
  const taskLists = document.querySelectorAll('#tomorrow-list, #tasks-list, .tomorrow-list');
  const filteredTasks = state.tasks.filter(t => {
    if (state.activeTaskFilter === 'all') return true;
    return t.category === state.activeTaskFilter || t.complexity === state.activeTaskFilter;
  });

  const tasksHtml = filteredTasks.length
    ? filteredTasks
        .map(task => {
          const catBadge =
            task.category === 'A' || task.complexity === 'high'
              ? '<span class="slot-badge badge-high">🔴 Кат. А (Тяжёлая / Высокий риск)</span>'
              : task.category === 'B' || task.complexity === 'medium'
              ? '<span class="slot-badge badge-medium">🟡 Кат. Б (Чек-лист / Контроль)</span>'
              : '<span class="slot-badge badge-low">🟢 Кат. В (Лёгкая рутина)</span>';

          return `
            <li class="tomorrow-item">
              <div class="task-item-left">
                <strong>${escapeHtml(task.title)}</strong>
                <div>${catBadge}</div>
              </div>
              <div class="task-item-actions">
                <button class="slot-btn" title="Поставить в свободное окно сегодня" onclick="scheduleTaskToToday('${task.id}')">→</button>
                <button class="slot-btn" title="Удалить задачу" onclick="removeTask('${task.id}')">✕</button>
              </div>
            </li>
          `;
        })
        .join('')
    : '<li class="tomorrow-item"><span>Список задач в этой категории пуст ✨</span></li>';

  taskLists.forEach(list => {
    list.innerHTML = tasksHtml;
  });

  // Чек-лист стоп-точек приёмки
  const hpContainer = document.getElementById('hold-points-list') || document.querySelector('.hold-points-list');
  if (hpContainer) {
    hpContainer.innerHTML = state.holdPoints
      .map(
        hp => `
        <label class="hold-point-item" onclick="toggleHoldPoint('${hp.id}')">
          <input type="checkbox" ${hp.done ? 'checked' : ''} onchange="event.stopPropagation(); toggleHoldPoint('${hp.id}')" />
          <span style="${hp.done ? 'text-decoration:line-through; opacity:0.6;' : ''}">${escapeHtml(hp.title)}</span>
        </label>
      `
      )
      .join('');
  }
}

function renderAlarmUI() {
  const badge = document.getElementById('alarm-time-badge');
  if (badge) badge.textContent = state.alarm.time;

  const statusBadge = document.querySelector('.alarm-badge');
  if (statusBadge) {
    statusBadge.textContent = state.alarm.enabled
      ? `🔔 Будильник ${state.alarm.time}`
      : '🔕 Будильник выкл';
  }
}

function renderGcalUI() {
  const btn = document.getElementById('gcal-sync-btn');
  const label = document.getElementById('gcal-status-label');
  if (btn && label) {
    if (state.gcal.connected) {
      btn.classList.add('active');
      label.textContent = `Синхр. (${state.gcal.eventsCount || 3})`;
    } else {
      btn.classList.remove('active');
      label.textContent = 'Календарь';
    }
  }
}

/* ==========================================
   5. ДЕЙСТВИЯ ПОЛЬЗОВАТЕЛЯ (ИНТЕРАКТИВ)
   ========================================== */
function switchPage(pageId) {
  const normalized = pageId === 'summary' || pageId === 'main' ? 'home' : pageId;
  state.currentPage = normalized;

  const sections = document.querySelectorAll('.page-section');
  if (sections.length) {
    let matched = false;
    sections.forEach(sec => {
      const id = sec.id.toLowerCase();
      const isMatch =
        id === `page-${normalized}` ||
        id === normalized ||
        (normalized === 'home' && (id.includes('home') || id.includes('summary') || id.includes('main'))) ||
        (normalized === 'schedule' && (id.includes('schedule') || id.includes('plan') || id.includes('calendar'))) ||
        (normalized === 'tasks' && id.includes('task')) ||
        (normalized === 'health' && id.includes('health'));

      sec.classList.toggle('active', isMatch);
      if (isMatch) matched = true;
    });
    if (!matched && sections[0]) {
      sections[0].classList.add('active');
    }
  }

  const navTabs = document.querySelectorAll('.nav-tab');
  navTabs.forEach(tab => {
    const onclickAttr = (tab.getAttribute('onclick') || '').toLowerCase();
    const isTabMatch =
      onclickAttr.includes(`'${normalized}'`) ||
      (normalized === 'home' && (onclickAttr.includes('home') || onclickAttr.includes('summary'))) ||
      (normalized === 'schedule' && (onclickAttr.includes('schedule') || onclickAttr.includes('plan')));
    tab.classList.toggle('active', isTabMatch);
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
  if (['high', 'medium', 'low'].includes(mood)) {
    state.morningMood = mood;
    renderAll();
  }
}

function changeSleepScore(delta) {
  state.manualOffset = Math.max(-35, Math.min(35, (state.manualOffset || 0) + Number(delta)));
  renderAll();
}

function updateHealthMetric(key, value) {
  if (key in state.health) {
    state.health[key] = isNaN(Number(value)) || key === 'bedtime' ? value : Number(value);
    state.health.lastSync = 'Обновлено вручную';
    renderAll();
  }
}

function fillNearestFreeWindow(taskTitle, energyLevel = 'medium', targetSlotId = null) {
  if (!taskTitle || !taskTitle.trim()) return;
  const cleanTitle = taskTitle.trim();

  let slot = targetSlotId
    ? state.schedule.find(s => s.id === targetSlotId)
    : state.schedule.find(s => s.type === 'free' && !s.done);

  if (!slot) {
    slot = state.schedule.find(s => !s.done);
  }

  if (slot) {
    slot.title = cleanTitle;
    slot.type = 'work';
    slot.energy = energyLevel;
    slot.done = false;
  } else {
    state.schedule.push({
      id: 'slot-' + Date.now(),
      start: '19:00',
      end: '20:00',
      title: cleanTitle,
      type: 'work',
      energy: energyLevel,
      done: false
    });
  }

  renderAll();
}

function promptFillFreeSlot(slotId) {
  const slot = state.schedule.find(s => s.id === slotId);
  if (!slot) return;
  selectedFreeSlotId = slotId;

  const score = getBatteryScore();
  const suggestedTask =
    score >= 70
      ? state.tasks.find(t => t.category === 'A') || state.tasks[0]
      : state.tasks.find(t => t.category !== 'A') || state.tasks[0];

  const defaultText = suggestedTask ? suggestedTask.title : 'Выезд на объект / проверка стоп-точек';
  const input = prompt(`Занять окно ${slot.start} — ${slot.end}:`, defaultText);
  if (input && input.trim()) {
    fillNearestFreeWindow(input.trim(), score >= 70 ? 'high' : 'low', slotId);
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
  const currentSlot = state.schedule.find(s => !s.done && s.type !== 'free') || state.schedule.find(s => !s.done);
  if (currentSlot) {
    currentSlot.done = true;
    renderAll();
  }
}

function shiftSchedule(minutes = 30) {
  state.schedule.forEach(slot => {
    if (!slot.done) {
      slot.start = addMinutesToTime(slot.start, minutes);
      slot.end = addMinutesToTime(slot.end, minutes);
    }
  });
  renderAll();
}

function addMinutesToTime(timeStr, mins) {
  const parts = (timeStr || '09:00').split(':').map(Number);
  if (parts.length < 2 || isNaN(parts[0])) return timeStr;
  const total = (parts[0] * 60 + parts[1] + mins) % (24 * 60);
  const h = String(Math.floor(total / 60)).padStart(2, '0');
  const m = String(total % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function activateLowEnergyMode() {
  state.morningMood = 'low';
  state.schedule.forEach(slot => {
    if (!slot.done && slot.energy === 'high') {
      slot.energy = 'low';
      if (slot.type === 'focus') {
        slot.title = 'Спокойная работа по чек-листу без перегруза';
      }
    }
  });
  renderAll();
}

/* ==========================================
   6. УПРАВЛЕНИЕ ЗАДАЧАМИ И КАТЕГОРИЯМИ (А / Б / В)
   ========================================== */
function addTomorrowTask() {
  const input =
    document.getElementById('tomorrow-input') ||
    document.getElementById('task-input') ||
    document.getElementById('new-task-input');
  const catSelect =
    document.getElementById('task-category-select') ||
    document.getElementById('tomorrow-category') ||
    document.querySelector('.select-input');

  if (!input || !input.value.trim()) return;

  const categoryVal = catSelect ? catSelect.value : 'A';
  const normalizedCat =
    categoryVal === 'high' || categoryVal === 'A'
      ? 'A'
      : categoryVal === 'medium' || categoryVal === 'B'
      ? 'B'
      : 'C';

  const complexity = normalizedCat === 'A' ? 'high' : normalizedCat === 'B' ? 'medium' : 'low';

  state.tasks.unshift({
    id: 'task-' + Date.now(),
    title: input.value.trim(),
    category: normalizedCat,
    complexity,
    project: 'Личный бэклог'
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
    if (score >= 70) {
      return (a.category === 'A' ? -1 : 1) - (b.category === 'A' ? -1 : 1);
    }
    return (a.category === 'C' ? -1 : 1) - (b.category === 'C' ? -1 : 1);
  });

  let moved = 0;
  for (const task of sorted) {
    const freeSlot = state.schedule.find(s => s.type === 'free' && !s.done);
    if (!freeSlot) break;
    freeSlot.title = task.title;
    freeSlot.type = 'work';
    freeSlot.energy = task.complexity || 'medium';
    state.tasks = state.tasks.filter(t => t.id !== task.id);
    moved++;
  }

  if (moved === 0 && sorted.length > 0) {
    const first = sorted[0];
    fillNearestFreeWindow(first.title, first.complexity || 'medium');
    state.tasks = state.tasks.filter(t => t.id !== first.id);
  }

  renderAll();
}

function filterTasks(category) {
  state.activeTaskFilter = category || 'all';
  renderAll();
}

function toggleHoldPoint(hpId) {
  const item = state.holdPoints.find(h => h.id === hpId);
  if (item) {
    item.done = !item.done;
    renderAll();
  }
}

/* ==========================================
   7. СИНХРОНИЗАЦИЯ С APPLE HEALTHKIT И GOOGLE КАЛЕНДАРЁМ
   ========================================== */
function checkUrlHealthParams() {
  try {
    const params = new URLSearchParams(window.location.search);
    let updated = false;

    if (params.has('sleep')) {
      state.health.sleepHours = parseFloat(params.get('sleep')) || state.health.sleepHours;
      updated = true;
    }
    if (params.has('deep')) {
      state.health.deepSleepHours = parseFloat(params.get('deep')) || state.health.deepSleepHours;
      updated = true;
    }
    if (params.has('bedtime')) {
      state.health.bedtime = params.get('bedtime') || state.health.bedtime;
      updated = true;
    }
    if (params.has('calories')) {
      state.health.activeCalories = parseInt(params.get('calories'), 10) || state.health.activeCalories;
      updated = true;
    }
    if (params.has('steps')) {
      state.health.steps = parseInt(params.get('steps'), 10) || state.health.steps;
      updated = true;
    }
    if (params.has('hr')) {
      state.health.restingHR = parseInt(params.get('hr'), 10) || state.health.restingHR;
      updated = true;
    }

    if (updated) {
      state.health.lastSync = 'Синхронизировано из Apple Здоровье (HealthKit)';
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  } catch (e) {
    console.warn('Ошибка чтения параметров HealthKit:', e);
  }
}

function simulateHealthKitSync() {
  state.health.sleepHours = 8.2;
  state.health.deepSleepHours = 3.1;
  state.health.bedtime = '22:40';
  state.health.activeCalories = 410;
  state.health.restingHR = 58;
  state.manualOffset = 0;
  state.morningMood = 'high';
  state.health.lastSync = 'Apple HealthKit • только что';
  renderAll();
}

function handleGoogleCalendarClick() {
  const modal = document.getElementById('gcal-modal') || document.getElementById('calendar-modal');
  if (modal) {
    modal.classList.remove('hidden');
    return;
  }
  syncGoogleCalendarDemo();
}

function syncGoogleCalendarDemo() {
  const score = getBatteryScore();
  const calendarEvents = [
    {
      start: '10:30',
      end: '13:00',
      title:
        score >= 70
          ? 'Выезд на объект (ЖК Lucky / Падел-клуб): проверка ключевых стоп-точек'
          : 'Согласование спецификации по лаку и диффузорам с Антоном (онлайн)',
      energy: score >= 70 ? 'high' : 'low'
    },
    {
      start: '14:00',
      end: '16:30',
      title: 'Согласование с Олегом лестницы и поручня по чертежам',
      energy: 'medium'
    }
  ];

  calendarEvents.forEach(ev => {
    const slot = state.schedule.find(s => s.start === ev.start || (s.type === 'free' && !s.done));
    if (slot) {
      slot.title = ev.title;
      slot.type = 'work';
      slot.energy = ev.energy;
      slot.source = 'gcal';
    }
  });

  state.gcal.connected = true;
  state.gcal.eventsCount = calendarEvents.length;
  state.gcal.lastSync = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  closeAllModals();
  renderAll();
}

function importIcsCalendar(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const content = e.target.result || '';
    const summaries = [...content.matchAll(/SUMMARY:(.*)/g)].map(m => m[1].trim()).filter(Boolean);
    let count = 0;
    summaries.slice(0, 3).forEach(summary => {
      const freeSlot = state.schedule.find(s => s.type === 'free' && !s.done);
      if (freeSlot) {
        freeSlot.title = summary;
        freeSlot.type = 'work';
        freeSlot.energy = 'medium';
        freeSlot.source = 'gcal';
        count++;
      }
    });
    state.gcal.connected = true;
    state.gcal.eventsCount = count || summaries.length;
    closeAllModals();
    renderAll();
  };
  reader.readAsText(file);
}

/* ==========================================
   8. МОДАЛЬНЫЕ ОКНА, БУДИЛЬНИК И ГОЛОСОВОЙ ВВОД
   ========================================== */
function openAlarmModal() {
  const modal = document.getElementById('alarm-modal');
  if (modal) {
    const input = document.getElementById('alarm-time-input');
    if (input) input.value = state.alarm.time;
    const toggle = document.getElementById('alarm-enabled-toggle');
    if (toggle) toggle.checked = state.alarm.enabled;
    modal.classList.remove('hidden');
  } else {
    const newTime = prompt('Установите время утреннего будильника (ЧЧ:ММ):', state.alarm.time);
    if (newTime && /^\d{2}:\d{2}$/.test(newTime.trim())) {
      state.alarm.time = newTime.trim();
      state.alarm.enabled = true;
      renderAll();
    }
  }
}

function saveAlarmSettings() {
  const input = document.getElementById('alarm-time-input');
  const toggle = document.getElementById('alarm-enabled-toggle');
  if (input && input.value) state.alarm.time = input.value;
  if (toggle) state.alarm.enabled = toggle.checked;
  closeAllModals();
  renderAll();
}

function openStepsModal() {
  const modal = document.getElementById('steps-modal');
  if (modal) {
    const input = document.getElementById('steps-input');
    if (input) input.value = state.health.steps;
    modal.classList.remove('hidden');
  } else {
    const val = prompt('Введите количество шагов за сегодня (Huawei / Apple Health):', state.health.steps);
    if (val !== null && !isNaN(parseInt(val, 10))) {
      state.health.steps = parseInt(val, 10);
      renderAll();
    }
  }
}

function saveStepsModal() {
  const input = document.getElementById('steps-input');
  if (input && !isNaN(parseInt(input.value, 10))) {
    state.health.steps = parseInt(input.value, 10);
  }
  closeAllModals();
  renderAll();
}

function openSlotModal() {
  const modal = document.getElementById('slot-modal') || document.getElementById('add-slot-modal');
  if (modal) {
    modal.classList.remove('hidden');
    return;
  }
  const timeRange = prompt('Время слота (например, 15:00 - 16:30):', '15:00 - 16:30');
  if (!timeRange) return;
  const title = prompt('Название задачи или окна:', 'Свободное окно');
  if (!title) return;
  const parts = timeRange.split('-').map(s => s.trim());
  state.schedule.push({
    id: 'slot-' + Date.now(),
    start: parts[0] || '15:00',
    end: parts[1] || '16:30',
    title: title.trim(),
    type: title.toLowerCase().includes('свободн') ? 'free' : 'work',
    energy: 'medium',
    done: false
  });
  renderAll();
}

function saveCustomSlotModal() {
  const startEl = document.getElementById('slot-start-input');
  const endEl = document.getElementById('slot-end-input');
  const titleEl = document.getElementById('slot-title-input');
  const energyEl = document.getElementById('slot-energy-input');

  const title = titleEl && titleEl.value.trim() ? titleEl.value.trim() : 'Свободное окно';
  state.schedule.push({
    id: 'slot-' + Date.now(),
    start: startEl && startEl.value ? startEl.value : '15:00',
    end: endEl && endEl.value ? endEl.value : '16:00',
    title,
    type: title.toLowerCase().includes('свободн') ? 'free' : 'work',
    energy: energyEl ? energyEl.value : 'medium',
    done: false
  });

  if (titleEl) titleEl.value = '';
  closeAllModals();
  renderAll();
}

function closeAllModals() {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

function toggleVoiceInput(targetInputId = 'custom-task-input') {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const input =
    document.getElementById(targetInputId) ||
    document.getElementById('custom-slot-input') ||
    document.querySelector('.custom-slot-form input');
  const voiceBtn = document.getElementById('voice-btn') || document.querySelector('.voice-btn');

  if (!SpeechRecognition) {
    alert('Голосовой ввод не поддерживается в этом браузере. Используйте клавиатуру с микрофоном iOS.');
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'ru-RU';
  recognition.interimResults = false;

  if (voiceBtn) voiceBtn.classList.add('recording');

  recognition.onresult = function (event) {
    const transcript = event.results[0][0].transcript;
    if (input) input.value = transcript;
  };

  recognition.onend = function () {
    if (voiceBtn) voiceBtn.classList.remove('recording');
  };

  recognition.onerror = function () {
    if (voiceBtn) voiceBtn.classList.remove('recording');
  };

  recognition.start();
}

/* ==========================================
   9. PWA УСТАНОВКА И SERVICE WORKER
   ========================================== */
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const banner = document.getElementById('install-banner');
  if (banner) banner.classList.remove('hidden');
});

function triggerInstallApp() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.finally(() => {
      deferredInstallPrompt = null;
      dismissInstallBanner();
    });
  } else {
    alert('На iPhone нажмите кнопку «Поделиться» внизу Safari и выберите «На экран Домой» 📲');
  }
}

function dismissInstallBanner() {
  const banner = document.getElementById('install-banner');
  if (banner) banner.classList.add('hidden');
}

function copyShortcutUrl() {
  const baseUrl = window.location.origin + window.location.pathname;
  const url = `${baseUrl}?sleep=8.0&deep=3.0&bedtime=22:45&calories=420&steps=5000&hr=58`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => {
      alert('Ссылка для Команды iOS (HealthKit) скопирована в буфер обмена!');
    });
  }
}

/* ==========================================
   10. УТИЛИТЫ И АВТОМАТИЧЕСКАЯ ПРИВЯЗКА СОБЫТИЙ
   ========================================== */
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bindDOMListeners() {
  // Привязка быстрых чипов в карточке Координатора
  document.querySelectorAll('.quick-chips .chip').forEach(chip => {
    if (!chip.getAttribute('onclick')) {
      chip.addEventListener('click', () => {
        const text = chip.textContent.trim();
        const isHigh = text.includes('Выезд') || text.includes('Чертежи');
        fillNearestFreeWindow(text, isHigh ? 'high' : 'low');
      });
    }
  });

  // Привязка кнопки «Поставить» в форме Координатора
  const customFormBtn = document.querySelector('.custom-slot-form .btn-primary');
  const customFormInput = document.querySelector('.custom-slot-form input');
  if (customFormBtn && customFormInput && !customFormBtn.getAttribute('onclick')) {
    customFormBtn.addEventListener('click', () => {
      if (customFormInput.value.trim()) {
        fillNearestFreeWindow(customFormInput.value.trim(), getBatteryScore() >= 70 ? 'high' : 'medium');
        customFormInput.value = '';
      }
    });
  }

  // Привязка кнопок чек-ина (Будни / Выходной)
  document.querySelectorAll('.checkin-btn').forEach(btn => {
    if (!btn.getAttribute('onclick')) {
      btn.addEventListener('click', () => {
        const t = btn.textContent.toLowerCase();
        setDayType(t.includes('выходн') ? 'weekend' : 'work');
      });
    }
  });

  // Привязка кнопок самочувствия
  document.querySelectorAll('.energy-btn').forEach(btn => {
    if (!btn.getAttribute('onclick')) {
      btn.addEventListener('click', () => {
        const t = btn.textContent.toLowerCase();
        if (t.includes('заряжен')) setMorningMood('high');
        else if (t.includes('нормальн')) setMorningMood('medium');
        else setMorningMood('low');
      });
    }
  });
}

// Экспорт всех функций и алиасов в глобальную область window для совместимости с HTML-разметкой
Object.assign(window, {
  triggerInstallApp,
  dismissInstallBanner,
  handleGoogleCalendarClick,
  syncGoogleCalendarDemo,
  importIcsCalendar,
  openAlarmModal,
  closeAlarmModal: closeAllModals,
  saveAlarm: saveAlarmSettings,
  saveAlarmSettings,
  openStepsModal,
  closeStepsModal: closeAllModals,
  saveSteps: saveStepsModal,
  saveStepsModal,
  openSlotModal,
  openAddSlotModal: openSlotModal,
  closeSlotModal: closeAllModals,
  saveCustomSlot: saveCustomSlotModal,
  saveCustomSlotModal,
  closeAllModals,
  toggleDayType,
  setDayType,
  selectDayType: setDayType,
  setMorningMood,
  setEnergy: setMorningMood,
  setEnergyLevel: setMorningMood,
  selectMood: setMorningMood,
  changeSleepScore,
  changeSleep: changeSleepScore,
  adjustBattery: changeSleepScore,
  updateHealthMetric,
  simulateHealthKitSync,
  copyShortcutUrl,
  switchPage,
  handleRecommendationAction,
  fillNearestFreeWindow,
  quickFillSlot: fillNearestFreeWindow,
  assignCustomToFreeWindow: () => {
    const input =
      document.getElementById('custom-task-input') ||
      document.getElementById('custom-slot-input') ||
      document.querySelector('.custom-slot-form input');
    if (input && input.value.trim()) {
      fillNearestFreeWindow(input.value.trim(), getBatteryScore() >= 70 ? 'high' : 'medium');
      input.value = '';
    }
  },
  promptFillFreeSlot,
  toggleSlotDone,
  clearOrRemoveSlot,
  completeCurrentFocus,
  completeCurrentSlot: completeCurrentFocus,
  shiftSchedule,
  activateLowEnergyMode,
  triggerLowEnergy: activateLowEnergyMode,
  addTomorrowTask,
  removeTask,
  scheduleTaskToToday,
  moveTomorrowToToday,
  filterTasks,
  toggleHoldPoint,
  toggleVoiceInput
});

document.addEventListener('DOMContentLoaded', () => {
  checkUrlHealthParams();
  bindDOMListeners();
  renderAll();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
