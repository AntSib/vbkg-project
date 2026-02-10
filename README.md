## Docker
- Добавлен контейнер с acme-companion
- Замена nginx на nginx-proxy (для работы с acme-companion)
- В контейнере library-events добавлены переменные окружения:
      * ```VIRTUAL_HOST=${VIRTUAL_HOST}``` - определение домена
      * ```LETSENCRYPT_HOST=${LETSENCRYPT_HOST}``` - домены для сертификации
      * ```LETSENCRYPT_EMAIL=${SERTIFICATE_EMAIL}``` - email для сертификации

## Структура
- Файлы Express перенесены в vbkg
- Файлы nginx-proxy перенесены в nginx-proxy
- Конфигурация nginx-proxy находится в nginx-proxy/conf.d/

```
project/
├─ docker-compose.yml
├─ vbkg/
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
