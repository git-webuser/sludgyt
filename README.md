# sludgyt

Terminal-styled desktop GUI wrapper for `yt-dlp` and `ffmpeg`.

sludgyt помогает скачивать видео и аудио через локально установленный `yt-dlp`, а обработку медиа делегирует локальному `ffmpeg`. Приложение не включает эти бинарники в сборку, поэтому их нужно установить отдельно и указать пути в настройках или дать приложению найти их автоматически.

## Скачать

- Последний релиз sludgyt: https://github.com/git-webuser/sludgyt/releases/latest
- Все релизы sludgyt: https://github.com/git-webuser/sludgyt/releases

После установки откройте настройки и проверьте пути к `yt-dlp` и `ffmpeg`. В настройках также есть проверка обновлений sludgyt через GitHub Releases и кнопка скачивания нового релизного файла для текущей платформы.

## Обязательные проекты

- `yt-dlp`: https://github.com/yt-dlp/yt-dlp
- Релизы `yt-dlp`: https://github.com/yt-dlp/yt-dlp/releases/latest
- `ffmpeg`: https://ffmpeg.org/
- Скачать `ffmpeg`: https://ffmpeg.org/download.html

Без `yt-dlp` приложение не сможет скачивать контент. Без `ffmpeg` недоступны нормальная сборка, конвертация и обработка медиафайлов.

## Запуск из исходников

```bash
npm install
npm start
```

## Сборка

```bash
npm run dist
```

Платформенные команды:

```bash
npm run dist:mac
npm run dist:win
```

Готовые сборки попадают в папку `release/`.

## Обновления

В настройках приложения нажмите `Проверить обновления`. sludgyt сравнит текущую версию из `package.json` с последним релизом в https://github.com/git-webuser/sludgyt/releases/latest и покажет, доступна ли новая версия. Если в релизе есть подходящий файл для вашей платформы, появится кнопка `Скачать обновление`.

Для `yt-dlp` в настройках есть отдельная проверка версии и сравнение с последним релизом https://github.com/yt-dlp/yt-dlp/releases/latest.
