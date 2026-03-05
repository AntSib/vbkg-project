# Используем минималистичный образ nginx
FROM nginx:alpine

# Подготовка каталога: удаление стандартного содержимого
RUN rm -rf /usr/share/nginx/html/*
RUN rm -rf /etc/nginx/conf.d/default.conf

# Make port 80 available to the world outside this container
EXPOSE 80
EXPOSE 443

ENTRYPOINT ["nginx", "-g", "daemon off;"]
