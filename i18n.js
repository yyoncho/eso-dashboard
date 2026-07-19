/* i18n.js — runtime BG→EN translation layer for all dashboard pages.
 *
 * One source of truth: the Bulgarian pages. English is produced at runtime by
 * translating text nodes (initial walk + MutationObserver for re-renders) and
 * by wrapping Plotly so trace names / axis titles / hovertemplates are
 * translated before render. Data keys (АЕЦ, ФЕЦ, Товар на РБ, ССЕЕ_mw, …)
 * live only in JS code and never pass through here, so they stay intact.
 *
 * Language selection: ?lang=en URL param wins, then localStorage, default bg.
 * Flag buttons (🇧🇬/🇬🇧) are injected into <span id="lang-flags"> if present,
 * otherwise into a fixed pill at the top-right corner.
 */
(function () {
  'use strict';

  const param = (location.search.match(/[?&]lang=([^&]*)/) || [])[1];
  let lang = param || localStorage.getItem('lang') || 'bg';
  if (lang !== 'en') lang = 'bg';
  try { localStorage.setItem('lang', lang); } catch (_) {}
  // Strip ?lang= immediately — some pages (sdac) parse location.search as
  // their own state. Language persists via localStorage. Plain string
  // surgery: URLSearchParams would re-encode legacy "?date|hour" params.
  if (param !== undefined) {
    let s = location.search.replace(/[?&]lang=[^&]*/, '');
    if (s && s[0] === '&') s = '?' + s.slice(1);
    try { history.replaceState(null, '', location.pathname + s + location.hash); } catch (_) {}
  }
  document.documentElement.lang = lang;
  window.LANG = lang;

  // ──────────────────────────────────────────────────────────────────────────
  // Dictionary. EXACT: whole trimmed-node matches (short/ambiguous tokens).
  // SUB: ordered substring replacements, longest/most-specific first.
  // REGEX: variable strings (numbers inside).
  // ──────────────────────────────────────────────────────────────────────────
  const EXACT = {
    'ч': 'h',
    'ч:мин': 'h:min',
    'и': 'and',
    'БГ': 'BG',
    'днес': 'today',
    '1 ден': '1 day',
    'никои': 'none',
    'Зареждане…': 'Loading…',
    'АЕЦ': 'Nuclear',
    'КЗЛ': 'KZL',
  };

  const SUB = [
    // ═══ long info texts (index.html dropdowns) ═══
    ['Данните за производство по източници са в реално време от ЕСО ЕАД. Вносът и износът се показват директно от ЕСО без допълнителна обработка. ССЕЕ (батерия) се връща от API-то на ЕСО, но не е включено в процентното разпределение на диаграмата — това обяснява „липсващите" проценти до 100%. Зареждането се изчислява като разлика между общото потребление и сумата от всички останали източници; разреждането се отчита директно от API-то. Верификация: производство + внос − износ ≈ потребление.',
     'Generation-by-source data is real-time from ESO EAD. Imports and exports are shown directly from ESO without further processing. BESS (battery) values come from the ESO API but are not included in the chart’s percentage breakdown — this explains the “missing” percentages up to 100%. Charging is computed as the difference between total consumption and the sum of all other sources; discharging is reported directly by the API. Verification: generation + imports − exports ≈ consumption.'],
    ['Congestion рента е приходът, който операторът на преносната система (ЕСО) получава при пренос на електроенергия между два пазара с различна цена. При износ от БГ към РО или ГР (по-висока цена), ЕСО инкасира разликата в цените, умножена по преносната мощност. Формула: рента = −поток_МВт × (цена_съсед − цена_БГ) × часове. Отрицателен поток означава износ от БГ. Положителна рента = приход за ЕСО.',
     'Congestion rent is the revenue the transmission system operator (ESO) collects when transmitting electricity between two markets with different prices. When exporting from BG to RO or GR (higher price), ESO pockets the price difference multiplied by the transferred power. Formula: rent = −flow_MW × (price_neighbour − price_BG) × hours. Negative flow means export from BG. Positive rent = revenue for ESO.'],
    ['Стойностите са изчислени по IBEX дневна цена (борсова цена Day-Ahead). Те са само илюстративни — не отразяват реални договорни цени, такси за достъп до мрежата или крайни финансови стойности. Печалбата от арбитраж на ССЕЕ (Δ) е изчислена като разлика между приход от разреждане и разход за зареждане по борсова цена — реалният финансов резултат зависи от договорните условия на оператора.',
     'Values are computed at the IBEX day-ahead price. They are illustrative only — they do not reflect actual contract prices, grid-access fees or final financial figures. The BESS arbitrage profit (Δ) is discharge revenue minus charging cost at the spot price — the real financial result depends on the operator’s contractual terms.'],
    ['Данните са изчислени на база живи данни от ЕСО ЕАД, получавани на интервали от 5 минути. Поради вариации при заснемането на интервала е възможна грешка, типично в рамките на 1–2%.',
     'Values are computed from live ESO EAD data received at 5-minute intervals. Due to sampling-interval variations a small error is possible, typically within 1–2%.'],
    ['Сравнение на регулираната тарифа (КЕВР) с текущата борсова цена (IBEX). Мрежовите такси (пренос, разпределение, ОЗЕ, акциз) са еднакви и на двата пазара. Стойностите са ориентировъчни — реалните договорни условия на свободния пазар може да се различават.',
     'Comparison of the regulated tariff (EWRC) with the current spot price (IBEX). Network charges (transmission, distribution, RES, excise) are identical on both markets. Values are indicative — actual free-market contract terms may differ.'],

    // ═══ records.html long notes ═══
    ['Исторически рекорди на българската електроенергийна система. Кликнете на рекорд за прогресия.',
     'Historical records of the Bulgarian power system. Click a record to see its progression.'],
    ['ЕСО SCADA часови данни (2015–2026-06), след което локално записани 5-мин данни.',
     'ESO SCADA hourly data (2015–2026-06), then locally recorded 5-min data.'],
    ['Следени от май 2026 (ССЕЕ пуснато). Исторически рекорди преди 2026 не са включени — тогавашните пикове са несравними с ССЕЕ-подпомогнатия износ.',
     'Tracked since May 2026 (BESS commissioned). Records before 2026 are not included — those peaks are not comparable with BESS-assisted exports.'],
    ['ВЕИ = ВЕЦ + Малки ВЕЦ + ВяЕЦ + ФЕЦ + Биомаса (ENTSOE). Без ССЕЕ за периоди преди 2026.',
     'RES = hydro + small hydro + wind + solar + biomass (ENTSOE). Excludes BESS for periods before 2026.'],
    ['ВЕИ дневна енергия без ССЕЕ (ENTSOE).', 'Daily RES energy excluding BESS (ENTSOE).'],
    ['Часове при 100% ВЕИ покритие без ССЕЕ (ENTSOE). ССЕЕ удвоява реалните стойности от 2026.',
     'Hours at 100% RES coverage excluding BESS (ENTSOE). BESS roughly doubles the real values from 2026.'],
    ['ЕСО SCADA данни от 3 юни 2026 (след пускане на помпите).',
     'ESO SCADA data since 3 June 2026 (after the pumps were commissioned).'],
    ['ССЕЕ зареждане + Помпи. ЕСО SCADA данни от 3 юни 2026.',
     'BESS charging + pumps. ESO SCADA data since 3 June 2026.'],
    ['ЕСО SCADA данни от май 2026.', 'ESO SCADA data since May 2026.'],
    ['Дневна заредена енергия. ЕСО SCADA данни от 3 юни 2026.',
     'Daily charged energy. ESO SCADA data since 3 June 2026.'],
    ['Дневна разредена енергия. ЕСО SCADA данни от 3 юни 2026.',
     'Daily discharged energy. ESO SCADA data since 3 June 2026.'],
    ['Дневна енергия на помпите. ЕСО SCADA данни от 3 юни 2026.',
     'Daily pump energy. ESO SCADA data since 3 June 2026.'],
    ['Данни от ЕСО SCADA (часови стойности, местно СЧВ). Зонираните часове са в UTC+3 (EEST).',
     'Data from ESO SCADA (hourly values, local time). Zoned hours are UTC+3 (EEST).'],
    ['⚡ Исторически рекорд за тази категория', '⚡ All-time record for this category'],

    // ═══ trends.html ═══
    ['Цена · Слънчева · Въглища — 365-дневна плъзгаща средна (2015–2026)',
     'Price · Solar · Coal — 365-day rolling average (2015–2026)'],
    ['Дългосрочни тенденции — БГ Eнергетика', 'Long-term trends — BG Energy'],
    ['Дългосрочни тенденции', 'Long-term trends'],
    ['Ember Climate, Day-Ahead пазар (EUR/MWh), от 2016 г.', 'Ember Climate, day-ahead market (EUR/MWh), since 2016.'],
    ['Реални EUR: дефлирани с EU HICP спрямо последния наличен месец в данните.',
     'Real EUR: deflated with EU HICP relative to the latest month in the data.'],
    ['ЕСО СКАДА (ФЕЦ) + ENTSOE.', 'ESO SCADA (solar) + ENTSOE.'],
    ['Кондензационни ТЕЦ + Топлофикационни ТЕЦ + Заводски ТЕЦ (ЕСО СКАДА) + ENTSOE.',
     'Condensing + district-heating + industrial TPPs (ESO SCADA) + ENTSOE.'],
    ['Генерацията е в', 'Generation is in'],
    ['(годишен еквивалент). Последните ~182 дни нямат пълен 365д прозорец.',
     '(annualised). The last ~182 days lack a full 365d window.'],
    ['Цена — 365д MA (Ember)', 'Price — 365d MA (Ember)'],
    ['Слънчева — 365д MA', 'Solar — 365d MA'],
    ['Въглища — 365д MA', 'Coal — 365d MA'],
    ['Цена 365д MA (EUR/MWh)', 'Price 365d MA (EUR/MWh)'],
    ['Слънчева 365д MA (TWh/год.)', 'Solar 365d MA (TWh/yr)'],
    ['Въглища 365д MA (TWh/год.)', 'Coal 365d MA (TWh/yr)'],
    ['Генерация (TWh/год.)', 'Generation (TWh/yr)'],
    ['Цена (EUR/MWh)', 'Price (EUR/MWh)'],
    [' за 3 год.', ' over 3 yrs'],
    ['TWh/год.', 'TWh/yr'],

    // ═══ charging.html ═══
    ['Дневна енергия за зареждане от 3 юни 2026 — батерии (ССЕЕ) и помпи (ПАВЕЦ)',
     'Daily charging energy since 3 June 2026 — batteries (BESS) and pumps (PSH)'],
    ['Дневно зареждане — ССЕЕ и помпи', 'Daily charging — BESS & pumps'],
    ['Дневно зареждане', 'Daily charging'],
    ['ЕСО SCADA, 5-минутни снимки от 3 юни 2026 (пускане на помпите на ПАВЕЦ Чаира).',
     'ESO SCADA, 5-minute snapshots since 3 June 2026 (commissioning of the Chaira PSH pumps).'],
    ['Дневна енергия = сума от мощността на зареждане × 5 мин.',
     'Daily energy = sum of charging power × 5 min.'],
    ['само зареждане (отрицателни стойности на ССЕЕ).',
     'charging only (negative BESS values).'],
    ['помпен режим на ПАВЕЦ (доминиран от Чаира).',
     'PSH pumping mode (dominated by Chaira).'],
    ['номинален капацитет на резервоара на ПАВЕЦ Чаира (~6.4 ГВтч) — колко енергия побира един пълен резервоар за сравнение с дневното зареждане.',
     'nominal capacity of the Chaira PSH reservoir (~6.4 GWh) — how much energy a full reservoir holds, for comparison with daily charging.'],
    ['Дни с непълни данни (под 270 от 288 снимки) са пропуснати.',
     'Days with incomplete data (fewer than 270 of 288 snapshots) are skipped.'],
    ['Номинален капацитет на резервоара на Чаира ~6.4 ГВтч', 'Nominal Chaira reservoir capacity ~6.4 GWh'],
    ['Жълта линия:', 'Yellow line:'],
    ['Данни:', 'Data:'],
    ['Батерии — средно на ден', 'Batteries — daily average'],
    ['Помпи — средно на ден', 'Pumps — daily average'],
    ['Общо — средно на ден', 'Total — daily average'],
    ['Батерии (ССЕЕ)', 'Batteries (BESS)'],
    ['Помпи (ПАВЕЦ)', 'Pumps (PSH)'],
    ['Батерии:', 'Batteries:'],
    ['Грешка при зареждане на данните:', 'Error loading data:'],
    ['ГВтч/ден', 'GWh/day'],
    [' ГВтч', ' GWh'],
    ['макс ', 'max '],

    // ═══ nuclear_lcoe.html ═══
    ['АЕЦ Козлодуй нови мощности — Себестойност (LCOE)', 'Kozloduy NPP new units — Cost of energy (LCOE)'],
    ['АЕЦ Козлодуй нови мощности — Себестойност', 'Kozloduy NPP new units — Cost of energy'],
    ['Икономически анализ на нова ядрена мощност при реални пазарни цени — неофициален',
     'Economic analysis of new nuclear capacity at real market prices — unofficial'],
    ['АЕЦ Козлодуй — LCOE калкулатор', 'Kozloduy NPP — LCOE calculator'],
    ['Зарежда данни от data branch…', 'Loading data from the data branch…'],
    ['Зарежда данни…', 'Loading data…'],
    ['Параметри на проекта', 'Project parameters'],
    ['title="Параметри"', 'title="Parameters"'],
    ['АЕЦ Козлодуй', 'Kozloduy NPP'],
    ['(Полша)', '(Poland)'],
    ['(САЩ)', '(USA)'],
    ['Overnight CAPEX (изчислен)', 'Overnight CAPEX (derived)'],
    ['Мощност (MW)', 'Capacity (MW)'],
    ['Срок на живот (год.)', 'Lifetime (yr)'],
    ['WACC (цена на капитала, %)', 'WACC (cost of capital, %)'],
    ['без лихви:', 'excl. interest:'],
    ['Капацитетен фактор:', 'Capacity factor:'],
    ['Строителство:', 'Construction:'],
    ['Разбивка на себестойността (LCOE — Lazard методология)', 'Cost breakdown (LCOE — Lazard methodology)'],
    ['Обща себестойност (LCOE)', 'Total cost of energy (LCOE)'],
    ['Себестойност (LCOE)', 'Cost of energy (LCOE)'],
    ['М EUR / год.', 'M EUR / yr'],
    ['Влияние върху сметка от 100 EUR/мес.', 'Impact on a 100 EUR/month bill'],
    ['EUR / мес.', 'EUR / month'],
    ['Регулиран пазар', 'Regulated market'],
    ['* Мрежа, ОЗЕ, акциз и ДДС запазени. Само снабдяването се замества с LCOE. Регулирана тарифа: КЕВР Ц-25, Енерго-Про.',
     '* Grid, RES, excise and VAT unchanged. Only the supply component is replaced with LCOE. Regulated tariff: EWRC C-25, Energo-Pro.'],
    ['+ Лихви по строителство (IDC)', '+ Interest during construction (IDC)'],
    ['▶ Общо с финансиране', '▶ Total incl. financing'],
    ['Фактор на амортизация (CRF)', 'Capital recovery factor (CRF)'],
    ['Капиталов компонент', 'Capital component'],
    ['OPEX компонент', 'OPEX component'],
    ['Пазарни цени — BG (Ember hourly, последните 2 год.)', 'Market prices — BG (Ember hourly, last 2 yrs)'],
    ['Средна цена', 'Average price'],
    ['Медианна цена', 'Median price'],
    ['Минимална', 'Minimum'],
    ['Максимална', 'Maximum'],
    ['Часове с отрицателна цена', 'Hours with negative price'],
    ['Часове с цена', 'Hours with price'],
    ['Период', 'Period'],
    ['⚠ Бележка:', '⚠ Note:'],
    ['Калкулациите предполагат', 'The calculations assume'],
    ['замяна на съществуващите мощности', 'replacement of existing capacity'],
    ['— новите блокове заместват изведените. При добавяне на нови блокове към съществуващите финансовият резултат ще бъде значително по-лош: пазарът ще е наситен с допълнителна ядрена мощност, цените ще паднат и себестойността ще остане непокрита за много повече часове.',
     '— the new units replace retired ones. If new units are added on top of the existing fleet, the financial result will be significantly worse: the market will be saturated with additional nuclear capacity, prices will fall, and the cost will stay uncovered for many more hours.'],
    ['Източници на стойностите по подразбиране:', 'Sources of the default values:'],
    ['Общият разход с финансиране (€12 млрд.) е', 'The total financed cost (€12bn) is'],
    ['консервативна оценка под реалната полска цена', 'a conservative estimate below the actual Polish price'],
    [': Полша изгражда 3 реактора AP1000 в Чочево с Westinghouse/Bechtel на ~$40–42 млрд. общо (~€14 млрд. на реактор). €12 млрд. не включва надценки и непредвидени разходи.',
     ': Poland is building 3 AP1000 reactors at Choczewo with Westinghouse/Bechtel for ~$40–42bn in total (~€14bn per reactor). €12bn excludes overruns and contingencies.'],
    ['OPEX е по публично достъпни данни на', 'OPEX is based on publicly available data from'],
    ['Методологията следва', 'The methodology follows'],
    ['с IDC изчислен при средно усвояване на капитала по време на строителството.',
     'with IDC computed at average capital draw-down during construction.'],
    ['Методология и проверка на изчисленията', 'Methodology and verification'],
    ['Копирайте текста по-долу и го задайте на ChatGPT, Claude или друг AI.',
     'Copy the text below and give it to ChatGPT, Claude or another AI.'],
    ['AI ще потвърди, че методологията е правилна — и ще обясни защо реалният резултат ще бъде още по-лош.',
     'The AI will confirm the methodology is correct — and explain why the real result would be even worse.'],
    ['✓ Копирано!', '✓ Copied!'],
    ['📋 Копирай текста', '📋 Copy text'],
    [' ч./год. над себ.', ' h/yr above cost'],
    [' ч./год. под себ.', ' h/yr below cost'],
    [' ч./год. (', ' h/yr ('],
    ['Годишна печалба', 'Annual profit'],
    ['Годишна загуба', 'Annual loss'],
    ['Ember данни от: ', 'Ember data as of: '],
    ['Ember данни заредени', 'Ember data loaded'],
    ['Неуспешно зареждане: ', 'Failed to load: '],
    ['Млрд. EUR', 'bn EUR'],
    ['Млрд.', 'bn'],

    // ═══ record labels (records.json data, shown on index + records pages) ═══
    ['Пиково соларно производство', 'Peak solar generation'],
    ['Соларна енергия за ден', 'Solar energy in a day'],
    ['Зареждане ССЕЕ + Помпи', 'BESS + pumps charging'],
    ['Зареждане батерии', 'Battery charging'],
    ['Зареждане за ден', 'Charging in a day'],
    ['Разреждане на ССЕЕ', 'BESS discharging'],
    ['Разреждане за ден', 'Discharging in a day'],
    ['Помпи рекорд ден', 'Pumps record day'],
    ['Пикова мощност износ', 'Peak export power'],
    ['Дневен дял ВЕИ', 'Daily RES share'],
    ['ВЕИ енергия за ден', 'RES energy in a day'],
    ['Най-дълго 100% ВЕИ', 'Longest 100% RES'],

    // ═══ headers / navigation ═══
    ['БГ Мрежов Монитор — неофициален', 'BG Grid Monitor — unofficial'],
    ['Рекорди — БГ Мрежов Монитор', 'Records — BG Grid Monitor'],
    ['Мрежов монитор — България', 'Grid Monitor — Bulgaria'],
    ['Мрежов монитор', 'Grid Monitor'],
    ['Неофициален ресурс • данни от ЕСО ЕАД и IBEX • не представлява ЕСО ЕАД',
     'Unofficial resource • data from ESO EAD and IBEX • not affiliated with ESO EAD'],
    ['Неофициален ресурс • данни от', 'Unofficial resource • data from'],
    ['Документация (README)', 'Documentation (README)'],
    ['Промени (Changelog)', 'Changelog'],
    ['ЕСО ЕАД', 'ESO EAD'],
    ['Исторически данни — показват се архивни записи, не актуална информация',
     'Historical data — showing archived records, not live information'],
    ['Исторически ден — не е в реално време', 'Historical day — not real-time'],
    ['Рекорди — ВЕИ и ССЕЕ', 'Records — RES & BESS'],
    ['Пълна история на рекордите', 'Full record history'],
    ['🏆 Рекорди', '🏆 Records'],
    ['Анализи', 'Analyses'],
    ['Табло', 'Dashboard'],
    ['Снимки за деня', 'Snapshots today'],
    ['5-мин записи', '5-min records'],
    ['Снимка:', 'Snapshot:'],
    ['Днес', 'Today'],

    // ═══ index.html panels / stats ═══
    ['Производство по източници — живо', 'Generation by source — live'],
    ['Структура на производство — живо', 'Generation mix — live'],
    ['Производство на ', 'Generation on '],
    ['(SCADA, СЧВ)', '(SCADA, local time)'],
    ['Товар на РБ', 'System load'],
    ['IBEX цена', 'IBEX price'],
    ['IBEX DA (текуща)', 'IBEX DA (current)'],
    ['Внос/Износ', 'Imports/Exports'],
    ['Трансгранични потоци — дневен профил (+ внос / − износ)',
     'Cross-border flows — daily profile (+ imports / − exports)'],
    ['Трансгранична енергия за деня', 'Cross-border energy for the day'],
    ['Трансгранични потоци', 'Cross-border flows'],
    ['Congestion рента — живо', 'Congestion rent — live'],
    ['Congestion — дневен приход', 'Congestion — daily revenue'],
    ['Общо congestion рента', 'Total congestion rent'],
    ['Общо congestion (РО + ГР)', 'Total congestion (RO + GR)'],
    ['Общо congestion', 'Total congestion'],
    ['Ценова разлика спрямо България (DA) — EUR/MWh', 'Price spread vs Bulgaria (DA) — EUR/MWh'],
    ['Дневен баланс', 'Daily balance'],
    ['Дневен профил', 'Daily profile'],
    ['Нетен баланс (+ износ / − внос)', 'Net balance (+ exports / − imports)'],
    ['Нетна позиция', 'Net position'],
    ['Средна за деня', 'Daily average'],
    ['Мин / Макс', 'Min / Max'],
    ['ССЕЕ — дневен баланс', 'BESS — daily balance'],
    ['ССЕЕ разреждане', 'BESS discharge'],
    ['ССЕЕ зареждане', 'BESS charging'],
    ['ССЕЕ разр.', 'BESS dis.'],
    ['ССЕЕ зар.', 'BESS chg.'],
    ['Зареждане помпи', 'Pump charging'],
    ['Зареждане', 'Charging'],
    ['Разреждане', 'Discharging'],
    ['Разр./Зар.', 'Dis./Chg.'],
    ['Δ Арбитраж', 'Δ Arbitrage'],
    ['Помпи (товар)', 'Pumps (load)'],
    ['Помпи зар.', 'Pumps chg.'],
    ['ВЕИ покритие', 'RES coverage'],
    ['ВЕИ енергия', 'RES energy'],
    ['Непокрито', 'Uncovered'],
    ['Излишък', 'Surplus'],
    ['100% покр.', '100% cov.'],
    ['Източник', 'Source'],
    ['Колони', 'Columns'],
    ['Цял екран', 'Fullscreen'],
    ['Информация', 'Info'],
    ['Предишен час', 'Previous hour'],
    ['Следващ час', 'Next hour'],
    ['Оценка на база IBEX DA цена — не е реална сетълмент стойност', 'Estimate at IBEX DA price — not an actual settlement value'],
    ['Оценка на база IBEX DA цена', 'Estimate at IBEX DA price'],
    ['Обновено току-що', 'Updated just now'],
    ['Обновено преди ', 'Updated '],
    [' мин.', ' min ago'],
    ['Няма борсови данни за избрания ден.', 'No market data for the selected day.'],
    ['Няма достатъчно данни', 'Not enough data'],
    ['Няма данни', 'No data'],
    ['Грешка при зареждане:', 'Error loading:'],
    ['Грешка: ', 'Error: '],

    // ═══ tariff calculator ═══
    ['Борсова цена — Свободен пазар vs Регулирана тарифа', 'Spot price — Free market vs Regulated tariff'],
    ['Цена за краен потребител (свободен пазар)', 'End-consumer price (free market)'],
    ['борсова цена (IBEX)', 'spot price (IBEX)'],
    ['по-евтин от регулирана', 'cheaper than regulated'],
    ['по-скъп от регулирана', 'more expensive than regulated'],
    ['vs рег.', 'vs reg.'],
    ['Референтни стойности по решение', 'Reference values per decision'],
    ['Ц-25 КЕВР, юли 2025', 'C-25 of EWRC, July 2025'],
    ['(Енерго-Про / Електросевер).', '(Energo-Pro / Electrosever).'],
    ['Мрежовите компоненти (пренос, разпределение, ОЗЕ, акциз) са еднакви и на двата пазара.',
     'Network components (transmission, distribution, RES, excise) are identical on both markets.'],
    ['Дневна тарифа: 07:00–23:00 ч.', 'Day tariff: 07:00–23:00'],
    ['Нощна: 23:00–07:00 ч.', 'Night: 23:00–07:00'],
    ['Компонент', 'Component'],
    ['Снабдяване', 'Supply'],
    ['борса:', 'spot:'],
    ['Пренос НЕК', 'Transmission (NEK)'],
    ['Разпределение', 'Distribution'],
    ['ОЗЕ надбавка', 'RES surcharge'],
    ['Акциз', 'Excise duty'],
    ['Без ДДС', 'Excl. VAT'],
    ['ОБЩО с ДДС', 'TOTAL incl. VAT'],
    ['(ден)', '(day)'],
    ['(нощ)', '(night)'],
    ['Консуматор с', 'Consumer using'],
    ['кВтч/ден', 'kWh/day'],
    ['Регулирана', 'Regulated'],
    ['Свободният пазар е по-изгоден — спестявате', 'The free market is the better deal — you save'],
    ['Свободен пазар', 'Free market'],
    ['Разлика', 'Difference'],
    ['По-евтини часове на свободния пазар', 'Hours when the free market is cheaper'],
    ['Дневна тарифа (07–23ч)', 'Day tariff (07–23h)'],
    ['Нощна тарифа (23–07ч)', 'Night tariff (23–07h)'],
    [' от 16 часа', ' of 16 hours'],
    [' от 8 часа', ' of 8 hours'],
    ['всички часове — пазарът е по-скъп', 'no hours — the market is more expensive'],
    ['свободният пазар е по-евтин от регулираната тарифа.', 'the free market is cheaper than the regulated tariff.'],
    ['борсовите цени надвишават регулираната тарифа', 'spot prices exceed the regulated tariff'],
    ['във всички часове', 'in all hours'],
    ['— регулираната тарифа е по-изгодна.', '— the regulated tariff is the better deal.'],
    ['Няма евтини часове', 'No cheap hours'],
    ['Регулиран:', 'Regulated:'],
    ['Трябва да спестите', 'You need to save'],
    ['— преместете ~', '— shift ~'],
    ['от потреблението към евтините часове', 'of consumption to the cheap hours'],
    ['профил:', 'profile:'],
    ['последните', 'last'],
    [' дни (', ' days ('],
    ['типичен профил', 'typical profile'],
    ['EUR/кВтч', 'EUR/kWh'],
    ['кВтч', 'kWh'],
    ['EUR/ден', 'EUR/day'],
    ['EUR / ден', 'EUR / day'],

    // ═══ records.html UI ═══
    ['Текущ рекорд', 'Current record'],
    ['Предишен рекорд', 'Previous record'],
    ['Прогресия на рекорда', 'Record progression'],
    ['Всяка точка = нов рекорд', 'Each point = a new record'],
    ['Топ 10 дни', 'Top 10 days'],
    ['Стойност', 'Value'],
    ['Виж ден', 'View day'],
    ['Данни от ', 'Data from '],
    [' на този ден:', ' on this day:'],
    [' днес:', ' today:'],
    [' днес', ' today'],
    [' сед.', ' wk'],
    [' мес.', ' mo'],
    [' дни', ' days'],
    ['Рекорди', 'Records'],

    // ═══ generation-source display labels ═══
    ['Кондензационни ТЕЦ', 'Condensing TPP'],
    ['Топлофикационни ТЕЦ', 'District-heating TPP'],
    ['Заводски ТЕЦ', 'Industrial TPP'],
    ['Конд. ТЕЦ', 'Coal TPP'],
    ['Конд.ТЕЦ', 'Coal TPP'],
    ['Топло. ТЕЦ', 'CHP (heating)'],
    ['Топло.ТЕЦ', 'CHP (heating)'],
    ['Зав. ТЕЦ', 'CHP (industrial)'],
    ['Зав.ТЕЦ', 'CHP (industrial)'],
    ['Малки ВЕЦ', 'Small hydro'],
    ['М.ВЕЦ', 'S. hydro'],
    ['ВяЕЦ', 'Wind'],
    ['ФЕЦ', 'Solar'],
    ['Биомаса', 'Biomass'],
    ['Био ЕЦ', 'Biomass'],
    ['ВЕЦ', 'Hydro'],
    ['АЕЦ', 'Nuclear'],
    ['ССЕБ', 'BESS'],
    ['ССЕЕ', 'BESS'],
    ['Въглища', 'Coal'],
    ['Слънчева', 'Solar'],
    ['Помпи', 'Pumps'],
    ['Генерация', 'Generation'],
    ['Производство', 'Generation'],

    // ═══ flows / countries / misc tokens ═══
    ['Румъния', 'Romania'],
    ['Сърбия', 'Serbia'],
    ['С.Македония', 'N. Macedonia'],
    ['Гърция', 'Greece'],
    ['Турция', 'Turkey'],
    ['България', 'Bulgaria'],
    ['Страна', 'Country'],
    ['Баланс', 'Balance'],
    ['Граница', 'Border'],
    ['Поток', 'Flow'],
    ['Спред', 'Spread'],
    ['Рента', 'Rent'],
    ['рента', 'rent'],
    ['Конг.', 'Cong.'],
    ['Цени:', 'Prices:'],
    ['Цена', 'Price'],
    ['цена', 'price'],
    ['Дата', 'Date'],
    ['Товар', 'Load'],
    ['Внос', 'Imports'],
    ['Износ', 'Exports'],
    [' внос', ' import'],
    [' износ', ' export'],
    [' нет', ' net'],
    ['Зар.:', 'Chg.:'],
    [' зар.', ' chg.'],
    [' разр.', ' dis.'],
    ['разр. ', 'dis. '],
    ['Дял', 'Share'],
    ['Час', 'Hour'],
    [' часа', ' hours'],
    ['млн.€', 'M€'],
    ['хил.€', 'k€'],
    [' ч. (местно)', ' (local time)'],
    [' ч./год.', ' h/yr'],
    [' год.', ' yr'],
    ['(год.)', '(yr)'],
    ['365д', '365d'],
    ['€/МВтч', '€/MWh'],
    ['МВтч', 'MWh'],
    ['МВт', 'MW'],
    ['ВЕИ', 'RES'],
    ['борса', 'spot'],
    ['мрежа', 'grid'],
    ['ДДС', 'VAT'],
    ['снабдяване', 'supply'],
    ['Общо:', 'Total:'],
    ['Общо', 'Total'],
    ['ЕСО', 'ESO'],
    ['БГ', 'BG'],
    ['РО', 'RO'],
    ['ГР', 'GR'],
  ];

  const REGEX = [
    [/(\d) ч(?![\wа-яА-Я:./])/g, '$1 h'],      // "10.6 ч" record chips
    [/(\d) ч\.(?!\/)/g, '$1'],                  // "23:30 ч." clock suffix
    [/(\d) т(?![\wа-яА-Я])/g, '$1 load'],       // pie center "3 210 т"
  ];

  // Full-block override for the long AI-verification prompt on nuclear_lcoe.
  const ID_HTML = {
    'meth-text': 'Please verify the following calculation and confirm whether the methodology is correct. This is a maximally good-faith estimate of the cost of electricity from a new nuclear plant in Bulgaria, based on publicly available data.\n\nCONTEXT:\nWe consider building a new AP1000 reactor (1000 MW) at the Kozloduy NPP site.\nThe base project cost comes from the Polish AP1000 project with Westinghouse/Bechtel — the closest comparable recent project in Europe. Poland is building 3 AP1000 reactors at Choczewo for an estimated total of ~$40–42bn (about €14bn per reactor). The calculator uses €12bn as a conservative estimate (excluding overruns and contingencies).\n\nINPUTS:\n• Total financed cost: €12bn (per reactor; conservative — the Polish AP1000 is ~€14bn/reactor)\n• WACC (cost of capital): 8% (realistic for a project without a full state guarantee)\n• Construction period: 10 years\n• Lifetime: 60 years\n• Capacity factor: 90%\n• OPEX: 45 EUR/MWh (per Kozloduy NPP data)\n\nMETHODOLOGY (Lazard LCOE):\n\nStep 1 — IDC factor (interest during construction):\nAssume uniform capital draw-down → on average the capital “sits” for constr/2 years.\nidcFactor = (1 + WACC)^(constr/2) − 1 = (1.08)^5 − 1 = 0.4693\n\nStep 2 — Overnight CAPEX (cost excluding interest):\novernight = total / (1 + idcFactor) = 12 / 1.4693 ≈ €8.17bn\nIDC = 12 − 8.17 = €3.83bn (interest during construction)\n\nStep 3 — CRF (Capital Recovery Factor):\nCRF = WACC × (1+WACC)^life / ((1+WACC)^life − 1)\n\nStep 4 — Capital component of LCOE.\n\nStep 5 — Total cost of energy.\n\nMARKET COMPARISON:\nSpot price source: Ember Climate (ember-climate.org) — hourly BG day-ahead data, last 2 years.\nAverage BG day-ahead price over the last 2 years: <span id="meth-avg-price">~100</span> EUR/MWh.\nAt this price the plant would run at a loss for most market hours.\n\nQUESTION FOR THE AI:\n1. Confirm whether the formulas and calculations are correct.\n2. Explain why the real financial result would be EVEN WORSE than shown — focusing on the market effect: adding 1000 MW of low-marginal-cost baseload to a market with ~6000 MW peak demand will displace expensive plants from the merit order, depress the marginal price and reduce the plant’s own revenue (“price cannibalization”). How much worse does it get with two reactors instead of one?',
  };

  const CYR = /[Ѐ-ӿ]/;

  function tr(s) {
    if (!s || !CYR.test(s)) return s;
    const t = s.trim();
    if (Object.prototype.hasOwnProperty.call(EXACT, t)) return s.replace(t, EXACT[t]);
    let out = s;
    for (let i = 0; i < SUB.length; i++) {
      if (out.indexOf(SUB[i][0]) !== -1) out = out.split(SUB[i][0]).join(SUB[i][1]);
    }
    for (let i = 0; i < REGEX.length; i++) out = out.replace(REGEX[i][0], REGEX[i][1]);
    return out;
  }
  window.__tr = tr; // exposed for debugging

  // ──────────────────────────────────────────────────────────────────────────
  // Flag switcher — injected into #lang-flags placeholder (or fixed pill).
  // ──────────────────────────────────────────────────────────────────────────
  function switchTo(next) {
    try { localStorage.setItem('lang', next); } catch (_) {}
    const url = new URL(location.href);
    if (next === 'bg') url.searchParams.delete('lang');
    else url.searchParams.set('lang', next);
    location.href = url.toString();
  }

  function injectFlags() {
    let host = document.getElementById('lang-flags');
    if (!host) {
      host = document.createElement('span');
      host.id = 'lang-flags';
      host.style.cssText = 'position:fixed;top:8px;right:10px;z-index:10001;background:rgba(0,48,112,0.85);border-radius:14px;padding:3px 8px;';
      document.body.appendChild(host);
    }
    host.style.display = 'inline-flex';
    host.style.alignItems = 'center';
    // Single toggle: show the CURRENT language's flag; clicking switches to
    // the other one (tooltip explains the action).
    const other = lang === 'en' ? 'bg' : 'en';
    const b = document.createElement('button');
    b.textContent = lang === 'en' ? '🇬🇧' : '🇧🇬';
    b.title = lang === 'en' ? 'Превключи на български' : 'Switch to English';
    b.setAttribute('aria-label', b.title);
    b.style.cssText = 'background:none;border:none;cursor:pointer;font-size:1.05rem;line-height:1;padding:1px 2px;';
    b.onclick = e => { e.preventDefault(); e.stopPropagation(); switchTo(other); };
    host.appendChild(b);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // DOM translation: initial walk + MutationObserver for re-rendered content.
  // ──────────────────────────────────────────────────────────────────────────
  const ATTRS = ['title', 'placeholder', 'alt'];

  function translateNode(root) {
    if (root.nodeType === Node.TEXT_NODE) {
      const p = root.parentNode;
      if (p && (p.nodeName === 'SCRIPT' || p.nodeName === 'STYLE')) return;
      const nv = tr(root.data);
      if (nv !== root.data) root.data = nv;
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    if (root.nodeName === 'SCRIPT' || root.nodeName === 'STYLE') return;
    for (const a of ATTRS) {
      const v = root.getAttribute && root.getAttribute(a);
      if (v && CYR.test(v)) { const nv = tr(v); if (nv !== v) root.setAttribute(a, nv); }
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => {
        const p = n.parentNode;
        return p && (p.nodeName === 'SCRIPT' || p.nodeName === 'STYLE')
          ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    });
    const dirty = [];
    while (walker.nextNode()) { if (CYR.test(walker.currentNode.data)) dirty.push(walker.currentNode); }
    for (const n of dirty) n.data = tr(n.data);
    if (root.querySelectorAll) {
      for (const a of ATTRS) {
        root.querySelectorAll(`[${a}]`).forEach(el => {
          const v = el.getAttribute(a);
          if (v && CYR.test(v)) { const nv = tr(v); if (nv !== v) el.setAttribute(a, nv); }
        });
      }
    }
  }

  function start() {
    injectFlags();
    if (lang !== 'en') return;

    for (const [id, html] of Object.entries(ID_HTML)) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    }
    document.querySelectorAll('.logo-circle').forEach(el => {
      const t = el.textContent.trim();
      if (t === 'БГ') el.textContent = 'BG';
      else if (CYR.test(t)) el.innerHTML = 'NPP';
    });
    document.title = tr(document.title);
    translateNode(document.body);

    const mo = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === 'characterData') {
          if (CYR.test(m.target.data)) translateNode(m.target);
        } else if (m.type === 'childList') {
          m.addedNodes.forEach(n => translateNode(n));
        } else if (m.type === 'attributes') {
          const v = m.target.getAttribute(m.attributeName);
          if (v && CYR.test(v)) { const nv = tr(v); if (nv !== v) m.target.setAttribute(m.attributeName, nv); }
        }
      }
    });
    mo.observe(document.body, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ATTRS,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Plotly wrapper — translate strings in chart config before render, so the
  // SVG never contains Bulgarian (legend widths, hover boxes stay correct).
  // Only string VALUES are touched, never object keys.
  // ──────────────────────────────────────────────────────────────────────────
  function deepTr(v, depth) {
    if (depth > 8 || v == null) return v;
    if (typeof v === 'string') return tr(v);
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) v[i] = deepTr(v[i], depth + 1);
      return v;
    }
    if (typeof v === 'object') {
      for (const k of Object.keys(v)) v[k] = deepTr(v[k], depth + 1);
      return v;
    }
    return v;
  }

  if (lang === 'en' && window.Plotly) {
    for (const fn of ['newPlot', 'react']) {
      const orig = window.Plotly[fn].bind(window.Plotly);
      window.Plotly[fn] = (el, data, layout, cfg) => orig(el, deepTr(data, 0), deepTr(layout, 0), cfg);
    }
    if (window.Plotly.relayout) {
      const origRl = window.Plotly.relayout.bind(window.Plotly);
      window.Plotly.relayout = (el, upd) => origRl(el, deepTr(upd, 0));
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
