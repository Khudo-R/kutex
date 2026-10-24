# Полное руководство по архитектуре и коду проекта Kutex

**Kutex** — это десктопный эмулятор терминала, построенный на фреймворке [Wails v2](https://wails.io).
Бэкенд приложения написан на **Go (Golang 1.25)**, а пользовательский интерфейс — на **Vue 3 + TypeScript + UnoCSS** с использованием движка терминала **xterm.js** (включая аппаратное ускорение через WebGL).

Внутри приложения настоящая системная оболочка пользователя (`$SHELL` — например, `zsh` или `bash`) запускается внутри псевдотерминала (**PTY**). Благодаря этому полноценно работают интерактивные консольные программы (`vim`, `nvim`, `htop`, `less`, `tmux`), управляющие последовательности ANSI и 24-битный цвет (`truecolor`), сигналы прерывания (`Ctrl+C`), автодополнение по `Tab`, а также родная история команд оболочки. Поверх этого Kutex реализует собственный программный API для фонового выполнения команд и независимую от шелла встроенную систему истории команд с быстрым поиском по `Ctrl+Shift+H`.

---

## Содержание

1. [Высокоуровневая архитектура и структура проекта](#1-высокоуровневая-архитектура-и-структура-проекта)
2. [Подробный разбор Go-кода (Backend на Golang)](#2-подробный-разбор-go-кода-backend-на-golang)
   - [2.1. Конфигурация модуля (`go.mod`, `wails.json`)](#21-конфигурация-модуля-gomod-wailsjson)
   - [2.2. Точка входа приложения (`main.go`)](#22-точка-входа-приложения-maingo)
   - [2.3. Пакет `internal/terminal` — Ядро терминала](#23-пакет-internalterminal--ядро-терминала)
     - [`events.go` — Константы событий Wails](#eventsgo--константы-событий-wails)
     - [`terminal.go` — Главный фасад сервиса `Terminal`](#terminalgo--главный-фасад-сервиса-terminal)
     - [`session.go` — Интерактивная PTY-сессия (`Session`)](#sessiongo--интерактивная-pty-сессия-session)
     - [`executor.go` — Фоновое выполнение команд и отслеживание директории (`Executor`)](#executorgo--фоновое-выполнение-команд-и-отслеживание-директории-executor)
     - [`history.go` — Потокобезопасная MRU-история команд (`History`)](#historygo--потокобезопасная-mru-история-команд-history)
     - [Тесты пакета `internal/terminal` (`*_test.go`)](#тесты-пакета-internalterminal-_testgo)
   - [2.4. Пакет `internal/system` — Работа с файловой системой](#24-пакет-internalsystem--работа-с-файловой-системой)
     - [`system.go` — Сканирование директорий и симлинков](#systemgo--сканирование-директорий-и-симлинков)
     - [`system_test.go` — Модульные тесты `system`](#system_testgo--модульные-тесты-system)
   - [2.5. Пакет `internal/logger` — Структурированное логирование (`log/slog`)](#25-пакет-internallogger--структурированное-логирование-logslog)
     - [`logger.go` — Фасад логгера и управление конфигурацией](#loggergo--фасад-логгера-и-управление-конфигурацией)
     - [`handler.go` — Кастомный `slog.Handler` для консоли и файла](#handlergo--кастомный-sloghandler-для-консоли-и-файла)
     - [`wails.go` — Адаптер логгера для Wails (`WailsAdapter`)](#wailsgo--адаптер-логгера-для-wails-wailsadapter)
     - [`logger_test.go` — Модульные тесты `logger`](#logger_testgo--модульные-тесты-logger)
3. [Подробный разбор Frontend-скриптов (Vue 3 + TypeScript)](#3-подробный-разбор-frontend-скриптов-vue-3--typescript)
   - [3.1. Конфигурация и точка входа фронтенда (`index.html`, `main.ts`, `style.css`, `uno.config.ts`, `vite.config.ts`)](#31-конфигурация-и-точка-входа-фронтенда)
   - [3.2. Автосгенерированные привязки Wails (`frontend/wailsjs/`)](#32-автосгенерированные-привязки-wails-frontendwailsjs)
   - [3.3. Утилита безопасных промисов (`frontend/src/shared/utils/index.ts`)](#33-утилита-безопасных-промисов-frontendsrcsharedutilsindexts)
   - [3.4. Поддержка иконок Nerd Font (`nerd-font.ts` и `nerd-font.css`)](#34-поддержка-иконок-nerd-font-nerd-fontts-и-nerd-fontcss)
   - [3.5. Захват введённых команд из экранного буфера (`command-capture.ts`)](#35-захват-введённых-команд-из-экранного-буфера-command-capturets)
   - [3.6. Компонент терминала (`XTerminal.vue`)](#36-компонент-терминала-xterminalvue)
   - [3.7. Модальная панель истории команд (`HistoryPanel.vue`)](#37-модальная-панель-истории-команд-historypanelvue)
   - [3.8. Корневой компонент-оркестратор (`App.vue`)](#38-корневой-компонент-оркестратор-appvue)
4. [Полный цикл взаимодействия: от нажатия клавиши до экрана](#4-полный-цикл-взаимодействия-от-нажатия-клавиши-до-экрана)
5. [Команды сборки, разработки и тестирования](#5-команды-сборки-разработки-и-тестирования)

---

## 1. Высокоуровневая архитектура и структура проекта

```mermaid
flowchart LR
    subgraph Window["Окно Wails (Системный WebView)"]
        XT["XTerminal.vue (xterm.js + аддоны)"]
        CC["CommandCapture (command-capture.ts)"]
        HP["HistoryPanel.vue (модальное окно Ctrl+Shift+H)"]
        APP["App.vue (мост к Go и состояние)"]

        XT -- "data / resize / ready" --> APP
        APP -- "input(data) → command" --> CC
        CC -. "чтение строки из буфера" .-> XT
        APP -- "write(bytes)" --> XT
        APP -- "open / commands" --> HP
        HP -- "run / clear / close" --> APP
    end

    subgraph Go["Процесс Go (internal/terminal)"]
        T["Terminal (terminal.go)"]
        S["Session (session.go)"]
        E["Executor (executor.go)"]
        H["History (history.go)"]
        PUMP["горутина pump()"]

        T --> S
        T --> E
        T --> H
        S --> PUMP
    end

    PTY["PTY master / slave"]
    SH["$SHELL (bash/zsh/...)"]

    APP -- "Start / Write / Resize / RunCommand / ExecuteCommand" --> T
    APP -- "AddHistory / GetHistory / ClearHistory" --> T
    S -- "write / setsize" --> PTY
    PTY <--> SH
    PTY -- "read" --> PUMP
    PUMP -- "событие terminal:output (base64)" --> APP
    PUMP -- "событие terminal:exit (code)" --> APP
```

### Карта всех файлов проекта

```text
kutex/
├── main.go                                 # Точка входа Go: встраивание статики, настройка окна Wails, привязка сервисов
├── go.mod / go.sum                         # Описание Go-модуля и дерево зависимостей (Wails v2, creack/pty)
├── wails.json                              # Конфигурация сборщика Wails (команды pnpm, тег webkit2_41)
├── internal/                               # Приватные пакеты Go-бэкенда
│   ├── terminal/                           # Пакет управления терминалом
│   │   ├── events.go                       # Константы имён событий ("terminal:output", "terminal:exit")
│   │   ├── terminal.go                     # Фасад Terminal, экспортируемый во фронтенд через Wails Bind
│   │   ├── session.go                      # Жизненный цикл интерактивного PTY и шелла (Start, Write, Resize, Stop, pump)
│   │   ├── executor.go                     # Фоновое выполнение команд ($SHELL -c), перехват cd и чтение /proc/<pid>/cwd
│   │   ├── history.go                      # Потокобезопасный MRU-буфер истории команд в памяти
│   │   ├── terminal_test.go                # Интеграционные тесты фасада Terminal
│   │   ├── session_test.go                 # Модульные тесты PTY-сессии
│   │   ├── executor_test.go                # Модульные тесты фонового исполнителя и навигации cd
│   │   └── history_test.go                 # Модульные тесты MRU-истории команд
│   ├── system/                             # Пакет работы с файловой системой ОС
│   │   ├── system.go                       # Поиск папок (включая симлинки на папки) и рекурсивный обход дерева
│   │   └── system_test.go                  # Тесты сканирования директорий и симлинков
│   └── logger/                             # Пакет структурированного логирования поверх log/slog
│       ├── logger.go                       # Фасад Logger, уровни, глобальный инстанс, тегирование компонентов
│       ├── handler.go                      # Кастомный slog.Handler: цветной ANSI-вывод в консоль и чистый текст в файл
│       ├── wails.go                        # Адаптер WailsAdapter для перенаправления внутренних логов Wails
│       └── logger_test.go                  # Тесты форматирования, фильтрации уровней, записи в файл и адаптера Wails
└── frontend/                               # Фронтенд-приложение (Vue 3 + TypeScript + Vite + UnoCSS)
    ├── index.html                          # HTML-каркас приложения
    ├── package.json                        # Зависимости и npm-скрипты фронтенда
    ├── vite.config.ts                      # Конфигурация сборщика Vite (плагины Vue и UnoCSS, алиас @)
    ├── uno.config.ts                       # Конфигурация атомарного CSS-фреймворка UnoCSS (шрифты sans и mono)
    ├── eslint.config.mjs                   # Правила линтера (@antfu/eslint-config)
    ├── wailsjs/                            # Автоматически сгенерированные Wails JS/TS-обёртки для вызова Go-методов
    └── src/                                # Исходный код фронтенда
        ├── main.ts                         # Инициализация Vue-приложения и подключение стилей
        ├── style.css                       # Подключение локального шрифта Nunito
        ├── App.vue                         # Главный компонент: связь между XTerminal, HistoryPanel, CommandCapture и Go
        ├── components/
        │   ├── XTerminal.vue               # Обёртка над xterm.js (WebGL, FitAddon, WebLinksAddon, ResizeObserver)
        │   └── HistoryPanel.vue            # Всплывающее окно поиска и запуска команд из истории (Ctrl+Shift+H)
        ├── terminal/
        │   └── command-capture.ts          # Алгоритм чтения набранной команды из экранного буфера xterm при нажатии Enter
        ├── fonts/
        │   ├── nerd-font.css               # Объявление @font-face для Symbols Nerd Font Mono
        │   └── nerd-font.ts                # Предзагрузка шрифта иконок и внедрение фолбэка в font-family
        └── shared/utils/
            └── index.ts                    # Утилита safePromiseTyped для безопасной обработки промисов без try/catch
```

---

## 2. Подробный разбор Go-кода (Backend на Golang)

Весь бэкенд следует идиоматическому стилю Go и принципу единственной ответственности (**Single Responsibility Principle**). Код разделён на точку входа [`main.go`](file:///home/vlad/projects/kutex/main.go) и три изолированных пакета внутри директории `internal/`:
- `internal/terminal` — терминальная сессия, выполнение команд и история;
- `internal/system` — операции с файловой системой;
- `internal/logger` — структурированное логирование.

Разберём каждый файл, структуру и функцию подробно.

---

### 2.1. Конфигурация модуля (`go.mod`, `wails.json`)

#### Файл [`go.mod`](file:///home/vlad/projects/kutex/go.mod)
Объявляет модуль `kutex` под версию **Go 1.25.0** и использует всего две прямые внешние зависимости:
1. **`github.com/creack/pty v1.1.24`** — стандартная де-факто библиотека в экосистеме Go для работы с псевдотерминалами (UNIX PTY). Она берёт на себя низкоуровневые системные вызовы `ioctl` для открытия пары master/slave файловых дескрипторов, создания новой сессии процесса (`setsid`), назначения управляющего терминала (`TIOCSCTTY`) и изменения размеров окна (`TIOCSWINSZ`).
2. **`github.com/wailsapp/wails/v2 v2.17.0`** — фреймворк для создания кроссплатформенных десктопных приложений на Go и веб-технологиях (использует системный WebView вместо тяжёлого Chromium из Electron и предоставляет двусторонний IPC-мост между JS и Go).

#### Файл [`wails.json`](file:///home/vlad/projects/kutex/wails.json)
Управляет процессом сборки и разработки Wails:
- `"frontend:install": "pnpm install"` — установка пакетов через `pnpm`.
- `"frontend:build": "pnpm run build"` — проверка типов `vue-tsc` и сборка бандла через `vite build`.
- `"frontend:dev:watcher": "pnpm run dev"` — запуск Vite dev-сервера при вызове `wails dev`.
- `"build:tags": "webkit2_41"` — автоматически передаёт тег компиляции Go `-tags webkit2_41`, который необходим на современных дистрибутивах Linux, использующих библиотеку `webkit2gtk-4.1` вместо устаревшей `4.0`.

---

### 2.2. Точка входа приложения ([`main.go`](file:///home/vlad/projects/kutex/main.go))

Файл [`main.go`](file:///home/vlad/projects/kutex/main.go) отвечает за инициализацию всех сервисов и запуск нативного окна операционной системы.

```go
//go:embed all:frontend/dist
var assets embed.FS
```

1. **Встраивание статики (`//go:embed all:frontend/dist`):**
   Директива компилятора `//go:embed` упаковывает все скомпилированные файлы фронтенда из папки `frontend/dist` (`index.html`, JS-бандлы, CSS, шрифты `.woff2`) прямо внутрь исполняемого бинарного файла Go в переменную `assets` типа `embed.FS`. Благодаря этому готовое приложение распространяется как **один самодостаточный бинарник** без внешних файлов.

2. **Инициализация в функции [`main()`](file:///home/vlad/projects/kutex/main.go#L18-L45):**
   - `log := logger.Component("main")` — создаёт экземпляр структурированного логгера с меткой компонента `(main)` и выводит стартовое сообщение `Starting kutex...`.
   - `term := terminal.New()` — создаёт главный сервис управления терминалом.
   - `sys := system.New()` — создаёт сервис работы с файловой системой.

3. **Конфигурация и запуск `wails.Run(&options.App{...})`:**
   - `Title: "kutex"`, `Width: 1024`, `Height: 768` — заголовок и начальные размеры окна в пикселях.
   - `AssetServer: &assetserver.Options{Assets: assets}` — указывает внутреннему виртуальному серверу Wails отдавать встроенные файлы из `embed.FS` в системный WebView.
   - `BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1}` — задаёт цвет фона нативного окна (`#1b2636`), в точности совпадающий с фоном терминала `xterm.js`. Это предотвращает белую вспышку при холодном старте окна до загрузки CSS.
   - `Logger: logger.NewWailsAdapter(nil)` — подключает наш кастомный адаптер логгера, чтобы все внутренние системные сообщения самого фреймворка Wails проходили через единый логгер приложения с тегом `(wails)`.
   - `OnStartup: term.Startup` — хук жизненного цикла. Когда окно и рантайм Wails инициализированы, Wails вызывает `term.Startup(ctx)`, передавая туда `context.Context`. Этот контекст необходим Go-коду для отправки асинхронных событий во фронтенд.
   - `OnShutdown: term.Shutdown` — хук закрытия приложения. При закрытии окна пользователем автоматически вызывается `term.Shutdown(ctx)`, который принудительно убивает дочерний процесс шелла и закрывает дескриптор PTY, чтобы в системе не оставалось «осиротевших» процессов.
   - `Bind: []interface{}{term, sys}` — **ключевой механизм Wails**. При передаче указателей `term` (`*terminal.Terminal`) и `sys` (`*system.System`) в срез `Bind`, Wails с помощью рефлексии (`reflect`) анализирует все их экспортируемые (начинающиеся с заглавной буквы) методы и:
     1. Во время сборки генерирует соответствующие TypeScript/JavaScript функции в `frontend/wailsjs/go/terminal/Terminal.js` и `frontend/wailsjs/go/system/System.js`.
     2. Во время работы приложения автоматически десериализует аргументы из JSON при вызове из JS, вызывает Go-метод и возвращает результат (или ошибку `error`) обратно в JS в виде `Promise`.

---

### 2.3. Пакет `internal/terminal` — Ядро терминала

Пакет `internal/terminal` разделён на 5 исходных файлов и 4 файла тестов. Каждый файл решает строго одну задачу.

---

#### 1. [`internal/terminal/events.go`](file:///home/vlad/projects/kutex/internal/terminal/events.go) — Константы событий Wails

В этом файле объявлены строковые константы имён событий, которые Go-бэкенд отправляет во фронтенд через шину событий Wails (`runtime.EventsEmit`):

- **`EventTerminalOutput = "terminal:output"`** — событие, несущее порцию (чанк) сырых байтов вывода из PTY, закодированную в строку **Base64**.
- **`EventTerminalExit = "terminal:exit"`** — событие, уведомляющее фронтенд о том, что процесс оболочки завершился, и передающее целочисленный код возврата (`exitCode`).

---

#### 2. [`internal/terminal/terminal.go`](file:///home/vlad/projects/kutex/internal/terminal/terminal.go) — Главный фасад сервиса `Terminal`

Структура [`Terminal`](file:///home/vlad/projects/kutex/internal/terminal/terminal.go#L14-L20) — это фасад, который связывает воедино три внутренних компонента (`Session`, `Executor`, `History`), логгер и рантайм Wails:

```go
type Terminal struct {
	ctx      context.Context // Контекст рантайма Wails (нужен для отправки событий EventsEmit)
	session  *Session        // Управляет интерактивным процессом шелла и PTY
	executor *Executor       // Выполняет одиночные фоновые команды и отслеживает текущую папку (CWD)
	history  *History        // Хранит историю выполненных команд в памяти (MRU)
	log      *logger.Logger  // Логгер с компонентным тегом (terminal)
}
```

Разберём все методы [`Terminal`](file:///home/vlad/projects/kutex/internal/terminal/terminal.go):

- **[`New() *Terminal`](file:///home/vlad/projects/kutex/internal/terminal/terminal.go#L23-L30):**
  Конструктор сервиса. Инициализирует `NewSession()`, `NewExecutor()`, `NewHistory(DefaultHistorySize)` (на 1000 команд) и логгер `logger.Component("terminal")`.

- **[`Startup(ctx context.Context)`](file:///home/vlad/projects/kutex/internal/terminal/terminal.go#L33-L36):**
  Вызывается рантаймом Wails при старте приложения. Сохраняет `ctx` в поле `t.ctx` и пишет лог `Terminal service initialized`.

- **[`Shutdown(_ context.Context)`](file:///home/vlad/projects/kutex/internal/terminal/terminal.go#L39-L42):**
  Вызывается рантаймом Wails при закрытии окна. Логирует завершение и вызывает `t.Stop()`, гарантируя чистое закрытие PTY и процесса оболочки.

- **[`Start(cols, rows int) error`](file:///home/vlad/projects/kutex/internal/terminal/terminal.go#L45-L67):**
  Запускает интерактивную оболочку пользователя с заданным числом колонок (`cols`) и строк (`rows`).
  1. Определяет стартовую рабочую директорию вызовом `cwd := t.GetCwd()`.
  2. Создаёт замыкание `onOutput := func(b64 string)`, которое при наличии `t.ctx != nil` отправляет событие `runtime.EventsEmit(t.ctx, EventTerminalOutput, b64)` во фронтенд.
  3. Создаёт замыкание `onExit := func(code int)`, которое логирует код завершения процесса и отправляет событие `runtime.EventsEmit(t.ctx, EventTerminalExit, code)`.
  4. Передаёт управление в `t.session.Start(cols, rows, cwd, onOutput, onExit)`. Благодаря такой передаче колбэков сам объект `Session` ничего не знает про Wails и легко тестируется в изоляции.

- **[`Write(data string) error`](file:///home/vlad/projects/kutex/internal/terminal/terminal.go#L70-L72):**
  Принимает строку ввода от пользователя (нажатые клавиши, управляющие коды, вставленный текст) и напрямую передаёт её в `t.session.Write(data)` для записи в master-дескриптор PTY.

- **[`Resize(cols, rows int) error`](file:///home/vlad/projects/kutex/internal/terminal/terminal.go#L75-L78):**
  Логирует новые размеры сетки терминала на уровне `DEBUG` и вызывает `t.session.Resize(cols, rows)` для уведомления ядра ОС об изменении геометрии окна.

- **[`Stop()`](file:///home/vlad/projects/kutex/internal/terminal/terminal.go#L81-L84):**
  Логирует остановку сессии и вызывает `t.session.Stop()`.

- **[`RunCommand(command string) error`](file:///home/vlad/projects/kutex/internal/terminal/terminal.go#L87-L99):**
  Программно «впечатывает» и запускает команду прямо внутри активного интерактивного терминала (используется, например, при выборе команды из окна истории `Ctrl+Shift+H` или через `window.kutex.runCommand`):
  1. Проверяет `if !t.session.IsRunning()`. Если интерактивный шелл сейчас не запущен, пишет предупреждение в лог и возвращает ошибку `errNotRunning` (при этом команда **не** попадает в историю).
  2. Очищает строку от возможных символов перевода строки справа (`strings.TrimRight(command, "\r\n")`) и добавляет символ возврата каретки `"\r"` (эквивалент нажатия клавиши `Enter` в терминале).
  3. Отправляет получившуюся строку в PTY через `t.session.Write(cmd)`.
  4. Если запись прошла успешно, сохраняет исходную команду в историю `t.history.Add(command)` (что также перемещает её на первое место в списке недавних команд).

- **[`AddHistory(command string)`](file:///home/vlad/projects/kutex/internal/terminal/terminal.go#L103-L107):**
  Вызывается фронтендом каждый раз, когда пользователь нажимает `Enter` при обычном вводе в терминале. Делегирует сохранение в `t.history.Add(command)` и, если команда не была пустой, логирует запись на уровне `DEBUG`.

- **[`GetHistory() []string`](file:///home/vlad/projects/kutex/internal/terminal/terminal.go#L110-L112):**
  Возвращает срез всех сохранённых в истории команд (от самых свежих к самым старым) через `t.history.List()`.

- **[`ClearHistory()`](file:///home/vlad/projects/kutex/internal/terminal/terminal.go#L115-L118):**
  Очищает историю команд через `t.history.Clear()`.

- **[`ExecuteCommand(command string) (string, error)`](file:///home/vlad/projects/kutex/internal/terminal/terminal.go#L122-L129):**
  Выполняет команду в фоновом неинтерактивном режиме через `t.executor.Execute(command, t.session.Pid())`, передавая PID активной интерактивной сессии (чтобы фоновая команда знала текущую папку шелла), и возвращает объединённый вывод `stdout + stderr`.

- **[`GetCwd() string`](file:///home/vlad/projects/kutex/internal/terminal/terminal.go#L132-L134):**
  Возвращает текущую рабочую директорию терминала через `t.executor.GetCwd(t.session.Pid())`.

---

#### 3. [`internal/terminal/session.go`](file:///home/vlad/projects/kutex/internal/terminal/session.go) — Интерактивная PTY-сессия (`Session`)

Файл [`session.go`](file:///home/vlad/projects/kutex/internal/terminal/session.go) отвечает за низкоуровневую работу с псевдотерминалом (PTY) и дочерним процессом оболочки ОС.

```go
var errNotRunning = errors.New("terminal: shell is not running")

type OutputHandler func(base64Data string)
type ExitHandler func(exitCode int)

type Session struct {
	mu  sync.Mutex
	cmd *exec.Cmd // Указатель на запущенный процесс оболочки ($SHELL)
	pty *os.File  // Файловый дескриптор ведущей стороны псевдотерминала (PTY master)
}
```

Разберём устройство каждого метода и функции в `session.go`:

##### Запуск процесса и выделение PTY: [`Start(cols, rows int, dir string, onOutput OutputHandler, onExit ExitHandler) error`](file:///home/vlad/projects/kutex/internal/terminal/session.go#L34-L55)
1. **Гарантия отсутствия утечек (`s.Stop()`):**
   В самом начале вызывается `s.Stop()`. Если предыдущая сессия ещё была активна, её процесс убивается, а файловый дескриптор закрывается перед созданием новой.
2. **Подготовка команды (`exec.Command`):**
   - Вызывается `defaultShell()` для определения пути к исполняемому файлу оболочки.
   - Формируется окружение процесса: `cmd.Env = append(os.Environ(), "TERM=xterm-256color", "COLORTERM=truecolor")`. Переменные `TERM` и `COLORTERM` сообщают консольным утилитам (`ls`, `vim`, `bat`, `git`), что терминал поддерживает 256 цветов и 24-битную палитру RGB.
   - Если передана рабочая папка `dir != ""`, устанавливается `cmd.Dir = dir`.
3. **Создание псевдотерминала (`pty.StartWithSize(cmd, winsize(cols, rows))`):**
   Под капотом библиотека `github.com/creack/pty` выполняет следующие системные операции в ядре Linux/macOS:
   - Открывает устройство `/dev/ptmx`, получая файловый дескриптор **PTY master** (`f *os.File`), и разблокирует соответствующее ведомое устройство **PTY slave** (например, `/dev/pts/4`).
   - Устанавливает начальный размер окна в строках и колонках через системный вызов `ioctl(fd, TIOCSWINSZ, &winsize)`.
   - Запускает дочерний процесс `cmd` в новой сессии (`setsid`), привязывает дескриптор **PTY slave** к его потокам `stdin`, `stdout` и `stderr` и делает его управляющим терминалом процесса (`TIOCSCTTY`).
   - Закрывает дескриптор slave в родительском процессе Go и возвращает дескриптор master `f`.
4. **Сохранение состояния и старт чтения (`go s.pump(...)`):**
   Под защитой мьютекса `s.mu` сохраняются `s.cmd = cmd` и `s.pty = f`, после чего в отдельной фоновой горутине запускается цикл чтения вывода `go s.pump(cmd, f, onOutput, onExit)`.

##### Цикл чтения вывода: [`pump(cmd *exec.Cmd, f *os.File, onOutput OutputHandler, onExit ExitHandler)`](file:///home/vlad/projects/kutex/internal/terminal/session.go#L114-L140)
Это сердце интерактивного терминала, работающее в отдельной горутине всё время жизни шелла:

```go
func (s *Session) pump(cmd *exec.Cmd, f *os.File, onOutput OutputHandler, onExit ExitHandler) {
	buf := make([]byte, 32*1024)
	for {
		n, err := f.Read(buf)
		if n > 0 && s.currentPty() == f && onOutput != nil {
			onOutput(base64.StdEncoding.EncodeToString(buf[:n]))
		}
		if err != nil {
			break
		}
	}
	_ = cmd.Wait()

	s.mu.Lock()
	stillCurrent := s.pty == f
	if stillCurrent {
		s.cmd, s.pty = nil, nil
	}
	s.mu.Unlock()

	if stillCurrent {
		_ = f.Close()
		if onExit != nil {
			onExit(cmd.ProcessState.ExitCode())
		}
	}
}
```

Разберём тонкие инженерные детали этой функции:
- **Буфер 32 КБ (`make([]byte, 32*1024)`):** За один системный вызов `f.Read(buf)` считывается до 32 КБ данных, напечатанных оболочкой или запущенной в ней программой.
- **Почему данные кодируются в Base64 (`base64.StdEncoding.EncodeToString(buf[:n])`):**
  Мост событий Wails сериализует аргументы в JSON (UTF-8 строки). В кодировке UTF-8 один символ (например, кириллица, эмодзи или иконка Nerd Font) занимает от 1 до 4 байт. Когда программа быстро выводит большой поток текста, граница чтения в 32 КБ может разрезать многобайтовый UTF-8 символ прямо посередине: первые 2 байта попадут в первый вызов `Read`, а оставшиеся 1–2 байта — в следующий. Если попытаться передать такой «разрезанный» срез байтов как обычную строку через JSON, парсер заменит некорректные байты на символ замены `U+FFFD` (``). Кодирование каждого чанка в Base64 гарантирует побайтовую точность передачи, а потоковый декодер UTF-8 внутри `xterm.js` (`term.write(Uint8Array)`) сам корректно склеивает разорванные на границе чанков символы.
- **Защита от гонок при перезапуске (`s.currentPty() == f`):**
  Если сессия была остановлена и тут же перезапущена, `s.pty` уже указывает на новый файл (или `nil`). Проверка `s.currentPty() == f` гарантирует, что «хвосты» вывода от старого закрывающегося PTY никогда не попадут в новый терминал.
- **Выход из цикла и сбор зомби-процесса (`_ = cmd.Wait()`):**
  Когда пользователь вводит `exit` (или нажимает `Ctrl+D`), дочерний процесс шелла завершается, ведомый дескриптор PTY slave закрывается, и в Linux `f.Read(buf)` на ведущем дескрипторе возвращает ошибку `EIO` (Input/output error). Цикл прерывается, и вызов `cmd.Wait()` освобождает ресурсы процесса в таблице процессов ОС (предотвращая появление процесса-зомби `<defunct>`) и заполняет `cmd.ProcessState`.
- **Отличие естественного выхода от принудительного (`stillCurrent`):**
  - Если пользователь сам вышел из шелла (`exit`), то к моменту завершения `cmd.Wait()` поле `s.pty` всё ещё равно `f` (`stillCurrent == true`). Тогда `pump` сам очищает `s.cmd, s.pty = nil, nil`, закрывает дескриптор `f.Close()` и вызывает `onExit(cmd.ProcessState.ExitCode())`, чтобы фронтенд показал сообщение `[process exited with code N, press Enter to restart]`.
  - Если же остановка была вызвана принудительно методом `s.Stop()` (при закрытии приложения или перед перезапуском), то `Stop()` заранее обнулил `s.pty = nil` (`stillCurrent == false`). В этом случае `onExit` **не** вызывается, чтобы не слать ложные события завершения.

##### Остальные методы и вспомогательные функции `session.go`:
- **[`Write(data string) error`](file:///home/vlad/projects/kutex/internal/terminal/session.go#L58-L65):**
  Получает текущий файл PTY через потокобезопасный `s.currentPty()`. Если он `nil`, возвращает `errNotRunning`. Иначе записывает байты `[]byte(data)` в ведущий дескриптор PTY. Драйвер терминала в ядре ОС обрабатывает эти байты согласно настройкам `termios` (например, превращает байт `\x03` от `Ctrl+C` в сигнал `SIGINT` для активной группы процессов) и передаёт их в `stdin` программы.
- **[`Resize(cols, rows int) error`](file:///home/vlad/projects/kutex/internal/terminal/session.go#L68-L74):**
  Если сессия запущена, вызывает `pty.Setsize(f, winsize(cols, rows))`. Ядро ОС обновляет размеры терминала и автоматически посылает сигнал `SIGWINCH` (Window Change) дочернему процессу, благодаря чему `vim`, `htop` или `zsh` мгновенно перестраивают интерфейс под новый размер окна.
- **[`Pid() int`](file:///home/vlad/projects/kutex/internal/terminal/session.go#L77-L84):**
  Под мьютексом `s.mu` возвращает PID запущенного процесса оболочки (`s.cmd.Process.Pid`) или `0`, если процесс не запущен.
- **[`IsRunning() bool`](file:///home/vlad/projects/kutex/internal/terminal/session.go#L87-L89):**
  Проверяет `s.currentPty() != nil`.
- **[`Stop()`](file:///home/vlad/projects/kutex/internal/terminal/session.go#L92-L105):**
  Захватывает мьютекс `s.mu`, копирует ссылки `cmd, f := s.cmd, s.pty` в локальные переменные и сразу обнуляет поля структуры `s.cmd, s.pty = nil, nil` до разблокировки мьютекса. После этого вызывает `cmd.Process.Kill()` и `f.Close()`. Закрытие master-дескриптора `f.Close()` посылает сигнал `SIGHUP` всем дочерним процессам шелла и разблокирует висящий вызов `f.Read(buf)` в горутине `pump()`.
- **[`defaultShell() string`](file:///home/vlad/projects/kutex/internal/terminal/session.go#L142-L152):**
  Сначала проверяет переменную окружения `os.Getenv("SHELL")`. Если она пуста, последовательно проверяет наличие файлов `/bin/bash`, `/bin/zsh`, `/bin/sh` через `os.Stat`, а в крайнем случае возвращает `"sh"`.
- **[`winsize(cols, rows int) *pty.Winsize`](file:///home/vlad/projects/kutex/internal/terminal/session.go#L154-L162):**
  Защищает от некорректных (нулевых или отрицательных) размеров, подставляя стандартные `80x24`, и возвращает структуру `&pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)}`.

---

#### 4. [`internal/terminal/executor.go`](file:///home/vlad/projects/kutex/internal/terminal/executor.go) — Фоновое выполнение команд и отслеживание директории (`Executor`)

Структура [`Executor`](file:///home/vlad/projects/kutex/internal/terminal/executor.go#L15-L19) предназначена для выполнения одиночных команд в фоне (без отображения в интерактивном терминале) и для отслеживания текущей рабочей директории (`CWD`):

```go
type Executor struct {
	mu         sync.Mutex
	currentDir string // Текущая отслеживаемая директория для фоновых команд
	prevDir    string // Предыдущая директория (для поддержки команды `cd -`)
}
```

Разберём все методы `executor.go`:

- **[`NewExecutor() *Executor`](file:///home/vlad/projects/kutex/internal/terminal/executor.go#L22-L28):**
  Создаёт экземпляр `Executor` и инициализирует `e.currentDir` домашней директорией пользователя (`os.UserHomeDir()`).

- **[`GetCwd(activePid int) string`](file:///home/vlad/projects/kutex/internal/terminal/executor.go#L32-L50):**
  Определяет актуальную рабочую директорию:
  1. **Живое чтение из `/proc/<pid>/cwd`:** Если передан `activePid > 0` (то есть интерактивный шелл в PTY сейчас запущен), метод выполняет `os.Readlink(fmt.Sprintf("/proc/%d/cwd", activePid))`. В ОС Linux ядро поддерживает виртуальную символическую ссылку `/proc/<pid>/cwd`, которая в реальном времени указывает на текущую рабочую папку процесса. Это значит, что если пользователь ввёл `cd /var/log` в интерактивном терминале, вызов `GetCwd` мгновенно вернёт `"/var/log"` без необходимости встраивать специальные хуки в `.bashrc` или `.zshrc`.
  2. **Цепочка резервных значений (Fallback):** Если интерактивный шелл не запущен (`activePid == 0`) или чтение `/proc` недоступно, метод возвращает сохранённое поле `e.currentDir` (защищённое мьютексом `e.mu`). Если и оно пустое — возвращает `os.UserHomeDir()`, а в случае ошибки — корень `"/"`.

- **[`SetCwd(dir string)`](file:///home/vlad/projects/kutex/internal/terminal/executor.go#L53-L58):**
  Под мьютексом `e.mu` сохраняет старое значение `e.currentDir` в `e.prevDir` и записывает новый путь в `e.currentDir`.

- **[`Execute(command string, activePid int) (string, error)`](file:///home/vlad/projects/kutex/internal/terminal/executor.go#L62-L82):**
  Выполняет команду в контексте текущей рабочей директории:
  1. Убирает пробелы по краям (`strings.TrimSpace(command)`). Если строка пустая, сразу возвращает `"", nil`.
  2. Получает текущую директорию `cwd := e.GetCwd(activePid)`.
  3. **Перехват команды `cd` (`if isPureCd(trimmed)`):**
     Почему `cd` нужно обрабатывать особо? Потому что `cd` — это встроенная команда оболочки (shell builtin), которая меняет рабочую директорию только того процесса, в котором вызвана. Если запустить `sh -c "cd /tmp"` в дочернем процессе, этот процесс сменит папку на `/tmp` и тут же завершится, а следующий вызов `ExecuteCommand("pwd")` снова запустится в старой папке. Поэтому чистые вызовы `cd` перехватываются и обрабатываются внутри Go методом `e.handleCd(trimmed, cwd)`.
  4. **Запуск всех остальных команд:**
     Создаётся подпроцесс `exec.Command(defaultShell(), "-c", command)`, ему выставляются `cmd.Dir = cwd` и переменные окружения `TERM=xterm-256color`, `COLORTERM=truecolor`. Метод `cmd.CombinedOutput()` ждёт завершения команды, собирает весь её вывод из `stdout` и `stderr` в один буфер и возвращает `string(out), err`.

- **[`isPureCd(cmd string) bool`](file:///home/vlad/projects/kutex/internal/terminal/executor.go#L84-L89):**
  Проверяет, является ли команда одиночным переходом `cd`: строка должна быть равна `"cd"` либо начинаться с `"cd "` или `"cd\t"`, и при этом **не должна** содержать операторов ветвления, пайпов, перенаправлений или подстановок (`|&;<>()$\``). Например, `cd /tmp` — это чистый `cd` (обрабатывается в Go), а `cd /tmp && ls` — составная команда (передаётся в `sh -c`).

- **[`handleCd(cmd, cwd string) (string, error)`](file:///home/vlad/projects/kutex/internal/terminal/executor.go#L91-L136):**
  Полная эмуляция поведения шелловского `cd` средствами Go:
  1. Отрезает префикс `"cd"` (`strings.TrimSpace(cmd[2:])`).
  2. Если аргумент заключён в парные двойные (`"..."`) или одинарные (`'...'`) кавычки (например, `cd "My Folder"`), снимает их.
  3. Вычисляет целевой путь `targetDir`:
     - `cd` (без аргументов) или `cd ~` → домашняя папка `os.UserHomeDir()`.
     - `cd -` → берёт предыдущую директорию `e.prevDir` (или оставляет `cwd`, если `prevDir` ещё пуст).
     - `cd ~/...` → заменяет префикс `~/` на домашнюю директорию через `filepath.Join(home, target[2:])`.
     - Абсолютный путь (`filepath.IsAbs(target)`) нормализуется через `filepath.Clean(target)`.
     - Относительный путь склеивается с текущей папкой: `filepath.Clean(filepath.Join(cwd, target))`.
  4. Проверяет существование пути на диске через `os.Stat(targetDir)`. Если путь не существует — возвращает ошибку `os.Stat`. Если это обычный файл, а не папка (`!info.IsDir()`) — возвращает ошибку `cd: not a directory: <path>`.
  5. Вызывает `e.SetCwd(targetDir)` и записывает информационный лог через `logger.Component("executor")`.

---

#### 5. [`internal/terminal/history.go`](file:///home/vlad/projects/kutex/internal/terminal/history.go) — Потокобезопасная MRU-история команд (`History`)

Структура [`History`](file:///home/vlad/projects/kutex/internal/terminal/history.go#L16-L20) реализует собственное хранилище истории команд Kutex по принципу **MRU (Most-Recently-Used — недавно использованные первыми)** с фиксированным лимитом памяти:

```go
const DefaultHistorySize = 1000

type History struct {
	mu      sync.Mutex
	max     int      // Максимальное количество хранимых команд (по умолчанию 1000)
	entries []string // Внутренний срез: старые команды в начале, самые новые — в конце
}
```

Разберём методы `history.go`:

- **[`NewHistory(max int) *History`](file:///home/vlad/projects/kutex/internal/terminal/history.go#L24-L29):**
  Создаёт хранилище с лимитом `max`. Если передано `max <= 0`, используется `DefaultHistorySize` (`1000`).

- **[`Add(command string) bool`](file:///home/vlad/projects/kutex/internal/terminal/history.go#L33-L53):**
  Добавляет команду в историю и возвращает `true`, если команда была записана:
  1. Очищает строку от пробелов и переводов строк по краям (`strings.TrimSpace(command)`). Если строка пустая — возвращает `false`.
  2. Захватывает мьютекс `h.mu.Lock()`.
  3. **Дедупликация:** Проходит циклом по `h.entries`. Если такая команда уже есть в истории на позиции `i`, удаляет её со старого места (`h.entries = append(h.entries[:i], h.entries[i+1:]...)`) и прерывает цикл.
  4. Добавляет команду в самый конец среза (`h.entries = append(h.entries, command)`), делая её самой свежей.
  5. **Вытеснение старых записей без утечки памяти:**
     ```go
     if over := len(h.entries) - h.max; over > 0 {
         h.entries = append([]string(nil), h.entries[over:]...)
     }
     ```
     Обратите внимание на идиому `append([]string(nil), h.entries[over:]...)`: если бы мы просто написали `h.entries = h.entries[over:]`, срез продолжал бы ссылаться на всё более крупный старый базовый массив, а отрезанные в начале элементы не освобождались бы сборщиком мусора (GC). Копирование в новый срез `[]string(nil)` гарантирует, что размер базового массива никогда не превысит `h.max`.

- **[`List() []string`](file:///home/vlad/projects/kutex/internal/terminal/history.go#L56-L65):**
  Возвращает срез команд в обратном порядке (самая последняя выполненная команда — под индексом `0`):
  ```go
  out := make([]string, len(h.entries))
  for i, e := range h.entries {
      out[len(h.entries)-1-i] = e
  }
  return out
  ```
  Поскольку каждый раз выделяется новый срез `out`, вызывающий код получает **защитную копию (defensive copy)** — любые внешние изменения возвращённого среза не могут повредить внутреннее состояние `History`.

- **[`Clear()`](file:///home/vlad/projects/kutex/internal/terminal/history.go#L68-L72):**
  Под мьютексом сбрасывает `h.entries = nil`.

---

#### 6. Тесты пакета `internal/terminal` (`*_test.go`)

В пакете `internal/terminal` находятся 4 тестовых файла, покрывающих все компоненты:

1. **[`terminal_test.go`](file:///home/vlad/projects/kutex/internal/terminal/terminal_test.go):**
   - `TestTerminalService`: проверяет, что начальный `GetCwd()` равен домашней папке пользователя, что `ExecuteCommand("echo 'kutex service test'")` работает даже без запущенной интерактивной PTY-сессии, и что `RunCommand("ls")` на незапущенном терминале возвращает `errNotRunning`.
   - `TestTerminalHistory`: проверяет `AddHistory`, игнорирование пустых строк, порядок выдачи в `GetHistory()`, отсутствие записи в историю при неудачном вызове `RunCommand` и полную очистку через `ClearHistory()`.
2. **[`session_test.go`](file:///home/vlad/projects/kutex/internal/terminal/session_test.go):**
   - `TestSessionLifecycle`: запускает реальную PTY-сессию `s.Start(80, 24, ...)`, проверяет `s.IsRunning()` и `s.Pid() > 0`, отправляет команду `s.Write("echo HELLO_SESSION\r")`, меняет размер окна `s.Resize(100, 30)`, проверяет поступление Base64-вывода в колбэк `onOutput` и корректную остановку `s.Stop()`.
3. **[`executor_test.go`](file:///home/vlad/projects/kutex/internal/terminal/executor_test.go):**
   - `TestExecutor`: проверяет 10 сценариев работы `Executor`: начальный CWD, выполнение `pwd`, создание временной папки и переход в неё через `cd <tempDir>`, создание файла и проверку вывода `ls`, возврат назад через `cd -`, переход домой через `cd ~`, обработку кавычек `cd "<tempDir>"`, возврат ошибки при `cd` в несуществующую папку, возврат ошибки при `cd` в обычный файл и ошибку при запуске несуществующей команды.
4. **[`history_test.go`](file:///home/vlad/projects/kutex/internal/terminal/history_test.go):**
   - Проверяет добавление и тримминг пробелов (`TestHistoryAddAndList`), булев возврат `Add` (`TestHistoryAddReportsRecorded`), дедупликацию с переносом в начало (`TestHistoryDeduplicatesByMovingToFront`), вытеснение старых записей при превышении лимита `max` (`TestHistoryDropsOldestBeyondMax`), неизменяемость внутреннего состояния при мутации результата `List()` (`TestHistoryListReturnsCopy`) и очистку `Clear()` (`TestHistoryClear`).

---

### 2.4. Пакет `internal/system` — Работа с файловой системой

Пакет `internal/system` предоставляет методы для инспекции директорий ОС и также привязан к фронтенду через Wails (`Bind`).

#### 1. [`internal/system/system.go`](file:///home/vlad/projects/kutex/internal/system/system.go) — Сканирование директорий и симлинков

- **Структура [`System`](file:///home/vlad/projects/kutex/internal/system/system.go#L12) и конструктор [`New()`](file:///home/vlad/projects/kutex/internal/system/system.go#L15-L17):**
  Пустая структура-сервис `type System struct{}`, методы которой (`GetFolders` и `GetFoldersRecursive`) экспортируются в Wails и вызывают одноимённые функции пакета.

- **[`GetFolders(dirPath string) ([]string, error)`](file:///home/vlad/projects/kutex/internal/system/system.go#L34-L63):**
  Возвращает список имён всех поддиректорий первого уровня внутри `dirPath`:
  1. Если `dirPath == ""`, подставляется текущая директория `"."`.
  2. Вызывает `os.ReadDir(dirPath)`. В Go функция `os.ReadDir` читает записи каталога без лишних системных вызовов `stat` для каждого файла, но поэтому для символических ссылок `entry.IsDir()` возвращает `false`.
  3. Для каждой записи `entry`:
     - Если `entry.IsDir()` истинно — добавляет `entry.Name()` в список `folders`.
     - **Разрешение символических ссылок на папки:** Проверяет битовую маску режима файла `if entry.Type()&os.ModeSymlink != 0`. Если это симлинк, выполняет `os.Stat(filepath.Join(dirPath, entry.Name()))` (который следует по ссылке до конечной цели). Если цель существует и является директорией (`err == nil && info.IsDir()`), симлинк также включается в список папок (битые симлинки безопасно игнорируются).

- **[`GetFoldersRecursive(root string) ([]string, error)`](file:///home/vlad/projects/kutex/internal/system/system.go#L66-L89):**
  Рекурсивно обходит дерево каталогов начиная с `root` (или `"."`, если `root == ""`) с помощью быстрой стандартной функции `filepath.WalkDir`. Собирает пути всех вложенных поддиректорий (`d.IsDir() && path != root`) и возвращает их срез. Все операции и ошибки подробно логируются через `logger.Component("system")`.

#### 2. [`internal/system/system_test.go`](file:///home/vlad/projects/kutex/internal/system/system_test.go) — Модульные тесты `system`

- `TestGetFolders`: создаёт временную директорию с папками `alpha`, `beta`, текстовым файлом `test.txt` и символической ссылкой `symlink_alpha -> alpha`. Проверяет, что `GetFolders` возвращает папки и симлинк на папку, исключает обычный файл `test.txt`, одинаково работает через метод структуры `sys.GetFolders` и возвращает ошибку для несуществующего пути.
- `TestGetFoldersRecursive`: создаёт вложенное дерево `dir1/nested1` и `dir2` и проверяет, что `GetFoldersRecursive` находит ровно 3 поддиректории.

---

### 2.5. Пакет `internal/logger` — Структурированное логирование (`log/slog`)

Пакет `internal/logger` реализует собственную систему структурированного логирования без внешних зависимостей поверх стандартного пакета `log/slog` (введённого в Go 1.21+).

---

#### 1. [`internal/logger/logger.go`](file:///home/vlad/projects/kutex/internal/logger/logger.go) — Фасад логгера и управление конфигурацией

- **Уровни и конфигурация (`Level`, [`Config`](file:///home/vlad/projects/kutex/internal/logger/logger.go#L22-L27)):**
  Экспортирует уровни `LevelDebug`, `LevelInfo`, `LevelWarn`, `LevelError` (алиасы к `slog.Level`) и структуру настроек:
  ```go
  type Config struct {
      Level    slog.Level // Минимальный уровень логирования
      FilePath string     // Опциональный путь к файлу для дублирования логов
      UseColor bool       // Включить ли ANSI-цвета в консоли
      Output   io.Writer  // Поток вывода в консоль (по умолчанию os.Stderr)
  }
  ```
- **Автоматическое определение поддержки цветов ([`defaultUseColor()`](file:///home/vlad/projects/kutex/internal/logger/logger.go#L46-L51)):**
  Следует стандарту [no-color.org](https://no-color.org/): если задана переменная окружения `NO_COLOR != ""` или терминал имеет тип `TERM=dumb`, цвета автоматически отключаются.
- **Глобальный логгер по умолчанию (`init()`, `Init()`, `Default()`):**
  При загрузке пакета функция `init()` вызывает `initDefault()`, создавая потокобезопасный глобальный логгер, пишущий в `os.Stderr` с уровнем `LevelInfo`, и регистрирует его в стандартной библиотеке через `slog.SetDefault(...)`. Доступ к глобальному логгеру синхронизирован через `mu sync.RWMutex`. Метод `Init(cfg Config)` позволяет переконфигурировать глобальный логгер на лету (аккуратно закрывая предыдущий открытый лог-файл, если он был).
- **Создание логгера ([`New(cfg Config)`](file:///home/vlad/projects/kutex/internal/logger/logger.go#L63-L86)):**
  Если указан `cfg.FilePath`, открывает (или создаёт) файл с флагами `os.O_CREATE|os.O_WRONLY|os.O_APPEND` и правами `0644`. Создаёт `NewConsoleHandler(out, file, cfg.Level, cfg.UseColor)` и оборачивает его в `Logger`.
- **Контекстные методы [`With(args ...any)`](file:///home/vlad/projects/kutex/internal/logger/logger.go#L127-L133) и [`Component(name string)`](file:///home/vlad/projects/kutex/internal/logger/logger.go#L136-L138):**
  `Component("terminal")` вызывает `l.With("component", name)`, возвращая дочерний логгер, в котором к каждой записи автоматически прикрепляется атрибут `component=terminal`.

---

#### 2. [`internal/logger/handler.go`](file:///home/vlad/projects/kutex/internal/logger/handler.go) — Кастомный `slog.Handler` для консоли и файла

Структура [`ConsoleHandler`](file:///home/vlad/projects/kutex/internal/logger/handler.go#L23-L31) реализует стандартный интерфейс `slog.Handler` (методы `Enabled`, `Handle`, `WithAttrs`, `WithGroup`):

- **Извлечение компонента и атрибутов в [`Handle(_ context.Context, r slog.Record) error`](file:///home/vlad/projects/kutex/internal/logger/handler.go#L50-L127):**
  Проходит по предзаданным атрибутам хендлера (`h.attrs`) и атрибутам конкретной записи (`r.Attrs(...)`). Если ключ атрибута равен `"component"`, его значение сохраняется отдельно в переменную `component`, чтобы вывести его сразу после уровня лога в круглых скобках `(component)`, а остальные пары `ключ=значение` добавляются в конец строки.
- **Форматирование уровней ([`formatLevel`](file:///home/vlad/projects/kutex/internal/logger/handler.go#L159-L170)):**
  Выравнивает ширину всех уровней до 7 символов и назначает каждому свой ANSI-цвет:
  - `[DEBUG]` — голубой (`\033[36m`)
  - `[INFO] ` — зелёный (`\033[32m`)
  - `[WARN] ` — жёлтый (`\033[33m`)
  - `[ERROR]` — красный (`\033[31m`)
- **Двойной потокобезопасный вывод (Консоль + Файл):**
  Под защитой мьютекса `h.mu.Lock()` (чтобы строки от разных горутин никогда не перемешивались):
  1. **В консоль (`h.out`):** выводит краткое время с миллисекундами (`15:04:05.000`) в приглушённом стиле (`colorDim = "\033[2m"`), выделяет уровень жирным (`colorBold = "\033[1m"`) и цветом уровня (`levelColor`), окрашивает имя компонента `(component)` в пурпурный (`colorMagenta = "\033[35m"`), сам текст сообщения (`r.Message`) окрашивает в цвет соответствующего типа лога (`DEBUG` — голубой, `INFO` — зелёный, `WARN` — жёлтый, `ERROR` — красный), а ключи атрибутов приглушает (`colorDim`):
     ```text
     02:46:02.626 [INFO]  (main) Starting kutex...
     02:46:02.710 [INFO]  (terminal) Starting interactive terminal cols=110 rows=32 cwd=/home/vlad
     ```
  2. **В файл (`h.file`, если задан):** записывает строку с полной датой (`2006-01-02 15:04:05.000`) и **полностью без управляющих ANSI-кодов цвета**, чтобы лог-файл легко читался в любом текстовом редакторе или парсере.

---

#### 3. [`internal/logger/wails.go`](file:///home/vlad/projects/kutex/internal/logger/wails.go) — Адаптер логгера для Wails (`WailsAdapter`)

Фреймворк Wails v2 ожидает для своих внутренних логов интерфейс `github.com/wailsapp/wails/v2/pkg/logger.Logger` с методами `Print`, `Trace`, `Debug`, `Info`, `Warning`, `Error`, `Fatal`.
Структура [`WailsAdapter`](file:///home/vlad/projects/kutex/internal/logger/wails.go#L11-L13) оборачивает наш `*Logger` с предзаданным тегом `.Component("wails")` и перенаправляет все внутренние вызовы Wails в соответствующие уровни нашего логгера (`Trace` и `Debug` → `Debug`, `Print` и `Info` → `Info`, `Warning` → `Warn`, `Error` и `Fatal` → `Error`).

---

#### 4. [`internal/logger/logger_test.go`](file:///home/vlad/projects/kutex/internal/logger/logger_test.go) — Модульные тесты `logger`

Проверяет все аспекты работы логгера:
- `TestConsoleHandlerFormatting`: точность форматирования всех 4 уровней (`[DEBUG]`, `[INFO] `, `[WARN] `, `[ERROR]`) и атрибутов `key=value`.
- `TestComponentTagging`: отображение тега `(terminal)` при вызове `l.Component("terminal")`.
- `TestLogLevelFiltering`: отсечение `Debug` и `Info` сообщений, когда установлен порог `LevelWarn`.
- `TestColorFormatting`: присутствие ANSI-последовательностей `\033[` при `UseColor: true`.
- `TestFileLogging`: проверка того, что при одновременной цветной записи в консоль и в файл сам файл на диске содержит чистый текст **без** ANSI-кодов `\033[`.
- `TestWailsAdapter`: проверка всех 7 методов интерфейса логгера Wails и наличия метки `(wails)` в каждой строке.
- `TestInitAndDefault`: проверка работы глобальных функций пакета (`Debug`, `Info`, `Warn`, `Error`).

---

## 3. Подробный разбор Frontend-скриптов (Vue 3 + TypeScript)

Фронтенд отвечает за рендеринг сетки терминала на GPU, загрузку шрифтов с иконками, чтение набранных команд с экрана при нажатии `Enter`, отображение модального окна истории по `Ctrl+Shift+H` и связь с Go-бэкендом.

---

### 3.1. Конфигурация и точка входа фронтенда

1. **[`frontend/index.html`](file:///home/vlad/projects/kutex/frontend/index.html):**
   Корневой HTML-документ. Задаёт базовый фон `bg-[#1b2636]`, белый текст, контейнер `<div id="app" class="h-screen text-center"></div>` и подключает точку входа `./src/main.ts`.
2. **[`frontend/src/main.ts`](file:///home/vlad/projects/kutex/frontend/src/main.ts):**
   Импортирует корневой компонент `App.vue`, глобальный файл шрифтов `style.css`, виртуальный модуль утилитарных классов UnoCSS (`import 'virtual:uno.css'`) и монтирует приложение `createApp(App).mount('#app')`.
3. **[`frontend/src/style.css`](file:///home/vlad/projects/kutex/frontend/src/style.css):**
   Регистрирует правило `@font-face` для локального шрифта интерфейса `Nunito` (`assets/fonts/nunito-v16-latin-regular.woff2`).
4. **[`frontend/uno.config.ts`](file:///home/vlad/projects/kutex/frontend/uno.config.ts):**
   Настраивает тему UnoCSS: определяет семейства шрифтов `font-sans` (с `Nunito` во главе) для UI-элементов (например, модального окна истории) и `font-mono` (`Menlo, Consolas, "DejaVu Sans Mono", "Liberation Mono", monospace`) для моноширинного текста.
5. **[`frontend/vite.config.ts`](file:///home/vlad/projects/kutex/frontend/vite.config.ts):**
   Подключает плагины `@vitejs/plugin-vue` и `unocss/vite`, а также настраивает путевой алиас `'@'` → `./src`.
6. **[`frontend/eslint.config.mjs`](file:///home/vlad/projects/kutex/frontend/eslint.config.mjs):**
   Настраивает единый стиль кода через `@antfu/eslint-config` (отступы в 2 пробела, одинарные кавычки, без точек с запятой, игнорирование автосгенерированной папки `wailsjs/**`).

---

### 3.2. Автосгенерированные привязки Wails (`frontend/wailsjs/`)

Файлы в этой папке создаются автоматически утилитой `wails` на основе Go-структур, переданных в `Bind` в `main.go`:
- **[`frontend/wailsjs/go/terminal/Terminal.js`](file:///home/vlad/projects/kutex/frontend/wailsjs/go/terminal/Terminal.js) (и `Terminal.d.ts`):**
  Экспортирует функции-обёртки `Start`, `Write`, `Resize`, `Stop`, `RunCommand`, `ExecuteCommand`, `GetCwd`, `AddHistory`, `GetHistory`, `ClearHistory`. Каждая из них вызывает `window['go']['terminal']['Terminal'][MethodName](...)` и возвращает `Promise`.
- **[`frontend/wailsjs/go/system/System.js`](file:///home/vlad/projects/kutex/frontend/wailsjs/go/system/System.js) (и `System.d.ts`):**
  Экспортирует функции `GetFolders(dirPath)` и `GetFoldersRecursive(root)`.
- **[`frontend/wailsjs/runtime/runtime.js`](file:///home/vlad/projects/kutex/frontend/wailsjs/runtime/runtime.js):**
  Предоставляет клиентский API рантайма Wails, включая подписку на события бэкенда `EventsOn(eventName, callback)`.

---

### 3.3. Утилита безопасных промисов ([`frontend/src/shared/utils/index.ts`](file:///home/vlad/projects/kutex/frontend/src/shared/utils/index.ts))

Файл экспортирует обобщённую (generic) функцию [`safePromiseTyped`](file:///home/vlad/projects/kutex/frontend/src/shared/utils/index.ts#L1-L15):

```ts
export async function safePromiseTyped<
  T,
  E extends new (...args: never[]) => Error,
>(
  promise: Promise<T>,
  errorsToCatch?: E[],
): Promise<[undefined, T] | [InstanceType<E>]>
```

Она преобразует любой `Promise<T>` в кортеж в стиле Go (`[undefined, data]` при успехе или `[error]` при ошибке). Это позволяет в компонентах Vue (например, в `App.vue`) писать плоский и читаемый асинхронный код `const [err, data] = await safePromiseTyped(GetHistory())` без громоздких блоков `try { ... } catch { ... }`. Если передан необязательный список классов ошибок `errorsToCatch`, функция перехватывает только указанные типы ошибок, а остальные пробрасывает дальше (`throw error`).

---

### 3.4. Поддержка иконок Nerd Font ([`nerd-font.ts`](file:///home/vlad/projects/kutex/frontend/src/fonts/nerd-font.ts) и [`nerd-font.css`](file:///home/vlad/projects/kutex/frontend/src/fonts/nerd-font.css))

Современные темы командной строки (`starship`, `oh-my-posh`, `powerlevel10k`) и утилиты (`eza --icons`, `lsd`, `neovim`, `lazygit`) активно используют глифы из области личного использования Unicode (Private Use Area) для отображения стрелок Powerline, значков веток Git и иконок типов файлов.

Чтобы эти иконки работали в Kutex «из коробки» на любой системе без необходимости устанавливать пропатченные шрифты в ОС, реализована связка из двух файлов:

1. **[`frontend/src/fonts/nerd-font.css`](file:///home/vlad/projects/kutex/frontend/src/fonts/nerd-font.css):**
   Подключает встроенный в проект файл шрифта `SymbolsNerdFontMono-Regular.woff2` под именем `"Symbols Nerd Font Mono"` с правилом `font-display: block`. Этот шрифт содержит **только иконки** (без обычных букв и цифр), а его моноширинная (`Mono`) версия гарантирует, что каждая иконка занимает ровно 1 знакоместо терминала.
2. **[`frontend/src/fonts/nerd-font.ts`](file:///home/vlad/projects/kutex/frontend/src/fonts/nerd-font.ts):**
   - **[`withNerdFont(fontFamily: string): string`](file:///home/vlad/projects/kutex/frontend/src/fonts/nerd-font.ts#L56-L67):**
     Разбирает CSS-строку `font-family` по запятым и автоматически вставляет `"Symbols Nerd Font Mono"` **строго перед** первым общим ключевым словом (`monospace`, `ui-monospace`, `sans-serif`, `serif`, `system-ui`).
     *Почему это важно:* если поставить шрифт иконок после `monospace`, браузер при встрече неизвестного символа сначала обратится к системному `monospace`-шрифту ОС, не найдёт там иконку, нарисует пустой квадрат (`□`) и никогда не дойдёт до следующего элемента в списке. Постановка перед `monospace` гарантирует, что обычные буквы рисуются основным шрифтом пользователя, а отсутствующие в нём коды иконок берутся из `Symbols Nerd Font Mono`.
   - **[`loadNerdFont(): Promise<void>`](file:///home/vlad/projects/kutex/frontend/src/fonts/nerd-font.ts#L32-L44):**
     Браузеры лениво загружают веб-шрифты только тогда, когда символ из них появляется в DOM-дереве. Так как `xterm.js` рисует текст на `<canvas>` через WebGL, без принудительной предзагрузки первое приглашение шелла отрендерится до скачивания шрифта, и иконки закешируются в текстурном атласе WebGL как пустые квадратики. `loadNerdFont()` принудительно инициирует загрузку через `document.fonts.load('16px "Symbols Nerd Font Mono"', '\uE0B0')` (используя глиф стрелки Powerline `\uE0B0`), кеширует промис в переменной `loading` и никогда не завершается с reject.

---

### 3.5. Захват введённых команд из экранного буфера ([`frontend/src/terminal/command-capture.ts`](file:///home/vlad/projects/kutex/frontend/src/terminal/command-capture.ts))

Одной из самых интересных задач в эмуляторе терминала является получение точного текста команды, которую выполнил пользователь, чтобы сохранить её во встроенную историю Kutex.

#### Почему нельзя просто собирать нажатые клавиши в строку?
Потому что редактированием строки занимается сам шелл (`bash`/`zsh`) внутри PTY:
- Пользователь может набрать `git ch<Tab><Enter>`, и в событии ввода `onData` мы увидим только `"git ch\t\r"`, тогда как сам шелл развернул это на экране в `git checkout `.
- Пользователь может нажать стрелку `Up` (`\x1b[A`), вызвать команду пятиминутной давности, удалить слово через `Ctrl+W` (`\x17`) и нажать `Enter`.

#### Как работает класс [`CommandCapture`](file:///home/vlad/projects/kutex/frontend/src/terminal/command-capture.ts#L16-L75):
Вместо того чтобы пытаться угадать команду по нажатым клавишам, `CommandCapture` запоминает **координату на экране терминала**, где пользователь начал печатать команду после приглашения шелла (prompt), а в момент нажатия `Enter` (`\r`) считывает итоговый отредактированный текст прямо из активного экранного буфера `xterm.js`!

Пошаговый алгоритм метода **[`input(data: string): string | undefined`](file:///home/vlad/projects/kutex/frontend/src/terminal/command-capture.ts#L26-L52)**:
1. **Проверка альтернативного буфера (`buffer.type === 'alternate'`):**
   Полноэкранные программы (`vim`, `nvim`, `less`, `htop`, `man`) переключают терминал в альтернативный экранный буфер (`\x1b[?1049h`). Если активен `alternate` буфер, `CommandCapture` вызывает `this.reset()` и возвращает `undefined`. Благодаря этому нажатия `Enter` внутри `vim` или `less` никогда не засоряют историю команд шелла.
2. **Обработка нажатия `Enter` (`data === '\r'`):**
   Когда пользователь нажимает `Enter`, метод вызывает `this.read()` для чтения текста команды с экрана, сбрасывает маркер (`this.reset()`) и возвращает полученную строку (или `undefined`, если строка пустая).
3. **Сброс при прерывании (`Ctrl+C`) или многострочной вставке без Bracketed Paste:**
   - Если `data` содержит `\x03` (`Ctrl+C`), пользователь отменил ввод текущей строки — вызывается `this.reset()`.
   - Если `data` содержит `\r` внутри длинного чанка, но без маркера режима Bracketed Paste (`\x1B[200~`), значит в терминал разом отправлено несколько строк, которые ещё не успели поочерёдно отобразиться в буфере — состояние также сбрасывается.
4. **Установка начального маркера (`!this.start`):**
   При самом первом нажатии клавиши на новой строке приглашения сохраняется точка старта:
   ```ts
   this.start = { marker: this.term.registerMarker(0), col: buffer.cursorX }
   ```
   - `buffer.cursorX` — колонка курсора сразу после текста приглашения (например, сразу после `vlad@pc:~$ `).
   - `this.term.registerMarker(0)` — создаёт специальный объект `IMarker` в `xterm.js` на текущей строке курсора. В отличие от простого номера строки, `IMarker` автоматически смещает своё свойство `.line` вверх, если терминал прокручивается при достижении нижнего края экрана.
5. **Чтение команды из буфера ([`read(): string`](file:///home/vlad/projects/kutex/frontend/src/terminal/command-capture.ts#L61-L74)):**
   - Проверяет валидность маркера (`start && !start.marker.isDisposed && start.marker.line >= 0`).
   - Считывает текст первой строки начиная с колонки `start.col`: `buffer.getLine(row)?.translateToString(false, start.col) ?? ''`.
   - Если команда была длинной и перенеслась на следующие строки экрана, цикл `for (let line = buffer.getLine(++row); line?.isWrapped; ...)` проверяет флаг переноса `line.isWrapped` и доклеивает продолжение строки.
   - В конце обрезает пробелы по краям через `.trim()`.

---

### 3.6. Компонент терминала ([`frontend/src/components/XTerminal.vue`](file:///home/vlad/projects/kutex/frontend/src/components/XTerminal.vue))

[`XTerminal.vue`](file:///home/vlad/projects/kutex/frontend/src/components/XTerminal.vue) — переиспользуемый UI-компонент, инкапсулирующий работу с `@xterm/xterm` и его аддонами.

Что происходит внутри компонента:
1. **Ранняя загрузка шрифта иконок:** На уровне модуля сразу вызывается `loadNerdFont()`, чтобы скачивание `.woff2` началось ещё до монтирования DOM.
2. **Инициализация в `onMounted`:**
   - Формирует настройки `ITerminalOptions`: мигающий курсор (`cursorBlink: true`), процедурная отрисовка блочных символов и стрелок Powerline (`customGlyphs: true`), размер шрифта `14`, тема с фоном `#1b2636`.
   - Оборачивает `options.fontFamily` через `withNerdFont(...)`.
   - Создаёт `new Terminal(options)`, подключает `FitAddon` (расчёт числа колонок и строк по размеру DOM-контейнера) и `WebLinksAddon` (превращает ссылки в выводе терминала в кликабельные URL).
   - Монтирует терминал в `<div ref="container">` и включает аппаратный рендерер **WebGL** (`loadWebgl(t)`). Если WebGL недоступен или графический контекст потерян (`webgl.onContextLoss`), аддон аккуратно выгружается (`webgl.dispose()`), и `xterm.js` прозрачно переключается на стандартный DOM-рендерер.
   - Вызывает `fit()` для первичной подгонки размеров сетки.
3. **Перерисовка текстурного атласа после загрузки Nerd Font:**
   ```ts
   loadNerdFont().then(() => {
     if (term.value !== t) return
     t.clearTextureAtlas()
     t.refresh(0, t.rows - 1)
   })
   ```
   Если первый промпт шелла успел отрисоваться на несколько миллисекунд раньше, чем загрузился шрифт иконок, очистка текстурного атласа WebGL (`clearTextureAtlas()`) и принудительное обновление строк (`refresh`) мгновенно заменяют пустые квадратики на настоящие иконки.
4. **Автоматический ресайз (`ResizeObserver`):**
   Наблюдает за изменениями размеров контейнера `div` и внутри `requestAnimationFrame` вызывает `fit()`. Когда `fit()` меняет количество колонок или строк, `xterm` генерирует событие `onResize`, которое пробрасывается наверх (`emit('resize', size)`).
5. **Публичный интерфейс (`defineExpose`):**
   Предоставляет родительскому компоненту методы `write`, `writeln`, `clear`, `focus`, `fit` и ссылку `term`. При размонтировании (`onBeforeUnmount`) отключает `ResizeObserver` и освобождает ресурсы `term.value?.dispose()`.

---

### 3.7. Модальная панель истории команд ([`frontend/src/components/HistoryPanel.vue`](file:///home/vlad/projects/kutex/frontend/src/components/HistoryPanel.vue))

Компонент [`HistoryPanel.vue`](file:///home/vlad/projects/kutex/frontend/src/components/HistoryPanel.vue) отображает всплывающее окно истории команд при нажатии **`Ctrl+Shift+H`**.

- **Входные свойства (`props`) и события (`emit`):**
  Принимает массив `commands: string[]` (от новых к старым) и генерирует события `run(command: string)`, `clear()` и `close()`.
- **Мгновенный поиск (`filtered`):**
  Вычисляемое свойство `filtered` приводит поисковый запрос `filter.value` к нижнему регистру и фильтрует массив `props.commands` по вхождению подстроки (`c.toLowerCase().includes(needle)`). Наблюдатель `watch(filtered, () => (selected.value = 0))` сбрасывает выделение на первый элемент при каждом изменении текста поиска.
- **Удобное управление с клавиатуры и мыши:**
  - При открытии (`onMounted`) фокус ввода сразу устанавливается в поисковое поле `filterInput.value?.focus()`.
  - Нажатия клавиш в поле поиска перехватываются через `@keydown.prevent="onKeydown"` и обрабатываются словарём `keydownCommands`:
    - `ArrowDown` / `ArrowUp`: функция `move(delta)` циклически сдвигает индекс выбранной команды по модулю `(selected.value + delta + count) % count` (с нижней строки перескакивает на верхнюю и наоборот) и в `nextTick` вызывает `scrollIntoView({ block: 'nearest' })`, чтобы выделенный элемент всегда оставался в видимой области списка.
    - `Enter`: вызывает `run()`, отправляя событие `emit('run', command)` с выбранной командой.
    - `Escape` (а также клик мышью по затемнённому фону `@mousedown.self="emit('close')"`): закрывает модальное окно.
  - Наведение мыши (`@mousemove="selected = i"`) подсвечивает строку, а клик (`@click="run(i)"`) сразу запускает команду.
  - Кнопка **Clear history** в нижней панели вызывает `emit('clear')` и автоматически блокируется (`:disabled="!commands.length"`), если история пуста.

---

### 3.8. Корневой компонент-оркестратор ([`frontend/src/App.vue`](file:///home/vlad/projects/kutex/frontend/src/App.vue))

[`App.vue`](file:///home/vlad/projects/kutex/frontend/src/App.vue) связывает все части фронтенда с Go-методами из `wailsjs/go/terminal/Terminal`:

1. **Глобальный API `window.kutex` (строки 12–20):**
   Экспортирует в глобальный объект `window.kutex` методы `executeCommand`, `runCommand`, `getCwd`, `getHistory` и `clearHistory`, позволяя вызывать Go-бэкенд напрямую из консоли разработчика (`F12`) или внешних скриптов автоматизации.
2. **Подписка на события Go на этапе `setup` (строки 51–59):**
   Подписывается на события Wails **до** того, как дочерний `XTerminal.vue` смонтируется и запустит шелл (благодаря этому самый первый вывод приглашения командной строки никогда не теряется):
   - При получении `terminal:output` декодирует строку Base64 в `Uint8Array` функцией `decodeBase64` (`Uint8Array.from(atob(b64), c => c.charCodeAt(0))`) и передаёт сырые байты в `terminal.value?.write(...)`.
   - При получении `terminal:exit` ставит флаг `exited = true` и печатает в терминале приглушённым шрифтом сообщение: `[process exited with code ${code}, press Enter to restart]`.
3. **Инициализация терминала и перехват `Ctrl+Shift+H` (`onReady` и `onKey`, строки 61–77):**
   Когда `XTerminal` сообщает о готовности (`@ready="onReady"`):
   - Создаётся экземпляр `capture = new CommandCapture(term)`.
   - Регистрируется перехватчик клавиш `term.attachCustomKeyEventHandler(onKey)`. Если нажата комбинация **`Ctrl+Shift+H`** (`e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.code === 'KeyH'`), `onKey` отменяет стандартное действие браузера, вызывает `openHistory()` и возвращает `false`, чтобы `xterm.js` не отправлял эти нажатия в PTY.
   - Вызывается `startShell(term.cols, term.rows)`, который запускает Go-метод `Start(cols, rows)`.
4. **Обработка пользовательского ввода (`onData`, строки 88–102):**
   - **Если шелл работает (`!exited`):**
     1. Сначала передаёт введённые данные в `const command = capture?.input(data)` (важно сделать это **до** отправки `\r` в PTY, пока строка команды и курсор ещё находятся на месте в буфере экрана).
     2. Если `capture.input(data)` вернул строку команды (пользователь нажал `Enter`), асинхронно сохраняет её в Go через `AddHistory(command)`.
     3. Пересылает нажатие клавиши в PTY через `Write(data)`.
   - **Если шелл завершился (`exited === true`):**
     Игнорирует любые клавиши, кроме `Enter` (`\r`). При нажатии `Enter` очищает экран (`terminal.value?.clear()`) и заново запускает оболочку (`startShell`).
5. **Повторный запуск команды из панели истории (`runFromHistory`, строки 125–134):**
   Когда пользователь выбирает команду в `HistoryPanel.vue`:
   - Закрывает модальное окно и возвращает фокус ввода в терминал (`closeHistory()`).
   - Сбрасывает состояние `capture?.reset()`.
   - Параллельно выполняет `Promise.all([Write(CLEAR_LINE), RunCommand(command)])`:
     - Сначала отправляет в PTY последовательность `CLEAR_LINE = '\x05\x15'`: байт `\x05` (`Ctrl+E`) перемещает курсор в самый конец текущей строки ввода, а байт `\x15` (`Ctrl+U`) удаляет весь набранный текст от конца строки до приглашения шелла в `bash`/`zsh`. Это гарантирует, что если пользователь начал что-то печатать, а затем нажал `Ctrl+Shift+H`, выбранная из истории команда не приклеится к недопечатанному тексту, а чисто заменит его.
     - Затем `RunCommand(command)` на стороне Go записывает `command + "\r"` в PTY и перемещает эту команду наверх MRU-истории.

---

## 4. Полный цикл взаимодействия: от нажатия клавиши до экрана

Ниже представлена диаграмма последовательности, иллюстрирующая все 5 ключевых сценариев работы приложения:

```mermaid
sequenceDiagram
    participant U as Пользователь
    participant X as XTerminal.vue (xterm.js)
    participant C as CommandCapture
    participant HP as HistoryPanel.vue
    participant A as App.vue
    participant G as Go (Terminal / Session)
    participant K as Ядро ОС (PTY)
    participant S as Оболочка ($SHELL)

    Note over A,G: 1. Запуск приложения
    X->>A: ready(term)
    A->>C: new CommandCapture(term)
    A->>G: Start(cols, rows)
    G->>K: openpty + setsid + TIOCSWINSZ
    K->>S: запуск $SHELL
    S->>K: вывод приглашения "user@host:~$ "
    K->>G: pump(): f.Read(buf)
    G->>A: событие terminal:output (base64)
    A->>X: write(Uint8Array) → отрисовка промпта

    Note over U,S: 2. Ввод команды "ls" и нажатие Enter
    U->>X: нажатие клавиши "l"
    X->>A: событие data("l")
    A->>C: input("l") → ставит IMarker и запоминает cursorX
    A->>G: Write("l")
    G->>K: запись в master PTY
    K->>S: доставка "l" в stdin
    S->>K: эхо-ответ "l" в stdout
    K->>G: pump(): f.Read(buf)
    G->>A: событие terminal:output (base64)
    A->>X: write → отображение "l" на экране (аналогично для "s")

    U->>X: нажатие Enter ("\r")
    X->>A: событие data("\r")
    A->>C: input("\r") → читает экран от IMarker → возвращает "ls"
    A->>G: AddHistory("ls") (сохранение в MRU-историю Go)
    A->>G: Write("\r")
    G->>K: запись "\r" → шелл выполняет "ls"

    Note over U,S: 3. Повторный запуск команды через Ctrl+Shift+H
    U->>X: нажимает Ctrl+Shift+H
    X->>A: onKey() перехватывает комбинацию
    A->>G: GetHistory()
    G-->>A: ["ls", ...]
    A->>HP: открывает HistoryPanel со списком команд
    U->>HP: выбирает "ls" и нажимает Enter
    HP->>A: событие run("ls")
    A->>G: Write("\x05\x15") (Ctrl+E + Ctrl+U очищает текущую строку)
    A->>G: RunCommand("ls") (пишет "ls\r" в PTY и обновляет MRU-историю)

    Note over U,S: 4. Изменение размера окна
    X->>A: resize {cols, rows} (от ResizeObserver + FitAddon)
    A->>G: Resize(cols, rows)
    G->>K: ioctl TIOCSWINSZ → ядро шлёт SIGWINCH шеллу

    Note over U,S: 5. Завершение сессии шелла (exit / Ctrl+D)
    S-->>K: процесс завершается
    K-->>G: f.Read() возвращает EIO, cmd.Wait() собирает код выхода
    G->>A: событие terminal:exit (exitCode)
    A->>X: "[process exited with code N, press Enter to restart]"
```

> [!NOTE]
> **Почему при вводе паролей (`sudo`, `ssh`) символы не отображаются на экране?**
> Как видно на диаграмме выше, `XTerminal.vue` никогда не рисует нажатые пользователем буквы самостоятельно. Он лишь отправляет коды клавиш в Go (`Write`), который передаёт их в PTY. Буква появляется на экране только тогда, когда драйвер PTY или сама оболочка возвращает её обратно («эхо»). Когда `sudo` или `ssh` запрашивают пароль, они временно отключают флаг `ECHO` в настройках терминала (`termios`), поэтому ядро ОС перестаёт возвращать эхо-символы в `pump()`, и ввод пароля остаётся скрытым автоматически.

---

## 5. Команды сборки, разработки и тестирования

| Команда | Описание |
|---|---|
| `wails dev` | Запускает режим живой разработки: поднимает Vite dev-сервер с мгновенным HMR, компилирует Go-код (с тегом `webkit2_41` из `wails.json`), обновляет привязки в `frontend/wailsjs/` и открывает нативное окно приложения |
| `wails build` | Собирает оптимизированный продакшен-бандл фронтенда (`pnpm run build`), встраивает `frontend/dist` в Go и компилирует единый исполняемый файл в `build/bin/kutex` |
| `wails generate module` | Перегенерирует JS/TS привязки в `frontend/wailsjs/` по экспортируемым методам Go-структур без запуска окна |
| `go test -v ./...` | Запускает все модульные и интеграционные тесты Go (`internal/terminal`, `internal/system`, `internal/logger`) |
| `pnpm --dir frontend lint` | Запускает проверку кода фронтенда через ESLint |
| `pnpm --dir frontend build` | Запускает строгую проверку типов `vue-tsc --noEmit` и сборку `vite build` |
