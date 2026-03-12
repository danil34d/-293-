# Android Local Client

Минимальная Android-оболочка для локальной сети автомойки.

Текущее назначение:

- открывать `http://192.168.1.36:3000/login` внутри `WebView`
- работать только в локальной сети
- показывать понятный fallback, если сервер недоступен

Сборка:

1. Установить JDK 17.
2. Установить Android SDK Platform / Build Tools / Platform Tools.
3. Сгенерировать Gradle wrapper.
4. Выполнить `assembleDebug`.

APK после сборки:

- `app/build/outputs/apk/debug/app-debug.apk`
