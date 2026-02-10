## Docker
- Добавлен контейнер с acme-companion
- Замена nginx на nginx-proxy (для работы с acme-companion)
- В контейнере library-events добавлены переменные окружения:
      * ```VIRTUAL_HOST=vbkg.pr-cbs.ru,www.vbkg.pr-cbs.ru``` - определение домена
      * ```LETSENCRYPT_HOST=vbkg.pr-cbs.ru,www.vbkg.pr-cbs.ru``` - домены для сертификации
      * ```LETSENCRYPT_EMAIL=${SERTIFICATE_EMAIL}``` - email для сертификации (требуется добавить в конфигурацию на сервере)

## Структура
- Конфигурация nginx-proxy перенесена в nginx-proxy/conf.d/*

```
project/
├─ docker-compose.yml
├─ package.json
├─ package-lock.json
├─ vbkg-pr-cbs-ru.conf
├─ vbkg.Dockerfile
├─ nginx-proxy/
│  └─ conf.d/ 
│     └─ nginx.conf 
├─ data/
│  └─ db.json
├─ public/
│  └─ ***
└─ server/
    └─ ***
```
