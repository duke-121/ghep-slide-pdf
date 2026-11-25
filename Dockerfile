FROM mcr.microsoft.com/playwright:v1.58.2-noble
WORKDIR /app
RUN npm install --omit=dev --ignore-scripts playwright@1.58.2
COPY converter.mjs index.html slide-pdf.mjs ./
USER pwuser
ENV PORT=3000
EXPOSE 3000
CMD ["node","converter.mjs"]
