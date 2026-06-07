# BHKG Reports Bot

Страница загрузки Excel файла с автоматической отправкой отчёта в Telegram.

## Деплой на Vercel

### 1. Загрузи файлы на GitHub
Создай репозиторий и загрузи все файлы из этой папки.

### 2. Подключи к Vercel
- Зайди на vercel.com
- New Project → импортируй репозиторий
- Deploy

### 3. Добавь переменные окружения
В Vercel → Settings → Environment Variables добавь:

```
TELEGRAM_BOT_TOKEN = 8708555650:AAEaGozEeSuumch1xIN6mgf7_Kw3ESzAyy4
CHAT_ID_ISKENDER = 144731354
CHAT_ID_YUSUF = 5652406161
```

### 4. Активируй бота
Оба пользователя должны написать боту /start:
- t.me/BHKG_reports_bot

### 5. Использование
- Открой страницу
- Перетащи Green_Park.xlsx или White_House.xlsx
- Нажми "Отправить в Telegram"
- Оба получат сообщение автоматически
