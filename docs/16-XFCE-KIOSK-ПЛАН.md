# Xfce kiosk профиль для автомойки

Дата: 2026-03-11

## Цель

Собрать жёсткий рабочий профиль Xfce для оператора автомойки:

- отдельные desktop-ярлыки как слой запуска
- автозапуск через XDG/Xfce autostart
- без сохранённых пользовательских сессий
- без дублей Firefox/monitor/wallboard окон
- с зафиксированными session/panel/desktop настройками
- без экспериментов с Wayland

## Что зафиксировано по Xfce

1. `xfdesktop` штатно поддерживает:
   - `xfdesktop --reload`
   - `xfdesktop --arrange`

   Это надо вызывать после provisioning/установки ярлыков.

2. `xfce4-session` поднимает и autostart, и saved session.

   Практический риск:
   - дубли Firefox
   - дубли мониторинга
   - неожиданный повтор старых окон после reboot/login

   Значит надо:
   - отключить `Automatically save session on logout`
   - очистить saved sessions

3. У Xfce есть `kiosk mode` через `kioskrc`.

   Это подходит для автомойки:
   - оператор не должен менять session/security/logout behavior

4. Через `xfconf` можно блокировать каналы и свойства глобально.

   Это пригодится для:
   - фиксации desktop layout
   - фиксации panel layout
   - запрета случайных изменений пользователем

5. Панель Xfce должна быть минимальной и фиксированной.

   Рабочий вариант:
   - lock panel
   - либо минимальная панель
   - либо скрытая панель, если сценарий wallboard/operator station это допускает

6. Xfce 4.20 Wayland пока не брать в прод.

   Для автомойки оставаться на:
   - X11
   - Xfce

## Что надо внести в Linux-конфигурацию

### 1. Desktop layer

- оставить desktop-ярлыки как отдельный управляемый слой
- после установки ярлыков вызывать:
  - `xfdesktop --reload`
  - `xfdesktop --arrange`

Целевые места:
- `ops/linux/usb/install-desktop-apps.sh`
- `ops/linux/usb/provision-firstboot.sh`

### 2. Session policy

- отключить сохранение сессии Xfce
- удалить старые saved sessions
- не позволять им возвращаться после logout/reboot

Целевые места:
- Xfce session config пользователя `carwash`
- provisioning/autostart слой

### 3. Kiosk policy

- собрать `kioskrc`
- запретить изменение session settings
- запретить поломку logout/security/session behavior

Целевые места:
- системный Xfce/Xfconf слой
- deploy/provision скрипты

### 4. Xfconf locking

- зафиксировать desktop/panel layout
- запретить случайное изменение каналов пользователем

Целевые места:
- `xfconf`
- system-wide Xfce config

### 5. Panel profile

- минимальная панель для оператора
- lock panel
- убрать всё лишнее из рабочего сценария

## Практический план внедрения

1. Проверить текущие saved sessions на живом Linux.
2. Отключить autosave session.
3. Очистить сохранённые сессии.
4. Добавить `xfdesktop --reload` и `xfdesktop --arrange` в post-install/post-provision шаг.
5. Собрать `kioskrc` для оператора.
6. Зафиксировать panel/desktop через `xfconf`.
7. Проверить reboot/login:
   - без дублей Firefox
   - без дублей wallboard
   - с корректными ярлыками

## Отдельная задача

Нужен отдельный жёсткий Xfce kiosk-профиль для:

- `operator station`
- `wallboard station`

Это лучше делать как воспроизводимый ops-слой, а не руками через GUI.

## Официальные источники

- `xfdesktop --reload` и `--arrange`:
  [xfdesktop command-line](https://docs.xfce.org/xfce/xfdesktop/command-line)
- autosave session и Application Autostart:
  [xfce4-session preferences](https://docs.xfce.org/xfce/xfce4-session/4.16/preferences)
- saved sessions и очистка `~/.cache/sessions`:
  [xfce4-session FAQ](https://docs.xfce.org/xfce/xfce4-session/4.12/faq)
- kioskrc для `xfce4-session`:
  [xfce4-session advanced](https://docs.xfce.org/xfce/xfce4-session/4.18/advanced)
- скрытие Save checkbox:
  [xfce4-session logout dialog](https://docs.xfce.org/xfce/xfce4-session/logout)
- locking channel/property через Xfconf:
  [xfconf kiosk mode](https://docs.xfce.org/xfce/xfconf/4.12/start)
- статус Wayland в Xfce 4.20:
  [Xfce docs home](https://docs.xfce.org/)
