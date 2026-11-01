---
slug: compose-multiplatform-offline-schedule
title: Как я перевел расписание университета на Compose Multiplatform
subtitle: Оффлайн-кэш, виджеты Glance на рабочем столе и архитектура, которая не подводит в подвальных аудиториях.
tag: KMP & Android
badge: badge-guides
category: Разбор
format: Кейс
date: 2026-10-18
readTime: 6 мин
version: v1.0
author: Гор Оганнисян
authorRole: Lead Developer
authorHandle: "@gorogannisan"
authorUrl: https://gorogannisan.site
authorAvatar: assets/gor-avatar.png
apps:
  - Kotlin Multiplatform
  - Jetpack Compose
  - Jetpack Glance
  - SQLDelight / Room
  - Ktor Client
  - AlarmManager
---

Официальные порталы учебных заведений часто падают в самый ответственный момент. В этой статье я детально разбираю, как спроектировал и реализовал мобильное приложение Schedule на Kotlin Multiplatform и Jetpack Compose так, чтобы студенты получали номер аудитории за 12 миллисекунд даже без подключения к интернету.

:::flow
- 01 | Кэш-ориентированный запрос | Чтение расписания исключительно из локальной SQLite базы
- 02 | Рендеринг за 12 мс | Мгновенная отрисовка Compose UI без спиннеров
- 03 | Фоновая синхронизация | Тихий опрос API по AlarmManager при наличии сети
- 04 | Нативный виджет Glance | Текущая пара на экране блокировки без запуска приложения
:::

## Проблема: серверы вуза падают в 8:50 утра

Каждый семестр тысячи студентов сталкиваются с одной и той же ситуацией: 8:50 утра, первый этаж университета или цокольная аудитория, мобильная связь ловит одну «палочку» EDGE, а университетский сервер не справляется с одновременным наплывом запросов и отдает `504 Gateway Timeout`. Студенты вынуждены открывать размытые скриншоты или судорожно листать многостраничные Excel-таблицы с телефона.

> Главная цель разработки: сделать инструмент, который **принципиально не может зависнуть перед парой**. Пользователь должен открывать экран и мгновенно видеть номер кабинета.

## Архитектура: Offline-First и MVI

В основу системы легла концепция Offline-First. Приложение никогда не ждет ответ от сети для отображения контента. Все данные всегда читаются из локального хранилища, а сеть рассматривается лишь как вспомогательный канал актуализации.

:::hub [Schedule Core] [KMP Common Code]
- SQLDelight / Room Cache | Локальная SQLite база данных с мгновенным временем выборки
- Jetpack Glance Widget | Нативный виджет домашнего экрана, обновляемый по таймеру
- AlarmManager Worker | Пробуждение процессов строго в моменты звонков на пары
- Ktor Background Client | Асинхронная выкачка диффов расписания при наличии Wi-Fi
:::

Вот как выглядит шаблон репозитория с гарантированным кэшированием в общем KMP модуле:

```code [Kotlin Multiplatform Repository]
class ScheduleRepository(
    private val localDb: ScheduleQueries,
    private val apiClient: KtorScheduleApi
) {
    // UI подписывается на Flow из локальной базы данных
    fun observeDaySchedule(groupId: String, date: LocalDate): Flow<List<Lesson>> {
        return localDb.getLessonsByDate(groupId, date.toEpochDay())
            .asFlow()
            .mapToList(Dispatchers.Default)
    }

    // Фоновая синхронизация: не блокирует UI и сохраняет диффы
    suspend fun syncInBackground(groupId: String) = withContext(Dispatchers.IO) {
        runCatching {
            val freshSchedule = apiClient.fetchSchedule(groupId)
            localDb.transaction {
                freshSchedule.forEach { localDb.insertOrReplace(it.toEntity()) }
            }
        }
    }
}
```

## Виджеты рабочего стола на Jetpack Glance

Студенту неудобно разблокировать телефон, находить иконку приложения и ждать загрузки, когда он на бегу поднимается по лестнице к аудитории. Я вынес ключевую информацию на рабочий стол с помощью Jetpack Glance.

### Как устроен процесс обновления виджета

:::steps
1. **Определение временного окна.** Алгоритм рассчитывает текущий интервал звонков и определяет статус: «Идет пара», «Перемена (15 минут)» или «Учебный день завершен».
2. **Прямая выборка из БД.** Glance-виджет выполняет прямой синхронный запрос в локальную SQLite базу без инициализации тяжелых компонентов UI-приложения.
3. **Установка AlarmManager.** Виджет не крутит фоновый опрос в цикле. Вместо этого регистрируется точный аларм на следующую временную отсечку звонка (например, 10:20, 12:10). Это обеспечивает 0% расхода аккумулятора в фоне.
:::

```code [Jetpack Glance Composable]
class ScheduleWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val currentLesson = LocalScheduleManager.getCurrentOrNextLesson(context)

        provideContent {
            GlanceTheme {
                Column(
                    modifier = GlanceModifier
                        .fillMaxSize()
                        .background(GlanceTheme.colors.surface)
                        .padding(14.dp)
                ) {
                    Text(
                        text = currentLesson?.subject ?: "Пар больше нет 🎉",
                        style = TextStyle(fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    )
                    Text(
                        text = currentLesson?.classroom?.let { "Аудитория $it" } ?: "Свободное время",
                        style = TextStyle(color = GlanceTheme.colors.primary, fontSize = 14.sp)
                    )
                }
            }
        }
    }
}
```

## Мгновенный поиск по 400+ группам

В вузе обучаются десятки факультетов и сотни групп. Чтобы найти чужое расписание (например, узнать, где пара у друзей или где принимает зачет преподаватель), стандартный сайт требовал пройти 4 вложенных выпадающих списка.

В Schedule я реализовал клиентский полнотекстовый индекс в памяти:
- Все 400+ групп и 200+ фамилий преподавателей загружаются в легковесную префиксную структуру (Trie) весом менее 180 Кб.
- Ввод символов фильтруется через дебаунс 150 мс: UI откликается на каждый символ без малейших фризов фреймрейта.
- Поддерживается нечеткий поиск (Fuzzy match) при опечатках в фамилиях преподавателей.

## Результаты и метрики в боевых условиях

Сравнение ключевых показателей между старым порталом вуза и моим решением на Compose Multiplatform:

| Метрика | Официальный сайт | KMP Schedule |
| :--- | :--- | :--- |
| **Время первого рендера** | 3200–8500 мс | **12 мс (из кэша)** |
| **Работа без интернета** | Недоступен (ERR_TIMEOUT) | **100% функционала доступно** |
| **Размер данных за сессию** | ~ 4.2 Мб (скрипты, стили) | **< 14 Кб (только дифф)** |
| **Доступ к аудитории** | 5 кликов, 4 селекта | **1 взгляд на виджет экрана** |

Сотни активных ежедневных пользователей среди студентов, нулевая зависимость от серверов вуза в момент звонка на пару и оценка 4.9 в сообществе доказали: правильный выбор нативного стека и offline-first архитектуры решает реальные проблемы пользователей.
