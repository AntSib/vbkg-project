# Docker

## Docker-compose
- Добавлен контейнер с acme-companion
- Nginx заменён на nginx-proxy (для работы с acme-companion)
- В контейнере library-events добавлены переменные окружения:
      * ```VIRTUAL_HOST``` - определение домена для express
      * ```LETSENCRYPT_HOST``` - домены для сертификации
      * ```LETSENCRYPT_EMAIL``` - email для сертификации


# Структура

> [!NOTE]
> В отличии от предыдущей внесены следующие изменения в структуру проекта:
> - Файлы, связанные с express server перенесены в vbkg
> - Файлы nginx-proxy перенесены в nginx-proxy
> - Конфигурация nginx-proxy находится в nginx-proxy/conf.d/

## Структура проекта
```
project/
├─ .env.example
├─ docker-compose.yml
├─ vbkg_server/
│  ├─ vbkg.Dockerfile
│  ├─ vbkg-pr-cbs-ru.conf
│  ├─ package.json
│  ├─ package-lock.json
│  ├─ data/
│  │  └─ db.json
│  ├─ public/
│  │  └─ ***
│  └─ server/
│     └─ ***
└─ nginx-proxy/
   ├─ nginx-proxy.Dockerfile
   └─ conf.d/
      └─ nginx.conf
```

## Структура на хосте
```
$HOME/vbkg/
├─ .env
├─ .env.example
├─ docker-compose.yml
├─ vbkg_server/
│  ├─ vbkg.Dockerfile
│  ├─ package.json
│  ├─ package-lock.json
│  ├─ data/
│  │  └─ db.json
│  ├─ public/
│  │  └─ ***
│  └─ server/
│     └─ ***
└─ nginx-proxy/
   ├─ nginx-proxy.Dockerfile
   └─ conf.d/
```


# CI/CD

## Логика развёртывания:
1. Настройка SSH и настройка known hosts
2. Синхронизация файлов с репозиторием
3. Настройка .env
4. Создание бэкапа нового проекта на сервере
5. Остановка существующего контейнера и запуск нового
6. Если развертывание прошло успешно, удаляем старый бэкап
7. При возникновении ошибки, восстановление проекта из старого бэкапа
8. Удаление нового бэкапа
9. Удаление файлов конфигурации express, nginx-proxy и .env
