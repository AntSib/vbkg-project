FROM nginxproxy/nginx-proxy:alpine

COPY conf.d/*.conf /etc/nginx/conf.d/

EXPOSE 80
EXPOSE 443
