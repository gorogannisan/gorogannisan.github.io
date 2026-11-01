window.ARTICLES_DATABASE = [
  {
    "slug": "compose-multiplatform-offline-schedule",
    "title": "Как я перевел расписание университета на Compose Multiplatform",
    "subtitle": "Оффлайн-кэш, виджеты Glance на рабочем столе и архитектура, которая не подводит в подвальных аудиториях.",
    "tag": "KMP & Android",
    "badge": "badge-guides",
    "category": "Разбор",
    "format": "Кейс",
    "date": "2026-10-18",
    "readTime": "6 мин",
    "version": "v1.0",
    "author": "Гор Оганнисян",
    "authorRole": "Lead Developer",
    "authorHandle": "@gorogannisan",
    "authorUrl": "https://gorogannisan.site",
    "authorAvatar": "assets/gor-avatar.png",
    "apps": [
      "Kotlin Multiplatform",
      "Jetpack Compose",
      "Jetpack Glance",
      "SQLDelight / Room",
      "Ktor Client",
      "AlarmManager"
    ],
    "content_html": "<p>Официальные порталы учебных заведений часто падают в самый ответственный момент. В этой статье я детально разбираю, как спроектировал и реализовал мобильное приложение Schedule на Kotlin Multiplatform и Jetpack Compose так, чтобы студенты получали номер аудитории за 12 миллисекунд даже без подключения к интернету.</p>\n\n<ol class=\"rv rv-flow\">\n<li class=\"rv-step\">\n  <span class=\"rv-step-k\"><span class=\"rv-step-n\">01</span></span>\n  <b class=\"rv-step-t\">Кэш-ориентированный запрос</b>\n  <span class=\"rv-step-p\">Чтение расписания исключительно из локальной SQLite базы</span>\n</li>\n<li class=\"rv-step\">\n  <span class=\"rv-step-k\"><span class=\"rv-step-n\">02</span></span>\n  <b class=\"rv-step-t\">Рендеринг за 12 мс</b>\n  <span class=\"rv-step-p\">Мгновенная отрисовка Compose UI без спиннеров</span>\n</li>\n<li class=\"rv-step\">\n  <span class=\"rv-step-k\"><span class=\"rv-step-n\">03</span></span>\n  <b class=\"rv-step-t\">Фоновая синхронизация</b>\n  <span class=\"rv-step-p\">Тихий опрос API по AlarmManager при наличии сети</span>\n</li>\n<li class=\"rv-step\">\n  <span class=\"rv-step-k\"><span class=\"rv-step-n\">04</span></span>\n  <b class=\"rv-step-t\">Нативный виджет Glance</b>\n  <span class=\"rv-step-p\">Текущая пара на экране блокировки без запуска приложения</span>\n</li>\n</ol>\n\n<h2 id=\"problema-servery-vuza-padayut-v-850-utra\">Проблема: серверы вуза падают в 8:50 утра</h2>\n\n<p>Каждый семестр тысячи студентов сталкиваются с одной и той же ситуацией: 8:50 утра, первый этаж университета или цокольная аудитория, мобильная связь ловит одну «палочку» EDGE, а университетский сервер не справляется с одновременным наплывом запросов и отдает <code>504 Gateway Timeout</code>. Студенты вынуждены открывать размытые скриншоты или судорожно листать многостраничные Excel-таблицы с телефона.</p>\n\n<blockquote><p>Главная цель разработки: сделать инструмент, который <strong>принципиально не может зависнуть перед парой</strong>. Пользователь должен открывать экран и мгновенно видеть номер кабинета.</p></blockquote>\n\n<h2 id=\"arhitektura-offline-first-i-mvi\">Архитектура: Offline-First и MVI</h2>\n\n<p>В основу системы легла концепция Offline-First. Приложение никогда не ждет ответ от сети для отображения контента. Все данные всегда читаются из локального хранилища, а сеть рассматривается лишь как вспомогательный канал актуализации.</p>\n\n<div class=\"rv rv-hub\" role=\"img\" aria-label=\"Schedule Core architecture\">\n  <div class=\"rv-hub-center\">\n    <span class=\"rv-hub-name\">Schedule Core</span>\n    <span class=\"rv-hub-note\">KMP Common Code</span>\n  </div>\n  <svg class=\"rv-hub-wires\" viewBox=\"0 0 100 100\" preserveAspectRatio=\"none\" aria-hidden=\"true\">\n    <path d=\"M0,50 C55,50 45,12.50 100,12.50\"/><path d=\"M0,50 C55,50 45,37.50 100,37.50\"/><path d=\"M0,50 C55,50 45,62.50 100,62.50\"/><path d=\"M0,50 C55,50 45,87.50 100,87.50\"/>\n  </svg>\n  <ol class=\"rv-hub-spokes\">\n    <li class=\"rv-spoke\">\n  <span class=\"rv-spoke-t\">\n    <b>SQLDelight / Room Cache</b>\n    <span>Локальная SQLite база данных с мгновенным временем выборки</span>\n  </span>\n</li>\n<li class=\"rv-spoke\">\n  <span class=\"rv-spoke-t\">\n    <b>Jetpack Glance Widget</b>\n    <span>Нативный виджет домашнего экрана, обновляемый по таймеру</span>\n  </span>\n</li>\n<li class=\"rv-spoke\">\n  <span class=\"rv-spoke-t\">\n    <b>AlarmManager Worker</b>\n    <span>Пробуждение процессов строго в моменты звонков на пары</span>\n  </span>\n</li>\n<li class=\"rv-spoke\">\n  <span class=\"rv-spoke-t\">\n    <b>Ktor Background Client</b>\n    <span>Асинхронная выкачка диффов расписания при наличии Wi-Fi</span>\n  </span>\n</li>\n  </ol>\n</div>\n\n<p>Вот как выглядит шаблон репозитория с гарантированным кэшированием в общем KMP модуле:</p>\n\n<p><div class=\"rs-code\">\n  <div class=\"rs-code-bar\">\n    <span class=\"resource-badge badge-prompts\">Kotlin Multiplatform Repository</span>\n    <button type=\"button\" class=\"rs-btn rs-btn-secondary rs-btn-sm\" data-rs-copy>\n      <svg viewBox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"9\" y=\"9\" width=\"11\" height=\"11\" rx=\"2\"></rect><path d=\"M5 15V6a2 2 0 0 1 2-2h9\"></path></svg>\n      <span>Copy</span>\n    </button>\n  </div>\n  <pre><code>class ScheduleRepository(\n    private val localDb: ScheduleQueries,\n    private val apiClient: KtorScheduleApi\n) {\n    // UI подписывается на Flow из локальной базы данных\n    fun observeDaySchedule(groupId: String, date: LocalDate): Flow&lt;List&lt;Lesson&gt;&gt; {\n        return localDb.getLessonsByDate(groupId, date.toEpochDay())\n            .asFlow()\n            .mapToList(Dispatchers.Default)\n    }</p>\n\n<p>// Фоновая синхронизация: не блокирует UI и сохраняет диффы\n    suspend fun syncInBackground(groupId: String) = withContext(Dispatchers.IO) {\n        runCatching {\n            val freshSchedule = apiClient.fetchSchedule(groupId)\n            localDb.transaction {\n                freshSchedule.forEach { localDb.insertOrReplace(it.toEntity()) }\n            }\n        }\n    }\n}</code></pre>\n</div></p>\n\n<h2 id=\"vidzhety-rabochego-stola-na-jetpack-glance\">Виджеты рабочего стола на Jetpack Glance</h2>\n\n<p>Студенту неудобно разблокировать телефон, находить иконку приложения и ждать загрузки, когда он на бегу поднимается по лестнице к аудитории. Я вынес ключевую информацию на рабочий стол с помощью Jetpack Glance.</p>\n\n<h3>Как устроен процесс обновления виджета</h3>\n\n<ol class=\"rv-steps\">\n<li><strong>Определение временного окна.</strong> Алгоритм рассчитывает текущий интервал звонков и определяет статус: «Идет пара», «Перемена (15 минут)» или «Учебный день завершен».</li>\n<li><strong>Прямая выборка из БД.</strong> Glance-виджет выполняет прямой синхронный запрос в локальную SQLite базу без инициализации тяжелых компонентов UI-приложения.</li>\n<li><strong>Установка AlarmManager.</strong> Виджет не крутит фоновый опрос в цикле. Вместо этого регистрируется точный аларм на следующую временную отсечку звонка (например, 10:20, 12:10). Это обеспечивает 0% расхода аккумулятора в фоне.</li>\n</ol>\n\n<p><div class=\"rs-code\">\n  <div class=\"rs-code-bar\">\n    <span class=\"resource-badge badge-prompts\">Jetpack Glance Composable</span>\n    <button type=\"button\" class=\"rs-btn rs-btn-secondary rs-btn-sm\" data-rs-copy>\n      <svg viewBox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"9\" y=\"9\" width=\"11\" height=\"11\" rx=\"2\"></rect><path d=\"M5 15V6a2 2 0 0 1 2-2h9\"></path></svg>\n      <span>Copy</span>\n    </button>\n  </div>\n  <pre><code>class ScheduleWidget : GlanceAppWidget() {\n    override suspend fun provideGlance(context: Context, id: GlanceId) {\n        val currentLesson = LocalScheduleManager.getCurrentOrNextLesson(context)</p>\n\n<p>provideContent {\n            GlanceTheme {\n                Column(\n                    modifier = GlanceModifier\n                        .fillMaxSize()\n                        .background(GlanceTheme.colors.surface)\n                        .padding(14.dp)\n                ) {\n                    Text(\n                        text = currentLesson?.subject ?: \"Пар больше нет 🎉\",\n                        style = TextStyle(fontWeight = FontWeight.Bold, fontSize = 16.sp)\n                    )\n                    Text(\n                        text = currentLesson?.classroom?.let { \"Аудитория $it\" } ?: \"Свободное время\",\n                        style = TextStyle(color = GlanceTheme.colors.primary, fontSize = 14.sp)\n                    )\n                }\n            }\n        }\n    }\n}</code></pre>\n</div></p>\n\n<h2 id=\"mgnovennyy-poisk-po-400-gruppam\">Мгновенный поиск по 400+ группам</h2>\n\n<p>В вузе обучаются десятки факультетов и сотни групп. Чтобы найти чужое расписание (например, узнать, где пара у друзей или где принимает зачет преподаватель), стандартный сайт требовал пройти 4 вложенных выпадающих списка.</p>\n\n<p>В Schedule я реализовал клиентский полнотекстовый индекс в памяти:\n- Все 400+ групп и 200+ фамилий преподавателей загружаются в легковесную префиксную структуру (Trie) весом менее 180 Кб.\n- Ввод символов фильтруется через дебаунс 150 мс: UI откликается на каждый символ без малейших фризов фреймрейта.\n- Поддерживается нечеткий поиск (Fuzzy match) при опечатках в фамилиях преподавателей.</p>\n\n<h2 id=\"rezultaty-i-metriki-v-boevyh-usloviyah\">Результаты и метрики в боевых условиях</h2>\n\n<p>Сравнение ключевых показателей между старым порталом вуза и моим решением на Compose Multiplatform:</p>\n\n<p><div class=\"rs-table\">\n  <table>\n    <thead><tr><th>Метрика</th><th>Официальный сайт</th><th>KMP Schedule</th></tr></thead>\n    <tbody>\n      <tr><td><strong>Время первого рендера</strong></td><td>3200–8500 мс</td><td><strong>12 мс (из кэша)</strong></td></tr>\n<tr><td><strong>Работа без интернета</strong></td><td>Недоступен (ERR_TIMEOUT)</td><td><strong>100% функционала доступно</strong></td></tr>\n<tr><td><strong>Размер данных за сессию</strong></td><td>~ 4.2 Мб (скрипты, стили)</td><td><strong>< 14 Кб (только дифф)</strong></td></tr>\n<tr><td><strong>Доступ к аудитории</strong></td><td>5 кликов, 4 селекта</td><td><strong>1 взгляд на виджет экрана</strong></td></tr>\n    </tbody>\n  </table>\n</div>\nСотни активных ежедневных пользователей среди студентов, нулевая зависимость от серверов вуза в момент звонка на пару и оценка 4.9 в сообществе доказали: правильный выбор нативного стека и offline-first архитектуры решает реальные проблемы пользователей.</p>",
    "toc": [
      {
        "id": "problema-servery-vuza-padayut-v-850-utra",
        "title": "Проблема: серверы вуза падают в 8:50 утра"
      },
      {
        "id": "arhitektura-offline-first-i-mvi",
        "title": "Архитектура: Offline-First и MVI"
      },
      {
        "id": "vidzhety-rabochego-stola-na-jetpack-glance",
        "title": "Виджеты рабочего стола на Jetpack Glance"
      },
      {
        "id": "mgnovennyy-poisk-po-400-gruppam",
        "title": "Мгновенный поиск по 400+ группам"
      },
      {
        "id": "rezultaty-i-metriki-v-boevyh-usloviyah",
        "title": "Результаты и метрики в боевых условиях"
      }
    ]
  },
  {
    "slug": "hackathon-48h-mvp-pipeline",
    "title": "Хакатон за 48 часов: мой стек, шаблоны и пайплайн от нуля до победы",
    "subtitle": "Чек-лист и тактика, с которыми я забрал 7+ призовых мест на всероссийских хакатонах.",
    "tag": "Process & Culture",
    "badge": "badge-playbooks",
    "category": "Плейбук",
    "format": "Руководство",
    "date": "2026-09-22",
    "readTime": "8 мин",
    "version": "v1.0",
    "author": "Гор Оганнисян",
    "authorRole": "Founder",
    "authorHandle": "@gorogannisan",
    "authorUrl": "https://gorogannisan.site",
    "authorAvatar": "assets/gor-avatar.png",
    "apps": [
      "Compose Multiplatform",
      "Vite + Tailwind",
      "FastAPI / Ktor",
      "Docker Compose",
      "Certbot SSL",
      "GitHub Actions"
    ],
    "content_html": "<p>Победа на хакатоне — это не магия, не «гениальные озарения» в 4 утра и не бессонные ночи. Это жесткая декомпозиция, заранее заготовленные боевые шаблоны репозиториев, беспощадное отсечение вторичных фич и стопроцентный фокус на рабочий демо-сценарий, который жюри сможет проверить вживую.</p>\n\n<ol class=\"rv rv-flow\">\n<li class=\"rv-step\">\n  <span class=\"rv-step-k\"><span class=\"rv-step-n\">0–4 ч</span></span>\n  <b class=\"rv-step-t\">Kill Your Darlings</b>\n  <span class=\"rv-step-p\">Выбор одной ключевой ценности и фиксация контракта API</span>\n</li>\n<li class=\"rv-step\">\n  <span class=\"rv-step-k\"><span class=\"rv-step-n\">4–24 ч</span></span>\n  <b class=\"rv-step-t\">Сборка ядра</b>\n  <span class=\"rv-step-p\">Рабочий Happy Path к субботнему вечеру на реальном VDS</span>\n</li>\n<li class=\"rv-step\">\n  <span class=\"rv-step-k\"><span class=\"rv-step-n\">24–36 ч</span></span>\n  <b class=\"rv-step-t\">Полировка UI</b>\n  <span class=\"rv-step-p\">Анимации, обработка крайних случаев и наполнение демо-данными</span>\n</li>\n<li class=\"rv-step\">\n  <span class=\"rv-step-k\"><span class=\"rv-step-n\">36–48 ч</span></span>\n  <b class=\"rv-step-t\">Питч & Бэкапы</b>\n  <span class=\"rv-step-p\">Запись демо-видео, репетиция тайминга и защита</span>\n</li>\n</ol>\n\n<h2 id=\"pravilo-pervyh-dvuh-chasov-kill-your-darlings\">Правило первых двух часов: Kill Your Darlings</h2>\n\n<p>90% команд проигрывают хакатон еще в пятницу вечером. Они собираются в переговорке и начинают проектировать «убийцу Uber с искусственным интеллектом, геймификацией и блокчейном». К утру воскресенья у них есть 10 недописанных микросервисов, падающий фронтенд и презентация с красивыми картинками, за которой нет продукта.</p>\n\n<blockquote><p>Мое золотое правило: <strong>Один сквозной пользовательский сценарий (Happy Path)</strong>. Пользователь нажимает три кнопки и получает видимый, осязаемый результат. Всё остальное — за борт.</p></blockquote>\n\n<h2 id=\"boevoy-tehnologicheskiy-stek-bez-overheda\">Боевой технологический стек без оверхеда</h2>\n\n<p>Во время 48 часов нет времени настраивать webpack, разбираться с CORS или настраивать базу данных с нуля. Вся архитектура поднимается из готового проверенного шаблона за 60 секунд.</p>\n\n<div class=\"rv rv-hub\" role=\"img\" aria-label=\"48h MVP Core architecture\">\n  <div class=\"rv-hub-center\">\n    <span class=\"rv-hub-name\">48h MVP Core</span>\n    <span class=\"rv-hub-note\">Boilerplate Stack</span>\n  </div>\n  <svg class=\"rv-hub-wires\" viewBox=\"0 0 100 100\" preserveAspectRatio=\"none\" aria-hidden=\"true\">\n    <path d=\"M0,50 C55,50 45,12.50 100,12.50\"/><path d=\"M0,50 C55,50 45,37.50 100,37.50\"/><path d=\"M0,50 C55,50 45,62.50 100,62.50\"/><path d=\"M0,50 C55,50 45,87.50 100,87.50\"/>\n  </svg>\n  <ol class=\"rv-hub-spokes\">\n    <li class=\"rv-spoke\">\n  <span class=\"rv-spoke-t\">\n    <b>Frontend: Compose / Vite Starter</b>\n    <span>Готовый шаблон с роутингом, темами и адаптивностью из коробки</span>\n  </span>\n</li>\n<li class=\"rv-spoke\">\n  <span class=\"rv-spoke-t\">\n    <b>Backend: FastAPI + OpenAPI</b>\n    <span>Автоматическая интерактивная документация Swagger для фронтендеров</span>\n  </span>\n</li>\n<li class=\"rv-spoke\">\n  <span class=\"rv-spoke-t\">\n    <b>Инфраструктура: Docker Compose</b>\n    <span>Поднятый VDS с Nginx, SSL certbot и авто-деплоем по git push</span>\n  </span>\n</li>\n<li class=\"rv-spoke\">\n  <span class=\"rv-spoke-t\">\n    <b>Mock API Layer</b>\n    <span>Фронтенд начинает верстку сразу на моках без ожидания бэкенда</span>\n  </span>\n</li>\n  </ol>\n</div>\n\n<h2 id=\"tayming-hakatona-raspisanie-po-chasam\">Тайминг хакатона: расписание по часам</h2>\n\n<p>Четкое распределение обязанностей и отсечек по времени позволяет спать по 5–6 часов каждую ночь и оставаться со свежей головой к моменту защиты перед жюри:</p>\n\n<div class=\"rs-table\">\n  <table>\n    <thead><tr><th>Время</th><th>Фаза</th><th>Ключевой результат</th></tr></thead>\n    <tbody>\n      <tr><td><strong>0 – 4 ч (Пт, вечер)</strong></td><td>Скоуп и контракт</td><td>Зафиксирован Swagger API, развернут репозиторий, подняты моки.</td></tr>\n<tr><td><strong>4 – 24 ч (Сб, день)</strong></td><td>Ядро системы</td><td>К 20:00 субботы основной сценарий работает в проде на сервере.</td></tr>\n<tr><td><strong>24 – 36 ч (Сб–Вс)</strong></td><td>Полировка и данные</td><td>Красивый визуал, анимации успеха, наполнение реалистичными данными.</td></tr>\n<tr><td><strong>36 – 44 ч (Вс, утро)</strong></td><td>Презентация и видео</td><td>Запись демо-скринкаста на случай падения Wi-Fi площадки.</td></tr>\n<tr><td><strong>44 – 48 ч (Вс, финал)</strong></td><td>Защита проекта</td><td>3 минуты питча: проблема → наше решение вживую → экономика.</td></tr>\n    </tbody>\n  </table>\n</div>\n<h2 id=\"gotovye-starter-kity-i-skripty-avtomatizatsii\">Готовые стартер-киты и скрипты автоматизации</h2>\n\n<p>Вот рабочий <code>docker-compose.yml</code>, который я разворачиваю на сервере в первые 15 минут любого хакатона:</p>\n\n<p><div class=\"rs-code\">\n  <div class=\"rs-code-bar\">\n    <span class=\"resource-badge badge-prompts\">docker-compose.production.yml</span>\n    <button type=\"button\" class=\"rs-btn rs-btn-secondary rs-btn-sm\" data-rs-copy>\n      <svg viewBox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"9\" y=\"9\" width=\"11\" height=\"11\" rx=\"2\"></rect><path d=\"M5 15V6a2 2 0 0 1 2-2h9\"></path></svg>\n      <span>Copy</span>\n    </button>\n  </div>\n  <pre><code>version: '3.8'</p>\n\n<p>services:\n  web:\n    build: ./frontend\n    restart: always\n    ports:\n      - \"80:80\"\n      - \"443:443\"\n    volumes:\n      - ./certbot/conf:/etc/letsencrypt\n      - ./certbot/www:/var/www/certbot\n    depends_on:\n      - api</p>\n\n<p>api:\n    build: ./backend\n    restart: always\n    environment:\n      - DATABASE_URL=sqlite:///./prod.db\n      - ENVIRONMENT=production\n    volumes:\n      - ./data:/app/data</code></pre>\n</div></p>\n\n<h2 id=\"podgotovka-k-pitchu-i-strahovka-ot-sboev\">Подготовка к питчу и страховка от сбоев</h2>\n\n<p>На финальной защите хакатона решают не строчки кода, а то, как продукт воспринимает жюри за отведенные 3 минуты. Правила идеального демо:</p>\n\n<ol class=\"rv-steps\">\n<li><strong>Никаких слайдов с кодом.</strong> Экспертам не интересен ваш Redux store. Покажите боль пользователя и решение в 2 клика.</li>\n<li><strong>Локальная демо-запись (Бэкап-видео).</strong> На хакатонах интернет всегда ложится в момент финальных защит из-за сотен ноутбуков. Всегда держите видеозапись рабочего экрана в 60 FPS на флешке.</li>\n<li><strong>Дайте кликнуть жюри.</strong> QR-код со ссылкой на живой рабочий веб-сервис на последнем слайде презентации производит в 10 раз большее впечатление, чем любой скриншот.</li>\n</ol>\n\n<p>С этой тактикой наша команда выиграла и заняла призовые места более чем в 7 крупнейших хакатонах. Главное — дисциплина процессов и готовность выбрасывать лишнее.</p>",
    "toc": [
      {
        "id": "pravilo-pervyh-dvuh-chasov-kill-your-darlings",
        "title": "Правило первых двух часов: Kill Your Darlings"
      },
      {
        "id": "boevoy-tehnologicheskiy-stek-bez-overheda",
        "title": "Боевой технологический стек без оверхеда"
      },
      {
        "id": "tayming-hakatona-raspisanie-po-chasam",
        "title": "Тайминг хакатона: расписание по часам"
      },
      {
        "id": "gotovye-starter-kity-i-skripty-avtomatizatsii",
        "title": "Готовые стартер-киты и скрипты автоматизации"
      },
      {
        "id": "podgotovka-k-pitchu-i-strahovka-ot-sboev",
        "title": "Подготовка к питчу и страховка от сбоев"
      }
    ]
  },
  {
    "slug": "lightweight-calc-pure-js-telegram",
    "title": "Калькулятор кубатуры без фреймворков: чистый JS и заказы в Telegram",
    "subtitle": "Как коммерческий проект «Лес Куб» конвертирует строителей в покупателей со скоростью 100 баллов PageSpeed.",
    "tag": "Product Web",
    "badge": "badge-skills",
    "category": "Разбор",
    "format": "Кейс",
    "date": "2026-10-05",
    "readTime": "4 мин",
    "version": "v1.0",
    "author": "Гор Оганнисян",
    "authorRole": "Web Engineering",
    "authorHandle": "@gorogannisan",
    "authorUrl": "https://gorogannisan.site",
    "authorAvatar": "assets/gor-avatar.png",
    "apps": [
      "Vanilla JavaScript",
      "Modular CSS",
      "Telegram Bot API",
      "LocalStorage",
      "Web Vitals 100/100"
    ],
    "content_html": "<p>Зачем тащить 500 Кб бандла React на сайт оптовой базы пиломатериалов? История о том, как отказ от тяжелых фреймворков в пользу чистого JS, мгновенный пересчет кубов в штуки и прямой экспорт корзины в Telegram утроили конверсию в реальные оптовые заказы.</p>\n\n<ol class=\"rv rv-flow\">\n<li class=\"rv-step\">\n  <span class=\"rv-step-k\"><span class=\"rv-step-n\">01</span></span>\n  <b class=\"rv-step-t\">Ввод параметров</b>\n  <span class=\"rv-step-p\">Выбор породы, сечения доски (50х150х6000) и объема</span>\n</li>\n<li class=\"rv-step\">\n  <span class=\"rv-step-k\"><span class=\"rv-step-n\">02</span></span>\n  <b class=\"rv-step-t\">Мгновенный расчет</b>\n  <span class=\"rv-step-p\">Пересчет кубов в штуки, расчет веса и скидки без задержек</span>\n</li>\n<li class=\"rv-step\">\n  <span class=\"rv-step-k\"><span class=\"rv-step-n\">03</span></span>\n  <b class=\"rv-step-t\">Спецификация</b>\n  <span class=\"rv-step-p\">Формирование точного листа заказа в памяти браузера</span>\n</li>\n<li class=\"rv-step\">\n  <span class=\"rv-step-k\"><span class=\"rv-step-n\">04</span></span>\n  <b class=\"rv-step-t\">Telegram Handoff</b>\n  <span class=\"rv-step-p\">Отправка заявки напрямую боту менеджеров в 1 клик</span>\n</li>\n</ol>\n\n<h2 id=\"kontekst-pochemu-stroyka-ne-proschaet-tyazhelye-spa\">Контекст: почему стройка не прощает тяжелые SPA</h2>\n\n<p>Покупатели пиломатериалов — это прорабы, бригадиры и снабженцы, которые чаще всего оформляют заказ прямо на объекте или в дороге: слабый 3G интернет, бюджетный Android-смартфон с забитой памятью, яркое солнце на экране. Если страница открывается дольше 3 секунд, прораб нажимает «Назад» и звонит следующему номеру из поиска.</p>\n\n<p>Вторая проблема — математика отрасли: дерево продается и отгружается в кубических метрах, но строителям для каркаса или кровли нужны конкретные штуки досок определенного сечения и длины. На большинстве сайтов клиенту предлагали самостоятельно высчитывать формулы на калькуляторе или оставлять «заявку на обратный звонок».</p>\n\n<h2 id=\"zero-framework-arhitektura-24-kb-protiv-600-kb-react\">Zero-framework архитектура: 24 Кб против 600 Кб React</h2>\n\n<p>Я сознательно отказался от React, Next.js, Vue и тяжелых библиотек UI-компонентов. Вся кодовая база проекта «Лес Куб» уместилась в:\n- Семантический HTML5 с серверным рендером;\n- Легковесный модульный CSS на системных переменных;\n- Чистый JavaScript без единого стороннего npm-пакета (общий вес скрипта — 24 Кб в gzip).</p>\n\n<div class=\"rs-table\">\n  <table>\n    <thead><tr><th>Показатель</th><th>Типичный React SPA</th><th>Лес Куб (Vanilla JS)</th></tr></thead>\n    <tbody>\n      <tr><td><strong>Объем JS-бандла</strong></td><td>480–820 Кб</td><td><strong>24 Кб (gzip)</strong></td></tr>\n<tr><td><strong>First Contentful Paint (3G)</strong></td><td>2.8–4.2 сек</td><td><strong>0.4 сек</strong></td></tr>\n<tr><td><strong>Time to Interactive</strong></td><td>3.5–5.1 сек</td><td><strong>0.5 сек</strong></td></tr>\n<tr><td><strong>Google PageSpeed Score</strong></td><td>64–78 / 100</td><td><strong>100 / 100</strong></td></tr>\n    </tbody>\n  </table>\n</div>\n<h2 id=\"matematika-pilomaterialov-raschet-kubov-na-letu\">Математика пиломатериалов: расчет кубов на лету</h2>\n\n<p>Калькулятор мгновенно связывает кубы, штуки, вес и ступенчатую скидку (от 10 м³ и от 30 м³). При изменении любого инпута все связанные величины пересчитываются синхронно без лагов.</p>\n\n<div class=\"rs-code\">\n  <div class=\"rs-code-bar\">\n    <span class=\"resource-badge badge-prompts\">Vanilla JS Engine</span>\n    <button type=\"button\" class=\"rs-btn rs-btn-secondary rs-btn-sm\" data-rs-copy>\n      <svg viewBox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"9\" y=\"9\" width=\"11\" height=\"11\" rx=\"2\"></rect><path d=\"M5 15V6a2 2 0 0 1 2-2h9\"></path></svg>\n      <span>Copy</span>\n    </button>\n  </div>\n  <pre><code>// Реактивное ядро калькулятора без сторонних библиотек\nfunction calculateLumber(thickness, width, length, count) {\n  const pieceVolume = (thickness * width * length) / 1e9; // объем одной штуки в м³\n  const totalVolume = pieceVolume * count;\n  const piecesInCube = pieceVolume &gt; 0 ? (1 / pieceVolume).toFixed(1) : 0;\n  \n  // Расчет веса (сосна естественной влажности ~ 750 кг/м³)\n  const weightKg = Math.round(totalVolume * 750);\n  \n  return {\n    pieceVolume: pieceVolume.toFixed(4),\n    totalVolume: totalVolume.toFixed(3),\n    piecesInCube: piecesInCube,\n    weightKg: weightKg\n  };\n}</code></pre>\n</div>\n\n<h2 id=\"telegram-handoff-zakaz-v-odin-klik-bez-kapchi\">Telegram Handoff: заказ в один клик без капчи</h2>\n\n<p>Традиционные интернет-магазины заставляют пользователя регистрироваться, подтверждать email и вводить длинные адреса. В B2B-строительстве это убивает сделку.</p>\n\n<div class=\"rv rv-hub\" role=\"img\" aria-label=\"Лес Куб Web architecture\">\n  <div class=\"rv-hub-center\">\n    <span class=\"rv-hub-name\">Лес Куб Web</span>\n    <span class=\"rv-hub-note\">Client Engine</span>\n  </div>\n  <svg class=\"rv-hub-wires\" viewBox=\"0 0 100 100\" preserveAspectRatio=\"none\" aria-hidden=\"true\">\n    <path d=\"M0,50 C55,50 45,12.50 100,12.50\"/><path d=\"M0,50 C55,50 45,37.50 100,37.50\"/><path d=\"M0,50 C55,50 45,62.50 100,62.50\"/><path d=\"M0,50 C55,50 45,87.50 100,87.50\"/>\n  </svg>\n  <ol class=\"rv-hub-spokes\">\n    <li class=\"rv-spoke\">\n  <span class=\"rv-spoke-t\">\n    <b>Мгновенный выбор позиций</b>\n    <span>Калькулятор сохраняет набранную корзину в LocalStorage</span>\n  </span>\n</li>\n<li class=\"rv-spoke\">\n  <span class=\"rv-spoke-t\">\n    <b>Генерация спецификации</b>\n    <span>Скрипт формирует красивый Markdown-текст с артикулами и ценами</span>\n  </span>\n</li>\n<li class=\"rv-spoke\">\n  <span class=\"rv-spoke-t\">\n    <b>Webhook в Telegram-бот</b>\n    <span>Менеджеры оптового отдела получают пуш с номером телефона покупателя</span>\n  </span>\n</li>\n<li class=\"rv-spoke\">\n  <span class=\"rv-spoke-t\">\n    <b>Ответ за 2 минуты</b>\n    <span>Менеджер звонит клиенту, когда расчет уже перед глазами</span>\n  </span>\n</li>\n  </ol>\n</div>\n\n<p><div class=\"rs-code\">\n  <div class=\"rs-code-bar\">\n    <span class=\"resource-badge badge-prompts\">Telegram Webhook Sender</span>\n    <button type=\"button\" class=\"rs-btn rs-btn-secondary rs-btn-sm\" data-rs-copy>\n      <svg viewBox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"9\" y=\"9\" width=\"11\" height=\"11\" rx=\"2\"></rect><path d=\"M5 15V6a2 2 0 0 1 2-2h9\"></path></svg>\n      <span>Copy</span>\n    </button>\n  </div>\n  <pre><code>async function sendOrderToTelegram(cartItems, clientPhone) {\n  const text = [\n    <code>🌲 <em>Новый заказ из калькулятора Лес Куб</em></code>,\n    <code>📞 Телефон: \\</code>${clientPhone}\\<code></code>,\n    <code>--------------------------------</code>,\n    ...cartItems.map((item, idx) =&gt; \n      <code>${idx + 1}. <em>${item.name}</em> (${item.dimensions}) — ${item.count} шт (${item.volume} м³)</code>\n    ),\n    <code>--------------------------------</code>,\n    <code>💰 Итого: <em>${cartItems.reduce((acc, i) =&gt; acc + i.price, 0)} ₽</em></code>\n  ].join('\\n');</p>\n\n<p>return fetch('/api/telegram-order', {\n    method: 'POST',\n    headers: { 'Content-Type': 'application/json' },\n    body: JSON.stringify({ message: text })\n  });\n}</code></pre>\n</div></p>\n\n<h2 id=\"itogi-i-konversiya\">Итоги и конверсия</h2>\n\n<p>Внедрение легковесного стека и бесшовного Telegram-хэндоффа дало измеримый результат в цифрах:\n- <strong>Конверсия в оформленную заявку выросла в 2.8 раза</strong> по сравнению со старой версией сайта на конструкторе;\n- <strong>Среднее время от первого захода до отправки заказа сократилось до 38 секунд</strong>;\n- Менеджеры получают стандартизированные списки номенклатуры без разночтений в размерах доски.</p>",
    "toc": [
      {
        "id": "kontekst-pochemu-stroyka-ne-proschaet-tyazhelye-spa",
        "title": "Контекст: почему стройка не прощает тяжелые SPA"
      },
      {
        "id": "zero-framework-arhitektura-24-kb-protiv-600-kb-react",
        "title": "Zero-framework архитектура: 24 Кб против 600 Кб React"
      },
      {
        "id": "matematika-pilomaterialov-raschet-kubov-na-letu",
        "title": "Математика пиломатериалов: расчет кубов на лету"
      },
      {
        "id": "telegram-handoff-zakaz-v-odin-klik-bez-kapchi",
        "title": "Telegram Handoff: заказ в один клик без капчи"
      },
      {
        "id": "itogi-i-konversiya",
        "title": "Итоги и конверсия"
      }
    ]
  },
  {
    "slug": "linux-infra-and-ai-automation",
    "title": "Linux-автоматизация и локальные AI-агенты: как я автоматизирую разработку",
    "subtitle": "Настройка CI/CD, контейнеризация и подключение Claude/Gemini CLI к внутренним процессам разработки.",
    "tag": "Infra & AI",
    "badge": "badge-infra",
    "category": "Гайд",
    "format": "Инфраструктура",
    "date": "2026-09-10",
    "readTime": "5 мин",
    "version": "v1.0",
    "author": "Гор Оганнисян",
    "authorRole": "Linux & AI Engineer",
    "authorHandle": "@gorogannisan",
    "authorUrl": "https://gorogannisan.site",
    "authorAvatar": "assets/gor-avatar.png",
    "apps": [
      "Linux (Debian/Ubuntu)",
      "Docker & Compose",
      "Claude & Gemini CLI",
      "Bash Automation",
      "SSH Hardening",
      "Caddy / Nginx"
    ],
    "content_html": "<p>Как выпускать цифровые продукты со скоростью целой команды разработчиков? Мой практический опыт развертывания легковесной Linux-инфраструктуры, настройки воспроизводимых CI/CD пайплайнов и бесшовной интеграции терминальных AI-ассистентов в повседневный рабочий процесс.</p>\n\n<ol class=\"rv rv-flow\">\n<li class=\"rv-step\">\n  <span class=\"rv-step-k\"><span class=\"rv-step-n\">01</span></span>\n  <b class=\"rv-step-t\">Git Push</b>\n  <span class=\"rv-step-p\">Отправка изменений ветки в локальный Git-репозиторий</span>\n</li>\n<li class=\"rv-step\">\n  <span class=\"rv-step-k\"><span class=\"rv-step-n\">02</span></span>\n  <b class=\"rv-step-t\">Self-hosted Runner</b>\n  <span class=\"rv-step-p\">Мгновенный запуск линтеров и тестов в локальном Docker</span>\n</li>\n<li class=\"rv-step\">\n  <span class=\"rv-step-k\"><span class=\"rv-step-n\">03</span></span>\n  <b class=\"rv-step-t\">AI Diff Review</b>\n  <span class=\"rv-step-p\">Проверка изменений и генерация release notes через CLI-модель</span>\n</li>\n<li class=\"rv-step\">\n  <span class=\"rv-step-k\"><span class=\"rv-step-n\">04</span></span>\n  <b class=\"rv-step-t\">Zero-Downtime Deploy</b>\n  <span class=\"rv-step-p\">Бесшовная ротация контейнеров с автоматическим SSL</span>\n</li>\n</ol>\n\n<h2 id=\"zachem-nezavisimoy-razrabotke-svoy-devops\">Зачем независимой разработке свой DevOps</h2>\n\n<p>В сольной разработке или небольшой команде любая ручная рутина — сборка APK, ручной перенос файлов по FTP, генерация сертификатов LetsEncrypt или ручное редактирование конфигов Nginx — напрямую убивает время, которое должно идти на разработку продуктовых фич.</p>\n\n<blockquote><p>Мой фундаментальный принцип: <strong>если действие повторяется больше двух раз, оно обязано быть автоматизировано скриптом</strong>. Никаких ручных кликов по серверам в терминале.</p></blockquote>\n\n<h2 id=\"arhitektura-self-hosted-git-vorkery-i-izolyatsiya\">Архитектура: Self-hosted Git, воркеры и изоляция</h2>\n\n<p>Вместо перегруженных облачных решений с высокими тарифами я использую легковесный стек на базе выделенного Linux-сервера:</p>\n\n<div class=\"rv rv-hub\" role=\"img\" aria-label=\"Linux Host architecture\">\n  <div class=\"rv-hub-center\">\n    <span class=\"rv-hub-name\">Linux Host</span>\n    <span class=\"rv-hub-note\">Ubuntu LTS Server</span>\n  </div>\n  <svg class=\"rv-hub-wires\" viewBox=\"0 0 100 100\" preserveAspectRatio=\"none\" aria-hidden=\"true\">\n    <path d=\"M0,50 C55,50 45,12.50 100,12.50\"/><path d=\"M0,50 C55,50 45,37.50 100,37.50\"/><path d=\"M0,50 C55,50 45,62.50 100,62.50\"/><path d=\"M0,50 C55,50 45,87.50 100,87.50\"/>\n  </svg>\n  <ol class=\"rv-hub-spokes\">\n    <li class=\"rv-spoke\">\n  <span class=\"rv-spoke-t\">\n    <b>Gitea & Local Runners</b>\n    <span>Собственный Git-сервер и воркеры с нулевой сетевой задержкой</span>\n  </span>\n</li>\n<li class=\"rv-spoke\">\n  <span class=\"rv-spoke-t\">\n    <b>Claude & Gemini CLI Integration</b>\n    <span>Терминальные агенты для ревью коммитов, тестов и документации</span>\n  </span>\n</li>\n<li class=\"rv-spoke\">\n  <span class=\"rv-spoke-t\">\n    <b>Caddy Reverse Proxy</b>\n    <span>Автоматический выпуск и продление SSL-сертификатов без cron</span>\n  </span>\n</li>\n<li class=\"rv-spoke\">\n  <span class=\"rv-spoke-t\">\n    <b>Docker Network Isolation</b>\n    <span>Изолированные сети контейнеров без доступа наружу</span>\n  </span>\n</li>\n  </ol>\n</div>\n\n<h2 id=\"integratsiya-terminalnyh-ai-agentov-v-vorkflou\">Интеграция терминальных AI-агентов в воркфлоу</h2>\n\n<p>Я использую официальные CLI-инструменты моделей (Claude Code и Gemini CLI) прямо из терминала Bash, встраивая их в pre-commit хуки и CI-пайплайны.</p>\n\n<h3>Автоматический ревью diff перед коммитом</h3>\n\n<p>Скрипт читает несинхронизированные изменения в рабочей ветке, формирует краткое резюме и проверяет соблюдение архитектурных соглашений:</p>\n\n<p><div class=\"rs-code\">\n  <div class=\"rs-code-bar\">\n    <span class=\"resource-badge badge-prompts\">ai-review.sh</span>\n    <button type=\"button\" class=\"rs-btn rs-btn-secondary rs-btn-sm\" data-rs-copy>\n      <svg viewBox=\"0 0 24 24\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"9\" y=\"9\" width=\"11\" height=\"11\" rx=\"2\"></rect><path d=\"M5 15V6a2 2 0 0 1 2-2h9\"></path></svg>\n      <span>Copy</span>\n    </button>\n  </div>\n  <pre><code>#!/usr/bin/env bash\nset -euo pipefail</p>\n\n<p># Извлекаем diff текущего стейджинга\nDIFF=$(git diff --cached)</p>\n\n<p>if [ -z \"$DIFF\" ]; then\n    echo \"Нет изменений для анализа.\"\n    exit 0\nfi</p>\n\n<p># Отправляем diff в CLI модель для проверки безопасности и конвенций\necho \"$DIFF\" | gemini -p \"\nТы старший системный архитектор. Проанализируй этот Git diff.\n1. Найди утечки API ключей или паролей.\n2. Проверь обработку исключений и утечки ресурсов.\n3. Предложи лаконичный conventional commit message.\n\"</code></pre>\n</div></p>\n\n<h2 id=\"bezopasnost-ssh-klyuchi-s-apparatnymi-tokenami\">Безопасность: SSH-ключи с аппаратными токенами</h2>\n\n<p>Все боевые серверы защищены по строгим стандартам промышленной безопасности:</p>\n\n<ol class=\"rv-steps\">\n<li><strong>Отключение парольного доступа.</strong> В <code>/etc/ssh/sshd_config</code> отключен вход по паролю (<code>PasswordAuthentication no</code>) и запрещен прямой вход от root.</li>\n<li><strong>Ключи FIDO2 / ed25519-sk.</strong> Доступ к боевым серверам разрешен исключительно по криптографическим ключам с физическим подтверждением нажатием на токен. Украсть такой ключ из файловой системы невозможно.</li>\n<li><strong>Fail2ban и UFW.</strong> Фаервол держит открытыми только 80, 443 и нестандартный SSH-порт. Любые попытки перебора блокируются на уровне ядра Linux.</li>\n</ol>\n\n<h2 id=\"rezultaty-15-sekonomlennyh-chasov-v-nedelyu\">Результаты: 15 сэкономленных часов в неделю</h2>\n\n<p>Внедрение собственной инфраструктуры и терминальных ассистентов дало измеримые выгоды:</p>\n\n<p><div class=\"rs-table\">\n  <table>\n    <thead><tr><th>Параметр</th><th>Ручной процесс</th><th>Автоматизированный стек</th></tr></thead>\n    <tbody>\n      <tr><td><strong>Деплой новой версии</strong></td><td>15–30 минут (руками)</td><td><strong>45 секунд (git push)</strong></td></tr>\n<tr><td><strong>Ревью коммитов и опечаток</strong></td><td>Ручной просмотр diff</td><td><strong>Авто-анализ за 5 секунд</strong></td></tr>\n<tr><td><strong>Затраты на облака в месяц</strong></td><td>$120+ (облачные сервисы)</td><td><strong>$12 (один VDS)</strong></td></tr>\n<tr><td><strong>Время на инфраструктуру</strong></td><td>~ 3 часа в день</td><td><strong>0 часов (работает само)</strong></td></tr>\n    </tbody>\n  </table>\n</div>\nОсвободившиеся 15 рабочих часов в неделю я направляю на то, что действительно создает ценность: проектирование продуктовой логики, оптимизацию мобильного UI и запуск новых проектов.</p>",
    "toc": [
      {
        "id": "zachem-nezavisimoy-razrabotke-svoy-devops",
        "title": "Зачем независимой разработке свой DevOps"
      },
      {
        "id": "arhitektura-self-hosted-git-vorkery-i-izolyatsiya",
        "title": "Архитектура: Self-hosted Git, воркеры и изоляция"
      },
      {
        "id": "integratsiya-terminalnyh-ai-agentov-v-vorkflou",
        "title": "Интеграция терминальных AI-агентов в воркфлоу"
      },
      {
        "id": "bezopasnost-ssh-klyuchi-s-apparatnymi-tokenami",
        "title": "Безопасность: SSH-ключи с аппаратными токенами"
      },
      {
        "id": "rezultaty-15-sekonomlennyh-chasov-v-nedelyu",
        "title": "Результаты: 15 сэкономленных часов в неделю"
      }
    ]
  }
];
