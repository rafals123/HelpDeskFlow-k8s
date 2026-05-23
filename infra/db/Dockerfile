FROM postgres:17-alpine3.22

# Replace the vulnerable gosu helper with su-exec while keeping the same
# entrypoint flow and init script support from the official Postgres image.
RUN apk add --no-cache su-exec \
 && sed -i 's/\bgosu\b/su-exec/g' \
   /usr/local/bin/docker-entrypoint.sh \
   /usr/local/bin/docker-ensure-initdb.sh \
   /usr/local/bin/docker-enforce-initdb.sh \
 && rm -f /usr/local/bin/gosu
