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
    ['Общо натоварване на мрежата: товар на РБ (потребление) + зареждане на батерии (ССЕЕ) + зареждане на помпи (ПАВЕЦ). ЕСО SCADA 5-мин данни от май 2026.',
     'Total grid draw: Bulgaria load (consumption) + battery charging (BESS) + pump charging (PSH). ESO SCADA 5-min data since May 2026.'],
    ['Максимално общо производство в дневния прозорец 08:00–18:00 ч. (българско време). ЕСО SCADA 5-мин данни от май 2026.',
     'Maximum total generation within the daylight window 08:00–18:00 (BG local time). ESO SCADA 5-min data since May 2026.'],
    ['Максимално общо производство във вечерния пиков прозорец 18:00–22:00 ч. (българско време). ЕСО SCADA 5-мин данни от май 2026.',
     'Maximum total generation within the evening peak window 18:00–22:00 (BG local time). ESO SCADA 5-min data since May 2026.'],
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
    ['Промяна от 01.01.', 'Change since Jan 1'],
    [' от 01.01.', ' since Jan 1'],
    [' за 3 год.', ' over 3 yrs'],
    [' за 1 год.', ' over 1 yr'],
    ['Промяна за 1г.', 'Change over 1yr'],
    ['Промяна за 3г.', 'Change over 3yr'],
    ['🟣 Цена <10 EUR', '🟣 Price <10 EUR'],
    ['🔴 Часове >200 EUR/год.', '🔴 Hours >200 EUR/yr'],
    ['Часове с цена <10 EUR/MWh 365д MA (бр./год.)', 'Hours with price <10 EUR/MWh 365d MA (count/yr)'],
    ['Часове с цена ≥200 EUR/MWh 365д MA (бр./год.)', 'Hours with price ≥200 EUR/MWh 365d MA (count/yr)'],
    ['Часове/год.:', 'Hours/yr:'],
    ['от Ember почасови цени — 365-дневна плъзгаща средна на дневния брой часове с цена <10 EUR/MWh (лилаво) и с цена ≥200 EUR/MWh (червено), приведена към годишна база (× 365).',
     'from Ember hourly prices — 365-day rolling average of the daily count of hours priced <10 EUR/MWh (purple) and ≥200 EUR/MWh (red), annualized (× 365).'],
    ['Часове/год.', 'Hours/yr'],
    ['TWh/год.', 'TWh/yr'],

    // ═══ battery_spread_4h.html ═══ (longer/more specific strings first --
    // several of these overlap, e.g. the full page title contains the shorter
    // dropdown-link text as a prefix)
    ['Спред 4ч — арбитраж на батерии — БГ Eнергетика', '4h Spread — battery arbitrage — BG Energy'],
    ['Спред 4ч — арбитраж на батерии', '4h spread — battery arbitrage'],
    ['Най-добър постижим 4-часов спред (теоретичен, перфектна прогноза)',
     'Best achievable 4-hour spread (theoretical, perfect foresight)'],
    ['Ember Climate, почасови Day-Ahead цени за България, от октомври 2016 г.',
     'Ember Climate, hourly day-ahead prices for Bulgaria, since October 2016.'],
    ['за всеки календарен ден (българско време) се намира най-евтиният непрекъснат 4-часов прозорец (теоретично зареждане) и най-скъпият непрекъснат 4-часов прозорец (теоретично разреждане); спредът е разликата между средните им цени (EUR/MWh). Това е стандартна оценка на арбитражния потенциал при батерия с фиксирана продължителност и перфектна прогноза за деня — не изисква зареждането да предхожда разреждането във времето и не отчита ефективност на цикъла, деградация или пазарно въздействие.',
     'for every calendar day (BG local time), we find the cheapest contiguous 4-hour window (theoretical charging) and the priciest contiguous 4-hour window (theoretical discharging); the spread is the difference between their average prices (EUR/MWh). This is a standard benchmark of arbitrage potential for a fixed-duration battery with perfect foresight of the day — it does not require charging to precede discharging in time and ignores cycle efficiency, degradation, or market impact.'],
    ['Стойностите са илюстративни, не реални финансови резултати — те са теоретичен таван ("perfect foresight"), а не това, което реална батерия действително е спечелила. За по-реалистично моделиране на диспечиране виж bess_analysis.py / weekly_battery_calibrated.py в проекта.',
     'Values are illustrative, not real financial results — they are a theoretical ceiling ("perfect foresight"), not what a real battery actually captured. For more realistic dispatch modeling, see bess_analysis.py / weekly_battery_calibrated.py in the project.'],
    ['Методология:', 'Methodology:'],
    ['Текуща 365д плъзгаща средна', 'Current 365d moving average'],
    ['Текуща 30д плъзгаща средна', 'Current 30d moving average'],
    ['Текуща 7д плъзгаща средна', 'Current 7d moving average'],
    ['Текуща плъзгаща средна', 'Current moving average'],
    ['Последен ден (сурова стойност)', 'Latest day (raw value)'],
    ['(сурова, силно шумна)', '(raw, highly noisy)'],
    ['365д MA спред (EUR/MWh)', '365d MA spread (EUR/MWh)'],
    ['30д MA спред (EUR/MWh)', '30d MA spread (EUR/MWh)'],
    ['7д MA спред (EUR/MWh)', '7d MA spread (EUR/MWh)'],
    ['365д MA', '365d MA'],
    ['30д MA', '30d MA'],
    ['7д MA', '7d MA'],
    ['Спред (EUR/MWh)', 'Spread (EUR/MWh)'],
    ['към ', 'as of '],

    // ═══ pumps.html (long entries first -- they overlap with shorter charging.html
    // entries below, e.g. both start with "ЕСО SCADA, 5-минутни снимки..."; SUB
    // matches in array order, so the longer/more specific string must win first) ═══
    [' ЕСО отчита само сумарна мощност на помпите ("Помпи"), без да казва коя централа зарежда. Разпознаването е по стойността: всяка централа/агрегат работи на почти фиксирана мощност (изследвано от историческите данни, съпоставено с публичните технически параметри на НЕК) — Чаира ~188 MW на агрегат (4 бр., 788 MW общо в помпен режим), Белмекен ~53 MW на агрегат (2 бр., 104 MW общо), Орфей ~40 MW (1 обратим агрегат от 4, 47 MW номинално). За всяко 5-минутно отчитане алгоритъмът намира комбинацията брой-работещи-агрегати, чиято сума е най-близо до отчетената обща мощност.',
     ' ESO only reports total pump power ("Помпи"), without saying which station is charging. Stations are identified by value: each station/unit runs at a nearly fixed power level (derived from historical data, cross-checked against НЕК\'s published technical specs) — Chaira ~188 MW per unit (4 units, 788 MW total pump-mode capacity), Belmeken ~53 MW per unit (2 units, 104 MW total), Orfei ~40 MW (1 of its 4 units is reversible, 47 MW nameplate). For every 5-minute reading, the algorithm finds the combination of running units whose sum is closest to the reported total power.'],
    [' ЕСО SCADA, 5-минутни снимки от 3 юни 2026 (пускане на помпите на ПАВЕЦ Чаира). Дневна енергия = сума от приписаната мощност на всяка централа × 5 мин. Дни с непълни данни (под 270 от 288 снимки) са пропуснати, освен днешния ден (маркиран с *), който е частичен и се допълва.',
     ' ESO SCADA, 5-minute snapshots since 3 June 2026 (commissioning of the Chaira PSH pumps). Daily energy = sum of each station\'s attributed power × 5 min. Days with incomplete data (fewer than 270 of 288 snapshots) are skipped, except today (marked with *), which is partial and still filling in.'],

    // ═══ charging.html ═══
    ['Дневна енергия за зареждане, последните 35 дни — батерии (ССЕЕ) и помпи (ПАВЕЦ)',
     'Daily charging energy, last 35 days — batteries (BESS) and pumps (PSH)'],
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
    ['Дни с непълни данни (под 270 от 288 снимки) са пропуснати, освен днешния ден (маркиран с *), който е частичен и се допълва.',
     'Days with incomplete data (fewer than 270 of 288 snapshots) are skipped, except today (marked with *), which is partial and still filling in.'],
    ['Номинален капацитет на резервоара на Чаира ~6.4 ГВтч', 'Nominal Chaira reservoir capacity ~6.4 GWh'],
    ['Жълта линия', 'Yellow line'],
    ['(кликнете в легендата, за да я покажете):', '(click the legend to show it):'],
    ['Оранжеви ленти:', 'Orange bands:'],
    ['съботно-неделни дни.', 'weekend days.'],
    ['Данни:', 'Data:'],
    ['Батерии — средно на ден', 'Batteries — daily average'],
    ['Помпи — средно на ден', 'Pumps — daily average'],
    ['Общо — средно на ден', 'Total — daily average'],
    ['Батерии (ССЕЕ)', 'Batteries (BESS)'],
    ['Помпи (ПАВЕЦ)', 'Pumps (PSH)'],
    ['Резервоар Чаира (~6.4 ГВтч)', 'Chaira reservoir (~6.4 GWh)'],
    ['Батерии:', 'Batteries:'],
    ['Грешка при зареждане на данните:', 'Error loading data:'],
    ['ГВтч/ден', 'GWh/day'],
    [' ГВтч', ' GWh'],
    ['макс ', 'max '],

    // ═══ pumps.html ═══
    ['💧 Зареждане на помпи по централи — Чаира, Белмекен, Орфей', '💧 Pump charging by station — Chaira, Belmeken, Orfei'],
    ['Зареждане на помпи по централи — Чаира, Белмекен, Орфей', 'Pump charging by station — Chaira, Belmeken, Orfei'],
    ['💧 Зареждане на помпи — Чаира/Белмекен/Орфей', '💧 Pump charging — Chaira/Belmeken/Orfei'],
    ['Зареждане (ССЕЕ + помпи)', 'Charging (BESS + pumps)'],
    ['Дневна енергия за зареждане по централи, последните 35 дни',
     'Daily charging energy by station, last 35 days'],
    ['Чаира — средно на ден', 'Chaira — daily average'],
    ['Белмекен — средно на ден', 'Belmeken — daily average'],
    ['Орфей — средно на ден', 'Orfei — daily average'],
    ['Денонощен профил на зареждане по централи', '24h charging profile by station'],
    ['Дневна статистика (ГВтч)', 'Daily statistics (GWh)'],
    ['Чаира', 'Chaira'],
    ['Белмекен', 'Belmeken'],
    ['Орфей', 'Orfei'],
    ['Общо', 'Total'],
    ['Дата', 'Date'],
    ['Ден:', 'Day:'],
    [' (днес)', ' (today)'],
    ['Как е определена централата:', 'How the station was identified:'],
    ['Как е определена централата', 'How the station was identified'],
    ['Граница на шума:', 'Noise floor:'],
    [' стойности под 15 MW се третират като 0 (изключени помпи).',
     'values under 15 MW are treated as 0 (pumps off).'],

    // ═══ sdac_mc.html ═══
    ['SDAC — Пазарно обвързване БГ / Гърция / Румъния', 'SDAC — Market coupling BG / Greece / Romania'],
    ['Ключови показатели за деня', "Key figures for the day"],
    ['Средна цена БГ', 'Average price BG'],
    ['Средна цена Гърция', 'Average price Greece'],
    ['Средна цена Румъния', 'Average price Romania'],
    ['Пари от обмена (без реекспорт)', 'Money from the exchange (excluding re-export)'],
    ['изключен реекспорт: ', 'excluded re-export: '],
    ['🔋 Оптимален 4-часов интервал за батерия', '🔋 Optimal 4-hour window for a battery'],
    ['Зареждане (най-евтин 4ч)', 'Charging (cheapest 4h)'],
    ['Разреждане (най-скъп 4ч)', 'Discharging (priciest 4h)'],
    ['Спред / приход на MW', 'Spread / revenue per MW'],
    ['няма положителен спред за деня', 'no positive spread for the day'],
    ['≈ ', '≈ '],
    [' / MW на цикъл (90% рундтрип ефективност)', ' / MW per cycle (90% round-trip efficiency)'],
    ['ℹ️ Методология', 'ℹ️ Methodology'],
    ['Пари от обмена', 'Money from the exchange'],
    [' = нетен поток (МВт) × ценова разлика (съсед − БГ) × продължителност на интервала, сумирано за ГР и РО.',
     ' = net flow (MW) × price difference (neighbour − BG) × interval duration, summed over GR and RO.'],
    ['Реекспорт (транзит):', 'Re-export (transit):'],
    [' когато БГ едновременно внася от единия съсед и изнася към другия, припокриващият се обем се третира като преминаващ транзитно през БГ и се изважда — не се брои като печалба от собствена търговия на БГ.',
     ' when BG simultaneously imports from one neighbour and exports to the other, the overlapping volume is treated as passing through BG in transit and is subtracted out — it does not count as BG\'s own trading profit.'],
    ['4-часова батерия:', '4-hour battery:'],
    [' търси се неприпокриващ се 4-часов прозорец с най-ниска средна цена (зареждане) и 4-часов прозорец с най-висока средна цена (разреждане) в рамките на деня по БГ цената; приходът на MW е ориентировъчен, при 90% рундтрип ефективност.',
     ' a non-overlapping 4-hour window with the lowest average price (charging) and a 4-hour window with the highest average price (discharging) are found within the day using the BG price; the revenue per MW is indicative, at 90% round-trip efficiency.'],
    ['📋 Анализ на деня', '📋 Daily analysis'],
    ['Часови цени — БГ / Гърция / Румъния', 'Hourly prices — BG / Greece / Romania'],
    ['Планиран обмен спрямо наличен капацитет', 'Scheduled exchange vs. available capacity'],
    ['Паричен поток от рентата (по интервали и натрупано)', 'Money flow from the rent (per interval and cumulative)'],
    ['Капацитет за внос и износ не е еднакъв', 'Import and export capacity are not the same'],
    [' — пунктираните линии на графиките за обмен показват реалния капацитет във всяка посока поотделно (горна = внос, долна = износ), не огледален еднакъв лимит.',
     ' — the dotted lines on the exchange charts show the actual capacity in each direction separately (top = import, bottom = export), not a single mirrored limit.'],
    ['Капацитет за внос', 'Import capacity'],
    ['Капацитет за износ', 'Export capacity'],
    ['Натрупано (дясна ос е скрита — виж стойност в подсказка)', 'Cumulative (right axis hidden — see value in tooltip)'],
    ['Натрупано: ', 'Cumulative: '],
    ['Натрупано, EUR', 'Cumulative, EUR'],
    ['EUR / интервал', 'EUR / interval'],
    ['(+ = внос в БГ; ● = наситен капацитет)', '(+ = import into BG; ● = saturated capacity)'],
    ['(+ = износ от БГ; ● = наситен капацитет)', '(+ = export from BG; ● = saturated capacity)'],
    ['(+ = внос в БГ)', '(+ = import into BG)'],
    ['(+ = износ от БГ)', '(+ = export from BG)'],
    ['наситен капацитет: ', 'saturated capacity: '],
    [' МВч', ' MWh'],
    ['Няма данни за ', 'No data for '],
    ['Борсовите цени за ', 'Day-ahead prices for '],
    [' все още не са публикувани (наличен ', ' are not published yet (available '],
    [' интервала) — проверете отново по-късно.', ' intervals) — check again later.'],
    ['Няма налични данни.', 'No data available.'],
    ['Положителна стойност = приход от коупъла (износ към по-скъп пазар или внос от по-евтин); не е реален паричен превод към ЕСО, а теоретична стойност на пазарното сближаване.',
     'A positive value = coupling revenue (export to a pricier market, or import from a cheaper one); not an actual payment to ESO, but a theoretical value of the market coupling.'],
    [' IBEX SDAC Market Coupling, обновявани дневно около 16:00 ч. българско време.',
     ' IBEX SDAC Market Coupling, updated daily around 16:00 Sofia time.'],
    ['Обвързана цена', 'Coupled price'],
    [' = разлика ≤ 1 EUR/MWh между пазарите. ', ' = difference ≤ 1 EUR/MWh between markets. '],
    [' = използван поток ≥ 90% от наличния.', ' = used flow ≥ 90% of available.'],

    // report sentences (fragments split at <b> tag boundaries -- each becomes
    // its own DOM text node, so the dictionary entries must match that, not
    // the pre-HTML template string)
    ['Този ден е №', 'This day is #'],
    [' от последните ', ' out of the last '],
    [' дни по ', ' days for '],
    ['пари от обмена', 'money from the exchange'],
    ['спред за 4-часова батерия', '4-hour battery spread'],
    ['насищане на интерконектора с Гърция', 'Greece interconnector saturation'],
    ['насищане на интерконектора с Румъния', 'Romania interconnector saturation'],
    ['ценова разлика с Гърция', 'price gap with Greece'],
    ['ценова разлика с Румъния', 'price gap with Romania'],
    ['БГ е ', 'BG is '],
    ['ценово обвързана с Гърция', 'price-coupled with Greece'],
    ['ценово обвързана с Румъния', 'price-coupled with Romania'],
    ['% от денонощието — предимно самостоятелна ценова зона през останалото време.',
     '% of the day — mostly its own price zone the rest of the time.'],
    ['% от денонощието.', '% of the day.'],
    ['Слънчев излишък в региона:', 'Regional solar surplus:'],
    [' и БГ (', ' both BG ('],
    ['), и Гърция (', '), and Greece ('],
    [') падат до ниски цени през 10–16 ч, с обвързан пазар — регионален, не само локален излишък на слънчева енергия.',
     ') fall to low prices during 10:00–16:00, with a coupled market — a regional, not just local, solar surplus.'],
    ['През слънчевите часове (10–16 ч) цената в БГ падна до ', 'During solar hours (10:00–16:00) the BG price fell to '],
    [', но обменът със съседите остана слаб спрямо денонощната средна — вероятно батериите поемат по-голямата част от излишъка, вместо той да се изнася.',
     ', but exchange with neighbours stayed weak relative to the daily average — batteries are likely absorbing most of the surplus rather than it being exported.'],
    [', придружено от засилен износ към Гърция — излишъкът основно се изнася, не се съхранява.',
     ', accompanied by increased export to Greece — the surplus is mainly exported, not stored.'],
    [' Денят е почивен, а потреблението обичайно е по-ниско — това вероятно засилва ефекта, не само слънчевото производство.',
     ' It is a weekend, and consumption is typically lower — this likely reinforces the effect, not just solar output.'],
    ['Интерконекторът с Гърция е наситен през слънчевите часове', 'The interconnector with Greece is saturated during solar hours'],
    [' (10–16 ч) в ', ' (10:00–16:00) in '],
    ['% от интервалите — БГ внася на пределния капацитет евтина слънчева енергия от ГР, но цената в БГ остава средно ',
     '% of intervals — BG imports cheap solar energy from GR at the capacity limit, but the BG price stays on average '],
    [' EUR/MWh по-висока и не се изравнява.', ' EUR/MWh higher and does not converge.'],
    [' Възможна причина: БГ едновременно зарежда батерии (средно ', ' Possible reason: BG is simultaneously charging batteries (average '],
    [') и изнася средно ', ') and exporting on average '],
    [' MW към Румъния през същите часове — и двете отвеждат стойността другаде, намалявайки натиска цената в БГ да се сближи с почти нулевата в ГР.',
     ' MW to Romania during the same hours — both route the value elsewhere, reducing the pressure for the BG price to converge with GR\'s near-zero level.'],
    [' Възможна причина: БГ едновременно зарежда батерии средно ', ' Possible reason: BG is simultaneously charging batteries at an average of '],
    [' MW през същите часове — излишъкът се съхранява за по-късна употреба, вместо цената да пада допълнително.',
     ' MW during the same hours — the surplus is stored for later use instead of the price falling further.'],
    [' Възможна причина: БГ едновременно изнася средно ', ' Possible reason: BG simultaneously exports on average '],
    [' MW към Румъния през същите часове — алтернативен пазар с по-висока цена намалява натиска цената в БГ да се сближи с почти нулевата в ГР.',
     ' MW to Romania during the same hours — an alternative, higher-priced market reduces the pressure for the BG price to converge with GR\'s near-zero level.'],
    ['Наситен капацитет с Румъния', 'Saturated capacity with Romania'],
    ['Наситен капацитет с Гърция', 'Saturated capacity with Greece'],
    ['Наситен капацитет', 'Saturated capacity'],
    [' през пиковите часове (18–22 ч), ', ' during peak hours (18:00–22:00), '],
    ['% от интервалите на границата на пропускателната способност (среден обмен ',
     '% of intervals at the transfer-capacity limit (average exchange '],
    [' MW), при устойчива ценова разлика от ', ' MW), with a persistent price gap of '],
    [' EUR/MWh — интерконекторът вероятно е ограничаващ фактор в тези часове.',
     ' EUR/MWh — the interconnector is likely a limiting factor during these hours.'],
    [' MW), при ценова разлика от ', ' MW), with a price gap of '],
    [' EUR/MWh.', ' EUR/MWh.'],
    ['Пиковите часове (18–22 ч) не показват насищане на интерконекторите — капацитетът е достатъчен спрямо търсения обмен.',
     'Peak hours (18:00–22:00) show no interconnector saturation — capacity is sufficient for the exchange demanded.'],
    ['БГ внася от Гърция през пиковите часове (среден нетен поток ', 'BG imports from Greece during peak hours (average net flow '],
    [' MW от ГР) — гръцките газови централи вероятно определят пределната цена в тези часове и изнасят към БГ, вместо обратното.',
     ' MW from GR) — Greek gas plants are likely setting the marginal price during these hours and exporting into BG, rather than the other way around.'],
    ['Няма съществен пиков износ към Гърция (среден нетен поток ', 'No significant peak export to Greece (average net flow '],
    [' MW) — ', ' MW) — '],
    ['Румъния поглъща по-голямата част от батерийния износ', 'Romania is absorbing most of the battery export'],
    [' през пика (среден нетен поток ', ' during peak hours (average net flow '],
    [' MW към РО), не оставяйки свободен капацитет за ГР.', ' MW to RO), leaving no spare capacity for GR.'],
    ['Пиковият износ към Гърция (среден нетен поток ', 'Peak export to Greece (average net flow '],
    [' MW) вероятно измества природен газ пикови централи там през тези часове.',
     ' MW) is likely displacing natural gas peaker plants there during these hours.'],
    ['Румъния плати средно ', 'Romania paid on average '],
    [' EUR/MWh повече от БГ за деня, а износът БГ→РО достигна пределния капацитет в ',
     ' EUR/MWh more than BG for the day, and BG→RO export reached the capacity limit in '],
    ['% от интервалите (среден износ ', '% of intervals (average export '],
    [' MW през тези интервали) — възможен недостиг на предлагане в Румъния, ограничен от преносната способност.',
     ' MW during those intervals) — a possible supply shortfall in Romania, constrained by transfer capacity.'],
    ['Румъния е средно ', 'Romania is on average '],
    ['Гърция е средно ', 'Greece is on average '],
    [' EUR/MWh ', ' EUR/MWh '],
    [' спрямо БГ за деня — ', ' than BG for the day — '],
    ['вероятно заради наситен интерконектор през ', 'likely due to a saturated interconnector during '],
    ['% от денонощието), ограничаващ обмена между пазарите.', '% of the day), limiting exchange between the markets.'],
    ['пазарите останаха предимно необвързани (само ', 'the markets stayed mostly uncoupled (only '],
    ['% от денонощието с изравнена цена).', '% of the day with matching prices).'],
    ['въпреки сравнително добра ценова обвързаност (', 'despite relatively good price coupling ('],
    ['% от денонощието).', '% of the day).'],
    ['по-скъпа', 'more expensive'],
    ['по-евтина', 'cheaper'],
    ['БГ ↔ ', 'BG ↔ '],
    [' през ', ' for '],  // generic, must stay after all longer " през ..." phrases above

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
    ['Пиково потребление', 'Peak consumption'],
    ['Пиково производство (дневно, 08-18ч)', 'Peak generation (daylight, 08-18h)'],
    ['Пиково производство (вечерен пик, 18-22ч)', 'Peak generation (evening peak, 18-22h)'],

    // ═══ headers / navigation ═══
    ['БГ Мрежов Монитор — неофициален', 'BG Grid Monitor — unofficial'],
    ['⚡ Тогава срещу сега — трансформацията на мрежата', '⚡ Then vs. now — the grid\'s transformation'],
    ['Тогава срещу сега — трансформацията на мрежата', 'Then vs. now — the grid\'s transformation'],
    ['Два дни, почти еднакво потребление и износ — различна енергийна система',
     'Two days, almost identical consumption and exports — a different power system'],
    ['5 август 2022 — енергийна криза', '5 August 2022 — energy crisis'],
    ['Микс на производство — денонощен профил', 'Generation mix — 24h profile'],
    ['Потребление', 'Consumption'],
    ['Нетен износ', 'Net export'],
    ['Плъзнете кръга наляво/надясно, за да разкриете повече от единия или другия ден. И двата графика показват MW по източник, по часове (българско местно време), на еднаква скala.',
     'Drag the circle left/right to reveal more of one day or the other. Both charts show MW by source, by hour (Bulgaria local time), on the same scale.'],
    ['Как е избран денят от 2022:', 'How the 2022 day was picked:'],
    [' търсене сред всички летни дни (юни–август) на 2022–2025 г. по най-близко едновременно съвпадение по дневно потребление (GWh) и нетен износ (GWh) спрямо избрания днешен ден — без филтър по въглища, за да не се изкриви резултатът. 5 август 2022 излезе на първо място по комбинирана близост.',
     ' a search across every summer day (June–August) from 2022–2025 for the closest simultaneous match on daily consumption (GWh) and net export (GWh) to the chosen day today — no coal filter, so the result wasn\'t skewed. 5 August 2022 came out on top by combined closeness.'],
    ['Категории на производство:', 'Generation categories:'],
    [' опростени до 7 групи, съпоставими между ENTSOE (2022 г.) и ЕСО SCADA (2026 г.) — „Въглища" обединява Кондензационни + Топлофикационни + Заводски ТЕЦ (същата конвенция, използвана в другите анализи на този проект за приемственост между източниците на данни). Батерии (ССЕЕ) не съществуваха през 2022 г.',
     ' simplified to 7 groups, comparable between ENTSOE (2022) and ESO SCADA (2026) — "Coal" combines condensing + district-heating + industrial TPPs (the same convention used elsewhere in this project for continuity between data sources). Batteries (BESS) didn\'t exist in 2022.'],
    ['Данни:', 'Data:'],
    [' ENTSOE Transparency Platform (2022) и ЕСО SCADA на 5-минутни интервали (2026), осреднени по час.',
     ' ENTSOE Transparency Platform (2022) and ESO SCADA at 5-minute intervals (2026), averaged hourly.'],
    ['Въглища', 'Coal'],
    ['БГ производство по източници — ', 'BG generation by source — '],
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
    ['GitHub в момента има проблеми с достъпа до данните — показва се резервно (остаряло) копие',
     'GitHub is currently having data-access issues — showing a backup (stale) copy'],
    ['Исторически ден — не е в реално време', 'Historical day — not real-time'],
    ['🏆 Пълна история на рекордите →', '🏆 Full record history →'],
    ['🏆 Рекорди', '🏆 Records'],
    ['Анализи', 'Analyses'],
    ['Табло', 'Dashboard'],
    ['Снимки за деня', 'Snapshots today'],
    ['5-мин записи', '5-min records'],
    ['Снимка:', 'Snapshot:'],
    ['Днес', 'Today'],
    ['Утре', 'Tomorrow'],

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
    ['Общо производство', 'Total generation'],
    ['Общо потребление', 'Total consumption'],
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
    ['мрежата', 'the grid'],
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
